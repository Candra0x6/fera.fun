// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Script} from "forge-std/Script.sol";
import {Arena} from "../src/Arena.sol";
import {MonsterCoin} from "../src/MonsterCoin.sol";
import {EntropySeedSource} from "../src/seed/EntropySeedSource.sol";
import {IArena} from "../src/IArena.sol";
import {Presets} from "./Presets.sol";
import {DeployLib} from "./DeployLib.sol";

contract Deploy is Script {
    uint32 internal constant CALLBACK_GAS_LIMIT = 200_000;

    /// @dev blitz preset; MAX_ENTROPY_FEE_WEI overrides the Entropy fee cap (mainnet fee is about 1.4 MON per request).
    function _config() internal view returns (IArena.RoundConfig memory cfg) {
        cfg = Presets.blitz();
        uint256 maxEntropyFee = vm.envOr("MAX_ENTROPY_FEE_WEI", uint256(0));
        if (maxEntropyFee != 0) cfg.maxEntropyFee = uint128(maxEntropyFee);
    }

    function run() external {
        string memory account = vm.envString("DEPLOYER_ACCOUNT");
        address entropy = vm.envAddress("ENTROPY_ADDRESS");
        address provider = vm.envAddress("ENTROPY_PROVIDER");
        address keeper = vm.envOr("KEEPER_ADDRESS", address(0));
        uint256 floor = vm.envOr("RESERVE_FLOOR_WEI", uint256(10 ether));
        uint256 extraFund = vm.envOr("TREASURY_EXTRA_WEI", uint256(0));
        require(bytes(account).length != 0, "DEPLOYER_ACCOUNT empty");

        vm.startBroadcast();
        (, address deployer,) = vm.readCallers();
        MonsterCoin impl = new MonsterCoin();
        Arena arena = new Arena(deployer, address(impl), floor);
        EntropySeedSource source = new EntropySeedSource(address(arena), entropy, provider, CALLBACK_GAS_LIMIT);
        arena.setSeedSource(address(source));
        arena.setDefaultConfig(_config());
        if (!vm.envOr("SKIP_FIRST_ROUND", false) && (floor + extraFund != 0 || vm.envOr("CREATE_FIRST_ROUND", false))) {
            arena.createDefaultRound{value: floor + extraFund}();
        }
        vm.stopBroadcast();

        DeployLib.writeDescriptors(
            vm,
            "../deployments",
            DeployLib.Addresses(address(arena), address(impl), address(source), entropy, provider, keeper),
            floor,
            CALLBACK_GAS_LIMIT,
            _config()
        );
    }
}
