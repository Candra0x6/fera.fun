# 02 — Frontend and 3D integration

You cannot ask the user questions. Everything you need is in this file, `contracts.md`, and the files named below. When something is genuinely undecidable, choose the option that serves the P0 demo path, record it in `web/DECISIONS.md`, and report it.

Decision of record (user, final): **Vite plus the extracted vanilla Three.js scene (three pinned at 0.128.0), no Next.js, no scene rewrite.** The frontend replays confirmed chain events only (`monadLogs` WebSocket plus a Multicall3 snapshot) and never decides an outcome. The fixture replay (`?replay=fixture`) stays as a fallback. Wallet: injected (EIP-6963) plus a testnet-only burner with a drip. No indexer in v1.

## Context — read first

1. `docs/handoffs/contracts.md` — read in full: sections 1 (network, catalog), 3 (shared types, `ChainFeed` and `ArenaStore` you consume from `@animal/shared`), 4 (keeper, drip), 5 (fixture stream), 6 (the `ArenaBridge` you implement, commit-state gating, duel rules), 7 (env names), 8 (burner rules), 9 (display rules). Section 2 is the on-chain interface you call (through the ABI in `@animal/shared`), including the epoch rules in 2.6.
2. `docs/brainstorm/2026-10-19-monad-monster-arena-onchain.md` — the authoritative design (it wins every conflict). Read Spec sections 2 (prototype data model to on-chain state), 3 (event to animation mapping and the `scriptDuel` rule), 4 (feed, keeper and wallet), epics E6 and E7, Open questions Q6-Q8, and **Prompt C (your brief)**. Read-only: never modify anything under `docs/brainstorm/`.
3. `docs/brainstorm/2026-10-19-monad-monster-arena-onchain/architecture.md` — "Current architecture" and "Touchpoints" tables (which prototype lines change), the epoch sequence and lifecycle diagrams.
4. `docs/research/04-repo-audit.md` — read Findings 1 (code map), 2 (seams S1-S25), 4 (dependencies and the Three migration table: do not upgrade three), 5 (performance), 7 (hazards H1-H21) and 8 (ChainDrivenMode: what to disable, choreography phases, position reconciliation). Its module split and React-mount guidance are **superseded**: the scene is extracted as one ES module, the prototype's own HUD DOM stays, and only new chain UI is React.
5. `docs/handoffs/00-overview.md` — demo path (your P0), ownership, dispatch order, conventions.
6. `docs/research/05-synthesis.md` — decisions D10-D18, contradictions C4-C6, C13.
7. `docs/research/02-tech-stack.md` — F7 (migration facts: `three@0.128.0` has `examples/jsm/controls/OrbitControls.js`; Tailwind v3), D8 (burner wallet), D10 (platform limits). Its Next.js sections are superseded.
8. `docs/research/01-design-system.md` — the whole file is the design contract; the inventory is embedded verbatim in Appendix A so you do not have to re-derive it.
9. `docs/pitch/copy.md` — all UI strings and the wording rules, written by role 04. It may not exist when you start; until it does use the replacement strings in Appendix A (F12) and refactor to the copy file when it lands. All user-facing strings live in one module, `web/src/copy/strings.ts`.
10. The prototype itself: `monster_arena_3d_prototype (1).html` at the repo root. **Read-only; never edit it, and never edit the PNG.** It is the source of the scene code and the HUD markup you extract.

## Tools — skills and MCP

Project scope (see `docs/research/06-tooling.md`; MCP servers load only in a new Claude Code session after the user approves them):

| Name | Kind | Use it for |
|---|---|---|
| `viem-docs` | MCP | viem 2.x API and source: `defineChain`, `webSocket` and `fallback` transports, `writeContractSync`, multicall, `generatePrivateKey`, `getLogs`. |
| `context7` | MCP | Library docs: Vite, React 19, Tailwind v3 (`/websites/v3_tailwindcss`), vitest. Public library questions only; never put keys or unreleased source in a query. |
| `monad-docs` | MCP | Chain facts for wallet and chain config (explorers, WebSocket URLs, `monadLogs` semantics, reserve-balance rule). Read-only. Never call `submit_feedback`. |

Already on the machine and visible to you (invoke before writing the code they cover): `work:reuse-first` (before any frontend code), `work:react-components` and `work:typescript-types` (the islands), `work:react-performance` (the render loop versus React), `work:animation-qa` before finishing (reduced motion, cleanup, per-frame work), `modern-web-guidance` for modal, focus and scroll patterns, `design-review:design-review` for the final visual review. Do not use the Next.js skills (this is a Vite app).

Do **not** use any Three.js skill or the threejs.org `llms.txt`: they target modern Three (`three/addons`, `outputColorSpace`, physical light units) and contradict the pinned r128 scene. The prototype itself is the reference for the scene. Do not use the Solana, Stellar or Soroban skills.

## Owned paths

- `web/**` (including `web/package.json`, `web/DECISIONS.md`)

You write nothing else. The workspace root, `keeper/` and `shared/` belong to the backend role (ask the PM for any change there, including new shared types). `contracts/` and `deployments/` belong to the contracts role (read-only for you).

## Responsibilities

1. Extract the prototype scene verbatim into a Vite app and prove the page is unchanged in `?sim=1` mode.
2. Wire it to the chain through `@animal/shared` (`ChainFeed`, `ArenaStore`): the chain decides who exists, who fights, who wins and the amounts; the client replays confirmed events with commit-state gating.
3. Make duels pure replays of `ClashResolved`, with no `Math.random` in chain mode.
4. Build the chain UI the prototype lacks as React islands in the prototype's design vocabulary: wallet, lobby and launch, trade drawer, lockdown banner, rules card, toasts, stage rail, claim and redeem panels, Chosen One screen.
5. Keep the sim mode (`?sim=1`) and the fixture replay (`?replay=fixture`) as rehearsal and fallback.

## Scope

### In scope

- `web/` Vite app (TypeScript strict for `.ts` and `.tsx`), the extracted scene module, the bridge, the director, React islands, the wallet layer, the copy module.
- Edits to the extracted prototype code and markup listed below and nothing else.
- Unit tests for pure logic (duel script, director, formatters, wallet helpers).
- Visual verification in a real browser.

### Out of scope

- Solidity, keeper, ChainFeed and ArenaStore internals, shared types, ABI files, root workspace files, deployment descriptors.
- Choosing winners, pairings or amounts in the client. There is no code path in chain mode where `hp <= 0` or `Math.random` decides an outcome.
- Upgrading three beyond 0.128.0; Tailwind v4; Next.js; wagmi, RainbowKit, ConnectKit; Privy and ERC-4337 flows; an indexer.
- Rewriting or restyling the environment, monster meshes, textures, rig animator or the prototype's panels beyond the listed edits.
- A phone layout (desktop-first, 1280 px and wider).

## Objectives

1. P0: the demo path in `00-overview.md` works end to end in the browser, first against the fixture replay, then against a local anvil deploy and the keeper.
2. The page in `?sim=1` mode is visually identical to the prototype (same camera, lights, colours, monsters, VFX, panels).
3. Every number on screen comes from the chain; animations lag the chain by design and never decide anything.
4. Survives a WebSocket drop (resubscribe, snapshot, backfill, no duplicate animations).

## Requirements

Phase F0 — Vite shell and verbatim extraction (P0)

- **P0** Create `web/` with Vite, React 19 (for the islands only), TypeScript strict, Tailwind CSS v3.4.x with PostCSS and Autoprefixer (not v4), ESLint. Re-run `npm view vite react tailwindcss viem three @vitejs/plugin-react vitest version` and report drift. Pin `three` to exactly `0.128.0` (no caret). Add `@animal/shared` as a workspace dependency (`workspace:*`). Install with `pnpm install --filter web`; do not touch the root or other packages' manifests. Pre-approved: vite, @vitejs/plugin-react, react, react-dom, typescript, tailwindcss (3.x), postcss, autoprefixer, eslint with typescript-eslint, viem, three, vitest, @animal/shared.
- **P0** `vite.config` and project settings that keep building within this machine's limits (the shimmed 4 cores; do not raise concurrency); `productionBrowserSourceMaps` equivalent off (no production source maps).
- **P0** `index.html`: the prototype markup (`prototype:162-565`) verbatim with only these edits: the title (`Monster Arena`), the Spec badge replaced by `Monad Testnet`, the strings and defects in Appendix A (F12, F13), host `div`s for the React islands (`#island-wallet`, `#island-lobby`, `#island-lockdown`, `#island-stage`, `#island-trade`, `#island-claims`, `#island-champion`, `#island-rules`, `#island-toasts`), the prototype's launch modal removed in favour of the launch island. Tailwind is built (not the CDN); the prototype's `<style>` block moves to `src/styles/arena.css` unchanged (with `.glass-panel` inside `@layer components`); Tailwind tokens per Appendix A section R1; `content` globs include `index.html` and `src/**/*.{js,ts,tsx}` so class strings inside the scene JS are generated. Fonts: keep the Google Fonts `<link>` (self-hosting is P1).
- **P0** Extract the inline script (`prototype:567-4183`) **verbatim** into `web/src/arena/arena3d.js` as an ES module: `import * as THREE_NS from 'three'`, `import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'`, `const THREE = { ...THREE_NS, OrbitControls }` so all 342 `THREE.` references stay unchanged; replace `window.onload` with an exported `start()`; keep the DOM ids. Strip all comments mechanically (standing rule). The `.js` files are excluded from `tsc` and ESLint by configuration (`allowJs` and `checkJs` false; ESLint ignore), never by suppression comments.
- **P0** Edits to the extracted code, each listed here and nothing else: translate every Indonesian string (Appendix A F12.1) and the strings that say the chain part is fake (F12.2); the F13 defects (undefined `animate-fade-in`, invalid `py-0.2`, static "Just now" replaced by relative time, element pill coloured per element, telemetry text, one zone name, one set of skin names, selected states, selectable text for addresses and hashes); replace every `innerHTML` that interpolates a ticker or name with `textContent` or an escaping helper (hazard H21); hide in chain mode the scale buttons, trigger duel, auto-respawn, animation preview, skin switcher, `INITIAL_TOKENS` and `createRandomTokenConfig` and `syncPopulation` (they run only with `?sim=1`); add focus-visible rings, `disabled:` variants, `aria-label` on icon-only buttons; cache the `centralCrown` lookup.
- **P0** Prove the extraction: with `?sim=1` the app behaves like the prototype (60 default coins, random duels, particle absorption). Capture matching screenshots of the prototype HTML and of the Vite page at the default camera with `browser-cdp open` and `screen-nav snap brave`, list the paths and any differences in `web/DECISIONS.md` (textures use `Math.random`, so compare by eye, not by pixel diff).

Phase F1 — bridge, director, chain mode (P0)

- **P0** `ArenaBridge` appended to `arena3d.js` and typed in `web/src/arena/bridge.ts` and `bridge.d.ts` exactly as `contracts.md` section 6. In chain mode (default) disable the `Math.random` encounter block (`prototype:3505-3516`), autoRespawn (`3439-3442`), the population and token generators; keep roaming cosmetic and deterministic spawn anchors: position is a function of `hash(roundId, coinId)` and element-to-biome mapping, run through the obstacle check with a seeded RNG, so every client starts the same layout; hydration places coins without animation or history replay.
- **P0** Duels are pure replays: `scriptDuel(clashId, typeA, typeB, winner)` with a PRNG seeded by `clashId`, re-salted up to 32 times until the natural loser equals the chain's loser, and as a last resort the final strike is forced; the on-chain winner always survives; no `Math.random` anywhere in chain mode; at most 8 duels at once from a queue; the approach phase (pair dashes to a midpoint in about 0.8 s) and the scripted duel (about 2.7 s, 6 strikes every 0.45 s) reuse the prototype's strike loop, VFX, floaters, `spawnConsumptionParticleStream` and victory visuals; `resolveDuel` is called by the bridge, not by HP. Plan-aware strike loop edits follow `04-repo-audit.md` Findings 8 (about 6 lines).
- **P0** `web/src/chain/director.ts`: the event-to-animation orchestrator. Subscribes to `ArenaStore` and the `ChainFeed` envelopes; applies the gates in `contracts.md` section 3 (cosmetic `Trade` text at Proposed; animations at Voted; persisted numbers and the claim buttons at Finalized); maps events per the brainstorm's section 3 table (`CoinLaunched` spawn, `RoundStarted` fit camera, `EpochLocked` lockdown, `ClashResolved` plus `Boosted` duel and boost stream, `HuntResolved` wild NPC fight, `LevelUp` ring, `CoinEliminated` greyed label, `ByeGranted`, `EpochCancelled` toast, `RoundSettled` crown); de-duplicates by envelope id; fast-forwards an event older than 15 s on arrival; drops a clash whose loser is already removed; moves leaderboard order, win counters, pool numbers and feed rows at the `merged` beat ("truth first, show later"); never reads positions back into chain logic.
- **P0** Hunt NPCs: reuse `createMonster3DMesh` with the obsidian skin and a scale beside the coin, a 1.2 s scripted fight; success shows `+xp`, failure plays the `hit` pose.
- **P0** Leaderboard and feed data: `lp` becomes `rMon` in MON; the leaderboard shows all coins (scrollable, not just the top 8); the feed row shows winner, loser, boost, consolation, pot, treasury and an explorer link from `ClashResolved` and `Boosted`.
- **P0** Reconnect behaviour: `ChainFeed` status drives a status chip (live, syncing, lagging, disconnected); after a drop the store re-hydrates and no animation is duplicated.

