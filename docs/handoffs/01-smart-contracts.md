# 01 — Smart contracts

## Context — read first

1. `docs/handoffs/contracts.md` — read in full; sections 1, 2 (the whole on-chain interface, rules, invariants and named tests), 7 (env names). This file is the contract with every other role; do not diverge, report instead.
2. `docs/brainstorm/2026-10-19-monad-monster-arena-onchain.md` — the authoritative design (the brainstorm plan wins every conflict). Read in full: Decision, Spec section 1 (contracts, money model, curve, combat, round config, interface, events, threat model T1-T15, economy table), section 6 (tests), section 7 (rollout), Open questions, and the three builder prompts (Prompt A is your brief). Read-only: never modify anything under `docs/brainstorm/`.
3. `docs/brainstorm/2026-10-19-monad-monster-arena-onchain/architecture.md` — ER model, epoch sequence, clash decision and merger flows, lifecycle state machines, failure modes.
4. `docs/brainstorm/2026-10-19-monad-monster-arena-onchain/research.md` — R5-R6 (gas and storage pricing, opcodes), R13-R20 (Entropy and randomness rules), R32-R36 (curve reference, clone init, block stuffing, launchpad exploits).
5. `docs/handoffs/00-overview.md` — demo path, ownership, dispatch order, conventions.
6. `docs/research/05-synthesis.md` — decisions and unverified assumptions.
7. `docs/research/02-tech-stack.md` — F1 (Monad facts), F2 (toolchain), D2 (Foundry config), D10 (platform limits). Its pool and randomness sections are superseded by the brainstorm plan (see synthesis C1-C3).
8. `docs/pitch/economy-report.md` — written by role 04; **recommended parameters and the simulation gate result**. You do not implement the curve or combat maths until it says `GATE: PASS` (see Requirements, Phase C1).

## Tools — skills and MCP

Installed at project scope (see `docs/research/06-tooling.md`; MCP servers load only in a new Claude Code session after the user approves them, so a session started before that will not see them and must fall back to the docs URLs).

| Name | Kind | Use it for |
|---|---|---|
| `monad` | skill (`.claude/skills/monad/`) | Invoke before writing any contract: Monad deltas (gas charged on the limit, 128-slot page storage pricing, 128 KB contract limit, reserve balance). **Two lines in it are stale or wrong for this project: ignore `--execution-network monad` (use `network = "monad"` in `foundry.toml` or `--network monad`), and never follow its "create `.env` with private key" step (deploy with a Foundry keystore and `--account`, see Constraints).** On any conflict with this handoff or a live `cast` probe, the handoff and the probe win. |
| `entry-point-analyzer` | skill (`.claude/skills/entry-point-analyzer/`) | After Phase C1: run it over `contracts/src` to produce the access matrix (player, keeper, seed source, owner functions) and compare it with `contracts.md` 2.3; put the matrix in `contracts/README.md`. Slither is not installed; use the skill's manual fallback. |
| `monad-docs` | MCP | Look up chain facts at the moment a number is needed (opcode pricing, `eth_getLogs` limits, verification URLs, Foundry-on-Monad page). Read-only tools only. **Never call `submit_feedback`.** |
| `openzeppelin-solidity` | MCP | Generate a reference shape for `MonsterCoin` (ERC-20 without Burnable or Permit, initialisable clone) and diff it against what you write. It targets the latest OpenZeppelin release; pin v5.6.1 and read that source, never paste generated output blindly. Send generator parameters only. |
| `context7` | MCP | Foundry invariant-testing guide (`/foundry-rs/book`), Solady if indexed, Pyth Entropy v2 (`/websites/pyth_network`, or fetch `https://docs.pyth.network/llms-entropy.txt`). Public library questions only: never put keys, the user's addresses or unreleased source in a query. |

## Owned paths

- `contracts/**` (Foundry project: `src/`, `test/`, `script/`, `abi/`, `foundry.toml`, `remappings.txt`, `lib/`, `README.md`, `GAS.md`, `DEPLOY.md`)
- `deployments/**`

You write nothing else. `shared/` belongs to the backend role and copies your ABIs; the workspace root belongs to the backend role. Dependencies: only through `forge install --no-git` into `contracts/lib/` (OpenZeppelin Contracts v5.6.1, forge-std v1.17.0, Solady pinned, and the Pyth Entropy SDK interfaces). Never run `git`.

