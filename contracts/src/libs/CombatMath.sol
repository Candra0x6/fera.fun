// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

library CombatMath {
    using SafeCast for uint256;
    using SafeCast for int256;

    uint256 internal constant WAD = 1e18;
    uint256 internal constant BPS = 10_000;
    uint16 internal constant XP_HUNT = 10;
    uint16 internal constant XP_WIN = 20;
    uint256 internal constant BASE_STAT_BPS = 10_000;

    bytes4 internal constant TAG_PAIR = "PAIR";
    bytes5 internal constant TAG_CLASH = "CLASH";
    bytes4 internal constant TAG_HUNT = "HUNT";

    struct Params {
        uint16 gammaBps;
        uint16 poolFactorMinBps;
        uint32 poolFactorMaxBps;
        uint16 levelBonusBps;
        uint16 elementUpBps;
        uint16 elementDownBps;
        uint16 winProbMinBps;
        uint16 winProbMaxBps;
    }

    function elementBps(uint8 a, uint8 b, uint256 upBps, uint256 downBps) internal pure returns (uint256) {
        if ((a + 1) % 5 == b) return upBps;
        if ((b + 1) % 5 == a) return downBps;
        return BPS;
    }

    function levelFromXp(uint256 xp) internal pure returns (uint8) {
        if (xp >= 320) return 10;
        if (xp >= 260) return 9;
        if (xp >= 210) return 8;
        if (xp >= 165) return 7;
        if (xp >= 125) return 6;
        if (xp >= 90) return 5;
        if (xp >= 60) return 4;
        if (xp >= 35) return 3;
        if (xp >= 15) return 2;
        return 1;
    }

    function poolFactorWad(uint256 rLock, uint256 sumR, uint256 n, Params memory p) internal pure returns (uint256) {
        uint256 minWad = uint256(p.poolFactorMinBps) * WAD / BPS;
        uint256 maxWad = uint256(p.poolFactorMaxBps) * WAD / BPS;
        if (sumR == 0 || n == 0) return WAD < minWad ? minWad : (WAD > maxWad ? maxWad : WAD);
        if (rLock == 0) return minWad;
        uint256 ratio = rLock * n * WAD / sumR;
        if (ratio == 0) return minWad;
        uint256 raw =
            FixedPointMathLib.powWad(ratio.toInt256(), (uint256(p.gammaBps) * WAD / BPS).toInt256()).toUint256();
        if (raw < minWad) return minWad;
        if (raw > maxWad) return maxWad;
        return raw;
    }

    function power(
        Params memory p,
        uint8 monsterType,
        uint8 level,
        uint8 opponentType,
        uint256 rLock,
        uint256 sumR,
        uint256 n
    ) internal pure returns (uint256) {
        uint256 pf = poolFactorWad(rLock, sumR, n, p);
        uint256 lvl = BPS + uint256(p.levelBonusBps) * (level - 1);
        uint256 elem = elementBps(monsterType, opponentType, p.elementUpBps, p.elementDownBps);
        return pf * lvl * elem * BASE_STAT_BPS / (BPS * BPS * BPS);
    }

    function winProbBps(
        Params memory p,
        uint8 typeA,
        uint8 levelA,
        uint256 rLockA,
        uint8 typeB,
        uint8 levelB,
        uint256 rLockB,
        uint256 sumR,
        uint256 n
    ) internal pure returns (uint16) {
        uint256 pa = power(p, typeA, levelA, typeB, rLockA, sumR, n);
        uint256 pb = power(p, typeB, levelB, typeA, rLockB, sumR, n);
        uint256 bps = pa + pb == 0 ? BPS / 2 : pa * BPS / (pa + pb);
        if (bps < p.winProbMinBps) bps = p.winProbMinBps;
        if (bps > p.winProbMaxBps) bps = p.winProbMaxBps;
        return bps.toUint16();
    }

    function pairing(bytes32 seed, uint32 aliveMask) internal pure returns (uint8[] memory perm) {
        uint256 n = 0;
        for (uint256 i = 0; i < 32; ++i) {
            if (uint256(aliveMask) & (uint256(1) << i) != 0) ++n;
        }
        perm = new uint8[](n);
        uint256 k = 0;
        for (uint256 i = 0; i < 32; ++i) {
            if (uint256(aliveMask) & (uint256(1) << i) != 0) perm[k++] = i.toUint8();
        }
        for (uint256 i = n; i > 1; --i) {
            uint256 idx = i - 1;
            uint256 j = uint256(keccak256(abi.encode(seed, TAG_PAIR, idx))) % i;
            (perm[idx], perm[j]) = (perm[j], perm[idx]);
        }
    }

    function clashRoll(bytes32 seed, uint256 clashId) internal pure returns (uint16) {
        return (uint256(keccak256(abi.encode(seed, TAG_CLASH, clashId))) % BPS).toUint16();
    }

    function huntRoll(bytes32 seed, uint256 coinId) internal pure returns (uint256) {
        return uint256(keccak256(abi.encode(seed, TAG_HUNT, coinId))) % 100;
    }
}
