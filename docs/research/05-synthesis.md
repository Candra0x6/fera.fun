# 05 — Synthesis

Revision 2, 2026-10-19. Author: PM. Revision 1 chose the per-clash, blockhash-seeded scaffold from the tech-stack track. The user's final decisions replaced it: **the brainstorm plan (`docs/brainstorm/2026-10-19-monad-monster-arena-onchain.md`) wins every conflict (its Q13).** This file records the resulting decisions. Inputs read in full: `01-design-system.md`, `02-tech-stack.md`, `03-domain.md`, `04-repo-audit.md`, `06-tooling.md`, `prd-inferred.md`, the brainstorm plan and its companions `architecture.md` and `research.md` (read, not modified), and `docs/arch.md` (the brainstorm's summary page).

## What we are building

An on-chain battle royale for coins on Monad testnet. Up to 30 coins per round, each a real ERC-20 clone with its own virtual-reserve bonding curve held in one `Arena` contract, shown as a 3D monster in the existing Three.js scene. Each epoch the arena locks **all** alive coins, requests **one** randomness seed, then pairs coins from that seed, rolls the clashes, merges losers into winners (virtual buy-and-burn boost), runs PvE hunts for xp, and unlocks. The last coin standing is the Chosen One and becomes redeem-only at `(reserve + pot) / supply`. The 3D client replays confirmed chain events and never decides an outcome. It is a fun project: no competition, no deadline, full scope in phases (P0 then P1, P2 only if time remains).

## User decisions of record (final)

| # | Decision |
|---|---|
| U1 | Competition target: none. Build the full scope in phases. No one-day cut line. |
| U2 | Monad testnet (10143) only. |
| U3 | Mechanics are the focus: the real mechanism from the brainstorm plan, not the blockhash scaffold. The contract needs an Entropy adapter behind `ISeedSource` with the address as configuration; a mock seed is used only for local anvil and tests. Entropy address and documentation discrepancies are not a side quest. |
| U4 | Brainstorm plan wins every conflict (Q13): epoch lock (`lockEpoch` freezes all alive coins and requests one seed; `resolveEpoch` pairs at resolve time, rolls clashes, merges losers, runs hunts, unlocks; no keeper-picked pairs); odds = base x level x element x pool factor with pool exponent about 0.85, public and frozen before the seed exists; permanent creator seed; merger = virtual buy-and-burn boost (never a plain injection); default split 50 / 30 / 15 / 5 (boost / consolation / pot / treasury) as configuration; "Value Redistributed to Losers" = consolation claimable by holders of the eliminated coin, spreading to surviving pools is a configuration switch (default off); coins are real ERC-20 clones with mint and burn only by the Arena, each with its own bonding curve; the brainstorm's hour-16 fallback to stake pools if curve and merger tests are not green; the last coin is redeem-only at `(reserve + pot) / supply`. |
| U5 | Frontend: Vite plus the extracted vanilla Three.js scene (three pinned 0.128.0), no Next.js rewrite. The frontend replays confirmed chain events only (`monadLogs` WebSocket plus Multicall3 snapshot). The fixture replay (`?replay=fixture`) stays as a fallback. Wallet: injected plus testnet-only burner with a drip. No indexer in v1. |
| U6 | Keep the four-role split and the three-minute demo path, updated to the epoch model. |
| U7 | Hard limits for every implementer: no deploy and no private keys anywhere (deployment is a user step through `contracts/DEPLOY.md` with a Foundry keystore); no global installs; no git; no Monkies tasks; do not edit the prototype HTML or the PNG; the user's credentials from the global instruction files never go into any file or prompt. |

## Decisions

