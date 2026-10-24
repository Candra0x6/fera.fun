# keeper

One Node process: the epoch keeper (`startRound`, `lockEpoch`, `resolveEpoch`, `cancelEpoch` watchdog, `abortRound`), the testnet drip faucet, an optional SSE relay, and the house-coin seeding scripts. It has no discretion over outcomes: every call takes public arguments and reverts on a state guard if someone else already made it.

## Environment

Names only, in the repo root `.env.example`. Keys are supplied by you as environment variables and are never logged (the logger scrubs every configured key and mnemonic).

| Name | Needed by | Notes |
|---|---|---|
| `RPC_HTTP_URL`, `RPC_WS_URL` | all | default to the public Monad testnet endpoints |
| `ARENA_ADDRESS`, `ROUND_ID`, `DEPLOY_BLOCK` | all | `ARENA_ADDRESS` falls back to `deployments/<chainId>.json`; `ROUND_ID` is optional: unset, the keeper (loop, feed, relay) follows `currentRoundId()` and re-binds when it changes |
| `KEEPER_PRIVATE_KEY` | `start`, `force-start` | funded EOA, about 25 MON on testnet |
| `DRIP_PRIVATE_KEY` | `start` | optional; without it `POST /drip` answers 503 |
| `SEEDER_PRIVATE_KEY`, `HOUSE_MNEMONIC` | `seed-house`, `deliver-mock-seed` | the mnemonic is optional; without it the house wallets are ephemeral and in memory only |
| `ALLOWED_ORIGIN`, `PORT` | `start` | CORS allows only `ALLOWED_ORIGIN`; `PORT` defaults to 8787 |
| `CLASH_MAX_PER_RESOLVE`, `DEMO_FAST`, `DRIP_AMOUNT_MON` | `start` | defaults 255, off, 5 |
| `DEMO_ADMIN_TOKEN`, `DEMO_CREATE_KEY`, `OWNER_PRIVATE_KEY` | `start` | the demo admin API is mounted only when the token is set; `DEMO_CREATE_KEY=seeder\|keeper` (default `seeder`, falls back to the keeper key without a seeder key) picks the key that signs the permissionless `createDefaultRound`; `OWNER_PRIVATE_KEY` is optional and unused by the keeper |
| `LOBBY_SECONDS`, `HOUSE_GAS_BUFFER` | `start`, `seed-house` | lobby length of demo-created rounds (default 3600), MON gas buffer per house wallet (default 0.5) |

## Commands

```bash
pnpm --filter keeper start               # keeper loop, /healthz, /drip, relay
pnpm --filter keeper seed-house          # launch the 12 house coins, write shared/house-coins.json
pnpm --filter keeper force-start         # startRound as soon as the contract allows it
pnpm --filter keeper deliver-mock-seed   # local rehearsal only, delivers MockSeedSource seeds
pnpm --filter keeper typecheck && pnpm --filter keeper lint && pnpm --filter keeper test
```

## Local rehearsal on anvil

Public dev accounts only; nothing here touches a real network. One command runs everything (anvil with `--network monad`, `DeployLocal.s.sol` with `MockSeedSource`, `seed-house`, `deliver-mock-seed`, the keeper in `DEMO_FAST`, and a `/healthz` poll until the second epoch):

```bash
bash keeper/scripts/rehearse-local.sh
```

The script reads the dev keys from anvil's own startup output (none are stored in the repo), restores `shared/house-coins.json` on exit, and leaves its logs in a temp directory it prints. The demo preset has a 120 s lobby, so two epochs take about three minutes (`REHEARSAL_TIMEOUT_SECONDS` raises the poll limit).

