# 03 — Backend: workspace, shared ChainFeed, keeper, faucet

## Context — read first

1. `docs/handoffs/contracts.md` — read in full: sections 1 (network, catalog), 2 (the on-chain interface you call and decode), 3 (shared types, ChainFeed and ArenaStore you implement), 4 (keeper, drip, optional relay), 5 (fixture stream), 7 (env names), 8 (burner rules). Build against this, not against the contracts role's code.
2. `docs/brainstorm/2026-10-19-monad-monster-arena-onchain.md` — read sections 3 (event-to-animation gates), 4 (feed, keeper and wallet), 5 (epics E5 and E6) and the Event surface in Spec section 1, and Prompt B (your brief). Read-only: never modify anything under `docs/brainstorm/`.
3. `docs/brainstorm/2026-10-19-monad-monster-arena-onchain/architecture.md` — "Main flow", "Failure modes", "Horizontal-scaling checklist". `research.md` R2-R5 (RPC limits and gas), R23-R26 (WebSocket subscriptions, `monadLogs`, `blockId`, `commitState`, `eth_getLogs` window), R40.
4. `docs/handoffs/00-overview.md` — demo path, ownership map, dispatch order, conventions.
5. `docs/research/05-synthesis.md` — decisions and unverified assumptions 7-12.
6. `docs/research/02-tech-stack.md` — F1 (Monad facts: block states, `monadLogs`, 100-block `eth_getLogs`, deferred nonce validation, gas charged on the limit), F5 (keeper tooling: `nonceManager`, `writeContractSync`), D5 (keeper key rules), D10 (platform limits). Its relay and indexer sections are superseded: v1 has no indexer, and the browser reads the chain directly through ChainFeed.
7. `docs/research/04-repo-audit.md` — Implications per role / indexer + keeper (pacing: one clash is about 7-8 s of animation, at most 4 concurrent).

## Tools — skills and MCP

Project scope (see `docs/research/06-tooling.md`; MCP servers load only in a new Claude Code session after the user approves them):

| Name | Kind | Use it for |
|---|---|---|
| `monad` | skill (`.claude/skills/monad/`) | Monad deltas before writing keeper and feed code (gas charged on the limit, block tags, `eth_getLogs` range, reserve balance). Two stale lines: ignore `--execution-network monad`, and never follow its "create `.env` with private key" step. |
| `viem-docs` | MCP | `defineChain`, `webSocket` and `fallback` transports, `nonceManager`, `writeContractSync`, `getLogs` paging, custom `subscribe` through `client.transport.subscribe` for `monadLogs`, multicall, ABI decoding. |
| `monad-docs` | MCP | `monadLogs` and `monadNewHeads` message shape, block states, RPC limits. Read-only. Never call `submit_feedback`. |
| `context7` | MCP | Hono (`/honojs/hono`: routing, `streamSSE`, `app.request()` tests), zod, Node. Public library questions only. |

Already on the machine: `use-railway` skill and the `railway` MCP for the deploy descriptor and service variables (never print variable values), `security-review` for a final pass over key handling. Do not use the `honojs/skills` skill (written for Hono v5) or Pyth's `pyth-dev` skill.

## Owned paths

- Workspace root files: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `.nvmrc` (the root `README.md` belongs to role 04).
- `keeper/**`
- `shared/**` (`@animal/shared`: `catalog.json`, `house-coins.json`, types, `ChainFeed`, `ArenaStore`, ABI sync, fixtures)

Other roles that need a root-level change or a dependency in a path they do not own ask the PM. A role's own `package.json` (for example `web/package.json`) belongs to that role.

## Responsibilities

1. Create the pnpm workspace skeleton first so other roles can start (Phase B0).
2. Own `shared/`: the types, the framework-free `ChainFeed` and `ArenaStore` (used by the keeper and by the browser), the catalog, the fixture replay.
3. Run the keeper: `startRound`, `lockEpoch`, wait for the seed, `resolveEpoch`, `cancelEpoch` watchdog, with tight gas and no discretion over outcomes.
4. Run the testnet faucet drip for burner wallets and the house-coin seeding script.
5. (P1) Optional SSE relay that hides a keyed provider and fans one upstream socket out to browsers.

## Scope

### In scope

