# 04 — Repo audit

> PM note (2026-10-19, revision 2): the module split (Findings 3) and React-mount guidance are **superseded** by the decision to extract the scene verbatim into one ES module in a Vite app (`docs/handoffs/02-frontend-3d.md`). Code map, seams, hazards, performance facts, dependency versions and ChainDrivenMode (Findings 1, 2, 4, 5, 7, 8) still stand.

Date: 2026-10-19. Scope: audit of `monster_arena_3d_prototype (1).html` as a migration source for a chain-driven Monster Arena. Citation key: `prototype:N` or `prototype:N-M` means line(s) of `/home/cn/Projects/Competition/Web3/ANIMAL/monster_arena_3d_prototype (1).html`. "Derived" means a number I computed by executing prototype lines 568-4182 against a stub of `THREE` and the DOM (a throwaway harness kept outside the repo, in the session scratchpad) and counting constructor calls; the inputs are cited, the harness is not part of the deliverable. Proposed names (events, files, methods) are proposals, not inventory.

## Summary

- The repo is greenfield: one 4,184-line HTML file (183,622 bytes), one PNG, an empty `docs/arch.md`, and research docs. There is no `package.json`, no git repository, no tests, no build step. All code lives in one classic `<script>` at prototype:567-4183 (3,615 lines of JavaScript).
- The scene is cleanly separable from the DOM panels. Roughly 2,700 of the 3,615 script lines (environment, textures, monster factory, rig animator, VFX, particles) need only trivial edits (export statements, a context object) to become ES modules. The panels (leaderboard, feed, detail, filters, launch modal, camera bar) are ~800 lines of DOM glue that should be deleted and replaced by React, not moved.
- Coupling is moderate and countable: 58 `document.getElementById` calls (27 inside the sim, render and event path, 11 of them executed every frame while a monster is selected), 16 `window.*` lines (10 of them `innerWidth`/`innerHeight`), 101 top-level declarations (45 const, 22 let, 34 function), 342 `THREE.` references, 22 mutable top-level `let`s.
- All simulated state the chain must replace passes through about 25 seams (table in Findings 2). The critical ones: `spawnMonsterEntity` (identity, `lp`), the duel loop in `updateSimulation` (outcome is `Math.random` at prototype:3406), `resolveDuel` (never edits `lp`), autoRespawn (prototype:3439-3442), and the launch form (prototype:4112-4128).
- The prototype never moves value: `lp` is written once at spawn (prototype:2810) and read-only afterwards, so the leaderboard order is static (prototype:3692). Every economic visual in the diagram (pool vessels, merger flows, Chosen One) is net-new; the reusable pieces are the consumption particle stream (prototype:3060-3096), the victory burst (prototype:2892-2936), the central crown (prototype:1486-1498) and the citadel dais (prototype:1471-1483).
- Dependencies: Three.js r128 (cdnjs), OrbitControls r128 from `examples/js` (global `THREE.OrbitControls`), Tailwind Play CDN (unpinned; resolves to 3.4.17 today), three Google Fonts. Nothing else. Recommendation: pin `three@0.128.0` for the demo and import `OrbitControls` from `three/examples/jsm/controls/OrbitControls.js` (present in the 0.128.0 package and importing the bare specifier `three`). Do not upgrade Three during the project: r147, r152, r155 and r182 all change the look of this exact scene.
- Cost of the target mode: 30 coins is about 1,100 coin meshes plus 620 environment meshes, roughly 2,800 draw calls per frame including the shadow pass (derived), about 58 percent of the 60-coin default (about 4,900) and 8 percent of the 500 stress case (about 35,000). Draw calls, not triangles, dominate. No frame time was measured; the prototype's own FPS readout is clamped and cannot be trusted below 20 FPS (prototype:4146, 4153).
- ChainDrivenMode can be implemented with about 10 small edits to existing functions plus one new director module: scripted duels reuse the prototype's strike loop, VFX and resolve visuals; only the dice (damage, encounter, respawn) are removed. Positions are declared presentation-only and reconciled by deterministic spawn points plus a meet-in-the-middle approach phase.
- Biggest migration hazards: no teardown path (two WebGL contexts, one never-cancelled rAF, listeners never removed), `window.onload` boot (never fires in a Next.js client mount), full-viewport assumptions in label projection, and non-deterministic outcome code. Details in Findings 7.

## Findings

### 0. File inventory

| Path | Size | Note |
|---|---|---|
| `monster_arena_3d_prototype (1).html` | 183,622 bytes, 4,184 newline-terminated lines (the 4,185th line `</html>` has no trailing newline) | the only code |
| `docs/download (1).png` | about 193 KB | 4-stage diagram |
| `docs/arch.md` | 0 bytes | empty |
| `docs/research/00-brief.md`, `prd-inferred.md` | 13 KB, 5.7 KB | PM docs |
| `docs/handoffs/STATUS.md` | 1.4 KB | PM status |

Confirmed absent: `package.json`, `.git` (both returned "No such file" on 2026-10-19), any test file, any lockfile, any image or audio asset. The prototype fetches exactly four external URLs (prototype:7, 8, 9, 10) and nothing else; there are no images, all art is procedural.

### 1. Code map by line range

HTML and CSS

| Lines | Content |
|---|---|
| 1-10 | doctype, meta, title (prototype:6 "Spec v1.0"), 3 CDN scripts (7-9), Google Fonts link (10) |
| 11-160 | CSS: tokens 12-17, resets and `user-select:none` on every element 18-21, body 22-31, font helpers 32-38, `.glass-panel` 39-45, scrollbars 46-57, world-label overlay 58-65, `.monster-label` 66-76 (note `will-change`), ticker pill 77-100, HP bar 101-114, floaters 115-146, `.biome-tag` 147-159 |
| 162-165 | body, `#canvas-container` (165) |
| 168 | `#world-labels` overlay |
| 171-243 | top bar: brand 173-193, stats and scale-test buttons 196-228, trigger-duel and launch buttons 231-242 |
| 246-314 | left aside: filters 247-302, MVP catalog card 305-313 |
| 317-350 | right aside: leaderboard 319-330, kill feed 333-349 |
| 353-459 | selected-monster panel with the second canvas (`#inspector-canvas-container`, 375) |
| 462-493 | camera bar 464-481, minimap 484-492 |
| 496-565 | launch modal and form |

Script (567-4183)

| Lines | Content | Key symbols |
|---|---|---|
| 568-575 | header comment | |
| 577-668 | catalog and skins | `MONSTER_CATALOG` 578-659, `SKIN_MODIFIERS` 662-668 |
| 670-686 | simulated tokens | `INITIAL_TOKENS` 671-684, `TICKER_PREFIXES` 686 |
| 688-707 | world config | `WORLD_RADIUS` 689, `BIOMES` 690-695, `getBiomeAt` 697-707 |
| 709-754 | renderer, camera, orbit controls, fit-to-world | `scene`, `camera`, `renderer`, `controls`, `fitToWorld` 752 |
| 756-797 | lights (hemisphere, ambient, one shadow-casting directional, 5 point lights) | |
| 799-811 | environment group, `obstacles`, `animatedEnvProps` | |
| 813-1214 | procedural canvas textures (IIFE) | `PROCEDURAL_TEXTURES` |
| 1216-2043 | `buildConnectedArena()` (called at 2045): materials 1218-1307, cliffs 1309-1336, clouds 1338-1363, terrain disc 1365-1420, citadel 1422-1541, bridges 1543-1571, rivers and waterfalls 1573-1641, ice biome 1643-1727, lava 1729-1787, forest 1789-1819, dark 1821-1911, props 1913-2042 | |
| 2047-2063 | biome DOM tags | `biomeDOMElements` |
| 2065-2086 | `SHARED_GEO`, `makePart` | |
| 2088-2113 | `getMonsterPalette` | |
| 2115-2626 | `createMonster3DMesh` (dragon 2209-2306, wolf 2307-2378, golem 2380-2436, fox 2438-2508, spirit 2510-2570, ring, selection ring, aura 2572-2607) | |
| 2629-2641 | `applyMonsterSkin` | |
| 2643-2655 | sim state globals | `monsters`, `activeDuels`, `particleSystems`, `selectedMonster`, `totalConsumptions`, `targetPopulation`, flags |
| 2657-2750 | inspector scene, second renderer, drag, `rebuildInspectorModel` | |
| 2752-2873 | `findSafeSpawnPosition` 2752, `sanitizeTicker` 2771, `spawnMonsterEntity` 2775, `createRandomTokenConfig` 2838, `syncPopulation` 2858 | |
| 2875-3096 | VFX: `spawnFloatingText` 2876, `spawnVictoryCelebrationBurst` 2892, `spawnSignatureAttackVFX` 2939, `spawnAttackImpactBurst` 3027, `spawnConsumptionParticleStream` 3060 | |
| 3098-3149 | `startDuel` 3098, `resolveDuel` 3123 | |
| 3151-3301 | `animateVisualRig` (idle 3163, walk 3178, combat or attack 3200, hit 3218, victory 3228, consuming 3286) | |
| 3303-3357 | `getMonsterActivityDescription` (Indonesian strings) | |
| 3359-3618 | `updateSimulation`: env props 3360-3388, duels 3390-3420, monsters 3422-3525, inspector 3527-3544, particles 3546-3617 | |
| 3620-3689 | `checkMonsterFilterMatch`, `updateProjectedLabels` | |
| 3691-3728 | `recalculateLeaderboard` | |
| 3730-3760 | `addKillFeedEntry` | |
| 3762-3829 | `selectMonster` 3762, `updateLiveInspectorTelemetry` 3782, `updateDetailPanelUI` 3809 | |
| 3831-3881 | minimap | |
| 3883-3912 | `initCatalogSidebar` | |
| 3914-3950 | raycaster pick | |
| 3952-4075 | UI handlers (close, inspector views, anim preview, skin, scale test, filters, search, toggles, trigger duel, camera, minimap click) | |
| 4077-4128 | launch modal and submit | |
| 4130-4138 | init: `syncPopulation(60)`, auto-select after 350 ms | |
| 4140-4172 | render loop `animate` | |
| 4174-4182 | resize listener, `window.onload` boot | |

