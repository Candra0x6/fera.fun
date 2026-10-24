# QA checklist: acceptance criteria across the four roles

The PM and role 04 walk this table after each role reports a phase done. One row per numbered acceptance criterion in `docs/handoffs/01-smart-contracts.md`, `02-frontend-3d.md`, `03-backend-keeper-relay.md` and `04-product-economy-demo.md`. Fill the Result column with `pass` or `fail` and, on a fail, a one-line reason and the log or screenshot path. A failed row is re-dispatched to its owner with that line.

Commands are run from the repository root unless stated. Nothing here sends a transaction to a real network; the live-chain rows use a local `anvil --network monad` with anvil's public dev accounts, or are marked as the user step.

## 1. Contracts (role 01)

| ID | Criterion | Command or click | Expected | Result |
|---|---|---|---|---|
| C-01 | Build clean | `cd contracts && forge build --network monad` | exit 0, zero warnings | |
| C-02 | Tests and invariants | `cd contracts && forge test --network monad -vv`; then `forge coverage --network monad` | exit 0; invariant suite at least 256 runs at depth 50 for invariants 1-5, zero failures, five handlers; at least 90 percent line coverage on `Arena.sol`, `CurveMath.sol`, `CombatMath.sol` | |
| C-03 | ABI matches the contract | `contracts/script/check-abi.sh` | exit 0; `contracts/abi/Arena.json` has every function, struct, enum and event of `contracts.md` 2.1-2.5 with identical names and types | |
| C-04 | Named tests exist and pass | `cd contracts && forge test --network monad --match-test "test_T1_oneWeiSellAfterBoost\|test_T2_ghostCoinCannotUnlockSeed\|test_T4_noTradeWhileLocked\|test_T4_pairingUnknowableBeforeResolve\|test_T6_resolveWithZeroSupplyCoinDoesNotRevert\|test_T10_reentrantSell\|test_T15_domainTags\|test_lateSeedThenCancelEpoch\|test_threeCancelsThenAbort\|test_fullRoundWithMockSeed\|test_forceSentMonDoesNotBreakAccounting" -vv` | all eleven names listed and passing | |
| C-05 | Conservation, `vTok` rule, batch equality | `forge test --network monad --match-contract` for the fuzz suites named in the role report | `R == boost + consolation + toPot + toTreasury` at every merger; after a boost `vTok == ceil(k_before / vMon_after)`; `resolveEpoch` with `maxClashes` 1 and 6 yields identical pairings, outcomes and final state. Cross-check: `node sim/test.mjs` asserts the same three rules on the simulator | |
| C-06 | Gas measured | open `contracts/GAS.md` | lists `launchCoin`, `buy`, `sell`, `lockEpoch`, `resolveEpoch` (6 and 15 clashes plus 30 hunts) with recommended gas limits; any `resolveEpoch` call above 25M gas is reported as a design finding | |
| C-07 | No comments | `grep -rnE "^\s*//\|/\*" contracts/src contracts/test contracts/script`; `grep -rnE "[;{}]\s*//" contracts/src contracts/test contracts/script`; `cd contracts && forge fmt --check` | the first returns only SPDX lines, the second nothing, fmt exits 0 | |
| C-08 | No weak randomness | `grep -rniE "prevrandao\|blockhash\|block\.timestamp" contracts/src`; read `contracts/script` | no use for randomness or value; timestamps only for timers; the real deploy script cannot reference `MockSeedSource` | |
| C-09 | Local deploy works | follow `contracts/DEPLOY.md` local variant against `anvil --network monad` with the public dev account | the whole system deploys and the demo round is created; produced descriptors match `contracts.md` 2.9; `DEPLOY.md` contains no key, password or `.env` creation step | |
| C-10 | G16 checkpoint reported | read the role report | the state of every item named in `contracts.md` 2.8 is listed | |
| C-11 | Hygiene | `grep -rniE "private_key\s*=\|mnemonic\|password" contracts deployments`; compare changed paths with owned paths | no matches; only `contracts/**` and `deployments/**` changed; no real-network transaction was sent | |

## 2. Frontend and 3D (role 02)

