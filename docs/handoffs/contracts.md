# Contracts — everything that crosses a role boundary

Revision 2 (2026-10-19), reconciled to the user's final decisions and to `docs/brainstorm/2026-10-19-monad-monster-arena-onchain.md` (the brainstorm plan wins every conflict, Q13). Roles build against this file, not against each other's code. If a role needs a change it reports back to the PM; the PM edits this file and tells every consumer. Rationale, economy table, threat model T1-T15 and the architecture diagrams live in the brainstorm plan and `docs/brainstorm/2026-10-19-monad-monster-arena-onchain/{architecture,research}.md` (read-only for all roles).

Priorities: **P0** on the demo path, **P1** makes it credible, **P2** only if time remains. There is no competition deadline: the full scope is built in phases, P0 then P1.

## 1. Network and shared identifiers

| Item | Value |
|---|---|
| Network | Monad testnet, chain id `10143`. Testnet only. |
| RPC | `https://testnet-rpc.monad.xyz`, `wss://testnet-rpc.monad.xyz`; fallback `https://rpc-testnet.monadinfra.com`, `wss://rpc-testnet.monadinfra.com`. A keyed provider URL supplied by the user replaces them through env vars. |
| `eth_getLogs` | at most 100 blocks per call; no JSON-RPC batching on the Monad Foundation endpoints (use Multicall3) |
| Block time and finality | 300 ms blocks; Proposed, Voted (+0.25-0.45 s), Finalized (+0.5-0.7 s) |
| Explorers | `https://testnet.monadvision.com`, `https://testnet.monadscan.com` (`/tx/<hash>`, `/address/<addr>`) |
| viem chain | local `defineChain` override: id 10143, `blockTime: 300`, both RPC and WS URLs, explorer `testnet.monadvision.com`, Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11` |
| Randomness | Pyth Entropy v2 behind `ISeedSource`. The Entropy contract address and default provider are **deploy-time configuration** (constructor arguments of `EntropySeedSource`, env names in section 7). `MockSeedSource` (deterministic, test-only) is used on local anvil and in tests. `prevrandao` and `blockhash` are never used for value. |
| Quote asset | native MON, 18 decimals |
| Round size | `maxCoins` is round config (default 30); coin ids `0 .. maxCoins-1` per round |
| Coin identity | `(roundId, coinId)` on chain; the ERC-20 clone address in views and events; the UI keys everything on `roundId:coinId` and shows `TICKER #coinId` when tickers collide |

### Catalog mapping (single source: `shared/catalog.json`, owned by the backend role)

| monsterType (uint8) | key | element | skinId (uint8) | skin key | UI skin name |
|---|---|---|---|---|---|
| 0 | `fire_dragon` | fire | 0 | `default` | Default |
| 1 | `ice_wolf` | ice | 1 | `obsidian` | Obsidian |
| 2 | `earth_golem` | earth | 2 | `royal` | Gold |
| 3 | `electric_fox` | electric | 3 | `crystal` | Azure |
| 4 | `dark_spirit` | dark | 4 | `celestial` | Mythic |

Order follows `MONSTER_CATALOG` (prototype:578) and `SKIN_MODIFIERS` (prototype:662). Element is derived 1:1 from `monsterType`. Skin is cosmetic only (no gameplay effect). Element cycle (flavour, tunable): fire beats ice beats earth beats electric beats dark beats fire; `elementUpBps = 11500` for the beater, `elementDownBps = 8700` for the beaten, 10000 otherwise. `baseStat` per type defaults to 10000 bps (equal); role 04's simulation may recommend other values.

## 2. On-chain interface (owner: smart-contracts role)

Contracts: `Arena` (rounds, lobby, curve ledger, buy/sell, epoch lock/resolve/cancel, clashes, hunts, merger, settlement, claims, abort, treasury), `MonsterCoin` (ERC-1167 clone shell), `libs/CurveMath`, `libs/CombatMath`, `seed/ISeedSource`, `seed/EntropySeedSource`, `seed/MockSeedSource`. Libraries: OpenZeppelin Contracts 5.6.1 (`ERC20` without Burnable or Permit, `Clones`, `ReentrancyGuardTransient`), Solady `FixedPointMathLib.powWad` (pin the version). Solidity 0.8.31, `evm_version = "osaka"`, no `via_ir`, no use of `transient` variables other than through OpenZeppelin's guard (see the 0.8.28-0.8.33 IR bug note in the contracts handoff).

### 2.1 Round configuration (immutable per round)

```solidity
struct RoundConfig {
    uint8   maxCoins;
    uint8   minCoins;
    uint32  lobbySeconds;
    uint8   levelingEpochs;
    uint32  epochSeconds;
    uint8   clashesPerEpoch;
    uint32  seedTimeoutSeconds;
    uint32  maxRoundSeconds;
    uint128 launchFee;
    uint128 minSeed;
    uint128 maxSeed;
    uint16  tradeFeeBps;
    uint16  boostBps;
    uint16  consolationBps;
    uint16  potBps;
    uint16  treasuryBps;
    uint8   consolationMode;
    uint16  gammaBps;
    uint16  poolFactorMinBps;
    uint32  poolFactorMaxBps;
    uint16  levelBonusBps;
    uint16  elementUpBps;
    uint16  elementDownBps;
    uint16  winProbMinBps;
    uint16  winProbMaxBps;
    uint8   huntWinPct;
    uint128 keeperBounty;
    uint128 maxEntropyFee;
    uint128 vMon0;
    uint128 vTok0;
}
```

`boostBps + consolationBps + potBps + treasuryBps == 10000` (enforced in `createRound`). `consolationMode`: `0 = Holders` (default; consolation claimable by holders of the eliminated coin), `1 = SpreadSurvivors` (the consolation share is spread into surviving non-winner coins' curves as a virtual buy-and-burn each, pro rata to `rMon`; default off). Presets (all numbers are assumptions tuned by role 04's simulation; the contracts role takes final values from `docs/pitch/economy-report.md`):

