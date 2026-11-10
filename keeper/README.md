# keeper

One Node process for the NEAR testnet arena: the epoch keeper (`start_round`, `lock_epoch`, `resolve_epoch`, `abort_round`) and the read relay (`/snapshot`, `/events`, `/stream`). It has no discretion over outcomes: every call takes public arguments and panics with `ArenaError:<Name>` if someone else already made it, which the keeper treats as a skipped call.

`POST /drip` (needs `DRIP_PRIVATE_KEY`) and the demo admin routes (need `DEMO_ADMIN_TOKEN` and `SEEDER_PRIVATE_KEY`) are mounted only when their secrets are set. Only `src/viemPort.ts`, `src/clients.ts`, three Monad scripts and their test stay on disk, excluded from `tsconfig.json` and `vitest.config.ts`.

## Environment

Names only, in the repo root `.env.example`. Keys are supplied as environment variables and are never logged (the logger scrubs every configured secret and any `ed25519:` secret key).

| Name | Needed by | Notes |
|---|---|---|
| `NEAR_NETWORK` | all | `testnet` only |
| `NEAR_RPC_URLS` | all | comma list, default `https://test.rpc.fastnear.com,https://rpc.testnet.fastnear.com,https://near-testnet.drpc.org,https://rpc.testnet.near.org` (reads skip an endpoint for 20 s after it answers 429) |
| `ARENA_ACCOUNT_ID` | all | falls back to `arena` in `deployments/near-testnet.json`, then `fera-arena.testnet` |
| `KEEPER_ACCOUNT_ID`, `KEEPER_PRIVATE_KEY` | `start` | default account `fera-keeper.testnet`; key is `ed25519:...` |
| `DRIP_ACCOUNT_ID`, `DRIP_PRIVATE_KEY` | drip | default `fera-drip.testnet` |
| `SEEDER_ACCOUNT_ID`, `SEEDER_PRIVATE_KEY`, `HOUSE_SEED` | demo routes | default `fera-seeder.testnet`; the seed derives the keys of `h1..h5.<seeder>`, which launch the house coins |
| `HELPER_URL`, `DRIP_AMOUNT_NEAR` | drip | defaults `https://helper.nearprotocol.com`, 2 |
| `ALLOWED_ORIGIN`, `PORT` | `start` | CORS allows only `ALLOWED_ORIGIN`; `PORT` defaults to 8787 |
| `ROUND_ID` | `start` | optional; unset, the keeper follows `current_round_id` and re-binds the relay when it changes |
| `CLASH_MAX_PER_RESOLVE`, `DEMO_FAST` | `start` | defaults 255, off |
| `DEMO_ADMIN_TOKEN`, `HOUSE_GAS_BUFFER` | demo routes | header `x-demo-token`; NEAR kept in each house account on top of the 0.2 NEAR launch deposit, default 0.1 |

## Commands

```bash
pnpm --filter keeper start       # keeper loop, /healthz, relay, drip, demo routes
bash scripts/near-keeper.sh      # same, with keys read from ~/.config/animal-near (never printed)
pnpm --filter keeper typecheck && pnpm --filter keeper lint && pnpm --filter keeper test
pnpm --filter keeper exec tsx scripts/near-fund.ts balances
```

## Design notes

- `src/nearPort.ts` implements `ArenaPort` over a narrow `NearTransport`; `src/nearTransport.ts` is the only file that imports `near-api-js` (failover provider, one signing account, `EXECUTED_OPTIMISTIC`, reads at optimistic finality).
- Gas starts at 30 Tgas (`start_round`, `lock_epoch`, `abort_round`) and 100 Tgas (`resolve_epoch`).
- The loop sends `resolve_epoch` once the head height reaches `lockHeight + minSeedBlocks`, one transaction in flight, and logs `secondsLockToResolved` per epoch (an error with `alert: true` above 90 s).
- The relay hub wraps the feed from `createNearFeed` in `@animal/shared`; `blockId` is `String(height)` and `txHash` is empty.
- `/drip`: a fresh key first tries the helper (`fera-<10 hex>.testnet`, 10 NEAR, no treasury spend); when the helper refuses or is rate limited it is paused for 5 minutes and the drip account creates `<10 hex>.<drip account>` with that key and `DRIP_AMOUNT_NEAR`. The same key returns the same account; a balance below 1 NEAR is topped up at most once per hour; the drip account never goes below 3 NEAR.
- `/demo/*`: `create-round` calls `create_round` from the seeder; `seed-house` creates or tops up `h1..h5.<seeder>` and launches one coin from each. A house coin is recognisable by a creator ending in `.fera-seeder.testnet`.
- Polling is paced from the contract state (next lock, seed block, lobby every 2 s) because the public RPC endpoints answer 429 under steady load.
