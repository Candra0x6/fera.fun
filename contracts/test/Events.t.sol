// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Vm} from "forge-std/Vm.sol";
import {Base, ArenaHarness} from "./Base.t.sol";
import {IArena} from "../src/IArena.sol";

contract EventsTest is Base {
    function _only() private view returns (Vm.Log memory log) {
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(logs.length, 1);
        log = logs[0];
        assertEq(log.emitter, address(arena));
    }

    function test_coinLaunchedCarriesPostState() public {
        ArenaHarness.LaunchArgs memory a = ArenaHarness.LaunchArgs({
            token: makeAddr("token"),
            creator: alice,
            name: "Fire Drake",
            ticker: "DRAKE",
            monsterType: 2,
            skinId: 3,
            seedMon: 5 ether,
            vMon: 25 ether,
            vTok: 800_000_000 ether,
            supply: 200_000_000 ether
        });
        vm.recordLogs();
        arena.emitCoinLaunchedForTest(1, 7, a);
        Vm.Log memory log = _only();
        assertEq(
            log.topics[0],
            keccak256(
                "CoinLaunched(uint64,uint8,address,address,string,string,uint8,uint8,uint256,uint256,uint256,uint256)"
            )
        );
        assertEq(log.topics.length, 4);
        assertEq(uint256(log.topics[1]), 1);
        assertEq(uint256(log.topics[2]), 7);
        assertEq(address(uint160(uint256(log.topics[3]))), alice);
        (address token, string memory name, string memory ticker, uint8 mt, uint8 skin, uint256 seedMon) =
            abi.decode(log.data, (address, string, string, uint8, uint8, uint256));
        assertEq(token, a.token);
        assertEq(name, "Fire Drake");
        assertEq(ticker, "DRAKE");
        assertEq(mt, 2);
        assertEq(skin, 3);
        assertEq(seedMon, 5 ether);
        (,,,,,, uint256 vMon, uint256 vTok, uint256 supply) =
            abi.decode(log.data, (address, string, string, uint8, uint8, uint256, uint256, uint256, uint256));
        assertEq(vMon, 25 ether);
        assertEq(vTok, 800_000_000 ether);
        assertEq(supply, 200_000_000 ether);
        assertEq(vMon - demoConfig().vMon0, 5 ether);
    }

    function test_boostedCarriesXp() public {
        ArenaHarness.BoostArgs memory a = ArenaHarness.BoostArgs({
            epoch: 4,
            clashId: 9,
            boostMon: 3 ether,
            rMon: 13 ether,
            vMon: 33 ether,
            vTok: 700_000_000 ether,
            wins: 2,
            level: 3,
            xpGained: 30,
            xp: 85
        });
        vm.recordLogs();
        arena.emitBoostedForTest(1, 5, a);
        Vm.Log memory log = _only();
        assertEq(
            log.topics[0],
            keccak256("Boosted(uint64,uint16,uint32,uint8,uint256,uint256,uint256,uint256,uint16,uint8,uint16,uint16)")
        );
        assertEq(log.topics.length, 3);
        assertEq(uint256(log.topics[2]), 5);
        (uint16 epoch, uint32 clashId, uint256 boostMon, uint256 rMon, uint256 vMon, uint256 vTok) =
            abi.decode(log.data, (uint16, uint32, uint256, uint256, uint256, uint256));
        assertEq(epoch, 4);
        assertEq(clashId, 9);
        assertEq(boostMon, 3 ether);
        assertEq(rMon, 13 ether);
        assertEq(vMon, 33 ether);
        assertEq(vTok, 700_000_000 ether);
        (,,,,,, uint16 wins, uint8 level, uint16 xpGained, uint16 xp) =
            abi.decode(log.data, (uint16, uint32, uint256, uint256, uint256, uint256, uint16, uint8, uint16, uint16));
        assertEq(wins, 2);
        assertEq(level, 3);
        assertEq(xpGained, 30);
        assertEq(xp, 85);
    }

    function test_huntResolvedCarriesXpAndLevel() public {
        vm.recordLogs();
        arena.emitHuntForTest(1, 2, 4, true, 10, 40, 2);
        Vm.Log memory log = _only();
        assertEq(log.topics[0], keccak256("HuntResolved(uint64,uint16,uint8,bool,uint16,uint16,uint8)"));
        assertEq(log.topics.length, 3);
        assertEq(uint256(log.topics[2]), 4);
        (uint16 epoch, bool success, uint16 xpGained, uint16 xp, uint8 level) =
            abi.decode(log.data, (uint16, bool, uint16, uint16, uint8));
        assertEq(epoch, 2);
        assertTrue(success);
        assertEq(xpGained, 10);
        assertEq(xp, 40);
        assertEq(level, 2);
    }

    function test_treasurySpentEvent() public {
        vm.recordLogs();
        arena.emitTreasurySpentForTest(1, IArena.TreasuryKind.KeeperBounty, 0.2 ether, 4.8 ether);
        Vm.Log memory log = _only();
        assertEq(log.topics[0], keccak256("TreasurySpent(uint64,uint8,uint256,uint256)"));
        assertEq(log.topics.length, 2);
        assertEq(uint256(log.topics[1]), 1);
        (uint8 kind, uint256 amount, uint256 after_) = abi.decode(log.data, (uint8, uint256, uint256));
        assertEq(kind, 1);
        assertEq(amount, 0.2 ether);
        assertEq(after_, 4.8 ether);
        assertEq(uint8(IArena.TreasuryKind.SeedFee), 0);
        assertEq(uint8(IArena.TreasuryKind.KeeperBounty), 1);
        assertEq(uint8(IArena.TreasuryKind.Other), 2);
    }

    function test_feesSweptEvent() public {
        vm.recordLogs();
        arena.emitFeesSweptForTest(1, 3, 0.3 ether, 0.1 ether, 6 ether, 7 ether);
        Vm.Log memory log = _only();
        assertEq(log.topics[0], keccak256("FeesSwept(uint64,uint16,uint256,uint256,uint256,uint256)"));
        (uint16 epoch, uint256 toPot, uint256 toTreasury, uint256 potAfter, uint256 treasuryAfter) =
            abi.decode(log.data, (uint16, uint256, uint256, uint256, uint256));
        assertEq(epoch, 3);
        assertEq(toPot, 0.3 ether);
        assertEq(toTreasury, 0.1 ether);
        assertEq(potAfter, 6 ether);
        assertEq(treasuryAfter, 7 ether);
    }

    function test_roundCreatedEmitsFullConfigStruct() public {
        IArena.RoundConfig memory c = demoConfig();
        vm.recordLogs();
        vm.prank(owner);
        arena.createRound(c);
        Vm.Log memory log = _only();
        IArena.RoundConfig memory decoded = abi.decode(log.data, (IArena.RoundConfig));
        assertEq(abi.encode(decoded), abi.encode(c));
        assertEq(decoded.poolFactorMaxBps, 100_000);
    }

    function test_newRoundStartsAtEpochZero() public {
        vm.prank(owner);
        arena.createRound(demoConfig());
        assertEq(arena.getRound(1).epoch, 0);
        assertEq(uint8(arena.getRound(1).phase), uint8(IArena.Phase.Lobby));
    }
}
