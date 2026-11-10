// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {CombatMath} from "monad/libs/CombatMath.sol";

contract CombatHarness {
    function run(uint256 fn, uint256[16] calldata v) external pure returns (uint256[] memory out) {
        if (fn == 0) {
            out = new uint256[](1);
            out[0] = CombatMath.poolFactorWad(v[0], v[1], v[2], _params(v[3], v[4], v[5], 0, 0, 0, 0, 0));
        } else if (fn == 1) {
            CombatMath.Params memory p = _params(v[6], v[7], v[8], v[9], v[10], v[11], 0, 0);
            out = new uint256[](2);
            out[0] = CombatMath.power(p, uint8(v[0]), uint8(v[1]), uint8(v[2]), v[3], v[4], v[5]);
            out[1] = CombatMath.poolFactorWad(v[3], v[4], v[5], p);
        } else if (fn == 2) {
            out = _winProb(v);
        } else if (fn == 3) {
            uint8[] memory perm = CombatMath.pairing(bytes32(v[0]), uint32(v[1]));
            out = new uint256[](perm.length);
            for (uint256 i = 0; i < perm.length; ++i) {
                out[i] = perm[i];
            }
        } else if (fn == 4) {
            out = new uint256[](1);
            out[0] = CombatMath.clashRoll(bytes32(v[0]), v[1]);
        } else if (fn == 5) {
            out = new uint256[](1);
            out[0] = CombatMath.huntRoll(bytes32(v[0]), v[1]);
        } else if (fn == 6) {
            out = new uint256[](1);
            out[0] = CombatMath.elementBps(uint8(v[0]), uint8(v[1]), v[2], v[3]);
        } else if (fn == 7) {
            out = new uint256[](1);
            out[0] = CombatMath.levelFromXp(v[0]);
        } else {
            revert("unknown fn");
        }
    }

    function _winProb(uint256[16] calldata v) internal pure returns (uint256[] memory out) {
        CombatMath.Params memory p = _params(v[8], v[9], v[10], v[11], v[12], v[13], v[14], v[15]);
        out = new uint256[](3);
        out[0] = CombatMath.winProbBps(p, uint8(v[0]), uint8(v[1]), v[2], uint8(v[3]), uint8(v[4]), v[5], v[6], v[7]);
        out[1] = CombatMath.power(p, uint8(v[0]), uint8(v[1]), uint8(v[3]), v[2], v[6], v[7]);
        out[2] = CombatMath.power(p, uint8(v[3]), uint8(v[4]), uint8(v[0]), v[5], v[6], v[7]);
    }

    function _params(
        uint256 gamma,
        uint256 pfMin,
        uint256 pfMax,
        uint256 levelBonus,
        uint256 up,
        uint256 down,
        uint256 winMin,
        uint256 winMax
    ) internal pure returns (CombatMath.Params memory p) {
        p.gammaBps = uint16(gamma);
        p.poolFactorMinBps = uint16(pfMin);
        p.poolFactorMaxBps = uint32(pfMax);
        p.levelBonusBps = uint16(levelBonus);
        p.elementUpBps = uint16(up);
        p.elementDownBps = uint16(down);
        p.winProbMinBps = uint16(winMin);
        p.winProbMaxBps = uint16(winMax);
    }
}
