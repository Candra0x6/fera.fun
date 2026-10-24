// SPDX-License-Identifier: MIT
pragma solidity 0.8.31;

import {IArena} from "./IArena.sol";
import {MonsterCoin} from "./MonsterCoin.sol";
import {ISeedSource} from "./seed/ISeedSource.sol";
import {CurveMath} from "./libs/CurveMath.sol";
import {CombatMath} from "./libs/CombatMath.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

contract Arena is IArena, ReentrancyGuardTransient {
    using SafeCast for uint256;

    error NotOwner();
    error ZeroAddress();
    error NotSeedSource();
    error NoSeedSource();
    error RoundInProgress();
    error UnknownRound();
    error RoundNotFundable();
    error BadSplit();
    error BadCoinLimits();
    error NoDefaultConfig();
    error BadImage();
    error BadTiming();
    error BadSeedBounds();
    error BadFee();
    error BadCombatParams();
    error BadCurveParams();
    error LobbyStillOpen();
    error LobbyFilled();
    error ReserveFloorBreached();
    error ReserveNotFunded();
    error PayFailed();
    error WrongPhase();
    error RoundFull();
    error BadCatalogId();
    error BadName();
    error BadTicker();
    error CreatorCapReached();
    error BadSeed();
    error Expired();
    error MinOutRequired();
    error Locked();
    error NotLocked();
    error CoinNotAlive();
    error ZeroOut();
    error Slippage();
    error Insolvent();
    error LobbyNotReady();
    error TreasuryTooLow();
    error SeedNotReady();
    error ZeroMaxClashes();
    error EpochTooEarly();
    error TimeoutNotElapsed();
    error SeedArrived();
    error CancelCapReached();
    error AbortNotOpen();
    error NotClaimable();
    error NotCreator();
    error NothingToClaim();
    error SeedAlreadyClaimed();
    error NotRefundable();

    uint8 internal constant ABORT_LOBBY_UNDERFILLED = 1;
    uint8 internal constant ABORT_CANCEL_STREAK = 2;
    uint8 internal constant ABORT_MAX_ROUND_TIME = 3;
    uint256 internal constant MAX_IMAGE_BYTES = 16_384;
    uint8 internal constant MONSTER_TYPES = 5;
    uint8 internal constant SKIN_TYPES = 5;
    uint8 internal constant MAX_CANCELS = 3;
    uint256 internal constant FEE_TO_POT_BPS = 5000;
    uint256 internal constant BPS = 10_000;
    uint256 internal constant BOUNTY_GAS = 100_000;

    struct Coin {
        address token;
        uint8 monsterType;
        uint8 skinId;
        Status status;
        uint8 level;
        uint16 xp;
        uint16 wins;
        bool seedClaimed;
        address creator;
        uint128 vMon;
        uint128 vTok;
        uint128 rMon;
        uint128 rMonAtLock;
        uint128 seedMon;
        uint128 seedTokens;
        uint128 consolationPool;
        uint128 consolationSupply;
        uint128 poolPaid;
        uint128 feeAcc;
    }

    struct RoundExtra {
        uint32 aliveMask;
        uint8 aliveAtLock;
        uint8 resolveCursor;
        bool lobbyAbort;
        uint128 sumRMonAtLock;
        uint128 redeemPaid;
        uint128 launchFeesOwed;
    }

    struct LaunchEvent {
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

    struct ClashEvent {
        uint16 epoch;
        uint32 clashId;
        uint8 winner;
        uint8 loser;
        uint16 winProbBps;
        uint16 roll;
        uint256 boost;
        uint256 consolation;
        uint256 toPot;
        uint256 toTreasury;
    }

    address public immutable owner;
    address public immutable coinImplementation;
    uint256 public immutable reserveFloor;
    address public seedSource;

    uint64 private _currentRoundId;
    mapping(uint64 roundId => RoundConfig) private _configs;
    RoundConfig internal _defaultConfig;
    bool public defaultConfigSet;
    mapping(uint64 roundId => RoundView) internal _rounds;
    mapping(uint64 roundId => RoundExtra) internal _extra;
    mapping(uint64 roundId => mapping(uint8 coinId => Coin)) internal _coins;
    mapping(uint64 roundId => mapping(address creator => uint8 count)) internal _creatorCoins;
    mapping(uint64 seedId => uint64 roundId) internal _seedRound;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address owner_, address coinImplementation_, uint256 reserveFloor_) {
        if (owner_ == address(0) || coinImplementation_ == address(0)) revert ZeroAddress();
        owner = owner_;
        coinImplementation = coinImplementation_;
        reserveFloor = reserveFloor_;
    }

    function createRound(RoundConfig calldata config) external onlyOwner returns (uint64 roundId) {
        roundId = _openRound(config);
    }

    function setDefaultConfig(RoundConfig calldata config) external onlyOwner {
        _validate(config);
        _defaultConfig = config;
        defaultConfigSet = true;
    }

    function createDefaultRound() external payable returns (uint64 roundId) {
        if (!defaultConfigSet) revert NoDefaultConfig();
        roundId = _openRound(_defaultConfig);
        if (msg.value != 0) {
            _rounds[roundId].treasury += msg.value.toUint128();
            emit TreasuryFunded(roundId, msg.sender, msg.value);
        }
    }

    function getDefaultConfig() external view returns (RoundConfig memory) {
        return _defaultConfig;
    }

    function _openRound(RoundConfig memory config) private returns (uint64 roundId) {
        if (!_betweenRounds()) revert RoundInProgress();
        _validate(config);
        uint64 previous = _currentRoundId;
        roundId = previous + 1;
        _currentRoundId = roundId;
        _configs[roundId] = config;
        RoundView storage round = _rounds[roundId];
        round.phase = Phase.Lobby;
        round.createdAt = block.timestamp.toUint40();
        emit RoundCreated(roundId, config);
        if (previous != 0) {
            RoundView storage prev = _rounds[previous];
            uint256 carry = uint256(prev.treasury) - _extra[previous].launchFeesOwed;
            if (carry != 0) {
                prev.treasury -= carry.toUint128();
                round.treasury = carry.toUint128();
                emit TreasuryFunded(roundId, address(this), carry);
            }
        }
    }

    function launchCoin(uint64 roundId, string calldata name, string calldata ticker, uint8 monsterType, uint8 skinId)
        external
        payable
        nonReentrant
        returns (uint8 coinId)
    {
        coinId = _launch(roundId, name, ticker, monsterType, skinId);
    }

    function launchCoinWithImage(
        uint64 roundId,
        string calldata name,
        string calldata ticker,
        uint8 monsterType,
        uint8 skinId,
        string calldata imageUri
    ) external payable nonReentrant returns (uint8 coinId) {
        _checkImage(bytes(imageUri));
        coinId = _launch(roundId, name, ticker, monsterType, skinId);
        emit CoinImage(roundId, coinId, imageUri);
    }

    function _checkImage(bytes calldata uri) private pure {
        if (uri.length == 0 || uri.length > MAX_IMAGE_BYTES) revert BadImage();
        if (!_hasPrefix(uri, "data:image/") && !_hasPrefix(uri, "ipfs://") && !_hasPrefix(uri, "https://")) {
            revert BadImage();
        }
    }

    function _hasPrefix(bytes calldata data, bytes memory prefix) private pure returns (bool) {
        if (data.length < prefix.length) return false;
        for (uint256 i = 0; i < prefix.length; ++i) {
            if (data[i] != prefix[i]) return false;
        }
        return true;
    }

    function _launch(uint64 roundId, string calldata name, string calldata ticker, uint8 monsterType, uint8 skinId)
        private
        returns (uint8 coinId)
    {
        RoundView storage round = _rounds[roundId];
        uint256 seed = _checkLaunch(roundId, round, name, ticker, monsterType, skinId);
        coinId = round.coinCount;
        round.coinCount = coinId + 1;
        round.aliveCount = coinId + 1;
        round.treasury += (msg.value - seed).toUint128();
        _creatorCoins[roundId][msg.sender] += 1;
        LaunchEvent memory e = _createCoin(roundId, coinId, seed, monsterType, skinId);
        e.name = name;
        e.ticker = ticker;
        MonsterCoin(e.token).initialize(address(this), name, ticker);
        MonsterCoin(e.token).mint(address(this), e.supply);
        _emitLaunched(roundId, coinId, e);
    }

    function _checkLaunch(
        uint64 roundId,
        RoundView storage round,
        string calldata name,
        string calldata ticker,
        uint8 monsterType,
        uint8 skinId
    ) private view returns (uint256 seed) {
        if (round.phase != Phase.Lobby) revert WrongPhase();
        RoundConfig storage cfg = _configs[roundId];
        uint8 coinId = round.coinCount;
        if (coinId >= cfg.maxCoins) revert RoundFull();
        if (monsterType >= MONSTER_TYPES || skinId >= SKIN_TYPES) revert BadCatalogId();
        _checkName(bytes(name));
        _checkTicker(bytes(ticker));
        if (_creatorCoins[roundId][msg.sender] >= 2) revert CreatorCapReached();
        uint256 launchFee = cfg.launchFee;
        if (msg.value < launchFee) revert BadSeed();
        seed = msg.value - launchFee;
        if (seed < cfg.minSeed || seed > cfg.maxSeed) revert BadSeed();
        if (round.treasury < reserveFloor + uint256(coinId) * launchFee) revert ReserveNotFunded();
    }

    function _createCoin(uint64 roundId, uint8 coinId, uint256 seed, uint8 monsterType, uint8 skinId)
        private
        returns (LaunchEvent memory e)
    {
        RoundConfig storage cfg = _configs[roundId];
        Coin storage c = _coins[roundId][coinId];
        (uint256 tokens, uint256 vTok) = CurveMath.buyOut(cfg.vMon0, cfg.vTok0, seed);
        if (tokens == 0) revert BadSeed();
        uint256 vMon = uint256(cfg.vMon0) + seed;
        address token = Clones.clone(coinImplementation);
        c.token = token;
        c.creator = msg.sender;
        c.monsterType = monsterType;
        c.skinId = skinId;
        c.status = Status.Alive;
        c.level = 1;
        c.vMon = vMon.toUint128();
        c.vTok = vTok.toUint128();
        c.rMon = seed.toUint128();
        c.seedMon = seed.toUint128();
        c.seedTokens = tokens.toUint128();
        e.token = token;
        e.creator = msg.sender;
        e.monsterType = monsterType;
        e.skinId = skinId;
        e.seedMon = seed;
        e.vMon = vMon;
        e.vTok = vTok;
        e.supply = tokens;
    }

    function refundLaunch(uint64 roundId, uint8 coinId) external nonReentrant {
        RoundView storage round = _rounds[roundId];
        RoundExtra storage x = _extra[roundId];
        if (round.phase != Phase.Aborted || !x.lobbyAbort) revert NotRefundable();
        Coin storage c = _coins[roundId][coinId];
        if (coinId >= round.coinCount || c.status != Status.Alive) revert NotRefundable();
        if (msg.sender != c.creator) revert NotCreator();
        uint256 launchFee = _configs[roundId].launchFee;
        uint256 seed = c.rMon;
        uint256 tokens = c.seedTokens;
        c.status = Status.Refunded;
        c.rMon = 0;
        c.seedClaimed = true;
        round.treasury -= launchFee.toUint128();
        x.launchFeesOwed -= launchFee.toUint128();
        round.aliveCount -= 1;
        MonsterCoin(c.token).burn(address(this), tokens);
        uint256 paid = seed + launchFee;
        _pay(msg.sender, paid);
        emit RefundClaimed(roundId, coinId, msg.sender, tokens, paid);
        emit TreasurySpent(roundId, TreasuryKind.Other, launchFee, round.treasury);
    }

    function startRound(uint64 roundId) external {
        RoundView storage round = _rounds[roundId];
        if (round.phase != Phase.Lobby) revert WrongPhase();
        RoundConfig storage cfg = _configs[roundId];
        uint8 count = round.coinCount;
        bool full = count >= cfg.maxCoins;
        bool deadline = block.timestamp >= uint256(round.createdAt) + cfg.lobbySeconds && count >= cfg.minCoins;
        if (!full && !deadline) revert LobbyNotReady();
        uint256 planned = uint256(cfg.levelingEpochs) + _knockoutEpochs(count, cfg.clashesPerEpoch);
        if (round.treasury < reserveFloor + planned * cfg.maxEntropyFee) revert TreasuryTooLow();
        round.phase = cfg.levelingEpochs > 0 ? Phase.Leveling : Phase.Knockout;
        round.startedAt = block.timestamp.toUint40();
        round.lastEpochResolvedAt = round.startedAt;
        round.aliveCount = count;
        emit RoundStarted(roundId, round.startedAt, count);
    }

    function buy(uint64 roundId, uint8 coinId, uint256 minTokensOut, uint64 deadline)
        external
        payable
        nonReentrant
        returns (uint256 tokensOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (minTokensOut == 0) revert MinOutRequired();
        Coin storage c = _tradable(roundId, coinId);
        uint256 fee = CurveMath.feeOf(msg.value, _configs[roundId].tradeFeeBps);
        uint256 net = msg.value - fee;
        uint256 vTok;
        (tokensOut, vTok) = CurveMath.buyOut(c.vMon, c.vTok, net);
        if (tokensOut == 0) revert ZeroOut();
        if (tokensOut < minTokensOut) revert Slippage();
        c.vMon += net.toUint128();
        c.vTok = vTok.toUint128();
        c.rMon += net.toUint128();
        c.feeAcc += fee.toUint128();
        MonsterCoin(c.token).mint(msg.sender, tokensOut);
        emit Trade(roundId, coinId, msg.sender, true, msg.value, tokensOut, c.rMon, c.vMon, c.vTok);
    }

    function sell(uint64 roundId, uint8 coinId, uint256 tokens, uint256 minMonOut, uint64 deadline)
        external
        nonReentrant
        returns (uint256 monOut)
    {
        if (block.timestamp > deadline) revert Expired();
        if (minMonOut == 0) revert MinOutRequired();
        Coin storage c = _tradable(roundId, coinId);
        uint256 gross = CurveMath.sellGross(c.vMon, c.vTok, tokens);
        if (gross > c.rMon) revert Insolvent();
        uint256 fee = CurveMath.feeOf(gross, _configs[roundId].tradeFeeBps);
        monOut = gross - fee;
        if (monOut < minMonOut) revert Slippage();
        MonsterCoin(c.token).burn(msg.sender, tokens);
        c.vMon -= gross.toUint128();
        c.vTok += tokens.toUint128();
        c.rMon -= gross.toUint128();
        c.feeAcc += fee.toUint128();
        emit Trade(roundId, coinId, msg.sender, false, monOut, tokens, c.rMon, c.vMon, c.vTok);
        _pay(msg.sender, monOut);
    }

    function lockEpoch(uint64 roundId) external nonReentrant {
        RoundView storage round = _rounds[roundId];
        Phase phase = round.phase;
        if (phase != Phase.Leveling && phase != Phase.Knockout) revert WrongPhase();
        if (round.locked) revert Locked();
        RoundConfig storage cfg = _configs[roundId];
        if (block.timestamp < uint256(round.lastEpochResolvedAt) + cfg.epochSeconds) revert EpochTooEarly();
        address source = seedSource;
        if (source == address(0)) revert NoSeedSource();
        uint256 fee = ISeedSource(source).fee();
        if (fee > cfg.maxEntropyFee || fee > _spendable(round.treasury)) revert TreasuryTooLow();

        round.treasury -= fee.toUint128();
        round.locked = true;
        round.seed = bytes32(0);
        round.epoch += 1;
        round.lockedAt = block.timestamp.toUint40();
        uint32 mask = _snapshotAtLock(roundId, round.coinCount);
        emit TreasurySpent(roundId, TreasuryKind.SeedFee, fee, round.treasury);

        uint64 id = ISeedSource(source).requestSeed{value: fee}();
        round.entropySeq = id;
        _seedRound[id] = roundId;
        emit EpochLocked(roundId, round.epoch, id, mask, round.lockedAt);
    }

    function onSeed(uint64 seedId, bytes32 seed) external {
        if (msg.sender != seedSource) revert NotSeedSource();
        uint64 roundId = _seedRound[seedId];
        if (roundId == 0) return;
        RoundView storage round = _rounds[roundId];
        if (!round.locked || round.entropySeq != seedId || round.seed != bytes32(0) || seed == bytes32(0)) return;
        round.seed = seed;
        emit SeedReady(roundId, round.epoch, seed);
    }

    function resolveEpoch(uint64 roundId, uint8 maxClashes) external nonReentrant {
        RoundView storage round = _rounds[roundId];
        if (!round.locked) revert NotLocked();
        bytes32 seed = round.seed;
        if (seed == bytes32(0)) revert SeedNotReady();
        if (maxClashes == 0) revert ZeroMaxClashes();
        RoundConfig memory cfg = _configs[roundId];
        if (round.phase == Phase.Knockout) {
            if (!_runClashes(roundId, cfg, seed, maxClashes)) return;
        }
        _finishEpoch(roundId, cfg, seed);
    }

    function cancelEpoch(uint64 roundId) external nonReentrant {
        RoundView storage round = _rounds[roundId];
        if (!round.locked) revert NotLocked();
        if (round.seed != bytes32(0)) revert SeedArrived();
        if (block.timestamp < uint256(round.lockedAt) + _configs[roundId].seedTimeoutSeconds) {
            revert TimeoutNotElapsed();
        }
        if (round.cancelStreak >= MAX_CANCELS) revert CancelCapReached();
        uint16 epoch = round.epoch;
        round.locked = false;
        round.cancelStreak += 1;
        round.epoch = epoch - 1;
        round.lastEpochResolvedAt = block.timestamp.toUint40();
        _extra[roundId].aliveMask = 0;
        emit EpochCancelled(roundId, epoch);
    }

    function abortRound(uint64 roundId) external nonReentrant {
        RoundView storage round = _rounds[roundId];
        Phase phase = round.phase;
        if (phase == Phase.None) revert UnknownRound();
        RoundConfig storage config = _configs[roundId];
        if (phase == Phase.Lobby) {
            if (block.timestamp < uint256(round.createdAt) + config.lobbySeconds) revert LobbyStillOpen();
            if (round.coinCount >= config.minCoins) revert LobbyFilled();
            round.phase = Phase.Aborted;
            RoundExtra storage lx = _extra[roundId];
            lx.lobbyAbort = true;
            lx.launchFeesOwed = (uint256(round.coinCount) * config.launchFee).toUint128();
            emit RoundAborted(roundId, ABORT_LOBBY_UNDERFILLED);
            return;
        }
        if (phase != Phase.Leveling && phase != Phase.Knockout) revert WrongPhase();
        uint8 reason = 0;
        if (round.cancelStreak >= MAX_CANCELS) {
            reason = ABORT_CANCEL_STREAK;
        } else if (block.timestamp >= uint256(round.startedAt) + config.maxRoundSeconds) {
            reason = ABORT_MAX_ROUND_TIME;
        } else {
            revert AbortNotOpen();
        }
        round.locked = false;
        _extra[roundId].aliveMask = 0;
        _abortAliveCoins(roundId, round);
        round.phase = Phase.Aborted;
        emit RoundAborted(roundId, reason);
    }

    function claimRefund(uint64 roundId, uint8 coinId, uint256 tokens) external nonReentrant returns (uint256 monPaid) {
        Coin storage c = _coins[roundId][coinId];
        if (c.status != Status.Refunded || _rounds[roundId].phase != Phase.Aborted) revert NotClaimable();
        monPaid = _fixedClaim(c, tokens);
        emit RefundClaimed(roundId, coinId, msg.sender, tokens, monPaid);
        _pay(msg.sender, monPaid);
    }

    function claimConsolation(uint64 roundId, uint8 coinId, uint256 tokens)
        external
        nonReentrant
        returns (uint256 monPaid)
    {
        Coin storage c = _coins[roundId][coinId];
        if (c.status != Status.Eliminated) revert NotClaimable();
        monPaid = _fixedClaim(c, tokens);
        emit ConsolationClaimed(roundId, coinId, msg.sender, tokens, monPaid);
        _pay(msg.sender, monPaid);
    }

    function redeem(uint64 roundId, uint256 tokens) external nonReentrant returns (uint256 monPaid) {
        RoundView storage round = _rounds[roundId];
        if (round.phase != Phase.Settled) revert NotClaimable();
        Coin storage c = _coins[roundId][round.winnerCoinId];
        if (round.redeemSupply == 0) revert NothingToClaim();
        MonsterCoin(c.token).burn(msg.sender, tokens);
        monPaid = tokens * round.redeemPool / round.redeemSupply;
        _extra[roundId].redeemPaid += monPaid.toUint128();
        emit Redeemed(roundId, msg.sender, tokens, monPaid);
        _pay(msg.sender, monPaid);
    }

    function claimSeed(uint64 roundId, uint8 coinId) external nonReentrant returns (uint256 monPaid) {
        Coin storage c = _coins[roundId][coinId];
        if (msg.sender != c.creator || c.creator == address(0)) revert NotCreator();
        if (c.seedClaimed) revert SeedAlreadyClaimed();
        Status st = c.status;
        uint256 tokens = c.seedTokens;
        c.seedClaimed = true;
        MonsterCoin(c.token).burn(address(this), tokens);
        if (st == Status.Eliminated || st == Status.Refunded) {
            if (c.consolationSupply != 0) monPaid = tokens * c.consolationPool / c.consolationSupply;
            c.poolPaid += monPaid.toUint128();
        } else if (st == Status.Champion) {
            RoundView storage round = _rounds[roundId];
            if (round.redeemSupply != 0) monPaid = tokens * round.redeemPool / round.redeemSupply;
            _extra[roundId].redeemPaid += monPaid.toUint128();
        } else {
            revert NotClaimable();
        }
        emit SeedClaimed(roundId, coinId, msg.sender, tokens, monPaid);
        _pay(msg.sender, monPaid);
    }

    function fundTreasury(uint64 roundId) external payable {
        RoundView storage round = _rounds[roundId];
        Phase phase = round.phase;
        if (phase == Phase.None) revert UnknownRound();
        if (phase == Phase.Settled || phase == Phase.Aborted) revert RoundNotFundable();
        round.treasury += msg.value.toUint128();
        emit TreasuryFunded(roundId, msg.sender, msg.value);
    }

    function setSeedSource(address source) external onlyOwner {
        if (source == address(0)) revert ZeroAddress();
        if (!_betweenRounds()) revert RoundInProgress();
        seedSource = source;
    }

    function getConfig(uint64 roundId) external view returns (RoundConfig memory) {
        return _configs[roundId];
    }

    function getRound(uint64 roundId) external view returns (RoundView memory) {
        return _rounds[roundId];
    }

    function getArenaSnapshot(uint64 roundId) external view returns (RoundView memory round, CoinView[] memory coins) {
        round = _rounds[roundId];
        coins = new CoinView[](round.coinCount);
        for (uint8 i = 0; i < round.coinCount; ++i) {
            coins[i] = _coinView(roundId, i);
        }
    }

    function currentRoundId() external view returns (uint64) {
        return _currentRoundId;
    }

    function quoteBuy(uint64 roundId, uint8 coinId, uint256 monIn) external view returns (uint256 tokensOut) {
        Coin storage c = _coins[roundId][coinId];
        uint256 fee = CurveMath.feeOf(monIn, _configs[roundId].tradeFeeBps);
        (tokensOut,) = CurveMath.buyOut(c.vMon, c.vTok, monIn - fee);
    }

    function quoteSell(uint64 roundId, uint8 coinId, uint256 tokens) external view returns (uint256 monOut) {
        Coin storage c = _coins[roundId][coinId];
        uint256 gross = CurveMath.sellGross(c.vMon, c.vTok, tokens);
        monOut = gross - CurveMath.feeOf(gross, _configs[roundId].tradeFeeBps);
    }

    function pendingConsolation(uint64 roundId, uint8 coinId, address holder) external view returns (uint256 monOwed) {
        Coin storage c = _coins[roundId][coinId];
        if ((c.status != Status.Eliminated && c.status != Status.Refunded) || c.consolationSupply == 0) return 0;
        monOwed = MonsterCoin(c.token).balanceOf(holder) * c.consolationPool / c.consolationSupply;
    }

    function pendingRedeem(uint64 roundId, address holder) external view returns (uint256 monOwed) {
        RoundView storage round = _rounds[roundId];
        if (round.phase != Phase.Settled || round.redeemSupply == 0) return 0;
        monOwed = MonsterCoin(_coins[roundId][round.winnerCoinId].token).balanceOf(holder) * round.redeemPool
            / round.redeemSupply;
    }

    function _runClashes(uint64 roundId, RoundConfig memory cfg, bytes32 seed, uint8 maxClashes)
        private
        returns (bool done)
    {
        RoundExtra storage x = _extra[roundId];
        uint8[] memory perm = CombatMath.pairing(seed, x.aliveMask);
        uint256 n = perm.length;
        uint256 total = n / 2 < cfg.clashesPerEpoch ? n / 2 : cfg.clashesPerEpoch;
        uint256 played = 0;
        while (x.resolveCursor < total && played < maxClashes) {
            uint256 c = x.resolveCursor;
            _clash(roundId, cfg, seed, perm[2 * c], perm[2 * c + 1]);
            x.resolveCursor += 1;
            ++played;
        }
        if (x.resolveCursor < total) return false;
        if (n % 2 == 1 && total == n / 2) {
            emit ByeGranted(roundId, _rounds[roundId].epoch, perm[n - 1]);
        }
        return true;
    }

    function _clash(uint64 roundId, RoundConfig memory cfg, bytes32 seed, uint8 idA, uint8 idB) private {
        RoundView storage round = _rounds[roundId];
        ClashEvent memory ev;
        ev.epoch = round.epoch;
        ev.clashId = round.clashesPlayed;
        {
            RoundExtra storage x = _extra[roundId];
            Coin storage a = _coins[roundId][idA];
            Coin storage b = _coins[roundId][idB];
            ev.winProbBps = CombatMath.winProbBps(
                _params(cfg),
                a.monsterType,
                a.level,
                a.rMonAtLock,
                b.monsterType,
                b.level,
                b.rMonAtLock,
                x.sumRMonAtLock,
                x.aliveAtLock
            );
        }
        ev.roll = CombatMath.clashRoll(seed, ev.clashId);
        (ev.winner, ev.loser) = ev.roll < ev.winProbBps ? (idA, idB) : (idB, idA);
        round.clashesPlayed = ev.clashId + 1;
        _mergeLoser(roundId, cfg, ev);
        emit ClashResolved(
            roundId,
            ev.epoch,
            ev.clashId,
            ev.winner,
            ev.loser,
            ev.winProbBps,
            ev.roll,
            ev.boost,
            ev.consolation,
            ev.toPot,
            ev.toTreasury
        );
        _applyBoostAndXp(roundId, ev);
        if (cfg.consolationMode == 1 && ev.consolation != 0) _spread(roundId, ev);
        Coin storage l = _coins[roundId][ev.loser];
        emit CoinEliminated(roundId, ev.loser, l.consolationPool, l.consolationSupply);
    }

    function _mergeLoser(uint64 roundId, RoundConfig memory cfg, ClashEvent memory ev) private {
        RoundView storage round = _rounds[roundId];
        Coin storage l = _coins[roundId][ev.loser];
        uint256 r = l.rMon;
        ev.boost = r * cfg.boostBps / BPS;
        uint256 consolation = r * cfg.consolationBps / BPS;
        ev.toPot = r * cfg.potBps / BPS;
        ev.toTreasury = r - ev.boost - consolation - ev.toPot;
        uint256 supply = MonsterCoin(l.token).totalSupply();
        l.rMon = 0;
        l.status = Status.Eliminated;
        l.consolationSupply = supply.toUint128();
        round.aliveCount -= 1;
        if (cfg.consolationMode == 0) {
            if (supply == 0) {
                ev.toPot += consolation;
            } else {
                l.consolationPool = consolation.toUint128();
                ev.consolation = consolation;
            }
        } else if (_eligibleSum(roundId, round.coinCount, ev.winner) == 0) {
            ev.toPot += consolation;
        } else {
            ev.consolation = consolation;
        }
        round.prizePot += ev.toPot.toUint128();
        round.treasury += ev.toTreasury.toUint128();
    }

    function _applyBoostAndXp(uint64 roundId, ClashEvent memory ev) private {
        Coin storage w = _coins[roundId][ev.winner];
        if (ev.boost != 0) _boostCoin(w, ev.boost);
        w.wins += 1;
        w.xp += CombatMath.XP_WIN;
        uint8 newLevel = CombatMath.levelFromXp(w.xp);
        bool leveled = newLevel > w.level;
        if (leveled) w.level = newLevel;
        emit Boosted(
            roundId,
            ev.epoch,
            ev.clashId,
            ev.winner,
            ev.boost,
            w.rMon,
            w.vMon,
            w.vTok,
            w.wins,
            w.level,
            CombatMath.XP_WIN,
            w.xp
        );
        if (leveled) emit LevelUp(roundId, ev.winner, newLevel);
    }

    function _spread(uint64 roundId, ClashEvent memory ev) private {
        RoundView storage round = _rounds[roundId];
        uint8 count = round.coinCount;
        uint256 sum = _eligibleSum(roundId, count, ev.winner);
        uint256 given = 0;
        uint256 lastId = type(uint256).max;
        for (uint8 i = 0; i < count; ++i) {
            Coin storage c = _coins[roundId][i];
            if (i != ev.winner && c.status == Status.Alive && c.rMon != 0) lastId = i;
        }
        for (uint8 i = 0; i < count; ++i) {
            Coin storage c = _coins[roundId][i];
            if (i == ev.winner || c.status != Status.Alive || c.rMon == 0) continue;
            uint256 share = i == lastId ? ev.consolation - given : ev.consolation * c.rMon / sum;
            given += share;
            if (share == 0) continue;
            _boostCoin(c, share);
            emit Boosted(roundId, ev.epoch, ev.clashId, i, share, c.rMon, c.vMon, c.vTok, c.wins, c.level, 0, c.xp);
        }
    }

    function _eligibleSum(uint64 roundId, uint8 count, uint8 winner) private view returns (uint256 sum) {
        for (uint8 i = 0; i < count; ++i) {
            Coin storage c = _coins[roundId][i];
            if (i != winner && c.status == Status.Alive) sum += c.rMon;
        }
    }

    function _boostCoin(Coin storage c, uint256 x) private {
        uint256 vMon = uint256(c.vMon) + x;
        c.vTok = CurveMath.boostedVTok(c.vMon, c.vTok, x).toUint128();
        c.vMon = vMon.toUint128();
        c.rMon += x.toUint128();
    }

    function _finishEpoch(uint64 roundId, RoundConfig memory cfg, bytes32 seed) private {
        RoundView storage round = _rounds[roundId];
        RoundExtra storage x = _extra[roundId];
        uint16 epoch = round.epoch;
        _hunts(roundId, cfg, seed, epoch);
        _sweepFees(roundId, epoch);
        x.aliveMask = 0;
        x.resolveCursor = 0;
        round.locked = false;
        round.lastEpochResolvedAt = block.timestamp.toUint40();
        round.cancelStreak = 0;
        if (round.phase == Phase.Leveling && epoch >= cfg.levelingEpochs) round.phase = Phase.Knockout;
        bool settled = round.aliveCount == 1;
        if (settled) _settle(roundId, round);
        uint256 bounty = _payBounty(round, cfg.keeperBounty);
        if (bounty != 0) emit TreasurySpent(roundId, TreasuryKind.KeeperBounty, bounty, round.treasury);
        emit EpochResolved(roundId, epoch, round.aliveCount);
        if (settled) emit RoundSettled(roundId, round.winnerCoinId, round.redeemPool, round.redeemSupply);
    }

    function _hunts(uint64 roundId, RoundConfig memory cfg, bytes32 seed, uint16 epoch) private {
        uint32 mask = _extra[roundId].aliveMask;
        uint8 count = _rounds[roundId].coinCount;
        for (uint8 i = 0; i < count; ++i) {
            Coin storage c = _coins[roundId][i];
            if (uint256(mask) & (uint256(1) << i) == 0 || c.status != Status.Alive) continue;
            bool success = CombatMath.huntRoll(seed, i) < cfg.huntWinPct;
            uint16 gained = success ? CombatMath.XP_HUNT : 0;
            c.xp += gained;
            uint8 newLevel = CombatMath.levelFromXp(c.xp);
            bool leveled = newLevel > c.level;
            if (leveled) c.level = newLevel;
            emit HuntResolved(roundId, epoch, i, success, gained, c.xp, c.level);
            if (leveled) emit LevelUp(roundId, i, newLevel);
        }
    }

    function _sweepFees(uint64 roundId, uint16 epoch) private {
        RoundView storage round = _rounds[roundId];
        uint32 mask = _extra[roundId].aliveMask;
        uint8 count = round.coinCount;
        uint256 total = 0;
        for (uint8 i = 0; i < count; ++i) {
            if (uint256(mask) & (uint256(1) << i) == 0) continue;
            Coin storage c = _coins[roundId][i];
            total += c.feeAcc;
            c.feeAcc = 0;
        }
        if (total == 0) return;
        uint256 toPot = total * FEE_TO_POT_BPS / BPS;
        uint256 toTreasury = total - toPot;
        round.prizePot += toPot.toUint128();
        round.treasury += toTreasury.toUint128();
        emit FeesSwept(roundId, epoch, toPot, toTreasury, round.prizePot, round.treasury);
    }

    function _settle(uint64 roundId, RoundView storage round) private {
        uint8 count = round.coinCount;
        for (uint8 i = 0; i < count; ++i) {
            Coin storage c = _coins[roundId][i];
            if (c.status != Status.Alive) continue;
            c.status = Status.Champion;
            round.winnerCoinId = i;
            round.redeemPool = c.rMon + round.prizePot;
            round.redeemSupply = MonsterCoin(c.token).totalSupply().toUint128();
            c.rMon = 0;
            round.prizePot = 0;
            round.phase = Phase.Settled;
            return;
        }
    }

    function _payBounty(RoundView storage round, uint256 bounty) private returns (uint256 paid) {
        uint256 spendable = _spendable(round.treasury);
        if (bounty > spendable) bounty = spendable;
        if (bounty == 0 || address(this).balance < reserveFloor + bounty) return 0;
        round.treasury -= bounty.toUint128();
        bool ok;
        address keeper = msg.sender;
        assembly {
            ok := call(BOUNTY_GAS, keeper, bounty, 0, 0, 0, 0)
        }
        if (!ok) {
            round.treasury += bounty.toUint128();
            return 0;
        }
        return bounty;
    }

    function _abortAliveCoins(uint64 roundId, RoundView storage round) private {
        uint8 count = round.coinCount;
        uint256 sumR = 0;
        uint256 fees = 0;
        for (uint8 i = 0; i < count; ++i) {
            Coin storage c = _coins[roundId][i];
            if (c.status != Status.Alive) continue;
            sumR += c.rMon;
            fees += c.feeAcc;
            c.feeAcc = 0;
        }
        if (fees != 0) {
            uint256 toPot = fees * FEE_TO_POT_BPS / BPS;
            round.prizePot += toPot.toUint128();
            round.treasury += (fees - toPot).toUint128();
            emit FeesSwept(roundId, round.epoch, toPot, fees - toPot, round.prizePot, round.treasury);
        }
        uint256 pot = round.prizePot;
        uint256 given = 0;
        uint256 lastId = type(uint256).max;
        for (uint8 i = 0; i < count; ++i) {
            Coin storage c = _coins[roundId][i];
            if (c.status == Status.Alive && c.rMon != 0) lastId = i;
        }
        if (sumR == 0 || lastId == type(uint256).max) {
            round.treasury += pot.toUint128();
            pot = 0;
        }
        round.prizePot = 0;
        for (uint8 i = 0; i < count; ++i) {
            Coin storage c = _coins[roundId][i];
            if (c.status != Status.Alive) continue;
            uint256 share = 0;
            if (pot != 0 && c.rMon != 0) {
                share = i == lastId ? pot - given : pot * c.rMon / sumR;
                given += share;
            }
            uint256 pool = c.rMon + share;
            uint256 supply = MonsterCoin(c.token).totalSupply();
            c.status = Status.Refunded;
            c.rMon = 0;
            c.consolationPool = pool.toUint128();
            c.consolationSupply = supply.toUint128();
            emit CoinRefundRate(roundId, i, pool, supply);
        }
        round.aliveCount = 0;
    }

    function _snapshotAtLock(uint64 roundId, uint8 count) private returns (uint32 mask) {
        uint256 sum = 0;
        uint8 alive = 0;
        for (uint8 i = 0; i < count; ++i) {
            Coin storage c = _coins[roundId][i];
            if (c.status != Status.Alive) continue;
            mask |= uint32(1) << i;
            c.rMonAtLock = c.rMon;
            sum += c.rMon;
            ++alive;
        }
        RoundExtra storage x = _extra[roundId];
        x.aliveMask = mask;
        x.aliveAtLock = alive;
        x.resolveCursor = 0;
        x.sumRMonAtLock = sum.toUint128();
    }

    function _fixedClaim(Coin storage c, uint256 tokens) private returns (uint256 pay) {
        uint256 supply = c.consolationSupply;
        if (supply == 0 || c.consolationPool == 0) revert NothingToClaim();
        MonsterCoin(c.token).burn(msg.sender, tokens);
        pay = tokens * c.consolationPool / supply;
        c.poolPaid += pay.toUint128();
    }

    function _tradable(uint64 roundId, uint8 coinId) private view returns (Coin storage c) {
        RoundView storage round = _rounds[roundId];
        Phase phase = round.phase;
        if (phase != Phase.Leveling && phase != Phase.Knockout) revert WrongPhase();
        if (round.locked) revert Locked();
        c = _coins[roundId][coinId];
        if (c.status != Status.Alive) revert CoinNotAlive();
    }

    function _spendable(uint256 treasury) internal view returns (uint256) {
        return treasury > reserveFloor ? treasury - reserveFloor : 0;
    }

    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        if (address(this).balance < reserveFloor + amount) revert ReserveFloorBreached();
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert PayFailed();
    }

    function _emitLaunched(uint64 roundId, uint8 coinId, LaunchEvent memory e) private {
        emit CoinLaunched(
            roundId,
            coinId,
            e.token,
            e.creator,
            e.name,
            e.ticker,
            e.monsterType,
            e.skinId,
            e.seedMon,
            e.vMon,
            e.vTok,
            e.supply
        );
    }

    function _coinView(uint64 roundId, uint8 coinId) private view returns (CoinView memory v) {
        Coin storage c = _coins[roundId][coinId];
        MonsterCoin token = MonsterCoin(c.token);
        v.token = c.token;
        v.creator = c.creator;
        v.monsterType = c.monsterType;
        v.skinId = c.skinId;
        v.status = c.status;
        v.level = c.level;
        v.xp = c.xp;
        v.wins = c.wins;
        v.vMon = c.vMon;
        v.vTok = c.vTok;
        v.rMon = c.rMon;
        v.rMonAtLock = c.rMonAtLock;
        v.seedMon = c.seedMon;
        v.consolationPool = c.consolationPool;
        v.consolationSupply = c.consolationSupply;
        v.supply = token.totalSupply();
        v.name = token.name();
        v.ticker = token.symbol();
    }

    function _params(RoundConfig memory c) private pure returns (CombatMath.Params memory p) {
        p.gammaBps = c.gammaBps;
        p.poolFactorMinBps = c.poolFactorMinBps;
        p.poolFactorMaxBps = c.poolFactorMaxBps;
        p.levelBonusBps = c.levelBonusBps;
        p.elementUpBps = c.elementUpBps;
        p.elementDownBps = c.elementDownBps;
        p.winProbMinBps = c.winProbMinBps;
        p.winProbMaxBps = c.winProbMaxBps;
    }

    function _knockoutEpochs(uint256 coins, uint256 clashesPerEpoch) private pure returns (uint256 epochs) {
        while (coins > 1) {
            uint256 pairs = coins / 2;
            if (pairs > clashesPerEpoch) pairs = clashesPerEpoch;
            coins -= pairs;
            ++epochs;
        }
    }

    function _checkName(bytes memory b) private pure {
        if (b.length == 0 || b.length > 32) revert BadName();
        for (uint256 i = 0; i < b.length; ++i) {
            if (b[i] < 0x20 || b[i] == 0x7f) revert BadName();
        }
    }

    function _checkTicker(bytes memory b) private pure {
        if (b.length < 2 || b.length > 7) revert BadTicker();
        for (uint256 i = 0; i < b.length; ++i) {
            bytes1 ch = b[i];
            bool digit = ch >= 0x30 && ch <= 0x39;
            bool upper = ch >= 0x41 && ch <= 0x5a;
            if (!digit && !upper) revert BadTicker();
        }
    }

    function _betweenRounds() private view returns (bool) {
        uint64 id = _currentRoundId;
        if (id == 0) return true;
        Phase phase = _rounds[id].phase;
        return phase == Phase.Settled || phase == Phase.Aborted;
    }

    function _validate(RoundConfig memory c) private pure {
        if (uint256(c.boostBps) + c.consolationBps + c.potBps + c.treasuryBps != 10_000) revert BadSplit();
        if (c.minCoins < 2 || c.maxCoins < c.minCoins || c.maxCoins > 32) revert BadCoinLimits();
        if (c.clashesPerEpoch == 0 || c.clashesPerEpoch > c.maxCoins / 2) revert BadCoinLimits();
        if (c.epochSeconds == 0 || c.seedTimeoutSeconds == 0 || c.maxRoundSeconds == 0) revert BadTiming();
        if (c.minSeed == 0 || c.minSeed > c.maxSeed) revert BadSeedBounds();
        if (c.tradeFeeBps >= 10_000 || c.consolationMode > 1) revert BadFee();
        if (
            c.poolFactorMinBps == 0 || c.poolFactorMinBps > c.poolFactorMaxBps || c.winProbMinBps == 0
                || c.winProbMinBps > c.winProbMaxBps || c.winProbMaxBps >= 10_000 || c.huntWinPct > 100
        ) revert BadCombatParams();
        if (c.vMon0 == 0 || c.vTok0 == 0) revert BadCurveParams();
    }
}
