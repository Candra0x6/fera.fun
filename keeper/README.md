# keeper

One Node process for the NEAR testnet arena: the epoch keeper (`start_round`, `lock_epoch`, `resolve_epoch`, `abort_round`) and the read relay (`/snapshot`, `/events`, `/stream`). It has no discretion over outcomes: every call takes public arguments and panics with `ArenaError:<Name>` if someone else already made it, which the keeper treats as a skipped call.

Drip, house coins and the demo admin API are being ported (B4, B5): `POST /drip` answers 503 until then and the demo routes are not mounted. The previous Monad adapter, drip, demo and house modules stay on disk, excluded from `tsconfig.json` and `vitest.config.ts`.

## Environment

Names only, in the repo root `.env.example`. Keys are supplied as environment variables and are never logged (the logger scrubs every configured secret and any `ed25519:` secret key).

| Name | Needed by | Notes |
|---|---|---|
| `NEAR_NETWORK` | all | `testnet` only |
| `NEAR_RPC_URLS` | all | comma list, default `https://test.rpc.fastnear.com,https://rpc.testnet.fastnear.com,https://rpc.testnet.near.org` (failover in that order) |
| `ARENA_ACCOUNT_ID` | all | falls back to `arena` in `deployments/near-testnet.json`, then `fera-arena.testnet` |
| `KEEPER_ACCOUNT_ID`, `KEEPER_PRIVATE_KEY` | `start` | default account `fera-keeper.testnet`; key is `ed25519:...` |
| `DRIP_ACCOUNT_ID`, `DRIP_PRIVATE_KEY` | drip (B4) | default `fera-drip.testnet` |
| `SEEDER_ACCOUNT_ID`, `SEEDER_PRIVATE_KEY`, `HOUSE_SEED` | house coins (B5) | default `fera-seeder.testnet`; the seed derives the house keys |
| `HELPER_URL`, `DRIP_AMOUNT_NEAR` | drip (B4) | defaults `https://helper.nearprotocol.com`, 2 |
| `ALLOWED_ORIGIN`, `PORT` | `start` | CORS allows only `ALLOWED_ORIGIN`; `PORT` defaults to 8787 |
| `ROUND_ID` | `start` | optional; unset, the keeper follows `current_round_id` and re-binds the relay when it changes |
| `CLASH_MAX_PER_RESOLVE`, `DEMO_FAST` | `start` | defaults 255, off |
| `DEMO_ADMIN_TOKEN`, `LOBBY_SECONDS` | demo routes (B5) | lobby length of demo-created rounds, default 10800 |

## Commands

```bash
pnpm --filter keeper start       # keeper loop, /healthz, relay
pnpm --filter keeper typecheck && pnpm --filter keeper lint && pnpm --filter keeper test
pnpm --filter keeper exec tsx scripts/near-fund.ts balances
```

## Design notes

- `src/nearPort.ts` implements `ArenaPort` over a narrow `NearTransport`; `src/nearTransport.ts` is the only file that imports `near-api-js` (failover provider, one signing account, `EXECUTED_OPTIMISTIC`, reads at optimistic finality).
- Gas starts at 30 Tgas (`start_round`, `lock_epoch`, `abort_round`) and 100 Tgas (`resolve_epoch`).
- The loop sends `resolve_epoch` once the head height reaches `lockHeight + minSeedBlocks`, one transaction in flight, and logs `secondsLockToResolved` per epoch (an error with `alert: true` above 90 s).
- The relay hub wraps the feed from `createNearFeed` in `@animal/shared`; `blockId` is `String(height)` and `txHash` is empty.