| ID | Criterion | Command or click | Expected | Result |
|---|---|---|---|---|
| F-01 | Typecheck, lint, build, test | `pnpm --filter web typecheck`; `pnpm --filter web lint`; `pnpm --filter web build`; `pnpm --filter web test` | all four exit 0 | |
| F-02 | No `any`, no comments | `grep -rnE "\bany\b\|@ts-ignore\|@ts-nocheck\|@ts-expect-error" web/src --include=*.ts --include=*.tsx`; `grep -rnE "^\s*//\|/\*\|\{/\*" web/src web/index.html` | both return nothing (the second may return only the permitted TEMPORARY form) | |
| F-03 | English and honest wording | `grep -rniE "menjelajah\|beristirahat\|kegirangan\|aktivitas\|lokasi\|uji animasi\|bertarung\|melancarkan\|menahan\|melompat\|kalah duel\|terkena\|waspada\|jelajah" web/src web/index.html`; the second grep exactly as written in criterion 3 of `docs/handoffs/02-frontend-3d.md`; the wording-rules grep of `docs/pitch/copy.md` section 1 over `web/src/copy` | none outside `?sim=1` paths; the forbidden words appear nowhere in the product strings | |
| F-04 | Pins and randomness | `grep -n "\"three\"" web/package.json`; `grep -rn "cdn.tailwindcss.com\|cdnjs.cloudflare.com\|cdn.jsdelivr.net" web --include=*.html --include=*.ts --include=*.tsx --include=*.js`; `grep -rn "Math.random" web/src/chain web/src/arena/bridge.ts`; read `web/DECISIONS.md` | `"0.128.0"` exactly; no CDN references; no `Math.random` in the chain paths; every remaining `Math.random` in `arena3d.js` is cosmetic and listed in `web/DECISIONS.md` | |
| F-05 | Duel script tests | `pnpm --filter web test -- scriptDuel` | the strike script is identical per `clashId`; the chain's winner always survives; the winner's bar never reaches zero before the final strike; the re-salt loop ends within 32 tries or forces the final strike | |
| F-06 | Director tests | `pnpm --filter web test -- director` | a `Proposed` `Trade` does not change the leaderboard, the same event at `Finalized` does; animations wait for `Voted`; events older than 15 s fast-forward; a duplicate envelope id is ignored; a clash whose loser is gone is dropped; at most 8 duels at once | |
| F-07 | Fixture replay in a real browser | open `<app url>?replay=fixture` with no keeper and no wallet; capture with `screen-nav snap brave` | `coin-counter` in the lobby; `lockdown-banner` at each lock; clashes with the fixture winners; leaderboard re-sorts at each merge; one `feed-row` per clash with four amounts; hunt NPC fights; `claim-consolation` for the fixture wallet's loser coin; `chosen-one-screen` with the redeem rate; five screenshots (lobby, lockdown, a duel, a boost stream, Chosen One) with paths in the report | |
| F-08 | No random simulation in chain mode | same fixture run, watch for 3 minutes | no random duel, encounter or respawn; the population changes only through fixture events | |
| F-09 | Live against local anvil (mock seed) | with the keeper and anvil running: connect the burner; launch a coin; buy; try to buy while locked; use a loser holder wallet; reload; stop and restart anvil's RPC | burner funded through `/drip`; exactly one new monster after `CoinLaunched` reaches Finalized and none before; the reserve changes within 3 s; buying while locked is refused with the Locked reason; `Claim consolation` appears and works; reload restores the same state and the same spawn positions; the reconnect shows no duplicate animations | |
| F-10 | `data-testid` map | in the browser console run `[...document.querySelectorAll('[data-testid]')].map(e => e.dataset.testid)` at the times in the map below | every id in the map exists at its time | |
| F-11 | Hygiene | `cmp "monster_arena_3d_prototype (1).html" <saved copy>` and `cmp "docs/download (1).png" <saved copy>`; search the build output for key-like strings; list changed paths | both files identical; no `.env*` read or written; no key material in the build output; only `web/**` changed | |
| F-12 | Frame rate | open `?debug=1` with 30 coins, read the FPS cell or the `stats` event for 30 s | the measured value is in the report; a value under 20 FPS is a failure with a profile finding | |

`data-testid` map (from `02-frontend-3d.md`, Phase F2) and when each must exist:

| Test id | Present when | Demo step |
|---|---|---|
| `coin-counter` | always | 1 |
| `lobby-timer` | Lobby | 1 |
| `stage-rail` | always | 1 |
| `status-chip` | always | 1 |
| `rules-card` | the rules card is open | 1 |
| `connect-wallet` | no wallet connected | 2 |
| `use-burner` | the wallet menu is open | 2 |
| `launch-open` | Lobby, wallet connected | 3 |
| `launch-submit` | the launch modal is open | 3 |
| `leaderboard-row-<TICKER>` | one per coin present | 3, 5 |
| `buy-input`, `buy-submit` | a coin is selected and trading is open | 5 |
| `lockdown-banner` | between `EpochLocked` and the resolve | 6 |
| `feed-row` | after each clash | 8 |
| `claim-consolation` | a held coin is eliminated and Finalized | 9 |
| `claim-seed` | the creator's coin has ended | 9 |
| `redeem-button` | the round is Settled and a Chosen One token is held | 10 |
| `chosen-one-screen` | `RoundSettled` is Voted | 10 |

## 3. Backend (role 03)

