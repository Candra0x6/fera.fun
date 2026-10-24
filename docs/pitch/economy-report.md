GATE: PASS

# Economy report

Simulator: `sim/` (Node, no dependencies, seeded). Final run seed 777001, all numbers below regenerate with `node sim/report.mjs --section <name>` and are stored in `sim/out`. This report models assumptions, not users: traders, whales and bots are configurable populations, and every number is only as good as those assumptions and the modelling choices listed in `sim/README.md`.

## Verdict

**PASS for the tuned parameter set, FAIL for the literal brainstorm parameters.** With the handoff's recommended parameters (gamma 0.85, pool factor clamp 0.1-10) the bright-line gate fails at the small-pool end on a held-out seed with 300000 runs per cell: the 0.25x coin has EV per MON 0.999 +-0.017 in the demo ruleset and 1.008 +-0.017 in the standard ruleset, above the 0.99 limit (the brainstorm-model ruleset gives 0.968, inside). Raising `gammaBps` to **8800** (one parameter, within the brainstorm's levers) puts every cell of every ruleset inside [0.85, 0.99]: lowest 0.912, highest 0.979. The contracts role must therefore take `gammaBps = 8800`, not 8500, and the PM must relay that change; `docs/handoffs/contracts.md` 2.1 still says 8500. The gamma value was chosen from a scan on other seeds (20261019 and 31, 100000 runs per cell, see "Alternatives tried") and verified here on a fresh seed, not tuned on this run.

