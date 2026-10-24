// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Script} from "forge-std/Script.sol";
import {Arena} from "../src/Arena.sol";
import {IArena} from "../src/IArena.sol";
import {MonsterCoin} from "../src/MonsterCoin.sol";
import {MockSeedSource} from "../src/seed/MockSeedSource.sol";
import {Presets} from "./Presets.sol";
import {DeployLib} from "./DeployLib.sol";

contract DeployLocal is Script {
    function run() external {
        require(block.chainid != 10_143 && block.chainid != 143, "local only");
        uint256 floor = vm.envOr("RESERVE_FLOOR_WEI", uint256(10 ether));
        uint256 mockFee = vm.envOr("MOCK_SEED_FEE_WEI", uint256(0.01 ether));
        address keeper = vm.envOr("KEEPER_ADDRESS", address(0));

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        MonsterCoin impl = new MonsterCoin();
        Arena arena = new Arena(deployer, address(impl), floor);
        MockSeedSource source = new MockSeedSource(address(arena), mockFee);
        arena.setSeedSource(address(source));
        IArena.RoundConfig memory cfg = Presets.demo();
        cfg.minCoins = uint8(vm.envOr("MIN_COINS", uint256(cfg.minCoins)));
        cfg.maxCoins = uint8(vm.envOr("MAX_COINS", uint256(cfg.maxCoins)));
        cfg.clashesPerEpoch = uint8(vm.envOr("CLASHES_PER_EPOCH", uint256(cfg.clashesPerEpoch)));
        uint64 roundId = arena.createRound(cfg);
        arena.fundTreasury{value: floor}(roundId);
        vm.stopBroadcast();

        DeployLib.writeDescriptors(
            vm,
            "../deployments",
            DeployLib.Addresses(address(arena), address(impl), address(source), address(0), address(0), keeper),
            floor,
            0,
            cfg
        );
    }
}
