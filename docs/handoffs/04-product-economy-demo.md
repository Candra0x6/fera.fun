# 04 — Product, economy and demo

## Context — read first

1. `docs/handoffs/contracts.md` — sections 1, 2.1 (round configuration and presets), 2.5 (events the demo narrates), 2.6 (curve, combat and merger rules you simulate), 2.7 (invariants and the three red-team holes), 9 (display rules). You never change it; you recommend parameter values.
2. `docs/brainstorm/2026-10-19-monad-monster-arena-onchain.md` — the authoritative design (it wins every conflict). Read in full: Spec section 1 (money model, curve, combat, round config, threat model T1-T15 and the **Economy** table you must reproduce), section 3 (event to animation), section 5 (epics E0 and E8), Open questions, Prompt A first task (the simulator). Read-only: never modify anything under `docs/brainstorm/`.
3. `docs/brainstorm/2026-10-19-monad-monster-arena-onchain/architecture.md` — merger flow, epoch sequence, lifecycles, failure modes. `research.md` R30-R37 (launchpad prior art, exploits, regulatory flags).
4. `docs/handoffs/00-overview.md` — demo path (the runbook you write matches it step for step), ownership, dispatch order.
5. `docs/research/05-synthesis.md` — decisions, unverified assumptions, risks.
6. `docs/research/03-domain.md` — Findings 3 (comparables), 4 (the five merger attacks), 6 (risks), "Guardrails that make the merger credible", Recommendations. Its hackathon material is informational only: there is no competition target.
7. `docs/research/01-design-system.md` — F12.1 and F12.2 (strings to replace), "Proposed additions" P2, P4, P5, P6 for the string slots you fill.
8. `docs/research/04-repo-audit.md` — Implications per role / product (what the scene honestly shows, truth first show later).

## Tools — skills and MCP

Nothing was installed for this role (see `docs/research/06-tooling.md`). Use what is already on the machine: `dataviz` (before drawing any chart in the economy report), `bri-tech-writer` (README and runbook clarity), `anthropic-skills:pptx` (optional pitch deck from `docs/pitch/outline.md`; confirm with the PM first because a binary deck is outside the markdown deliverables). The project MCP servers `monad-docs` (read-only chain facts) and `context7` (public library questions only) are available after the user approves them in a new session; never call `monad-docs` `submit_feedback`.

## Owned paths

- `README.md` (repo root)
- `docs/pitch/**`
- `docs/demo/**`
- `sim/**`

You write nothing else. `docs/research/`, `docs/handoffs/` and `docs/brainstorm/` are read-only for you (the PM edits the first two).

## Responsibilities

1. Make the economy provably non-degenerate **before any curve or combat Solidity is written**: rebuild the simulator, reproduce the brainstorm economy table, run the three red-team checks, tune, and publish a GATE verdict with final parameters.
2. Own every word the user reads in the product: rules card, banners, toasts, errors, Chosen One screen, and the wording rules.
3. Own the demo: runbook, pre-flight checklist, fallback, and the QA walk of the demo path against the acceptance criteria.
4. Own the project narrative: README, pitch outline, provenance statement, what is real versus simplified.

## Scope

### In scope

- A deterministic simulation of the arena economy (`sim/`) that mirrors `contracts.md` 2.6 exactly.
- `docs/pitch/economy-report.md` with the GATE verdict and final recommended parameters.
- `docs/pitch/copy.md`: the single source of UI strings and wording rules consumed by the frontend role.
- `docs/demo/runbook.md`, `docs/demo/qa-checklist.md`, `docs/demo/fallback.md`.
- `docs/pitch/outline.md`, `docs/pitch/provenance.md`, `docs/pitch/video-shotlist.md`, root `README.md`.

### Out of scope

- Production code in `contracts/`, `keeper/`, `web/`, `shared/`. Findings go in reports and the PM routes them.
- Legal advice. You write framing and wording and flag that legal review is the user's job.
- Deciding parameters unilaterally: you recommend; the contracts role implements the values in your report after the PM relays the go.
- Creating tasks in any external task tool.

## Objectives

