// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {Test} from "forge-std/Test.sol";
import {IArena} from "../src/IArena.sol";
import {Arena} from "../src/Arena.sol";
import {MonsterCoin} from "../src/MonsterCoin.sol";
import {MockSeedSource} from "../src/seed/MockSeedSource.sol";

contract ArenaHarness is Arena {
    constructor(address owner_, address coinImplementation_, uint256 reserveFloor_)
        Arena(owner_, coinImplementation_, reserveFloor_)
    {}

    function setCoinCountForTest(uint64 roundId, uint8 count) external {
        _rounds[roundId].coinCount = count;
    }

    function payForTest(address to, uint256 amount) external {
        _pay(to, amount);
    }

    struct LaunchArgs {
        address token;
        address creator;
        string name;
        string ticker;
        uint8 monsterType;
        uint8 skinId;
        uint256 seedMon;
        uint256 vMon;
        uint256 vTok;
        uint256 supply;
    }

    function emitCoinLaunchedForTest(uint64 roundId, uint8 coinId, LaunchArgs memory a) external {
        emit CoinLaunched(
            roundId,
            coinId,
            a.token,
            a.creator,
            a.name,
            a.ticker,
            a.monsterType,
            a.skinId,
            a.seedMon,
            a.vMon,
            a.vTok,
            a.supply
        );
    }

    struct BoostArgs {
        uint16 epoch;
        uint32 clashId;
        uint256 boostMon;
        uint256 rMon;
        uint256 vMon;
        uint256 vTok;
        uint16 wins;
        uint8 level;
        uint16 xpGained;
        uint16 xp;
    }

    function emitBoostedForTest(uint64 roundId, uint8 coinId, BoostArgs memory a) external {
        emit Boosted(
            roundId, a.epoch, a.clashId, coinId, a.boostMon, a.rMon, a.vMon, a.vTok, a.wins, a.level, a.xpGained, a.xp
        );
    }

    function emitHuntForTest(
        uint64 roundId,
        uint16 epoch,
        uint8 coinId,
        bool success,
        uint16 xpGained,
        uint16 xp,
        uint8 level
    ) external {
        emit HuntResolved(roundId, epoch, coinId, success, xpGained, xp, level);
    }

    function emitTreasurySpentForTest(uint64 roundId, TreasuryKind kind, uint256 amount, uint256 treasuryAfter)
        external
    {
        emit TreasurySpent(roundId, kind, amount, treasuryAfter);
    }

    function emitFeesSweptForTest(
        uint64 roundId,
        uint16 epoch,
        uint256 toPot,
        uint256 toTreasury,
        uint256 prizePotAfter,
        uint256 treasuryAfter
    ) external {
        emit FeesSwept(roundId, epoch, toPot, toTreasury, prizePotAfter, treasuryAfter);
    }

    function lockForTest(uint64 roundId, uint64 seedId) external {
        _rounds[roundId].locked = true;
        _rounds[roundId].entropySeq = seedId;
        _rounds[roundId].epoch = 1;
        _seedRound[seedId] = roundId;
    }

    function coinOf(uint64 roundId, uint8 coinId) external view returns (Coin memory) {
        return _coins[roundId][coinId];
    }

    function extraOf(uint64 roundId) external view returns (RoundExtra memory) {
        return _extra[roundId];
    }

    function liabilities(uint64 roundId) external view returns (uint256 total) {
        RoundView storage round = _rounds[roundId];
        total = uint256(round.treasury) + round.prizePot;
        for (uint8 i = 0; i < round.coinCount; ++i) {
            Coin storage c = _coins[roundId][i];
            total += uint256(c.rMon) + c.feeAcc;
            if (c.status == Status.Eliminated || c.status == Status.Refunded) {
                total += uint256(c.consolationPool) - c.poolPaid;
            }
        }
        if (round.phase == Phase.Settled) total += uint256(round.redeemPool) - _extra[roundId].redeemPaid;
    }

    function getArenaSnapshotCoin(uint64 roundId, uint8 coinId) external view returns (CoinView memory) {
        (, CoinView[] memory coins) = this.getArenaSnapshot(roundId);
        return coins[coinId];
    }

    function isActive(uint64 roundId) external view returns (bool) {
        Phase p = _rounds[roundId].phase;
        return p == Phase.Leveling || p == Phase.Knockout;
    }

    function allLiabilities() external view returns (uint256 total) {
        uint64 last = this.currentRoundId();
        for (uint64 r = 1; r <= last; ++r) {
            total += this.liabilities(r);
        }
    }

    function setPhaseForTest(uint64 roundId, Phase phase) external {
        _rounds[roundId].phase = phase;
    }
}

