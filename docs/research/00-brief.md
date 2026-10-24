# 00 — Research Brief

Date: 2026-10-19. Author: PM. Read `docs/research/prd-inferred.md` first; it states every assumption this brief rests on.

## Project facts

**Product.** A real-time on-chain battle royale for tokens. Each coin is a 3D monster in a shared arena with its own liquidity pool. Coins level up against NPC monsters (PvE), clash with each other, and the loser's liquidity merges into the winner (auto-buy boosts the winner; value is redistributed to the losing side). The last coin standing is "The Chosen One". Source: `docs/download (1).png` (4 stages), `monster_arena_3d_prototype (1).html`.

**Chain.** Monad (EVM-compatible L1). The user said "verify current chain ids/RPC/docs from official sources". Network for the demo is assumed to be Monad testnet; mainnet status must be checked as of 2026-10-19.

**Sponsors / SDKs / required integrations.** None stated. Unknown competition. The domain track must try to identify Monad's currently running hackathons/tracks (Monad Blitz, Monad Mission, Devpost, Encode, etc.) and their rules.

**Frameworks the project already fixes.**
- The main frontend is the existing Three.js r128 3D prototype. It must be kept and wired to the chain; the scene is not rewritten (user instruction).
- Rule from the PM playbook: frontend is Next.js. The prototype is a single HTML file using CDN Tailwind, CDN Three r128 + OrbitControls, Google Fonts. The tech-stack track must argue how to migrate into Next.js (App Router) while preserving the scene, and say honestly if plain Vite would be materially better and what that costs against the playbook rule.

**Deadline.** Unknown. Assume days to a couple of weeks. Priorities must be demo-first.

**Judging criteria.** Unknown. Domain track to find.

**Machine facts.** Linux, node v26.2.0, pnpm, bun, Foundry (forge/cast/anvil) already installed at `~/.foundry/bin`. 14 GB RAM; builds go through shims capped at 4 cores.

## Research rules (apply to every track)

- Read-only on the repository. The only file you may write is your own output under `docs/research/`. No source files, no config, no installs, no git.
- Every finding cites its source: a `file:line` in the repo, or a URL with the date you read it (today is 2026-10-19). An uncited finding is an assumption and goes in the "Assumptions and open questions" section.
- Prefer primary sources (docs.monad.xyz, Monad GitHub org, Foundry book, viem/wagmi docs, vendor repos) over blog posts. Check the current version of every package; never state an API from memory. Use `npm view <pkg> version` for versions.
- Write the file with exactly these sections: `# <NN> — <Track>`, `## Summary`, `## Findings`, `## Recommendations`, `## Implications per role`, `## Assumptions and open questions`, `## Sources`.
- `Implications per role` must address these roles: **smart-contracts**, **frontend / 3D integration**, **indexer + keeper (backend)**, **product / demo / pitch**.
- No emojis. English only.

## Track 01 — Design system (output `docs/research/01-design-system.md`)

Inventory of `monster_arena_3d_prototype (1).html`, citing line numbers. This is the authoritative visual reference every page must follow. Cover:

- colour tokens and where each is used (CSS variables lines 12-17, Tailwind utility colours in markup, biome colours at lines 690-695, monster palettes in `MONSTER_CATALOG`, scene/fog/light colours)
- typography: families (Cinzel display, Plus Jakarta Sans body, JetBrains Mono numerals), scale (text-[9px]..text-base), weights, tracking, line heights
- spacing rhythm, radii (rounded-lg/xl/2xl/full), shadows, borders, glass panel recipe (lines 39-45)
- layout zones: top bar, left filters, right leaderboard + feed, bottom-left inspector, bottom-right camera + minimap, modal; widths, offsets, z-indexes, responsive breakpoints used (hidden xl:flex, hidden md:flex, sm:)
- component vocabulary: glass panel, ticker pill, HP bar, floaters, biome tag, buttons (primary gradient, secondary, chip toggles), inputs, selects, modal, leaderboard row, feed row, badges
- interaction and state patterns: hover, focus, active, disabled, selected, top-rank, animations (floatUpFade, animate-ping/pulse), custom scrollbar
- the in-world HTML overlay system (`#world-labels`, projected labels)
- every string that is not English (Indonesian) and must be translated
- what is missing for a chain product and must be designed in the same language: wallet connect button, tx status/toasts, pool/reserve display, stage/round banner ("Stage 1-4"), Chosen One end screen, merger visual. Propose each in the existing token vocabulary; mark them as proposals, not inventory.

