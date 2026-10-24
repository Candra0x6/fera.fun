# web

Vite + React 19 (islands only) + Tailwind 3.4 + the prototype's vanilla Three.js scene (three 0.128.0, pinned).

## Commands

- `pnpm --filter web dev` serves on `http://127.0.0.1:5173`
- `pnpm --filter web typecheck`, `lint`, `build`, `test`

## Modes (query string)

- `?sim=1` is the original prototype simulation (60 coins, random duels, scale test, launch modal).
- `?replay=fixture` plays `@animal/shared/fixtures/arena-replay.json` through `ArenaStore` and the director; add `&speed=4` to fast-forward.
- `?replay=stress&coins=30` hydrates N synthetic coins for frame-rate checks.
- no parameter is live chain mode: `ChainFeed` from `@animal/shared` feeds `ArenaStore`; set `VITE_ARENA_ADDRESS`, `VITE_ROUND_ID`, `VITE_RPC_HTTP_URL`, `VITE_RPC_WS_URL`, `VITE_CHAIN_ID`, `VITE_KEEPER_URL` (without an arena address the status chip stays `Disconnected`).
- `&debug=1` shows the FPS cell.

## Layout

- `index.html` holds the prototype markup with the listed edits plus the `#island-*` hosts.
- `src/arena/arena3d.js` is the extracted scene (comments stripped) with the bridge appended; it is excluded from `tsc` and ESLint by configuration. `arena3d.d.ts` types its exports.
- `src/arena/scene/` (plain JS, excluded from `tsc` and ESLint like `arena3d.js`) holds the Monster Arena visuals ported to three 0.128: `kit.js` (sRGB-linear colours, unit geometries, vertex-colour merge), `island.js` (terrain, buildings, props, dynamic bits), `monsters.js` (five species factories baked per animated node, per-coin variation, growth) and `icons.js` (offscreen bust renders used as HUD icons).
- `src/arena/bridge.ts` holds the `ArenaBridge` types; `scriptDuel.ts`, `duelQueue.ts`, `seeded.ts` are pure and unit-tested.
- `src/chain/wallet.ts` (EIP-6963 injected plus testnet burner, `/drip`, serialised writes), `contract.ts`, `liveFeed.ts`; `src/islands/*` are the React islands (wallet, launch, stage rail, rules, lockdown, trade, claims, Chosen One, toasts, status chip).
- `src/chain/director.ts` maps store events to bridge calls with commit-state gating; `feed.ts` renders merge rows.

## Decisions

- `bridge.d.ts` is `arena3d.d.ts`: a `bridge.d.ts` beside `bridge.ts` would be shadowed by it.
- The bridge adds `updateCoins`, `onEpochResolved` and an optional `CoinSceneView.token` on top of contracts section 6; `contracts.md` needs the same three lines.
- Ranks are derived by the director (reserve, wins, token) and passed in; the scene only orders by them in chain mode.
- Clash ids are `roundId:epoch:clashId`; duel side A is the lower coin id; the loser strikes first and the chain winner lands strike 6.
- `scriptDuel` re-salts up to 32 times, then forces the finale; about 3 percent of element-disadvantaged winners hit that path.
- The director replays against its own structural `Director*` types, so shared type churn only breaks `main.tsx`.
- Replay time is fixture time (accumulated sleeps), not wall time, so timer drift cannot trigger the 15 s fast-forward.
- `RoundSettled` waits for every queued clash to finish before the crown walk.
- Launch button and modal are `?sim=1` only until the launch island exists (F2).
- Emoji icons stay for parity; the SVG set is F3. Reduced motion is a global CSS guard; 3D bursts are still F3 except the finale.
- `Math.random` left in `arena3d.js` is cosmetic (procedural textures, flame phase, VFX particles) or sim-only (spawn search, token generators, sim duel damage, encounters, launch form); chain roaming uses a per-coin seeded generator.
- Replay mode simulates claims and transactions (no chain call); live mode reads `pendingConsolation`, `pendingRedeem` and balances by multicall.
- Gas limits are fixed constants in `contract.ts` (no `contracts/GAS.md` yet).
- No `.md` beyond this file: decisions live here instead of `DECISIONS.md`.

## Monster Arena visuals

- Source: `~/Projects/Personal/3D/assets/monster-arena/` (written for three r178). Ported without upgrading three: `outputEncoding = sRGBEncoding` plus linear colours at material/vertex level, light intensities divided by pi, `mergeBufferGeometries`, `OrbitControls` import as before, no `flatShading` on Lambert (flat normals are baked on non-indexed geometry).
- The island is built in its original 10.4 unit radius and scaled by `ISLAND_SCALE` (4.5), so the world is about 47 units wide (was 135) and monsters keep roughly the old world size. `WORLD_RADIUS`, spawn ring (`spawnAnchor` got optional `innerRadius`/`rimMargin`), camera, bounds, duel gap and effect heights were retuned for that.
- Monsters: static parts and every animated node merge into vertex-colour meshes (about 5 draws per monster, 1 above 150 monsters). Colour drift (hue, saturation, lightness) and size derive from `hashString('variant:' + coinId)`; scale grows 7 percent per level up to level 9.
- The four biome zones are now labels only (the terrain is one island); the sectors still decide where each species spawns.

## Parity evidence (`web/parity/`)

- `prototype-default.jpg` and `vite-sim-default.jpg`: prototype served from `127.0.0.1:8765` and this app at `?sim=1`, same Brave zoom, captured with `screen-nav snap brave`.
- `f2-*.jpg`, `f3-*.jpg`: islands on the fixture replay (lobby with rules, wallet menu, lockdown with power ratings, claim, Chosen One screen, crown walk) and 30 synthetic coins.
- `chain-fixture-lobby.jpg`, `-duel.jpg`, `-boost.jpg`, `-feed.jpg`, `-hunt.jpg`, `-finale.jpg`: fixture replay in chain mode.
- `monster-arena-*.png`: the new island, monsters and HUD at `?sim=1`, fixture replay (lobby, lockdown, finale, close-up) and 30 synthetic coins, captured with headless Brave (CDP) at 1440x900.
- Differences are the listed text edits only; a computed-style and geometry probe of 22 panels at 1440x900, 1920x1080 and 1366x768 matched except for those texts.