| Parameter | demo | standard |
|---|---|---|
| `maxCoins` / `minCoins` | 30 / 8 | 30 / 12 |
| `lobbySeconds` | 120 | 900 |
| `levelingEpochs` | 3 | 10 |
| `epochSeconds` | 20 | 60 |
| `clashesPerEpoch` | 6 | 4 |
| `seedTimeoutSeconds` | 60 | 60 |
| `maxRoundSeconds` | 3600 | 86400 |
| `launchFee` / `minSeed` / `maxSeed` (MON) | 1 / 2 / 50 | 5 / 10 / 500 |
| `tradeFeeBps` | 100 | 100 |
| `boostBps / consolationBps / potBps / treasuryBps` | 5000 / 3000 / 1500 / 500 | same |
| `consolationMode` | 0 | 0 |
| `gammaBps`, `poolFactorMinBps`, `poolFactorMaxBps` | 8800, 1000, 100000 | same |
| `levelBonusBps`, `elementUpBps`, `elementDownBps` | 400, 11500, 8700 | same |
| `winProbMinBps` / `winProbMaxBps` | 1500 / 8500 | same |
| `huntWinPct` | 50 | 50 |
| `keeperBounty` / `maxEntropyFee` (MON) | 0.2 / 1 | 1 / 10 |
| `vMon0` / `vTok0` | 20 MON / 1_000_000_000e18 | same |

### 2.2 Seed source

```solidity
interface ISeedSource {
    function requestSeed() external payable returns (uint64 id);
    function fee() external view returns (uint256);
}
```

`EntropySeedSource` wraps Pyth Entropy v2 (`requestV2`, `getFeeV2`) and implements the Entropy consumer callback, which calls `Arena.onSeed(id, seed)`. `MockSeedSource` lets tests and local anvil deliver a seed on demand. The Arena accepts `onSeed` only from the configured source. The callback stores the seed, emits `SeedReady`, and does nothing else; it never reverts.

### 2.3 Functions (names are binding for the client and the keeper)

Callers: P = player, K = keeper (anyone may call; bounty only at resolve), S = seed source, O = owner.

```solidity
function createRound(RoundConfig calldata config) external returns (uint64 roundId);                           // O, between rounds only; no withdrawal powers
function launchCoin(uint64 roundId, string calldata name, string calldata ticker, uint8 monsterType, uint8 skinId)
    external payable returns (uint8 coinId);                                                                    // P, Lobby; msg.value = launchFee + seed; per-address cap 2
function refundLaunch(uint64 roundId, uint8 coinId) external;                                                   // P, only if the round was Aborted in Lobby
function startRound(uint64 roundId) external;                                                                   // K, at maxCoins or deadline with >= minCoins and treasury covering all planned epochs
function buy(uint64 roundId, uint8 coinId, uint256 minTokensOut, uint64 deadline) external payable returns (uint256 tokensOut);  // P, only while not locked
function sell(uint64 roundId, uint8 coinId, uint256 tokens, uint256 minMonOut, uint64 deadline) external returns (uint256 monOut); // P, only while not locked; creator seed tokens are not sellable
function lockEpoch(uint64 roundId) external;                                                                    // K, timer-gated; requests the seed; freezes all alive coins
function onSeed(uint64 seedId, bytes32 seed) external;                                                          // S only
function resolveEpoch(uint64 roundId, uint8 maxClashes) external;                                               // K, after seed; pairs, rolls, merges, hunts, unlocks; batchable; bounty
function cancelEpoch(uint64 roundId) external;                                                                  // K, only after seedTimeoutSeconds and only while no seed has arrived; no bounty; at most 3 in a row
function abortRound(uint64 roundId) external;                                                                   // anyone: in Lobby after lobbySeconds with coinCount < minCoins (reason 1), else after 3 cancels in a row (2) or maxRoundSeconds (3)
function claimRefund(uint64 roundId, uint8 coinId, uint256 tokens) external returns (uint256 monPaid);          // holder, after abort: burn tokens for the pro-rata refund
function claimConsolation(uint64 roundId, uint8 coinId, uint256 tokens) external returns (uint256 monPaid);     // holder of an eliminated coin burns tokens at the fixed rate
function redeem(uint64 roundId, uint256 tokens) external returns (uint256 monPaid);                             // holder of the Chosen One burns tokens for (rMon + pot) / supply
function claimSeed(uint64 roundId, uint8 coinId) external returns (uint256 monPaid);                            // creator, after the coin is Eliminated, Settled or Aborted
function fundTreasury(uint64 roundId) external payable;                                                         // anyone
function setSeedSource(address source) external;                                                                // O, between rounds only

function getConfig(uint64 roundId) external view returns (RoundConfig memory);
function getRound(uint64 roundId) external view returns (RoundView memory);
function getArenaSnapshot(uint64 roundId) external view returns (RoundView memory round, CoinView[] memory coins);
function quoteBuy(uint64 roundId, uint8 coinId, uint256 monIn) external view returns (uint256 tokensOut);
function quoteSell(uint64 roundId, uint8 coinId, uint256 tokens) external view returns (uint256 monOut);
function pendingConsolation(uint64 roundId, uint8 coinId, address holder) external view returns (uint256 monOwed);
function pendingRedeem(uint64 roundId, address holder) external view returns (uint256 monOwed);
function currentRoundId() external view returns (uint64);
```

Public round creation: `createRound(config)` stays owner-only. The owner stores a vetted config once with `setDefaultConfig(config)` (owner-only, validated like `createRound`, sets `defaultConfigSet`), readable through `getDefaultConfig()`. Anyone may then start a lobby with `createDefaultRound() payable returns (uint64)` while no round is in progress; the round uses the stored default config, `msg.value` is added to the new round's treasury, and it reverts `NoDefaultConfig` until the owner has set one (`RoundInProgress` as for `createRound`). The caller never supplies the config on purpose: the previous round's carry-over treasury and the `keeperBounty` are paid out of the next round's treasury, so a hostile caller-chosen config (huge bounty, zero fees, absurd limits) could drain that carry-over.

