// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Script} from "forge-std/Script.sol";
import {Arena} from "../src/Arena.sol";
import {IArena} from "../src/IArena.sol";
import {Presets} from "./Presets.sol";

contract CreateRound is Script {
    function run() external {
        Arena arena = Arena(payable(vm.envAddress("ARENA_ADDRESS")));
        IArena.RoundConfig memory c = Presets.demo();
        c.minCoins = 5;
        c.maxCoins = 6;
        c.clashesPerEpoch = 3;
        c.lobbySeconds = uint32(vm.envOr("LOBBY_SECONDS", uint256(3600)));
        c.epochSeconds = 30;
        c.launchFee = 0.1 ether;
        c.minSeed = 0.2 ether;
        c.maxSeed = 5 ether;
        c.keeperBounty = 0.02 ether;
        c.maxEntropyFee = 0.2 ether;
        uint256 extra = vm.envOr("EXTRA_TREASURY_WEI", uint256(1.5 ether));
        vm.startBroadcast();
        uint64 roundId = arena.createRound(c);
        arena.fundTreasury{value: extra}(roundId);
        vm.stopBroadcast();
    }
}
