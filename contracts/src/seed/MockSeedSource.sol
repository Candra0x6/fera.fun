// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {ISeedSource} from "./ISeedSource.sol";
import {ISeedConsumer} from "./ISeedConsumer.sol";

contract MockSeedSource is ISeedSource {
    error NotArena();
    error ZeroAddress();
    error UnknownRequest();
    error AlreadyDelivered();
    error WrongFee();

    event SeedRequested(uint64 indexed id);

    ISeedConsumer public immutable arena;
    uint256 public feeAmount;
    uint64 public nextId;
    mapping(uint64 id => uint8 state) public requestState;

    constructor(address arena_, uint256 feeAmount_) {
        if (arena_ == address(0)) revert ZeroAddress();
        arena = ISeedConsumer(arena_);
        feeAmount = feeAmount_;
    }

    function setFee(uint256 feeAmount_) external {
        feeAmount = feeAmount_;
    }

    function fee() external view returns (uint256) {
        return feeAmount;
    }

    function requestSeed() external payable returns (uint64 id) {
        if (msg.sender != address(arena)) revert NotArena();
        if (msg.value != feeAmount) revert WrongFee();
        id = ++nextId;
        requestState[id] = 1;
        emit SeedRequested(id);
    }

    function deliver(uint64 id, bytes32 seed) external {
        uint8 state = requestState[id];
        if (state == 0) revert UnknownRequest();
        if (state == 2) revert AlreadyDelivered();
        requestState[id] = 2;
        arena.onSeed(id, seed);
    }
}
