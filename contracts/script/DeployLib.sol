// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Vm} from "forge-std/Vm.sol";
import {IArena} from "../src/IArena.sol";

library DeployLib {
    struct Addresses {
        address arena;
        address coinImplementation;
        address seedSource;
        address entropy;
        address entropyProvider;
        address keeper;
    }

    function writeDescriptors(
        Vm vm,
        string memory dir,
        Addresses memory a,
        uint256 reserveFloor,
        uint256 callbackGasLimit,
        IArena.RoundConfig memory cfg
    ) internal {
        string memory chain = vm.toString(block.chainid);
        writeAddresses(vm, string.concat(dir, "/", chain, ".json"), a);
        writeParams(vm, string.concat(dir, "/", chain, ".params.json"), reserveFloor, callbackGasLimit, cfg);
    }

    function writeAddresses(Vm vm, string memory path, Addresses memory a) internal {
        string memory k = "descriptor";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "arena", a.arena);
        vm.serializeAddress(k, "coinImplementation", a.coinImplementation);
        vm.serializeAddress(k, "seedSource", a.seedSource);
        vm.serializeAddress(k, "entropy", a.entropy);
        vm.serializeAddress(k, "entropyProvider", a.entropyProvider);
        vm.serializeAddress(k, "keeper", a.keeper);
        vm.serializeUint(k, "deployBlock", block.number);
        vm.serializeString(k, "commit", vm.envOr("DEPLOY_COMMIT", string("unversioned")));
        string memory json = vm.serializeUint(k, "deployedAt", block.timestamp);
        vm.writeJson(json, path);
    }

    function writeParams(
        Vm vm,
        string memory path,
        uint256 reserveFloor,
        uint256 callbackGasLimit,
        IArena.RoundConfig memory cfg
    ) internal {
        string memory p = "params";
        vm.serializeUint(p, "reserveFloor", reserveFloor);
        vm.serializeUint(p, "callbackGasLimit", callbackGasLimit);
        vm.serializeUint(p, "maxCoins", cfg.maxCoins);
        vm.serializeUint(p, "minCoins", cfg.minCoins);
        vm.serializeUint(p, "lobbySeconds", cfg.lobbySeconds);
        vm.serializeUint(p, "levelingEpochs", cfg.levelingEpochs);
        vm.serializeUint(p, "epochSeconds", cfg.epochSeconds);
        vm.serializeUint(p, "clashesPerEpoch", cfg.clashesPerEpoch);
        vm.serializeUint(p, "seedTimeoutSeconds", cfg.seedTimeoutSeconds);
        vm.serializeUint(p, "maxRoundSeconds", cfg.maxRoundSeconds);
        vm.serializeUint(p, "launchFee", cfg.launchFee);
        vm.serializeUint(p, "minSeed", cfg.minSeed);
        vm.serializeUint(p, "maxSeed", cfg.maxSeed);
        vm.serializeUint(p, "tradeFeeBps", cfg.tradeFeeBps);
        vm.serializeUint(p, "boostBps", cfg.boostBps);
        vm.serializeUint(p, "consolationBps", cfg.consolationBps);
        vm.serializeUint(p, "potBps", cfg.potBps);
        vm.serializeUint(p, "treasuryBps", cfg.treasuryBps);
        vm.serializeUint(p, "consolationMode", cfg.consolationMode);
        vm.serializeUint(p, "gammaBps", cfg.gammaBps);
        vm.serializeUint(p, "poolFactorMinBps", cfg.poolFactorMinBps);
        vm.serializeUint(p, "poolFactorMaxBps", cfg.poolFactorMaxBps);
        vm.serializeUint(p, "levelBonusBps", cfg.levelBonusBps);
        vm.serializeUint(p, "elementUpBps", cfg.elementUpBps);
        vm.serializeUint(p, "elementDownBps", cfg.elementDownBps);
        vm.serializeUint(p, "winProbMinBps", cfg.winProbMinBps);
        vm.serializeUint(p, "winProbMaxBps", cfg.winProbMaxBps);
        vm.serializeUint(p, "huntWinPct", cfg.huntWinPct);
        vm.serializeUint(p, "keeperBounty", cfg.keeperBounty);
        vm.serializeUint(p, "maxEntropyFee", cfg.maxEntropyFee);
        vm.serializeUint(p, "vMon0", cfg.vMon0);
        string memory params = vm.serializeUint(p, "vTok0", cfg.vTok0);
        vm.writeJson(params, path);
    }
}
