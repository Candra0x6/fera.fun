# Demo runbook: Monster Arena on Monad testnet

For a person who has not read the code. Follow it top to bottom. Every command that needs a key reads it from an environment variable that you set yourself; nothing in this repository contains a key, and this runbook never asks you to paste one into a file.

Contract addresses are not in this file. After the deploy, read them from `deployments/10143.json` and copy them into your explorer tabs. If that file does not exist yet, the chain part is not deployed and you are doing the fallback demo (section 7).

Not legal advice. The framing in the product is testnet play-money; the owner decides whether any legal review is needed before sharing it publicly.

## 1. What you are showing, in one breath

A real-time battle royale for coins on Monad testnet. Up to 30 coins live in one 3D arena. Every epoch the arena locks, requests one random seed, then pairs coins, rolls the clashes, merges each loser into its winner, and runs wild-monster hunts for xp. The last coin standing is the Chosen One. The 3D scene only replays what the chain confirmed; it never decides an outcome.

## 2. Disclosed shortcuts (say these out loud and keep them on screen)

| Shortcut | Where it is disclosed | What to say |
|---|---|---|
| Demo preset timers (lobby 120 s, 3 leveling epochs of 20 s, then knockout epochs) | demo preset banner | "This is the demo preset. A standard round is longer. The mechanics are identical." |
| House-seeded coins, marked House | House chip on those coins | "These coins are seeded by us so the lobby is never empty. Player coins join the same pool." |
| Testnet play-money | header badge, rules card, burner banner | "This is Monad testnet. MON here has no value." |
| Faucet drip for the burner wallet | wallet panel | "The burner is a throwaway key in this browser. The keeper drips test MON to it." |
| Keeper is ours | runbook only | "Anyone can call the lock and resolve functions. Our keeper just does it on a timer. It cannot choose pairs or winners." |

## 3. Roles and screens

- Presenter laptop: browser window A, the app as a spectator at the start, then with the burner wallet.
- Second window B on a second display or a second browser profile: a pure spectator with no wallet (proves the same state without a wallet).
- Explorer tabs: `https://testnet.monadvision.com` and `https://testnet.monadscan.com`, both open on the Arena address.
- Terminal pane (not shown to the audience): keeper log and, only if needed, the recovery commands in section 8.

## 4. Pre-flight checklist (do all of it 30 minutes before)

Tick each line. A red line is resolved with the matching recovery in section 8 before you start.

| # | Check | How | Pass when |
|---|---|---|---|
| 1 | Contracts deployed and descriptors present | open `deployments/10143.json` | it lists `arena`, `coinImplementation`, `seedSource`, `entropy`, `deployBlock` |
| 2 | Arena address verified on the explorer | open `https://testnet.monadvision.com/address/<arena address>` | the contract page shows verified source |
| 3 | Seed source is the real one | open the `seedSource` address on the explorer; it must be the Entropy adapter, not the mock | adapter name shown, entropy address matches `deployments/10143.json` |
| 4 | Keeper is up | `curl <keeper url>/healthz` | `ok: true`, `lagSeconds` under 5, round phase `Lobby` |
| 5 | Keeper wallet funded | the keeper address from `/healthz` on the explorer | at least 25 MON (10 MON reserve plus gas) |
| 6 | Drip wallet funded | the drip address on the explorer | enough for your audience; default drip is 5 MON per burner |
| 7 | Treasury funded for every planned epoch | read the round view on the explorer or `cast call` the round view (section 8) | treasury at least the entropy fee times the planned epochs (about 10 for the demo preset; about 1.3 MON on testnet) plus the keeper bounty |
| 8 | Demo round created with the demo preset | the round view | `maxCoins` 30, `minCoins` 8, `lobbySeconds` 120, `levelingEpochs` 3, `epochSeconds` 20 |
| 9 | House coins seeded | run the keeper's `seed-house` script as written in `keeper/README.md` | the lobby shows the planned number of coins (12 in the default roster), each marked House |
| 10 | App loads as a spectator | open the app in window B | `coin-counter` reads N / 30, `lobby-timer` counts down, `status-chip` reads Live with a block number |
| 11 | Rules card visible | open it once | the split reads 50 / 30 / 15 / 5 and the odds clamp reads 15 to 85 |
| 12 | Burner path works | in a throwaway profile press Connect Wallet then Use burner | balance appears after the drip within a few seconds |
| 13 | Fallback ready | open `<app url>?replay=fixture` in a spare tab | the fixture plays with no chain; leave the tab ready |
| 14 | Recorded fallback ready | the screen recording described in `docs/demo/fallback.md` (P1) | plays to the Chosen One screen |
| 15 | RPC reachable | `curl -s -X POST https://testnet-rpc.monad.xyz -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'` | a hex block number |
| 16 | Backup RPC noted | `https://rpc-testnet.monadinfra.com` | reachable the same way |
| 17 | Screen set up | 1920 by 1080 or larger, browser zoom 100 percent | no panel overlap in the left stack and the inspector |

