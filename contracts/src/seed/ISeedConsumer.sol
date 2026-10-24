// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

interface ISeedConsumer {
    function onSeed(uint64 seedId, bytes32 seed) external;
}