## Responsibilities

Implement the on-chain arena exactly as `contracts.md` section 2 and the brainstorm plan specify: round lifecycle (Lobby, Leveling, Knockout, Settled, Aborted), ERC-20 clone coins each with its own virtual-reserve bonding curve, the permanent creator seed, the global epoch lock with one seed per epoch, seed-derived pairing, clash rolls, hunts, xp and levels, the virtual buy-and-burn boost merger, consolation and redeem claims at fixed rates, treasury, keeper bounty, cancel and abort liveness, and the Entropy adapter behind `ISeedSource`. Prove it with unit, fuzz and handler-driven invariant tests, including the three red-team holes. Publish the ABI and deployment descriptors the other roles consume.

## Scope

### In scope

- `Arena`, `MonsterCoin`, `CurveMath`, `CombatMath`, `ISeedSource`, `EntropySeedSource`, `MockSeedSource`.
- Foundry config for Monad, deploy script (`Deploy.s.sol`) and ABI export script, gas profile, README.
- A local end-to-end rehearsal path on `anvil --network monad` (optionally forking testnet) using anvil's public dev accounts only.
- A testnet-fork test against the real Entropy contract once the user supplies its address (P1).

### Out of scope

- Any off-chain code: keeper, ChainFeed, faucet, seeding script, frontend. The backend role writes those against your ABI and events.
- Creating, importing, printing or storing any private key, mnemonic or keystore password. **The testnet deployment is a user step**; you provide `contracts/DEPLOY.md` with exact commands for the user.
- Any DEX integration, upgrade proxy, owner withdrawal, `permit`, user-callable burn, transfer-restriction hooks.
- UI copy and the economy simulation (role 04 recommends parameters; you take final values from its report and expose them as `RoundConfig`).

## Objectives

1. Freeze the interface early (compiled skeleton and exported ABI) so the keeper, ChainFeed and the 3D bridge can be built in parallel.
2. A merger that is a virtual buy-and-burn on the winner's curve, conserves value exactly, cannot be sandwiched (global lock), and cannot be farmed with 1-wei sells.
3. Money-model invariants 1-5 and named tests T1, T2, T4, T6, T10, T15 green, including the three red-team holes (1-wei sell after merge, ghost-coin seed lock, bracket not public before resolve).
4. Liveness: late seed then `cancelEpoch`, three cancels then `abortRound`, `resolveEpoch` never reverts on data.

## Requirements

Phase C0 — interface freeze (start immediately; report when done)

- **P0** Foundry layout under `contracts/` without git: `foundry.toml` with `network = "monad"`, `solc_version = "0.8.31"`, `evm_version = "osaka"`, optimizer 200 runs, `metadata = true`, `metadata_hash = "none"`, `use_literal_content = true`, no `via_ir`. Install OpenZeppelin v5.6.1, forge-std v1.17.0, Solady (pinned), Pyth Entropy SDK interfaces with `forge install --no-git`. Confirm `forge build` accepts `osaka`; if not, run `foundryup`, use `prague` only as a last resort and report it.
- **P0** Compile skeleton `Arena`, `MonsterCoin`, `ISeedSource`, `EntropySeedSource`, `MockSeedSource` whose external functions, structs, enums and events match `contracts.md` 2.1-2.5 exactly (stubs that merely revert are not allowed for functions the other roles call in their tests: implement them or leave them out and tell the PM). Export `contracts/abi/*.json` with the export script. Tell the PM the ABI is frozen; later changes go through the PM.
- **P0** Confirm or report a conflict on the interpretation in `contracts.md` 2.6 (Leveling epochs resolve hunts only, clashes start in Knockout), the `claimRefund` function added for aborted rounds, and the `Boosted` event.
- **P0** Local spike on `anvil --network monad`: a throwaway test proving `Arena`-style payout of its whole balance under a reserve-balance model as far as local simulation can show; record the finding and the remaining testnet-only uncertainty in `contracts/README.md` and as a "Day-1 check" in `DEPLOY.md`.

Phase C1 — core (start only after `docs/pitch/economy-report.md` reports `GATE: PASS` and gives final parameter values; the PM relays the go. If it reports `GATE: FAIL`, stop and report.)

