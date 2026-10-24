// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Script} from "forge-std/Script.sol";
import {Arena} from "../src/Arena.sol";
import {Presets} from "./Presets.sol";

/// @notice Owner-only: store the blitz preset as the default config of an existing Arena (ARENA_ADDRESS).
contract SetDefaultConfig is Script {
    function run() external {
        Arena arena = Arena(vm.envAddress("ARENA_ADDRESS"));
        vm.startBroadcast();
        arena.setDefaultConfig(Presets.blitz());
        vm.stopBroadcast();
    }
}