- `keeper/` service: modules `config`, `chain`, `loop`, `drip`, `api`, `scripts` (`seed-house`, `force-start`), (P1) `relay`.
- `shared/`: `types.ts` (exactly as `contracts.md` section 3), `catalog.json` and `catalog.ts`, `house-coins.json` (public addresses only), `ChainFeed`, `ArenaStore`, `abi/` copied by a sync script from `contracts/abi/`, `fixtures/arena-replay.json`.
- Root workspace configuration and `.env.example` (names only).
- Railway deployment descriptor for the keeper.

### Out of scope

- Any Solidity or Foundry files; the ABI is copied, never edited.
- The scene, the bridge and every React or DOM code (the frontend role consumes `@animal/shared`).
- An indexer or database: none in v1 (Envio, Ponder, Goldsky are explicitly out of scope).
- Choosing winners, pairings or any outcome: pairing and rolls happen on chain from the seed. The keeper only calls `startRound`, `lockEpoch`, `resolveEpoch`, `cancelEpoch` with public arguments.
- Creating, importing or printing any private key. Keys exist only as environment variables supplied by the user; local development uses anvil's public default accounts.

## Objectives

1. Unblock the other roles within the first work chunk (workspace, shared types, catalog, fixture stream).
2. A `ChainFeed` that never loses ordering and never double-applies: raw `monadLogs` WebSocket, events keyed by `blockId`, provisional until Voted or Finalized, retracted if the block is abandoned, snapshot by Multicall3 at `safe`, backfill in chunks of at most 100 blocks, reconnect that subscribes first.
3. A keeper whose liveness matters but whose correctness does not: anyone can call the permissionless functions; duplicate calls revert on state guards.
4. A seeding script that brings a fresh round to the demo starting state within RPC rate limits.

## Requirements

Phase B0 — skeleton (do first, report when done)

