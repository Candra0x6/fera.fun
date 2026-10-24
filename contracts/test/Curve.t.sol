// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Test} from "forge-std/Test.sol";
import {Vm} from "forge-std/Vm.sol";
import {Base} from "./Base.t.sol";
import {IArena} from "../src/IArena.sol";
import {CurveMath} from "../src/libs/CurveMath.sol";

contract CurveMathTest is Test {
    function testFuzz_buyThenSellNeverProfits(uint256 vMon, uint256 vTok, uint256 monIn) public pure {
        vMon = bound(vMon, 1 ether, 1e24);
        vTok = bound(vTok, 1e24, 1e30);
        monIn = bound(monIn, 1, vMon * 10);
        (uint256 out, uint256 newVTok) = CurveMath.buyOut(vMon, vTok, monIn);
        uint256 gross = CurveMath.sellGross(vMon + monIn, newVTok, out);
        assertLe(gross, monIn);
    }

    function testFuzz_buyRoundsInPoolFavour(uint256 vMon, uint256 vTok, uint256 monIn) public pure {
        vMon = bound(vMon, 1 ether, 1e24);
        vTok = bound(vTok, 1e24, 1e30);
        monIn = bound(monIn, 1, vMon * 10);
        (uint256 out, uint256 newVTok) = CurveMath.buyOut(vMon, vTok, monIn);
        assertGe((vMon + monIn) * newVTok, vMon * vTok);
        assertEq(vTok - newVTok, out);
    }

    function testFuzz_boostIdentity(uint256 vMon, uint256 vTok, uint256 x) public pure {
        vMon = bound(vMon, 1 ether, 1e24);
        vTok = bound(vTok, 1e24, 1e30);
        x = bound(x, 0, vMon * 5);
        uint256 k = vMon * vTok;
        uint256 newVTok = CurveMath.boostedVTok(vMon, vTok, x);
        assertEq(newVTok, CurveMath.ceilDiv(k, vMon + x));
        assertGe((vMon + x) * newVTok, k);
        assertLe(newVTok, vTok);
    }

    function testFuzz_sellingAllCirculatingNeverExceedsReserve(uint256 buyA, uint256 buyB, uint256 boostA, uint256 buyC)
        public
        pure
    {
        uint256 vMon0 = 20 ether;
        uint256 vTok0 = 1e27;
        uint256 vMon = vMon0;
        uint256 vTok = vTok0;
        uint256 circ;
        uint256[3] memory buys = [bound(buyA, 1, 100 ether), bound(buyB, 1, 100 ether), bound(buyC, 1, 100 ether)];
        for (uint256 i = 0; i < 3; ++i) {
            (uint256 out, uint256 nv) = CurveMath.buyOut(vMon, vTok, buys[i]);
            vMon += buys[i];
            vTok = nv;
            circ += out;
            if (i == 1) {
                uint256 x = bound(boostA, 0, vMon - vMon0);
                vTok = CurveMath.boostedVTok(vMon, vTok, x);
                vMon += x;
            }
        }
        uint256 rMon = vMon - vMon0;
        uint256 gross = CurveMath.sellGross(vMon, vTok, circ);
        assertLe(gross, rMon);
    }

    function test_feeRoundsUp() public pure {
        assertEq(CurveMath.feeOf(1, 100), 1);
        assertEq(CurveMath.feeOf(100, 100), 1);
        assertEq(CurveMath.feeOf(101, 100), 2);
        assertEq(CurveMath.feeOf(0, 100), 0);
    }
}

contract CurveArenaTest is Base {
    uint256[8] internal preT;
    uint256[8] internal vTokPre;

    function _setup(uint256 buyIn) internal returns (uint64 id) {
        id = newRound(demoConfig());
        launchMany(id, 8, 3 ether);
        startRound(id);
        for (uint256 e = 0; e < 3; ++e) {
            playEpoch(id, keccak256(abi.encode("w", e)));
        }
        address trader = makeAddr("trader");
        vm.deal(trader, 1000 ether);
        for (uint8 c = 0; c < 8; ++c) {
            vm.prank(trader);
            arena.buy{value: buyIn}(id, c, 1, uint64(block.timestamp + 100_000));
        }
    }

    function _check(uint64 id, Vm.Log memory log, uint256 t) internal view {
        uint8 c = uint8(uint256(log.topics[2]));
        (,, uint256 boostMon,, uint256 vMon, uint256 vTok,,,,) =
            abi.decode(log.data, (uint16, uint32, uint256, uint256, uint256, uint256, uint16, uint8, uint16, uint16));
        assertEq(arena.quoteSell(id, c, 1), 0);
        uint256 qT = arena.quoteSell(id, c, t);
        assertLe(qT, t * vMon / vTok);
        uint256 captured = qT > preT[c] ? qT - preT[c] : 0;
        assertLe(captured, 3 * boostMon * t / vTokPre[c] + 1);
    }

    function test_T1_oneWeiSellAfterBoost(bytes32 seed, uint256 t, uint256 buyIn) public {
        vm.assume(seed != bytes32(0));
        t = bound(t, 1, 1e12);
        uint64 id = _setup(bound(buyIn, 1 ether, 40 ether));
        for (uint8 c = 0; c < 8; ++c) {
            preT[c] = arena.quoteSell(id, c, t);
            vTokPre[c] = arena.coinOf(id, c).vTok;
        }
        lockAndSeed(id, seed);
        vm.recordLogs();
        resolve(id);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 boostedSig =
            keccak256("Boosted(uint64,uint16,uint32,uint8,uint256,uint256,uint256,uint256,uint16,uint8,uint16,uint16)");
        uint256 checked;
        for (uint256 i = 0; i < logs.length; ++i) {
            if (logs[i].topics[0] != boostedSig) continue;
            _check(id, logs[i], t);
            ++checked;
        }
        assertEq(checked, 4);
    }
}