### 2. Seams where simulated state is read or written

The "on-chain event" column uses proposed event names (E1-E9 below the table). The contracts track owns the real schema.

| # | Function (line) | Current behaviour | Chain data it would need | On-chain event or call it should react to |
|---|---|---|---|---|
| S1 | `INITIAL_TOKENS` (prototype:671-684), read at prototype:2839-2841 | 12 curated `{ticker,name,monsterId,lp,skinId}` objects | none in chain mode; remove from the chain bundle, keep as sandbox fixture | n/a (replaced by E1) |
| S2 | `createRandomTokenConfig` (prototype:2838-2856), `TICKER_PREFIXES` (686) | invents token configs with `Math.random` LP 2,500-26,500; also used by respawn (3440) and population sync (2863) | token address, symbol, name, `monsterId`, `skinId`, quote reserve | E1 `CoinSpawned`; never called in chain mode |
| S3 | `spawnMonsterEntity` (prototype:2775-2836) | builds the entity: random `uid` (2803), fake `tokenId` (2804), `lp` falls back to random (2810), `rank` 999 (2811), `wins` 0 (2812), random position (2780), random heading and speed (2799-2800), `hp` 100 (2822-2823), DOM label (2787-2797) | token address (stable id), symbol, name, `monsterId`, `skinId` (uint8 each, per PRD A10), quote reserve, wins, alive flag | E1 `CoinSpawned`; also bulk hydrate from indexer snapshot on load |
| S4 | `findSafeSpawnPosition` (prototype:2752-2769) | random radius and angle, rejects obstacle overlap, 40 attempts | nothing on chain; needs a deterministic seed (hash of token address) so all clients spawn in the same place | derived from E1's token address |
| S5 | `syncPopulation` (prototype:2858-2873) and `targetPopulation` (2649), scale buttons (3999-4007), init `syncPopulation(60)` (4131) | grows or shrinks the herd to a target count, removes first non-combat, non-selected monster (2866-2868), writes `stat-target-count` (2860) | arena cap (30 per PRD A3) and current live set | `RoundConfig.maxCoins` read once; live set changes via E1 and E6 |
| S6 | `lp` field: read at prototype:3692 (sort), 3716 (leaderboard), 3753 (feed), 3825 (panel); written only at 2810 | simulated USD, never changes after spawn | pool quote reserve (and token reserve) per coin, in display units | E2 `ReservesChanged`, E4/E5 on merge |
| S7 | `wins` field: written 3126, read 3692 (tie-break), 3712, 3806 | increments on a locally decided duel win | per-coin win count | E4 `ClashResolved` (or read from coin struct) |
| S8 | `rank` field: written 3694 by `recalculateLeaderboard`; read 3646 (label gating, top 10), 3708, 3820 | rank = index after sorting by `lp` then `wins` | derived client-side from reserves; needs a deterministic tie-break (token address) | recompute on E2 and E4, not only on duel end |
| S9 | `hp` and `maxHp`: init 2822-2823, reset 3101-3102 and 3127, damage 3407-3408, display 3800-3802 | cosmetic combat bar, 100 per duel | none required; chain supplies only the outcome. Optional: coin level or power to scale `maxHp` | derived from E3/E4 choreography |
| S10 | `startDuel` (prototype:3098-3121) with caller at 3505-3516 and button at 4035-4058 | pairs two monsters when within 4.5 units with probability 0.08 per monster per frame (3505, 3510), or by button which also teleports `m2` next to `m1` (4053-4054); cap 8 concurrent (3505) | clash id, coin A, coin B, seed | E3 `ClashRequested` (start of anticipation) or E4 (single-shot) |
| S11 | duel strike loop in `updateSimulation` (prototype:3390-3418) | every 0.45 s alternate attacker (3401-3403), `dmg = round(18 + rand*22)` (3406), first to 0 HP wins (3413-3414) | winner and loser ids, optional per-strike plan | E4 `ClashResolved`: the winner is the chain's, never `hp <= 0` |
| S12 | `resolveDuel` (prototype:3123-3149) | sets states (3124-3135), `wins += 1` (3126), consumption stream and burst (3137-3139), `totalConsumptions` and DOM counter (3141-3142), feed (3144), leaderboard (3145), panel (3146). It never touches `lp` | winner and loser reserves after merge, amounts moved, tx hash, block time | E4 plus E5 `LiquidityMerged` |
| S13 | autoRespawn (prototype:3439-3442, toggle 4030-4032, `autoRespawn` 2652) | when a loser finishes dissolving, spawns a random replacement to hold the population | none; dead coins stay dead, new coins appear only on E1 | disabled in chain mode; E6 `CoinEliminated` triggers removal |
| S14 | consuming removal (prototype:3428-3445) | removes mesh and label after 1.05 s, clears selection if selected (3434-3437), splices (3438) | none | E6 |
| S15 | `addKillFeedEntry` (prototype:3730-3760) | prepends a row, "Just now" (3749), "Sim LP" from `loser.lp` (3753), keeps 10 (3757) | winner, loser, amounts, tx hash, block timestamp, history on reload | E4 and E5; backfill history from indexer |
| S16 | `recalculateLeaderboard` (prototype:3691-3728) | sorts a copy, writes `rank`, toggles pill class and crown (3696-3697), rewrites top 8 as `innerHTML` (3702) and re-binds click handlers (3722) | all reserves; top-N or all 30 | E2, E4, E5 |
| S17 | launch submit (prototype:4112-4128) and preview (4079-4094) | spawns locally with simulated USD LP (4119), fake `tokenId` `'0x' + ticker + '...verified'` (4086), plays victory pose (4124-4126) | factory call `createCoin(name, symbol, monsterId, skinId)` with quote seed (in MON), pending tx state, wallet | submit becomes a wallet tx; the scene reacts only to E1 (no optimistic spawn) |
| S18 | scale buttons (prototype:218-221, 3999-4007) | 60/200/350/500 | none | removed in chain mode |
| S19 | `btn-trigger-duel` (prototype:4035-4058) | forces a nearby duel with teleport | optional admin or keeper trigger | removed, or a keeper-only debug call |
| S20 | anim preview buttons (prototype:3971-3987) | write `selectedMonster.state` directly (3975) | none | sandbox only; see hazard H12 |
| S21 | skin switch (prototype:3990-3996, `applyMonsterSkin` 2629-2641) | mutates `skinId` locally | skin is immutable chain data | removed in chain mode |
| S22 | `selectedMonster` (prototype:2647, 47 references) and `selectMonster` (3762-3780) | UI selection, builds inspector model (3777) | none | emitted to React as `select` event |
| S23 | counters: `totalConsumptions` (2648, 3141-3142), active count (3525), duel count (3420) | local counters | clashes played, live coins, active clashes | E4, E6; or `Arena.totals()` read |
| S24 | `getBiomeAt` (prototype:697-707), biome tags (2049-2063), `BIOMES` (690-695) | position to biome name; biome has no relation to coin identity | optional element-to-biome mapping for deterministic spawn anchors | derived from `monsterId` in E1 |
| S25 | inspector fields (prototype:3819-3826) | name, ticker, rank, element, model, LP, token id | token address, explorer link | read from the coin store |