Do a full dry run with the keeper on the same preset at least once. Record the time from `EpochLocked` to `EpochResolved` in the keeper log; if it is above 90 s, stop and read section 8.

## 5. The demo path, click by click

Times are for the demo preset and assume the lobby is allowed to run its full 120 s. If the lobby already holds `minCoins`, use the keeper's `force-start` script at the point shown to shorten it. Each epoch takes about 20 s of spacing plus the randomness delay (about 2 to 4 s) plus a block or two, so budget 25 to 30 s per epoch and replace these estimates with your dry-run numbers. The whole round is about 5 minutes from the first click.

| # | Time | Click or action | What you see | What is real | What to say |
|---|---|---|---|---|---|
| 1 | 0:00 | Open the app in window B (spectator, no wallet) | Arena with the lobby coins; `coin-counter` N / 30; `lobby-timer` counting down; stage rail on 1 (Arena Spawn); Monad Testnet badge and the play-money banner; rules card with the 50 / 30 / 15 / 5 split; status chip Live with a block number | The snapshot and the live log feed from the chain; the Arena address is on screen | "This is a shared arena on Monad testnet. Everything you see is read from the chain." Open the rules card and read the lockdown and split lines. |
| 2 | 0:30 | In window A press Connect Wallet, then Use burner (or connect an injected wallet) | A burner is created; the balance appears after the drip | A real drip transaction from the keeper's drip wallet | "No popups: a burner key in this browser, funded by a faucet. A normal wallet works the same way." |
| 3 | 0:50 | Press Launch Coin, enter a name, ticker, monster, skin and a seed in MON, press Launch in the Arena | A toast goes pending, then confirmed; a new monster pops into the arena only after the launch event is finalized; the counter reads N+1 / 30 | `launchCoin` creates an ERC-20 clone and its own pool; the creator seed is held by the Arena | "My seed is locked in the coin until it ends, so every coin has real stake behind it." Point at the House chips: "These are house coins, disclosed." |
| 4 | 2:00 | The lobby ends (timer or full) and the keeper starts the round | `RoundStarted`: the camera fits the world; stage rail moves to 2 (PvE Leveling); trading opens | `startRound` | "The lobby is closed. Trading opens now." |
| 5 | 2:10 | Click a coin on the map or in the leaderboard, open the inspector, enter an amount, press Buy | The pool reserve moves; the leaderboard re-ranks; the toast links to the explorer | `buy` on the coin's curve; the trade event carries the new reserves | "Each coin has its own pool and price curve. This buy moved this coin's reserve." Open the explorer link. |
| 6 | 2:20 | Wait for the first lock | LOCKDOWN banner with a countdown; the buy button is disabled with the Locked reason; public power ratings appear; every coin holds a pose | `lockEpoch` freezes every coin and requests one seed | "At the start of every epoch the arena locks. Nobody can trade, so nobody can act on a result before it exists." |
| 7 | 2:30 | The seed arrives, then the epoch resolves | Wild monsters appear beside the coins for a 1.2 s hunt; a success shows `+xp`; leveling coins gain levels; trading unlocks | One Entropy seed; hunts are rolled from it; hunt and level events | "One random seed per epoch. Pairs, rolls and hunts are all derived from it in one transaction." Repeat for the three leveling epochs, letting the audience watch two of them, and buy once more between epochs. |
| 8 | 3:30 | The first knockout epoch: lockdown, seed, then the clashes | Pairs dash to a midpoint, a scripted duel ends on the chain's winner, the loser dissolves; a boost stream and an aura flow into the winner with a floating boost amount; a feed row shows boost, consolation, pot and treasury with an explorer link; stage rail moves to 3 (Liquidity Merger); a coin may get a bye | `resolveEpoch`: pairing from the new seed, rolls, the boost as a virtual buy-and-burn, the consolation rate fixed | "The loser's pool is split: half boosts the winner, thirty percent goes to the loser's holders, fifteen to the prize pot, five to the treasury. The duel is only a replay of what the chain decided." Click the feed row's explorer link. |
| 9 | 4:00 | With the burner wallet that bought the coin that was just eliminated, press Claim consolation | The button enables once the elimination is finalized; a toast confirms; the balance rises | `claimConsolation` at the fixed rate | "Holders of an eliminated coin claim at a fixed rate. It was set when the coin fell and never changes." |
| 10 | 4:10 to 5:00 | Let the epochs continue until one coin is left | The final merge; `RoundSettled`; stage rail 4 (The Chosen One); the crown finale; the Chosen One screen shows the published redeem rate read from the chain; Redeem for holders | `RoundSettled` and `redeem` | "The last coin standing is the Chosen One. Its holders redeem at a published rate: its pool plus the prize pot, divided by its supply. There is no race to exit." If the burner holds it, press Redeem. |

After the path, state plainly what is on chain and what is replayed: the money, the pairings, the rolls and the claims are on chain; the monsters' movement, the strike-by-strike duels and the hunt fights are replays seeded by the event ids.

