// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Test} from "forge-std/Test.sol";
import {CombatMath} from "../src/libs/CombatMath.sol";

contract CombatMathTest is Test {
    function _params() internal pure returns (CombatMath.Params memory p) {
        p.gammaBps = 8800;
        p.poolFactorMinBps = 1000;
        p.poolFactorMaxBps = 100_000;
        p.levelBonusBps = 400;
        p.elementUpBps = 11_500;
        p.elementDownBps = 8700;
        p.winProbMinBps = 1500;
        p.winProbMaxBps = 8500;
    }

    function testFuzz_winProbWithinClamp(uint8 ta, uint8 tb, uint8 la, uint8 lb, uint128 ra, uint128 rb, uint8 nRaw)
        public
        pure
    {
        ta = ta % 5;
        tb = tb % 5;
        la = uint8(bound(la, 1, 10));
        lb = uint8(bound(lb, 1, 10));
        uint256 n = bound(nRaw, 2, 30);
        uint256 sum = uint256(ra) + rb + 1;
        uint16 p = CombatMath.winProbBps(_params(), ta, la, ra, tb, lb, rb, sum, n);
        assertGe(p, 1500);
        assertLe(p, 8500);
    }

    function testFuzz_monotonicInLevel(uint8 lowLevel, uint128 r, uint128 other) public pure {
        lowLevel = uint8(bound(lowLevel, 1, 9));
        uint256 sum = uint256(r) + other + 1;
        uint16 lo = CombatMath.winProbBps(_params(), 0, lowLevel, r, 0, 3, other, sum, 10);
        uint16 hi = CombatMath.winProbBps(_params(), 0, lowLevel + 1, r, 0, 3, other, sum, 10);
        assertGe(hi, lo);
    }

    function testFuzz_monotonicInPool(uint128 a, uint128 b, uint128 other) public pure {
        uint128 lo = a < b ? a : b;
        uint128 hi = a < b ? b : a;
        uint256 sum = uint256(hi) + other + 1;
        uint16 pLo = CombatMath.winProbBps(_params(), 1, 2, lo, 1, 2, other, sum, 10);
        uint16 pHi = CombatMath.winProbBps(_params(), 1, 2, hi, 1, 2, other, sum, 10);
        assertGe(pHi, pLo);
    }

    function testFuzz_powWadNeverReverts(uint128 r, uint128 sum, uint8 n) public pure {
        CombatMath.poolFactorWad(r, sum, n, _params());
    }

    function test_elementCycle() public pure {
        assertEq(CombatMath.elementBps(0, 1, 11_500, 8700), 11_500);
        assertEq(CombatMath.elementBps(1, 0, 11_500, 8700), 8700);
        assertEq(CombatMath.elementBps(4, 0, 11_500, 8700), 11_500);
        assertEq(CombatMath.elementBps(0, 2, 11_500, 8700), 10_000);
        assertEq(CombatMath.elementBps(2, 2, 11_500, 8700), 10_000);
    }

    function test_levelThresholds() public pure {
        assertEq(CombatMath.levelFromXp(0), 1);
        assertEq(CombatMath.levelFromXp(14), 1);
        assertEq(CombatMath.levelFromXp(15), 2);
        assertEq(CombatMath.levelFromXp(35), 3);
        assertEq(CombatMath.levelFromXp(319), 9);
        assertEq(CombatMath.levelFromXp(320), 10);
        assertEq(CombatMath.levelFromXp(60_000), 10);
    }

    function testFuzz_pairingIsPermutationOfAliveSet(bytes32 seed, uint32 mask) public pure {
        uint8[] memory perm = CombatMath.pairing(seed, mask);
        uint256 pop;
        for (uint256 i = 0; i < 32; ++i) {
            if (uint256(mask) & (uint256(1) << i) != 0) ++pop;
        }
        assertEq(perm.length, pop);
        uint32 seen;
        for (uint256 i = 0; i < perm.length; ++i) {
            uint32 bit = uint32(1) << perm[i];
            assertTrue(mask & bit != 0);
            assertEq(seen & bit, 0);
            seen |= bit;
        }
        assertEq(seen, mask);
        uint8[] memory again = CombatMath.pairing(seed, mask);
        assertEq(keccak256(abi.encodePacked(perm)), keccak256(abi.encodePacked(again)));
    }

    function test_pairingDependsOnSeed() public pure {
        uint32 mask = type(uint32).max >> 2;
        uint256 differing;
        for (uint256 i = 0; i < 10; ++i) {
            uint8[] memory a = CombatMath.pairing(bytes32(i), mask);
            uint8[] memory b = CombatMath.pairing(bytes32(i + 1000), mask);
            if (keccak256(abi.encodePacked(a)) != keccak256(abi.encodePacked(b))) ++differing;
        }
        assertEq(differing, 10);
    }

    function test_clashRollUniformRange() public pure {
        for (uint256 i = 0; i < 200; ++i) {
            assertLt(CombatMath.clashRoll(bytes32(i), i), 10_000);
            assertLt(CombatMath.huntRoll(bytes32(i), i), 100);
        }
    }
}