PRD lines that raised it: all of the prototype; diagram stages 3-4 need UI the prototype lacks.

## Track 02 — Tech stack (output `docs/research/02-tech-stack.md`)

Questions to answer, each with a decision and a rejected alternative:

1. **Monad current facts** from docs.monad.xyz and the Monad GitHub org: testnet and mainnet chain ids, RPC URLs (public, rate limits), WebSocket support, explorers (Monadscan/Monadvision), faucet, block time, finality, gas model differences (gas limit charged, not used), EVM version/opcode support, contract size limit, any known tooling caveats (Foundry flags, `--evm-version`, verification). Also the official Monad developer skills / MCP / llms.txt offerings, if any.
2. **Contracts toolchain**: Foundry vs Hardhat for Monad. Foundry is installed; check `forge --version` is not needed (read-only: you may run `forge --version`, `node -v`). OpenZeppelin version, Solidity version and EVM target for Monad.
3. **Pool primitive**: what must "each coin has its own liquidity pool" be? Compare (a) arena-owned constant-product pool per coin (own minimal AMM), (b) bonding curve per coin (pump.fun / nad.fun style), (c) integrate an existing Monad DEX (Uniswap v2/v3 forks on Monad, Kuru, nad.fun, etc.), (d) hybrid. Argue from: merging liquidity atomically on a loss, auto-buy of the winner, redistribution to loser holders, demo reliability, audit surface, gas. The recommendation must be implementable by one contracts engineer in days.
4. **Randomness / combat resolution**: options on Monad (Pyth Entropy on Monad, Chainlink VRF if on Monad, commit-reveal, keeper-signed, blockhash) with current availability and addresses/docs. Recommend one for the demo and say what is production-grade.
5. **Automation / keeper**: how a keeper triggers rounds on a fast chain (Node service with viem and a funded key, vs on-chain automation, vs Gelato/Chainlink Automation if they exist on Monad). Key handling rules (no secrets in repo).
6. **Indexer / realtime**: compare viem `watchContractEvent` over WebSocket straight from the browser, Ponder, Envio HyperIndex, Goldsky, The Graph, a bespoke Node service with SSE/WebSocket. Argue from: event volume at Monad block speed, demo reliability, free tier, setup time, RPC rate limits. Decide where the 3D client gets its state: direct RPC multicall + event subscription, or a backend.
7. **Frontend migration**: how to move the single HTML into Next.js (App Router, React 19) while preserving the scene. Cover: loading Three r128 as `three@0.128.0` npm package vs keeping the CDN script, the `examples/js/controls/OrbitControls.js` global-script problem (r128 non-module build vs `three/examples/jsm`), moving the ~2,000 lines of imperative scene code into a client-only module mounted from a `'use client'` leaf using `dynamic(..., { ssr: false })`, Tailwind CDN -> Tailwind v3/v4 build with the prototype's exact utility set, fonts through `next/font`, how React panels and the imperative scene exchange data (an event bus / external store), and the risk of upgrading Three past r128. Also say whether Vite would be materially faster and what it costs against the Next.js rule. Check current Next.js, React, Tailwind, wagmi, viem, RainbowKit/ConnectKit, three versions via `npm view`.
8. **Wallet and signing UX**: wagmi + viem versions, wallet connectors that work on Monad, burner / session key options for a one-click demo, adding the Monad chain to wagmi (`viem/chains` already has monad / monadTestnet? verify).
9. **Hosting**: Vercel for the frontend, where the keeper and indexer run (Railway is available to the user), cost and cold-start implications.
10. **Platform limits and gotchas** specific to Monad that change the design (state access costs, reserve balance rule for accounts, tx ordering, `eth_getLogs` block range limits, nonce handling with a fast keeper).

PRD lines that raised it: diagram stages 1-4 ("each with its own liquidity pool", "Auto-Buy Boosts Winner", "Value Redistributed to Losers"), prototype lines 671-684 (tokens), 3098-3149 (duel resolution), 4112-4128 (launch).

