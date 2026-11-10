// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Arena} from "monad/Arena.sol";

contract ArenaProbe is Arena {
    constructor(address owner_, address coinImplementation_, uint256 reserveFloor_)
        Arena(owner_, coinImplementation_, reserveFloor_)
    {}

    function coinOf(uint64 roundId, uint8 coinId) external view returns (Coin memory) {
        return _coins[roundId][coinId];
    }

    function extraOf(uint64 roundId) external view returns (RoundExtra memory) {
        return _extra[roundId];
    }
}