- **P0** Root `package.json` (private, `packageManager` pinned to the installed pnpm 11.4.0), `pnpm-workspace.yaml` listing `web`, `keeper`, `shared`, `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, ES2023, `moduleResolution: bundler`), `.gitignore` (`node_modules`, `dist`, `.env*` except `.env.example`, `contracts/out`, `contracts/cache`, `contracts/lib`, `*.log`), `.env.example` with the names in `contracts.md` section 7 and no values. Do not create `web/`; the frontend role does.
- **P0** `shared/`: `types.ts` copied exactly from `contracts.md` section 3, `catalog.json` and `catalog.ts` (monster and skin tables, element, `baseStat`, element cycle and multipliers), `house-coins.json` (empty array to start), typed `index.ts`, `scripts/sync-abi.mjs` that copies `contracts/abi/*.json` into `shared/src/abi/` (exit 0 with a clear message when the ABI does not exist yet).
- **P0** `ArenaStore` interface and an in-memory implementation (`hydrate`, `apply`, `commit`, `retract`, `replay`, derived ranks by `rMon` desc, `wins` desc, token address asc, gating by `commitState` as in `contracts.md` section 3) with unit tests, before ChainFeed exists.
- **P0** `shared/fixtures/arena-replay.json` exactly as described in `contracts.md` section 5; numbers satisfy `R == boost + consolation + toPot + toTreasury` (50/30/15/5) and `vTok == ceil(k / vMon)` after each boost; ids ordered; times consistent with 300 ms blocks; a test validates the file against the types and rules.
- **P0** `keeper/` skeleton with all runtime dependencies installed in one pass (viem 2.57.7, hono 4.13.13, @hono/node-server 2.1.5, zod 4.6.7, pino 10.4.0; dev: typescript 5.9.3, tsx, vitest). Re-run `npm view` first and report version drift. This is the only time `pnpm install` should touch the root lockfile for `keeper` and `shared`; other roles install only their own package afterwards.

Phase B1 — ChainFeed (needs the frozen ABI for decoding)

- **P0** `ChainFeed` as specified in `contracts.md` section 3: raw WebSocket `eth_subscribe("monadLogs", { address })` with reconnect and backoff; decode every event in section 2.5 into an `ArenaEventEnvelope` (`blockNumber`, `blockId`, `logIndex`, `commitState`); de-duplicate by `(blockId, logIndex)`; emit `commit` when a later `commitState` arrives; emit `retract` when a different `blockId` finalizes at a seen height; snapshot with Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`) calling `getArenaSnapshot` at the `safe` tag (no JSON-RPC batching on the Monad Foundation endpoints); on reconnect subscribe first, buffer, snapshot, backfill from the last finalized block in `eth_getLogs` pages of at most 100 blocks with at most 5 concurrent requests; fallback polling of `eth_getLogs` every second; a `status` stream (`live`, `reconnecting`, `polling`, head block, lag). It runs unchanged in Node (keeper) and in the browser.
- **P0** Tests (vitest, with a fake WebSocket and fake RPC): envelope decoding for every event; commit then retract with a replaced `blockId`; reconnect that subscribes before snapshot and loses no event; range paging never exceeds 100 blocks; the store reaches the same final state from a live feed as from `replay` of the same events.

Phase B2 — keeper and faucet

- **P0** `config`: zod-validated environment; startup log prints the keeper address, never a key; error handlers redact secrets.
- **P0** `loop`: single funded account with viem `nonceManager`, explicit `gas` per call from `contracts/GAS.md` (conservative defaults before it exists; tight limits because gas is charged on the limit), `writeContractSync` for sequencing, one in-flight transaction per account. Flow: `startRound` when the lobby is ready, then `lockEpoch` when `epochSeconds` has elapsed, wait for `SeedReady` (event, with state polling as backup), `resolveEpoch(roundId, CLASH_MAX_PER_RESOLVE)` repeated until the epoch is `EpochResolved`, `cancelEpoch` watchdog at `seedTimeoutSeconds` (never while a seed has arrived), stop when the round is Settled or Aborted. Structured logs with `roundId`, epoch, tx hash, gas used, seconds from `EpochLocked` to `EpochResolved`; an alert log above 90 s. Duplicate or racing calls (two keepers) revert on state guards and are handled without crashing.
- **P0** `drip` and `api` (Hono): `GET /healthz`, `POST /drip` (zod validation, per-address and per-IP rate limits with 429 and `retryAfterSeconds`, explicit gas, amount `DRIP_AMOUNT_MON` default 5, refuses below a balance floor), CORS for `ALLOWED_ORIGIN` only.
- **P0** `scripts/seed-house`: launches the curated roster from the prototype's `INITIAL_TOKENS` (MOOND, FIRECAT, AQUA, TITAN, VOLT, SHADE, DRACO, GLACIER, KITSUNE, CRAG, UMBRA, PYRO with their monster and skin; ticker rules `[A-Z0-9]{2,7}`) into the lobby; because `launchCoin` has a per-address cap of 2 it uses one house wallet per two coins derived from `HOUSE_MNEMONIC` when present, otherwise ephemeral in-memory wallets (keys never printed or persisted; warn that their creator seeds are not reclaimable); funds each house wallet from `SEEDER_PRIVATE_KEY`; one launch per 4 blocks; differing seed amounts within `minSeed` and `maxSeed` read from `getConfig`; idempotent per ticker; writes only public addresses to `shared/house-coins.json`.
- **P0** `scripts/force-start`: calls the keeper path to start the round early when `minCoins` is met (for compressed demos).
- **P0** Local rehearsal: documented commands in `keeper/README.md` that run everything on `anvil --network monad --accounts 40` with the contracts role's local deploy and `MockSeedSource` (the script that delivers the mock seed is part of the keeper's local rehearsal tooling under `keeper/scripts/`, using only public dev accounts).
- **P1** Optional SSE relay (`GET /stream`, `GET /snapshot`, `GET /events?after=`): one upstream ChainFeed fanned out to browsers, `Last-Event-ID` resume, `status` and `ping` messages, same envelope types; the browser works without it.
- **P1** Railway descriptor (Dockerfile or `railway.json`), health-check restart policy, `/healthz` fails if no block for 5 s.
- **P1** `scripts/replay-record`: records a real run's envelopes into a fixture file for the recorded fallback.
- **P2** Second keeper account for parallel lanes, metrics.

## Dependencies

- Needs from the contracts role: `contracts/abi/*.json` (frozen at their C0), `contracts/GAS.md`, `deployments/10143.json`, the local anvil deploy path. Until the ABI exists, build against `contracts.md` and the fixture stream.
- Gives to the frontend role: `@animal/shared` (types, catalog, `ChainFeed`, `ArenaStore`, fixtures, house list), `POST /drip`.
- Gives to role 04: keeper cadence and seeding commands for the runbook.
- User steps (never an agent): supplying `KEEPER_PRIVATE_KEY`, `DRIP_PRIVATE_KEY`, `SEEDER_PRIVATE_KEY`, optional `HOUSE_MNEMONIC` and the RPC URLs as Railway or local environment variables, funding those accounts (the keeper needs about 25 MON), deploying to Railway.

## Constraints

- English everywhere. No comments in code. TypeScript strict: no `any`, no `@ts-ignore`, no non-null assertion used to silence a real nullable.
- Never read, write, print or echo `.env*` files or any key or mnemonic. `.env.example` has names only. Logs redact secrets. No deploy and no real-network transaction by any agent: all runs against anvil with public dev accounts; the testnet run is a user step.
- The keeper has no secret input and no discretion over outcomes.
- Treat the resolution transaction as public; never put a secret in calldata.
- Never run `git commit`, `git push`, or destructive git commands; never `git add -A` or `git add .`.
- Pre-approved dependencies: viem, hono, @hono/node-server, zod, pino, typescript, tsx, vitest. Anything else: ask the PM.
- One writer per account: never two concurrent senders on one account.
- Respect rate limits: public testnet RPC is 25-50 rps shared; no JSON-RPC batching on the Monad Foundation endpoints; `eth_getLogs` at most 100 blocks.
- `shared/` stays framework-free (no React, no DOM globals except through injected interfaces) so it runs in Node and in the browser.
- Write only inside Owned paths.

## Deliverables

- **P0** Workspace skeleton (root files, `shared/` with types, catalog, store, fixtures, `keeper/` with dependencies installed).
- **P0** `ChainFeed` and `ArenaStore` with tests.
- **P0** `keeper/` loop, `/healthz`, `/drip`, `seed-house`, `force-start`, local rehearsal instructions and tooling in `keeper/README.md`.
- **P0** `.env.example` (names only).
- **P1** SSE relay, Railway descriptor, replay recorder.
- **P2** Second lane, metrics.

## Acceptance criteria

1. `pnpm install` at the repo root exits 0; `pnpm --filter @animal/shared typecheck` and `pnpm --filter keeper typecheck` exit 0.
2. `pnpm --filter @animal/shared test` and `pnpm --filter keeper test` exit 0, covering: all 21 event envelope decoders; commit then retract with a replaced `blockId`; reconnect that subscribes before snapshot with no lost or duplicated event; `getLogs` ranges never exceed 100 blocks; store equivalence between live feed and `replay`; rank tie-break (rMon, wins, address); commit-state gating (a `Proposed` event does not change persisted numbers, the same event after `Finalized` does); the drip rate limit returns 429 with `retryAfterSeconds`; the keeper loop with a fake chain performs `startRound`, `lockEpoch`, `resolveEpoch`, and on a missing seed `cancelEpoch` after the timeout and never when a seed has arrived.
3. `shared/fixtures/arena-replay.json` validates against the shared types in a test; every boost satisfies conservation (50/30/15/5) and `vTok == ceil(k / vMon)`.
4. Against a local `anvil --network monad --accounts 40` deploy with `MockSeedSource`: `seed-house` launches the roster (12 coins); the keeper starts the round, runs at least two full epochs (lock, seed, resolve) and logs seconds from `EpochLocked` to `EpochResolved`; `curl localhost:$PORT/healthz` returns `ok: true` with the round phase; a `ChainFeed` attached to the same node yields the same final store state as the on-chain `getArenaSnapshot`.
5. Killing the keeper mid-epoch and calling `resolveEpoch` manually from `cast` completes the epoch (liveness does not depend on the keeper); restarting the keeper does not double-lock a locked round.
6. `grep -rniE "(private|secret|mnemonic)[_a-z]*\s*[:=]\s*['\"]0x" keeper shared` returns nothing; no `.env` file exists in the tree; logs never contain a key (a test asserts redaction).
7. `grep -rnE "^\s*//|/\*" keeper shared` returns nothing; `grep -rnE "\bany\b|@ts-ignore|@ts-expect-error" keeper shared --include=*.ts` returns nothing.
8. No file outside Owned paths was created or changed; no transaction was sent to any real network.