By hand, in separate shells: `anvil --network monad --port 8545 --accounts 40 --block-time 1`; then in `contracts/`: `forge script script/DeployLocal.s.sol --rpc-url http://127.0.0.1:8545 --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (it funds the reserve floor and writes `deployments/31337.json`); anvil has no Multicall3, so copy it first: `cast rpc anvil_setCode 0xcA11bde05977b3631167028862bE2a173976CA11 "$(cast code 0xcA11bde05977b3631167028862bE2a173976CA11 --rpc-url https://testnet-rpc.monad.xyz)"`; then export `RPC_HTTP_URL=http://127.0.0.1:8545`, `RPC_WS_URL=ws://127.0.0.1:8545` and one anvil key each for `KEEPER_PRIVATE_KEY`, `DRIP_PRIVATE_KEY`, `SEEDER_PRIVATE_KEY`, and run `seed-house`, `deliver-mock-seed &`, `start`.

`seed-house` tops the treasury up to the reserve floor with `fundTreasury` before the first `launchCoin`. The keeper starts the round only when `treasury >= reserveFloor + plannedEpochs * maxEntropyFee`, aborts an underfilled lobby after `lobbySeconds`, and passes the gas limits of `contracts/GAS.md` (resolve in one call, `CLASH_MAX_PER_RESOLVE` defaults to 255).

Liveness does not depend on the keeper: stop it mid-epoch and finish the epoch by hand, then restart it (it reads chain state and never double-locks).

```bash
cast send $ARENA_ADDRESS 'resolveEpoch(uint64,uint8)' $ROUND_ID 255 --rpc-url $RPC_HTTP_URL --private-key $ANVIL_DEV_KEY
```

## API

| Route | Behaviour |
|---|---|
| `GET /healthz` | `{ ok, headBlock, lagSeconds, keeperAddress, roundId, round: { phase, epoch, locked } }`, 503 when the feed has no snapshot or lags more than 5 s |
| `POST /drip` | body `{ address }`, answers `{ txHash, amount }`, 400 on a bad address, 429 `{ error: 'rate_limited', retryAfterSeconds }` per address (1 per hour) and per IP (10 per hour), 503 below the balance floor |
| `GET /snapshot`, `GET /events?after=`, `GET /stream` | optional relay: the base snapshot read at `finalized`, buffered envelopes, and an SSE stream (`snapshot`, `event`, `commit`, `retract`, `status`, `ping`; `Last-Event-ID` is the envelope id) |

### Demo admin (only when `DEMO_ADMIN_TOKEN` is set, otherwise 404)

Every route needs the header `x-demo-token` (constant-time compare, 401 otherwise), is rate limited per IP (429 `{ error: 'rate_limited', retryAfterSeconds }`) and runs one operation at a time (409 `{ error: 'busy' }`). CORS allows only `ALLOWED_ORIGIN`.

| Route | Behaviour |
|---|---|
| `GET /demo/status` | `{ roundId, phase, coinCount, maxCoins, minCoins, lobbyEndsAt, canCreate, canSeed, freeSlots, busy, balances: { owner, creator, seeder } }` (`owner` is a deprecated alias of `creator`); balances are MON decimal strings (null when that key is not configured), `roundId` 0 and `phase` `None` before the first round |
| `POST /demo/create-round` | only when there is no round or the current one is Settled/Aborted: recycles the ended round best effort (house `claimSeed`/`claimRefund`, sweep to the seeder), calls `createDefaultRound` (config read from `getDefaultConfig`) with `value = reserveFloor + plannedEpochs * (maxEntropyFee + keeperBounty) - carry-over`; `{ roundId }`. 409 `{ error: 'round in progress' }`, 409 `{ error: 'no_default_config' }`, 402 `{ error: 'insufficient funds', shortfall, address }`, 503 `{ error: 'creator_key_missing' }` |
| `POST /demo/seed-house` | body `{ count? }` (default and max 5, capped by free slots); launches the next roster tickers not yet in the lobby; `{ launched: string[] }`. 409 `{ error: 'not in lobby' }` or `{ error: 'lobby full' }`, 402 with `shortfall` and the seeder `address` |

Local: `scripts/dev-local.sh` exports `OWNER_PRIVATE_KEY` (anvil key 0) and `DEMO_ADMIN_TOKEN` (default `dev-demo-token`). House coins launched through the API are not written to `shared/house-coins.json`.

## Deploy

`railway.json` is the descriptor: start command, `/healthz` check, restart on failure. Deploying and setting the service variables is a user step.