## 6. If you are asked

Short answers; the longer versions are in `docs/pitch/outline.md` (P1).

| Question | Answer |
|---|---|
| Can the keeper rig it? | No. It only calls public functions. Anyone can call lock and resolve. Pairs and rolls come from the random seed on chain. |
| Can someone front-run the resolve? | Every coin is locked between the lock and the resolve, so there is nothing to trade against. |
| Why testnet? | It is play-money by design. Mainnet needs a review and extra protection against randomness re-rolls first. |
| What if the randomness is late? | After 60 s the epoch is cancelled and trading reopens. Three cancels in a row allow an abort with refunds. |
| Is it audited? | No. It is a testnet project; contracts are open source and the invariants are tested. |

## 7. Fallback ladder

Use the lowest rung that still tells the story. Say which rung you are on.

1. Live chain demo (above).
2. Live chain, keeper stalled: recover (section 8) or resolve manually.
3. `<app url>?replay=fixture`: the same path from a fixture, no chain, no wallet. Say "this is a recorded round".
4. The screen recording from `docs/demo/fallback.md`.
5. `<app url>?sim=1`: the original prototype simulation. Say "this is the original local simulation, not the chain".

## 8. Recovery steps per failure

Use `cast` for manual calls. Read the signer from an environment variable you set yourself, for example `KEEPER_PRIVATE_KEY`; never write the value into a file or this document. Replace `<arena>` with the address from `deployments/10143.json` and `<roundId>` with the current round.

| Failure | Symptom | Do this |
|---|---|---|
| RPC down or rate limited | Status chip shows Disconnected or Feed lagging; toasts say the network did not answer | 1. Check `eth_blockNumber` against the backup RPC from the pre-flight list. 2. If the app has a keyed provider variable, switch the build to it; otherwise reload once and wait 10 s. 3. The app subscribes first, then re-reads the snapshot, so no animation is duplicated after reconnect. 4. If it stays down, go to rung 3 of the fallback ladder. |
| Keeper stalled | The lockdown never starts, or the seed arrived but nothing resolves; `/healthz` lag grows | 1. Read the keeper log for the last transaction and the error. 2. Resolving is permissionless: `cast send <arena> "resolveEpoch(uint64,uint8)" <roundId> 6 --rpc-url https://testnet-rpc.monad.xyz --private-key "$KEEPER_PRIVATE_KEY" --gas-limit <value from contracts/GAS.md>`. 3. If the epoch is unlocked and the spacing has elapsed, `cast send <arena> "lockEpoch(uint64)" <roundId> ...` the same way. 4. Restart the keeper; it does not double-lock a locked round. 5. If the keeper EOA is below 10 MON it can only send slowly; top it up. |
| Seed late, `EpochCancelled` | Lockdown lasts longer than 60 s; the toast reads Arena stabilised | This is expected behaviour, not a failure. Say "the random seed was late, so the arena cancelled the epoch and reopened trading." The keeper calls `cancelEpoch` after the timeout and only if no seed arrived. Wait for the next lock. If it happens again, say so; it is the designed liveness path. |
| Abort path | Three epochs in a row were cancelled | Anyone can call `cast send <arena> "abortRound(uint64)" <roundId> ...`. The app shows Round aborted; holders press Claim refund; launch refunds work if the abort happened in the lobby. Then create a new round (owner step) and re-seed the house coins. Rehearse this once with the mock seed on a local anvil. |
| Faucet empty | The burner balance stays at zero; the toast says the faucet is empty | 1. Check the drip wallet balance on the explorer. 2. Top it up from the user's funded testnet account, or open the Monad testnet faucet in a browser (it blocks curl). 3. Use an injected wallet that already holds test MON instead of the burner. |
| Wallet problem | Wrong network, locked wallet, no popup | 1. Wrong network: press Switch Network. 2. Injected wallet misbehaves: press Use burner. 3. A burner that is stuck: clear the `monster-arena.burner` key in the browser storage and create a new one. Never reuse a burner on any network with real funds. |
| Testnet reset | Contracts or deployments disappear, block number restarts | Testnets have been reset before. 1. Confirm with `eth_getCode` on the Arena address; empty code means a reset. 2. Redeploy through `contracts/DEPLOY.md` (owner step), update `deployments/10143.json`, rebuild the app, re-run the house seeding. 3. Meanwhile run the fallback ladder from rung 3. |
| Treasury too low | Lock reverts with the treasury reason | Anyone can fund it: `cast send <arena> "fundTreasury(uint64)" <roundId> --value 2ether ...` from a funded testnet account. |
| Wrong preset on screen | The banner shows a standard preset in a demo | Stop. The round was created with the wrong configuration; configuration is immutable per round, so create a new round (owner step). |

## 9. After the demo

1. Note the epoch times from the keeper log and the transaction hashes of one clash and one claim.
2. Export the keeper's recorded envelopes if the recorder exists (P1) so the next fixture is a real round.
3. Report anything that did not match this runbook to the PM; the runbook is corrected from the report.
