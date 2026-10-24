// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {IArena} from "../src/IArena.sol";

library Presets {
    function demo() internal pure returns (IArena.RoundConfig memory c) {
        c.maxCoins = 30;
        c.minCoins = 8;
        c.lobbySeconds = 120;
        c.levelingEpochs = 3;
        c.epochSeconds = 20;
        c.clashesPerEpoch = 6;
        c.seedTimeoutSeconds = 60;
        c.maxRoundSeconds = 3600;
        c.launchFee = 1 ether;
        c.minSeed = 2 ether;
        c.maxSeed = 50 ether;
        c.tradeFeeBps = 100;
        c.boostBps = 5000;
        c.consolationBps = 3000;
        c.potBps = 1500;
        c.treasuryBps = 500;
        c.consolationMode = 0;
        c.gammaBps = 8800;
        c.poolFactorMinBps = 1000;
        c.poolFactorMaxBps = 100_000;
        c.levelBonusBps = 400;
        c.elementUpBps = 11_500;
        c.elementDownBps = 8700;
        c.winProbMinBps = 1500;
        c.winProbMaxBps = 8500;
        c.huntWinPct = 50;
        c.keeperBounty = 0.2 ether;
        c.maxEntropyFee = 1 ether;
        c.vMon0 = 20 ether;
        c.vTok0 = 1_000_000_000 ether;
    }

    function lite() internal pure returns (IArena.RoundConfig memory c) {
        c = demo();
        c.minCoins = 5;
        c.maxCoins = 6;
        c.clashesPerEpoch = 3;
        c.lobbySeconds = 3600;
        c.epochSeconds = 30;
        c.launchFee = 0.1 ether;
        c.minSeed = 0.2 ether;
        c.maxSeed = 5 ether;
        c.keeperBounty = 0.02 ether;
        c.maxEntropyFee = 0.2 ether;
    }

    /// @dev Two-minute demo: the lobby starts the moment six coins are in, one leveling epoch, short epochs.
    function blitz() internal pure returns (IArena.RoundConfig memory c) {
        c = lite();
        c.minCoins = 6;
        c.maxCoins = 6;
        c.lobbySeconds = 10_800;
        c.levelingEpochs = 1;
        c.epochSeconds = 14;
        c.clashesPerEpoch = 2;
        c.minSeed = 0.1 ether;
        c.maxSeed = 0.1 ether;
    }

    function standard() internal pure returns (IArena.RoundConfig memory c) {
        c = demo();
        c.minCoins = 12;
        c.lobbySeconds = 900;
        c.levelingEpochs = 10;
        c.epochSeconds = 60;
        c.clashesPerEpoch = 4;
        c.maxRoundSeconds = 86_400;
        c.launchFee = 5 ether;
        c.minSeed = 10 ether;
        c.maxSeed = 500 ether;
        c.keeperBounty = 1 ether;
        c.maxEntropyFee = 10 ether;
    }
}