Proposed event set for the scene's data layer (names are placeholders):
E1 `CoinSpawned(token, creator, monsterId, skinId, name, symbol, quoteSeed)`; E2 `ReservesChanged(token, quoteReserve, tokenReserve)`; E3 `ClashRequested(clashId, a, b)` (optional, only if the contract has a request-then-resolve step); E4 `ClashResolved(clashId, winner, loser, seed, winnerReserveAfter)`; E5 `LiquidityMerged(clashId, loser, winner, autoBuyQuote, redistributedQuote)`; E6 `CoinEliminated(token, cause)`; E7 `NpcDefeated(coin, npcId, reserveDelta)`; E8 `StageChanged(stage, endsAt)`; E9 `ChosenOneCrowned(token, finalReserve)`.

### 3. Coupling inventory and proposed module split

Counts (script region 567-4183, measured with grep and per-range awk counts)

| Pattern | Count | Where |
|---|---|---|
| `document.getElementById` | 58 total | setup 710, 711, 2658, 3831, 4078 (5); boot-time handler wiring 3885, 3953, 4020-4069 (11); launch modal 4080-4119 (15); sim, render and event path 27: `syncPopulation` 2860, `resolveDuel` 3142, `updateSimulation` 3420, 3436, 3525, `updateProjectedLabels` 3668, `recalculateLeaderboard` 3700, `addKillFeedEntry` 3731, `selectMonster` 3768, `updateLiveInspectorTelemetry` 3788-3795 (8), `updateDetailPanelUI` 3814-3826 (9), `animate` 4154 |
| per-frame subset | 3 always (3420, 3525, 3668) plus 8 while a monster is selected (3788-3795, reached from 3543) = 11 per frame; plus 1 every 0.5 s (4154) | |
| `window.*` | 16 lines: `innerWidth`/`innerHeight` on 716, 723, 2879, 2880, 3628, 3629, 3925, 3926, 4175, 4177; `devicePixelRatio` 724, 2668; `addEventListener` 2716, 2722, 4174; `onload` 4180 | |
| `document.createElement` | 5 (816 canvas, 2056 biome tag, 2787 label, 2882 floater, 3739 feed row) | |
| `document.querySelectorAll` | 13 (3956-4013) | |
| `innerHTML` writes | 5 (2789, 3702, 3741, 3887, 3731 clear) | |
| top-level declarations | 101 = 45 const, 22 let, 34 function | |
| mutable top-level `let` | 22: prototype:751, 2644-2655 (12), 2705-2709 (5), 3917, 4140-4142 | |
| `THREE.` references | 342 (285 lines) | pure engine calls, safe under `import * as THREE from 'three'` |
| `Math.random` | 78 (37 before 2752, mostly textures; 41 from 2752) | outcome-relevant: 3406, 3440, 3505; cosmetic: the rest |
| approximate reference counts of shared globals | `selectedMonster` 47, `PROCEDURAL_TEXTURES` 70, `SHARED_GEO` 117, `monsters` 27, `scene` 28, `environmentGroup` 28, `controls` 25, `obstacles` 18, `camera` 19, `particleSystems` 15 | determines edit cost |

In a classic script the 34 function declarations become properties of `window`, and the const and let declarations enter the shared global lexical scope; any second script on the page would collide with them. This is the root reason the code cannot simply be pasted into a React component.

Proposed split. The rule is to move code verbatim, change only (a) imports and exports, (b) the places where DOM or `window` is touched, (c) the 22 mutable lets. Shared mutable state lives in two places: a `ctx` object holding stable references (scene, camera, renderer, controls, `labelsContainer`, the three arrays `monsters`, `activeDuels`, `particleSystems`, `obstacles`) and a `state` object for reassigned primitives (`selectedMonster`, `totalConsumptions`, `targetPopulation`, filters, `autoRespawn`). Each module that closes over `scene`, `camera` and so on gets a one-line `bind(ctx)` that assigns module-level `let`s, so the moved bodies stay unchanged.

```
src/arena/                         client-only; mounted via a 'use client' leaf and dynamic import with ssr:false
  index.ts                         NEW   createArena(opts): Arena  (the adapter, below)
  types.ts                         NEW   CoinView, ClashPlan, MergeFx, ArenaEvent
  config/catalog.js                577-668  MONSTER_CATALOG, SKIN_MODIFIERS                  edit: export
  config/world.js                  688-707  WORLD_RADIUS, BIOMES, getBiomeAt                  edit: export
  sandbox/fixtures.js              670-686, 2838-2856  INITIAL_TOKENS, TICKER_PREFIXES, createRandomTokenConfig   sandbox mode only
  scene/core.js                    709-797, 750-754, 4140-4182
        exports createCore(container, getSize): { scene, camera, renderer, controls, fitToWorld, start, stop, dispose }
        edits: wrap in function; 10 innerWidth/innerHeight lines use getSize(); OrbitControls import (732);
               replace window.onload (4180) with start(); store rAF id; add dispose()
  scene/textures.js                813-1214  exports PROCEDURAL_TEXTURES (already an IIFE) + disposeTextures()
  scene/environment.js             799-811, 1216-2043, 2047-2063
        exports createEnvironment(ctx): { environmentGroup, obstacles, animatedEnvProps, biomeDOMElements, updateEnv(dt, elapsed) }
        edits: environmentGroup/obstacles/animatedEnvProps become locals of createEnvironment; 
               updateEnv = prototype:3360-3388 moved verbatim (and the per-frame getObjectByName at 3365 cached once)
  monsters/factory.js              2065-2113, 2115-2626, 2629-2641
        exports SHARED_GEO, makePart, getMonsterPalette, createMonster3DMesh, applyMonsterSkin, disposeMonsterVisual(visual)
        edits: imports only; disposeMonsterVisual is new (fixes H8)
  monsters/rig.js                  3151-3301  exports animateVisualRig         edits: none
  monsters/activity.js             3303-3357  exports getMonsterActivityDescription   edits: translate Indonesian strings to English
  monsters/entity.js               2752-2836  exports findSafeSpawnPosition, sanitizeTicker, spawnMonsterEntity
        edits: accept { id, pos, seed } from CoinView instead of random uid/tokenId/position (2803-2804, 2780)
  sim/vfx.js                       2875-3096  exports spawnFloatingText, spawnVictoryCelebrationBurst, spawnSignatureAttackVFX,
                                              spawnAttackImpactBurst, spawnConsumptionParticleStream, updateParticles(dt) (= 3546-3617)
        edits: spawnFloatingText uses container rect instead of window size (2879-2880)
  sim/combat.js                    3098-3149  exports startDuel(m1, m2, plan?), resolveVisuals(winner, loser)  (resolveDuel split, see F8)
  sim/update.js                    3359-3544  exports updateSimulation(dt, elapsed): composes updateEnv, updateDuels (3390-3420),
                                              updateMonsters (3422-3525), updateInspector (3527-3544), updateParticles
        edits: mode guards (F8); 3420 and 3525 DOM writes become stats counters
  sim/director.js                  NEW    ChainDirector: event queue, snapshot reconcile, clash choreography (F8)
  sim/rng.js                       NEW    mulberry32(seed), hashToSeed(address or id)
  ui-bridge/labels.js              3620-3689  exports checkMonsterFilterMatch, updateProjectedLabels   edits: container rect instead of window
  ui-bridge/inspector.js           2657-2750, 3782-3807  second renderer; telemetry becomes an emitted event
  ui-bridge/minimap.js             3831-3881  draws into a canvas supplied by React (attachMinimap)
  ui-bridge/pick.js                3914-3950  raycast pick; emits 'select'; edits: container rect (3925-3926)
```

Deleted from the scene and rebuilt as React: HTML 162-565 (about 400 lines), `recalculateLeaderboard` DOM half (3699-3727), `addKillFeedEntry` (3730-3760), `updateDetailPanelUI` (3809-3829), `initCatalogSidebar` (3883-3912), all handlers (3952-4128), and the init line (4130-4138). The rank computation (3692-3698) stays in the scene as `computeRanks()` for sandbox mode.

Narrow adapter between the imperative scene and React/Next.js. React never touches the scene graph; the scene never touches React state. The data direction is React or data layer into `arena.*` methods; the reverse direction is events.