- **P0** C1a lobby, coin and curve: `createRound` (validates the split sums to 10000), `launchCoin` (ticker `[A-Z0-9]{2,7}` enforced, name length-limited, per-address cap 2, launch fee and seed bounds, ERC-1167 clone of `MonsterCoin` initialised in the same transaction, `_disableInitializers()` on the implementation, permanent creator seed held by the Arena), `refundLaunch`, `startRound` (maxCoins or deadline with minCoins, treasury covers all planned epochs at `maxEntropyFee`), `buy` and `sell` with the exact curve in `contracts.md` 2.6, ceil rounding in the pool's favour, mandatory `minOut` and `deadline`, per-coin fee accrual (no shared hot slot written on trade), reentrancy guard (`ReentrancyGuardTransient`), checks-effects-interactions on every MON send, `Trade` event with post-trade reserves, `quoteBuy`, `quoteSell`.
- **P0** C1b epoch engine: `lockEpoch` (timer-gated, requests one seed through `ISeedSource`, snapshots `rMonAtLock` and the alive mask, freezes every alive coin, pays the seed fee from treasury), `onSeed` (store and emit only, never reverts, only from the configured source), `resolveEpoch(roundId, maxClashes)` (Fisher-Yates pairing from `keccak(seed, "PAIR")` reproducible across batched calls from `(seed, aliveMask)`, rolls from `keccak(seed, "CLASH", clashId)`, clamped win probability, bye for the odd coin, hunts from `keccak(seed, "HUNT", coinId)`, xp and level lookup, merger, unlock, keeper bounty at completion only, capped by treasury), `cancelEpoch` (only after the timeout and only while no seed has arrived, no bounty, at most 3 in a row), `abortRound`, `claimRefund`, `fundTreasury`.
- **P0** C1c merger and settlement: boost as a virtual buy-and-burn `k = vMon*vTok; vMon += X; rMon += X; vTok = ceil(k/vMon)`; consolation fixed-rate claims (`consolationPool` and `consolationSupply` set once at elimination, never divide by a live `totalSupply()`); `consolationMode = SpreadSurvivors` as a config switch (default off); prize pot and treasury accrual; settlement at one alive coin with the Chosen One redeem-only at `(rMon + prizePot) / supply` (`redeemPool` and `redeemSupply` fixed at settlement); `claimConsolation`, `redeem`, `claimSeed`; no owner withdrawal path.
- **P0** Seed adapters: `ISeedSource`, `EntropySeedSource` (Pyth Entropy v2 `requestV2` and `getFeeV2`, callback implements the consumer interface and calls `Arena.onSeed`, fee read on-chain, Entropy address and provider are constructor arguments), `MockSeedSource` (tests and local anvil only).
- **P0** Tests (Foundry): unit per function and per revert; fuzz on `CurveMath` (round trip, rounding favours the pool), `CombatMath` (monotonic in level and pool, clamp bounds, `powWad` safety), pairing (permutation, no repeats, bye rule, same pairs across batches), claim-rate dust; handler-driven invariants 1-5 with five handlers (players, keeper, hostile contract with a reentrant `receive`, force-sender, time warp); every named test in `contracts.md` 2.7 with the exact names, in particular **`test_T1_oneWeiSellAfterBoost`**, **`test_T2_ghostCoinCannotUnlockSeed`**, **`test_T4_noTradeWhileLocked`** and **`test_T4_pairingUnknowableBeforeResolve`**; scenario tests `test_fullRoundWithMockSeed`, `test_lateSeedThenCancelEpoch`, `test_threeCancelsThenAbort`.
- **P0** Checkpoint G16 (`contracts.md` 2.8): report the state of invariants 1-5 and T1, T2, T4, T6, T10, T15 to the PM. If they are not green after about 16 agent-hours or two fix cycles, stop and report; the fallback is stake pools (Option E) and the PM decides with the user.
- **P0** `forge test --gas-report --network monad` summarised in `contracts/GAS.md`: gas for `launchCoin`, `buy`, `sell`, `lockEpoch`, `resolveEpoch` at 6 and 15 clashes plus 30 hunts, with the explicit `gas` limits the keeper should pass (measured plus 15 percent; gas is charged on the limit). Compare with the brainstorm estimates (2-4M versus 7-9M).
- **P0** `script/Deploy.s.sol` (reads `DEPLOYER_ACCOUNT`, `ENTROPY_ADDRESS`, `ENTROPY_PROVIDER` from the environment, creates the first round with the demo preset, writes `deployments/10143.json` and `10143.params.json` on a real run), `script/DeployLocal.s.sol` for anvil with `MockSeedSource` and anvil's public dev account, and `DEPLOY.md` with exact commands for the user (keystore import done by the user, `forge script --account <name> --sender <addr> --broadcast --verify --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/`), the Day-1 checks (reserve-balance payout test, `osaka` compile, a real Entropy request and its latency and fee), and the keeper funding note (about 25 MON for the keeper EOA).