## Track 03 — Domain (output `docs/research/03-domain.md`)

1. **Monad facts that matter for a demo**: mainnet launch status as of today, testnet state, ecosystem apps (DEXs, launchpads such as nad.fun, wallets), faucet availability, typical block time and what 'real-time' implies for a live arena.
2. **Hackathon / competition**: identify the currently running or most recent Monad hackathon(s) and tracks as of 2026-10-19 (Monad Blitz, Monad Mission, Devpost/DoraHacks/Encode/Rise In etc.). For each: sponsor, prize, deadline, required integrations, judging criteria, rules about originality and pre-existing code, submission format (video, repo, deployed link). If none can be found, say so plainly. Do not invent.
3. **Comparable products** and what they teach: on-chain battle royales / token-fighting games, memecoin battle products, token wars, pump.fun-style launchpads with games, Dark Forest-style autonomous worlds, Axie-like, 'meme battle' on any chain. For each: mechanic, how liquidity or value moves, what was good, what failed.
4. **Assumption check**: verify or refute each assumption A1-A12 in `prd-inferred.md` with evidence. In particular: is a "loser's liquidity merges into the winner" mechanic economically and legally sensible (rug-risk, wash trading, front-running a known loser, MEV, sandwich around merge), and what guardrails make it credible to judges (pre-announced rules, merge timelock, snapshot of holders, caps).
5. **Demo economics**: what a judge needs to see (a coin launched, trades, a clash, a merger with visible value flow, a Chosen One) in under 3 minutes, and what is realistic on testnet with fake liquidity.
6. **Risks**: regulatory framing ("game", not "gambling" claims), copyright (monster art is procedural/original), MEV, oracle manipulation, griefing (spawn spam for the 30-slot cap).

PRD lines that raised it: diagram stages 1-4; competition context from the user message.

## Track 04 — Repo audit (output `docs/research/04-repo-audit.md`)

The repo holds only docs and one HTML file. A conventional audit is empty, so this track is an **audit of the prototype's code as a migration source**:

- file inventory with sizes; confirm there is no `package.json`, no git repo, no tests
- code map of `monster_arena_3d_prototype (1).html` by line range: CSS, markup zones, config/catalog, scene setup, procedural textures, environment builder (`buildConnectedArena`), monster mesh factory (`createMonster3DMesh`), rig animator, simulation (`updateSimulation`), particles, UI handlers, launch modal, render loop
- **seams for chain wiring**: every place that reads or writes simulated state (`INITIAL_TOKENS`, `createRandomTokenConfig`, `lp`, `wins`, `rank`, `startDuel` / `resolveDuel`, `autoRespawn`, `syncPopulation`, launch form submit, leaderboard sort, kill-feed). For each, state the data it would need from the chain and the event it should react to
- global state and DOM coupling that blocks a clean module extraction (direct `document.getElementById` calls inside the sim loop, `window.innerWidth`, top-level `const`s), count of occurrences, and a proposed module split (e.g. `scene/`, `monsters/`, `sim/`, `ui-bridge/`) that moves code without rewriting it
- external dependencies and their exact versions (Three r128, OrbitControls from examples/js, Tailwind CDN, fonts) and any API used that changed after r128
- performance facts: instance counts, per-frame allocations, shadow settings, what the 30-coin chain-driven mode would cost vs the 60-500 benchmark
- the gap list: everything the diagram requires that the prototype lacks (PvE NPC monsters, 30-coin cap, stage state machine, liquidity visuals / pool vessels, merger animation, Chosen One finale, wallet UI, round timer)
- correctness hazards in the prototype that a real integration would surface (e.g. `resolveDuel` never changes `lp`, `monsters.splice` while iterating, selection on removed monster)

PRD lines that raised it: user instruction "keep it and wire it to the chain; do not rewrite the scene".

## Tracks skipped, and why

None skipped. Track 04 is repurposed from a conventional repo audit to a prototype-as-migration-source audit because the repository is greenfield apart from the prototype.

## Output files

- `docs/research/01-design-system.md`
- `docs/research/02-tech-stack.md`
- `docs/research/03-domain.md`
- `docs/research/04-repo-audit.md`
- `docs/research/05-synthesis.md` (PM, after the four above)
- `docs/research/06-tooling.md` (tooling agent, after synthesis)