| Gate condition | Result (tuned) |
|---|---|
| EV per MON in [0.85, 0.99] at 0.25x, 0.5x, 1x, 2x, 5x, all three rulesets | pass, 0.912 to 0.979 |
| 1-wei bot under 1 percent of the boost with the virtual buy-and-burn | pass, 0.000 percent (0.431 percent only when selling 0.28 percent of the coin's supply, proportional to size) |
| Bye-coin title-odds ratio within 5 percent of 1.0 under pairing at resolve | pass, 0.997 +-0.015 (demo preset 0.996 +-0.021) |
| Value of bracket information within noise of 0 under pairing at resolve | pass, 0.000 +-0.017 |
| Failing baselines can fail | yes: ghost premium 3.95 at 0.1x (first design), plain injection captured 99.0 percent, public bracket bye ratio 1.211 and informed value 0.157 |

Three caveats the user should read before accepting PASS (details below): the ghost premium returns below 0.25x whenever the lobby's mean pool exceeds about 8x `minSeed`; late buyers into a large pool are heavily disadvantaged by the curve at `vMon0 = 20 MON`; and the reproduction criterion is met only against the noise of the brainstorm's own 4000-run simulations in 3 of 24 cells.

## Reproduction of the brainstorm Economy table

Tagged coin among 29 coins at 10 MON each, element 1.15/0.87, level 4 percent per level (one level per win, no hunts, all pairs clash each epoch), 50/30/15/5 split, pairing random per epoch, 100000 runs per cell, intervals are 95 percent. EV per MON is all claims to the tagged coin's holders divided by the gross MON sent into it. The "first-capped" variant reproduced only when the capped excess goes to the loser's consolation pool.

| Variant | Source | 0.1x | 0.25x | 0.5x | 1x | 2x | 5x |
|---|---|---|---|---|---|---|---|
| first | this sim | 3.95 +-0.11 | 1.83 +-0.05 | 1.15 +-0.02 | 0.91 +-0.02 | 0.77 +-0.01 | 0.59 +-0.01 |
| | brainstorm | 3.97 | 1.83 | 1.15 | 0.93 | 0.78 | 0.59 |
| | within this sim CI + 0.05 | yes | yes | yes | yes | yes | yes |
| | within the CI of a 4000-run experiment + 0.05 | yes | yes | yes | yes | yes | yes |
| first-capped | this sim | 1.81 +-0.07 | 1.40 +-0.04 | 1.15 +-0.02 | 0.91 +-0.02 | 0.77 +-0.01 | 0.80 +-0.00 |
| | brainstorm | 1.86 | 1.43 | 1.15 | 0.93 | 0.78 | 0.80 |
| | within this sim CI + 0.05 | yes | yes | yes | yes | yes | yes |
| | within the CI of a 4000-run experiment + 0.05 | yes | yes | yes | yes | yes | yes |
| linear | this sim | 1.07 +-0.05 | 0.80 +-0.02 | 0.85 +-0.02 | 0.91 +-0.02 | 0.99 +-0.01 | 1.09 +-0.01 |
| | brainstorm | 1.27 | 0.85 | 0.82 | 0.92 | 0.99 | 1.11 |
| | within this sim CI + 0.05 | NO | yes | yes | yes | yes | yes |
| | within the CI of a 4000-run experiment + 0.05 | yes | yes | yes | yes | yes | yes |
| brainstorm-wide | this sim | 1.20 +-0.05 | 0.95 +-0.03 | 0.92 +-0.02 | 0.91 +-0.02 | 0.92 +-0.01 | 0.96 +-0.01 |
| | brainstorm | 1.39 | 0.94 | 0.87 | 0.91 | 0.91 | 0.97 |
| | within this sim CI + 0.05 | NO | yes | yes | yes | yes | yes |
| | within the CI of a 4000-run experiment + 0.05 | yes | yes | yes | yes | yes | yes |
| recommended | this sim | 1.20 +-0.05 | 0.95 +-0.03 | 0.92 +-0.02 | 0.91 +-0.02 | 0.92 +-0.01 | 0.96 +-0.01 |
| | brainstorm | 1.39 | 0.94 | 0.87 | 0.91 | 0.91 | 0.97 |
| | within this sim CI + 0.05 | NO | yes | yes | yes | yes | yes |
| | within the CI of a 4000-run experiment + 0.05 | yes | yes | yes | yes | yes | yes |

Secondary numbers from the recommended 1x cell (same runs): system EV per MON 0.921, champion redeem multiple 14.1x, first-knockout loser recovery 0.298x, knockout epochs 5.00, P(title) of the 1x coin 0.0327.

Strictly (this sim's own CI plus 0.05) three cells differ: `linear` 0.1x, and `brainstorm-wide`/`recommended` 0.1x (1.20 against 1.39, outside by about 0.05). The brainstorm numbers came from 4000-6000 runs, whose own interval at these cells is about +-0.29 at 0.1x, so all 24 cells agree within the noise of a 4000-run experiment. The first design is reproduced closely (3.95 at 0.1x against 3.97), as are the system numbers: system EV per MON 0.921 (brainstorm 0.924), champion multiple 14.1x (14.2x), 5 knockout epochs. One difference: exactly 50 percent of 30 coins leave in the first epoch of an uncapped round, not 52 percent.

## Red-team check 1: 1-wei sell after a merge

A bot holds a little of every coin and, after each resolve, sells a fixed amount of every winner. Captured value is what the sale pays above what the same sale paid just before the boost, as a share of all boost value (600 runs of 30 coins; the last epoch is excluded because the coin is then redeem-only). The failing baseline is the first design's plain injection: the boost raises `vMon` and `rMon` while `vTok` stays and the curve pays against the product cached at launch.

| Boost implementation | Tokens sold per winner (wei) | Share of the winner supply sold | Boost value captured above the pre-boost sale value (share of all boost) | Runs with a boost |
|---|---|---|---|---|
| plain injection, k cached from launch (first design) | 1 | 2.82e-25% | 99.000% (per-run 95% CI +-0.000 pts) | 600 |
| plain injection, k cached from launch (first design) | 1000000000 | 2.82e-16% | 99.000% (per-run 95% CI +-0.000 pts) | 600 |
| plain injection, k cached from launch (first design) | 1000000000000000000 | 2.82e-7% | 99.000% (per-run 95% CI +-0.000 pts) | 600 |
| plain injection, k cached from launch (first design) | 1000000000000000000000 | 2.82e-4% | 99.000% (per-run 95% CI +-0.000 pts) | 600 |
| plain injection, k cached from launch (first design) | 1000000000000000000000000 | 2.83e-1% | 99.000% (per-run 95% CI +-0.000 pts) | 600 |
| virtual buy-and-burn, k read from state (specified) | 1 | 2.82e-25% | 0.000% (per-run 95% CI +-0.000 pts) | 600 |
| virtual buy-and-burn, k read from state (specified) | 1000000000 | 2.82e-16% | 0.000% (per-run 95% CI +-0.000 pts) | 600 |
| virtual buy-and-burn, k read from state (specified) | 1000000000000000000 | 2.82e-7% | 0.000% (per-run 95% CI +-0.000 pts) | 600 |
| virtual buy-and-burn, k read from state (specified) | 1000000000000000000000 | 2.82e-4% | 0.000% (per-run 95% CI +-0.000 pts) | 600 |
| virtual buy-and-burn, k read from state (specified) | 1000000000000000000000000 | 2.83e-1% | 0.431% (per-run 95% CI +-0.000 pts) | 600 |

Under the specified virtual buy-and-burn a 1-wei sell pays nothing (ceil rounding), and a larger sale captures only an amount proportional to the share of supply sold. Plain injection hands the bot 99.0 percent (the rest is the 1 percent trade fee) for any dust size.

## Red-team check 2: ghost coins

Gate table: EV per MON of a coin whose pool is the stated multiple of the mean, 300000 runs per cell, with the permanent seed in force. At 0.1x the pool is below `minSeed` (2 MON demo, 10 MON standard) and cannot exist at these means, so the cell is the formula-only comparison; the permanent seed and the seed floor cover it only while the mean pool stays at or below about 8x `minSeed`. The first-design failing baseline (about 3.97 at 0.1x) is in the reproduction table above.

### Parameter set `recommended` (gamma 0.85, pool factor clamp 0.1-10)

Ruleset `repro` (30 coins, mean pool 10 MON, 300000 runs per cell):

| Pool vs mean | Tagged pool (MON) | EV per MON (95% CI) | In band [0.85, 0.99] | Seed holder EV | Buyer cohort EV | P(title) |
|---|---|---|---|---|---|---|
| 0.1x | 1.0 | 1.228 +-0.030 | n/a, shown for comparison | 1.23 | 0.00 | 0.0040 |
| 0.25x | 2.5 | 0.968 +-0.017 | yes | 0.99 | 0.87 | 0.0077 |
| 0.5x | 5.0 | 0.929 +-0.012 | yes | 1.06 | 0.84 | 0.0156 |
| 1x | 10.0 | 0.912 +-0.009 | yes | 1.25 | 0.83 | 0.0327 |
| 2x | 20.0 | 0.925 +-0.007 | yes | 1.70 | 0.84 | 0.0704 |
| 5x | 50.0 | 0.952 +-0.004 | yes | 3.06 | 0.87 | 0.1786 |

Ruleset `demo` (30 coins, mean pool 10 MON, 300000 runs per cell):

| Pool vs mean | Tagged pool (MON) | EV per MON (95% CI) | In band [0.85, 0.99] | Seed holder EV | Buyer cohort EV | P(title) |
|---|---|---|---|---|---|---|
| 0.1x | 1.0 | 1.392 +-0.034 | n/a, shown for comparison | 1.39 | 0.00 | 0.0049 |
| 0.25x | 2.5 | 0.999 +-0.017 | NO | 1.02 | 0.90 | 0.0082 |
| 0.5x | 5.0 | 0.937 +-0.012 | yes | 1.07 | 0.85 | 0.0160 |
| 1x | 10.0 | 0.923 +-0.009 | yes | 1.27 | 0.84 | 0.0335 |
| 2x | 20.0 | 0.925 +-0.007 | yes | 1.70 | 0.84 | 0.0704 |
| 5x | 50.0 | 0.948 +-0.004 | yes | 3.04 | 0.86 | 0.1767 |

Ruleset `standard` (30 coins, mean pool 50 MON, 300000 runs per cell):

| Pool vs mean | Tagged pool (MON) | EV per MON (95% CI) | In band [0.85, 0.99] | Seed holder EV | Buyer cohort EV | P(title) |
|---|---|---|---|---|---|---|
| 0.1x | 5.0 | 1.431 +-0.034 | n/a, shown for comparison | 1.43 | 0.00 | 0.0052 |
| 0.25x | 12.5 | 1.008 +-0.017 | NO | 1.09 | 0.67 | 0.0084 |
| 0.5x | 25.0 | 0.938 +-0.012 | yes | 1.42 | 0.62 | 0.0160 |
| 1x | 50.0 | 0.918 +-0.009 | yes | 2.16 | 0.61 | 0.0331 |
| 2x | 100.0 | 0.923 +-0.007 | yes | 3.72 | 0.61 | 0.0700 |
| 5x | 250.0 | 0.944 +-0.004 | yes | 8.58 | 0.63 | 0.1755 |

### Parameter set `tuned` (gamma 0.88, pool factor clamp 0.1-10)

Ruleset `repro` (30 coins, mean pool 10 MON, 300000 runs per cell):

| Pool vs mean | Tagged pool (MON) | EV per MON (95% CI) | In band [0.85, 0.99] | Seed holder EV | Buyer cohort EV | P(title) |
|---|---|---|---|---|---|---|
| 0.1x | 1.0 | 1.193 +-0.030 | n/a, shown for comparison | 1.19 | 0.00 | 0.0038 |
| 0.25x | 2.5 | 0.934 +-0.016 | yes | 0.96 | 0.84 | 0.0072 |
| 0.5x | 5.0 | 0.912 +-0.012 | yes | 1.04 | 0.83 | 0.0151 |
| 1x | 10.0 | 0.912 +-0.009 | yes | 1.25 | 0.83 | 0.0328 |
| 2x | 20.0 | 0.937 +-0.007 | yes | 1.72 | 0.85 | 0.0719 |
| 5x | 50.0 | 0.979 +-0.005 | yes | 3.15 | 0.89 | 0.1865 |

Ruleset `demo` (30 coins, mean pool 10 MON, 300000 runs per cell):

| Pool vs mean | Tagged pool (MON) | EV per MON (95% CI) | In band [0.85, 0.99] | Seed holder EV | Buyer cohort EV | P(title) |
|---|---|---|---|---|---|---|
| 0.1x | 1.0 | 1.363 +-0.033 | n/a, shown for comparison | 1.36 | 0.00 | 0.0048 |
| 0.25x | 2.5 | 0.968 +-0.017 | yes | 0.99 | 0.87 | 0.0078 |
| 0.5x | 5.0 | 0.923 +-0.012 | yes | 1.06 | 0.84 | 0.0156 |
| 1x | 10.0 | 0.923 +-0.009 | yes | 1.27 | 0.84 | 0.0335 |
| 2x | 20.0 | 0.939 +-0.007 | yes | 1.72 | 0.85 | 0.0721 |
| 5x | 50.0 | 0.974 +-0.005 | yes | 3.13 | 0.89 | 0.1845 |

Ruleset `standard` (30 coins, mean pool 50 MON, 300000 runs per cell):

| Pool vs mean | Tagged pool (MON) | EV per MON (95% CI) | In band [0.85, 0.99] | Seed holder EV | Buyer cohort EV | P(title) |
|---|---|---|---|---|---|---|
| 0.1x | 5.0 | 1.403 +-0.034 | n/a, shown for comparison | 1.40 | 0.00 | 0.0050 |
| 0.25x | 12.5 | 0.982 +-0.017 | yes | 1.07 | 0.65 | 0.0081 |
| 0.5x | 25.0 | 0.922 +-0.012 | yes | 1.39 | 0.61 | 0.0155 |
| 1x | 50.0 | 0.918 +-0.009 | yes | 2.16 | 0.61 | 0.0331 |
| 2x | 100.0 | 0.936 +-0.007 | yes | 3.78 | 0.62 | 0.0716 |
| 5x | 250.0 | 0.970 +-0.004 | yes | 8.81 | 0.65 | 0.1829 |

The seed-holder column is above 1 for large pools: tokens bought first are cheapest on the curve, so the creator's seed holds more of the supply than of the reserve. That wedge does not change coin-level EV (the gate metric) but moves value between holders; see the curve finding.

### Ghost premium below 0.25x

A 2 MON coin (the demo `minSeed`) among richer lobbies (40000 runs per cell). It is reachable whenever the mean pool is large, and no tuning of gamma removes it:

| Parameter set | 2 MON vs mean 10 (0.20x) | 2 MON vs mean 20 (0.10x) | 2 MON vs mean 40 (0.05x) | 2 MON vs mean 100 (0.02x) |
|---|---|---|---|---|
| first design (failing baseline) | 2.41 +-0.09 | 4.38 +-0.18 | 8.34 +-0.36 | 20.23 +-0.90 |
| brainstorm recommended (gamma 0.85, clamp 0.1-10) | 1.07 +-0.06 | 1.44 +-0.10 | 2.44 +-0.18 | 5.50 +-0.45 |
| tuned (gamma 0.88, clamp 0.1-10) | 1.04 +-0.06 | 1.41 +-0.09 | 2.43 +-0.18 | 5.44 +-0.44 |
| hardened: boost capped at winner reserve, gamma 0.60 | 0.80 +-0.04 | 0.60 +-0.04 | 0.45 +-0.04 | 0.49 +-0.07 |

With the tuned set a minimum-seed coin earns 1.41 per MON in a lobby averaging 20 MON and 5.4 in one averaging 100 MON. The absolute amount is small (a few MON per ghost, each costing a launch fee and a lobby slot, at most 2 per address), so this is not a blocker on play-money testnet, but it is a real hole for any larger mean pool. Two fixes are tested: a boost capped at the winner's own reserve with the excess added to the loser's consolation (structural, changes `contracts.md` 2.6; ghost EV falls to 0.45-0.80 at every lobby size), or keeping `minSeed` at or above one quarter of the expected mean pool (house coins seeded at 10 MON average, so `minSeed` 3 MON in the demo preset and 15 MON in the standard preset with house coins at 50 MON).

## Red-team check 3: early-public bracket

Predicted bye coin: the coin the pairing rule, applied to the information a trader has while trading is open (previous epoch's seed), leaves out. Under a public bracket that is the real bye coin; under pairing at resolve it is independent of the real draw. Ratio = title odds of that coin over the average coin's. 300000 runs.

| Ruleset | Pairing regime | Title-odds ratio of the predicted bye coin (95% CI) | Runs |
|---|---|---|---|
| 30 coins, uncapped clashes (15 alive in the first bye epoch) | previous epoch seed, bracket public during trading | 1.211 +-0.014 | 300000 |
| 30 coins, uncapped clashes (15 alive in the first bye epoch) | new seed at resolve behind the lock | 0.997 +-0.015 | 300000 |
| demo preset (cap 6 clashes per epoch, idle coins count as byes) | previous epoch seed, bracket public during trading | 1.059 +-0.020 | 300000 |
| demo preset (cap 6 clashes per epoch, idle coins count as byes) | new seed at resolve behind the lock | 0.996 +-0.021 | 300000 |

| Regime | Informed trader edge per MON (95% CI) | Information-free trader edge (same rule, unrelated pairing) | Difference = value of the bracket information | Null edge (arbitrary pair, expected 0) |
|---|---|---|---|---|
| public bracket (previous epoch seed) | 0.201 +-0.012 | 0.045 +-0.012 | 0.157 +-0.017 | -0.010 +-0.012 |
| pairing at resolve behind the lock | 0.047 +-0.012 | 0.046 +-0.012 | 0.000 +-0.017 | 0.011 +-0.012 |

The public bracket gives the predicted bye coin 1.21x title odds in the uncapped 30-coin round (the red-team run saw about 1.46x with a different setup; the effect is visible and its sign and size depend on how many coins are alive when the bye falls) and 1.06x in the demo preset, where 18 of 30 coins sit out the first knockout epoch. Behind the lock the ratios are 0.997 and 0.996. The informed trader (buys the favourite and dumps the underdog of the most lopsided pair) earns 0.201 per MON with a public bracket. A small edge of about 0.046 remains in both regimes because the alive set's element mix is public (a metagame effect, not a bracket leak); the value of the bracket information is 0.157 under a public bracket and 0.000 +-0.017 behind the lock.

## Recommended final parameter set

Transcribe into the demo and standard presets of `contracts.md` 2.1. Changed values are in bold.

| Parameter | demo | standard | Note |
|---|---|---|---|
| `gammaBps` | **8800** | **8800** | was 8500; fixes the 0.25x cell |
| `poolFactorMinBps` / `poolFactorMaxBps` | 1000 / 100000 | same | unchanged |
| `boostBps / consolationBps / potBps / treasuryBps` | 5000 / 3000 / 1500 / 500 | same | unchanged (see decisions) |
| `consolationMode` | 0 | 0 | holders |
| `levelBonusBps`, `elementUpBps`, `elementDownBps` | 400, 11500, 8700 | same | no measurable effect on EV in the sweeps |
| `winProbMinBps` / `winProbMaxBps` | 1500 / 8500 | same | see decisions |
| `huntWinPct` | 50 | 50 | simulator xp: hunt 10, win 20, thresholds 0 15 35 60 90 125 165 210 260 320 |
| `minSeed` / `maxSeed` (MON) | **3** / 50 | **15** / 500 | keeps the smallest pool at 0.25x or more of a 10 MON (demo) or 50 MON (standard) mean |
| `clashesPerEpoch` | 6 | 4 | gives 7 knockout epochs (10 total) in the demo and 9 (19 total) in the standard |
| `levelingEpochs` | 3 | 10 | unchanged |
| `vMon0` / `vTok0` | **200 MON** / 1e9 tokens (1e27 wei) | same | was 20 MON; see the curve finding |
| `tradeFeeBps` | 100 | 100 | unchanged |

Simulator assumptions the contracts role should confirm: the creator seed is bought without the trade fee; accrued fees split half to the pot and half to the treasury; power uses values frozen at the lock.

## Curve finding: value moves from late buyers to the seed

Claims are per token and tokens are cheapest first, so with `vMon0 = 20 MON` the creator's seed earns 1.27 per MON in a 1x pool and 3.10 in a 5x pool, while the buyer cohort earns 0.84 and 0.88. A single small buyer into the leading coin does far worse (see the trader table: 0.38 per MON in the demo, 0.13 in the standard preset for the strongest coin bought at the last moment). Coin-level EV is unchanged by the curve. Raising `vMon0` flattens the wedge (20000 runs, demo, tuned):

| vMon0 (MON) | Seed holder EV at 1x | Buyer cohort EV at 1x | Seed holder EV at 5x | Buyer cohort EV at 5x | Coin-level EV at 1x |
|---|---|---|---|---|---|
| 20 | 1.27 | 0.84 | 3.10 | 0.88 | 0.926 |
| 50 | 1.08 | 0.89 | 1.87 | 0.93 | 0.926 |
| 100 | 1.01 | 0.91 | 1.43 | 0.94 | 0.926 |
| 200 | 0.97 | 0.92 | 1.20 | 0.95 | 0.926 |
| 500 | 0.95 | 0.92 | 1.07 | 0.96 | 0.926 |

`vMon0` 200 MON brings seed and buyers within 0.97 and 0.92 at 1x. It is a configuration change, not a design change, and it does not affect check 1 (a 1-wei sale still rounds to zero).

## Other measured numbers

Trader population (60 small traders of three kinds, 30 coins with creator seeds, a last-moment buyer, 20000 runs), tuned parameters, `vMon0` 20 MON:

| Metric (trader population, 30 coins) | demo preset | standard preset |
|---|---|---|
| Champion redeem multiple (redeem pool / MON put into the champion) | 11.94 +-3.71 | 9.51 +-6.56 |
| Share of coins out in the first knockout epoch | 0.200 +-0.001 | 0.133 +-0.001 |
| Their recovery through consolation (x of MON put in) | 0.298 +-0.000 | 0.299 +-0.000 |
| System EV per MON (all claims / all MON put in) | 0.923 +-0.000 | 0.923 +-0.000 |
| Epochs to completion (leveling plus knockout) | 10.00 +-0.00 | 19.00 +-0.00 |
| Clashes played | 29.00 +-0.00 | 29.00 +-0.00 |
| Gini of final holder value (creators and traders) | 0.609 +-0.001 | 0.728 +-0.000 |
| Creator seed EV per MON | 1.151 +-0.002 | 1.026 +-0.001 |
| Uniform small buyers, EV per MON deployed | 0.835 +-0.002 | 0.706 +-0.002 |
| Momentum buyers, EV per MON deployed | 0.767 +-0.004 | 0.680 +-0.003 |
| Level-chasing buyers, EV per MON deployed | 0.766 +-0.003 | 0.681 +-0.002 |
| Random coin bought at the last moment before each lock, win rate | 0.506 +-0.003 | 0.503 +-0.003 |
| Strongest public-power coin bought at the last moment, win rate | 0.638 +-0.003 | 0.635 +-0.003 |
| Strongest public-power coin bought at the last moment, EV per MON | 0.377 +-0.004 | 0.130 +-0.002 |

| Whale buying 100 MON before the first lock | demo EV per MON | demo share of all final value | standard EV per MON | standard share of all final value |
|---|---|---|---|---|
| top | 0.164 +-0.004 | 1.99% | 0.176 +-0.004 | 0.88% |
| spread | 0.694 +-0.002 | 9.22% | 0.318 +-0.002 | 1.60% |
| single | 0.613 +-0.011 | 8.10% | 0.300 +-0.009 | 1.51% |

Notes: 20 percent (demo) and 13 percent (standard) of coins leave in the first knockout epoch because of the clash cap, against 50 percent uncapped; their consolation recovery is 0.30x. System EV per MON is 0.923, a 7.7 percent rake. The champion's multiple is lower than the 14x of equal static pools because traders add money after the lock rounds. Gini is high because the champion's holders take most value. A coin bought just before the lock wins 50 percent of its clashes if chosen at random and 64 percent if it is the strongest by public power, which is public information and is priced into nothing, but that coin costs the most on the curve (EV 0.38 per MON, demo). A 100 MON whale does worst when it buys the top coin (0.16 per MON) and best when it spreads (0.69), and never exceeds 9 percent of final value; the curve, not the odds, penalises it. Every clash count is 29; the demo round is 10 epochs.

## Alternatives tried

Gamma scan (other seed, 100000 runs per cell, EV per MON, 0.25x / 1x / 5x), demo: 0.85 -> 0.99 / 0.91 / 0.95; 0.90 -> 0.94 / 0.91 / 0.99; 0.95 -> 0.90 / 0.91 / 1.03; 1.00 -> 0.86 / 0.91 / 1.08. Standard: 0.85 -> 1.04 / 0.93 / 0.95; 0.90 -> 0.99 / 0.93 / 0.99; 0.95 -> 0.94 / 0.93 / 1.04. The two ends move in opposite directions, so only a narrow gamma works; 0.88 sits in the middle. Adding a lower win-probability ceiling to gamma 0.90 (75 or 80 percent) was tried and was worse or no better than gamma 0.88 alone (0.25x 0.98 to 1.07).

Other levers (demo, 20000 runs, noisy at +-0.07 at 0.25x):

| Parameter set (demo ruleset) | 0.25x | 1x | 5x | ghost 2 MON vs 20 | ghost 2 MON vs 40 |
|---|---|---|---|---|---|
| recommended (gamma 0.85) | 1.03 +-0.07 | 0.93 +-0.03 | 0.96 +-0.02 | 1.42 +-0.13 | 2.41 +-0.25 |
| split 40/40/15/5 | 0.99 +-0.05 | 0.93 +-0.03 | 0.99 +-0.01 | 1.28 +-0.10 | 2.03 +-0.18 |
| split 60/20/15/5 | 1.07 +-0.09 | 0.91 +-0.04 | 0.94 +-0.02 | 1.57 +-0.18 | 2.87 +-0.35 |
| split 50/25/25/0 | 1.10 +-0.09 | 1.00 +-0.05 | 1.08 +-0.02 | 1.53 +-0.18 | 2.65 +-0.34 |
| element 1.00/1.00 | 1.02 +-0.07 | 0.93 +-0.03 | 0.97 +-0.02 | 1.43 +-0.13 | 2.44 +-0.26 |
| element 1.30/0.77 | 1.04 +-0.07 | 0.93 +-0.03 | 0.94 +-0.02 | 1.46 +-0.14 | 2.45 +-0.26 |
| level bonus 0% | 1.03 +-0.07 | 0.93 +-0.03 | 0.96 +-0.02 | 1.41 +-0.13 | 2.42 +-0.26 |
| level bonus 8% | 1.03 +-0.07 | 0.92 +-0.03 | 0.96 +-0.02 | 1.43 +-0.13 | 2.46 +-0.26 |
| win clamp 5-95% | 1.02 +-0.07 | 0.93 +-0.03 | 0.96 +-0.02 | 1.09 +-0.11 | 1.54 +-0.20 |
| win clamp 25-75% | 1.18 +-0.08 | 0.93 +-0.03 | 0.88 +-0.02 | 2.19 +-0.17 | 3.93 +-0.34 |
| consolation to survivors (spread) | 0.95 +-0.14 | 0.91 +-0.07 | 1.07 +-0.03 | 1.37 +-0.26 | 2.58 +-0.51 |
| boost capped, gamma 0.60 | 0.90 +-0.06 | 0.93 +-0.03 | 0.95 +-0.01 | 0.59 +-0.06 | 0.44 +-0.05 |
| boost capped, gamma 0.70 | 0.77 +-0.05 | 0.93 +-0.03 | 1.02 +-0.01 | 0.48 +-0.04 | 0.42 +-0.04 |

Reading: split, element, and level bonus barely move the ends; a 5 percent win-probability floor cuts the ghost premium (1.09 against 1.42 at 2 MON vs 20) without moving 5x; a 25-75 clamp makes small coins much better (1.18) and is the wrong direction; the spread mode needs 10x more runs to read (very high variance); a boost cap kills ghosts but pushes the small end to 0.77-0.90, below the band at 0.25x unless gamma is lowered further.

## Decisions for the user

| Decision | Recommendation | Why |
|---|---|---|
| `gammaBps` | 8800 instead of 8500 | the only value tested that keeps both ends in band in all rulesets; 8500 fails at 0.25x (0.999 demo, 1.008 standard) |
| Merger split | keep 50 / 30 / 15 / 5 | alternatives moved the ends by less than the noise except 50/25/25/0, which raised EV above the band |
| Seed bounds | demo 3 to 50 MON, standard 15 to 500 MON | the smallest pool must stay at or above 0.25x the mean; house coins should be seeded around 10 MON (demo) so the mean stays near 10 |
| Win probability clamp | keep 15 to 85 percent; consider a 5 percent floor | the floor is what gives ghosts their premium at 0.1x and below; changing it overturns a recorded decision |
| Boost cap (excess to the loser's consolation) | consider before any mainnet or large-pool play | the only tested fix that bounds ghost EV for any lobby size; changes the merger rule in `contracts.md` 2.6 |
| Consolation mode | keep holders (0) | spread-to-survivors was too noisy to evaluate and adds an ordering rule the contracts do not define |
| Element multipliers | keep 1.15 / 0.87 | no measurable effect on EV; metagame edge of about 0.05 per MON exists and is public |
| `vMon0` | 200 MON instead of 20 | removes most of the seed-over-buyer wedge; no effect on the gate |

Not legal advice; framing and wording are in `docs/pitch/copy.md`.

GATE: PASS