```ts
interface Arena {
  // lifecycle
  start(): void; stop(): void; dispose(): void; resize(): void;              // dispose = full teardown (H8)
  setMode(mode: 'sandbox' | 'chain'): void;
  attachMinimap(canvas: HTMLCanvasElement | null): void;
  attachInspector(container: HTMLElement | null): void;

  // chain state in
  hydrate(coins: CoinView[]): void;                                          // instant, no animation, deterministic spawn points
  addCoin(coin: CoinView, opts?: { animate?: boolean }): void;               // E1; reuses 4124-4126 pop
  updateCoin(id: string, patch: Partial<Pick<CoinView, 'reserveQuote' | 'reserveToken' | 'wins' | 'rank' | 'level'>>): void;  // E2, E4
  removeCoin(id: string, opts?: { fx?: 'dissolve' | 'none' }): void;         // E6
  playClash(plan: ClashPlan): Promise<void>;                                 // E3/E4, resolves at the 'merged' beat
  playMerge(fx: MergeFx): Promise<void>;                                     // E5, stage-3 flows (net-new)
  setPools(pools: PoolView[]): void;                                         // vessels (net-new)
  setNpcs(npcs: NpcView[]): void; playNpcFight(f: NpcFight): Promise<void>;  // E7 (net-new)
  setStage(stage: 1 | 2 | 3 | 4): void;                                      // E8
  crown(id: string): Promise<void>;                                          // E9, Chosen One finale

  // UI state in (replaces module globals)
  select(id: string | null): void;                                           // replaces 3762
  setFilters(f: { element: string; monsterId: string; query: string; selectiveLabels: boolean; biomeMarkers: boolean }): void;  // 2650-2655
  camera: { fit(): void; zoom(dir: 1 | -1): void; panTo(x: number, z: number): void };   // 4061-4075
  setInspectorView(v: 'three_quarter' | 'front' | 'side' | 'back'): void;    // 3956-3967

  // sandbox-only (throw in chain mode)
  previewAnim(state: 'idle' | 'walk' | 'attack' | 'hit' | 'victory'): void;  // 3971-3987
  applySkin(skinId: string): void;                                           // 3990-3996

  on<K extends keyof ArenaEvents>(name: K, cb: (e: ArenaEvents[K]) => void): () => void;
}
interface ArenaEvents {
  ready: {};
  select: { id: string | null; source: 'pick' | 'api' | 'removed' };         // must also fire when the selected coin is removed (H7)
  stats: { fps: number; liveCoins: number; activeClashes: number; clashesPlayed: number };      // 2 Hz; replaces 3420, 3525, 3142, 4154
  telemetry: { id: string; state: string; hp: number; maxHp: number; x: number; z: number; biome: string; opponent: string | null };  // 10 Hz, selected coin only; replaces 3782-3807
  ranks: { ids: string[] };                                                  // sandbox mode only; in chain mode ranks come from the store
  clash: { clashId: string; phase: 'approach' | 'engage' | 'strike' | 'finisher' | 'merged' | 'done' | 'skipped'; winnerId: string; loserId: string };
  coinRemoved: { id: string };
  camera: { targetX: number; targetZ: number };                              // minimap frame (3876-3880)
  error: { code: string; message: string };
}
```

`CoinView` is `{ id: string /* token address */; ticker; name; monsterId; skinId; reserveQuote: number; reserveToken?: number; wins: number; level?: number; rank?: number }`. `ClashPlan` is `{ clashId; aId; bId; winnerId; loserId; seed: number; blockTimestamp: number; powerA?: number; powerB?: number }`. React renders leaderboard, feed, detail, filters, launch, wallet and stage banner from its own store; it calls `arena.*` for anything visual. Telemetry and stats are throttled so the 60 fps loop never drives React renders.

Hot-path DOM writes replaced by events: 3142, 3420, 3525 and 4154 become `stats`; 3788-3807 becomes `telemetry`; 3436 and 3768 become `select`; 3700 becomes the `ranks` or store path; 3731 becomes the store feed; 3668 becomes a `filterResult` count returned from `setFilters`.

Tailwind class strings live inside JS in this file (2790-2795, 3305-3356 `dotColor`, 3706-3718, 3740-3754, 3798, 3959-3961, 4002-4004, 4014-4016). Only the label markup at 2789-2796 and the biome tag (2057) must stay in the scene; the Tailwind `content` globs must include `src/arena/**`.

### 4. External dependencies and exact versions

| Dependency | As used | Resolved version | Evidence |
|---|---|---|---|
| Three.js | `https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js` (prototype:8) | r128 (npm `three@0.128.0`, published 2021-04-23); file header "Copyright 2010-2021" | cdnjs header read 2026-10-19; npm registry time field |
| OrbitControls | `https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js` (prototype:9); used as global `THREE.OrbitControls` (prototype:732) | r128 non-module build (IIFE that attaches to `THREE`) | jsdelivr, read 2026-10-19 |
| Tailwind | `https://cdn.tailwindcss.com` (prototype:7), no version pin | on 2026-10-19 the URL answers `302 location: /3.4.17`, so Tailwind 3.4.17 JIT in the browser; npm `tailwindcss` latest is 4.3.3 | curl headers and `npm view`, read 2026-10-19 |
| Google Fonts | prototype:10: Cinzel 700, 800, 900; Plus Jakarta Sans 400-800; JetBrains Mono 500, 600, 700 | n/a | the URL itself |
| Emoji glyphs | UI icons in markup and strings (many) | system font dependent | prototype:233-283 and others |

Nothing else: no physics, tween, audio, post-processing or UI library.

Three API surface actually used (prototype, 342 `THREE.` references): Scene, PerspectiveCamera, WebGLRenderer, FogExp2, HemisphereLight, AmbientLight, DirectionalLight (shadow), PointLight, Group, Mesh, Points, Line, Mesh/Points/LineBasicMaterial, MeshStandardMaterial, BufferGeometry with `setAttribute` and `setFromPoints`, BufferAttribute, Float32BufferAttribute, Box/Sphere/Cone/Cylinder/Torus/Ring/Circle/Octahedron/Dodecahedron geometries, CanvasTexture with RepeatWrapping, Color, Vector2, Vector3, MathUtils.lerp, Raycaster, ACESFilmicToneMapping, PCFSoftShadowMap, DoubleSide.

