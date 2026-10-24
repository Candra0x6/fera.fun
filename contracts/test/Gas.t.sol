// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {console2} from "forge-std/console2.sol";
import {Base} from "./Base.t.sol";
import {IArena} from "../src/IArena.sol";

contract GasTest is Base {
    function _gas() internal view returns (uint256) {
        return vm.lastCallGas().gasTotalUsed;
    }

    function test_gasProfile_lifecycleCalls() public {
        uint64 id = newRound(demoConfig());
        address who = creatorOf(0);
        vm.deal(who, 100 ether);
        vm.prank(who);
        arena.launchCoin{value: 4 ether}(id, "Gas Coin", "GAS", 0, 0);
        console2.log("launchCoin", _gas());
        launchMany2(id);
        startRound(id);
        address trader = makeAddr("trader");
        vm.deal(trader, 1000 ether);
        vm.prank(trader);
        uint256 got = arena.buy{value: 10 ether}(id, 3, 1, uint64(block.timestamp + 1000));
        console2.log("buy", _gas());
        vm.prank(trader);
        arena.sell(id, 3, got / 2, 1, uint64(block.timestamp + 1000));
        console2.log("sell", _gas());
        vm.warp(block.timestamp + 20);
        arena.lockEpoch(id);
        console2.log("lockEpoch", _gas());
        seeds.deliver(1, keccak256("g"));
        arena.resolveEpoch(id, 255);
        console2.log("resolveEpoch leveling epoch, 0 clashes, 30 hunts", _gas());
        for (uint256 e = 0; e < 2; ++e) {
            playEpoch(id, keccak256(abi.encode(e)));
        }
        lockAndSeed(id, keccak256("k"));
        arena.resolveEpoch(id, 255);
        console2.log("resolveEpoch knockout, 6 clashes, 24 hunts", _gas());
    }

    function launchMany2(uint64 id) internal {
        for (uint256 i = 1; i < 30; ++i) {
            launch(id, i, 3 ether);
        }
    }

    function test_gasProfile_fifteenClashes() public {
        IArena.RoundConfig memory cfg = demoConfig();
        cfg.clashesPerEpoch = 15;
        cfg.levelingEpochs = 0;
        uint64 id = newRound(cfg);
        launchMany(id, 30, 3 ether);
        startRound(id);
        lockAndSeed(id, keccak256("fifteen"));
        arena.resolveEpoch(id, 255);
        console2.log("resolveEpoch knockout, 15 clashes, 15 hunts", _gas());
        assertEq(arena.getRound(id).aliveCount, 15);
    }

    function test_gasProfile_fifteenClashesSpreadMode() public {
        IArena.RoundConfig memory cfg = demoConfig();
        cfg.clashesPerEpoch = 15;
        cfg.levelingEpochs = 0;
        cfg.consolationMode = 1;
        uint64 id = newRound(cfg);
        launchMany(id, 30, 3 ether);
        startRound(id);
        lockAndSeed(id, keccak256("fifteen"));
        arena.resolveEpoch(id, 255);
        console2.log("resolveEpoch knockout spread mode, 15 clashes, 15 hunts", _gas());
    }
}