Launch with image: `launchCoinWithImage(roundId, name, ticker, monsterType, skinId, imageUri) payable` behaves like `launchCoin` and additionally emits `CoinImage(uint64 indexed roundId, uint8 indexed coinId, string imageUri)` in the same tx as `CoinLaunched`. `imageUri` must start with `data:image/`, `ipfs://` or `https://` and be at most 16384 bytes; empty or any other scheme reverts `BadImage`. Plain `launchCoin` is unchanged and emits no `CoinImage`. The image is not in `getArenaSnapshot`, only in the event; the shared reducer sets `CoinView.imageUri` when `CoinImage` arrives (buffered if it sorts before `CoinLaunched`).

Access and gating rules the engineer enforces: `buy`, `sell`, `launchCoin` revert when the round is locked or in the wrong phase; every trade has mandatory `minOut` and `deadline`; `lockEpoch` is gated by `block.timestamp >= lastEpochResolvedAt + epochSeconds` (timestamps are used for timers only, never for randomness) and by the treasury covering the seed fee (`<= maxEntropyFee`); `cancelEpoch` reverts if a seed has arrived or the timeout has not elapsed, pays no bounty and is capped at 3 in a row (then `abortRound` opens); the keeper bounty is paid only at `resolveEpoch` completion and is capped by treasury; there is no owner withdrawal path and no upgrade proxy anywhere.

### 2.4 Views

```solidity
enum Phase  { None, Lobby, Leveling, Knockout, Settled, Aborted }
enum Status { None, Alive, Eliminated, Champion, Refunded }
enum TreasuryKind { SeedFee, KeeperBounty, Other }

struct RoundView {
    Phase   phase;
    bool    locked;
    uint16  epoch;
    uint8   coinCount;
    uint8   aliveCount;
    uint8   cancelStreak;
    uint8   winnerCoinId;
    uint40  createdAt;
    uint40  startedAt;
    uint40  lockedAt;
    uint40  lastEpochResolvedAt;
    uint64  entropySeq;
    bytes32 seed;
    uint128 prizePot;
    uint128 treasury;
    uint128 redeemPool;
    uint128 redeemSupply;
    uint32  clashesPlayed;
}

struct CoinView {
    address token;
    address creator;
    uint8   monsterType;
    uint8   skinId;
    Status  status;
    uint8   level;
    uint16  xp;
    uint16  wins;
    uint128 vMon;
    uint128 vTok;
    uint128 rMon;
    uint128 rMonAtLock;
    uint128 seedMon;
    uint128 consolationPool;
    uint128 consolationSupply;
    uint256 supply;
    string  name;
    string  ticker;
}
```

### 2.5 Events (the frozen surface the keeper, ChainFeed and the client depend on)

Every event carries the post-state numbers the UI needs; no consumer needs a state read to render one. Additions over the brainstorm sketch: `Boosted`, `RefundClaimed`, post-state fields on `Trade`, and (revision 3, so a client can mirror chain state from events alone) `vMon`, `vTok`, `supply` on `CoinLaunched`, `xpGained` and `xp` on `Boosted`, `xp` and `level` on `HuntResolved`, `TreasurySpent`, `FeesSwept`, and (revision 4) `tokens` on `SeedClaimed` and the new `CoinRefundRate`.

```solidity
event RoundCreated(uint64 indexed roundId, RoundConfig config);
event CoinLaunched(uint64 indexed roundId, uint8 indexed coinId, address token, address indexed creator,
                   string name, string ticker, uint8 monsterType, uint8 skinId, uint256 seedMon,
                   uint256 vMon, uint256 vTok, uint256 supply);
event RoundStarted(uint64 indexed roundId, uint40 startedAt, uint8 coins);
event Trade(uint64 indexed roundId, uint8 indexed coinId, address indexed trader, bool isBuy,
            uint256 monAmount, uint256 tokenAmount, uint256 rMon, uint256 vMon, uint256 vTok);
event EpochLocked(uint64 indexed roundId, uint16 epoch, uint64 entropySeq, uint32 aliveMask, uint40 lockedAt);
event SeedReady(uint64 indexed roundId, uint16 epoch, bytes32 seed);
event ClashResolved(uint64 indexed roundId, uint16 epoch, uint32 clashId, uint8 winner, uint8 loser,
                    uint16 winProbBps, uint16 roll, uint256 boost, uint256 consolation, uint256 toPot, uint256 toTreasury);
event Boosted(uint64 indexed roundId, uint16 epoch, uint32 clashId, uint8 indexed coinId,
              uint256 boostMon, uint256 rMon, uint256 vMon, uint256 vTok, uint16 wins, uint8 level,
              uint16 xpGained, uint16 xp);
event CoinEliminated(uint64 indexed roundId, uint8 indexed coinId, uint256 consolationPool, uint256 consolationSupply);
event ByeGranted(uint64 indexed roundId, uint16 epoch, uint8 indexed coinId);
event HuntResolved(uint64 indexed roundId, uint16 epoch, uint8 indexed coinId, bool success, uint16 xpGained,
                   uint16 xp, uint8 level);
event LevelUp(uint64 indexed roundId, uint8 indexed coinId, uint8 level);
event EpochResolved(uint64 indexed roundId, uint16 epoch, uint8 aliveCount);
event EpochCancelled(uint64 indexed roundId, uint16 epoch);
event RoundSettled(uint64 indexed roundId, uint8 indexed winnerCoinId, uint256 redeemPool, uint256 redeemSupply);
event RoundAborted(uint64 indexed roundId, uint8 reason);
event ConsolationClaimed(uint64 indexed roundId, uint8 indexed coinId, address indexed holder, uint256 tokens, uint256 monPaid);
event Redeemed(uint64 indexed roundId, address indexed holder, uint256 tokens, uint256 monPaid);
event RefundClaimed(uint64 indexed roundId, uint8 indexed coinId, address indexed holder, uint256 tokens, uint256 monPaid);
event SeedClaimed(uint64 indexed roundId, uint8 indexed coinId, address indexed creator, uint256 tokens, uint256 monPaid);
event CoinRefundRate(uint64 indexed roundId, uint8 indexed coinId, uint256 refundPool, uint256 refundSupply);
event TreasuryFunded(uint64 indexed roundId, address indexed funder, uint256 amount);
event TreasurySpent(uint64 indexed roundId, TreasuryKind kind, uint256 amount, uint256 treasuryAfter);
event FeesSwept(uint64 indexed roundId, uint16 epoch, uint256 toPot, uint256 toTreasury,
                uint256 prizePotAfter, uint256 treasuryAfter);
```

