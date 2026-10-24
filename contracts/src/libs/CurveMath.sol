// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

library CurveMath {
    uint256 internal constant BPS = 10_000;

    function ceilDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        return a == 0 ? 0 : (a - 1) / b + 1;
    }

    function feeOf(uint256 amount, uint256 feeBps) internal pure returns (uint256) {
        return ceilDiv(amount * feeBps, BPS);
    }

    function buyOut(uint256 vMon, uint256 vTok, uint256 monInNet) internal pure returns (uint256 out, uint256 newVTok) {
        newVTok = ceilDiv(vMon * vTok, vMon + monInNet);
        out = vTok > newVTok ? vTok - newVTok : 0;
        if (out == 0) newVTok = vTok;
    }

    function sellGross(uint256 vMon, uint256 vTok, uint256 tokens) internal pure returns (uint256 gross) {
        uint256 floorMon = ceilDiv(vMon * vTok, vTok + tokens);
        gross = vMon > floorMon ? vMon - floorMon : 0;
    }

    function boostedVTok(uint256 vMon, uint256 vTok, uint256 boostMon) internal pure returns (uint256) {
        return ceilDiv(vMon * vTok, vMon + boostMon);
    }
}
