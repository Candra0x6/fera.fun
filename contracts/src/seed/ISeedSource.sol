// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

interface ISeedSource {
    function requestSeed() external payable returns (uint64 id);
    function fee() external view returns (uint256);
}
