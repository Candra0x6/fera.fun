# Inferred PRD — Monster Arena on Monad

> PM note (2026-10-19, revision 2): superseded where it differs from `05-synthesis.md` revision 2 (user decisions of record). In particular A3 (cap 30 stays as `maxCoins`), A5 and A7 (money model and merger split now follow the brainstorm plan: virtual curve, 50/30/15/5), A6 (epoch lock, Entropy, no keeper-picked pairs) and A2 (no competition; testnet only).

There is no PRD file. This document is the PM's reading of two sources: the architecture diagram (`docs/download (1).png`) and the single-file 3D prototype (`monster_arena_3d_prototype (1).html`, "Spec v1.0"). `docs/arch.md` is empty at the time of writing. Everything below is an assumption to be confirmed at the approval gate, never a requirement the user has stated.

## Product in one paragraph

A real-time, on-chain battle royale for tokens. Each participating coin is represented as a 3D monster in a shared arena. Every coin has its own liquidity pool. Coins roam, fight monsters (PvE) and each other (rapid clashes). When a coin loses a clash, its liquidity merges into the winner: an automatic buy boosts the winner's pool and part of the value is redistributed to the losing side's holders. The last coin standing is "The Chosen One". The 3D scene is the product's face; the chain is the source of truth for coins, pools, outcomes and rank.

## The four stages (from the diagram)

1. **Arena Spawn** — "0 / 30 coins on live map", each coin with its own liquidity pool.
2. **PvE Leveling** — coins "defeat monsters & rapid clashes"; pools visibly grow or shrink.
3. **Liquidity Merger** — a losing coin's liquidity merges. Two flows: "Auto-Buy Boosts Winner" (the loser's liquidity is used to buy the winner token) and "Value Redistributed to Losers" (loser-side holders receive value, shown flowing to many small pools).
4. **The Chosen One** — last coin standing, crowned, with one large consolidated pool.

## What the prototype already gives us

- Three.js r128 scene: circular island, radius 135 (`WORLD_RADIUS`), 4 biomes (Ice N, Dark E, Lava S, Forest W) plus a central ruin with a crown.
- 5 monster archetypes (`MONSTER_CATALOG`): fire_dragon, ice_wolf, earth_golem, electric_fox, dark_spirit; 5 skins (`SKIN_MODIFIERS`).
- Simulated tokens (`INITIAL_TOKENS`, 12 curated, the rest random) with a simulated `lp` in USD.
- Combat is purely client-side random: `startDuel`, 18-40 damage per 0.45 s strike, `resolveDuel` -> consumption particle stream. No LP value actually moves in the prototype (`resolveDuel` never edits `lp`).
- UI: leaderboard (sorted by `lp`), kill/consumption feed, 3D inspector, minimap, filters, "Launch Token Monster" modal producing a "sanitized identity mapping payload".
- Scale test buttons: 60 / 200 / 350 / 500 entities.

## Assumptions

| # | Assumption | Why | Risk if wrong |
|---|---|---|---|
| A1 | Target chain is Monad (EVM L1). Chain id, RPC, explorer verified from official docs by research. | User instruction. | Low. |
| A2 | The deliverable is a competition demo, judged on a live walk-through, not a mainnet launch. Testnet is acceptable. | "for a competition". | Medium: if mainnet is required, risk and cost change. |
| A3 | The diagram's cap of **30 coins** is the real arena size for the demo; the prototype's 60 default and 500 scale test are visual benchmarks only. | Diagram stage 1 vs prototype `targetPopulation = 60`. | Low; handled by a config constant. |
| A4 | The diagram's PvE "monsters" are **NPC enemies**, distinct from coin-monsters. The prototype has no NPC enemies, so PvE needs a small new visual + an on-chain (or keeper-attested) result. | Diagram stage 2 vs prototype. | Medium. |
| A5 | "Coin" = a real ERC-20 with its own AMM/bonding-curve pool deployed on Monad testnet, created by a factory. Pool value is measured in a quote asset (MON or a test stablecoin). | Diagram "each with its own liquidity pool". | High: shapes the whole contract design. |
| A6 | Combat outcomes must not be client-decided. A keeper/oracle service resolves clashes using verifiable randomness plus stats derived from on-chain state (pool size, level, element), then calls the contract. The 3D client only replays what the chain emitted. | Trust and demo credibility. | Medium. |
| A7 | "Auto-Buy Boosts Winner" = the arena contract takes a defined share of the loser's pool reserves, swaps it into the winner token, and adds it to the winner pool. "Value Redistributed to Losers" = a defined share goes pro-rata to holders of the losing coin. Exact split is a parameter (suggested start 70 / 20 / 10 incl. protocol). | Diagram stage 3 wording. | High: needs a decision from the user; see open questions. |
| A8 | A "spectator" can watch with no wallet. Wallet connect is needed only to launch a coin or buy/sell. | Demo friction. | Low. |
| A9 | The prototype's 3D scene is kept verbatim and wired to the chain through a thin data adapter; the scene is not rewritten. | User instruction. | Low. |
| A10 | The 5 monster archetypes map to 5 elements; the on-chain coin stores `monsterId` and `skinId` (uint8), not art. | Prototype launch modal payload. | Low. |
| A11 | English is the product and code language. The prototype contains some Indonesian UI strings ("Aktivitas Saat Ini", "Lokasi & Lawan", "Uji Animasi"); they are translated at integration. | Standing rule. | Low. |
| A12 | No fiat, no KYC, no custody. Funds are testnet assets. | Competition scope. | Low. |

## Open questions for the user (surfaced at the gate)

1. Which competition and track is this for (sponsor requirements, deadline, required integrations)? Research will try to find it; the user confirms.
2. Testnet only, or mainnet for the demo?
3. Is a real on-chain DEX/AMM pool per coin required, or is an arena-owned bonding-curve / constant-product pool per coin acceptable?
4. Confirm the merger split (A7) and that the demo uses a fixed cap of 30 coins.
5. Is brainstorm output (`docs/brainstorm/*`, `docs/arch.md`) authoritative where it differs from this document?
