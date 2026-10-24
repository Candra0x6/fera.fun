// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Vm} from "forge-std/Vm.sol";
import {Base} from "./Base.t.sol";
import {IArena} from "../src/IArena.sol";
import {Arena} from "../src/Arena.sol";
import {MonsterCoin} from "../src/MonsterCoin.sol";

contract TradeTest is Base {
    uint64 internal id;
    address internal trader = makeAddr("trader");

    function setUp() public override {
        super.setUp();
        id = newRound(demoConfig());
        launchMany(id, 8, 3 ether);
        vm.deal(trader, 1_000_000 ether);
    }

    function _deadline() internal view returns (uint64) {
        return uint64(block.timestamp + 1000);
    }

    function test_tradingClosedInLobby() public {
        vm.prank(trader);
        vm.expectRevert(Arena.WrongPhase.selector);
        arena.buy{value: 1 ether}(id, 0, 1, _deadline());
        vm.prank(trader);
        vm.expectRevert(Arena.WrongPhase.selector);
        arena.sell(id, 0, 1, 1, _deadline());
    }

    function test_buy_updatesCurveAndEmitsPostState() public {
        startRound(id);
        uint256 quote = arena.quoteBuy(id, 0, 10 ether);
        vm.recordLogs();
        vm.prank(trader);
        uint256 out = arena.buy{value: 10 ether}(id, 0, quote, _deadline());
        Vm.Log[] memory logs = vm.getRecordedLogs();
        assertEq(out, quote);
        IArena.CoinView memory c = arena.getArenaSnapshotCoin(id, 0);
        assertEq(MonsterCoin(c.token).balanceOf(trader), out);
        assertEq(c.rMon, 3 ether + 9.9 ether);
        assertEq(c.vMon - 20 ether, c.rMon);
        assertEq(arena.coinOf(id, 0).feeAcc, 0.1 ether);
        bytes32 sig = keccak256("Trade(uint64,uint8,address,bool,uint256,uint256,uint256,uint256,uint256)");
        Vm.Log memory t = logs[logs.length - 1];
        assertEq(t.topics[0], sig);
        (bool isBuy, uint256 mon, uint256 tok, uint256 rMon, uint256 vMon, uint256 vTok) =
            abi.decode(t.data, (bool, uint256, uint256, uint256, uint256, uint256));
        assertTrue(isBuy);
        assertEq(mon, 10 ether);
        assertEq(tok, out);
        assertEq(rMon, c.rMon);
        assertEq(vMon, c.vMon);
        assertEq(vTok, c.vTok);
    }

    function test_sell_payOutMatchesQuoteAndKeepsIdentity() public {
        startRound(id);
        vm.prank(trader);
        uint256 out = arena.buy{value: 10 ether}(id, 0, 1, _deadline());
        uint256 quote = arena.quoteSell(id, 0, out);
        uint256 before = trader.balance;
        vm.prank(trader);
        uint256 paid = arena.sell(id, 0, out, quote, _deadline());
        assertEq(paid, quote);
        assertEq(trader.balance - before, paid);
        assertLt(paid, 10 ether);
        IArena.CoinView memory c = arena.getArenaSnapshotCoin(id, 0);
        assertEq(c.vMon - 20 ether, c.rMon);
        assertGe(address(arena).balance, arena.allLiabilities());
    }

    function test_trade_guards() public {
        startRound(id);
        vm.startPrank(trader);
        vm.expectRevert(Arena.MinOutRequired.selector);
        arena.buy{value: 1 ether}(id, 0, 0, _deadline());
        vm.expectRevert(Arena.MinOutRequired.selector);
        arena.sell(id, 0, 1, 0, _deadline());
        vm.expectRevert(Arena.Expired.selector);
        arena.buy{value: 1 ether}(id, 0, 1, uint64(block.timestamp - 1));
        vm.expectRevert(Arena.Expired.selector);
        arena.sell(id, 0, 1, 1, uint64(block.timestamp - 1));
        vm.expectRevert(Arena.Slippage.selector);
        arena.buy{value: 1 ether}(id, 0, type(uint256).max, _deadline());
        vm.expectRevert(Arena.ZeroOut.selector);
        arena.buy{value: 1}(id, 0, 1, _deadline());
        vm.stopPrank();
    }

    function test_sell_cannotSellMoreThanHeld() public {
        startRound(id);
        vm.prank(trader);
        arena.buy{value: 1 ether}(id, 0, 1, _deadline());
        vm.prank(trader);
        vm.expectRevert();
        arena.sell(id, 0, 1e27, 1, _deadline());
    }

    function test_buyOnEliminatedCoinReverts() public {
        startRound(id);
        for (uint256 e = 0; e < 4; ++e) {
            playEpoch(id, keccak256(abi.encode(e)));
        }
        uint8 dead;
        for (uint8 c = 0; c < 8; ++c) {
            if (arena.coinOf(id, c).status == IArena.Status.Eliminated) dead = c;
        }
        vm.prank(trader);
        vm.expectRevert(Arena.CoinNotAlive.selector);
        arena.buy{value: 1 ether}(id, dead, 1, _deadline());
    }

    function testFuzz_roundTripNeverProfits(uint256 buyAmt) public {
        startRound(id);
        buyAmt = bound(buyAmt, 0.01 ether, 500 ether);
        vm.startPrank(trader);
        uint256 tokens = arena.buy{value: buyAmt}(id, 3, 1, _deadline());
        uint256 q = arena.quoteSell(id, 3, tokens);
        if (q == 0) {
            vm.stopPrank();
            return;
        }
        uint256 paid = arena.sell(id, 3, tokens, q, _deadline());
        vm.stopPrank();
        assertLt(paid, buyAmt);
        assertGe(address(arena).balance, arena.allLiabilities());
    }
}