Phase F2 — chain UI islands (P0)

- **P0** Wallet island: injected wallets by EIP-6963 discovery plus `wallet_addEthereumChain` with the viem chain object (`contracts.md` section 1), and a testnet-only burner: `generatePrivateKey()` in the browser, `localStorage` key `monster-arena.burner`, permanent banner "Testnet play-money, do not deposit real funds", a `POST /drip` call to the keeper, balance display, `Switch Network` state. Connect-button states per Appendix A proposal P1. Writes use viem `writeContractSync` with an explicit `gas`; while a balance is under 10 MON value-sending transactions are serialised at least 4 blocks apart.
- **P0** Lobby and launch island: lobby counter `N / maxCoins` and timer from `RoundView`, launch form (name 1-28, ticker `[A-Z0-9]{2,7}`, monster, skin, seed in MON within `minSeed` and `maxSeed`, shows the launch fee, per-address cap of 2, `Lobby only`), step states (Confirm in wallet, Launching, Done), disabled states with reasons, `House` label from `shared/house-coins.json`; the monster appears only from `CoinLaunched` (no optimistic spawn) with the existing pop animation.
- **P0** Trade drawer island: buy (and sell as P1) with `quoteBuy`, mandatory `minTokensOut` from a 5 percent default slippage, `deadline` now plus 120 s, disabled with a visible `Locked` reason while the epoch is locked, token balance; creator seed tokens are not sellable and are labelled.
- **P0** Lockdown island: banner `LOCKDOWN` with countdown to the expected resolve, a seed-wait state, a `Resolving` state, `Arena stabilised` toast on `EpochCancelled`, and public power ratings per coin during the lock (pair odds appear with `ClashResolved.winProbBps`; pairing is unknown before the resolve).
- **P0** Claims island: `Claim consolation` for holders of an eliminated coin (`pendingConsolation`), `Claim seed` for the creator when the coin has ended, and `Redeem` for holders of the Chosen One (`pendingRedeem`); buttons enable at Finalized; on success a toast and a feed echo.
- **P0** Rules card, testnet banner, toasts (Appendix A proposals P2, P8, P9), stage rail and banner (P4: stage mapping from `RoundView.phase`), `Total Pool`, round and epoch indicator, `Lv N` is P1.
- **P0** Chosen One screen (P6): crown finale (the winner walks to the dais, existing crown and victory burst, no auto-zoom), the published redeem rate read from `RoundView.redeemPool / redeemSupply` and the `Redeem` panel.
- **P0** `data-testid` attributes for QA: `coin-counter`, `lobby-timer`, `stage-rail`, `status-chip`, `rules-card`, `connect-wallet`, `use-burner`, `launch-open`, `launch-submit`, `leaderboard-row-<TICKER>`, `feed-row`, `buy-input`, `buy-submit`, `lockdown-banner`, `claim-consolation`, `claim-seed`, `redeem-button`, `chosen-one-screen`.

Phase F3 — credibility and polish (P1)