| ID | Criterion | Command or click | Expected | Result |
|---|---|---|---|---|
| B-01 | Install and typecheck | `pnpm install`; `pnpm --filter @animal/shared typecheck`; `pnpm --filter keeper typecheck` | all exit 0 | |
| B-02 | Tests | `pnpm --filter @animal/shared test`; `pnpm --filter keeper test` | exit 0 covering the 21 envelope decoders, commit then retract with a replaced `blockId`, reconnect with subscribe-before-snapshot and no lost or duplicated event, `getLogs` ranges never above 100 blocks, store equivalence between live feed and `replay`, rank tie-break (`rMon`, `wins`, address), commit-state gating, the drip rate limit returning 429 with `retryAfterSeconds`, the keeper loop with a fake chain (`startRound`, `lockEpoch`, `resolveEpoch`, `cancelEpoch` only after the timeout and never when a seed arrived) | |
| B-03 | Fixture validity | `pnpm --filter @animal/shared test` (fixture test) | `shared/fixtures/arena-replay.json` validates against the shared types; every boost satisfies conservation with 50 / 30 / 15 / 5 and `vTok == ceil(k / vMon)` | |
| B-04 | Local anvil run | `anvil --network monad --accounts 40`, deploy with the mock seed, run `seed-house` and the keeper per `keeper/README.md`; `curl localhost:$PORT/healthz` | 12 house coins launched; the keeper starts the round and runs at least two full epochs logging seconds from `EpochLocked` to `EpochResolved`; `/healthz` returns `ok: true` with the round phase; a `ChainFeed` on the same node yields the same final store state as `getArenaSnapshot` | |
| B-05 | Liveness without the keeper | kill the keeper mid-epoch; `cast send <arena> "resolveEpoch(uint64,uint8)" <roundId> 6 --rpc-url http://127.0.0.1:8545 --private-key <anvil dev key>`; restart the keeper | the epoch completes; the restarted keeper does not double-lock a locked round | |
| B-06 | No secrets | `grep -rniE "(private\|secret\|mnemonic)[_a-z]*\s*[:=]\s*['\"]0x" keeper shared`; `find . -name ".env*" -not -name ".env.example"`; run the redaction test | no matches; no `.env` file in the tree; the test asserts logs never contain a key | |
| B-07 | Style | `grep -rnE "^\s*//\|/\*" keeper shared`; `grep -rnE "\bany\b\|@ts-ignore\|@ts-expect-error" keeper shared --include=*.ts` | both return nothing | |
| B-08 | Hygiene | list changed paths and the transaction log of the run | only root workspace files, `keeper/**`, `shared/**` changed; no transaction sent to any real network | |

## 4. Product, economy and demo (role 04)

| ID | Criterion | Command or click | Expected | Result |
|---|---|---|---|---|
| P-01 | Simulator runs and is reproducible | `node sim/run.mjs --seed 1 --coins 30 --runs 4000 --variant recommended` twice, `diff` the outputs; repeat with `--variant first`, `first-capped`, `linear`, `brainstorm-wide` | exit 0, a summary table, identical output for the same seed, every variant runs | |
| P-02 | Economy report content | open `docs/pitch/economy-report.md` | first line is `GATE: PASS` or `GATE: FAIL`; reproduction table for four variants at 0.1x to 5x with intervals; the three red-team checks with numbers including the failing baselines (first-design ghost premium near 3.97 at 0.1x, plain injection captured by a 1-wei bot, public bracket bye edge); recommended parameter table; a "Decisions for the user" table with at least four rows | |
| P-03 | Gate numbers | read the report's gate table and re-run `node sim/report.mjs --section gate,check1,check3,verdict` | for PASS: EV per MON in [0.85, 0.99] at 0.25x, 0.5x, 1x, 2x and 5x; the 1-wei bot under 1 percent of the boost with the virtual buy-and-burn; the bye-coin title-odds ratio within 5 percent of 1.0 and the informed edge within noise of 0 under pairing at resolve; otherwise the file says FAIL and names the failing check | |
| P-04 | Copy completeness | the wording grep of acceptance criterion 4 in `docs/handoffs/04-product-economy-demo.md` over `docs/pitch/copy.md` | matches only the wording-rules row that lists them as forbidden; every UI slot named in the role file has a row; the revert-error table exists and is completed against `contracts/abi/Arena.json` once it exists | |
| P-05 | Runbook | read `docs/demo/runbook.md` against `docs/handoffs/00-overview.md` "The demo path" | all ten steps in order; the pre-flight checklist; a recovery step for RPC down, keeper stalled, seed late with `EpochCancelled`, `abortRound`, faucet empty, wallet problem and testnet reset | |
| P-06 | QA checklist | this file | one row per numbered criterion of the 01, 02, 03 and 04 handoffs (11, 12, 8 and 8), each with a concrete command or click | |
| P-07 | Simulator map | read `sim/README.md` | every function in `sim/` is mapped to a section of `contracts.md` 2.6 or the brainstorm plan | |
| P-08 | Hygiene | `grep -rnE "^\s*//\|/\*" sim`; `grep -rniE "password\|secret\|mnemonic\|private_key" README.md docs/pitch docs/demo sim`; list changed paths | the first returns nothing; the second returns nothing that is a value; only `README.md`, `docs/pitch/**`, `docs/demo/**`, `sim/**` changed | |

## 5. End-to-end walk (PM and role 04, after integration)

Follow `docs/demo/runbook.md` section 5 with the live app and the testnet deployment. For each of the ten steps record the on-screen result against the "What you see" column and the transaction hash where a transaction exists. Any step that deviates from the runbook is a defect against the owner role named by the test id or the error source; the walk is only green when all ten steps match and the pre-flight list is fully ticked.
