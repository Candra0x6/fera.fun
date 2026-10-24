# sim: the arena economy simulator

A deterministic Node simulation of the Monster Arena economy. It mirrors `docs/handoffs/contracts.md` section 2.6 (curve, combat, merger, settlement) and reproduces the economy table of the brainstorm plan (`docs/brainstorm/2026-10-19-monad-monster-arena-onchain.md`, section "Economy"). It exists to gate the contract work: `docs/pitch/economy-report.md` reports the verdict.

No dependencies, no build step. Plain ES modules run by Node 22 or newer (developed on Node 26). Money is `bigint` wei exactly as the contracts hold it; floats appear only for the power and pool-factor maths and for reported ratios.

## Run

```bash
node sim/run.mjs --seed 1 --coins 30 --runs 4000 --variant recommended
node sim/run.mjs --variant all --runs 4000
node sim/test.mjs
node sim/report.mjs --section gate,check1,check3,verdict
```

`run.mjs` options: `--seed N`, `--coins N` (default 30), `--runs N` (default 4000), `--variant first | first-capped | linear | brainstorm-wide | recommended | tuned | all`, `--preset repro | demo | standard` (default `repro`, the brainstorm model), `--pool MON` (mean pool, default 10), `--workers K` (default 1, in-process), `--overrides '{"gammaBps":6000}'`. Same seed and same options print identical output.

The summary table has one row per pool multiple (0.1x, 0.25x, 0.5x, 1x, 2x, 5x of the mean) for one tagged coin among otherwise equal coins: EV per MON staked with a 95 percent interval, the seed holder's and the buyer cohort's EV, the tagged coin's title probability and the chance it is out in the first knockout epoch. The last line gives the system EV per MON (one minus the rake), the champion redeem multiple, the first-knockout loser recovery and the number of epochs.

`report.mjs` runs the long experiments on worker threads (`SIM_WORKERS`, default 3) and writes tables and JSON into `sim/out`; the economy report is assembled from those files. Sections: `repro`, `gate`, `ghost`, `check1`, `check3`, `sweeps`, `curve`, `dynamic`, `verdict`.

## Variants

