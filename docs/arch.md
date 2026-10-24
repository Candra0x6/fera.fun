# Monster Arena on Monad: architecture (summary)

Status: **draft, decisions unconfirmed** (2026-10-19). This page is a short map. The full plan, the options that were
rejected, the threat model, the epics and the ready-to-paste builder prompts are in:

- Plan: [brainstorm/2026-10-19-monad-monster-arena-onchain.md](./brainstorm/2026-10-19-monad-monster-arena-onchain.md)
- Diagrams (flowcharts, sequences, ER, state machines, scaling checklist, failure modes): [brainstorm/2026-10-19-monad-monster-arena-onchain/architecture.md](./brainstorm/2026-10-19-monad-monster-arena-onchain/architecture.md)
- Research with sources (R1-R44): [brainstorm/2026-10-19-monad-monster-arena-onchain/research.md](./brainstorm/2026-10-19-monad-monster-arena-onchain/research.md)

## What the product is

A battle royale of up to 30 coins. Each coin has its own bonding-curve pool. Coins level up by beating monsters (PvE) and
fight each other in clashes. The coin that loses a clash is eliminated and its liquidity merges: part auto-buys the
winner's coin (price boost), part is redistributed, part feeds the prize pot. The last coin standing is the Chosen One and
its holders redeem the big pool. The 3D prototype (`monster_arena_3d_prototype (1).html`) stays as the frontend and is
driven by chain events instead of its own simulation.

## The four stages mapped to contracts

| Diagram stage | Onchain | Offchain |
|---|---|---|
| 1. Arena Spawn (0/30 coins) | `launchCoin` in the Lobby: ERC-20 clone plus its own virtual-reserve curve, permanent creator seed; `startRound` at 30 coins or the deadline | Deterministic spawn positions from `hash(roundId, coinId)`; house-seeded coins labelled |
| 2. PvE Leveling and rapid clashes | Epoch cycle: `lockEpoch` (all coins stop trading, Entropy seed requested), `resolveEpoch` (pair from seed, roll clashes, run hunts, XP and level) | The wild monsters, walking, strikes and HP bars are a deterministic replay of the events |
| 3. Liquidity Merger | Loser reserve split in basis points (default 50 % boost, 30 % consolation, 15 % prize pot, 5 % treasury); boost = virtual buy-and-burn on the winner's curve | Particle stream and boost aura (existing prototype functions) |
| 4. The Chosen One | `RoundSettled`: winner coin is redeem-only at `(rMon + pot) / supply` | Crown, camera, redeem panel |

## Fairness in one paragraph

Odds are public and frozen before randomness exists (`power = base x level x element x pool factor`, win probability
clamped to 15-85 %). The random seed comes from Pyth Entropy, requested only after every alive coin is locked, and pairing
plus the roll are computed from that seed inside one transaction, so nobody can know or act on a result while any coin
can still trade. No `prevrandao`, no `blockhash` for value. Monad has no global mempool and leader-ordered blocks, so the
design does not depend on hiding transactions.

## Components

`contracts/` (Foundry: `Arena`, `MonsterCoin`, `CurveMath`, `CombatMath`, seed adapters), `keeper/` (epoch loop, faucet
drip, optional feed relay), `web/` (the extracted prototype scene plus `ChainFeed`, `ArenaStore`, `ArenaBridge` and
trade/claim panels), `shared/catalog.json` (monster, skin and element ids), `sim/` (economy simulator, an acceptance gate).

## Network

Monad testnet 10143 (play-money) for the hackathon; mainnet 143 only after the mainnet gate in the plan (randomness
commit-reveal, external review, legal check). RPC `https://testnet-rpc.monad.xyz`, explorer
`https://testnet.monadvision.com`, 300 ms blocks, about 600 ms finality, Entropy testnet address
`0x825c0390f379C631f3Cf11A82a37D20BddF93c07` (not the one in Monad's docs).

## Open decisions

See the plan's Open questions Q0-Q13. The ones that change the build most: which hackathon and timebox (Q0), what
"Value Redistributed to Losers" means (Q1), testnet versus mainnet (Q2), Entropy versus a keeper seed (Q3), and which of the
two contract plans to follow (Q13: this plan versus the per-clash, blockhash-seeded scaffold in `docs/handoffs/`).
