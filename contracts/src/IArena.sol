// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

interface IArena {
    enum Phase {
        None,
        Lobby,
        Leveling,
        Knockout,
        Settled,
        Aborted
    }

    enum Status {
        None,
        Alive,
        Eliminated,
        Champion,
        Refunded
    }

    enum TreasuryKind {
        SeedFee,
        KeeperBounty,
        Other
    }

    struct RoundConfig {
        uint8 maxCoins;
        uint8 minCoins;
        uint32 lobbySeconds;
        uint8 levelingEpochs;
        uint32 epochSeconds;
        uint8 clashesPerEpoch;
        uint32 seedTimeoutSeconds;
        uint32 maxRoundSeconds;
        uint128 launchFee;
        uint128 minSeed;
        uint128 maxSeed;
        uint16 tradeFeeBps;
        uint16 boostBps;
        uint16 consolationBps;
        uint16 potBps;
        uint16 treasuryBps;
        uint8 consolationMode;
        uint16 gammaBps;
        uint16 poolFactorMinBps;
        uint32 poolFactorMaxBps;
        uint16 levelBonusBps;
        uint16 elementUpBps;
        uint16 elementDownBps;
        uint16 winProbMinBps;
        uint16 winProbMaxBps;
        uint8 huntWinPct;
        uint128 keeperBounty;
        uint128 maxEntropyFee;
        uint128 vMon0;
        uint128 vTok0;
    }

    struct RoundView {
        Phase phase;
        bool locked;
        uint16 epoch;
        uint8 coinCount;
        uint8 aliveCount;
        uint8 cancelStreak;
        uint8 winnerCoinId;
        uint40 createdAt;
        uint40 startedAt;
        uint40 lockedAt;
        uint40 lastEpochResolvedAt;
        uint64 entropySeq;
        bytes32 seed;
        uint128 prizePot;
        uint128 treasury;
        uint128 redeemPool;
        uint128 redeemSupply;
        uint32 clashesPlayed;
    }

    struct CoinView {
        address token;
        address creator;
        uint8 monsterType;
        uint8 skinId;
        Status status;
        uint8 level;
        uint16 xp;
        uint16 wins;
        uint128 vMon;
        uint128 vTok;
        uint128 rMon;
        uint128 rMonAtLock;
        uint128 seedMon;
        uint128 consolationPool;
        uint128 consolationSupply;
        uint256 supply;
        string name;
        string ticker;
    }

    event RoundCreated(uint64 indexed roundId, RoundConfig config);
    event CoinImage(uint64 indexed roundId, uint8 indexed coinId, string imageUri);