Order inside a resolve: `ClashResolved`, `Boosted`, `CoinEliminated` for each clash; `ByeGranted` for the odd coin; `HuntResolved` (and `LevelUp`) for each alive coin; `FeesSwept` (when any fee was swept; the fees of every coin alive at the lock, including losers of this epoch, are swept once here); `TreasurySpent` for the keeper bounty (kind `KeeperBounty`, just before `EpochResolved`); `EpochResolved`; when one coin is left `RoundSettled`.

#### Client mirror rules (state derivable from events alone)

1. `RoundCreated.config` is emitted as the complete `RoundConfig` struct (a tuple in the ABI; every field, including `poolFactorMaxBps` as uint32).
2. Round ids start at 1. `epoch` is 0 from `RoundCreated` until the first `EpochLocked`, whose `epoch` is 1. Epochs are numbered from 1 and counted by resolved epochs: a cancelled epoch does not consume its number, so the retry after `EpochCancelled(e)` emits `EpochLocked(e)` again (dedupe on the transaction, not on the epoch).
3. Phase: `RoundCreated` gives Lobby, `RoundStarted` gives Leveling (Knockout straight away when `levelingEpochs == 0`), and the phase flips to Knockout when `EpochResolved` fires with `epoch == levelingEpochs`. Epochs `1 .. levelingEpochs` resolve hunts only; epochs above `levelingEpochs` resolve clashes and hunts. `RoundSettled` and `RoundAborted` close the round.
4. Curve identity for alive coins: `rMon == vMon - vMon0` (`vMon0` from the config) after every `Trade` and `Boosted`. `CoinLaunched` carries the post-state `vMon`, `vTok` and `supply` (the creator seed buy and its tokens included), so `rMon` after a launch is `vMon - vMon0`.
5. At `CoinEliminated` the coin's `rMon` becomes 0 (its whole reserve was split by the merger; the amounts are in the preceding `ClashResolved`). Its `consolationPool` and `consolationSupply` are in `CoinEliminated`; `supply` then falls only through `ConsolationClaimed` and `SeedClaimed` burns.
6. XP and level: a clash win adds `Boosted.xpGained` to the winner and `Boosted.xp` is its new total; a hunt adds `HuntResolved.xpGained` and `HuntResolved.xp` is the new total; `level` in both events is the level after that gain, and `LevelUp` is still emitted when it rises. The loser of a clash and a coin with a bye gain nothing from the clash.
7. Treasury: it rises by `launchFee` on every `CoinLaunched`, by `TreasuryFunded.amount`, by `ClashResolved.toTreasury` and by `FeesSwept.toTreasury`; it falls only by `TreasurySpent.amount` (kinds `SeedFee` for the Entropy fee at `lockEpoch`, `KeeperBounty` at `resolveEpoch` completion, `Other` reserved). `TreasurySpent.treasuryAfter` and `FeesSwept.treasuryAfter` are absolute checkpoints. The prize pot rises by `ClashResolved.toPot` and `FeesSwept.toPot`; `FeesSwept.prizePotAfter` is an absolute checkpoint.
9. Lobby: `refundLaunch` emits `RefundClaimed(roundId, coinId, creator, seedTokens, seed + launchFee)` followed by `TreasurySpent(Other, launchFee, treasuryAfter)`; the coin becomes Refunded, `rMon` 0 and `aliveCount` falls by one.
10. Settlement: at `RoundSettled` the winner's `rMon` and `prizePot` are folded into `redeemPool` (so both read 0 afterwards); `redeemSupply` is the winner's total supply (the creator seed tokens included) and the winner is Champion.
11. Abort in Leveling or Knockout: the fees of the alive coins are swept (`FeesSwept`), the whole `prizePot` is divided pro rata to `rMon` over the alive coins (the last coin takes the rounding remainder; with no reserve it goes to the treasury) and each alive coin becomes Refunded with `rMon` 0 and a fixed rate announced in `CoinRefundRate(refundPool, refundSupply)`. After that `prizePot` is 0; `claimRefund` and `claimSeed` pay at those rates. `RoundAborted` reasons: 1 lobby underfilled, 2 three cancels in a row, 3 `maxRoundSeconds`.
12. Treasury rollover: `createRound` moves the previous round's treasury (minus launch fees still owed to creators after a Lobby abort) into the new round and emits `TreasuryFunded(newRoundId, <Arena address>, amount)`.
13. `RoundView.seed` is zero from `EpochLocked` until `SeedReady`, then keeps the last epoch's seed until the next lock. A seed of zero is ignored by `onSeed`.
14. In consolation mode 1 (SpreadSurvivors) each surviving non-winner coin with `rMon > 0` gets an extra `Boosted` event (`xpGained` 0) after the winner's `Boosted`; the amounts sum exactly to `ClashResolved.consolation`, which is 0 (and the share goes to `toPot`) when no survivor can receive it; `CoinEliminated.consolationPool` is 0.
8. Snapshot base: read `getArenaSnapshot` with Multicall3 `aggregate3` at the `finalized` block tag, put `Multicall3.getBlockNumber()` in the same aggregate call so the base block number is atomic with the state, then apply logs with `blockNumber` above it (backfill in chunks of at most 100 blocks, then the live `monadLogs` stream). `safe` (Voted) blocks can still roll back, so a base read at `safe` would need a rebase after a retract; `finalized` never does.