abstract contract Base is Test {
    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal keeper = makeAddr("keeper");

    MonsterCoin internal coinImpl;
    ArenaHarness internal arena;
    MockSeedSource internal seeds;

    uint256 internal constant FLOOR = 10 ether;
    uint256 internal constant SEED_FEE = 0.1 ether;

    function setUp() public virtual {
        coinImpl = new MonsterCoin();
        arena = new ArenaHarness(owner, address(coinImpl), FLOOR);
        seeds = new MockSeedSource(address(arena), SEED_FEE);
        vm.prank(owner);
        arena.setSeedSource(address(seeds));
    }

    function creatorOf(uint256 i) internal pure returns (address) {
        return address(uint160(0xC0DE0000 + i));
    }

    function newRound(IArena.RoundConfig memory cfg) internal returns (uint64 roundId) {
        vm.prank(owner);
        roundId = arena.createRound(cfg);
        vm.deal(address(this), address(this).balance + FLOOR);
        arena.fundTreasury{value: FLOOR}(roundId);
    }

    function launch(uint64 roundId, uint256 i, uint256 seed) internal returns (uint8 coinId) {
        address who = creatorOf(i);
        IArena.RoundConfig memory cfg = arena.getConfig(roundId);
        vm.deal(who, who.balance + seed + cfg.launchFee);
        string memory ticker = string.concat("C", vm.toString(i % 10), vm.toString((i / 10) % 10));
        vm.prank(who);
        coinId = arena.launchCoin{value: seed + cfg.launchFee}(roundId, "Coin", ticker, uint8(i % 5), uint8(i % 5));
    }

    function launchMany(uint64 roundId, uint256 n, uint256 seed) internal {
        for (uint256 i = 0; i < n; ++i) {
            launch(roundId, i, seed);
        }
    }

    function startRound(uint64 roundId) internal {
        IArena.RoundView memory r = arena.getRound(roundId);
        IArena.RoundConfig memory cfg = arena.getConfig(roundId);
        if (r.coinCount < cfg.maxCoins) vm.warp(uint256(r.createdAt) + cfg.lobbySeconds);
        arena.startRound(roundId);
    }

    function lockAndSeed(uint64 roundId, bytes32 seed) internal {
        IArena.RoundConfig memory cfg = arena.getConfig(roundId);
        IArena.RoundView memory r = arena.getRound(roundId);
        uint256 readyAt = uint256(r.lastEpochResolvedAt) + cfg.epochSeconds;
        if (block.timestamp < readyAt) vm.warp(readyAt);
        arena.lockEpoch(roundId);
        seeds.deliver(arena.getRound(roundId).entropySeq, seed);
    }

    function resolve(uint64 roundId) internal {
        vm.prank(keeper);
        arena.resolveEpoch(roundId, 255);
    }

    function playEpoch(uint64 roundId, bytes32 seed) internal {
        lockAndSeed(roundId, seed);
        resolve(roundId);
    }

    function playToEnd(uint64 roundId, uint256 baseSeed) internal returns (uint256 epochs) {
        while (arena.getRound(roundId).phase != IArena.Phase.Settled) {
            playEpoch(roundId, keccak256(abi.encode(baseSeed, epochs)));
            ++epochs;
            require(epochs < 200, "no settle");
        }
    }

    function demoConfig() internal pure returns (IArena.RoundConfig memory c) {
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
}