Post-r128 changes that affect this scene, per the official three.js Migration Guide (https://github.com/mrdoob/three.js/wiki/Migration-Guide, read 2026-10-19; the page was read through a fetch tool, first 100,000 of 114,284 characters, the remainder covers releases before r50; latest release named on the page is r187, npm latest is 0.186.1):

| Release | Change | Where it bites in the prototype |
|---|---|---|
| r148 | `examples/js` removed; addons are ES modules only | the OrbitControls script tag (prototype:9) and `new THREE.OrbitControls` (732) cannot work on any three newer than r147 |
| r161 | `build/three.js` and `build/three.min.js` removed | CDN `three.min.js` (prototype:8) |
| r147 | PointLight and SpotLight `decay` default becomes 2 (was 1) | 5 point lights tuned with distance 130, 120, 78 (prototype:779-797) and one in the inspector (2678) would look far darker |
| r150 / r155 | `physicallyCorrectLights` replaced by `useLegacyLights`; r155 makes non-legacy the default | every light intensity (757-797, 2673-2680) needs re-tuning |
| r152 | color management on by default; `outputEncoding` becomes `outputColorSpace` (sRGB default); `Texture.encoding` becomes `Texture.colorSpace` | all 13 canvas textures (prototype:822-829) and every hex color change appearance; albedo canvases need `colorSpace = SRGBColorSpace`; tone mapping exposure (728, 2670) re-tune |
| r155 | inline `toneMapping` applies only when rendering to screen | irrelevant now (no post-processing), relevant if bloom is added later |
| r182 | `PCFSoftShadowMap` deprecated; `PCFShadowMap` is now soft | prototype:726 |
| r125, r140 | `Geometry` removed | not used; all geometry is already `BufferGeometry` |
| r127, r130 | controls stop calling `stopPropagation` and `preventDefault` | the inspector's `e.stopPropagation()` (prototype:2714) and the canvas pointer handlers (3919-3923) should be re-tested if three is ever upgraded |

APIs the prototype uses that did not change in any listed release: `setAttribute`, `setFromPoints`, `Float32BufferAttribute`, `MathUtils.lerp`, `Raycaster`, `Color.lerp`. The Migration Guide page did not mention `setFromPoints` or `emissive` at all; I treat them as unchanged but have not tested them on a newer build.

Verified for the recommended pin: `three@0.128.0` on npm contains `build/three.min.js`, `examples/js/controls/OrbitControls.js` and `examples/jsm/controls/OrbitControls.js`; the jsm file begins with `import { ... } from 'three'` (bare specifier). `@types/three@0.128.0` exists on npm. All read 2026-10-19.

### 5. Performance facts

Entity counts (derived from prototype:1216-2043 and 2115-2626)

| Item | Count |
|---|---|
| Environment: scene nodes | 783 |
| Environment: meshes (each with its own geometry, no instancing, no merging) | 620, of which 612 unique geometries, 30 unique materials, 102 cast shadows, 176 with `transparent: true` (clouds, foam, rings) |
| Environment: triangles | about 44,500 (my estimate from primitive formulas, plus or minus 10 percent) |
| Animated env props updated per frame | 16 flames, 7 waterfalls, 8 floating rocks, 1 portal ring, 36 clouds, 2 scrolling textures, 1 crown (prototype:3360-3388) |
| Lights | 1 shadow-casting directional (2048 by 2048, PCF soft, frustum plus or minus 155, prototype:726, 763-776), hemisphere, ambient, 5 point lights (779-797) = 8 |
| Textures | 13 canvas textures (14 canvases), 256 px except terrain 512 and horn 128 (prototype:814-1214) |
| Renderers | 2 WebGL contexts: main (722) and inspector 340 by 176 (2666-2667), the inspector re-rendered inside `updateSimulation` every frame while a coin is selected (3542) |
| Pixel ratio | capped at 2 for both (724, 2668); antialias on |

Per monster (derived)

| Archetype | Nodes | Meshes | Cast shadow | Materials (not shared between monsters) | Triangles (estimate) |
|---|---|---|---|---|---|
| fire_dragon | 66 | 55 | 52 | 10 | 6,600 |
| ice_wolf | 44 | 35 | 32 | 9 | 3,900 |
| earth_golem | 35 | 27 | 24 | 8 | 2,000 |
| electric_fox | 53 | 39 | 36 | 9 | 7,800 |
| dark_spirit | 34 | 26 | 23 | 10 | 4,000 |

Every part has `castShadow = receiveShadow = true` (prototype:2083-2084). Each monster also owns a base ring, an invisible selection ring and a wireframe aura sphere that is drawn at opacity 0 (it is `visible` but transparent, prototype:2572-2607). Materials are created per monster, not shared (2156-2205), so material count scales with coins. There is no `matrixAutoUpdate = false`, no `InstancedMesh`, no geometry merging, no `frustumCulled` tuning anywhere (grep, 0 hits).

What 30 coins costs (using the prototype's own generator mix for the first 30: 7 dragon, 5 wolf, 6 golem, 6 fox, 6 spirit; prototype:2842-2845)

| Coins | Coin meshes | Environment meshes | Main-pass draw calls (no culling) | Shadow-pass casters | Draw calls per frame (upper bound) | Materials |
|---|---|---|---|---|---|---|
| 30 | 1,112 | 620 | 1,702 | 1,124 | about 2,830 | 277 |
| 60 (prototype default, 2649, 4131) | 2,204 | 620 | 2,764 | 2,126 | about 4,890 | about 556 |
| 500 (stress button, 221) | 18,220 | 620 | 18,340 | 16,822 | about 35,160 | about 4,600 |

Triangles for 30 coins: about 149,000 coin plus 44,500 environment per pass, so roughly 190,000 in the main pass and a comparable figure in the shadow pass; this is small for any GPU. The load is draw-call and state-change bound, which is what a laptop iGPU is worst at (the user's machine is a Ryzen 5 5500U per the global notes; I have not profiled it). The 30-coin mode is therefore about 58 percent of the cost of the prototype's own default and about 8 percent of the 500 case; the 500 case is unlikely to be real-time on this hardware, and no one should read it as a benchmark target. No FPS was measured in this audit. The on-screen FPS number is `min(60, frames / sum(dt))` where `dt` is clamped to 50 ms (prototype:4146, 4153), so a 10 FPS reality displays as 20.

Cheap, non-rewriting improvements if 30 coins is slower than wanted (all additive): after `buildConnectedArena`, set `matrixAutoUpdate = false` and call `updateMatrix()` on static environment nodes (the 783-node tree is otherwise re-walked every render); merge static environment meshes per material (30 materials implies about 30 draw calls instead of 620); stop `getObjectByName('centralCrown')` (prototype:3365) from walking the tree every frame (it visits 242 nodes, derived); cap pixel ratio at 1.5 on the main renderer; dispose and share materials per archetype and skin.

Per-frame allocations and DOM cost (prototype:4144-4172 and callees)

| Source | Allocation or DOM work per frame |
|---|---|
| `updateProjectedLabels` (3627) | 1 `new THREE.Vector3` (3630), 1 closure per `forEach` (3633, 3673), one template string per visible label (3665), writes `style.display` on every monster (3639, 3652, 3659, 3664) and `root.visible` on every monster (3637), 1 `textContent` write (3670) |
| `drawMinimap` (3834) | one 4-element array of 4 objects (3843-3848), closure, 1 canvas clear, arcs for every coin |
| `updateSimulation` (3359) | 6 closures for env props (3361, 3370, 3374, 3377, 3381, 3384); `getObjectByName` walk of 242 nodes (3365); 2 textContent writes (3420, 3525) |
| `animateVisualRig` (3152) per monster | up to 3 closures (`parts.legs.forEach`, 3184, 3265; others), no vector allocation |
| selected coin (3527-3544, 3782-3807) | 8 `getElementById` lookups, an object and several template strings from `getMonsterActivityDescription` (3304-3357), 6 `textContent` writes, a second full render pass |
| particles | none per frame beyond `setXYZ`; at spawn each effect allocates a `BufferGeometry`, a material, an array of velocity objects (2917, 2958, 3039, 3074) and disposes them at end (3566-3615). Each strike spawns one signature VFX, one impact burst, one DOM floater and one `setTimeout` (2888, 3410-3411) |

DOM label cost: each coin owns 7 elements (prototype:2789-2796: label, bar, fill, pill, crown, dot, text) and a `will-change: transform, opacity` layer (prototype:75). At 30 coins that is 210 elements and up to 30 compositor layers; with "Selective Ticker Labels" on, only rank 1-10, selected, combat and victory coins show (3643-3649), typically 10 to 14 visible labels, each a single transform write per frame. This is cheap at 30; it was the reason for the selective-label feature at 500.

Startup: 13 canvases drawn with thousands of `Math.random` primitives (for example 6,500 specks at 1160-1163), 620 geometries built, and a per-vertex `new THREE.Color` plus `colors.push` loop over the terrain disc (1375-1406, about 4,000 vertices); spawning 30 monsters creates about 1,100 meshes. Time was not measured.

### 6. Gap list versus the diagram (docs/download (1).png)

| Diagram element | Prototype state | Reusable pieces | Net-new work | Size |
|---|---|---|---|---|
| Stage 1: "0 / 30 coins on live map", each with its own pool | counter exists as "N / target" (prototype:198-203); default 60 (2649, 4131); scale buttons to 500 (218-221); no cap; no empty state | header counter, `syncPopulation` count plumbing | constant `MAX_COINS = 30` from chain config; "full" state; remove scale buttons | S |
| Liquidity pool vessels (one per coin, fill level, pipes) | none. The only pool-like objects are the turquoise moat (1426-1430, water material 1272-1282) and a per-coin base ring (2573-2583) | `waterMat`, `crystalGlowMat` style, ring geometry, the moat ring at radius 21.5-33.5 as a place for 30 vessel slots | vessel mesh (basin plus animated fill), 30 anchor slots, `setPools`, fill tween on `ReservesChanged`. The camera cannot look under the island (`maxPolarAngle = PI/2.35`, prototype:736), so under-board vessels as in the diagram are not visible; use the citadel moat ring or the island rim | M |
| Stage 2: PvE NPC monsters | none; all 5 archetypes are coin avatars | `createMonster3DMesh` and the rig animator can render NPCs with a palette override and a different scale | NPC entity type, spawn and behaviour, `playNpcFight`, an NPC archetype or tint, E7 wiring; NPC result is keeper-attested (PRD A4) | M |
| Stage 2: rapid clashes | exists but random and client-decided (3390-3418, 3505-3516) | strike loop, per-element VFX (2939-3025), floaters, victory and consume visuals | ChainDrivenMode (Findings 8) | M |
| Stage 3: "Auto-Buy Boosts Winner" flow | the loser dissolves into particles that fly to the winner monster (3060-3096, 3592-3616); `lp` unchanged | stream particle system, easing (3598-3600) | generalise the target from "winner monster" to a position getter so particles can end in the winner's vessel; arrow or pipe flow; amount label | M |
| Stage 3: "Value Redistributed to Losers" (many small pools) | none | same particle system | one-to-many flow into other vessels; per-holder aggregation shown as N small streams; holder snapshot comes from the indexer | M |
| Stage 4: Chosen One (crown, one large consolidated pool) | a spinning golden crystal (1486-1498, animated 3365-3369), crown light (795-797), citadel dais (1471-1483), victory dance (3228-3284), victory burst (2892-2936) | all of these | winner walks to the dais, crown attaches, camera move (the `fitToWorld` lerp pattern, 4159-4165), merged vessel scales up, end screen in React | M |
| Stage state machine (1 to 4) | none; "Spec v1.0" is a static badge (181-186) | none | `StageChanged` store, `arena.setStage`, banners, per-stage lighting; whether the stage is on-chain is open (contracts) | S to M |
| Wallet UI | none | launch modal (496-565) as the form to wire | wagmi connect button, tx status, balances; not part of the scene | M |
| Round timer | none | none | countdown from chain `endsAt` in React header | S |
| Pool and reserve numbers as display | "Simulated LP" label (325), `$12.3K` format (3716) | leaderboard rows | unit change to MON (or chosen quote), formatting from bigint | S |
| Spawn event | launch spawns a monster with a victory dance (4124-4126) | that pose and burst | reuse for `addCoin({ animate: true })` | S |

### 7. Correctness hazards a real integration would expose

| # | Hazard | Evidence | Consequence |
|---|---|---|---|
| H1 | `resolveDuel` never changes `lp`, and `lp` is never written after spawn | prototype:3123-3149; only write at 2810 | leaderboard order is static (3692 sorts on `lp`; `wins` only breaks ties); the feed shows "Sim LP" of a coin whose value did not move (3753); any visual that implies value transfer is currently a lie |
| H2 | Leaderboard and ranks are not recomputed after a loser is removed unless autoRespawn is on | removal at 3431-3443; the only `recalculateLeaderboard` call in that block is inside the respawn branch (3440-3441); `resolveDuel` recalcs at 3145 while the loser still exists | with respawn off (required for chain mode) dead coins stay in the top 8 and keep crown icons and stale `rank` values |
| H3 | Identity is random and lossy | `uid` random (2803), `tokenId` random (2804); `sanitizeTicker` strips non-alphanumerics, upper-cases, truncates to 7, falls back to `'TOKEN'` (2771-2773); respawn calls `createRandomTokenConfig(random 0..49)` (3440), which returns curated entries for indices below 12 (2839-2841) so duplicates of live tickers occur | two chain coins can render with the same label; the only safe key is the token address; the label, search (3623) and feed all key on ticker |
| H4 | Outcomes depend on `Math.random` | 78 calls; outcome-relevant: damage (3406), encounter (3505), respawn config (3440), wander (3458, 3464, 3477) | two clients, or a replay, can never agree; all cosmetic randomness needs a seeded RNG; outcome randomness must be removed |
| H5 | Combat has no approach and monsters do not move in combat | movement runs only for `idle` or `walk` (3455-3502); `startDuel` only sets facing (3111-3112); engagement requires distance below 4.5 (3510); the debug button teleports `m2` (4053-4054) | a chain-ordered clash between distant coins has no choreography to reuse; the approach phase is new code |
| H6 | `hit` and `attack` states are never entered by the simulation | set only by preview buttons (3975); `hit` has a rig pose (3218-3227) but the duel loop never sets it (3402-3417) | defenders do not flinch; and a `hit` state expires into `walk` (3447-3454), so it cannot be used as a combat overlay without a new flag |
| H7 | Selection on a removed coin is only partly handled | the consuming branch clears `selectedMonster` and hides the panel directly (3434-3437) without `selectMonster(null)`: the inspector model stays in `inspectorScene` (2726-2731), the leaderboard highlight is stale (3704), and no event reaches a UI layer | a React store would keep a stale selected id; adapter must emit `select` with `source: 'removed'` |
| H8 | No resource teardown | `scene.remove` without dispose for monsters (2869, 3432): 3 geometries (2573, 2586, 2598) and 8-10 materials per coin leak; `rebuildInspectorModel` builds a full rig per selection or skin change with no dispose (2732); `requestAnimationFrame` id never stored (4145); `window` listeners never removed (2716, 2722, 4174); two WebGL contexts never released (722, 2666); `labelsContainer` children never cleared | React Strict Mode double-mount or a route change leaks contexts (browsers cap live contexts), duplicates rAF loops, and double-fires listeners |
| H9 | Boot depends on `window.onload` | prototype:4180-4182 | in a Next.js client mount the load event has already fired, so the loop never starts |
| H10 | Viewport assumed equal to canvas | `window.innerWidth/innerHeight` in projection (3628-3629), floaters (2879-2880), picking (3925-3926), resize (4175-4177); `* { user-select: none }` (19-21) and `html, body { overflow: hidden }` (22-27) are global | labels, floaters and clicks misalign in any layout with a side rail or an iframe; global CSS breaks text selection in forms and address copy |
| H11 | Simulation time is frame time, not wall time | `dt = min(0.05, ...)` (4146); a hidden tab pauses rAF | on slow frames the world runs slower than the chain; after a background period events pile up; choreography needs a wall-clock schedule with catch-up (F8) |
| H12 | Direct state mutation from UI | preview buttons set `state` on a coin that may be in a duel (3975): setting `idle` on a `combat` coin lets it wander (3455-3502) and be paired into a second duel (3508) while the first still references it | double duel, orphaned `combat`; remove these controls in chain mode |
| H13 | Orphaned `combat` state if a participant is removed mid-duel | duel dropped at 3395-3398 but the surviving partner keeps `state = 'combat'` and a visible HP bar; no branch ever times out `combat` (3447-3517) | dead coin removal driven by chain events (for example an NPC kill while a clash animates) strands the partner forever |
| H14 | The brief's "splice while iterating" concern is benign here | loops iterate backwards (3391, 3423); respawn pushes to the end (3441); `syncPopulation` splices outside any loop (2868) | no bug today; becomes live only if chain callbacks mutate `monsters` from inside the loop, so keep removal queued to the frame boundary |
| H15 | `combatCooldown` is never reset | set only at 2825, decremented at 3426 | after the first 1.5-4.5 s every idle coin is always eligible; sandbox only |
| H16 | Hit testing is a point-to-ray distance of 2.8 around (x, 1.5, z), not a mesh raycast | 3935-3944 | large coins and overlapping coins pick the nearest to the camera; acceptable, but note it for dense 30-coin clusters during a clash |
| H17 | `animate-fade-in` is not a Tailwind default class | prototype:3740; Tailwind v3 core has no such utility | no effect today; will silently stay a no-op after the build migration |
| H18 | Leaderboard shows only the top 8 | prototype:3702 | the 30-coin arena needs all coins (or a scroll list) |
| H19 | Lossy unit handling | `lp` is a JS `Number` formatted as `$${(lp/1000).toFixed(1)}K` (3716) | chain reserves are uint256 with decimals; precision loss and wrong units unless converted at the data layer |
| H20 | Indonesian strings in the code path to be moved | prototype:394, 396, 426, 438 (markup), 3310-3348 (activity badges and narratives) | must be translated during the move (PRD A11) |
| H21 | Chain-supplied strings in `innerHTML` | ticker (sanitized) is interpolated into `innerHTML` at 2793-2795, 3711, 3745-3747; `name` is only set via `textContent` (3822) | safe today because of `sanitizeTicker`; becomes an injection path if anyone interpolates `name` or an ENS-style field |

### 8. Proposed ChainDrivenMode

Principle: the chain decides who exists, who fights, who wins and how many reserves move. The client decides only presentation: positions, strike count, damage numbers, camera, particles. "Truth first, show later": a `chain` layer (latest confirmed numbers) and a `shown` layer (what the scene and panels display); the director advances `shown` to match `chain` at choreography beats.

Invariants

1. A coin is in the scene iff the chain says it is alive (after reconcile).
2. For every clash, winner and loser are exactly the chain's; there is no code path in chain mode where `hp <= 0` or `Math.random` picks a winner.
3. Displayed reserves converge to chain reserves within a bounded lag (target at most 8 s, the length of one choreography).
4. Position is never read back into chain-relevant logic.

What to disable (existing code, before-split line numbers)

| Site | Edit |
|---|---|
| 2644-2655 | add `const mode = { chain: false }` and a `director` slot |
| 3390-3418 (duel loop) | keep the loop; make it plan-aware: attacker at 3402-3403 becomes `plan ? strike.by : turn parity`; `dmg` at 3406 becomes `plan ? strike.dmg : random`; end condition at 3413 becomes `plan ? strike.final : defender.hp <= 0`; `nextStrike += 0.45` (3401) becomes `+= plan?.dt ?? 0.45`. About 6 lines; the VFX, floaters and resolve call stay untouched |
| 3439-3442 (respawn) | add `&& !mode.chain` |
| 3505-3516 (random encounter) | add `&& !mode.chain` |
| 3447 (before the idle or walk branch) | insert an `approach` branch (below) |
| 3126, 3141-3148 inside `resolveDuel` | split: `resolveVisuals(winner, loser)` keeps 3124-3139 (states, aura, stream, burst, floater); stats, feed, leaderboard and panel (3126, 3141-3148) become either the sandbox stats function or the `merged` beat emitting to the data layer; in chain mode do not increment `wins` locally |
| 3098-3121 (`startDuel`) | take an optional `plan`, store it on the duel object at 3114-3120 |
| 2775-2836 (`spawnMonsterEntity`) | take `id`, `pos` and `seed` from the `CoinView`; no random `uid`, `tokenId`, position, heading |
| 2866-2871, 4035-4058, 3971-3996, 3999-4007 | not reachable from React in chain mode (`syncPopulation`, trigger duel, preview, skin, scale) |
| `updateSimulation` entry (before 3390) | call `director.tick(dt)` |

Choreography of a clash the chain has already resolved

Input: `ClashPlan { clashId, aId, bId, winnerId, loserId, seed }`. The director builds a plan with a seeded RNG (`mulberry32(hash(clashId, seed))`), so every client plays the same strikes.

```
planClash(plan):
  r = rng(seed)
  W = winner strikes: 3 or 4;   L = loser glancing strikes: W - 1 (loser may open: coin flip from r)
  winner damage: split 100 across W strikes (last strike carries the remainder, final = true)
  loser damage to winner: 8..20 each, total capped below 70 so the winner's bar never empties
  order: interleave, final strike always by the winner
  dt per strike = 0.45  (prototype:3401)
  -> strikes = [{ by:'w'|'l', dmg, final? }]
```

Phases and time budget (prototype constants in parentheses)

| Phase | What happens | Reuses | Duration |
|---|---|---|---|
| A. approach | both coins set `state = 'approach'`, locked (no wander), render with the `walk` rig; each moves to a stand-off point 1.9 units from a meeting point (total gap 3.8, below the 4.5 engage range at 3510); meeting point = midpoint of current client positions, clamped to `WORLD_RADIUS - 12` (3476) and pushed out of `obstacles` (3485-3497 pattern); speed = clamp(distance / 1.8 s, normal speed, 28 units per second); if distance exceeds 70, blink instead: shrink the far coin (the `consuming` scale pattern, 3286-3291), re-materialise at its stand-off | `walk` pose (3178), obstacle push-out | up to 2.0 s |
| B. engage and strike | `startDuel(a, b, plan)` (3098: facing at 3111-3112, HP bars shown); strikes at 0.35 s then every 0.45 s (3118, 3401) using `spawnSignatureAttackVFX` and `spawnFloatingText` (3410-3411) | strike loop, per-element VFX, floaters | 3 to 5 strikes, 1.3 to 2.3 s |
| C. finisher and resolve | last strike has `final = true`; `resolveVisuals`: loser `consuming` 1.05 s with the stream into the winner (3060-3096), winner `victory` 2.4 s with burst and aura (3124-3139) | all existing | 1.05 s to removal, 2.4 s to idle |
| D. merge beat | at the moment the stream lands, the director advances `shown` state: `updateCoin(winner, reserves)`, ranks, feed row, panel, and (stage 3) `playMerge` flows into vessels; emits `clash: merged` | new | about 0.5 s |

Total from event receipt to full idle is about 7 to 8 s; the loser is gone after about 5.5 s. At most K = 4 choreographies run at once (the prototype used 8 for readability, 3505); a coin appearing in a queued clash waits until its active one ends; a clash whose loser is already dead is dropped with an `error` event. If queue depth exceeds a threshold, durations are compressed (time scale up to 2.5 times); a clash older than 15 s on arrival (late tab, reconnect) is fast-forwarded: no approach, 0.3 s dissolve, immediate `merged` beat. Events are de-duplicated by `(blockNumber, logIndex)`, processed in order, and only from blocks the data layer marks safe (finality semantics are open, see questions).

If the contract has a request step (E3), the same choreography is split: approach and mutual non-lethal strikes loop (using the `combat` rig, 3200-3217) start at `ClashRequested`; the plan's final blow waits for `ClashResolved`. If the chain emits one atomic event, the whole sequence is played retroactively as above.

Reconciling client positions with a chain that has no positions

- Authority table. Chain-authoritative: existence, identity, reserves, wins, level, clash outcomes, stage. Client-owned and non-authoritative: x, z, heading, state, hp, strike count, damage numbers, camera.
- Spawn anchor: position is a pure function of the token address: `seed = hash(address)`; angle and radius drawn from the coin's home biome (element to biome: ice north, dark east, lava south, forest west, earth in the forest or the ring, prototype:690-695, 697-707) and run through the `obstacles` check (the logic of 2752-2769 with a seeded RNG). Every client, every reload, and every screenshot shows the same spawn layout.
- After spawn, roaming is local and cosmetic (existing wander, 3455-3517 minus the encounter step). Clients diverge slightly; that is acceptable for a spectator view and removes any need to sync positions. Stretch option if identical positions across screens are needed for the pitch: make roaming a pure function `position(address, floor(blockTimestamp / slotSeconds), t)` along seeded waypoints so clients agree to within clock skew; this replaces about 60 lines (3455-3502) and is not needed for v1.
- Clash positions are re-derived locally every time (the meet-in-the-middle above); the loser dissolves where it stands, the winner stays and resumes wandering.
- Hydrate on load: `arena.hydrate(coins)` places alive coins at anchors with no animation and no replay of past clashes; history is shown only in the feed, backfilled by the indexer. Missed events while in the background reconcile by diffing alive sets and applying fast-forwarded removals; a coin the chain says is alive but the scene lacks is spawned with a short fade (a "resurrect" is only needed if a reorg undid an elimination, which is why animating only safe blocks matters).
- Reserves never come from the scene; the scene only receives numbers to show.

Implementation size (assumption, not measured): about 10 line-level edits to existing functions, one new `director.js` (queue, plan, approach steering, fast-forward; about 250 to 350 lines) and one `rng.js` (about 20 lines), plus the adapter.

## Recommendations

Priority order for the integration; effort is S (under half a day), M (about a day), L (multi-day), all assumptions.

1. (S) Freeze the scene: do not rewrite any of prototype:577-3618 beyond the edits listed above. Pin `three@0.128.0` and `@types/three@0.128.0`; do not upgrade three before the demo (r147, r152, r155, r182 each change lighting, color or shadows of this scene).
2. (M) Create `src/arena/` with the module split in Findings 3: move catalog, world, textures, environment, monster factory, rig and VFX first (they need only imports and exports); then core, entity and sim. Import `OrbitControls` from `three/examples/jsm/controls/OrbitControls.js` and use `import * as THREE from 'three'` so the 342 `THREE.` references need no edits.
3. (M) Build the adapter (`createArena`, the interface in Findings 3) and make `dispose()` complete before anything else is wired; test it under React Strict Mode (double mount) and a route change. Replace the 27 sim-path `getElementById` calls with the `stats`, `telemetry` and `select` events; throttle them (2 Hz and 10 Hz).
4. (S) Replace `window.innerWidth/innerHeight` (10 lines) and `window.onload` (4180) with container size and `start()`; scope `user-select` and `overflow` to the arena wrapper.
5. (M) Implement ChainDrivenMode: guards, plan-aware duel loop, `approach` branch, `resolveVisuals` split, seeded RNG, `director.js`. Develop it first against a fake event source (a script that emits E1 and E4 on a timer) so the scene work does not wait for contracts.
6. (S) Delete or gate sandbox features in chain mode: scale buttons, trigger duel, anim preview, skin switch, autoRespawn, random token generator. Keep sandbox mode behind a `?sandbox=1` flag for the 3D developer.
7. (M) Net-new visuals in this order: pool vessels with fill (they give the merger something to flow into), merger flow particles (generalise the consumption stream target), Chosen One finale (crown, dais, camera), NPC monsters last (PvE is the weakest-defined requirement, PRD A4).
8. (S) Fix leaderboard and feed semantics in React: rank by reserves with address tie-break, all 30 coins, units in the quote asset, feed rows with tx links and block times; key everything on token address (H3, H19).
9. (S) Add `disposeMonsterVisual` and call it from removal and inspector rebuild (H8).
10. (optional, M) If frame rate on the demo machine is below target at 30 coins: freeze static matrices, merge static environment meshes, cache the crown lookup, cap pixel ratio at 1.5, share materials per archetype and skin.
11. (S) Translate the Indonesian strings (H20) and drop the `animate-fade-in` dead class (H17); include `src/arena/**` in Tailwind `content`.

## Implications per role

**smart-contracts**
- The scene needs, per coin: token address, symbol, name, `monsterId` and `skinId` (uint8, matching the 5 and 5 values in prototype:578-668), quote reserve and optionally token reserve, wins, alive flag. Emit enough in events that the client never needs a view call per coin per frame (E1, E2).
- The clash event must carry winner and loser explicitly and a 32-bit-usable seed (so every client plays identical strikes); post-merge reserves for the winner and the amounts moved in the same transaction or a linked event (E4, E5). If outcomes are request-then-resolve, emit a request event too: it lets the client start the approach and anticipation loop early and hides randomness latency.
- Arena cap of 30 and the stage or round state should be readable (`maxCoins`, `stage`, `endsAt`); decide whether the stage is on-chain or inferred (open question).
- Deterministic tie-breaks matter for the leaderboard: expose nothing that makes the client sort differently from the contract; use address as the final tie-break.
- NPC (PvE) results must be an event too (E7) and say who attests them.
- Do not rely on the client for anything: the prototype's `lp`, `wins` and `rank` were all client-owned and must now be purely display.

**frontend / 3D integration**
- The scene is portable: about 2,700 script lines move with import and export edits; the panels (about 800 lines of DOM glue and 400 lines of markup) are rewritten in React. The seam is the `Arena` interface in Findings 3; React never touches the scene graph.
- First tasks: module split, `dispose()`, Strict Mode test, container-relative projection, `OrbitControls` import. These are the hazards (H8, H9, H10) that make the prototype crash or misbehave in Next.js, not cosmetic ones.
- Keep the 60 fps loop out of React: stats at 2 Hz, telemetry at 10 Hz, no per-frame state.
- Pin three at 0.128.0; if anyone proposes upgrading, show the Migration Guide table in Findings 4.
- Tailwind: the Play CDN currently serves 3.4.17; a build must scan class strings embedded in JS (Findings 3).
- ChainDrivenMode edits are small and listed by line; the director is new code that should have its own unit tests (plan generation is pure given a seed).

**indexer + keeper (backend)**
- Provide the client with a normalised, ordered, de-duplicated event stream keyed by `(blockNumber, logIndex)` plus a snapshot endpoint (alive coins with reserves, wins) and recent history (for the feed after reload). The client treats the stream as the only input to the scene; the keeper never talks to the scene.
- Mark each event with a confirmation level; the client animates only events the backend marks safe, and the reorg policy (what to do if an eliminated coin comes back) must be decided by this role with the contracts role.
- Event volume is low relative to the render budget: one clash is about 6 to 8 s of animation, so more than about 40 resolved clashes per minute cannot be played in real time and will be compressed or fast-forwarded by the client (Findings 8); the keeper's clash cadence should be tuned to what the scene can show (for example one clash every 3 to 6 s with up to 4 concurrent), otherwise the pitch will show compression artefacts.
- Supply token metadata strings already sanitised and length-limited; the prototype truncates tickers to 7 alphanumerics (prototype:2771-2773), so the indexer should also supply a display ticker and keep the address as identity.

**product / demo / pitch**
- What the prototype can honestly show today is the scene, the inspector and combat visuals; it cannot show value moving (H1). The pitch moment that matches the diagram (merger and Chosen One) needs the net-new visuals in Recommendation 7, so schedule them before polish.
- A 30-coin arena is lighter than the prototype's own default of 60 (about 58 percent of the draw calls), so the demo is not constrained by the 3D benchmark; the 500-coin button should not be part of the story.
- "Truth first, show later": numbers on the leaderboard move at the merge beat, 5 to 8 s after the transaction. Say so in the demo ("visuals replay confirmed on-chain results") and show the tx link in the feed, otherwise judges comparing the explorer to the screen will see a lag.
- Positions are not on-chain by design; say so explicitly. Spawn locations are derived from the token address, so the same coin always appears in the same place.
- Keep sandbox mode available for rehearsals and as a fallback if RPC fails during the live demo (a recorded event script replayed through the same director).

## Assumptions and open questions

Assumptions (uncited or derived, not verified in a running browser)

1. Draw-call, mesh and triangle counts come from a stub harness and primitive triangle formulas that are my approximations; they are good for ratios (30 vs 60 vs 500 coins) and not for absolute frame time. No frame time or memory was measured in a real browser, and I did not profile the user's iGPU.
2. The proposed events E1 to E9, `ClashPlan` fields, and the 6 to 8 s choreography budget are design proposals; the contracts and indexer tracks may change them.
3. Effort sizes (S, M, L) are estimates.
4. The Migration Guide was read through a fetch tool that summarises the page; I did not read the raw text of every entry. The release numbers cited agree with each other and with the npm release dates I checked (0.128.0 on 2021-04-23, 0.152.0 on 2023-04-27, 0.155.0 on 2023-07-27, 0.163.0 on 2024-03-29, 0.180.0 on 2025-09-03; latest 0.186.1), but the exact wording of each change should be re-checked before an upgrade is attempted.
5. Whether `three/examples/jsm/controls/OrbitControls.js` from 0.128.0 resolves under the chosen bundler (Next.js with Turbopack or webpack, or Vite) was not tested; only the file's existence and its bare `three` import were verified.
6. The claim that browsers cap live WebGL contexts (H8) is general knowledge, not cited here.
7. Monad finality and reorg behaviour (relevant to "animate only safe blocks") is not covered here; it belongs to the tech-stack and domain tracks.

Open questions

1. Is the contract request-then-resolve (E3 exists) or atomic (single E4)? This decides whether the client can start anticipation early.
2. Is the stage (1 to 4) an on-chain value or inferred from live coin count and remaining NPCs? Who attests PvE results?
3. Does the demo need identical positions across screens (then use the deterministic roaming stretch option) or is a per-client layout fine?
4. Quote asset and display units for reserves (MON or a test stablecoin), and the decimals handling policy (H19).
5. Where do pool vessels live in 3D given the camera cannot go below the island (prototype:736): moat ring, rim, or a React side rail? This needs a design decision (design-system track).
6. Is sandbox mode (random simulation) to remain as a shipped fallback, or removed from the production bundle?
7. Should `wins`, `level` and NPC kills be shown on the coin label in the scene or only in the React panels?

## Sources

Repository files (read in full on 2026-10-19)
- `/home/cn/Projects/Competition/Web3/ANIMAL/monster_arena_3d_prototype (1).html` (lines 1-4185; script 567-4183 read completely; counts by grep and awk)
- `/home/cn/Projects/Competition/Web3/ANIMAL/docs/research/00-brief.md`
- `/home/cn/Projects/Competition/Web3/ANIMAL/docs/research/prd-inferred.md`
- `/home/cn/Projects/Competition/Web3/ANIMAL/docs/download (1).png` (viewed)

Local measurement (not in repo): a stub-harness execution of prototype lines 568-4182 counting constructor calls for scene nodes, meshes, materials and geometries; run 2026-10-19. Numbers marked "derived" come from it.

External (all read 2026-10-19)
- three.js Migration Guide: https://github.com/mrdoob/three.js/wiki/Migration-Guide (first 100,000 of 114,284 characters, via fetch tool; names r187 as newest)
- npm registry (`npm view`): `three` 0.186.1, `three@0.128.0` published 2021-04-23, release dates for 0.152.0, 0.155.0, 0.163.0, 0.180.0; `@types/three@0.128.0` exists, `@types/three` latest 0.186.0; `next` 16.4.2, `react` 19.3.1, `tailwindcss` 4.3.3, `wagmi` 3.7.7, `viem` 2.57.7, `@react-three/fiber` 9.8.2 (the last four for context only; the tech-stack track owns them)
- jsdelivr package listing and source: https://data.jsdelivr.com/v1/packages/npm/three@0.128.0?structure=flat ; https://cdn.jsdelivr.net/npm/three@0.128.0/examples/jsm/controls/OrbitControls.js (imports from bare `three`) ; https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js (IIFE build)
- Tailwind Play CDN redirect: `curl -I https://cdn.tailwindcss.com` returned `302 location: /3.4.17`
- cdnjs three r128: https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js (header "Copyright 2010-2021")