- **P1** Sell control, `Lv N` badges and xp bar in the inspector, `LevelUp` aura, odds bar when pairs are known, pool gauge on the label (Appendix A P3), merge flow floaters in sky and emerald variants (P5), 3D pool vessels on the citadel moat ring (the camera cannot go below the island), `consolationMode` visuals if the round uses `SpreadSurvivors`.
- **P1** `prefers-reduced-motion` guards on every animation (CSS keyframes, `animate-ping`, `animate-pulse`, banners; particle bursts become a single burst), keyboard operability, contrast check of the 9 px slate-400 text, layout fixes at 1920x1080 and 1366x768 (left stack versus inspector, right stack versus the minimap cluster), self-hosted fonts, a minimal `dispose()` for Vite hot reload.
- **P1** Recorded replay: `?replay=<path>` plays a recorded envelope file through the same `ArenaStore`.
- **P1** Unit tests: `scriptDuel` (determinism, the chain's winner always survives, never zero before the final strike), the director (gating, dedupe, fast-forward, concurrency cap), wallet helpers (serialisation), formatters.

Phase F4 — only if time remains (P2)

- **P2** Frame-rate work if 30 coins is under target: freeze static matrices after the environment build, merge static environment meshes per material, cap pixel ratio at 1.5, share materials per archetype and skin. Deterministic roaming across clients, mobile layout, Privy embedded wallet.

## Dependencies

- Needs from the backend role: `@animal/shared` (types, `ChainFeed`, `ArenaStore`, fixtures, house list, ABI) before F1; the keeper's `POST /drip` and a local rehearsal path for the live run.
- Needs from the contracts role: `contracts/abi/*.json` (through `@animal/shared`), `deployments/10143.json` for the live run, `contracts/GAS.md` for gas limits.
- Needs from role 04: `docs/pitch/copy.md`.
- Gives to role 04: the `data-testid` map and the running app for the QA walk.
- User steps: setting `VITE_*` variables; hosting.

## Constraints

- English everywhere: identifiers, strings, documentation. No Indonesian string may remain.
- **No comments in code.** Includes the moved prototype code (strip mechanically). The only permitted comment is `// TEMPORARY — <what it is>; delete with <what to remove>` on scaffolding explicitly framed as temporary.
- TypeScript strict for `.ts` and `.tsx`: no `any`, no `@ts-ignore`, no `@ts-nocheck`, no non-null assertion used to silence a real nullable. The extracted scene `.js` files are excluded from type-checking by configuration, not by comments.
- Every animation respects `prefers-reduced-motion`.
- Do not upgrade three. Do not rewrite or restyle the scene or the prototype's panels beyond the listed edits. No auto-zoom on battle (the prototype forbids it).
- Never edit `monster_arena_3d_prototype (1).html` or `docs/download (1).png`.
- Never read, write or echo `.env*` files; the burner key is generated in the browser, never logged, never sent anywhere except signing. No secret in the bundle. No deploy and no private key handled by any agent; live-network work is a user step.
- Names and tickers are rendered with `textContent` or React text only.
- Verify visually in a real browser using the user's headless tooling only: open with `browser-cdp open`, capture with `screen-nav snap brave`. Never use hypruse, grimblast, hyprctl, screenshot.sh or swappy for screenshots or navigation.
- Never put the user's credentials from any global instruction file into any file or prompt.
- Never run `git commit`, `git push`, or destructive git commands; never `git add -A` or `git add .`.
- Write only inside Owned paths. If `contracts.md` must change, report it; do not edit it.

## Deliverables

- **P0** `web/` Vite app: extracted scene, bridge, director, wallet, lobby and launch, trade drawer, lockdown, claims, rules card, stage rail, toasts, Chosen One screen, status chip.
- **P0** `web/src/arena/bridge.ts`, `bridge.d.ts`, `web/src/chain/director.ts`, `web/src/copy/strings.ts`.
- **P0** `web/DECISIONS.md` (every undecidable choice, one line each, plus the screenshot paths).
- **P0** `?sim=1` and `?replay=fixture` modes.
- **P1** Sell, level and xp UI, odds and pool gauges, vessels, reduced motion, layout fixes, self-hosted fonts, recorded replay, tests.
- **P2** Performance work, deterministic roaming, mobile, Privy.

## Acceptance criteria

1. `pnpm --filter web typecheck`, `pnpm --filter web lint`, `pnpm --filter web build` and `pnpm --filter web test` exit 0 (add the scripts to `web/package.json` if missing).
2. `grep -rnE "\bany\b|@ts-ignore|@ts-nocheck|@ts-expect-error" web/src --include=*.ts --include=*.tsx` returns nothing; `grep -rnE "^\s*//|/\*|\{/\*" web/src web/index.html` returns nothing (or only the permitted TEMPORARY form).
3. `grep -rniE "menjelajah|beristirahat|kegirangan|aktivitas|lokasi|uji animasi|bertarung|melancarkan|menahan|melompat|kalah duel|terkena|waspada|jelajah" web/src web/index.html` returns nothing; `grep -rniE "simulated|spec v1\.0|visual layer|requires protocol verification|\bbet\b|wager|payout|yield" web/src/copy web/src/chain web/index.html` returns nothing outside `?sim=1` code paths.
4. `grep -n "\"three\"" web/package.json` shows `"0.128.0"` exactly; `grep -rn "cdn.tailwindcss.com\|cdnjs.cloudflare.com\|cdn.jsdelivr.net" web --include=*.html --include=*.ts --include=*.tsx --include=*.js` returns nothing; `grep -rn "Math.random" web/src/chain web/src/arena/bridge.ts` returns nothing, and in `arena3d.js` every remaining `Math.random` in chain mode is cosmetic (textures, particles, roaming wander seeded) and listed in `web/DECISIONS.md`.
5. `scriptDuel` unit tests pass: for a fixed `clashId` the strike script is identical across runs; the chain's winner always survives; the winner's bar never reaches zero before the final strike; the re-salt loop terminates within 32 tries or forces the final strike.
6. Director unit tests pass: a `Proposed` `Trade` does not change leaderboard order, the same event at `Finalized` does; animation events wait for `Voted`; an event older than 15 s is fast-forwarded; a duplicate envelope id is ignored; a clash whose loser is already removed is dropped; at most 8 duels run at once.
7. With `?replay=fixture` (no keeper, no wallet) the app, in a real browser, shows `coin-counter` in the lobby, then `lockdown-banner` at each `EpochLocked`, plays the fixture's clashes with the winners named in the fixture, re-sorts the leaderboard at each merge beat, adds a `feed-row` per clash with the four amounts, shows hunt NPC fights, `claim-consolation` for a loser holder in the fixture wallet, and `chosen-one-screen` with the redeem rate at the end. Screenshots (initial lobby, lockdown, a duel, boost stream, Chosen One) captured with `screen-nav snap brave`, paths listed in your report.
8. In the same run no `Math.random`-driven duel, encounter or respawn occurs; the population changes only through fixture events.
9. With the keeper on a local `anvil --network monad` deploy (mock seed): connecting the burner funds it through `/drip`; `launch` through the island produces exactly one new monster after `CoinLaunched` reaches Finalized and none before; `buy` changes the reserve shown within 3 seconds; buying while locked is refused with the `Locked` reason; a loser-holder wallet sees and uses `Claim consolation`; reload restores the same state with the same spawn positions; dropping the WebSocket (stop and restart anvil's RPC) recovers without duplicate animations.
10. Every `data-testid` listed in Requirements exists in the DOM at the relevant time.
11. No file outside Owned paths was created or changed; the prototype HTML and the PNG are unmodified (`cmp` against a copy taken at start); no `.env*` file was read or written; the build output contains no private key material.
12. Reported measured frame rate at 30 coins on the dev machine (`?debug=1` FPS cell or the `stats` event); a value under 20 FPS is a failure to report with the profile finding.

---

## Appendix A — Design-system inventory (verbatim from `docs/research/01-design-system.md`)

Citation convention in this appendix: `prototype:<line>` refers to `monster_arena_3d_prototype (1).html`. Values marked "(TW default)" are Tailwind default-theme values; "(derived)" are arithmetic, not measured in a browser. Sections F1-F13 and the R1 token suggestion and proposals P1-P10 follow, copied unchanged.

### F1. Dependencies, fonts, document shell

| Item | Exact value | Source |
|---|---|---|
| Doctype / lang / viewport | `<!DOCTYPE html>`, `<html lang="en">`, `width=device-width, initial-scale=1.0` | prototype:1-5 |
| Title | `Monster Arena — Global 3D Arena Prototype (Spec v1.0)` | prototype:6 |
| Tailwind | `<script src="https://cdn.tailwindcss.com"></script>` (Play CDN, no version pin, no inline `tailwind.config`) | prototype:7 |
| Three.js | `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` | prototype:8 |
| OrbitControls | `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js` (global script, `THREE.OrbitControls`) | prototype:9, 732 |
| Fonts | `https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800;900&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap` | prototype:10 |
| Body font | `'Plus Jakarta Sans', sans-serif`, colour `#f8fafc` | prototype:29-30 |
| `.font-display` | `'Cinzel', serif` | prototype:32-34 |
| `.font-mono-num` | `'JetBrains Mono', monospace; font-variant-numeric: tabular-nums` | prototype:35-38 |
| Box model / selection | `* { box-sizing: border-box; user-select: none }`, `<body class="relative select-none">` | prototype:18-21, 162 |
| Page | `html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; background-color: var(--bg-obsidian) }` | prototype:22-31 |
| Not present | favicon, meta description, OG tags, `prefers-color-scheme`, any `@media`, `aria-*`, `role`, `disabled`, `focus-visible` | whole file (grep) |

Notes.
- Weights requested vs used. JetBrains Mono loads 500/600/700, but `font-extrabold` (800) is used on the inspector ticker (prototype:361) and `.damage-floater` sets `font-weight: 800` (prototype:119). The browser renders both at 700. Cinzel loads 700/800/900; the title uses `font-black` (900, prototype:181), the modal title `font-bold` (700, prototype:500). Plus Jakarta Sans 400-800 is fully covered.
- Form controls (`input`, `select`, `button`) rely on Tailwind preflight resetting `font-family: inherit`. Tailwind CDN ships preflight (TW default), so they render in Plus Jakarta Sans. A build that disables preflight would show system fonts.
- Emoji are used as icons throughout and rely on the OS emoji font (no emoji font is specified). See F12 for the inventory.

### F2. Colour tokens

#### F2.1 CSS variables and base colours

| Token | Value | Meaning | Used | Source |
|---|---|---|---|---|
| `--bg-obsidian` | `#080b14` | page background | `body, html` background | prototype:13, 28 |
| `--panel-bg` | `rgba(13, 18, 32, 0.84)` (= `#0d1220` at 84%) | glass fill | `.glass-panel` | prototype:14, 40 |
| `--panel-border` | `rgba(148, 163, 184, 0.18)` (= slate-400 at 18%) | glass hairline | `.glass-panel` | prototype:15, 43 |
| `--gold-accent` | `#f59e0b` (= amber-500) | declared, never referenced (grep shows no `var(--gold-accent)`) | none | prototype:16 |
| Base text | `#f8fafc` (slate-50) | default text | `body` | prototype:30 |

#### F2.2 Neutral ramp as used (hex from Tailwind v3 default palette, TW default)

| Class family | Hex | Where |
|---|---|---|
| `slate-950` | `#020617` | logo glyph (175), inspector overlays (378, 384, 392), minimap bg (489), modal scrim `/75` (496), JSON box `/90` (550) |
| `slate-900` | `#0f172a` | inputs (256 `/90`, 511 solid), rows (3706 `/60`, 3740 `/85`), metadata grid `/75` (412), HP strip bg (407) |
| `slate-800` | `#1e293b` | chips/buttons (219, 269 `/60`, 442), borders (3706, 407, 498), hover fills |
| `slate-700` | `#334155` | borders (219, 256 `/80`, 489 `/80`), dividers `/70` (204) |
| `slate-500` | `#64748b` | placeholder (256), empty state (345), timestamp (3749) |
| `slate-400` | `#94a3b8` | secondary labels (188, 198, 249 `300`), unselected tabs (386) |
| `slate-300` | `#cbd5e1` | panel titles (249), toggle labels (289), unselected stat buttons (219) |
| `slate-200` | `#e2e8f0` | h2 titles (323), body values (415) |

#### F2.3 Semantic accent mapping (as used, with hex per TW default)

| Role | Tailwind colour(s) | Hex | Where |
|---|---|---|---|
| Brand / primary action / winner / selected chip | amber-200/300/400/500 | `#fde68a` / `#fcd34d` / `#fbbf24` / `#f59e0b` | title gradient (181), CTA (236), selected chip (218), rank #1-3 (3708), feed winner (3743), consume floater (135) |
| CTA gradient end | orange-500/600 | `#f97316` / `#ea580c` | logo (174), CTA (236) |
| Logo gradient end | red-600 | `#dc2626` | prototype:174 |
| Selection / info / "Spec" badge | sky-300/400/500 | `#7dd3fc` / `#38bdf8` / `#0ea5e9` | spec badge (184), selected pill (99), selection ring `0x38bdf8` (2589), location value (427), JSON preview (552) |
| Positive value / HP good / LP | emerald-400/500 | `#34d399` / `#10b981` | LP numbers (423, 3716, 3753), FPS (226), HP text (400), live dot (189, 379) |
| HP strip gradient end | teal-400 | `#2dd4bf` | prototype:408 |
| Danger / damage / "Auto-battle OFF" | rose-300/400/500, red-300/500 | `#fda4af` / `#fb7185` / `#f43f5e`, `#fca5a5` / `#ef4444` | hit button (445), OFF label (478), hit dot (3335), HP fill start (112), floater glow (122) |
| Consumption | purple-300 | `#d8b4fe` | consumptions stat (212) |
| Live feed ping | orange-400 | `#fb923c` | prototype:336 |
| Variant labels | fuchsia-300 | `#f0abfc` | Mythic skin button (455) |
| Electric label | yellow-300 | `#fde047` | prototype:278 |

#### F2.4 Monster palettes (`MONSTER_CATALOG`, prototype:578-659)

| id | element | icon (emoji) | primary | secondary | belly | glow | badgeHex | scaleUnits | attack | Lines |
|---|---|---|---|---|---|---|---|---|---|---|
| `fire_dragon` | fire | dragon U+1F409 | `#dc2626` | `#f59e0b` | `#fbbf24` | `#ff6b00` | `#ef4444` | 1.9 | Fire Breath | 579-594 |
| `ice_wolf` | ice | wolf U+1F43A | `#e0f2fe` | `#0284c7` | `#f8fafc` | `#38bdf8` | `#38bdf8` | 1.72 | Ice Slash | 595-610 |
| `earth_golem` | earth | moai U+1F5FF | `#78716c` | `#22c55e` | `#57534e` | `#38bdf8` | `#22c55e` | 2.45 | Ground Slam | 611-626 |
| `electric_fox` | electric | fox U+1F98A | `#facc15` | `#fef08a` | `#ffffff` | `#38bdf8` | `#facc15` | 1.6 | Thunder Dash | 627-642 |
| `dark_spirit` | dark | alien monster U+1F47E | `#3b0764` | `#a855f7` | `#1e1b4b` | `#e879f9` | `#a855f7` | 1.35 | Dark Orb | 643-658 |

Size classes: fire/ice/electric `medium`, golem `large`, spirit `small` (615, 631, 599, 647). Rendered scale = `scaleUnits * 0.85` (prototype:2610). `badgeHex` is the UI colour of a monster (ticker dot 2793, minimap dot 3871, detail badge 3816-3817, catalog dot 3896). Note the UI uses `badgeHex`, not `primaryColor`, so Ice is sky blue and not the near-white primary.

Skin modifiers (prototype:662-668): primary lerps 0.62 toward `tint`, belly 0.35, secondary 0.7 and glow 0.65 toward `accent` (2097-2104).

| skinId | label (code) | tint | accent | emissiveBoost | Inspector button label / colour | Launch select label |
|---|---|---|---|---|---|---|
| `default` | Default | null | null | 0.28 | "Default" / slate-200 (451) | "Default Elemental" (534) |
| `obsidian` | Obsidian | `#1e293b` | `#f97316` | 0.52 | "Dark" / slate-200 (452) | "Obsidian Volcanic" (536) |
| `royal` | Gold | `#fbbf24` | `#fef08a` | 0.45 | "Gold" / amber-300 (453) | "Royal Gold Trim" (535) |
| `crystal` | Azure | `#0ea5e9` | `#7dd3fc` | 0.48 | "Azure" / sky-300 (454) | "Glacial Crystal" (537) |
| `celestial` | Mythic | `#c026d3` | `#f472b6` | 0.52 | "Mythic" / fuchsia-300 (455) | "Celestial Radiant" (538) |

The same skin has up to three different names (code label, button label, select label). Pick one canonical name per skin before building the UI.

#### F2.5 Biomes (four colour sets exist and agree only loosely)

| Biome | `BIOMES.color` (690-695) | Floating tag bg / border (2050-2054) | Minimap sector fill (3844-3847) | Point light (779-797) | Terrain vertex colour (1369-1373) |
|---|---|---|---|---|---|
| Ice (N, -Z) | `#38bdf8` | `rgba(2,132,199,0.85)` / `#7dd3fc` | `rgba(56,189,248,0.28)` | `0x38bdf8`, 2.0, r130, at (0,26,-88) | lerp(`#dcfce7`,`#bae6fd`,0.75) = approx `#c2ebf7` (derived) |
| Dark (E, +X) | `#a855f7` | `rgba(126,34,206,0.85)` / `#d8b4fe` | `rgba(168,85,247,0.28)` | `0xa855f7`, 2.2, r130, at (88,24,0) | `#3b1564` |
| Lava (S, +Z) | `#ef4444` | `rgba(220,38,38,0.85)` / `#fca5a5` | `rgba(239,68,68,0.28)` | `0xff5500`, 2.4, r130, at (0,22,82) | `#5c2314` |
| Forest (W, -X) | `#22c55e` | `rgba(22,163,74,0.85)` / `#86efac` | `rgba(34,197,94,0.28)` | `0x86efac`, 1.1, r120, at (-82,24,0) | `#3f8f3d` |
| Central Citadel | (none; `getBiomeAt` returns the string `Central Ruin`, prototype:699) | `rgba(217,119,6,0.88)` / `#fde68a` | circle `rgba(245,158,11,0.45)`, r = 0.11 * 144 = 15.84 px | crown light `0xfbbf24`, 2.4, r78, at (0,18,0) | `#d99b52`, blended near centre (1400-1403) |

Biome area labels carry percentages: Ice 25%, Dark 20%, Lava 25%, Forest 30% (691-694, 2050-2053). Biome geometry: Ice `{x:0,z:-82}`, Dark `{82,0}`, Lava `{0,82}`, Forest `{-82,0}` (691-694); classification rule at 697-707 (`dist < 26` is the Citadel, otherwise the larger of |x|, |z| decides).

Element to biome pairing is not 1:1: five elements (fire, ice, earth, electric, dark) vs four biomes (Ice, Dark, Lava, Forest). Electric has no home biome and Earth maps loosely to Forest, Fire to Lava (colour-wise only).

#### F2.6 Scene, fog, lights, camera, renderer

| Item | Value | Source |
|---|---|---|
| Scene background | `0x0b1325` (`#0b1325`) | prototype:713 |
| Fog | `FogExp2(0x0d172a, 0.00125)` | prototype:714 |
| Hemisphere light | sky `0xe0f2fe`, ground `0x1e1b4b`, intensity 0.72 | prototype:757 |
| Ambient | `0xdbeafe`, 0.38 | prototype:760 |
| Sun | `0xfff7ed`, 1.35, position (-105,175,95); shadow map 2048 x 2048, ortho frustum +/-155, near 20, far 450, bias -0.0005 | prototype:763-776 |
| Camera | FOV 35, near 1, far 1000, default position (0,178,202), target (0,0,10) | prototype:716-720 |
| Renderer | antialias, `powerPreference: 'high-performance'`, pixel ratio min(dpr, 2), PCFSoftShadowMap, ACESFilmic tone mapping, exposure 1.12 | prototype:722-728 |
| Orbit limits | damping 0.08, polar min pi/6, max pi/2.35, distance 65-320, pan speed 0.85, target clamped to +/-110 on x/z and y = 0 | prototype:733-748 |
| World | radius 135 (`WORLD_RADIUS`), minimap pixel radius `w * 0.46` = 66.24 | prototype:689, 3842 |
| Water | `0x38bdf8`, emissive `0x0284c7`, emissive 0.45, opacity at ring 0.82 | prototype:1272-1283 |
| Lava | `0xff5500`, emissive `0xff6b00`, intensity 1.25 | prototype:1286-1295 |
| Citadel stone / gold / plaza | `0xcbd5e1` / `0xf59e0b` / `0xe2e8f0` | prototype:1243, 1250, 1257 |
| Crown crystal | `0xfef08a`, emissive `0xf59e0b`, 1.1; bob `7.4 + sin(2.5t) * 0.35`, spin 1.1 rad/s | prototype:1487-1497, 3365-3369 |
| Clouds | `0xdbeafe`, emissive `0x334155`, opacity 0.82 | prototype:1340-1346 |
| Inspector scene | background `0x070b16`; hemi `0xe0f2fe`/`0x1e1b4b` 1.15; sun `0xfff7ed` 1.55 at (3,6,4); back light `0x38bdf8` 1.2 r12 at (-2.5,3,-3); camera FOV 34 at (2.4,2.2,3.8) looking at (0,1.05,0); ACES exposure 1.18 | prototype:2660-2680 |
| Inspector pedestal | disc r1.55/1.75, h0.28, `0xcbd5e1`; ring r1.32-1.48 `0xf59e0b` opacity 0.65, recoloured to the monster glow | prototype:2684-2701, 2741 |

#### F2.7 In-world ring and VFX colours

| Element | Value | Source |
|---|---|---|
| Base element ring (under every monster) | r 0.85-1.08, colour = monster `glow`, opacity 0.62 | prototype:2573-2583 |
| Selection ring | r 1.22-1.48, `0x38bdf8` | prototype:2586-2595 |
| Winner absorb aura | wireframe sphere r1.55, `0xfbbf24`, opacity 0 until victory (0.72-0.75) | prototype:2598-2607, 3130 |
| Victory confetti | 34 points, size 2.0, colours `#facc15 #4ade80 #38bdf8 #f472b6 #fef08a`, 0.95 s | prototype:2892-2935 |
| Fire breath | 28 points `0xff7700`, size 2.1, 0.42 s | prototype:2948-2968 |
| Ice slash | ring-arc, colour = glow, 0.38 s | prototype:2970-2978 |
| Ground slam | ring `0xfbbf24`, 0.45 s | prototype:2980-2987 |
| Thunder bolt | line `0xfef08a`, 0.32 s | prototype:2989-3005 |
| Dark orb | sphere = glow, 0.36 s | prototype:3007-3021 |
| Impact burst | 16 points, colour = attacker glow, size 1.45, 0.42 s | prototype:3027-3056 |
| Consumption stream | 42 points, colour = loser glow, size 1.9, 1.05 s, arc height 3.2, smoothstep ease | prototype:3060-3095, 3592-3616 |

Diagram colour observations (docs/download (1).png, looked at directly; no line numbers): auto-buy flow is a royal-blue gradient arrow into a cyan-glow vessel; value redistribution is a mint-green gradient arrow into many small green-lit vessels; pools are cylindrical vessels going from white/grey (empty) to cyan-blue glow (full); NPC monsters are orange pixel-art; the Chosen One has a pale-blue crown over a deep blue consolidated vessel.

### F3. Typography

Families: Cinzel (display), Plus Jakarta Sans (body, default), JetBrains Mono (`.font-mono-num`, tabular numerals) (prototype:29-38).

| Role | Size / line height | Weight | Tracking | Casing | Example | Source |
|---|---|---|---|---|---|---|
| Brand title | `text-base` 16/24 (TW default) | 900 (`font-black`) | `tracking-wider` .05em (TW default) | uppercase text | "MONSTER ARENA" | prototype:181 |
| Modal title | `text-base` 16/24 | 700 | none | normal | "Launch Token & Map Monster" | prototype:500 |
| Stat value | `text-sm` 14/20 | 700, mono | none | - | `60`, `0`, FPS | prototype:199, 207, 212, 226 |
| Panel title | `text-[11px]` | 700 | wider | uppercase | "Arena Leaderboard" | prototype:249, 307, 323, 337 |
| Field label (modal) | `text-[11px]` | 600 | wider | uppercase | "Token Name" | prototype:509, 514, 522 |
| Body / controls | `text-xs` 12/16 | 400-700 | none | normal | inputs, buttons, toggles | prototype:232, 256, 506 |
| Body small | `text-[11px]` | 400-600 | none | normal | rows, chips, metadata | prototype:188, 265, 412 |
| Caption / micro label | `text-[10px]` | 400-600 | wider | uppercase | "Active Monsters", "Element Identity" | prototype:198, 264, 551 |
| Micro | `text-[9px]` | 400-700 | wider (labels only) | uppercase or normal | "Global Camera", sub-rows, tiny buttons | prototype:339, 363, 385, 394, 465 |
| Ticker (label pill) | 10px CSS | 700 | 0.04em | as typed (A-Z0-9) | "MOOND" | prototype:85-87 |
| Damage floater | 13px, mono | 800 (renders 700) | none | - | "-27" | prototype:118-121 |
| Consume floater | 11px, sans | 800 | 0.05em | as typed | "VICTORY & ABSORB!" | prototype:129-132 |
| Biome tag | 10px | 800 | 0.08em | uppercase | "FOREST ZONE (30%)" | prototype:152-155 |

Frequency in the markup block (lines 162-565): `text-[10px]` on 27 lines, `text-[11px]` 22, `text-[9px]` 15, `text-xs` 13, `text-sm` 5, `text-base` 2, `text-lg` 1 (the 18px emoji icon badge, prototype:356). Weights: `font-bold` 21 lines, `font-semibold` 22, `font-medium` 8, `font-black` 1, `font-extrabold` 1. `uppercase` is on 23 lines.

Line height: arbitrary sizes (`text-[9px]`, `text-[10px]`, `text-[11px]`) set no line height, so text inherits the document line height; `leading-tight` (1.25) appears twice (341, 395), `leading-none` once in JS (3711), `leading-relaxed` (1.625) once on the JSON `pre` (552). Truncation: `truncate` on the inspector name (365, with `max-w-[200px]`), activity text (395, parent `max-w-[75%]` at 393) and leaderboard ticker block (3710).

### F4. Spacing, radii, borders, shadows

Spacing rhythm (Tailwind 4 px base): screen gutter `3` = 12 px (171, 246, 317, 353, 462); stack gap between panels `gap-2.5` = 10 px (246, 317, 462) and 12 px in the header (`gap-3`, 171); panel padding by tier: `p-2` (8) camera/minimap (464, 484), `p-3` (12) filter/leaderboard/feed (247, 319, 333), `p-3.5` (14) inspector (353), `p-5` (20) modal (497); internal gaps `gap-1` (4), `gap-1.5` (6), `gap-2` (8), `gap-2.5` (10), `gap-3.5` (14) (506); header cell padding `px-3.5 py-2` (14 / 8) (173, 196).

Radii: `rounded` 4 px (tiny buttons/badges: 184, 218, 363), `rounded-md` 6 px (chips: 266), `rounded-lg` 8 px (inputs, rows, small buttons, inspector tabs: 256, 3706, 442), `rounded-xl` 12 px (panels, header buttons, inspector viewport, icon badge: 173, 232, 374), `rounded-2xl` 16 px (inspector panel, modal: 353, 497), `rounded-full` (dots, HP strip: 189, 407), CSS `999px` (ticker pill, floater, biome tag: 82, 134, 151), HP bar label `3px` (106). Counts in markup: `rounded-lg` 21, `rounded-xl` 14, `rounded` 20, `rounded-md` 6, `rounded-2xl` 2, `rounded-full` 4.

Borders: always 1 px. Panels: `--panel-border`. Inputs: `border-slate-700` (modal) or `/80` (search). Selected state swaps border colour to amber at 40-50% (218, 3706). Dividers: `border-t border-slate-800/80` (288, 429, 448) and vertical `h-6 w-px bg-slate-700/70` (204).

Shadows: glass `0 12px 32px -8px rgba(0,0,0,0.65), inset 0 1px 0 0 rgba(255,255,255,0.08)` (44); logo `shadow-lg shadow-orange-500/25` (174); CTA `shadow-lg shadow-orange-600/30` (236); modal submit `shadow-lg shadow-orange-500/25` (559); inspector and modal `shadow-2xl` (353, 497); inset on inspector viewport/badge/minimap `shadow-inner` (356, 374, 489); pill `0 2px 6px rgba(0,0,0,0.6)` (90); HP bar `0 2px 4px rgba(0,0,0,0.5)` (108); selected pill glow `0 0 10px rgba(56,189,248,0.5)` (99); consume floater glow `0 0 16px rgba(245,158,11,0.8)` (138); damage text-shadow `0 2px 4px rgba(0,0,0,0.95), 0 0 8px rgba(239,68,68,0.85)` (122).

### F5. Glass panel recipe

CSS (prototype:39-45):

```css
.glass-panel {
  background: rgba(13, 18, 32, 0.84);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 12px 32px -8px rgba(0, 0, 0, 0.65), inset 0 1px 0 0 rgba(255, 255, 255, 0.08);
}
```

Tailwind arbitrary-value equivalent (no config needed):
`bg-[rgba(13,18,32,0.84)] backdrop-blur-[14px] border border-[rgba(148,163,184,0.18)] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.65),inset_0_1px_0_0_rgba(255,255,255,0.08)]`

Usage (12 occurrences, prototype grep): header brand (173), header stats (196), duel button (232), arena filters (247), catalog card (305), leaderboard (319), feed (333), inspector (353), camera bar (464), minimap (484), modal card (497). Radius is `rounded-xl` everywhere except inspector and modal (`rounded-2xl`).

Overrides and ordering hazard. Inspector and modal add `border border-amber-400/30 shadow-2xl` on top of `.glass-panel` (353, 497). Both the class and the utilities are single-class selectors, so the winner depends on stylesheet order. The Tailwind Play CDN injects its stylesheet at runtime, so I cannot tell from the file alone whether the amber border and `shadow-2xl` actually win in the prototype (unverified, open question Q6). In a built project, define `.glass-panel` inside `@layer components` so utilities override it deterministically. `hover:bg-slate-800/90` on the duel button (232) wins because a `:hover` variant is more specific.

Backdrop elements: modal scrim `bg-slate-950/75 backdrop-blur-md` (blur 12 px, TW default) (496); inspector live badge `backdrop-blur-md` (378); biome tag `backdrop-filter: blur(4px)` (158).

### F6. Layout zones

All zones are `position: fixed` over a `position: absolute inset-0` canvas. Container wrappers use `pointer-events-none`, the panels inside use `pointer-events-auto`, so empty space passes drags to OrbitControls (171, 231, 246, 317, 462).

| Zone | Selector / lines | Position | Size | z | Responsive | Pointer |
|---|---|---|---|---|---|---|
| Canvas | `#canvas-container` (165) | `absolute inset-0` | full viewport | `z-0` | none; `cursor-grab active:cursor-grabbing` | auto |
| World labels | `#world-labels` (59-65, 168) | `absolute; inset: 0; overflow: hidden` | full viewport | `5` | none | `none` |
| Top bar | `<header>` (171) | `fixed top-3 left-3 right-3` | auto height (about 58 px, derived) | `z-20` | `flex items-center justify-between gap-3` | `none` (children `auto`) |
| Left filters | `<aside>` (246) | `fixed top-20 left-3` | `w-60` (240) | `z-20` | catalog card `hidden md:flex` (>= 768) | `none` (children `auto`) |
| Right stack | `<aside>` (317) | `fixed top-20 right-3` | `w-72` (288), `max-h-[calc(100vh-100px)]` | `z-20` | none | `none` (children `auto`) |
| Inspector | `#detail-panel` (353) | `fixed bottom-3 left-3` | `w-[350px] sm:w-[380px]` | `z-20` | starts `hidden`; toggled with the `hidden` class (3770, 3775) | auto |
| Camera + minimap | wrapper (462) | `fixed bottom-3 right-3` | `flex items-end gap-2.5`; minimap `w-36 h-36` (144 px) | `z-20` | none | `none` (children `auto`) |
| Modal | `#launch-modal` (496) | `fixed inset-0` | card `max-w-md w-full` (<= 448), scrim `p-4` | `z-50` | starts `hidden`; swaps `hidden` / `flex` (4102-4103, 4106-4107) | auto |
| Inspector inner overlays | (378, 384, 392) | `absolute` | see F7 | `z-10` | none | badge/tabs auto, bottom overlay `none` |

Z-index ladder: 0 canvas, 5 world labels, 10 inspector overlays (inside the panel), 20 all HUD panels, 50 modal. Same-z HUD panels stack by DOM order (the bottom-right cluster is last, so it paints over the right stack).

Header slots (left to right): brand panel; middle stats panel `hidden xl:flex` (>= 1280); right actions `flex items-center gap-2`. Below `xl` the middle slot disappears and `justify-between` pushes brand and actions to the edges (196, 231).

Responsive summary: Tailwind defaults sm 640, md 768, xl 1280 (TW default). Only five responsive utilities exist: `hidden xl:flex` (196), `hidden sm:inline` (234), `hidden md:flex` (305), `sm:w-[380px]` (353). There is no phone layout: left (240) + right (288) + 36 px gutters = 564 px of fixed chrome, and the inspector is 350 px wide, so any viewport under about 900 px is unusable (derived). Treat the prototype as desktop-first, 1280 px or wider.

Vertical budget (derived from TW default line heights, not measured in a browser). Header bottom edge about 70.5 px, so the 80 px offset for both asides leaves about 9.5 px. The left stack (filters about 250 px + catalog about 250 px + gap) ends near 590 px from the top. The inspector is roughly 540-580 px tall, so it starts near `100vh - 560`. At 1080 px tall the catalog card and inspector probably overlap by tens of pixels. The right aside's `max-h-[calc(100vh-100px)]` ends 20 px above the viewport bottom and does not reserve the roughly 190 px tall bottom-right cluster, so once the feed holds many entries it slides under the minimap. Both need a browser check (Q6).

### F7. Component vocabulary and class strings

Everything below is copied from the prototype so a React port can reuse the strings.

#### F7.1 Header

| Component | Class string | Lines |
|---|---|---|
| Brand panel | `glass-panel rounded-xl px-3.5 py-2 flex items-center gap-3 pointer-events-auto` | 173 |
| Logo tile | `w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 via-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-500/25 border border-amber-200/40` | 174 |
| Logo glyph (crown) | `<svg class="w-5 h-5 text-slate-950" fill="currentColor" viewBox="0 0 24 24">` path `M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z` | 175-177 |
| Title | `font-display text-base font-black tracking-wider bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 bg-clip-text text-transparent` | 181 |
| Spec badge | `text-[10px] font-mono-num uppercase px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-400/30 font-semibold` | 184 |
| Sub-line | `text-[11px] text-slate-400 flex items-center gap-1.5` | 188 |
| Live dot | `w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse` | 189 |
| Stats panel | `glass-panel rounded-xl px-3.5 py-2 hidden xl:flex items-center gap-5 pointer-events-auto text-xs` | 196 |
| Stat label | `text-[10px] uppercase tracking-wider text-slate-400` | 198 |
| Stat value | `font-mono-num font-bold text-sm text-white flex items-center gap-1.5`; colour variants: duels `text-amber-400` (207), consumptions `text-purple-300` (212), FPS `text-emerald-400 text-sm` (226) | 199-226 |
| Stat sub-value | `text-[10px] text-slate-400 font-normal` | 201 |
| Vertical divider | `h-6 w-px bg-slate-700/70` | 204 |
| Scale button, inactive | `pop-btn px-2 py-1 rounded text-[11px] font-mono-num font-semibold bg-slate-800/70 text-slate-300 hover:bg-slate-700/70 border border-slate-700 transition` | 219-221, 4002 |
| Scale button, active | `pop-btn px-2 py-1 rounded text-[11px] font-mono-num font-semibold bg-amber-500/25 text-amber-300 border border-amber-400/40 transition` | 218, 4004 |
| Secondary glass button (duel) | `glass-panel hover:bg-slate-800/90 text-xs font-semibold px-3 py-2.5 rounded-xl flex items-center gap-1.5 text-amber-300 border border-amber-500/30 transition shadow-lg`; label `hidden sm:inline`; icon is crossed swords U+2694 | 232-235 |
| Primary CTA | `bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-1.5 shadow-lg shadow-orange-600/30 transition`; icon `w-4 h-4`, stroke 2.5 plus | 236-241 |

#### F7.2 Left controls

| Component | Class string | Lines |
|---|---|---|
| Stack | `fixed top-20 left-3 z-20 w-60 flex flex-col gap-2.5 pointer-events-none` | 246 |
| Filter panel | `glass-panel rounded-xl p-3 pointer-events-auto flex flex-col gap-2.5` | 247 |
| Panel title | `text-[11px] font-bold uppercase tracking-wider text-slate-300`; right value `text-[10px] font-mono-num text-slate-400` | 249-250 |
| Search wrapper / input | `relative`; `w-full bg-slate-900/90 border border-slate-700/80 focus:border-amber-400/70 rounded-lg pl-7 pr-2.5 py-1.5 text-xs text-white placeholder-slate-500 outline-none transition`; placeholder "Search ticker (e.g. MOOND)..."; `maxlength="16"` | 254-256 |
| Search icon | `w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2`, stroke 2, viewBox 0 0 24 24 | 257 |
| Section label | `text-[10px] uppercase tracking-wider text-slate-400 mb-1.5` | 264 |
| Chip grid | `grid grid-cols-3 gap-1 text-[11px]` | 265 |
| Chip, selected ("All") | `el-btn active px-2 py-1 rounded-md font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/40 flex items-center justify-center gap-1` | 266 |
| Chip, default | `el-btn px-2 py-1 rounded-md font-medium bg-slate-800/60 hover:bg-slate-800 text-<tone>-300 border border-slate-700/60 flex items-center justify-center gap-1`; tone: fire `red`, ice `sky`, earth `emerald`, electric `yellow`, dark `purple` | 269-282 |
| Toggle group | `pt-1 border-t border-slate-800/80 flex flex-col gap-1.5 text-xs` | 288 |
| Toggle row | `flex items-center justify-between cursor-pointer text-slate-300 hover:text-white`; text `text-[11px]`; checkbox `accent-amber-400 rounded cursor-pointer` | 289-291 |
| Catalog card | `glass-panel rounded-xl p-3 pointer-events-auto hidden md:flex flex-col gap-2` | 305 |
| Catalog list | `flex flex-col gap-1 text-[11px]` | 310 |
| Catalog item | `catalog-btn flex items-center justify-between px-2 py-1.5 rounded-lg bg-slate-900/70 hover:bg-slate-800 border border-slate-800 text-left transition`; name `font-semibold text-slate-200 leading-none`; sub `text-[9px] text-slate-400` ("{attack} • {size}"); colour dot `w-2 h-2 rounded-full` with inline `badgeHex`; selected adds `border-amber-400` | 3888-3898, 3905 |

Chip selection is applied by removing then adding `bg-amber-500/20 text-amber-300 border-amber-400/40` (4013-4017) on top of classes that still include the slate background and tone text colour. Which colour wins depends on Tailwind's generated order; a React port should use an explicit `selected` prop that swaps whole class sets instead.

#### F7.3 Right stack: leaderboard and feed

| Component | Class string | Lines |
|---|---|---|
| Stack | `fixed top-20 right-3 z-20 w-72 flex flex-col gap-2.5 max-h-[calc(100vh-100px)] pointer-events-none` | 317 |
| Leaderboard panel | `glass-panel rounded-xl p-3 pointer-events-auto flex flex-col gap-2` | 319 |
| Title | crown emoji U+1F451 in `text-amber-400 text-xs`, `h2` `text-[11px] font-bold uppercase tracking-wider text-slate-200`; caption `text-[10px] text-slate-400 font-mono-num` | 321-325 |
| List | `flex flex-col gap-1 max-h-48 overflow-y-auto pr-0.5` (192 px, scrolls; top 8 rows rendered) | 327, 3702 |
| Row, default | `lb-row flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800` | 3706 |
| Row, selected | replaces the last three tokens with `bg-amber-500/25 border border-amber-400/50` | 3706 |
| Row rank | `font-mono-num text-[10px] w-4 text-center font-bold` + `text-amber-400` (rank <= 3) or `text-slate-400`; text `#{rank}` | 3708 |
| Row icon | `text-sm` (emoji of the monster) | 3709 |
| Row ticker / sub | ticker `font-mono-num font-bold text-xs text-white leading-none`; sub `text-[9px] text-slate-400` = "{Monster name} • W:{wins}" | 3711-3712 |
| Row value | wrapper `text-right font-mono-num`, value `text-xs font-bold text-emerald-400`, format `$` + (lp / 1000).toFixed(1) + `K` | 3715-3716 |
| Feed panel | `glass-panel rounded-xl p-3 pointer-events-auto flex flex-col gap-2 flex-1 min-h-[190px] overflow-hidden` | 333 |
| Feed header | ping dot `w-2 h-2 rounded-full bg-orange-400 animate-ping`; title as leaderboard; badge `text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700` | 335-339 |
| Feed blurb | `text-[10px] text-slate-400 leading-tight` | 341 |
| Feed list | `flex flex-col gap-1.5 overflow-y-auto pr-0.5 flex-1 text-xs` | 344 |
| Feed empty state | `text-[11px] text-slate-500 italic py-4 text-center` (the empty-state check uses the `.italic` class, prototype:3733) | 345, 3733 |
| Feed row | `bg-slate-900/85 border border-slate-800 rounded-lg p-2 flex flex-col gap-1 text-[11px] animate-fade-in` | 3740 |
| Feed row line 1 | `flex items-center justify-between`; left `flex items-center gap-1 font-mono-num font-bold text-amber-300` = winner icon, winner ticker, chip `text-[9px] px-1 py-0.2 bg-amber-500/20 text-amber-300 rounded` ("CONSUMED"), loser `text-slate-300` (icon + ticker); right `text-[9px] font-mono-num text-slate-500` "Just now" | 3742-3749 |
| Feed row line 2 | `text-[10px] text-slate-400 flex items-center justify-between`; left sparkles U+2728 + "Particle absorption complete"; right `font-mono-num text-emerald-400` "Sim LP: $" + loser lp | 3751-3754 |
| Feed behaviour | newest first (`prepend`), capped at 10 rows | 3756-3759 |

#### F7.4 Inspector (bottom left)

| Component | Class string | Lines |
|---|---|---|
| Panel | `fixed bottom-3 left-3 z-20 w-[350px] sm:w-[380px] glass-panel rounded-2xl p-3.5 pointer-events-auto hidden transition-all border border-amber-400/30 shadow-2xl` | 353 |
| Header row | `flex items-start justify-between gap-2 mb-2`; left `flex items-center gap-2.5` | 354-355 |
| Icon badge | `w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold border border-white/20 shadow-inner`, inline `background: {badgeHex}25` (8-digit hex, alpha 0x25 = about 14.5%) and `border-color: {badgeHex}` | 356, 3816-3817 |
| Ticker | `font-mono-num font-extrabold text-sm text-white` | 361 |
| Rank badge | `text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30` | 362 |
| Element pill | `text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-400/30` (static red; see F13) | 363 |
| Name | `text-xs text-slate-400 truncate max-w-[200px]` | 365 |
| Close | `text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition`, glyph U+2715 | 368-370 |
| 3D viewport | `relative w-full h-44 rounded-xl bg-gradient-to-b from-slate-900/95 via-slate-950 to-slate-900/95 border border-slate-700/80 mb-2.5 overflow-hidden shadow-inner` (176 px tall; renderer initial 340 x 176, resized to container on each rebuild) | 374, 2666-2667, 2745-2747 |
| Canvas host | `absolute inset-0 cursor-grab active:cursor-grabbing`, title "Drag to rotate 3D monster"; drag changes yaw by `dx * 0.018` | 375, 2720 |
| Live badge | `absolute top-2 left-2 z-10 px-2.5 py-1 rounded-lg bg-slate-950/85 border border-slate-700/90 backdrop-blur-md flex items-center gap-1.5 shadow`; dot `w-2 h-2 rounded-full animate-ping` + colour class from the state; text `text-[10px] font-mono-num font-bold text-amber-300` | 378-381, 3798 |
| View tabs wrapper | `absolute top-2 right-2 z-10 flex items-center gap-1 bg-slate-950/80 p-0.5 rounded-lg border border-slate-800` | 384 |
| View tab, selected | `inspector-view-btn px-1.5 py-0.5 rounded text-[9px] font-mono-num font-bold bg-amber-500/25 text-amber-300 border border-amber-400/40`; yaw: 3/4 = 0.55, Front 0, Side pi/2, Back pi | 385, 3961-3966 |
| View tab, default | `inspector-view-btn px-1.5 py-0.5 rounded text-[9px] font-mono-num text-slate-400 hover:text-white` | 386-388, 3959 |
| Bottom overlay | `absolute bottom-0 inset-x-0 z-10 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent px-2.5 pt-3 pb-1.5 flex items-end justify-between pointer-events-none`; left `max-w-[75%]` label `text-[9px] uppercase tracking-wider text-slate-400 font-semibold` + text `text-[11px] font-semibold text-white leading-tight truncate`; right `text-right font-mono-num` HP `text-[10px] font-bold text-emerald-400`, second line `text-[9px] text-slate-400` | 392-403 |
| HP strip | track `w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 mb-2.5`; fill `h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-150` | 407-409 |
| Metadata grid | `grid grid-cols-2 gap-1.5 text-[11px] bg-slate-900/75 p-2.5 rounded-lg border border-slate-800/90 mb-2.5`; key `text-slate-400 block text-[10px]`; values: model/size `font-mono-num text-slate-200 font-semibold`, attack `font-semibold text-amber-300`, LP `font-mono-num text-emerald-400 font-semibold`, location `font-mono-num text-sky-300 font-semibold`; footer `col-span-2 pt-1 border-t border-slate-800/80 flex items-center justify-between` with address `font-mono-num text-[10px] text-slate-300` | 412-432 |
| Animation header | `flex items-center justify-between text-[10px] uppercase tracking-wider text-slate-400 mb-1`; wins `font-mono-num text-amber-300 font-bold` | 437-440 |
| Animation grid | `grid grid-cols-5 gap-1 text-[10px] mb-1.5` | 441 |
| Animation button | `anim-preview-btn px-1.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium transition`; variants: attack `text-amber-300 font-semibold`, hit `text-rose-300 font-medium`, victory `bg-amber-500/20 hover:bg-amber-500/35 text-amber-300 border border-amber-400/50 font-bold transition shadow-sm` | 442-446 |
| Skin row | `flex items-center justify-between gap-1 pt-1.5 border-t border-slate-800/80`; button `skin-switch-btn px-1.5 py-0.5 rounded text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700` (tone override per skin, F2.4) | 448-456 |

Activity states (generated by `getMonsterActivityDescription`, prototype:3304-3357) and their live-dot classes: `idle` sky-400, `walk` emerald-400, `combat` rose-500, `attack` amber-400, `hit` rose-400, `victory` yellow-300, `consuming` purple-400, default emerald-400. Badge text format: "IDLE • ...", "ROAMING • ...", "DUEL vs {TICKER}", "{ATTACK NAME}", "HIT", "VICTORY", "DISSOLVING".

#### F7.5 Bottom right: camera and minimap

| Component | Class string | Lines |
|---|---|---|
| Cluster | `fixed bottom-3 right-3 z-20 flex items-end gap-2.5 pointer-events-none` | 462 |
| Camera panel | `glass-panel rounded-xl p-2 pointer-events-auto flex flex-col gap-1.5` | 464 |
| Camera label | `text-[9px] uppercase tracking-wider text-slate-400 px-1 font-semibold` | 465 |
| Fit button | `px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-400/40 text-xs font-semibold flex items-center gap-1.5 transition`; icon `w-3.5 h-3.5` stroke 2 | 468-473 |
| Zoom buttons | `p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold px-2.5`; glyphs `+` and U+2212 | 474-475 |
| Footer line | `text-[10px] text-slate-400 px-1 flex items-center justify-between gap-2`; "OFF" is `<strong class="text-rose-400">`; "Drag to pan" `text-slate-500`; lock emoji U+1F512 | 477-480 |
| Minimap panel | `glass-panel rounded-xl p-2 pointer-events-auto flex flex-col items-center gap-1` | 484 |
| Minimap title row | `w-full flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-400 px-0.5`; right value `font-mono-num` "4 Biomes" | 485-488 |
| Minimap frame | `relative w-36 h-36 rounded-lg overflow-hidden border border-slate-700/80 bg-slate-950 shadow-inner cursor-crosshair`; canvas `width="144" height="144" class="w-full h-full block"` | 489-490 |

Minimap drawing (prototype:3834-3881): four sector fills at 0.28 alpha (F2.5), citadel disc r = 15.84 px fill `rgba(245,158,11,0.45)`, one dot per monster at `cx + (x / 135) * 66.24`, dot radius 1.8 (3.5 selected, 2.6 in combat), fill `badgeHex` (white `#ffffff` when selected), camera target box 20 x 16 px stroked `#fbbf24` at 1.2 px. Click maps the pixel to a world position clamped to +/-100 (4069-4075). Redrawn every frame (4170).

#### F7.6 Launch modal

| Component | Class string | Lines |
|---|---|---|
| Scrim | `fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md hidden items-center justify-center p-4` (shown by swapping `hidden` for `flex`) | 496, 4102-4103 |
| Card | `glass-panel rounded-2xl max-w-md w-full p-5 border border-amber-400/30 shadow-2xl` | 497 |
| Header | `flex items-center justify-between pb-3 border-b border-slate-800`; title `font-display text-base font-bold text-amber-300`; sub `text-xs text-slate-400`; close `text-slate-400 hover:text-white p-1` | 498-503 |
| Form | `mt-4 flex flex-col gap-3.5 text-xs`; rows `grid grid-cols-3 gap-3` (name `col-span-2`, ticker) and `grid grid-cols-2 gap-3` (model, skin) | 506-520 |
| Label | `block text-[11px] font-semibold uppercase tracking-wider text-slate-300 mb-1` | 509 |
| Text input | `w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-amber-400 outline-none`; name `maxlength 28`; default "Solar Flare Dragon" | 510-511 |
| Ticker input | same + `font-mono-num font-bold uppercase text-amber-300`; `maxlength 7`; default "SOLAR" | 515-516 |
| Select | `w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-white outline-none focus:border-amber-400`; options "Fire Dragon (Medium • Winged)" etc. | 523-539 |
| Number input | `w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 font-mono-num text-emerald-400 outline-none focus:border-amber-400`; `min 1000 max 250000 step 500 value 42000` | 545-546 |
| JSON preview box | `bg-slate-950/90 rounded-lg p-2.5 border border-slate-800`; label `text-[10px] uppercase tracking-wider text-slate-400 mb-1`; `pre` `font-mono-num text-[10px] text-sky-300 overflow-x-auto leading-relaxed`; payload keys: `tokenId`, `name`, `ticker`, `monsterId`, `element`, `skinId` | 550-553, 4085-4093 |
| Footer | `flex items-center justify-end gap-2 pt-2` | 555 |
| Cancel | `px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold` | 556 |
| Submit | `px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold shadow-lg shadow-orange-500/25` | 559 |

The modal closes only through the X, Cancel and submit buttons (4105-4110, 4112-4128). There is no Escape handler and no scrim click handler (grep). Ticker sanitising: strip everything but A-Z/a-z/0-9, uppercase, max 7 chars (prototype:2771-2773).

#### F7.7 In-world overlay components (custom CSS)

| Component | CSS | Lines |
|---|---|---|
| `.monster-label` | `position:absolute; transform: translate(-50%,-100%); pointer-events:none; display:flex; flex-direction:column; align-items:center; gap:2px; transition: opacity .15s ease; will-change: transform, opacity` (the CSS transform is overridden each frame by an inline `translate3d(sx, sy, 0) translate(-50%, -100%)`) | 66-76, 3665 |
| `.monster-ticker-pill` | `display:inline-flex; align-items:center; gap:4px; padding:1.5px 6px; border-radius:999px; background: rgba(9,13,24,.85); border:1px solid rgba(255,255,255,.18); font-size:10px; font-weight:700; letter-spacing:.04em; color:#f8fafc; white-space:nowrap; box-shadow:0 2px 6px rgba(0,0,0,.6)` | 77-91 |
| `.is-top-rank` (rank <= 3) | `border-color: rgba(251,191,36,.75); background: linear-gradient(135deg, rgba(40,28,8,.92), rgba(15,23,42,.92)); color:#fde68a` plus the crown emoji (`rank-crown`, amber-400) un-hidden | 92-96, 2792, 3695-3697 |
| `.is-selected` | `border-color:#38bdf8; box-shadow: 0 0 10px rgba(56,189,248,.5)` (declared after `.is-top-rank`, so wins on border; replaces the pill's shadow) | 97-100 |
| Pill content | crown (hidden by default), 6 px dot `w-1.5 h-1.5 rounded-full` with inline `badgeHex`, ticker text | 2791-2795 |
| `.combat-hp-bar` | `width:44px; height:5px; background: rgba(15,23,42,.92); border:1px solid rgba(255,255,255,.25); border-radius:3px; overflow:hidden; box-shadow:0 2px 4px rgba(0,0,0,.5)`; carries Tailwind `hidden` until a duel starts | 101-109, 2790, 3105-3106 |
| `.combat-hp-fill` | `height:100%; background: linear-gradient(90deg, #ef4444, #22c55e); transition: width .12s ease-out` (the gradient is painted on the fill, so it compresses as HP drops) | 110-114 |
| `.damage-floater` | `position:absolute; transform: translate(-50%,-50%); font-family:'JetBrains Mono'; font-weight:800; font-size:13px; color:#fef08a; text-shadow: 0 2px 4px rgba(0,0,0,.95), 0 0 8px rgba(239,68,68,.85); pointer-events:none; animation: floatUpFade .85s cubic-bezier(.16,1,.3,1) forwards` | 115-125 |
| `.consume-floater` | `position:absolute; transform: translate(-50%,-50%); font: 800 11px 'Plus Jakarta Sans'; letter-spacing:.05em; padding:2px 7px; border-radius:999px; background: rgba(245,158,11,.92); color:#090d16; border:1px solid #fef08a; box-shadow:0 0 16px rgba(245,158,11,.8); pointer-events:none; animation: floatUpFade 1.3s cubic-bezier(.16,1,.3,1) forwards` | 126-141 |
| `.biome-tag` | `position:absolute; transform: translate(-50%,-50%); padding:3px 10px; border-radius:999px; font-size:10px; font-weight:800; letter-spacing:.08em; text-transform:uppercase; pointer-events:none; opacity:.72; backdrop-filter: blur(4px)`; plus classes `text-white shadow-lg`; inline `background` and `border: 1px solid` from F2.5 | 147-159, 2057-2059 |

### F8. Interaction and state patterns

| State | Pattern | Examples (lines) |
|---|---|---|
| Hover, neutral buttons | background one step lighter (`slate-800` to `slate-700`, or `/70` alpha) | 219, 442, 556 |
| Hover, accent buttons | amber fill alpha up (`/20` to `/30`, `/20` to `/35`) or gradient end brightens (500 to 400) | 236, 446, 468 |
| Hover, text controls | colour to `white` | 289, 368, 386 |
| Hover, rows | `bg-slate-900/60` to `bg-slate-800/80` | 3706 |
| Selected (chip, tab, scale) | `bg-amber-500/20-25 text-amber-300 border-amber-400/40` | 218, 266, 385 |
| Selected (row) | `bg-amber-500/25 border-amber-400/50` | 3706 |
| Selected (catalog item) | border becomes `border-amber-400` only | 3905 |
| Selected (monster in world) | pill `is-selected` sky ring + glow; 3D selection ring `0x38bdf8` visible | 97-100, 3773-3774 |
| Top rank (1-3) | gold pill and crown in world; gold rank number in leaderboard | 92-96, 3695-3697, 3708 |
| Focus, inputs | only the border colour changes (`focus:border-amber-400/70` or `focus:border-amber-400`) with `outline-none`; no ring | 256, 511, 523 |
| Focus, buttons | none defined (browser default; preflight does not remove outlines for `:focus-visible`) | whole file |
| Active (pointer) | `active:cursor-grabbing` on the two 3D canvases | 165, 375 |
| Disabled | none anywhere | whole file (grep) |
| Loading | none; no skeletons, spinners or empty states except the feed text (345) | whole file |
| Empty | feed only (345-347) | 345 |
| Hidden / visible panels | `hidden` class toggled by JS for inspector and modal | 3770, 3775, 4102-4107 |
| Cursors | `cursor-pointer` on rows and toggles, `cursor-grab` on canvases, `cursor-crosshair` on minimap | 165, 289, 489, 3706 |
| Selection by filter | element, model and ticker filters AND together; non-matching monsters are hidden and unlabelled | 3620-3625, 3637-3641 |
| Label visibility ("selective labels") | label shown when: toggle off, or selected, or rank <= 10, or in combat, or in victory, or a search is active | 3643-3649 |
| Scrollbar | `::-webkit-scrollbar` 4 x 4 px, track `rgba(15,23,42,.4)`, thumb `rgba(148,163,184,.35)`, `border-radius: 9999px`; applies to every scroll container | 46-57 |

### F9. Motion

| Animation | Definition | Source |
|---|---|---|
| `@keyframes floatUpFade` | 0%: `opacity:0; transform: translate(-50%,-10%) scale(.75)`; 20%: `opacity:1; translate(-50%,-60%) scale(1.08)`; 100%: `opacity:0; translate(-50%,-170%) scale(.92)` | 142-146 |
| Damage floater | 0.85 s, `cubic-bezier(0.16, 1, 0.3, 1)`, `forwards`; element removed by `setTimeout` at 850 ms | 124, 2888 |
| Consume floater | 1.3 s, same easing; removed at 1300 ms | 140, 2888 |
| Label fade | `transition: opacity 0.15s ease` | 74 |
| Label HP fill | `transition: width 0.12s ease-out` | 113 |
| Inspector HP fill | `transition-all duration-150` | 408 |
| `animate-pulse` | on the header live dot (TW default: 2 s, cubic-bezier(0.4,0,0.6,1), infinite) | 189 |
| `animate-ping` | on the feed header dot and the inspector live dot (TW default: 1 s, cubic-bezier(0,0,0.2,1), infinite) | 336, 379 |
| `transition` | on most buttons (TW default: 150 ms, cubic-bezier(0.4,0,0.2,1)); `transition-all` on the inspector panel | 219, 353 |
| `animate-fade-in` | referenced on feed rows but not defined anywhere (no config, no keyframes), so it does nothing | 3740 |
| Duel timing | first strike at 0.35 s, then one strike every 0.45 s, alternating, 18-40 damage, HP 100 (about 4 strikes, roughly 2.2 s, derived) | 3114-3119, 3400-3406 |
| State timers | victory 2.4 s (3125), consuming 1.05 s (3133), consumption stream 1.05 s (3094), victory confetti 0.95 s (2934) | cited |
| Camera reset | `lerp(DEFAULT, 0.08)` per frame until within 0.8 | 4159-4165 |
| Reduced motion | not handled | whole file |

### F10. In-world HTML overlay system

- Host: `<div id="world-labels">` with `position:absolute; inset:0; pointer-events:none; overflow:hidden; z-index:5`, a sibling after the canvas container (prototype:59-65, 165-168).
- One `div.monster-label` per monster, built with `innerHTML` at spawn (hidden HP bar, ticker pill with crown, dot, ticker) (2787-2797). References cached on the entity: `hpBarEl`, `hpFillEl`, `pillEl`, `crownEl` (2828-2831).
- Projection per frame: world anchor `(x, 3.1, z)` is projected with the main camera, converted with `window.innerWidth / innerHeight`, hidden when `z > 1` (behind camera), and positioned with `translate3d` (3627-3666). Labels use the filter and selective-label rules in F8.
- Floaters: `spawnFloatingText(worldPos, text, type)` projects once at spawn, writes `left` and `top` in px and removes itself after the animation; it does not follow the camera or the monster afterwards (2876-2889). Anchor heights: damage y = 2.8 (3411), consume y = 3.8 (3139) and 3.6 (3983). Skip when behind the camera (2878).
- Biome tags: five elements built once, projected every frame at world y 12-16, hidden by the "Biome Region Markers" toggle (2048-2063, 3673-3688).
- Per-frame cost: every visible label writes a style transform each frame; the leaderboard is rebuilt with `innerHTML` plus fresh click listeners on every `recalculateLeaderboard` (3702-3727), called on every consumption, selection, spawn and population sync (3145, 3779, 4122).
- Z-order consequence: labels sit under every HUD panel (z-5 vs z-20), so a label can pass behind the right stack or inspector. Floaters and tags behave the same.
- Anything the chain adds to the world (merger markers, pool gauges) should use the same layer and the same projection helper.

### F11. Canvas surfaces

| Surface | Size | Notes | Source |
|---|---|---|---|
| Main renderer | full viewport, `setSize(innerWidth, innerHeight)`; resize handler updates camera and renderer | pixel ratio max 2 | 722-729, 4174-4178 |
| Inspector renderer | 340 x 176 initial, then container `clientWidth x clientHeight` (about 350 x 176 at `sm`, 320 x 176 below) | separate WebGL context, rendered every frame while a monster is selected | 2666-2671, 2745-2749, 3528-3544 |
| Minimap | 144 x 144 2D canvas, `w-36 h-36` | redrawn every frame | 490, 3831-3881, 4170 |
| Frame stats | FPS cell updates every 0.5 s, capped at 60 | | 4150-4157 |

### F12. Non-English strings and other strings that must change

#### F12.1 Indonesian strings (must be translated)

| Line | Indonesian (exact) | Surface | Proposed English |
|---|---|---|---|
| 394 | `Aktivitas Saat Ini (Live Action)` | inspector overlay label | `Current Activity` |
| 396 | `Menjelajahi arena dengan santai...` | inspector placeholder (replaced on first telemetry tick, 3799) | `Roaming the arena...` |
| 426 | `Lokasi & Lawan` | inspector metadata key | `Zone & Opponent` |
| 438 | `Uji Animasi & Ekspresi (Live 3D)` | inspector section title (dev tool; remove or rename) | `Animation Preview` |
| 3310 | `IDLE • WASPADA` | activity badge (idle) | `IDLE • ALERT` |
| 3312 | `Beristirahat & mengamati sekitar di ${biome} Zone` | activity text (idle) | `Resting and watching the ${biome} Zone` |
| 3316 | `ROAMING • JELAJAH` | activity badge (walk) | `ROAMING` |
| 3318 | `Menjelajahi ${biome} Zone mencari lawan (${speed} u/s)` | activity text (walk) | `Exploring the ${biome} Zone for opponents (${speed} u/s)` |
| 3324 | `Bertarung sengit menggunakan ${attackName}!` | activity text (combat) | `Fighting fiercely with ${attackName}!` |
| 3330 | `Melancarkan serangan spesial ${attackName}!` | activity text (attack) | `Unleashing ${attackName}!` |
| 3334 | `TERKENA SERANGAN` (with U+1F4A5) | activity badge (hit) | `TAKING A HIT` |
| 3336 | `Menahan serangan lawan dan mengambil kuda-kuda!` | activity text (hit) | `Bracing against the opponent's strike!` |
| 3340 | `VICTORY! KEGIRANGAN!` (with U+1F389) | activity badge (victory) | `VICTORY!` |
| 3342 | `Melompat kegirangan merayakan kemenangan & menyerap LP!` | activity text (victory) | `Celebrating the win and absorbing the loser's liquidity!` |
| 3348 | `Kalah duel — energi diserap oleh pemenang...` | activity text (consuming) | `Defeated — energy absorbed by the winner...` |

Indonesian in comments (not user-visible, translate at port): 391, 2891, 3125, 3229, 3230 ("Kegirangan" / "kegirangan"), 3303 ("Apa yang sedang dilakukan").

#### F12.2 English strings that are wrong for a chain product

| Line | Current | Problem | Proposed |
|---|---|---|---|
| 6 | `Monster Arena — Global 3D Arena Prototype (Spec v1.0)` | prototype wording | `Monster Arena` |
| 185 | `Spec v1.0` badge | prototype wording | network badge (for example `Monad Testnet`) |
| 190 | `Global View Only (No Auto-Zoom) • 4 Connected Biomes` | design note, not product copy | connection status (see proposals) |
| 201 | `/ 60 target` | benchmark target | `/ 30` (diagram cap, prd-inferred A3) |
| 217-221 | `Scale Test:` 60/200/350/500 | benchmark control | remove or gate behind a dev flag |
| 234 | `Trigger Nearby Duel` | local simulation control | remove; duels come from chain events |
| 240 | `Launch Token Monster` | | `Launch Coin` |
| 298 | `Auto-Respawn Consumed` | contradicts last-coin-standing | remove |
| 307-308 | `MVP Monster Catalog (5)` / `Click to filter` | spec language | `Monster Types` / `Click to filter` |
| 325 | `Simulated LP` | simulated | `Pool value` |
| 339 | `Visual Layer` | spec language | `Live` or `On-chain` |
| 342 | `Winner dissolves & absorbs defeated monster particles. On-chain LP swap/airdrop requires protocol verification.` | says the chain part is not real | one line describing real merger flows |
| 346 | `Monsters are roaming... Collisions will trigger combat and particle absorption.` | | `Waiting for the first clash...` |
| 414, 418, 422 | `Monster Model / Size`, `Signature Attack`, `Validated LP (Sim)` | `Sim` | `Pool Reserve` (and keep the others) |
| 431 | `Token Address` | fine, but must be copyable and link out | keep |
| 439 | `Wins: n` with trophy U+1F3C6 | emoji icon | `Wins` plus SVG |
| 478 | `Auto-Battle Zoom: OFF` | static, no control | remove or replace by `Camera: Free` |
| 501 | `Section 8: Validated Token-to-Monster Identity Assignment` | spec reference | `Choose how your coin looks in the arena` |
| 544 | `Initial Validated LP (Simulated USD)` | simulated | `Initial liquidity` with the quote asset symbol |
| 551 | `Sanitized Identity Mapping Payload` | | `On-chain identity` |
| 561 | `Spawn in Shared Arena` | | `Launch in the Arena` |
| 3139 | `... VICTORY & ABSORB!` | | `{TICKER} WINS` |
| 3983 | `... HAPPY VICTORY!` | dev button | remove with the dev panel |
| 3746, 3749, 3752-3753 | `CONSUMED`, `Just now`, `Particle absorption complete`, `Sim LP: $` | static / simulated | real relative time; merger amounts |
| 3321-3322 | `DUEL vs {ticker or ENEMY}` | | keep; PvE opponent name once NPCs exist |

#### F12.3 Emoji used as icons (inventory; replace with an SVG set)

Crossed swords U+2694 (233, 444, 3322); crown U+1F451 (322, 2792); fire U+1F525 (269, 419, 3328); snowflake U+2744 (272); rock U+1FAA8 (275); high voltage U+26A1 (278); crystal ball U+1F52E (281); dragon U+1F409 (357, 585), wolf U+1F43A (601), moai U+1F5FF (617), fox U+1F98A (633), alien monster U+1F47E (649) as monster icons; trophy U+1F3C6 (439); party popper U+1F389 (446, 3139, 3340); collision U+1F4A5 (445, 3334); sparkles U+2728 (3346, 3752); lock U+1F512 (478); close glyph U+2715 (369, 503). The only vector icons are four inline stroke SVGs: logo crown (175-177), plus (237-239), search (257-259), fit-to-world (469-471), all `viewBox="0 0 24 24"`, `stroke="currentColor"`, `stroke-width` 2 (2.5 for plus), round caps and joins.

### F13. Defects and inconsistencies to avoid when porting

1. `animate-fade-in` is used on feed rows (3740) but is not defined, so new rows pop in with no animation.
2. `py-0.2` on the "CONSUMED" chip (3746) is not a valid default Tailwind spacing step, so no vertical padding is applied.
3. "Just now" is a literal string (3749) and never updates.
4. The inspector element pill is hard-coded red (363); the JS only changes its text (3821), so every non-fire monster shows a red pill.
5. The inspector speed text starts as `Spd: 5.8 u/s` (401) but the first telemetry tick overwrites it with `Pos: (x, z)` (3801); the HP/Pos pair is the only real telemetry.
6. Zone naming: the inspector prints `${biome} Zone` using `getBiomeAt`, which returns `Central Ruin` (699), producing "Central Ruin Zone" (3312, 3318), while the floating tag says "Central Citadel" (2054) and the PRD says ruin.
7. Skin naming differs in three places (F2.4), and neither the skin buttons (448-456) nor the animation buttons (441-447) show a selected state.
8. `* { user-select: none }` and `select-none` on body (19-21, 162) prevent selecting or copying addresses and hashes, which a chain product needs (token address at 431).
9. The HP fill gradient lives on the fill element, so the red-to-green gradient compresses as HP drops instead of revealing red at low HP (110-114).

Also noted, not defects of the design system: modal has no Escape or scrim-click close (4105-4110); the left stack and inspector probably overlap on 1080 px tall screens (F6); the right stack ignores the minimap's height (F6); the `active` class on the "All" chip (266) has no CSS and is only a marker.

### Recommendations (from 01-design-system.md)

### R1. How to rebuild the prototype's panels in Tailwind

1. Keep the prototype's utility strings. They are listed in F7 and are valid in both Tailwind v3 and v4; do not restyle. Check versions with `npm view tailwindcss version` at build time (outside this track).
2. Put the tokens in the Tailwind config rather than in arbitrary values. Suggested config (all values from the prototype, line cites in the comments):

```js
// tailwind.config (suggested; theme.extend)
{
  colors: {
    obsidian: '#080b14',                       // prototype:13
    panel: 'rgba(13,18,32,0.84)',              // prototype:14
    'panel-border': 'rgba(148,163,184,0.18)',  // prototype:15
  },
  fontFamily: {
    display: ['Cinzel', 'serif'],              // prototype:33
    sans: ['"Plus Jakarta Sans"', 'sans-serif'], // prototype:29
    mono: ['"JetBrains Mono"', 'monospace'],   // prototype:36
  },
  fontSize: { micro: '9px', caption: '10px', label: '11px' }, // text-[9px] / [10px] / [11px]
  keyframes: { floatUpFade: { /* prototype:142-146 */ } },
  animation: {
    'float-up-fade': 'floatUpFade 0.85s cubic-bezier(0.16,1,0.3,1) forwards',      // prototype:124
    'float-up-fade-slow': 'floatUpFade 1.3s cubic-bezier(0.16,1,0.3,1) forwards',  // prototype:140
  },
}
```

3. Define `.glass-panel`, `.font-mono-num` (family + `tabular-nums`) and the scrollbar rule in `@layer components` / `@layer base` so utilities can override them (see F5 ordering hazard).
4. Load the three fonts through the framework's font loader with the same weights as the prototype (Cinzel 700/800/900, Plus Jakarta Sans 400-800, JetBrains Mono 500/600/700) (prototype:10). Add JetBrains Mono 800 only if the 800 weight is wanted; today it silently renders as 700.
5. Make the semantic colour mapping in F2.3 explicit as component variants (a `tone` prop: `amber | sky | emerald | rose | purple`) instead of ad-hoc strings, and give every chip/tab/button an explicit `selected` prop that swaps whole class sets (F7.2 note).
6. Build the in-world overlay as one client-only layer keeping the exact CSS in F7.7 (including `will-change`), driven from the 3D module through the same projection maths (F10). Do not render labels through React state per frame.
7. Mark all tickers, addresses, hashes and amounts with `font-mono-num` and `select-text` (override the global `user-select: none`), and give every address a copy affordance.
8. Port the user-facing strings through the replacements in F12 and keep UI copy in one module so the Indonesian originals cannot leak back.
9. Do not port: Scale Test, Trigger Nearby Duel, Auto-Respawn, animation preview and skin switcher (skin is an immutable on-chain value per prd-inferred A10), FPS cell (keep behind a dev flag), `Spec v1.0` badge.
10. Add the missing baseline: `:focus-visible` ring using `ring-2 ring-amber-400/70` (proposal), `disabled:` variants (proposal below), `prefers-reduced-motion` guards on `animate-ping`, `animate-pulse` and `floatUpFade`, and `aria-label` on icon-only buttons (close, zoom, camera).
11. Fix the layout hazards before the demo: cap the right stack at `max-h-[calc(100vh-100px-200px)]`, and collapse the catalog card below roughly 1100 px tall or move it into a tab (F6).

### Proposed additions for a chain product

All of the following are PROPOSALS, not inventory. They use only existing tokens: glass panel, slate ramp, amber/sky/emerald/rose/purple semantics, the mono numerals, the 9/10/11 px scale, `rounded-lg/xl/2xl`, the `/20 /30 /40` alpha pattern for tinted surfaces, and the existing durations. New keyframes are flagged as NEW.

Colour semantics to apply (derived from F2.3 and the diagram): amber = winner, crown, primary action; sky (`#38bdf8`) = auto-buy / pool inflow / pending; emerald (`#34d399`) = value redistributed to holders / confirmed / positive; rose = loss / failed / danger; purple = consumption (already used at prototype:212); slate = protocol share / neutral.

#### P1. Wallet connect (header, right actions)

Placement: first child of the right-actions group (prototype:231), to the left of "Launch Coin"; spectators are not forced to connect (prd-inferred A8).

| State | Classes | Content |
|---|---|---|
| Disconnected | same as the duel button: `glass-panel hover:bg-slate-800/90 text-xs font-semibold px-3 py-2.5 rounded-xl flex items-center gap-1.5 text-amber-300 border border-amber-500/30 transition shadow-lg` | `Connect Wallet` |
| Connecting | same, `opacity-70 cursor-wait` | dot `w-1.5 h-1.5 rounded-full bg-sky-400 animate-ping` + `Connecting...` |
| Connected | `glass-panel rounded-xl px-3 py-2 flex items-center gap-2 text-xs border border-emerald-400/30` | dot `w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse` (as 189), address `font-mono-num font-bold text-white` in the existing short form `0x71c...9a4f` (prototype:431), balance `font-mono-num text-emerald-400` + symbol `text-[10px] text-slate-400` |
| Wrong network | `bg-rose-500/20 text-rose-300 border border-rose-400/40 text-xs font-semibold px-3 py-2.5 rounded-xl` | `Switch Network` |
| Menu | `glass-panel rounded-xl p-2 w-56 flex flex-col gap-1`, `z-30`, items like the leaderboard rows (`px-2 py-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800 text-xs`) | Copy address, View on explorer, Disconnect |

Below `sm`, show only the dot and the short address.

#### P2. Transaction toast

Placement: top centre under the header, `fixed top-20 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-[360px] pointer-events-none`; above the modal (z-50) so feedback survives while the launch modal is open. (The left stack ends at x = 252 and the right stack starts at x = viewport - 300, so the centre is free at 1280 px and wider.)

Anatomy: `glass-panel rounded-xl p-3 pointer-events-auto flex items-start gap-2.5 border` + tone border `border-sky-400/30` (pending), `border-emerald-400/30` (confirmed), `border-rose-400/30` (failed).
- Status dot `w-2 h-2 rounded-full mt-1` + `bg-sky-400 animate-ping` / `bg-emerald-400` / `bg-rose-400`.
- Title `text-xs font-semibold text-white` (examples: `Launching SOLAR`, `Coin launched`, `Transaction failed`).
- Meta `text-[10px] text-slate-400`, hash `font-mono-num text-slate-300` in short form `0x9f2...c1d4`, link `text-sky-300 hover:text-sky-200` `View on explorer`.
- Close `text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition`.
- Enter: NEW `toastIn` 0.25 s `cubic-bezier(0.16,1,0.3,1)` (translateY -8 px, opacity 0 to 1). Confirmed auto-dismiss after 6 s; failed stays until closed; pending stays until resolved. Reduced motion: no translate.
- Error copy shows the decoded revert reason in `text-[10px] text-rose-300` (data owned by the frontend).

#### P3. Pool / reserve display

1. Leaderboard row (replaces the simulated value at prototype:3716): keep `text-xs font-bold text-emerald-400` for the value and append the quote symbol `text-[9px] text-slate-400`; format `12.4K MON` (symbol assumed, see Q3). Row sub-line stays "{Monster} • W:{wins}".
2. Inspector metadata (replaces `Validated LP (Sim)` at 421-424): key `Pool Reserve`, value `font-mono-num text-emerald-400 font-semibold`. Add a full-width cell under it: two-segment reserve bar reusing the HP strip recipe (407-409): track `w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800`, segments `bg-sky-400` (quote side) and `bg-amber-500` (token side), labels `text-[9px] font-mono-num text-slate-400` with exact numbers (`12,400 MON / 1.2M SOLAR`).
3. In-world pool gauge (the diagram's pool vessel): extend the projected label (F7.7) with a second 44 x 5 bar identical to `.combat-hp-bar`, fill `linear-gradient(90deg, #38bdf8, #34d399)`, width = pool share of the arena total; shown under the same selective-label rules. Optional ring on the 3D ground: reuse the base element ring recipe (r 0.85-1.08, opacity 0.62) with scale tied to pool size (frontend / 3D decision).
4. Header stat cell "Total Pool" using the stat-cell recipe (196-203): label `text-[10px] uppercase tracking-wider text-slate-400`, value `font-mono-num font-bold text-sm text-emerald-400`.

#### P4. Stage rail and stage banner (diagram stages 1-4)

Labels, from the diagram: `1. Arena Spawn` (sub: `0 / 30 Coins on Live Map`), `2. PvE Leveling` (sub: `Defeat Monsters & Rapid Clashes`), `3. Liquidity Merger`, `4. The Chosen One` (sub: `Last Coin Standing`).

Stage rail (replaces the middle stats panel, same slot as prototype:196): `glass-panel rounded-xl px-3.5 py-2 hidden xl:flex items-center gap-2 pointer-events-auto`. Each step is a chip:
- Number: `w-5 h-5 rounded-full text-[10px] font-mono-num font-bold flex items-center justify-center`.
- Label: `text-[10px] uppercase tracking-wider`.
- Upcoming: `bg-slate-800/70 text-slate-400 border border-slate-700`.
- Active: `bg-amber-500/25 text-amber-300 border border-amber-400/40` (same as the selected scale button at 218) plus a `w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse` dot.
- Done: `text-emerald-400 border border-emerald-400/30 bg-emerald-500/10`.
- Connector: `h-px w-6 bg-slate-700/70` (rotated divider of 204).
- Below the rail (or as the sub-line of the brand panel, prototype:188) show the live sub-label `text-[11px] text-slate-400` with the count in mono: `N / 30 coins`.

Stage banner (transient announcement on stage change): centred in the world layer above labels, `fixed top-24 left-1/2 -translate-x-1/2 z-30 pointer-events-none`, inner `glass-panel rounded-2xl px-6 py-3 border border-amber-400/30 shadow-2xl text-center`; overline `text-[10px] uppercase tracking-wider text-sky-300 font-mono-num` (`STAGE 3`); title `font-display text-2xl font-black tracking-wider bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 bg-clip-text text-transparent` (the title recipe at 181, scaled up); sub `text-xs text-slate-400`. Motion: NEW `bannerIn/Out` using the 1.3 s consume-floater timing and easing (prototype:140); visible about 2.5 s. Only Cinzel at this size, consistent with its two existing uses.

#### P5. Merger flow visual (diagram stage 3)

Three layers, all reusing existing recipes.
1. In-world streams (reuse `consumption_stream`, 42 particles, 1.05 s, smoothstep arc, prototype:3060-3095, 3592-3616):
   - Auto-buy stream: loser to winner, colour `#38bdf8` (sky), instead of the loser's glow colour.
   - Redistribution stream: loser to a spread of holder positions, colour `#34d399` (emerald), 28-42 particles, same easing.
   - Winner reaction: existing victory confetti and absorb aura (2892-2935, 3130).
2. Floaters (variants of `.consume-floater`, prototype:126-141; same 1.3 s `floatUpFade`):
   - Gold (existing): `rgba(245,158,11,.92)`, border `#fef08a`, glow `0 0 16px rgba(245,158,11,.8)`, text `{TICKER} WINS`.
   - Sky (new): `rgba(56,189,248,.92)`, border `#bae6fd`, glow `0 0 16px rgba(56,189,248,.8)`, text `+{amount} AUTO-BUY`.
   - Emerald (new): `rgba(52,211,153,.92)`, border `#a7f3d0`, glow `0 0 16px rgba(52,211,153,.8)`, text `{amount} TO HOLDERS`.
3. Feed row (extends prototype:3740): same shell, line 1 unchanged ("{winner} CONSUMED {loser}"), line 2 replaced by a three-segment bar `h-1.5 rounded-full overflow-hidden flex bg-slate-900 border border-slate-800` with segments `bg-sky-400` (auto-buy), `bg-emerald-400` (redistributed), `bg-slate-500` (protocol), and a legend `text-[9px] font-mono-num` (`Auto-buy 70% • Holders 20% • Protocol 10%`; the percentages are the suggested start from prd-inferred A7, not a decision). Row links to the explorer (`text-[9px] text-sky-300`). Replace the static "Just now" with a relative time.
4. Optional pre-merge countdown chip, only if the contracts add a merge delay: `text-[10px] font-mono-num px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-400/30` (`MERGE IN 00:08`), placed on the loser's label.

#### P6. Chosen One end screen (diagram stage 4)

Overlay: same scrim as the modal (`fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4`, prototype:496) so the arena stays visible behind it; the camera is not moved (the prototype forbids auto-zoom, prototype:571).
Card: `glass-panel rounded-2xl max-w-lg w-full p-6 border border-amber-400/30 shadow-2xl text-center flex flex-col gap-4`.
- Crown tile: the logo tile recipe (174-177) at `w-16 h-16 rounded-2xl`, glyph `w-9 h-9`.
- Overline `text-[10px] uppercase tracking-wider text-sky-300 font-mono-num` (`STAGE 4`).
- Title `font-display text-4xl font-black tracking-wider bg-gradient-to-r from-amber-200 via-amber-400 to-orange-400 bg-clip-text text-transparent` (`THE CHOSEN ONE`).
- 3D viewport: reuse the inspector viewport (374-375) at `h-44`, victory pose (3228).
- Ticker `font-mono-num font-extrabold text-3xl text-white`; name `text-xs text-slate-400`.
- Stats grid reusing the metadata grid (412): Final Pool (emerald), Coins Consumed (purple-300), Wins (amber-300), Holders (sky-300), Token Address (`font-mono-num text-[10px] text-slate-300`, copyable) and `Round` duration.
- Actions: primary CTA recipe (236) `View on Explorer`; secondary (556) `Watch Replay` / `Close`.
- Motion: repeating `spawnVictoryCelebrationBurst` (34 particles, 0.95 s) every 1.2 s while open; card enters with the NEW `bannerIn`. Reduced motion: single burst.

#### P7. Round timer

A stat cell in the stage rail or header stats (same cell recipe as 197-203, dividers `h-6 w-px bg-slate-700/70`): label `text-[10px] uppercase tracking-wider text-slate-400` (`Round ends in`), value `font-mono-num font-bold text-sm text-white` as `mm:ss`. Urgency: under 60 s `text-amber-400`; under 10 s `text-rose-400 animate-pulse`. After the end, show `Settling...` with `text-sky-300`. Source of truth is the chain time (frontend must not use the local clock alone).

#### P8. Connection and indexer status

Replace the header sub-line (prototype:188-191, a static green pulse with design-note text) with a status line reusing its exact markup: `text-[11px] text-slate-400 flex items-center gap-1.5` and the dot.

| State | Dot | Text |
|---|---|---|
| Live | `w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse` | `Live • block 1,234,567` (mono for the number) |
| Syncing | `bg-sky-400 animate-ping` | `Syncing...` |
| Lagging | `bg-amber-400` | `Indexer lagging 12s` (`text-amber-300`) |
| Disconnected | `bg-rose-400` (static) | `Disconnected • retrying` (`text-rose-300`) |
| Replay (if a demo replay mode exists) | `bg-purple-400` | `Replay` |

When disconnected or lagging, add a full-width thin banner under the header: `fixed top-[76px] left-3 right-3 z-20 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[11px] px-3 py-1.5` (or rose tones for disconnected).

#### P9. Disabled, loading and arena-full states for the launch flow

- Disabled variant for all buttons: `disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:from-amber-500` (primary) and `disabled:hover:bg-slate-800` (neutral).
- Launch modal: replace the LP input (prototype:543-547) with `Initial liquidity` (mono, `text-emerald-400`) plus a balance line `text-[10px] text-slate-400` and a `Max` chip using the chip recipe (`px-2 py-1 rounded-md ... text-amber-300`); replace the JSON box content with the on-chain arguments (`monsterId`, `skinId`, ticker, name) in the same `font-mono-num text-[10px] text-sky-300` pre; add a step list under it (`Confirm in wallet`, `Launching`, `Done`) with the toast dot tones; when the arena is full show `text-[11px] text-rose-300` `Arena full (30 / 30)` and disable submit.
- Loading: use `bg-slate-800/70 animate-pulse rounded` skeleton blocks at row size for leaderboard rows and metadata cells.

#### P10. Trade controls (only if buy/sell is in scope)

In the inspector, replace the animation preview block (435-447) with a `Buy` / `Sell` segmented control built from the inspector tab recipe (384-388) and an amount input in the mono-input recipe (545-546) with a `Confirm in wallet` primary CTA. The pool panel (P3) shows expected output. Whether trading happens in this UI is an open question (Q2).