### 2.6 Rules the engineer implements (shape from the brainstorm plan, sections "Curve" and "Combat")

Curve per coin (ledger-in-Arena, virtual reserves; `k = vMon * vTok` is always read from current state, never cached): `buy(in)`: `in' = in*(1-fee)`, `out = vTok - ceil(k/(vMon+in'))`, `vMon += in'`, `vTok -= out`, `rMon += in'`; `sell(t)`: `gross = vMon - ceil(k/(vTok+t))`, `out = gross*(1-fee)`, `vMon -= gross`, `vTok += t`, `rMon -= gross`; **boost(X): `k = vMon*vTok; vMon += X; rMon += X; vTok = ceil(k/vMon)`** (a virtual buy-and-burn, never a plain reserve injection). Rounding always favours the pool (ceil). Fees accrue per coin and are swept to pot and treasury at resolve or settle, so trades never write a shared hot slot. Creator seed: the seed buys tokens held by the Arena until the coin is eliminated, the round settles or aborts; seed tokens are not sellable, are counted in supply for fixed-rate claims, and the creator takes the fixed-rate amount through `claimSeed`.

Combat: `power(i, j) = baseStat[type_i] * (1 + levelBonus*(level_i - 1)) * elementMult(type_i, type_j) * clamp((rMonAtLock_i / meanRMonAlive)^gamma, poolFactorMin, poolFactorMax)` using `powWad`; `winProbBps(A) = clamp(powA / (powA + powB), winProbMinBps, winProbMaxBps)`; `roll = uint(keccak(seed, "CLASH", clashId)) % 10000`, A wins iff `roll < winProbBps(A)`; pairing is a Fisher-Yates permutation over the alive set locked in `aliveMask` with `keccak(seed, "PAIR")`, odd coin out gets a bye, at most `clashesPerEpoch` pairs; hunts: each alive coin each epoch, `uint(keccak(seed, "HUNT", coinId)) % 100 < huntWinPct` gives xp, a clash win gives more xp; level is a lookup on xp thresholds (1..10). Every draw is domain-tagged (`PAIR`, `CLASH`, `HUNT`). During Leveling epochs `resolveEpoch` runs hunts only (no clashes, no eliminations); clashes start in Knockout (interpretation of the brainstorm state machine; the contracts role confirms or reports a conflict in Phase C0). Pairing must be reproducible across batched `resolveEpoch` calls from `(seed, aliveMask)` without per-pair storage. Merger: loser reserve `R` is split in bps into boost, consolation, pot, treasury; consolation sets `consolationPool` and `consolationSupply` once at elimination (fixed rate, never divide by a live `totalSupply()`). Parameters fixed by the economy gate: fees accrue per coin and are swept half to the pot and half to the treasury (`FeesSwept`); the creator seed is bought without the trade fee; xp is 10 per successful hunt and 20 per clash win with level thresholds 0, 15, 35, 60, 90, 125, 165, 210, 260, 320 xp; `baseStat` is equal for all monsters; power uses `rMonAtLock` and the level at the lock. `buy` and `sell` require a non-zero `minOut`. `launchCoin` requires the treasury to hold the floor plus the launch fees already taken (`ReserveNotFunded`), so deployers fund the floor with `fundTreasury` right after `createRound`. `startRound` requires `treasury >= reserveFloor + plannedEpochs * maxEntropyFee`. The keeper bounty is capped by the spendable treasury (`treasury - reserveFloor`) and never makes `resolveEpoch` revert. Reserve floor: the Arena has an immutable `reserveFloor` (constructor arg, default 10 MON, 0 allowed) funded through `fundTreasury`; it is never spendable or paid out and every payout keeps the balance at or above it. Abort: `prizePot` returns pro rata inside the `claimRefund` rates; leftover treasury stays for the next round. Settlement: when one coin is alive the round is Settled and that coin is redeem-only at `(rMon + prizePot) / supply` (`redeemPool` and `redeemSupply` fixed at settlement); no curve exit.

### 2.7 Invariants and named tests (P0, Foundry)

Money-model invariants, in order of importance:

1. `address(this).balance >= totalLiabilities` after every external call, liabilities counted from counters (sum of coin `rMon`, prize pot, unclaimed consolation pools, redeem pool, treasury, refunds owed), never `balance ==`.
2. Curve solvency: for every sequence of buy, sell and boost, selling all circulating supply never needs more than `rMon`.
3. Claim rates are fixed once; payouts sum to at most the pool; dust at most 1 wei per claim.
4. Stranded surplus after a boost is recovered through the elimination or settlement redemption; there is no owner withdrawal path.
5. No funds can be stuck: `resolveEpoch` never reverts on data (zero supply, zero reserve guarded), and `abortRound` exists.

Named tests (each exact name below must exist; the three red-team holes are marked):

| Test | What it proves |
|---|---|
| `test_T1_oneWeiSellAfterBoost` **(red-team hole 1)** | after a boost, `sell(1 wei)` pays about `price * 1 wei`, never the boost; fuzzed over reserves and boost sizes |
| `test_T2_ghostCoinCannotUnlockSeed` **(red-team hole 2, contract side)** | the creator cannot withdraw or sell the seed mid-round; `claimSeed` reverts until Eliminated, Settled or Aborted; supply stays above 0 |
| `test_T4_noTradeWhileLocked` and `test_T4_pairingUnknowableBeforeResolve` **(red-team hole 3)** | `buy`, `sell`, `launchCoin` revert between `EpochLocked` and the final resolve call; pairing is a function of a seed that does not exist before the lock |
| `test_T6_resolveWithZeroSupplyCoinDoesNotRevert` | resolve never reverts on data |
| `test_T10_reentrantSell` | a hostile receiver cannot re-enter `sell`, `claimConsolation`, `redeem` |
| `test_T15_domainTags` | `PAIR`, `CLASH`, `HUNT` draws are domain separated |
| `test_lateSeedThenCancelEpoch`, `test_threeCancelsThenAbort` | liveness: cancel only after the timeout and only while no seed arrived, cap 3, then abort with pro-rata refunds |
| `test_fullRoundWithMockSeed` | a 30-coin round runs end to end to Settled; the Chosen One's holders redeem at the published rate; a second round starts without redeploying |
| `test_forceSentMonDoesNotBreakAccounting` | force-sent MON raises balance but breaks nothing |

