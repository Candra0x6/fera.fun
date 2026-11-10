// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {CurveMath} from "monad/libs/CurveMath.sol";

contract CurveHarness {
    error BadSeed();

    function ceilDiv(uint256 a, uint256 b) external pure returns (uint256) {
        return CurveMath.ceilDiv(a, b);
    }

    function feeOf(uint256 amount, uint256 feeBps) external pure returns (uint256) {
        return CurveMath.feeOf(amount, feeBps);
    }

    function buyOut(uint256 vMon, uint256 vTok, uint256 monInNet) external pure returns (uint256, uint256) {
        return CurveMath.buyOut(vMon, vTok, monInNet);
    }

    function sellGross(uint256 vMon, uint256 vTok, uint256 tokens) external pure returns (uint256) {
        return CurveMath.sellGross(vMon, vTok, tokens);
    }

    function boostedVTok(uint256 vMon, uint256 vTok, uint256 boostMon) external pure returns (uint256) {
        return CurveMath.boostedVTok(vMon, vTok, boostMon);
    }

    function splitLoss(uint256 r, uint256 boostBps, uint256 consolationBps, uint256 potBps)
        external
        pure
        returns (uint256 boost, uint256 consolation, uint256 toPot, uint256 toTreasury)
    {
        boost = r * boostBps / CurveMath.BPS;
        consolation = r * consolationBps / CurveMath.BPS;
        toPot = r * potBps / CurveMath.BPS;
        toTreasury = r - boost - consolation - toPot;
    }

    function quoteBuy(uint256 vMon, uint256 vTok, uint256 monIn, uint256 feeBps)
        external
        pure
        returns (uint256 fee, uint256 net, uint256 tokensOut, uint256 newVTok)
    {
        fee = CurveMath.feeOf(monIn, feeBps);
        net = monIn - fee;
        (tokensOut, newVTok) = CurveMath.buyOut(vMon, vTok, net);
    }

    function quoteSell(uint256 vMon, uint256 vTok, uint256 tokens, uint256 feeBps)
        external
        pure
        returns (uint256 gross, uint256 fee, uint256 monOut)
    {
        gross = CurveMath.sellGross(vMon, vTok, tokens);
        fee = CurveMath.feeOf(gross, feeBps);
        monOut = gross - fee;
    }

    function launchSeed(uint256 vMon0, uint256 vTok0, uint256 seed)
        external
        pure
        returns (uint256 tokens, uint256 vTok, uint256 vMon)
    {
        (tokens, vTok) = CurveMath.buyOut(vMon0, vTok0, seed);
        if (tokens == 0) revert BadSeed();
        vMon = vMon0 + seed;
    }
}