| # | Decision | Driven by | Rejected |
|---|---|---|---|
| D1 | **Network: Monad testnet 10143.** Code is chain-agnostic (`defineChain`, `deployments/<chainId>.json`). | U2; `02` F1, `03` Finding 1, brainstorm R1-R4 | Mainnet |
| D2 | **Contracts: Foundry**, `network = "monad"`, solc 0.8.31, `evm_version = "osaka"`, no `via_ir`, OpenZeppelin 5.6.1 (`ERC20`, `Clones`, `ReentrancyGuardTransient`), Solady `powWad` for the fractional pool exponent, forge-std 1.17.0. | `02` D2, brainstorm Spec 1; Foundry already installed (1.8.3) | Hardhat |
| D3 | **Money model: ledger-in-Arena with a virtual-reserve curve per coin and an ERC-1167 `MonsterCoin` clone per coin** (mint and burn only by the Arena, no permit, no user burn). `k = vMon * vTok` is always read from current state. Creator seed is permanent (held by the Arena until the coin ends). | U4; brainstorm Decision 1-3 and Spec "Money model"; `03` guardrails 5 and 8 | Constant-product pool with real reserves only (`02` D3), plain reserve injection for the boost, nad.fun or Uniswap pools, stake pools as the main design (kept only as the hour-16 fallback) |
| D4 | **Epoch engine:** `lockEpoch` freezes all alive coins and requests one seed through `ISeedSource`; the callback stores the seed only; `resolveEpoch(roundId, maxClashes)` pairs from the new seed (Fisher-Yates from `keccak(seed, "PAIR")`, reproducible across batched calls from `(seed, aliveMask)`), rolls each clash from `keccak(seed, "CLASH", clashId)`, merges, runs hunts from `keccak(seed, "HUNT", coinId)`, unlocks, pays the keeper bounty at completion only. `cancelEpoch` after the timeout and only while no seed has arrived (cap 3 in a row) then `abortRound` with pro-rata refunds. | U4; brainstorm Decision 4-5, threat model T3-T7 | Per-clash freeze with keeper-chosen pairs (`startClash(a, b)`), blockhash seed for value |
| D5 | **Odds are public and frozen before the seed exists:** `power = baseStat x (1 + levelBonus x (level - 1)) x elementMult x clamp((rMonAtLock / meanRMonAlive)^gamma, 0.1, 10)`, `gamma = 0.85`, win probability clamped to 15-85 percent. Leveling epochs run hunts only; clashes start in Knockout. | U4; brainstorm Spec "Combat" and Economy table | `sqrt(reserve)` weight (the brainstorm's red-team "first design": EV per MON about 4x at 0.1x pool) |
| D6 | **Merger:** loser reserve `R` split in bps into boost / consolation / pot / treasury (default 5000 / 3000 / 1500 / 500, all configuration); boost = `k = vMon*vTok; vMon += X; rMon += X; vTok = ceil(k/vMon)` (virtual buy-and-burn); consolation claimable at a fixed rate by holders of the eliminated coin; `consolationMode = SpreadSurvivors` is a switch, default off. Settlement: the last coin is redeem-only at `(rMon + pot) / supply`. | U4; brainstorm Decision 6-7; `02` D3.6 for the conservation idea | 70/20/10 three-way split; snapshot-and-airdrop; in-kind winner tokens |
| D7 | **Randomness: Pyth Entropy v2 behind `ISeedSource`**; `EntropySeedSource` takes the Entropy and provider addresses as constructor configuration; `MockSeedSource` only for local anvil and tests and not selectable by the real deploy script. `prevrandao` and `blockhash` are never used for value. | U3; brainstorm Decision 4 and Q3; `02` F4 (Chainlink VRF is not on Monad) | Blockhash seed as P0, keeper-signed results, commit-reveal with a keeper secret, Supra for P0 |
| D8 | **Economy gate before Solidity:** role 04 rebuilds the simulator, reproduces the brainstorm Economy table, runs three red-team checks (1-wei sell after a merge, ghost-coin EV, early-public bracket) and publishes `GATE: PASS` or `GATE: FAIL` with final parameters. The contracts role starts the curve and combat implementation only on `GATE: PASS`. Target EV per MON staked 0.87-0.97 across pool multiples 0.25x-5x. | brainstorm Pre-mortem 1, Prompt A first task, T1, T2, T4 | Tuning after the contracts exist |
| D9 | **Checkpoint G16:** if invariants 1-5 and tests T1, T2, T4, T6, T10, T15 are not green after about 16 agent-hours or two fix cycles, the contracts role stops and reports; the fallback is stake pools (Option E) with the same events. The PM decides with the user. | U4; brainstorm Spec 5 gate | Continuing silently |
| D10 | **Backend:** one Node and TypeScript process (`keeper/`) with viem, Hono, zod, pino: the keeper loop, the faucet drip and, as P1, an optional SSE relay that hides a keyed provider. No indexer, no database. `shared/` holds the framework-free `ChainFeed` and `ArenaStore` used by the keeper and by the browser. | U5; brainstorm Spec 4, E5 and E6, Prompt B | Ponder, Envio, Goldsky, The Graph, on-chain automation, keeper on Vercel functions |
| D11 | **Client data path:** the browser reads the chain directly through `ChainFeed` (raw `eth_subscribe("monadLogs")` for `blockId` and `commitState`, Multicall3 snapshot at `safe`, backfill in chunks of at most 100 blocks, subscribe-first on reconnect); the relay is optional. Gating: Proposed is cosmetic text, Voted plays animations, Finalized persists numbers and enables claims. | U5; brainstorm Spec 3 and 4; `02` D4.2 for timings, `research.md` R23-R26 | Browser polling of the public RPC, a hosted indexer in the hot path |
| D12 | **Frontend: Vite, TypeScript strict for `.ts` and `.tsx`, React 19 only for new chain-UI islands, Tailwind v3 built (not the CDN), three pinned at exactly 0.128.0.** The prototype script (`prototype:567-4183`) is extracted verbatim into one ES module with the minimal edits listed in `02-frontend-3d.md`; the prototype's own HUD markup and DOM handlers stay; the scene `.js` files are excluded from type-checking by configuration. | U5; brainstorm Q6 and Prompt C; `04` Findings 4 for the three upgrade table; `02` F7 for `three/examples/jsm` | Next.js (hydration and script-order work for no gain), upgrading three, Tailwind v4, rewriting the HUD in React |
| D13 | **UI-scene bridge:** the scene receives data only through `ArenaBridge`; the director (TypeScript) orchestrates events into bridge calls with gating, dedupe, fast-forward and an 8-duel cap; duels are pure replays through `scriptDuel` seeded by `clashId` and forced to end on the chain's winner; no `Math.random` in chain mode. | brainstorm Spec 3 and Prompt C; `04` Findings 8 | Computing winners from HP |
| D14 | **Wallet:** viem with EIP-6963 injected discovery plus a testnet-only burner funded by `POST /drip`; no wagmi, no RainbowKit, no Privy in v1. Writes use `writeContractSync` with explicit gas; value-sending transactions from accounts under 10 MON are serialised at least 4 blocks apart. | U5; brainstorm Q7; `02` D8 | wagmi (extra dependency for no gain in Vite with two connectors), Privy (P2) |
| D15 | **Hosting:** keeper on Railway, web static (any static host). Deployment is a user step. Contract deploy from the user's laptop with a Foundry keystore. | `02` D9; brainstorm E8 | Keeper on Vercel functions |
| D16 | **Repo layout (brainstorm names):** `contracts/`, `keeper/`, `web/`, `shared/` (`@animal/shared`), `sim/`, `deployments/`, `docs/`; pnpm workspace over `web`, `keeper`, `shared`. | brainstorm Spec 5 E0 | Single package; `server/`, `packages/shared/` |
| D17 | **Design contract = `01-design-system.md`**, embedded in the frontend handoff. Prototype dev toggles and "simulated" wording are removed in chain mode; the F13 defects are fixed during the extraction; proposals P1-P10 are the vocabulary for new chain UI. | `01` R1, F12, F13 | Restyling |
| D18 | **Language and risk framing:** "arena", "clash", "merge", "boost", "consolation", "claim", "redeem", "launch". Never "bet", "wager", "payout", "yield". Permanent testnet play-money label; house-seeded coins labelled "House". | `03` guardrail 11; brainstorm Pre-mortem 5 and Q11 | Neutral copy |

## The stack, fixed

Step 5 installed tooling for exactly this list.

| Layer | Choice | Version |
|---|---|---|
| Chain | Monad testnet 10143 | node v0.16.5 per docs |
| RPC | `https://testnet-rpc.monad.xyz`, `wss://testnet-rpc.monad.xyz`; fallback `https://rpc-testnet.monadinfra.com`, `wss://rpc-testnet.monadinfra.com`; `eth_getLogs` max 100 blocks; a user-supplied keyed URL may replace them | |
| Contracts | Foundry (forge, cast, anvil), Solidity 0.8.31, `evm_version = "osaka"`, `network = "monad"`, no `via_ir` | forge 1.8.3 installed |
| Contract libs | OpenZeppelin Contracts, forge-std, Solady (pinned), Pyth Entropy SDK interfaces | 5.6.1, v1.17.0, pin at install, 2.2.1 |
| Randomness | `ISeedSource`: `EntropySeedSource` (real), `MockSeedSource` (tests and local anvil only) | |
| Frontend | Vite, React (islands), TypeScript, Tailwind v3, PostCSS, Autoprefixer | per `npm view` at install; tailwindcss 3.4.19 |
| 3D | three (exact pin), OrbitControls from `three/examples/jsm` | 0.128.0 |
| Chain client | viem (no wagmi) | 2.57.7 |
| Shared | `@animal/shared`: types, `ChainFeed`, `ArenaStore`, catalog, fixtures, ABI sync | workspace |
| Backend | Node, TypeScript, Hono + `@hono/node-server`, zod, pino, tsx, vitest | hono 4.13.13, @hono/node-server 2.1.5, zod 4.6.7, pino 10.4.0 |
| Package manager | pnpm workspace | 11.4.0 |
| Hosting | Railway (keeper); static host (web) | |
| Verification | Sourcify via MonadVision (`--verifier-url https://sourcify-api-monad.blockvision.org/`) | |

Versions are as reported by `npm view` on 2026-10-19 by the research tracks. Engineers re-run `npm view` before pinning and report drift.

## Contradictions resolved

| # | Contradiction | Winner and why |
|---|---|---|
| C1 | `02` proposed one constant-product pool per coin with real reserves; the brainstorm proposes a virtual-reserve curve per coin with ERC-1167 clones. | Brainstorm (U4). It carries the red-team fixes: the virtual buy-and-burn boost (a plain injection lets a 1-wei seller take the whole bonus), the permanent seed, and a boost that preserves `k`. The invariants in `contracts.md` 2.7 test exactly those. |
| C2 | Merger split: `02` 70/20/10; brainstorm 50/30/15/5. | Brainstorm 50/30/15/5, as configuration; the simulation tunes it (D8). |
| C3 | Randomness: `02` demo = future blockhash; brainstorm = Pyth Entropy per epoch behind `ISeedSource`. | Brainstorm (U3). Blockhash is leader-influenceable and has a 256-block window; the Mock seed exists only for tests and local anvil. The Entropy address is deploy-time configuration (the earlier address discrepancy is not a build concern). |
| C4 | Pairing and freeze: `02` keeper-picked `startClash(a, b)` with a per-clash freeze; brainstorm global epoch lock with seed-derived pairing at resolve. | Brainstorm (U4). A keeper that picks pairs can cherry-pick matchups and leak the bracket; a per-clash freeze leaves the outcome knowable while other coins trade. |
| C5 | Odds weight: `02` `isqrt(reserve)`; brainstorm `(rMon/mean)^0.85` clamped. | Brainstorm; the sqrt weight is the first design the red-team showed to favour ghost coins. |
| C6 | Frontend: the PM's revision 1 used Next.js and a full HUD rewrite in React; the user decided Vite plus the extracted scene. | User (U5). The prototype's HUD DOM stays; new chain UI is React islands. The playbook's "frontend is Next.js" default is overridden by the user's explicit decision. |
| C7 | Scene delivery: revision 1 split the scene into modules (`04` audit) behind an adapter; the brainstorm extracts verbatim to one file. | Verbatim single module, with the minimal edits; the audit's module split is a P2 refactor. The audit's hazards that remain real in a single-page Vite app (non-deterministic outcome code, `innerHTML` injection, strings, defects) stay in the edit list. |
| C8 | `02` suggested a `// @ts-nocheck` comment on scene JS; the standing rules forbid comments and suppressions. | The scene stays as `.js` excluded from `tsc` and ESLint by configuration. |
| C9 | The moved prototype code is full of comments; the standing rule is no comments. | Comments stripped mechanically during the extraction. |
| C10 | PvE: `02` keeper-only `runPvE` seeded from `blockhash`; brainstorm per-epoch hunts from the same seed inside `resolveEpoch`. | Brainstorm: hunts, xp and levels are P0 inside the epoch; the keeper cannot choose when a hunt runs. Hunt NPC visuals are P0 (simple), level and xp UI polish is P1. |
| C11 | Keeper key handling: brainstorm says a keystore path in `KEEPER_KEYSTORE`; this plan uses `KEEPER_PRIVATE_KEY` environment variables. | Environment variables injected by the user (Railway variable or local shell); reading a Foundry keystore needs an extra decryption dependency. The repo never contains a value; agents never handle keys; `.env.example` has names only. The user may switch to a keystore later. |
| C12 | Relay: revision 1 made an SSE relay the primary client path; brainstorm and the user make the direct `monadLogs` feed primary and the relay optional. | Direct feed primary (U5); the relay is P1 and only hides a keyed provider. |
| C13 | Ticker uniqueness: `02` unique per arena; brainstorm not unique (front-run squatting; UI shows `TICKER #coinId`). | Brainstorm: not unique; tickers are `[A-Z0-9]{2,7}` and always escaped. |
| C14 | Creator seed: `02` mints the supply into the pool and the creator holds nothing; brainstorm buys tokens held by the Arena until the coin ends. | Brainstorm; both prevent mid-round withdrawal; the held-tokens version supports the fixed-rate `claimSeed`. |
| C15 | Network versions: Monad `current-facts.md` stale versus network and releases pages. | Live pages and `web3_clientVersion`; not a build dependency. |
| C16 | Block time: viem 400 ms versus docs and measurement 300 ms. | 300 ms. |
| C17 | The prototype's 60 target and 500 stress button versus the diagram's 30. | 30 is `maxCoins`; the scale buttons exist only behind `?sim=1`. |
| C18 | Skin switcher versus immutable on-chain `skinId`. | Skin is immutable chain data; the switcher exists only in `?sim=1`. Canonical skin names: Default, Obsidian, Gold, Azure, Mythic mapped to ids 0-4. |
| C19 | Competition status and the Blitz cut line. | There is no competition (U1); the cut line, one-day schedule and Blitz-specific scaffolding are removed. The domain track's hackathon findings are informational only. |

## Unverified assumptions that still stand

User or environment dependent:

1. A funded deployer keystore, a keeper EOA (about 25 MON: 10 MON reserve rule plus gas), a drip EOA, a seeder EOA, optionally a keyed RPC provider, and the Entropy contract and provider addresses at deploy time. All user steps; no agent handles keys.
2. The faucet drip size and cooldown (the faucet returned HTTP 429 to the research agents).
3. The user's willingness to have the demo preset (20 s epochs, 3 leveling epochs) disclosed on screen.

Technical, settled by spikes inside the role files:

4. Contract accounts and the 10 MON reserve-balance rule for an `Arena` that pays out its whole balance (docs describe EOAs). Local simulation first; the real answer is a Day-1 check in `contracts/DEPLOY.md`.
5. `forge` 1.8.3 accepts `evm_version = "osaka"` with solc 0.8.31.
6. `monadLogs` filtered by address behaves like `logs` with the same filter shape (only the unfiltered variant was probed).
7. Gas of `resolveEpoch` for 6 and 15 clashes plus 30 hunts (brainstorm estimates: 2-4M versus 7-9M; per-transaction cap 30M). Measured in `GAS.md`.
8. Entropy testnet latency (about 2-3 s, n = 3) and fee (about 0.128 MON per request) at deploy time.
9. The economy: only the simulation can say it is non-degenerate; the GATE verdict is the acceptance test.
10. Frame time at 30 coins on the demo machine (about 2,830 draw calls per frame by stub-harness count).
11. Tailwind 3.4.19 output versus the prototype's CDN 3.4.17 for its class set (not diffed).
12. Testnet resets (last 2025-12-16): deployment and seeding scripts are re-runnable.
13. Interpretation: Leveling epochs resolve hunts only and clashes start in Knockout (read from the brainstorm state machine; the contracts role confirms in Phase C0).

## Risks, ranked

1. **Economy degeneracy** (ghost coins, whales, bearer boost, early public bracket). Mitigation: the simulation gate (D8) and the named contract tests T1, T2, T4.
2. **Contract complexity** (curve, epoch engine, merger, claims, abort). Mitigation: G16 checkpoint with the stake-pool fallback; invariants 1-5 and five handlers; phased delivery.
3. **Frontend is the critical path** (verbatim extraction, bridge, director, six islands). Mitigation: fixture replay first; phases F0-F2 each end in a checkable state; the scene is not rewritten.
4. **Randomness liveness and manipulation** (late seed, provider re-roll, T3). Mitigation: `cancelEpoch` after 60 s with a cap of 3, `abortRound`, accepted on play-money testnet, mainnet gate listed in the brainstorm plan.
5. **RPC limits** (25-50 rps public). Mitigation: direct feed with one socket per viewer is fine at tens of viewers; optional relay with a keyed provider; Multicall3 snapshot; 100-block log pages.
6. **Regulatory framing** (gambling claims against pool-pays-holders games). Mitigation: testnet play-money, wording rules, house coins labelled; not legal advice.
7. **Reserve-balance rule** may affect keeper and burner flows (spike 4).