1. No degenerate economy ships: the simulation reproduces the brainstorm table within noise and shows EV per MON staked within the target band for pool sizes 0.25x to 5x.
2. The three red-team holes are closed in simulation as well as in contract tests: 1-wei sell after a merge, ghost-coin EV, early-public bracket.
3. A judge never sees a word that reads as gambling, nor a label that says the chain part is fake.
4. The demo can be run by a person who has not read the code, from the runbook alone, with a fallback for every external dependency.

## Requirements

Phase P0a — the simulator and the gate (do first; everything else of the contracts role waits for the verdict)

- **P0** `sim/` (Node, no external dependencies, plain ESM or TypeScript run by Node's type stripping; no new dependency; seeded RNG; no comments): implements the per-coin virtual-reserve curve (`buy`, `sell`, `boost` as virtual buy-and-burn, ceil rounding, 100 bps fee), launch with permanent creator seed, the epoch loop (lock, seed, pairing by Fisher-Yates from the seed at resolve time, clash rolls, byes, hunts, xp, levels), the merger split (default 50/30/15/5, `consolationMode` holders or spread), consolation claims at fixed rates, settlement and champion redeem at `(rMon + pot)/supply`, the pool factor `clamp((rMonAtLock/meanRMon)^gamma)`, level bonus, element multipliers (fire > ice > earth > electric > dark > fire, 1.15/0.87), win probability clamp 15-85 percent, and a trader model (configurable population of small buyers: uniform, momentum, level-chasing; plus a whale). `node sim/run.mjs --seed N --coins 30 --runs 4000 --variant <name>` prints a summary table; same seed, same output.
- **P0** Reproduce the brainstorm **Economy** table: variants "first design (sqrt pool factor, clamp 0.75-1.35)", "same with boost capped at the winner's reserve", "linear (gamma 1, clamp 0.05-20)", and **recommended (gamma 0.85, clamp 0.1-10)**, reporting EV per MON staked at pool multiples 0.1x, 0.25x, 0.5x, 1x, 2x, 5x (30 coins at 10 MON unless stated). Reproduction means each cell within the simulation's own 95 percent confidence interval of the brainstorm number plus 0.05; state the intervals.
- **P0** Red-team check 1 (hole 1, 1-wei sell after a merge): simulate a bot that sells 1 wei of every winner right after each resolve, under (a) the first-design plain reserve injection and (b) the virtual buy-and-burn. Report the share of the boost the bot captures; pass if under 1 percent of the boost under (b) and demonstrably large under (a) (so the check can fail).
- **P0** Red-team check 2 (hole 2, ghost-coin EV): EV per MON staked for a coin whose creator seeds the minimum and whose pool is 0.1x, 0.25x, 0.5x, 1x, 2x, 5x of the mean, with the permanent seed in force. **Target: EV per MON staked between 0.87 and 0.97 for pool multiples 0.25x to 5x.** Gate rule: pass if every one of 0.25x, 0.5x, 1x, 2x, 5x lies in [0.85, 0.99] (the target band widened by the simulation noise of 0.02); report 0.1x separately with the reason it is covered (seed and clamp). Show the first-design premium (about 3.97 at 0.1x) reproduced so the check can fail.
- **P0** Red-team check 3 (hole 3, early-public bracket): compare (a) pairing derived from the previous epoch's seed and public one epoch early with trading open, against (b) pairing derived at resolve from the new seed behind the global lock. Report the title-odds ratio of a bye coin versus the average, and the profit of an informed trader who buys the favourite and dumps the underdog before the lock. Pass if under (b) the bye ratio is within 5 percent of 1.0 and the informed edge is within noise of 0; under (a) the edge must be visible (about 1.46x bye title odds in the red-team run) so the check can fail.
- **P0** Tune within the brainstorm's levers: `gammaBps`, pool factor clamp, `levelBonusBps`, element multipliers, `huntWinPct`, xp thresholds, `baseStat` per type, split, `minSeed` and `maxSeed`, `clashesPerEpoch`, `levelingEpochs`. Also report: champion payout multiple versus stake, share of coins out in epoch 1 and their consolation recovery, system EV per MON (rake), rounds to completion and clash count, concentration (Gini of final holder value), value captured by a single whale buying early, and how often a coin bought just before the lock wins.
- **P0** `docs/pitch/economy-report.md`: the first line is exactly `GATE: PASS` or `GATE: FAIL`; then the reproduction table with intervals, the three red-team check results, the recommended final parameter set (a table the contracts role can transcribe into the demo and standard presets), the alternatives tried, a "Decisions for the user" table (split, gamma, seed bounds, consolation mode, element multipliers), and a statement that it models assumptions, not users. If the gate fails after reasonable tuning, say what structural change is needed and stop; the PM escalates (the brainstorm fallback is stake pools).

Phase P0b — words, demo, QA (start in parallel with P0a; the frontend consumes the copy)

- **P0** `docs/pitch/copy.md`: every user-facing string in tables keyed by UI slot: header and badges (`Monad Testnet`, `Testnet play-money, no real value`), stage rail labels and sub-lines from the diagram (`1. Arena Spawn`, `2. PvE Leveling`, `3. Liquidity Merger`, `4. The Chosen One`), stage banners, the lobby (counter, timer, `House` label, launch rules), the **lockdown banner** and countdown, the seed-wait message, the epoch-cancelled toast (`Arena stabilised`), the rules card (how an epoch works, the four-way split with live placeholders `{boostPct}`, `{consolationPct}`, `{potPct}`, `{treasuryPct}`, odds clamp `{minOdds}`-`{maxOdds}`, why trading pauses, consolation, redeem, testnet notice), launch modal labels and errors, trade drawer labels, claim consolation, claim seed and redeem labels, tx toast titles and bodies (pending, confirmed, failed), a mapping from every custom revert error name in `contracts/abi/Arena.json` to a readable sentence (write the mapping for the conditions in `contracts.md` 2.3 and complete it after the ABI exists), feed row texts (`{TICKER} consumed {TICKER}`, `+{amount} MON boost`), floaters (`{TICKER} WINS`, `+{amount} MON BOOST`), hunt texts (`Hunt won, +{xp} xp`, `Hunt failed`), `Lv N` badges, empty states, connection states, the Chosen One screen (with the published redeem rate `{rate}`), and the aborted-round messages. Include the wording rules: use "arena", "clash", "merge", "boost", "consolation", "claim", "redeem", "launch"; never "bet", "wager", "payout", "yield", "profit", "guaranteed", "invest". Replace every item listed in `01-design-system.md` F12.2 and F12.1. English only, no emojis.
- **P0** `docs/demo/runbook.md`: the demo path from `00-overview.md` click by click with times, the pre-flight checklist (contract addresses verified on MonadVision, keeper `/healthz`, keeper and drip wallets funded, treasury funded for all planned epochs, house coins seeded to the demo lobby count, second browser for the spectator view, explorer tabs open, rules card visible, `?replay=fixture` and the recorded fallback ready), what to say at each step, the disclosed shortcuts (demo preset timers, house-seeded coins), and recovery steps per failure (RPC down, keeper stalled, seed late and `EpochCancelled`, `abortRound`, faucet empty, wallet problem, testnet reset).
- **P0** `docs/demo/qa-checklist.md`: one row per acceptance criterion across the four roles with the exact command or click, expected result and a pass/fail column; the PM and role 04 use it to walk the demo path and the `data-testid` map from the frontend.

Phase P1 — credibility

- **P1** `docs/pitch/outline.md`: one-minute pitch, three-minute talk track aligned with the diagram's four stages, the guardrails slide (global lock, seed after freeze, pairing at resolve, fixed-rate claims, no owner withdrawal, immutable round config), what is real versus simplified, the threat table T1-T15 in plain language, and answers to the likely questions (rug risk, front-running, why not a DEX, why testnet, what is on chain versus replayed, what happens if the randomness provider stalls).
- **P1** `docs/pitch/provenance.md`: the 3D prototype is pre-existing work; the chain layer (contracts, keeper, ChainFeed, bridge, merger visuals) is the new work, with a table of what was built when (from the PM's status file, file times and role reports).
- **P1** `docs/pitch/video-shotlist.md`: a 60-90 second recorded demo shot list matching the runbook, with on-screen text per shot.
- **P1** Root `README.md`: what it is, the four stages, architecture in one mermaid diagram (from the brainstorm's proposed architecture), quick start for local rehearsal (commands copied verbatim from the other roles' READMEs and verified to exist), the rules and parameters, the testnet-only notice, addresses once deployed, how to run the fixture replay.
- **P1** `docs/demo/fallback.md`: the recorded replay procedure, screen-recording checklist, fixed seeds and timers for a deterministic rehearsal.
- **P1** Re-run the simulation with the contracts role's final parameters and measured `GAS.md` pacing; append the result to the economy report.

Phase P2 — only if time remains

- **P2** Glossary for judges, one-page leaflet, caller-commit (T3) explainer.

## Dependencies

- Needs from the contracts role: custom error names and the final `RoundConfig` presets (to compare with your recommendation), `GAS.md` pacing.
- Needs from the backend role: keeper cadence and seed commands (`keeper/README.md`).
- Needs from the frontend role: the `data-testid` map and a running build for the QA walk.
- Gives to the contracts role: the GATE verdict and parameters (Phase C1 starts only on `GATE: PASS`). Gives to the frontend role: `docs/pitch/copy.md`. Gives to the user: the "Decisions for the user" table.

## Constraints

- English everywhere. No emojis.
- Code in `sim/` follows the standing rules: no comments, strict TypeScript if TypeScript is used (no `any`, no `@ts-ignore`), no new dependency.
- Never read, write or echo `.env*` files or secrets; never include an address you did not read from `deployments/10143.json`.
- Never claim anything about regulation; say "not legal advice" and recommend review.
- Never say the product is audited. State what is simplified.
- Never write "payout", "bet", "wager" in any deliverable a judge or user will read except inside the wording-rules table that forbids them.
- The simulator mirrors the contract formulas; where the contracts role later deviates, update the simulator from their tests.
- Never run `git commit`, `git push`, or destructive git commands; never `git add -A` or `git add .`. No deploy, no keys, no real-network transaction.
- Write only inside Owned paths.

## Deliverables

- **P0** `sim/` with `sim/README.md` (how to run, and a table mapping each function to the section of `contracts.md` or the brainstorm plan it implements), `docs/pitch/economy-report.md` (GATE verdict first line), `docs/pitch/copy.md`, `docs/demo/runbook.md`, `docs/demo/qa-checklist.md`.
- **P1** `docs/pitch/outline.md`, `docs/pitch/provenance.md`, `docs/pitch/video-shotlist.md`, `docs/demo/fallback.md`, root `README.md`, updated economy report.
- **P2** Glossary, leaflet, T3 explainer.

## Acceptance criteria

1. `node sim/run.mjs --seed 1 --coins 30 --runs 4000 --variant recommended` exits 0, prints the summary table, and two runs with the same seed print identical output; every variant named above runs.
2. `docs/pitch/economy-report.md` starts with `GATE: PASS` or `GATE: FAIL`; contains the reproduction table for the four variants at pool multiples 0.1x, 0.25x, 0.5x, 1x, 2x, 5x with intervals; the three red-team checks with their numbers, including the deliberately failing baselines (first-design ghost premium near 3.97 at 0.1x; plain injection captured by a 1-wei sell bot; public bracket bye edge near 1.46x); the recommended parameter table; a "Decisions for the user" table with at least four rows.
3. For `GATE: PASS`: EV per MON staked is within [0.85, 0.99] at 0.25x, 0.5x, 1x, 2x and 5x under the recommended parameters; the 1-wei bot captures under 1 percent of the boost under the virtual buy-and-burn; the bye-coin title odds ratio is within 5 percent of 1.0 and the informed-trader edge is within noise of 0 under pairing at resolve. Otherwise the file says `GATE: FAIL` and names the failing check.
4. `docs/pitch/copy.md` has a row for every UI slot named above, a revert-error mapping table and the wording rules; `grep -niE "\b(bet|wager|payout|yield|profit|guaranteed|invest)\b" docs/pitch/copy.md` matches only lines in the wording-rules table that list them as forbidden.
5. `docs/demo/runbook.md` reproduces every step of the demo path in `00-overview.md` in order, includes the pre-flight checklist and a recovery step for each of: RPC down, keeper stalled, seed late with `EpochCancelled`, `abortRound`, faucet empty, wallet problem, testnet reset.
6. `docs/demo/qa-checklist.md` has one row for every numbered acceptance criterion in the `01`, `02` and `03` handoffs, each with a concrete command or click.
7. `sim/README.md` maps each function in `sim/` to the section of `contracts.md` 2.6 or the brainstorm plan it implements.
8. No file outside Owned paths was created or changed; `grep -rnE "^\s*//|/\*" sim` returns nothing; no secrets appear anywhere.