Phase C2 — hardening (P1)

- **P1** Run `entry-point-analyzer` over `contracts/src`; include the access matrix in `contracts/README.md`.
- **P1** Testnet-fork test of a full round against the real Entropy contract once the user supplies `ENTROPY_ADDRESS` (needs the user's RPC and address; skip and report if absent).
- **P1** `contracts/README.md`: architecture, parameters, the threat model T1-T15 with the test that covers each, the demo-versus-production notes, residual risks (T3 provider re-roll accepted on play-money testnet; mainnet gate listed), wording rules (no "bet", "wager", "payout" in identifiers or revert names).
- **P1** Custom errors with readable names (the UI maps them to sentences in `docs/pitch/copy.md`).
- **P1** T3 mitigation design note only (caller commit with bond for the user contribution); implementation is P2.
- **P1** `createRound` preset constants `DEMO` and `STANDARD` as in `contracts.md` 2.1 with final values from role 04's report.

Phase C3 — only if time remains (P2)

- **P2** Caller commit-reveal with a bond for the user contribution (T3); time-weighted reserve instead of spot at lock; random monster assignment from a seed; skin NFTs are out of scope.

## Dependencies

- Needs from role 04: `docs/pitch/economy-report.md` with `GATE: PASS` and final parameters before Phase C1; the simulation's formulas are the reference for `CurveMath` and `CombatMath` unit expectations.
- Needs from the user (not from any agent): the Entropy contract and provider addresses, a funded deployer keystore, and running `DEPLOY.md`.
- Gives to the backend role: `contracts/abi/*.json` (frozen at C0), `contracts/GAS.md`, `deployments/10143.json`, a local anvil deploy path.
- Gives to the frontend role (through `shared/`): the ABI and event surface; `getConfig` values for the rules card.

## Constraints

- English everywhere. **No comments in code.** The only permitted comments are the single `// SPDX-License-Identifier: MIT` line at the top of each `.sol` file (compiler warning otherwise) and, for scaffolding explicitly framed as temporary, `// TEMPORARY — <what it is>; delete with <what to remove>`. NatSpec is a comment: do not write it.
- **Deploy rule: keystore only, and the deploy is a user step.** Never read, write, print or echo `.env*` files, private keys, mnemonics or keystore passwords; never create a `.env` holding a key (the installed `monad` skill suggests that; ignore it). Never run `cast wallet`, `forge script --broadcast`, `forge create` or any transaction against a real network. Local runs use only anvil's public default accounts. The real deploy uses `forge script --account <keystore name> --sender <addr>` run by the user from `DEPLOY.md`.
- **Solidity 0.8.31 caveat:** versions 0.8.28 to 0.8.33 have a high-severity IR-pipeline bug that only triggers with `via_ir` plus `delete` on a `transient` variable (https://soliditylang.org/blog/2026/02/18/solidity-0.8.34-release-announcement/). Do not enable `via_ir`, do not declare `transient` state variables yourself (OpenZeppelin's `ReentrancyGuardTransient` is the only transient usage), and do not move compiler versions without telling the PM.
- `evm_version = "osaka"`; no upgrade proxy; no owner withdrawal; `Config` immutable per round; pause (if any) stops only launches and new epochs, never withdrawals.
- Never use `prevrandao`, `blockhash` or `block.timestamp` as randomness or for value; `block.timestamp` only for timers. `MockSeedSource` exists only for tests and local anvil and must not be selectable in the real deploy script.
- No loops over holders; bounded loops over at most `maxCoins` coins only; keep coin state packed (Monad page-based storage pricing); no global counter written on trade.
- `resolveEpoch` must never revert on data; the Entropy callback must never revert.
- No new dependency beyond OpenZeppelin v5.6.1, forge-std v1.17.0, Solady (pinned) and the Pyth Entropy SDK interfaces without asking the PM.
- Never run `git`. Write only inside Owned paths. If the interface needs to change, stop and report; do not edit `contracts.md`.

## Deliverables

- **P0** `contracts/` Foundry project with `src/` (`Arena`, `MonsterCoin`, `libs/CurveMath`, `libs/CombatMath`, `seed/ISeedSource`, `seed/EntropySeedSource`, `seed/MockSeedSource`), `test/`, `script/`, `foundry.toml`.
- **P0** `contracts/abi/*.json` regenerated by `contracts/script/export-abi.sh`, and `contracts/script/check-abi.sh` comparing against the signature list in `contracts.md`.
- **P0** Passing unit, fuzz, invariant and scenario suites, including the named tests.
- **P0** `contracts/GAS.md`, `contracts/script/Deploy.s.sol`, `contracts/script/DeployLocal.s.sol`, `contracts/DEPLOY.md`.
- **P0** G16 checkpoint report to the PM.
- **P1** `contracts/README.md`, access matrix, testnet-fork test, custom errors, T3 design note.
- **P1** `deployments/10143.json` and `deployments/10143.params.json` once the user has deployed (you provide the exact shape and a script that validates the file).
- **P2** Commit-reveal with bond, time-weighted reserve, random assignment.

## Acceptance criteria

1. `cd contracts && forge build --network monad` exits 0 with zero warnings.
2. `forge test --network monad -vv` exits 0; the invariant suite runs at least 256 runs at depth 50 for invariants 1-5 with zero failures, using the five handlers (players, keeper, hostile reentrant contract, force-sender, time warp); `forge coverage` shows at least 90 percent line coverage on `Arena.sol`, `CurveMath.sol` and `CombatMath.sol`.
3. `contracts/script/check-abi.sh` exits 0: `contracts/abi/Arena.json` contains every function, struct, enum and event named in `contracts.md` 2.1-2.5 with identical names and types.
4. These tests exist by exact name and pass: `test_T1_oneWeiSellAfterBoost` (fuzzed; after a boost, `sell(1 wei)` pays within rounding of `price * 1 wei`, never the boost), `test_T2_ghostCoinCannotUnlockSeed`, `test_T4_noTradeWhileLocked`, `test_T4_pairingUnknowableBeforeResolve`, `test_T6_resolveWithZeroSupplyCoinDoesNotRevert`, `test_T10_reentrantSell`, `test_T15_domainTags`, `test_lateSeedThenCancelEpoch`, `test_threeCancelsThenAbort`, `test_fullRoundWithMockSeed` (30 coins to Settled, the Chosen One's holders redeem at `(rMon + pot) / supply`, a second round starts without redeploying), `test_forceSentMonDoesNotBreakAccounting`.
5. A fuzz test asserts conservation at every merger: `R == boost + consolation + toPot + toTreasury`; another asserts after a boost `vTok == ceil(k_before / vMon_after)` with `k_before` read from state; another asserts batched `resolveEpoch` calls with `maxClashes = 1` and `maxClashes = 6` produce identical pairings, outcomes and final state for the same seed.
6. `contracts/GAS.md` lists measured gas for `launchCoin`, `buy`, `sell`, `lockEpoch`, `resolveEpoch` (6 clashes and 15 clashes, plus 30 hunts) with recommended explicit gas limits; any measurement above 25M gas for one `resolveEpoch` call is reported to the PM as a design finding.
7. `forge fmt --check` passes. `grep -rnE "^\s*//|/\*" contracts/src contracts/test contracts/script` returns only SPDX lines; `grep -rnE "[;{}]\s*//" contracts/src contracts/test contracts/script` returns nothing.
8. `grep -rniE "prevrandao|blockhash|block\.timestamp" contracts/src` returns nothing used for randomness or value (timers only for `block.timestamp`; `blockhash` only inside `MockSeedSource` if at all), and the real deploy script cannot reference `MockSeedSource`.
9. `DEPLOY.md` commands for the local variant, run against `anvil --network monad` with the public dev account, deploy the whole system and create the demo round; the produced descriptors match `contracts.md` 2.9. `DEPLOY.md` contains no key, password or `.env` creation step.
10. Reported G16 checkpoint with the state of every item named in section 2.8 of `contracts.md`.
11. No file outside Owned paths was created or changed; `grep -rniE "private_key\s*=|mnemonic|password" contracts deployments` returns nothing; no real-network transaction was sent.
