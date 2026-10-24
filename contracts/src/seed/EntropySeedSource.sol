// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import {IEntropyV2} from "@pythnetwork/entropy-sdk-solidity/IEntropyV2.sol";
import {ISeedSource} from "./ISeedSource.sol";
import {ISeedConsumer} from "./ISeedConsumer.sol";

contract EntropySeedSource is ISeedSource, IEntropyConsumer {
    error NotArena();
    error ZeroAddress();
    error WrongFee();

    ISeedConsumer public immutable arena;
    IEntropyV2 public immutable entropy;
    address public immutable provider;
    uint32 public immutable callbackGasLimit;

    constructor(address arena_, address entropy_, address provider_, uint32 callbackGasLimit_) {
        if (arena_ == address(0) || entropy_ == address(0) || provider_ == address(0)) revert ZeroAddress();
        arena = ISeedConsumer(arena_);
        entropy = IEntropyV2(entropy_);
        provider = provider_;
        callbackGasLimit = callbackGasLimit_;
    }

    function fee() public view returns (uint256) {
        return entropy.getFeeV2(provider, callbackGasLimit);
    }

    function requestSeed() external payable returns (uint64 id) {
        if (msg.sender != address(arena)) revert NotArena();
        uint256 required = fee();
        if (msg.value != required) revert WrongFee();
        id = entropy.requestV2{value: required}(provider, callbackGasLimit);
    }

    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    function entropyCallback(uint64 sequence, address, bytes32 randomNumber) internal override {
        try arena.onSeed(sequence, randomNumber) {} catch {}
    }
}
