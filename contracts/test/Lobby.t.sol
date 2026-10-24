// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Vm} from "forge-std/Vm.sol";
import {Base} from "./Base.t.sol";
import {IArena} from "../src/IArena.sol";
import {Arena} from "../src/Arena.sol";
import {MonsterCoin} from "../src/MonsterCoin.sol";
import {CurveMath} from "../src/libs/CurveMath.sol";

contract LobbyTest is Base {
    function _smallConfig() internal pure returns (IArena.RoundConfig memory c) {
        c = demoConfig();
        c.maxCoins = 4;
        c.minCoins = 2;
        c.clashesPerEpoch = 2;
    }

    function test_launchCoin_storesStateAndEmitsPostState() public {
        uint64 id = newRound(demoConfig());
        address who = creatorOf(7);
        vm.deal(who, 10 ether);
        vm.recordLogs();
        vm.prank(who);
        uint8 coinId = arena.launchCoin{value: 4 ether}(id, "Fire Drake", "DRAKE", 2, 3);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(coinId, 0);
        IArena.CoinView memory c = arena.getArenaSnapshotCoin(id, 0);
        assertEq(c.creator, who);
        assertEq(c.name, "Fire Drake");
        assertEq(c.ticker, "DRAKE");
        assertEq(c.monsterType, 2);
        assertEq(c.skinId, 3);
        assertEq(uint8(c.status), uint8(IArena.Status.Alive));
        assertEq(c.level, 1);
        assertEq(c.seedMon, 3 ether);
        assertEq(c.rMon, 3 ether);
        assertEq(c.vMon, 23 ether);
        assertEq(c.vTok, CurveMath.ceilDiv(20 ether * 1e27, 23 ether));
        assertEq(c.supply, 1e27 - c.vTok);
        assertEq(MonsterCoin(c.token).balanceOf(address(arena)), c.supply);
        assertEq(MonsterCoin(c.token).balanceOf(who), 0);
        IArena.RoundView memory r = arena.getRound(id);
        assertEq(r.coinCount, 1);
        assertEq(r.aliveCount, 1);
        assertEq(r.treasury, FLOOR + 1 ether);
        bytes32 sig = keccak256(
            "CoinLaunched(uint64,uint8,address,address,string,string,uint8,uint8,uint256,uint256,uint256,uint256)"
        );
        bool found;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] != sig) continue;
            found = true;
            (,,,,, uint256 seedMon, uint256 vMon, uint256 vTok, uint256 supply) =
                abi.decode(logs[i].data, (address, string, string, uint8, uint8, uint256, uint256, uint256, uint256));
            assertEq(seedMon, 3 ether);
            assertEq(vMon, c.vMon);
            assertEq(vTok, c.vTok);
            assertEq(supply, c.supply);
        }
        assertTrue(found);
    }

    function test_launchCoin_validation() public {
        uint64 id = newRound(demoConfig());
        address who = creatorOf(1);
        vm.deal(who, 100 ether);
        vm.startPrank(who);
        vm.expectRevert(Arena.BadTicker.selector);
        arena.launchCoin{value: 4 ether}(id, "A", "low", 0, 0);
        vm.expectRevert(Arena.BadTicker.selector);
        arena.launchCoin{value: 4 ether}(id, "A", "X", 0, 0);
        vm.expectRevert(Arena.BadTicker.selector);
        arena.launchCoin{value: 4 ether}(id, "A", "ABCDEFGH", 0, 0);
        vm.expectRevert(Arena.BadTicker.selector);
        arena.launchCoin{value: 4 ether}(id, "A", "AB-C", 0, 0);
        vm.expectRevert(Arena.BadName.selector);
        arena.launchCoin{value: 4 ether}(id, "", "ABC", 0, 0);
        vm.expectRevert(Arena.BadName.selector);
        arena.launchCoin{value: 4 ether}(id, "012345678901234567890123456789012", "ABC", 0, 0);
        vm.expectRevert(Arena.BadCatalogId.selector);
        arena.launchCoin{value: 4 ether}(id, "A", "ABC", 5, 0);
        vm.expectRevert(Arena.BadCatalogId.selector);
        arena.launchCoin{value: 4 ether}(id, "A", "ABC", 0, 5);
        vm.expectRevert(Arena.BadSeed.selector);
        arena.launchCoin{value: 0.5 ether}(id, "A", "ABC", 0, 0);
        vm.expectRevert(Arena.BadSeed.selector);
        arena.launchCoin{value: 2.5 ether}(id, "A", "ABC", 0, 0);
        vm.expectRevert(Arena.BadSeed.selector);
        arena.launchCoin{value: 51.5 ether}(id, "A", "ABC", 0, 0);
        arena.launchCoin{value: 4 ether}(id, "A", "ABC", 0, 0);
        arena.launchCoin{value: 4 ether}(id, "B", "ABD", 0, 0);
        vm.expectRevert(Arena.CreatorCapReached.selector);
        arena.launchCoin{value: 4 ether}(id, "C", "ABE", 0, 0);
        vm.stopPrank();
        vm.expectRevert(Arena.WrongPhase.selector);
        arena.launchCoin(99, "A", "ABC", 0, 0);
    }

    function test_launchCoin_requiresFundedFloor() public {
        vm.prank(owner);
        uint64 id = arena.createRound(demoConfig());
        address who = creatorOf(1);
        vm.deal(who, 10 ether);
        vm.prank(who);
        vm.expectRevert(Arena.ReserveNotFunded.selector);
        arena.launchCoin{value: 4 ether}(id, "A", "ABC", 0, 0);
        arena.fundTreasury{value: 0}(id);
        vm.deal(address(this), 20 ether);
        arena.fundTreasury{value: 10 ether}(id);
        vm.prank(who);
        arena.launchCoin{value: 4 ether}(id, "A", "ABC", 0, 0);
    }

    function test_launchCoin_roundFull() public {
        uint64 id = newRound(_smallConfig());
        launchMany(id, 4, 2 ether);
        vm.deal(creatorOf(50), 10 ether);
        vm.prank(creatorOf(50));
        vm.expectRevert(Arena.RoundFull.selector);
        arena.launchCoin{value: 4 ether}(id, "A", "ABC", 0, 0);
    }

    function test_startRound_atMaxCoinsImmediately() public {
        uint64 id = newRound(_smallConfig());
        launchMany(id, 4, 2 ether);
        vm.deal(address(this), 100 ether);
        arena.fundTreasury{value: 5 ether}(id);
        vm.expectEmit(true, false, false, false);
        emit IArena.RoundStarted(id, 0, 4);
        arena.startRound(id);
        IArena.RoundView memory r = arena.getRound(id);
        assertEq(uint8(r.phase), uint8(IArena.Phase.Leveling));
        assertEq(r.startedAt, block.timestamp);
        assertEq(r.aliveCount, 4);
    }

    function test_startRound_deadlineNeedsMinCoins() public {
        uint64 id = newRound(demoConfig());
        launchMany(id, 7, 2 ether);
        vm.expectRevert(Arena.LobbyNotReady.selector);
        arena.startRound(id);
        vm.warp(block.timestamp + 200);
        vm.expectRevert(Arena.LobbyNotReady.selector);
        arena.startRound(id);
        launch(id, 7, 2 ether);
        vm.expectRevert(Arena.WrongPhase.selector);
        arena.startRound(99);
        arena.startRound(id);
        vm.expectRevert(Arena.WrongPhase.selector);
        arena.startRound(id);
    }

    function test_startRound_zeroLevelingStartsInKnockout() public {
        IArena.RoundConfig memory c = _smallConfig();
        c.levelingEpochs = 0;
        uint64 id = newRound(c);
        launchMany(id, 4, 2 ether);
        vm.deal(address(this), 100 ether);
        arena.fundTreasury{value: 5 ether}(id);
        arena.startRound(id);
        assertEq(uint8(arena.getRound(id).phase), uint8(IArena.Phase.Knockout));
    }

    function test_startRound_requiresTreasuryForPlannedEpochs() public {
        IArena.RoundConfig memory c = demoConfig();
        c.maxEntropyFee = 3 ether;
        uint64 id = newRound(c);
        launchMany(id, 8, 2 ether);
        vm.warp(block.timestamp + 200);
        vm.expectRevert(Arena.TreasuryTooLow.selector);
        arena.startRound(id);
        vm.deal(address(this), 100 ether);
        arena.fundTreasury{value: 20 ether}(id);
        arena.startRound(id);
    }

    function test_refundLaunch_afterLobbyAbort() public {
        vm.warp(1000);
        uint64 id = newRound(demoConfig());
        launchMany(id, 3, 2 ether);
        vm.warp(1000 + 120);
        arena.abortRound(id);
        address who = creatorOf(1);
        MonsterCoin token = MonsterCoin(arena.coinOf(id, 1).token);
        uint256 balBefore = who.balance;
        vm.expectRevert(Arena.NotCreator.selector);
        arena.refundLaunch(id, 1);
        vm.prank(who);
        arena.refundLaunch(id, 1);
        assertEq(who.balance - balBefore, 3 ether);
        assertEq(token.balanceOf(address(arena)), 0);
        assertEq(uint8(arena.getArenaSnapshotCoin(id, 1).status), uint8(IArena.Status.Refunded));
        vm.prank(who);
        vm.expectRevert(Arena.NotRefundable.selector);
        arena.refundLaunch(id, 1);
        assertGe(address(arena).balance, arena.allLiabilities());
        assertEq(arena.getRound(id).treasury, FLOOR + 2 ether);
        vm.prank(creatorOf(0));
        arena.refundLaunch(id, 0);
        vm.prank(creatorOf(2));
        arena.refundLaunch(id, 2);
        assertEq(arena.getRound(id).treasury, FLOOR);
        assertEq(address(arena).balance, FLOOR);
        vm.prank(owner);
        uint64 next = arena.createRound(demoConfig());
        assertEq(arena.getRound(next).treasury, FLOOR);
    }

    function test_refundLaunch_requiresLobbyAbort() public {
        uint64 id = newRound(demoConfig());
        launchMany(id, 3, 2 ether);
        vm.prank(creatorOf(0));
        vm.expectRevert(Arena.NotRefundable.selector);
        arena.refundLaunch(id, 0);
    }

    function test_rolloverWhenLobbyRefundsStillOwed() public {
        vm.warp(1000);
        uint64 id = newRound(demoConfig());
        launchMany(id, 3, 2 ether);
        vm.warp(1200);
        arena.abortRound(id);
        vm.prank(owner);
        uint64 next = arena.createRound(demoConfig());
        assertEq(arena.getRound(next).treasury, FLOOR);
        assertEq(arena.getRound(id).treasury, 3 ether);
        vm.prank(creatorOf(0));
        arena.refundLaunch(id, 0);
        assertEq(arena.getRound(id).treasury, 2 ether);
        assertGe(address(arena).balance, arena.allLiabilities());
    }
}
