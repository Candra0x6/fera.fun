// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Base} from "./Base.t.sol";
import {IArena} from "../src/IArena.sol";
import {Arena} from "../src/Arena.sol";
import {MonsterCoin} from "../src/MonsterCoin.sol";

contract Hostile {
    Arena internal immutable arena;
    bytes internal attack;
    bool public armed;
    bool public reentered;
    bool public blocked;

    constructor(Arena arena_) {
        arena = arena_;
    }

    function arm(bytes calldata data) external {
        attack = data;
        armed = true;
    }

    function call(address target, bytes calldata data, uint256 value) external returns (bytes memory) {
        (bool ok, bytes memory ret) = target.call{value: value}(data);
        require(ok, "call failed");
        return ret;
    }

    receive() external payable {
        if (!armed) return;
        armed = false;
        (bool ok,) = address(arena).call(attack);
        if (ok) reentered = true;
        else blocked = true;
    }
}

contract ReentrancyTest is Base {
    function _setup() internal returns (uint64 id, Hostile h) {
        id = newRound(demoConfig());
        launchMany(id, 8, 3 ether);
        startRound(id);
        h = new Hostile(arena);
        vm.deal(address(h), 100 ether);
    }

    function test_T10_reentrantSell() public {
        (uint64 id, Hostile h) = _setup();
        uint64 dl = uint64(block.timestamp + 10_000);
        bytes memory buyData = abi.encodeCall(Arena.buy, (id, 1, 1, dl));
        h.call(address(arena), buyData, 10 ether);
        uint256 bal = MonsterCoin(arena.coinOf(id, 1).token).balanceOf(address(h));
        uint256 half = bal / 2;
        h.arm(abi.encodeCall(Arena.sell, (id, 1, 1000, 1, dl)));
        uint256 liabsBefore = arena.allLiabilities();
        h.call(address(arena), abi.encodeCall(Arena.sell, (id, 1, half, 1, dl)), 0);
        assertTrue(h.blocked());
        assertFalse(h.reentered());
        assertGe(address(arena).balance, arena.allLiabilities());
        assertLe(arena.allLiabilities(), liabsBefore);
    }

    function test_T10_reentrantClaimConsolationAndRedeem() public {
        (uint64 id, Hostile h) = _setup();
        uint64 dl = uint64(block.timestamp + 10_000);
        for (uint8 c = 0; c < 8; ++c) {
            h.call(address(arena), abi.encodeCall(Arena.buy, (id, c, 1, dl)), 2 ether);
        }
        playToEnd(id, 9);
        IArena.RoundView memory r = arena.getRound(id);
        uint8 loser = r.winnerCoinId == 0 ? 1 : 0;
        uint256 lb = MonsterCoin(arena.coinOf(id, loser).token).balanceOf(address(h));
        h.arm(abi.encodeCall(Arena.claimConsolation, (id, loser, 1)));
        h.call(address(arena), abi.encodeCall(Arena.claimConsolation, (id, loser, lb / 2)), 0);
        assertTrue(h.blocked());
        assertFalse(h.reentered());
        uint256 wb = MonsterCoin(arena.coinOf(id, r.winnerCoinId).token).balanceOf(address(h));
        h.arm(abi.encodeCall(Arena.redeem, (id, 1)));
        h.call(address(arena), abi.encodeCall(Arena.redeem, (id, wb / 2)), 0);
        assertTrue(h.blocked());
        assertFalse(h.reentered());
        assertGe(address(arena).balance, arena.allLiabilities());
    }
}