| Name | Pool factor | Boost rule |
|---|---|---|
| `first` | sqrt (gamma 0.5), clamp 0.75-1.35 | whole boost goes to the winner |
| `first-capped` | same | boost capped at the winner's own reserve, the excess is added to the loser's consolation pool |
| `linear` | gamma 1, clamp 0.05-20 | uncapped |
| `brainstorm-wide` | gamma 0.85, clamp 0.05-20 | uncapped (the brainstorm table's "recommended" row) |
| `recommended` | gamma 0.85, clamp 0.1-10 | uncapped (the handoff's recommended parameters) |
| `tuned` | gamma 0.88, clamp 0.1-10 | uncapped (the final proposal of the economy report) |

Presets: `repro` is the brainstorm model (no leveling epochs, level is one plus wins, no hunts, all pairs clash each epoch). `demo` and `standard` are the two presets of `contracts.md` 2.1 with hunts, xp and the clash cap.

## Function map

| Module | Function | Implements |
|---|---|---|
| `curve.mjs` | `newCurve`, `ceilDiv` | per-coin virtual-reserve state `vMon`, `vTok`, `rMon`, ceil rounding in the pool's favour (`contracts.md` 2.6, Curve) |
| `curve.mjs` | `quoteBuy`, `buy` | `in' = in*(1-fee)`, `out = vTok - ceil(k/(vMon+in'))`, `k` read from current state |
| `curve.mjs` | `quoteSell`, `sell` | `gross = vMon - ceil(k/(vTok+t))`, fee on the gross, `rMon` decreases by the gross, solvency asserted |
| `curve.mjs` | `boost` | virtual buy-and-burn: `k = vMon*vTok; vMon += X; rMon += X; vTok = ceil(k/vMon)` |
| `curve.mjs` | `boostPlain`, `newCurve(..., kCached)` | the first-design bug kept as a failing baseline: reserve injected without shrinking `vTok`, `k` cached from launch (red-team hole 1) |
| `curve.mjs` | `spot` | spot price for diagnostics |
| `combat.mjs` | `elementBps` | element cycle fire > ice > earth > electric > dark > fire, 1.15 and 0.87 (`contracts.md` section 1, Catalog) |
| `combat.mjs` | `levelFromXp` | level lookup on xp thresholds, 1 to 10 (`contracts.md` 2.6, Combat) |
| `combat.mjs` | `poolFactor` | `clamp((rMonAtLock / meanRMonAlive)^gamma, min, max)` |
| `combat.mjs` | `power`, `winProbBps` | `baseStat * (1 + levelBonus*(level-1)) * element * poolFactor`; `powA/(powA+powB)` clamped to 15-85 percent |
| `combat.mjs` | `pairing` | Fisher-Yates permutation from `(seed, aliveMask)` with the PAIR tag, odd coin out, reproducible across batched resolves |
| `combat.mjs` | `clashRoll`, `huntRoll` | domain-tagged draws CLASH and HUNT (T15) |
| `rng.mjs` | `mix`, `derive`, `mulberry32`, `pick` | seeded randomness; `mix(seed, tag, idx)` stands in for `keccak(seed, tag, idx)` |
| `config.mjs` | `makeConfig`, `mon`, `PRESETS`, `VARIANTS` | `RoundConfig` of `contracts.md` 2.1 and its two presets, plus the simulator-only knobs |
| `round.mjs` | `createRound`, `launchCoin`, `startRound` | lobby, launch with permanent creator seed held by the arena, `startRound` |
| `round.mjs` | `buyCoin`, `sellCoin` | trading with the global lock enforced (T4); the creator seed tokens are not in any holder balance, so they cannot be sold (T2) |
| `round.mjs` | `lockEpoch` | snapshots `rMonAtLock`, levels and the alive list, freezes trading (`contracts.md` 2.3) |
| `round.mjs` | `resolveEpoch` | pairing at resolve, clash rolls, byes, the merger split, hunts, xp and levels, fee sweep, unlock, settlement; `maxClashes` batching (`contracts.md` 2.6, Combat and Merger) |
| `round.mjs` | `claimRate`, `claimValue` | fixed-rate consolation (`consolationPool / consolationSupply`) and champion redeem at `(rMon + pot) / supply` |
| `round.mjs` | `totalLiabilities`, `totalDeposits` | invariant 1, counters not balances (`contracts.md` 2.7) |
| `round.mjs` | `playToEnd`, `epochSeed` | the epoch loop with hooks for traders |
| `experiments.mjs` | `buildStaticRound`, `evCell` | the brainstorm economy table: one tagged coin at a pool multiple among equal coins, EV per MON staked, cohorts, title odds, rake, champion multiple, epochs |
| `dynamic.mjs` | `runDynamic` | trader populations (uniform, momentum, level-chasing), a whale, last-moment buyers; champion multiple, first-knockout share and recovery, system EV, Gini, whale value, pre-lock win rate |
| `checks.mjs` | `check1` | red-team hole 1: a bot sells dust of every winner right after each resolve, under plain injection and under the virtual buy-and-burn |
| `checks.mjs` | `check3Bye`, `check3Edge` | red-team hole 3: title odds of the predicted bye coin and the informed trader's edge under a public bracket versus pairing at resolve |
| `stats.mjs` | `acc`, `push`, `ci`, `gini`, `batchRatio` | Welford statistics, 95 percent intervals, Gini, batch-means ratio interval |
| `merge.mjs`, `parallel.mjs`, `worker.mjs` | `mergeResults`, `runChunked` | parallel chunks merged in a fixed order |
| `report.mjs` | sections | the experiments of `docs/pitch/economy-report.md` |
| `test.mjs` | 13 tests | curve solvency fuzz, T1 one-wei sell, conservation at every merger, liabilities equal deposits after every resolve, claim dust, determinism, batched resolve equality (1, 6, 255), T4 lock, pairing permutation and domain tags, T6 zero-supply resolve, T2 seed not sellable, full rounds in all presets |

Red-team hole 2 (ghost coins) is `evCell` with the tagged coin at 0.25x to 5x and the `ghost` section (a 2 MON coin among richer lobbies).

## Modelling assumptions the contracts do not fix

These are the simulator's choices where `contracts.md` and the brainstorm plan are silent. Each is a question for the contracts role if the contracts decide differently; the simulator is then updated from their tests.

| Topic | Choice in the simulator |
|---|---|
| EV per MON staked | all claims paid to every holder of the tagged coin (consolation, or redeem for the champion) divided by the gross MON sent into it (seed plus buys, fee included), everyone holding to the end |
| Pool multiples | the tagged coin's reserve at the first lock is the multiple times the mean; others are equal; the seed is `min(pool, minSeed)` and the rest is one buy; a pool below `minSeed` is allowed only for the formula-only comparison cell |
| Seed buy fee | the creator seed is bought without the trade fee; the launch fee goes to the treasury and is not modelled |
| Fee sweep | accrued trade fees are split half to the prize pot and half to the treasury at resolve (`feeToPotBps`) |
| Boost cap variants | when the boost is capped at the winner's reserve the excess is added to the loser's consolation pool (this reproduced the brainstorm cell at 5x; sending it to the pot did not) |
| `SpreadSurvivors` | the consolation share of each clash is spread, at the end of the epoch, to the surviving coins other than that clash's winner, pro rata to `rMon`, as a virtual buy-and-burn each; if none is eligible it goes to the pot |
| Levels | in `demo` and `standard`: a hunt success gives 10 xp, a clash win 20 xp, thresholds 0, 15, 35, 60, 90, 125, 165, 210, 260, 320; in `repro`: level equals one plus wins |
| Frozen inputs | power uses the level, the reserve and the mean at the lock, so batched resolves cannot change the odds mid-resolve |
| Cap on clashes | coins that are not paired because of `clashesPerEpoch` simply do not fight that epoch (an implicit bye) |
| Public bracket baseline | the previous epoch's seed, hashed once more, gives the pairing that traders can see before the lock |
| Plain injection baseline | `vMon` and `rMon` rise by the boost, `vTok` stays, and sells are priced against the product cached at launch |
| Hash | a 32-bit integer mix with domain tags replaces keccak; the distribution is what matters for the economy |
| Pool factor | computed in doubles, the contract uses `powWad`; the difference is far below the noise |

## Reading the intervals

Every mean is printed with a 95 percent interval (1.96 standard errors). EV per MON has heavy tails because the champion's multiple is about 14x, so the interval at 4000 runs is wide (about plus or minus 0.07 at 1x and plus or minus 0.3 at 0.1x). The gate in the economy report uses far more runs per cell, listed next to every table.
