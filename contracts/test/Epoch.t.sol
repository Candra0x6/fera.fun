// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Vm} from "forge-std/Vm.sol";
import {Base} from "./Base.t.sol";
import {IArena} from "../src/IArena.sol";
import {Arena} from "../src/Arena.sol";
import {MonsterCoin} from "../src/MonsterCoin.sol";
import {CombatMath} from "../src/libs/CombatMath.sol";
import {CurveMath} from "../src/libs/CurveMath.sol";

contract EpochTest is Base {
    bytes32 internal constant CLASH_SIG =
        keccak256("ClashResolved(uint64,uint16,uint32,uint8,uint8,uint16,uint16,uint256,uint256,uint256,uint256)");
    bytes32 internal constant BOOSTED_SIG =
        keccak256("Boosted(uint64,uint16,uint32,uint8,uint256,uint256,uint256,uint256,uint16,uint8,uint16,uint16)");
    bytes32 internal constant HUNT_SIG = keccak256("HuntResolved(uint64,uint16,uint8,bool,uint16,uint16,uint8)");
    bytes32 internal constant BYE_SIG = keccak256("ByeGranted(uint64,uint16,uint8)");
    bytes32 internal constant ELIM_SIG = keccak256("CoinEliminated(uint64,uint8,uint256,uint256)");
    bytes32 internal constant SPENT_SIG = keccak256("TreasurySpent(uint64,uint8,uint256,uint256)");
    bytes32 internal constant EPOCH_RESOLVED_SIG = keccak256("EpochResolved(uint64,uint16,uint8)");
    bytes32 internal constant SETTLED_SIG = keccak256("RoundSettled(uint64,uint8,uint256,uint256)");

    function _fullLobby(uint256 n, uint256 seed) internal returns (uint64 id) {
        id = newRound(demoConfig());
        launchMany(id, n, seed);
        startRound(id);
    }

    function _count(Vm.Log[] memory logs, bytes32 sig) internal pure returns (uint256 n) {
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] == sig) ++n;
        }
    }

    function _firstEpochs(uint64 id, uint256 n) internal {
        for (uint256 i = 0; i < n; ++i) {
            playEpoch(id, keccak256(abi.encode("lvl", i)));
        }
    }

    function test_lockEpoch_gating() public {
        uint64 id = newRound(demoConfig());
        vm.expectRevert(Arena.WrongPhase.selector);
        arena.lockEpoch(id);
        launchMany(id, 8, 2 ether);
        startRound(id);
        vm.expectRevert(Arena.EpochTooEarly.selector);
        arena.lockEpoch(id);
        vm.warp(block.timestamp + 20);
        arena.lockEpoch(id);
        vm.expectRevert(Arena.Locked.selector);
        arena.lockEpoch(id);
    }

    function test_lockEpoch_snapshotsFreezesAndPaysSeedFee() public {
        uint64 id = _fullLobby(8, 2 ether);
        uint256 treasuryBefore = arena.getRound(id).treasury;
        vm.warp(block.timestamp + 20);
        vm.recordLogs();
        arena.lockEpoch(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        IArena.RoundView memory r = arena.getRound(id);
        assertTrue(r.locked);
        assertEq(r.epoch, 1);
        assertEq(r.seed, bytes32(0));
        assertEq(r.entropySeq, 1);
        assertEq(r.treasury, treasuryBefore - SEED_FEE);
        assertEq(_count(logs, SPENT_SIG), 1);
        (, IArena.CoinView[] memory coins) = arena.getArenaSnapshot(id);
        for (uint256 i = 0; i < coins.length; ++i) {
            assertEq(coins[i].rMonAtLock, coins[i].rMon);
        }
    }

    function test_onSeed_setsSeedOnlyOnce_resolveNeedsSeed() public {
        uint64 id = _fullLobby(8, 2 ether);
        vm.warp(block.timestamp + 20);
        arena.lockEpoch(id);
        vm.expectRevert(Arena.SeedNotReady.selector);
        arena.resolveEpoch(id, 6);
        seeds.deliver(1, bytes32(uint256(5)));
        assertEq(arena.getRound(id).seed, bytes32(uint256(5)));
        arena.resolveEpoch(id, 6);
        assertEq(arena.getRound(id).seed, bytes32(uint256(5)));
        assertFalse(arena.getRound(id).locked);
    }

    function test_levelingEpochsRunHuntsOnly_thenKnockout() public {
        uint64 id = _fullLobby(30, 3 ether);
        for (uint256 e = 1; e <= 3; ++e) {
            lockAndSeed(id, keccak256(abi.encode("l", e)));
            vm.recordLogs();
            resolve(id);
            Vm.Log[] memory logs = vm.getRecordedLogs();
            assertEq(_count(logs, CLASH_SIG), 0);
            assertEq(_count(logs, HUNT_SIG), 30);
            IArena.RoundView memory r = arena.getRound(id);
            assertEq(r.aliveCount, 30);
            assertEq(r.epoch, e);
            assertEq(uint8(r.phase), e == 3 ? uint8(IArena.Phase.Knockout) : uint8(IArena.Phase.Leveling));
        }
        lockAndSeed(id, keccak256("k1"));
        vm.recordLogs();
        resolve(id);
        Vm.Log[] memory klogs = vm.getRecordedLogs();
        assertEq(_count(klogs, CLASH_SIG), 6);
        assertEq(_count(klogs, ELIM_SIG), 6);
        assertEq(_count(klogs, HUNT_SIG), 24);
        assertEq(_count(klogs, BYE_SIG), 0);
        assertEq(arena.getRound(id).aliveCount, 24);
    }

    function test_oddAliveCountGrantsBye() public {
        uint64 id = _fullLobby(9, 3 ether);
        _firstEpochs(id, 3);
        lockAndSeed(id, keccak256("odd"));
        vm.recordLogs();
        resolve(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(_count(logs, CLASH_SIG), 4);
        assertEq(_count(logs, BYE_SIG), 1);
        assertEq(arena.getRound(id).aliveCount, 5);
    }

    function test_xpAndLevelFollowEvents() public {
        uint64 id = _fullLobby(8, 3 ether);
        uint256 hunts;
        uint16[8] memory xp;
        for (uint256 e = 0; e < 3; ++e) {
            lockAndSeed(id, keccak256(abi.encode("x", e)));
            vm.recordLogs();
            resolve(id);
            Vm.Log[] memory logs = vm.getRecordedLogs();
            for (uint256 i = 0; i < logs.length; ++i) {
                if (logs[i].topics[0] != HUNT_SIG) continue;
                uint8 coinId = uint8(uint256(logs[i].topics[2]));
                (, bool success, uint16 gained, uint16 total, uint8 level) =
                    abi.decode(logs[i].data, (uint16, bool, uint16, uint16, uint8));
                assertEq(gained, success ? 10 : 0);
                xp[coinId] += gained;
                assertEq(total, xp[coinId]);
                assertEq(level, CombatMath.levelFromXp(total));
                ++hunts;
            }
        }
        assertEq(hunts, 24);
        (, IArena.CoinView[] memory coins) = arena.getArenaSnapshot(id);
        for (uint256 i = 0; i < 8; ++i) {
            assertEq(coins[i].xp, xp[i]);
        }
    }

    function testFuzz_conservationAndBoostIdentity(bytes32 seed) public {
        vm.assume(seed != bytes32(0));
        uint64 id = _fullLobby(30, 4 ether);
        _firstEpochs(id, 3);
        (, IArena.CoinView[] memory pre) = arena.getArenaSnapshot(id);
        lockAndSeed(id, seed);
        vm.recordLogs();
        resolve(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 clashes;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] == CLASH_SIG) {
                (,, uint8 winner, uint8 loser,,, uint256 boost, uint256 cons, uint256 toPot, uint256 toTre) = abi.decode(
                    logs[i].data, (uint16, uint32, uint8, uint8, uint16, uint16, uint256, uint256, uint256, uint256)
                );
                assertEq(boost + cons + toPot + toTre, pre[loser].rMon);
                assertTrue(winner != loser);
                ++clashes;
            } else if (logs[i].topics[0] == BOOSTED_SIG) {
                uint8 coinId = uint8(uint256(logs[i].topics[2]));
                (,,, uint256 rMon, uint256 vMon, uint256 vTok,,,,) = abi.decode(
                    logs[i].data, (uint16, uint32, uint256, uint256, uint256, uint256, uint16, uint8, uint16, uint16)
                );
                uint256 k = uint256(pre[coinId].vMon) * pre[coinId].vTok;
                assertEq(vTok, CurveMath.ceilDiv(k, vMon));
                assertEq(rMon, vMon - 20 ether);
            }
        }
        assertEq(clashes, 6);
        assertGe(address(arena).balance, arena.allLiabilities());
    }

    function _runWithCap(uint64 id, bytes32 seed, uint8 cap) internal returns (bytes memory state, bytes32 clashHash) {
        lockAndSeed(id, seed);
        vm.recordLogs();
        uint8 guard;
        while (arena.getRound(id).locked) {
            arena.resolveEpoch(id, cap);
            require(++guard < 40);
        }
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] == CLASH_SIG) clashHash = keccak256(abi.encode(clashHash, logs[i].data));
        }
        (IArena.RoundView memory rv, IArena.CoinView[] memory cvs) = arena.getArenaSnapshot(id);
        state = abi.encode(rv, cvs);
    }

    function testFuzz_batchedResolveMatchesSingleCall(bytes32 seed, uint8 capRaw) public {
        vm.assume(seed != bytes32(0));
        uint8 cap = uint8(bound(capRaw, 1, 6));
        uint64 id = _fullLobby(30, 4 ether);
        _firstEpochs(id, 3);
        uint256 snap = vm.snapshotState();
        (bytes memory sA, bytes32 hA) = _runWithCap(id, seed, 255);
        vm.revertToState(snap);
        (bytes memory sB, bytes32 hB) = _runWithCap(id, seed, cap);
        assertEq(hA, hB);
        assertEq(keccak256(sA), keccak256(sB));
    }

    function test_batchedResolveMatchesWithCaps1And6() public {
        uint64 id = _fullLobby(30, 4 ether);
        _firstEpochs(id, 3);
        uint256 snap = vm.snapshotState();
        (bytes memory s1, bytes32 h1) = _runWithCap(id, keccak256("b"), 1);
        vm.revertToState(snap);
        (bytes memory s6, bytes32 h6) = _runWithCap(id, keccak256("b"), 6);
        assertEq(h1, h6);
        assertEq(keccak256(s1), keccak256(s6));
    }

    function test_T4_pairingUnknowableBeforeResolve() public {
        uint64 id = _fullLobby(30, 4 ether);
        _firstEpochs(id, 3);
        vm.warp(block.timestamp + 20);
        arena.lockEpoch(id);
        assertEq(arena.getRound(id).seed, bytes32(0));
        vm.expectRevert(Arena.SeedNotReady.selector);
        arena.resolveEpoch(id, 6);
        uint32 mask = type(uint32).max >> 2;
        uint8[] memory a = CombatMath.pairing(keccak256("s1"), mask);
        uint8[] memory b = CombatMath.pairing(keccak256("s2"), mask);
        assertEq(a.length, 30);
        assertTrue(keccak256(abi.encodePacked(a)) != keccak256(abi.encodePacked(b)));
        seeds.deliver(arena.getRound(id).entropySeq, keccak256("s1"));
        vm.recordLogs();
        arena.resolveEpoch(id, 6);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 k;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] != CLASH_SIG) continue;
            (,, uint8 winner, uint8 loser,,,,,,) = abi.decode(
                logs[i].data, (uint16, uint32, uint8, uint8, uint16, uint16, uint256, uint256, uint256, uint256)
            );
            uint8 x = a[2 * k];
            uint8 y = a[2 * k + 1];
            assertTrue((winner == x && loser == y) || (winner == y && loser == x));
            ++k;
        }
        assertEq(k, 6);
    }

    function test_T4_noTradeWhileLocked() public {
        uint64 id = _fullLobby(8, 3 ether);
        vm.warp(block.timestamp + 20);
        arena.lockEpoch(id);
        vm.deal(alice, 100 ether);
        vm.startPrank(alice);
        vm.expectRevert(Arena.Locked.selector);
        arena.buy{value: 1 ether}(id, 0, 1, uint64(block.timestamp + 100));
        vm.expectRevert(Arena.Locked.selector);
        arena.sell(id, 0, 1, 1, uint64(block.timestamp + 100));
        vm.expectRevert(Arena.WrongPhase.selector);
        arena.launchCoin{value: 4 ether}(id, "Late", "LATE", 0, 0);
        vm.stopPrank();
        seeds.deliver(1, keccak256("t4"));
        vm.prank(alice);
        vm.expectRevert(Arena.Locked.selector);
        arena.buy{value: 1 ether}(id, 0, 1, uint64(block.timestamp + 100));
        resolve(id);
        vm.prank(alice);
        arena.buy{value: 1 ether}(id, 0, 1, uint64(block.timestamp + 100));
    }

    function test_T15_domainTags() public pure {
        bytes32 seed = keccak256("seed");
        for (uint256 i = 0; i < 40; ++i) {
            bytes32 p = keccak256(abi.encode(seed, CombatMath.TAG_PAIR, i));
            bytes32 c = keccak256(abi.encode(seed, CombatMath.TAG_CLASH, i));
            bytes32 h = keccak256(abi.encode(seed, CombatMath.TAG_HUNT, i));
            assertTrue(p != c && c != h && p != h);
        }
        uint256 same;
        for (uint256 i = 0; i < 200; ++i) {
            if (CombatMath.clashRoll(seed, i) % 100 == CombatMath.huntRoll(seed, i)) ++same;
        }
        assertLt(same, 20);
    }

    function test_lateSeedThenCancelEpoch() public {
        uint64 id = _fullLobby(8, 3 ether);
        vm.warp(block.timestamp + 20);
        arena.lockEpoch(id);
        vm.expectRevert(Arena.TimeoutNotElapsed.selector);
        arena.cancelEpoch(id);
        vm.warp(block.timestamp + 60);
        vm.expectEmit(true, false, false, true);
        emit IArena.EpochCancelled(id, 1);
        arena.cancelEpoch(id);
        IArena.RoundView memory r = arena.getRound(id);
        assertFalse(r.locked);
        assertEq(r.epoch, 0);
        assertEq(r.cancelStreak, 1);
        seeds.deliver(1, keccak256("late"));
        assertEq(arena.getRound(id).seed, bytes32(0));
        vm.warp(block.timestamp + 20);
        arena.lockEpoch(id);
        assertEq(arena.getRound(id).epoch, 1);
        assertEq(arena.getRound(id).entropySeq, 2);
        seeds.deliver(2, keccak256("ok"));
        vm.warp(block.timestamp + 100);
        vm.expectRevert(Arena.SeedArrived.selector);
        arena.cancelEpoch(id);
        resolve(id);
        assertEq(arena.getRound(id).cancelStreak, 0);
    }

    function test_cancelRequiresLock() public {
        uint64 id = _fullLobby(8, 3 ether);
        vm.expectRevert(Arena.NotLocked.selector);
        arena.cancelEpoch(id);
    }

    function test_threeCancelsThenAbort() public {
        uint64 id = _fullLobby(8, 3 ether);
        vm.expectRevert(Arena.AbortNotOpen.selector);
        arena.abortRound(id);
        address buyer = makeAddr("buyer");
        vm.deal(buyer, 50 ether);
        vm.prank(buyer);
        uint256 got = arena.buy{value: 10 ether}(id, 2, 1, uint64(block.timestamp + 10_000));
        for (uint256 i = 0; i < 3; ++i) {
            vm.warp(block.timestamp + 20);
            arena.lockEpoch(id);
            vm.warp(block.timestamp + 60);
            arena.cancelEpoch(id);
        }
        vm.warp(block.timestamp + 20);
        arena.lockEpoch(id);
        vm.warp(block.timestamp + 60);
        vm.expectRevert(Arena.CancelCapReached.selector);
        arena.cancelEpoch(id);
        uint256 balBefore = address(arena).balance;
        uint256 treasuryBefore = arena.getRound(id).treasury;
        vm.recordLogs();
        arena.abortRound(id);
        IArena.RoundView memory r = arena.getRound(id);
        assertEq(uint8(r.phase), uint8(IArena.Phase.Aborted));
        assertEq(r.prizePot, 0);
        assertFalse(r.locked);
        assertGe(r.treasury, treasuryBefore);
        assertGe(address(arena).balance, arena.allLiabilities());
        assertEq(balBefore, address(arena).balance);
        uint256 pending = arena.pendingConsolation(id, 2, buyer);
        assertGt(pending, 0);
        vm.prank(buyer);
        uint256 paid = arena.claimRefund(id, 2, got);
        assertEq(paid, pending);
        assertGt(paid, 8 ether);
        address creator = creatorOf(2);
        vm.prank(creator);
        uint256 seedPaid = arena.claimSeed(id, 2);
        assertGt(seedPaid, 0);
        for (uint8 c = 0; c < 8; ++c) {
            assertEq(uint8(arena.getArenaSnapshotCoin(id, c).status), uint8(IArena.Status.Refunded));
        }
        assertGe(address(arena).balance, arena.allLiabilities());
    }

    function test_abortByMaxRoundSeconds() public {
        uint64 id = _fullLobby(8, 3 ether);
        vm.warp(block.timestamp + 3600);
        vm.recordLogs();
        arena.abortRound(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs[logs.length - 1].topics[0], keccak256("RoundAborted(uint64,uint8)"));
        assertEq(abi.decode(logs[logs.length - 1].data, (uint8)), 3);
    }

    function test_T6_resolveWithZeroSupplyCoinDoesNotRevert() public {
        uint64 id = _fullLobby(8, 3 ether);
        _firstEpochs(id, 3);
        for (uint8 c = 0; c < 8; ++c) {
            vm.mockCall(
                arena.coinOf(id, c).token, abi.encodeWithSelector(bytes4(keccak256("totalSupply()"))), abi.encode(0)
            );
        }
        lockAndSeed(id, keccak256("zero"));
        resolve(id);
        assertEq(arena.getRound(id).aliveCount, 4);
        IArena.RoundView memory r = arena.getRound(id);
        assertEq(r.cancelStreak, 0);
        assertFalse(r.locked);
    }

    function test_T2_ghostCoinCannotUnlockSeed() public {
        uint64 id = _fullLobby(8, 2 ether);
        address creator = creatorOf(0);
        MonsterCoin token = MonsterCoin(arena.coinOf(id, 0).token);
        assertEq(token.balanceOf(creator), 0);
        assertEq(token.balanceOf(address(arena)), arena.coinOf(id, 0).seedTokens);
        assertGt(token.totalSupply(), 0);
        vm.startPrank(creator);
        vm.expectRevert(Arena.NotClaimable.selector);
        arena.claimSeed(id, 0);
        vm.expectRevert();
        arena.sell(id, 0, 1, 1, uint64(block.timestamp + 100));
        vm.stopPrank();
        vm.prank(creator);
        vm.expectRevert(MonsterCoin.NotArena.selector);
        token.burn(address(arena), 1);
    }

    function test_claimSeed_afterEliminationPaysAtConsolationRate() public {
        uint64 id = _fullLobby(8, 2 ether);
        _firstEpochs(id, 3);
        lockAndSeed(id, keccak256("elim"));
        vm.recordLogs();
        resolve(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint8 loser;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] == ELIM_SIG) loser = uint8(uint256(logs[i].topics[2]));
        }
        IArena.CoinView memory cv = arena.getArenaSnapshotCoin(id, loser);
        assertEq(uint8(cv.status), uint8(IArena.Status.Eliminated));
        assertEq(cv.rMon, 0);
        address creator = creatorOf(loser);
        uint256 seedTokens = arena.coinOf(id, loser).seedTokens;
        uint256 expected = seedTokens * cv.consolationPool / cv.consolationSupply;
        vm.recordLogs();
        vm.prank(creator);
        uint256 paid = arena.claimSeed(id, loser);
        assertEq(paid, expected);
        Vm.Log[] memory l2 = vm.getRecordedLogs();
        (uint256 tokens, uint256 monPaid) = abi.decode(l2[l2.length - 1].data, (uint256, uint256));
        assertEq(tokens, seedTokens);
        assertEq(monPaid, expected);
        vm.prank(creator);
        vm.expectRevert(Arena.SeedAlreadyClaimed.selector);
        arena.claimSeed(id, loser);
        vm.prank(alice);
        vm.expectRevert(Arena.NotCreator.selector);
        arena.claimSeed(id, loser);
    }

    function test_keeperBountyPaidAtResolveAndCapped() public {
        uint64 id = _fullLobby(8, 2 ether);
        lockAndSeed(id, keccak256("b"));
        uint256 before = keeper.balance;
        uint256 treasuryBefore = arena.getRound(id).treasury;
        vm.recordLogs();
        resolve(id);
        assertEq(keeper.balance - before, 0.2 ether);
        assertEq(arena.getRound(id).treasury, treasuryBefore + 0 - 0.2 ether + _feesToTreasury(vm.getRecordedLogs()));
    }

    function _feesToTreasury(Vm.Log[] memory logs) internal pure returns (uint256 t) {
        bytes32 sig = keccak256("FeesSwept(uint64,uint16,uint256,uint256,uint256,uint256)");
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] == sig) {
                (,, t,,) = abi.decode(logs[i].data, (uint16, uint256, uint256, uint256, uint256));
            }
        }
    }

    function test_rejectingKeeperDoesNotRevertResolve() public {
        uint64 id = _fullLobby(8, 2 ether);
        lockAndSeed(id, keccak256("b"));
        uint256 treasuryBefore = arena.getRound(id).treasury;
        arena.resolveEpoch(id, 6);
        assertEq(arena.getRound(id).treasury, treasuryBefore);
        assertFalse(arena.getRound(id).locked);
    }

    function test_fullRoundWithMockSeed() public {
        uint64 id = _fullLobby(30, 5 ether);
        address[3] memory buyers = [makeAddr("b0"), makeAddr("b1"), makeAddr("b2")];
        uint256[3] memory bought;
        uint8[3] memory target = [uint8(3), 11, 29];
        for (uint256 i = 0; i < 3; ++i) {
            vm.deal(buyers[i], 100 ether);
            vm.prank(buyers[i]);
            bought[i] = arena.buy{value: 20 ether}(id, target[i], 1, uint64(block.timestamp + 10_000));
        }
        uint256 epochs = playToEnd(id, 77);
        assertEq(epochs, 10);
        IArena.RoundView memory r = arena.getRound(id);
        assertEq(uint8(r.phase), uint8(IArena.Phase.Settled));
        assertEq(r.aliveCount, 1);
        assertEq(r.clashesPlayed, 29);
        assertEq(r.prizePot, 0);
        assertGt(r.redeemPool, 0);
        uint8 win = r.winnerCoinId;
        assertEq(uint8(arena.getArenaSnapshotCoin(id, win).status), uint8(IArena.Status.Champion));
        uint256 owed;
        for (uint256 i = 0; i < 3; ++i) {
            MonsterCoin t = MonsterCoin(arena.coinOf(id, target[i]).token);
            if (target[i] == win) {
                uint256 pend = arena.pendingRedeem(id, buyers[i]);
                assertEq(pend, bought[i] * r.redeemPool / r.redeemSupply);
                vm.prank(buyers[i]);
                uint256 paid = arena.redeem(id, bought[i]);
                assertEq(paid, pend);
                owed += paid;
                assertEq(t.balanceOf(buyers[i]), 0);
            } else {
                uint256 pend = arena.pendingConsolation(id, target[i], buyers[i]);
                vm.prank(buyers[i]);
                assertEq(arena.claimConsolation(id, target[i], bought[i]), pend);
            }
        }
        for (uint8 c = 0; c < 30; ++c) {
            address creator = creatorOf(c);
            vm.prank(creator);
            arena.claimSeed(id, c);
        }
        assertGe(address(arena).balance, arena.allLiabilities());
        vm.prank(owner);
        uint64 next = arena.createRound(demoConfig());
        assertEq(next, 2);
        assertGt(arena.getRound(2).treasury, FLOOR);
        launchMany(next, 8, 2 ether);
        startRound(next);
        assertEq(uint8(arena.getRound(next).phase), uint8(IArena.Phase.Leveling));
        assertGe(address(arena).balance, arena.allLiabilities());
    }

    function test_forceSentMonDoesNotBreakAccounting() public {
        uint64 id = _fullLobby(8, 3 ether);
        uint256 liabs = arena.allLiabilities();
        vm.deal(address(arena), address(arena).balance + 123 ether);
        assertEq(arena.allLiabilities(), liabs);
        playToEnd(id, 5);
        assertGe(address(arena).balance, arena.allLiabilities());
        uint8 win = arena.getRound(id).winnerCoinId;
        address creator = creatorOf(win);
        uint256 pend =
            uint256(arena.coinOf(id, win).seedTokens) * arena.getRound(id).redeemPool / arena.getRound(id).redeemSupply;
        vm.prank(creator);
        assertEq(arena.claimSeed(id, win), pend);
    }

    function test_spreadSurvivorsMode() public {
        IArena.RoundConfig memory cfg = demoConfig();
        cfg.consolationMode = 1;
        uint64 id = newRound(cfg);
        launchMany(id, 12, 3 ether);
        startRound(id);
        _firstEpochs(id, 3);
        (, IArena.CoinView[] memory pre) = arena.getArenaSnapshot(id);
        uint256 preSum;
        for (uint256 i = 0; i < pre.length; ++i) {
            preSum += pre[i].rMon;
        }
        lockAndSeed(id, keccak256("spread"));
        vm.recordLogs();
        resolve(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 boosts;
        uint256 cons;
        uint256 pot;
        uint256 tre;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] == BOOSTED_SIG) ++boosts;
            if (logs[i].topics[0] == CLASH_SIG) {
                (,,,,,, uint256 b, uint256 c, uint256 p, uint256 t) = abi.decode(
                    logs[i].data, (uint16, uint32, uint8, uint8, uint16, uint16, uint256, uint256, uint256, uint256)
                );
                cons += c;
                pot += p;
                tre += t;
                assertGe(b, 0);
            }
        }
        assertGt(boosts, 6);
        assertGt(cons, 0);
        (, IArena.CoinView[] memory post) = arena.getArenaSnapshot(id);
        uint256 postSum;
        for (uint256 i = 0; i < post.length; ++i) {
            postSum += post[i].rMon;
            if (post[i].status == IArena.Status.Alive) assertEq(post[i].rMon, post[i].vMon - 20 ether);
            if (post[i].status == IArena.Status.Eliminated) assertEq(post[i].consolationPool, 0);
        }
        assertEq(postSum + pot + tre, preSum);
        assertGe(address(arena).balance, arena.allLiabilities());
    }
}