    event CoinLaunched(
        uint64 indexed roundId,
        uint8 indexed coinId,
        address token,
        address indexed creator,
        string name,
        string ticker,
        uint8 monsterType,
        uint8 skinId,
        uint256 seedMon,
        uint256 vMon,
        uint256 vTok,
        uint256 supply
    );
    event RoundStarted(uint64 indexed roundId, uint40 startedAt, uint8 coins);
    event Trade(
        uint64 indexed roundId,
        uint8 indexed coinId,
        address indexed trader,
        bool isBuy,
        uint256 monAmount,
        uint256 tokenAmount,
        uint256 rMon,
        uint256 vMon,
        uint256 vTok
    );
    event EpochLocked(uint64 indexed roundId, uint16 epoch, uint64 entropySeq, uint32 aliveMask, uint40 lockedAt);
    event SeedReady(uint64 indexed roundId, uint16 epoch, bytes32 seed);
    event ClashResolved(
        uint64 indexed roundId,
        uint16 epoch,
        uint32 clashId,
        uint8 winner,
        uint8 loser,
        uint16 winProbBps,
        uint16 roll,
        uint256 boost,
        uint256 consolation,
        uint256 toPot,
        uint256 toTreasury
    );
    event Boosted(
        uint64 indexed roundId,
        uint16 epoch,
        uint32 clashId,
        uint8 indexed coinId,
        uint256 boostMon,
        uint256 rMon,
        uint256 vMon,
        uint256 vTok,
        uint16 wins,
        uint8 level,
        uint16 xpGained,
        uint16 xp
    );
    event CoinEliminated(
        uint64 indexed roundId, uint8 indexed coinId, uint256 consolationPool, uint256 consolationSupply
    );
    event ByeGranted(uint64 indexed roundId, uint16 epoch, uint8 indexed coinId);
    event HuntResolved(
        uint64 indexed roundId,
        uint16 epoch,
        uint8 indexed coinId,
        bool success,
        uint16 xpGained,
        uint16 xp,
        uint8 level
    );
    event LevelUp(uint64 indexed roundId, uint8 indexed coinId, uint8 level);
    event EpochResolved(uint64 indexed roundId, uint16 epoch, uint8 aliveCount);
    event EpochCancelled(uint64 indexed roundId, uint16 epoch);
    event RoundSettled(uint64 indexed roundId, uint8 indexed winnerCoinId, uint256 redeemPool, uint256 redeemSupply);
    event RoundAborted(uint64 indexed roundId, uint8 reason);
    event ConsolationClaimed(
        uint64 indexed roundId, uint8 indexed coinId, address indexed holder, uint256 tokens, uint256 monPaid
    );
    event Redeemed(uint64 indexed roundId, address indexed holder, uint256 tokens, uint256 monPaid);
    event RefundClaimed(
        uint64 indexed roundId, uint8 indexed coinId, address indexed holder, uint256 tokens, uint256 monPaid
    );
    event SeedClaimed(
        uint64 indexed roundId, uint8 indexed coinId, address indexed creator, uint256 tokens, uint256 monPaid
    );
    event CoinRefundRate(uint64 indexed roundId, uint8 indexed coinId, uint256 refundPool, uint256 refundSupply);
    event TreasuryFunded(uint64 indexed roundId, address indexed funder, uint256 amount);
    event TreasurySpent(uint64 indexed roundId, TreasuryKind kind, uint256 amount, uint256 treasuryAfter);
    event FeesSwept(
        uint64 indexed roundId,
        uint16 epoch,
        uint256 toPot,
        uint256 toTreasury,
        uint256 prizePotAfter,
        uint256 treasuryAfter
    );

    function createRound(RoundConfig calldata config) external returns (uint64 roundId);
    function launchCoin(uint64 roundId, string calldata name, string calldata ticker, uint8 monsterType, uint8 skinId)
        external
        payable
        returns (uint8 coinId);
    function refundLaunch(uint64 roundId, uint8 coinId) external;
    function startRound(uint64 roundId) external;
    function buy(uint64 roundId, uint8 coinId, uint256 minTokensOut, uint64 deadline)
        external
        payable
        returns (uint256 tokensOut);
    function sell(uint64 roundId, uint8 coinId, uint256 tokens, uint256 minMonOut, uint64 deadline)
        external
        returns (uint256 monOut);
    function lockEpoch(uint64 roundId) external;
    function onSeed(uint64 seedId, bytes32 seed) external;
    function resolveEpoch(uint64 roundId, uint8 maxClashes) external;
    function cancelEpoch(uint64 roundId) external;
    function abortRound(uint64 roundId) external;
    function claimRefund(uint64 roundId, uint8 coinId, uint256 tokens) external returns (uint256 monPaid);
    function claimConsolation(uint64 roundId, uint8 coinId, uint256 tokens) external returns (uint256 monPaid);
    function redeem(uint64 roundId, uint256 tokens) external returns (uint256 monPaid);
    function claimSeed(uint64 roundId, uint8 coinId) external returns (uint256 monPaid);
    function fundTreasury(uint64 roundId) external payable;
    function setSeedSource(address source) external;

    function getConfig(uint64 roundId) external view returns (RoundConfig memory);
    function getRound(uint64 roundId) external view returns (RoundView memory);
    function getArenaSnapshot(uint64 roundId) external view returns (RoundView memory round, CoinView[] memory coins);
    function quoteBuy(uint64 roundId, uint8 coinId, uint256 monIn) external view returns (uint256 tokensOut);
    function quoteSell(uint64 roundId, uint8 coinId, uint256 tokens) external view returns (uint256 monOut);
    function pendingConsolation(uint64 roundId, uint8 coinId, address holder) external view returns (uint256 monOwed);
    function pendingRedeem(uint64 roundId, address holder) external view returns (uint256 monOwed);
    function currentRoundId() external view returns (uint64);
}
