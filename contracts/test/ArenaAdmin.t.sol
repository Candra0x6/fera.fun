// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Base, ArenaHarness} from "./Base.t.sol";
import {IArena} from "../src/IArena.sol";
import {Arena} from "../src/Arena.sol";
import {MockSeedSource} from "../src/seed/MockSeedSource.sol";

contract ArenaAdminTest is Base {
    function test_enumOrderMatchesSpec() public pure {
        assertEq(uint8(IArena.Phase.None), 0);
        assertEq(uint8(IArena.Phase.Lobby), 1);
        assertEq(uint8(IArena.Phase.Leveling), 2);
        assertEq(uint8(IArena.Phase.Knockout), 3);
        assertEq(uint8(IArena.Phase.Settled), 4);
        assertEq(uint8(IArena.Phase.Aborted), 5);
        assertEq(uint8(IArena.Status.None), 0);
        assertEq(uint8(IArena.Status.Alive), 1);
        assertEq(uint8(IArena.Status.Eliminated), 2);
        assertEq(uint8(IArena.Status.Champion), 3);
        assertEq(uint8(IArena.Status.Refunded), 4);
    }

    function test_createRound_storesConfigAndEmits() public {
        IArena.RoundConfig memory c = demoConfig();
        vm.warp(1_000_000);
        vm.expectEmit(true, false, false, true);
        emit IArena.RoundCreated(1, c);
        vm.prank(owner);
        uint64 id = arena.createRound(c);
        assertEq(id, 1);
        assertEq(arena.currentRoundId(), 1);
        IArena.RoundView memory r = arena.getRound(1);
        assertEq(uint8(r.phase), uint8(IArena.Phase.Lobby));
        assertEq(r.createdAt, 1_000_000);
        assertFalse(r.locked);
        assertEq(abi.encode(arena.getConfig(1)), abi.encode(c));
        (IArena.RoundView memory snap, IArena.CoinView[] memory coins) = arena.getArenaSnapshot(1);
        assertEq(abi.encode(snap), abi.encode(r));
        assertEq(coins.length, 0);
    }

    function test_createRound_onlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(Arena.NotOwner.selector);
        arena.createRound(demoConfig());
    }

    function test_createRound_rejectsSecondRoundWhileInProgress() public {
        vm.startPrank(owner);
        arena.createRound(demoConfig());
        vm.expectRevert(Arena.RoundInProgress.selector);
        arena.createRound(demoConfig());
        vm.stopPrank();
    }

    function test_createRound_allowedAfterSettledAndAborted() public {
        vm.prank(owner);
        arena.createRound(demoConfig());
        arena.setPhaseForTest(1, IArena.Phase.Settled);
        vm.prank(owner);
        assertEq(arena.createRound(demoConfig()), 2);
        arena.setPhaseForTest(2, IArena.Phase.Aborted);
        vm.prank(owner);
        assertEq(arena.createRound(demoConfig()), 3);
    }

    function test_createRound_badSplit() public {
        IArena.RoundConfig memory c = demoConfig();
        c.treasuryBps = 501;
        vm.prank(owner);
        vm.expectRevert(Arena.BadSplit.selector);
        arena.createRound(c);
    }

    function test_createRound_badCoinLimits() public {
        IArena.RoundConfig memory c = demoConfig();
        c.maxCoins = 33;
        vm.startPrank(owner);
        vm.expectRevert(Arena.BadCoinLimits.selector);
        arena.createRound(c);
        c = demoConfig();
        c.minCoins = 1;
        vm.expectRevert(Arena.BadCoinLimits.selector);
        arena.createRound(c);
        c = demoConfig();
        c.clashesPerEpoch = 16;
        vm.expectRevert(Arena.BadCoinLimits.selector);
        arena.createRound(c);
        vm.stopPrank();
    }

    function test_createRound_otherValidation() public {
        IArena.RoundConfig memory c = demoConfig();
        c.epochSeconds = 0;
        vm.startPrank(owner);
        vm.expectRevert(Arena.BadTiming.selector);
        arena.createRound(c);
        c = demoConfig();
        c.minSeed = 51 ether;
        vm.expectRevert(Arena.BadSeedBounds.selector);
        arena.createRound(c);
        c = demoConfig();
        c.tradeFeeBps = 10_000;
        vm.expectRevert(Arena.BadFee.selector);
        arena.createRound(c);
        c = demoConfig();
        c.winProbMaxBps = 10_000;
        vm.expectRevert(Arena.BadCombatParams.selector);
        arena.createRound(c);
        c = demoConfig();
        c.vTok0 = 0;
        vm.expectRevert(Arena.BadCurveParams.selector);
        arena.createRound(c);
        vm.stopPrank();
    }

    function test_fundTreasury() public {
        vm.prank(owner);
        arena.createRound(demoConfig());
        vm.deal(alice, 10 ether);
        vm.expectEmit(true, true, false, true);
        emit IArena.TreasuryFunded(1, alice, 3 ether);
        vm.prank(alice);
        arena.fundTreasury{value: 3 ether}(1);
        assertEq(arena.getRound(1).treasury, 3 ether);
        assertEq(address(arena).balance, 3 ether);
    }

    function test_fundTreasury_unknownAndClosedRounds() public {
        vm.deal(alice, 10 ether);
        vm.prank(alice);
        vm.expectRevert(Arena.UnknownRound.selector);
        arena.fundTreasury{value: 1 ether}(1);
        vm.prank(owner);
        arena.createRound(demoConfig());
        arena.setPhaseForTest(1, IArena.Phase.Aborted);
        vm.prank(alice);
        vm.expectRevert(Arena.RoundNotFundable.selector);
        arena.fundTreasury{value: 1 ether}(1);
    }

    function test_plainTransferRejected() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok,) = address(arena).call{value: 1 ether}("");
        assertFalse(ok);
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(Arena.ZeroAddress.selector);
        new Arena(address(0), address(coinImpl), 0);
        vm.expectRevert(Arena.ZeroAddress.selector);
        new Arena(owner, address(0), 0);
    }

    function test_setSeedSource() public {
        MockSeedSource src = new MockSeedSource(address(arena), 1);
        vm.prank(alice);
        vm.expectRevert(Arena.NotOwner.selector);
        arena.setSeedSource(address(src));
        vm.startPrank(owner);
        vm.expectRevert(Arena.ZeroAddress.selector);
        arena.setSeedSource(address(0));
        arena.setSeedSource(address(src));
        assertEq(arena.seedSource(), address(src));
        arena.createRound(demoConfig());
        vm.expectRevert(Arena.RoundInProgress.selector);
        arena.setSeedSource(address(src));
        vm.stopPrank();
    }

    function test_onSeed_onlyConfiguredSource() public {
        MockSeedSource src = new MockSeedSource(address(arena), 1);
        vm.prank(owner);
        arena.setSeedSource(address(src));
        vm.prank(alice);
        vm.expectRevert(Arena.NotSeedSource.selector);
        arena.onSeed(1, bytes32(uint256(7)));
    }

    function test_onSeed_storesOnceAndEmits() public {
        MockSeedSource src = new MockSeedSource(address(arena), 1);
        vm.startPrank(owner);
        arena.setSeedSource(address(src));
        arena.createRound(demoConfig());
        vm.stopPrank();
        arena.lockForTest(1, 1);
        vm.expectEmit(true, false, false, true);
        emit IArena.SeedReady(1, 1, bytes32(uint256(99)));
        vm.prank(address(src));
        arena.onSeed(1, bytes32(uint256(99)));
        assertEq(arena.getRound(1).seed, bytes32(uint256(99)));
        vm.prank(address(src));
        arena.onSeed(1, bytes32(uint256(100)));
        assertEq(arena.getRound(1).seed, bytes32(uint256(99)));
    }

    function test_onSeed_unknownIdIsIgnored() public {
        MockSeedSource src = new MockSeedSource(address(arena), 1);
        vm.prank(owner);
        arena.setSeedSource(address(src));
        vm.prank(address(src));
        arena.onSeed(42, bytes32(uint256(1)));
        assertEq(arena.getRound(1).seed, bytes32(0));
    }

    function test_pendingViewsAreZero() public view {
        assertEq(arena.pendingConsolation(1, 0, alice), 0);
        assertEq(arena.pendingRedeem(1, alice), 0);
    }

    function test_poolFactorMaxHoldsPresetValue() public {
        vm.prank(owner);
        arena.createRound(demoConfig());
        assertEq(arena.getConfig(1).poolFactorMaxBps, 100_000);
    }

    function test_reserveFloorIsConstructorConfig() public {
        assertEq(arena.reserveFloor(), 10 ether);
        Arena noFloor = new Arena(owner, address(coinImpl), 0);
        assertEq(noFloor.reserveFloor(), 0);
    }

    function test_pay_neverDrainsBelowFloor() public {
        vm.deal(address(arena), 15 ether);
        arena.payForTest(alice, 5 ether);
        assertEq(alice.balance, 5 ether);
        assertEq(address(arena).balance, 10 ether);
        vm.expectRevert(Arena.ReserveFloorBreached.selector);
        arena.payForTest(alice, 1);
        assertEq(address(arena).balance, 10 ether);
    }

    function test_pay_floorZeroAllowsFullDrain() public {
        ArenaHarness noFloor = new ArenaHarness(owner, address(coinImpl), 0);
        vm.deal(address(noFloor), 3 ether);
        noFloor.payForTest(alice, 3 ether);
        assertEq(address(noFloor).balance, 0);
    }

    function test_pay_revertsWhenReceiverRejects() public {
        vm.deal(address(arena), 20 ether);
        vm.expectRevert(Arena.PayFailed.selector);
        arena.payForTest(address(this), 1 ether);
    }

    function test_pay_forceSentMonCountsTowardFloorOnly() public {
        vm.deal(address(arena), 9 ether);
        vm.expectRevert(Arena.ReserveFloorBreached.selector);
        arena.payForTest(alice, 1);
        vm.deal(address(arena), 10 ether + 7);
        arena.payForTest(alice, 7);
        assertEq(address(arena).balance, 10 ether);
    }

    function test_abortRound_lobbyUnderfilledAfterDeadline() public {
        vm.warp(1000);
        uint64 id = newRound(demoConfig());
        launchMany(id, 3, 2 ether);
        vm.warp(1000 + 119);
        vm.expectRevert(Arena.LobbyStillOpen.selector);
        arena.abortRound(id);
        vm.warp(1000 + 120);
        vm.expectEmit(true, false, false, true);
        emit IArena.RoundAborted(id, 1);
        vm.prank(alice);
        arena.abortRound(id);
        assertEq(uint8(arena.getRound(id).phase), uint8(IArena.Phase.Aborted));
        vm.expectRevert(Arena.WrongPhase.selector);
        arena.abortRound(id);
        vm.prank(owner);
        assertEq(arena.createRound(demoConfig()), 2);
        assertEq(arena.getRound(2).treasury, FLOOR);
        assertEq(arena.getRound(1).treasury, 3 ether);
    }

    function test_abortRound_lobbyWithEnoughCoinsCannotBeAborted() public {
        vm.prank(owner);
        arena.createRound(demoConfig());
        arena.setCoinCountForTest(1, 8);
        vm.warp(block.timestamp + 10_000);
        vm.expectRevert(Arena.LobbyFilled.selector);
        arena.abortRound(1);
    }

    function test_abortRound_unknownRound() public {
        vm.expectRevert(Arena.UnknownRound.selector);
        arena.abortRound(1);
    }
}