The ghost-coin economics (hole 2, economic side), the 1-wei bearer-bonus economics (hole 1) and the early-public-bracket edge (hole 3) are also simulation checks in role 04's `sim/` (see `04-product-economy-demo.md`).

### 2.8 Checkpoint G16 and fallback

After the curve, coin, launch, trade, epoch engine and merger are implemented, the contracts role reports a checkpoint. If invariants 1-5 and the named tests T1, T2, T4, T6, T10, T15 are not green after about 16 agent-hours or two full fix cycles, the role stops and reports to the PM. The fallback is Option E of the brainstorm plan: stake pools with share accounting (no ERC-20, no curve), identical events and client surface. The PM decides with the user; the contracts role never switches silently.

### 2.9 Deployment artefacts (owner: smart-contracts role)

| Path | Content |
|---|---|
| `contracts/abi/Arena.json`, `contracts/abi/MonsterCoin.json`, `contracts/abi/ISeedSource.json` | ABI JSON regenerated by a script from `forge inspect`, committed |
| `deployments/10143.json` | `{ chainId, arena, coinImplementation, seedSource, entropy, entropyProvider, keeper, deployBlock, commit, deployedAt }`; public addresses only |
| `deployments/10143.params.json` | the constructor and preset values used |

The deploy is a user step with a Foundry keystore (`contracts/DEPLOY.md`). `shared/` copies ABIs from `contracts/abi/` with its own sync script. Other roles read `deployments/10143.json`; they never read contract source.

## 3. Shared TypeScript types and ChainFeed (owner: backend role, `shared/`)

All `bigint` values travel as decimal strings in JSON. The `shared/` package is `@animal/shared`, framework-free TypeScript used by the keeper and by the browser bundle.

```ts
export type Hex = `0x${string}`
export type DecimalString = string
export type CommitState = 'Proposed' | 'Voted' | 'Finalized' | 'Verified'
export type Phase = 'Lobby' | 'Leveling' | 'Knockout' | 'Settled' | 'Aborted'
export type CoinStatus = 'Alive' | 'Eliminated' | 'Champion' | 'Refunded'

export interface CoinView {
  roundId: number
  coinId: number
  token: Hex
  creator: Hex
  name: string
  ticker: string
  monsterType: number
  skinId: number
  status: CoinStatus
  level: number
  xp: number
  wins: number
  vMon: DecimalString
  vTok: DecimalString
  rMon: DecimalString
  rMonAtLock: DecimalString
  seedMon: DecimalString
  consolationPool: DecimalString
  consolationSupply: DecimalString
  supply: DecimalString
  isHouse: boolean
  imageUri?: string // set from CoinImage; undefined for house coins and plain launchCoin
}

export interface RoundView {
  roundId: number
  phase: Phase
  locked: boolean
  epoch: number
  coinCount: number
  aliveCount: number
  cancelStreak: number
  winnerCoinId: number
  createdAt: number
  startedAt: number
  lockedAt: number
  lastEpochResolvedAt: number
  prizePot: DecimalString
  treasury: DecimalString
  redeemPool: DecimalString
  redeemSupply: DecimalString
  clashesPlayed: number
}

export interface ArenaSnapshot {
  config: Record<string, number | string | boolean>
  round: RoundView
  coins: CoinView[]
  blockNumber: number
  blockId: Hex
  serverTime: number
}

export type ArenaEventName =
  | 'RoundCreated' | 'CoinLaunched' | 'RoundStarted' | 'Trade' | 'EpochLocked' | 'SeedReady'
  | 'ClashResolved' | 'Boosted' | 'CoinEliminated' | 'ByeGranted' | 'HuntResolved' | 'LevelUp'
  | 'EpochResolved' | 'EpochCancelled' | 'RoundSettled' | 'RoundAborted' | 'ConsolationClaimed'
  | 'Redeemed' | 'RefundClaimed' | 'SeedClaimed' | 'TreasuryFunded' | 'TreasurySpent' | 'FeesSwept' | 'CoinRefundRate'

export interface ArenaEventEnvelope {
  id: string
  name: ArenaEventName
  blockNumber: number
  blockId: Hex
  logIndex: number
  txHash: Hex
  timestamp: number
  commitState: CommitState
  args: Record<string, string | number | boolean>
}
```

`id` is `` `${blockNumber}-${logIndex}` `` zero-padded to 12 and 6 digits so lexicographic order equals chain order. `args` keys are exactly the event parameter names in section 2.5; bigint parameters are decimal strings.

### ChainFeed and ArenaStore (framework-free, run in the keeper and in the browser)

```ts
export interface ChainFeedOptions {
  wsUrls: string[]
  httpUrls: string[]
  arena: Hex
  roundId: number
  multicall3: Hex
  getLogsMaxRange: number
}
export interface ChainFeed {
  start(): Promise<void>
  stop(): void
  onSnapshot(cb: (s: ArenaSnapshot) => void): () => void
  onEnvelope(cb: (e: ArenaEventEnvelope) => void): () => void
  onCommit(cb: (c: { blockId: Hex; blockNumber: number; commitState: CommitState }) => void): () => void
  onRetract(cb: (r: { blockId: Hex }) => void): () => void
  onStatus(cb: (s: { upstream: 'live' | 'reconnecting' | 'polling'; headBlock: number; lagSeconds: number }) => void): () => void
}
export interface ArenaStore {
  getState(): ArenaState
  subscribe(cb: () => void): () => void
  hydrate(snapshot: ArenaSnapshot): void
  apply(e: ArenaEventEnvelope): void
  commit(c: { blockId: Hex; blockNumber: number; commitState: CommitState }): void
  retract(r: { blockId: Hex }): void
  replay(events: ArenaEventEnvelope[], opts?: { atMs?: boolean }): Promise<void>
}
```

ChainFeed behaviour: subscribe `eth_subscribe("monadLogs", { address: Arena })` (raw WebSocket, because viem's `watchContractEvent` exposes no `blockId` or `commitState`) and `monadNewHeads` (head and lag only); on every (re)connect subscribe first and buffer, then read the snapshot with one Multicall3 `aggregate3` at the `finalized` tag (`getBlockNumber`, `getConfig`, `getArenaSnapshot`; the base block number is atomic with the state), emit it through `onSnapshot`, flush the buffer above the base block, and backfill finalized logs above it with `eth_getLogs` pages of at most 100 blocks and at most 5 in flight. Events are keyed by `(blockId, logIndex)`; a Finalized block that replaces a seen `blockId` at the same height emits `retract` for the loser; `removed: true` also retracts. Fallback: when the socket is down the feed polls finalized logs every second (`status.upstream = 'polling'`). The feed takes injected `createWebSocket`, `fetch` and timers so it runs unchanged in Node and in the browser. `ArenaStore` upgrades `Proposed` to `Voted` to `Finalized` and derives ranks; its `ArenaState` (persisted from Finalized events only, optimistic from all) is defined in `shared/src/types.ts`.

Encoding of `args`: `bigint` event parameters on a uint of at most 64 bits are JSON numbers, wider uints (uint128, uint256) are decimal strings, addresses are lowercase hex, `bytes32` is hex, enums (`TreasurySpent.kind`) are numbers, and `RoundCreated.config` is the `RoundConfig` struct as a JSON-encoded string with the same number/string rule per field.

Commit-state gating (client rule): `Trade` text is cosmetic at Proposed; animations (`EpochLocked`, `ClashResolved`, `HuntResolved`, `CoinLaunched`, `RoundStarted`, `RoundSettled`) play at `Voted`; persisted numbers (leaderboard order, win counters, pool levels), the Claim consolation, Redeem and Claim seed buttons enable at `Finalized`.

## 4. Keeper, drip and optional relay (owner: backend role)

| Component | Behaviour | Priority |
|---|---|---|
| Keeper loop | `startRound` when ready, then `lockEpoch` when `epochSeconds` elapsed, wait for `SeedReady` (event, or polling), `resolveEpoch(roundId, maxClashes)`, `cancelEpoch` watchdog at `seedTimeoutSeconds`; tight gas (`estimateGas x 1.15`, gas is charged on the limit); one in-flight transaction per account; structured logs with `roundId`, epoch, tx hash, gas used, seconds from `EpochLocked` to `EpochResolved`; alert above 90 s | P0 |
| `GET /healthz` | `{ ok, headBlock, lagSeconds, keeperAddress, round: { phase, epoch, locked } }` | P0 |
| `POST /drip` | testnet faucet for the burner: request `{ address }`, response `{ txHash, amount }`; 429 `{ error: 'rate_limited', retryAfterSeconds }` per address and per IP; 400 on bad address | P0 |
| House-coin seeding script | launches the curated roster (from the prototype `INITIAL_TOKENS`) so a demo always has coins; labels them in `shared/house-coins.json` (public addresses only) | P0 |
| Relay (optional) | one upstream `monadLogs` socket fanned out to browsers over SSE (`GET /stream`, `GET /snapshot`, `GET /events?after=`), hides a keyed provider and respects RPC limits; the client works without it | P1 |
| Indexer | none in v1 (Envio is out of scope) | - |

SSE format when the relay exists: `snapshot` (`ArenaSnapshot`), `event` (`ArenaEventEnvelope`, first at Proposed), `commit`, `retract`, `status`, `ping`; `Last-Event-ID` is the envelope `id`.

## 5. Fixture stream (owner: backend role)

`shared/fixtures/arena-replay.json`: an array of `{ atMs: number, message: { kind: 'snapshot' | 'event' | 'commit' | 'retract' | 'status', data: unknown } }` that the browser plays through the same `ArenaStore` (`?replay=fixture`). It contains: a 12-coin snapshot in Lobby, 3 `CoinLaunched`, `RoundStarted`, `Trade` events, 3 leveling epochs with `EpochLocked`, `SeedReady`, `HuntResolved`, `LevelUp`, `EpochResolved`, 4 or more knockout epochs with `ClashResolved`, `Boosted`, `CoinEliminated`, `ByeGranted`, `ConsolationClaimed`, one `EpochCancelled`, and a final `RoundSettled`. Numbers satisfy the conservation rule (`R == boost + consolation + toPot + toTreasury` using the 50/30/15/5 split) and the curve rule after a boost (`vTok = ceil(k / vMon)`).

## 6. Scene bridge (owner: frontend role, `web/src/arena/bridge.ts` and `bridge.d.ts`)

The scene is the prototype's vanilla Three.js code (three pinned at 0.128.0) extracted into an ES module. The panels that the prototype already has stay as its own DOM; new chain UI is React islands. The scene never decides an outcome and never reads positions back into chain logic. Data goes in through `ArenaBridge`; user intent and telemetry come out as events.

```ts
export interface CoinSceneView {
  id: string
  ticker: string
  name: string
  monsterType: number
  skinId: number
  rMon: number
  level: number
  xp: number
  wins: number
  rank: number
  isHouse: boolean
}
export interface ClashPlan {
  clashId: string
  winnerId: string
  loserId: string
  winProbBps: number
  roll: number
  boost: number
  consolation: number
  toPot: number
  toTreasury: number
  blockTimestamp: number
}
export interface ArenaBridge {
  hydrate(coins: CoinSceneView[]): void
  spawnCoin(coin: CoinSceneView, opts?: { animate?: boolean }): void
  onTrade(e: { id: string; isBuy: boolean; mon: number; rMon: number }): void
  onEpochLocked(e: { epoch: number; seconds: number }): void
  onSeedReady(e: { epoch: number }): void
  onClashResolved(plan: ClashPlan): Promise<void>
  onHuntResolved(e: { id: string; success: boolean; xp: number }): Promise<void>
  onLevelUp(e: { id: string; level: number }): void
  onCoinEliminated(e: { id: string }): void
  onBye(e: { id: string }): void
  onEpochCancelled(e: { epoch: number }): void
  onRoundSettled(e: { winnerId: string }): Promise<void>
  select(id: string | null): void
  setFilters(f: { element: string; monsterId: string; query: string; selectiveLabels: boolean; biomeMarkers: boolean }): void
  camera: { fit(): void; zoom(dir: 1 | -1): void; panTo(x: number, z: number): void }
  setMode(mode: 'chain' | 'sim'): void
  dispose(): void
  on<K extends keyof ArenaEvents>(name: K, cb: (e: ArenaEvents[K]) => void): () => void
}
export interface ArenaEvents {
  ready: Record<string, never>
  select: { id: string | null; source: 'pick' | 'api' | 'removed' }
  stats: { fps: number; liveCoins: number; activeDuels: number; clashesPlayed: number }
  telemetry: { id: string; state: string; x: number; z: number; biome: string; opponent: string | null }
  duel: { clashId: string; phase: 'approach' | 'strike' | 'finisher' | 'merged' | 'done' | 'skipped'; winnerId: string; loserId: string }
}
```

Duels are pure replays: `scriptDuel(clashId, typeA, typeB, winner)` uses a PRNG seeded by `clashId`, generates strike damages, re-salts up to 32 times until the natural loser equals the chain's loser, and as a last resort forces the final strike. No `Math.random()` in chain mode. At most 8 duels at once from a queue (the prototype's cap). Hunt NPCs reuse `createMonster3DMesh` with the obsidian skin and a scale, a 1.2 s scripted fight beside the coin.

Stage mapping the client derives from `RoundView`: `Lobby` -> stage 1; `Leveling` -> stage 2; `Knockout` -> stage 3; `Settled` -> stage 4.

## 7. Environment variable names (values never in the repo)

| Name | Used by | Notes |
|---|---|---|
| `VITE_CHAIN_ID` | web | `10143` |
| `VITE_RPC_HTTP_URL`, `VITE_RPC_WS_URL` | web | public endpoints, or a keyed provider URL supplied by the user |
| `VITE_ARENA_ADDRESS`, `VITE_DEPLOY_BLOCK`, `VITE_ROUND_ID` | web | or read from `deployments/10143.json` at build |
| `VITE_KEEPER_URL` | web | base URL for `/drip` and, if present, the relay |
| `RPC_HTTP_URL`, `RPC_WS_URL` | keeper, scripts | |
| `ARENA_ADDRESS`, `DEPLOY_BLOCK`, `ROUND_ID` | keeper | |
| `KEEPER_PRIVATE_KEY` | keeper | funded testnet EOA (needs about 25 MON: 10 MON reserve plus gas); never logged |
| `DRIP_PRIVATE_KEY` | keeper | separate funded testnet EOA |
| `SEEDER_PRIVATE_KEY` | keeper script `seed-house` | funds the house wallets |
| `HOUSE_MNEMONIC` | keeper script `seed-house` | optional; when absent the script generates ephemeral in-memory house wallets and warns that their creator seeds are not reclaimable |
| `ALLOWED_ORIGIN`, `PORT` | keeper | |
| `CLASH_MAX_PER_RESOLVE`, `DEMO_FAST`, `DRIP_AMOUNT_MON` | keeper | `DRIP_AMOUNT_MON` defaults to 5 (a seed buy needs 2-5 MON) |
| `DEPLOYER_ACCOUNT` | contracts scripts | name of the Foundry keystore account, not a key |
| `ENTROPY_ADDRESS`, `ENTROPY_PROVIDER` | contracts deploy script | Pyth Entropy contract and provider addresses, supplied by the user at deploy time |
| `ETHERSCAN_API_KEY` | contracts | optional, only for Monadscan verification; Sourcify needs none |

`.env.example` at the repo root lists names only. No role reads, writes or echoes a real `.env*` file. No role creates, imports or prints a private key; local rehearsals use anvil's public default accounts (start anvil with `--accounts 40` for house wallets).

## 8. Burner wallet rules

Testnet-only burner: `generatePrivateKey()` in the browser, kept in `localStorage` under `monster-arena.burner`, with a permanent banner "Testnet play-money, do not deposit real funds". It receives a drip from `POST /drip`, signs without popups, and writes with an explicit `gas` value. Injected wallets use EIP-6963 discovery and `wallet_addEthereumChain` with the viem chain object from section 1. While a balance is under 10 MON (reserve-balance rule) value-sending transactions from one account are serialised at least 4 blocks apart.

## 9. Display rules

Reserves display in MON in the existing compact format (`12.4K MON`) with exact values in the inspector; testnet MON has no price, so no USD is shown (a fixed demo rate is P2). Rank is client-derived: `rMon` descending, then `wins` descending, then token address ascending. All strings are English. Tickers are `[A-Z0-9]{2,7}` (enforced on chain), names length-limited; names and tickers are rendered with `textContent` or React text only, never interpolated into `innerHTML` (the prototype injects at :2789 and :3706). House coins are labelled "House" from `shared/house-coins.json`. Testnet play-money is stated permanently in the UI.
