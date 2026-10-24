# Monster Arena: product copy

Single source of every user-facing string. The frontend role reads this file into `web/src/copy` and does not invent strings; a missing slot is reported to role 04. English only, no emojis, no Indonesian string may remain in the product.

Conventions used in the tables:

- `{name}` is a live placeholder filled at render time. `{TICKER}` is the coin ticker rendered with text nodes only (never as HTML). `{amount}` is MON in the compact format (`12.4K MON`); the inspector shows exact values. Testnet MON has no price, so no currency conversion is ever shown.
- Numbers, tickers and addresses use the mono face. Percentages derive from the round configuration (`{boostPct}`, `{consolationPct}`, `{potPct}`, `{treasuryPct}` = the four split values divided by 100; `{minOdds}` and `{maxOdds}` = `winProbMinBps` and `winProbMaxBps` divided by 100).
- Sentence case for body text, UPPERCASE only where the design system already uses it (stage banners, floaters, tiny labels).
- Slot keys are stable identifiers the frontend uses as object keys.

## 1. Wording rules

| Rule | Detail |
|---|---|
| Always use | arena, clash, merge, boost, consolation, claim, redeem, launch, coin, pool, seed, hunt, epoch, lockdown, Chosen One |
| Never use | bet, wager, payout, yield, profit, guaranteed, invest |
| Instead of the forbidden words | "claim" or "redeem" for money leaving the arena to a holder; "boost" for value moving into the winner; "value" or "pool" for amounts; "put in" or "stake" is not used either, use "buy" and "launch with a seed" |
| Never imply a return | no sentence may promise, predict or compare a gain; amounts are shown as facts of the chain state |
| Testnet | the words "play-money" and "no real value" appear in the header badge, in the rules card and in the burner banner |
| House coins | always labelled "House"; never described as organic player demand |
| Shortcuts | the demo preset timers and house coins are disclosed on screen, not only in the runbook |
| Chain claims | never say audited, never say verified safe; say "open source contracts on Monad testnet" only after the addresses exist in `deployments/10143.json` |
| Regulation | no statement about legality or regulation anywhere in the product; legal review is the owner's job |
| Prototype wording | `Simulated`, `Sim`, `Spec v1.0`, `Visual Layer`, "requires protocol verification" never appear in chain mode |

## 2. Header and badges

| Slot key | String |
|---|---|
| `header.title` | Monster Arena |
| `header.network` | Monad Testnet |
| `header.playMoney` | Testnet play-money, no real value |
| `header.connectionLive` | Live • block {block} |
| `header.connectionSyncing` | Syncing... |
| `header.connectionLagging` | Feed lagging {seconds}s |
| `header.connectionDisconnected` | Disconnected • retrying |
| `header.connectionReplay` | Replay |
| `header.totalPool` | Total Pool |
| `header.coins` | Coins |
| `header.roundEndsIn` | Round ends in |
| `header.settling` | Settling... |
| `header.epoch` | Epoch {epoch} |
| `header.launchCoin` | Launch Coin |
| `header.connectWallet` | Connect Wallet |
| `header.rules` | How it works |
| `banner.testnet` | Testnet play-money, do not deposit real funds |
| `banner.demoPreset` | Demo preset: the lobby lasts {lobbySeconds} s and each epoch {epochSeconds} s. Standard rounds are longer. |
| `banner.houseCoins` | Some coins are seeded by the arena team and marked House so every round starts full. |
| `banner.replay` | Replay of a recorded round. Nothing here is happening live. |
| `banner.simMode` | Local simulation. No chain connection. |

## 3. Stage rail and stage banners

Labels and sub-lines follow the four stages of the project diagram.

| Slot key | Label | Sub-line |
|---|---|---|
| `stage.1` | 1. Arena Spawn | {count} / {max} Coins on Live Map |
| `stage.2` | 2. PvE Leveling | Defeat Monsters & Rapid Clashes |
| `stage.3` | 3. Liquidity Merger | Losing Pools Boost the Winners |
| `stage.4` | 4. The Chosen One | Last Coin Standing |

| Slot key | Overline | Title | Sub-line |
|---|---|---|---|
| `banner.stage1` | STAGE 1 | ARENA SPAWN | The lobby is open. Launch a coin before the timer ends. |
| `banner.stage2` | STAGE 2 | PVE LEVELING | Coins hunt wild monsters and gain levels. |
| `banner.stage3` | STAGE 3 | LIQUIDITY MERGER | Clashes begin. A losing coin merges into its winner. |
| `banner.stage4` | STAGE 4 | THE CHOSEN ONE | One coin is left standing. |

## 4. Lobby

| Slot key | String |
|---|---|
| `lobby.counter` | {count} / {max} |
| `lobby.counterLabel` | Coins in the arena |
| `lobby.timer` | Round starts in {mmss} |
| `lobby.timerWaiting` | Waiting for at least {minCoins} coins |
| `lobby.timerFull` | Arena full, starting now |
| `lobby.starting` | Starting the round... |
| `lobby.houseLabel` | House |
| `lobby.houseTooltip` | Seeded by the arena team so every round has a full lobby. |
| `lobby.launchRules` | Each address can launch up to 2 coins. The launch fee is {launchFee} MON. Your seed of {minSeed} to {maxSeed} MON is locked in the coin until the coin is eliminated, the round settles or the round is aborted. |
| `lobby.launchOnly` | Launching is only possible during the lobby. |
| `lobby.empty` | No coins yet. Launch the first one. |
| `lobby.full` | Arena full ({count} / {max}) |

## 5. Rules card

Title `rules.title`: How the arena works. Each paragraph is one slot.

| Slot key | String |
|---|---|
| `rules.title` | How the arena works |
| `rules.coins` | Up to {max} coins enter the arena. Each coin is a real token with its own pool. |
| `rules.epoch` | The round runs in epochs. In a Leveling epoch every coin hunts wild monsters for xp. In a Knockout epoch coins are paired and clash, and every coin also hunts. |
| `rules.lockdown` | At the start of every epoch the arena locks. While it is locked no coin can be bought or sold, so nobody can act on a result before it exists. Trading reopens when the epoch resolves, usually within seconds. |
| `rules.seed` | One random seed from Pyth Entropy is requested after the lock. Pairs, clash rolls and hunts are all derived from that seed in a single transaction. Nobody, including the keeper, chooses who fights whom. |
| `rules.odds` | Odds are public and frozen at the lock. They come from level, element and pool size. Every clash win chance is kept between {minOdds}% and {maxOdds}%. |
| `rules.split` | When a coin loses, its pool is split: {boostPct}% boosts the winner, {consolationPct}% goes to the holders of the eliminated coin, {potPct}% joins the prize pot and {treasuryPct}% funds the treasury that pays for randomness. |
| `rules.consolation` | Holders of an eliminated coin claim a fixed amount per token. The rate is set when the coin is eliminated and never changes. |
| `rules.redeem` | The last coin standing is the Chosen One. Its holders redeem their tokens for a share of the coin's pool plus the prize pot. There is no other way out of that coin. |
| `rules.seedLock` | The creator's seed stays in the coin until it ends, so a coin always has real stake in it. |
| `rules.abort` | If the random seed does not arrive, the epoch is cancelled. After three cancelled epochs in a row anyone can abort the round and every holder claims a refund. |
| `rules.testnet` | This is Monad testnet. MON here is play-money with no real value. |
| `rules.close` | Got it |

## 6. Lockdown and epoch states

| Slot key | String |
|---|---|
| `lock.banner` | LOCKDOWN |
| `lock.sub` | Trading is paused while the arena draws its seed. |
| `lock.countdown` | Resolving in {seconds}s |
| `lock.waitingSeed` | Waiting for the random seed... |
| `lock.seedReady` | Seed received. Resolving clashes... |
| `lock.resolving` | Resolving |
| `lock.odds` | Win chance {pct}% |
| `lock.powerRating` | Power {rating} |
| `lock.pairingUnknown` | Pairs are drawn from the new seed after the lock. |
| `lock.tradeDisabled` | Locked: trading resumes when the epoch resolves |
| `epoch.cancelledTitle` | Arena stabilised |
| `epoch.cancelledBody` | The random seed was late, so this epoch was cancelled. Nothing changed and trading is open again. |
| `epoch.cancelStreak` | Epoch cancelled ({count} of 3). After 3 in a row the round can be aborted. |
| `epoch.bye` | {TICKER} gets a bye |
| `epoch.resolved` | Epoch {epoch} resolved. {alive} coins left. |

## 7. Launch modal

| Slot key | String |
|---|---|
| `launch.title` | Launch a coin |
| `launch.subtitle` | Choose how your coin looks in the arena |
| `launch.name` | Coin name |
| `launch.namePlaceholder` | Moonfire |
| `launch.ticker` | Ticker |
| `launch.tickerPlaceholder` | MOON |
| `launch.tickerHelp` | 2 to 7 letters or digits |
| `launch.monster` | Monster |
| `launch.skin` | Skin |
| `launch.skinNote` | Skins are cosmetic and have no effect on clashes. |
| `launch.seed` | Seed (MON) |
| `launch.seedHelp` | Between {minSeed} and {maxSeed} MON. Locked in the coin until it ends. |
| `launch.fee` | Launch fee: {launchFee} MON |
| `launch.balance` | Balance: {balance} MON |
| `launch.max` | Max |
| `launch.onchain` | On-chain identity |
| `launch.submit` | Launch in the Arena |
| `launch.cancel` | Cancel |
| `launch.stepConfirm` | Confirm in wallet |
| `launch.stepLaunching` | Launching |
| `launch.stepDone` | Done |
| `launch.lobbyOnly` | Lobby only |
| `launch.errorName` | Enter a name of 1 to 28 characters. |
| `launch.errorTicker` | The ticker must be 2 to 7 characters, A to Z and 0 to 9. |
| `launch.errorSeed` | The seed must be between {minSeed} and {maxSeed} MON. |
| `launch.errorBalance` | Your balance is below the seed plus the launch fee plus gas. |
| `launch.errorCap` | This address already launched 2 coins in this round. |
| `launch.errorFull` | Arena full ({count} / {max}) |
| `launch.errorClosed` | The lobby is closed. |

Monster and skin labels come from the catalog: Fire Dragon, Ice Wolf, Earth Golem, Electric Fox, Dark Spirit; skins Default, Obsidian, Gold, Azure, Mythic. Element line under a monster: `Fire`, `Ice`, `Earth`, `Electric`, `Dark`.

## 8. Wallet and burner

| Slot key | String |
|---|---|
| `wallet.connecting` | Connecting... |
| `wallet.useBurner` | Use burner |
| `wallet.burnerNote` | A burner is a throwaway testnet key stored in this browser. Do not deposit real funds. |
| `wallet.burnerBanner` | Testnet play-money, do not deposit real funds |
| `wallet.injected` | Browser wallet |
| `wallet.switchNetwork` | Switch Network |
| `wallet.copyAddress` | Copy address |
| `wallet.viewExplorer` | View on explorer |
| `wallet.disconnect` | Disconnect |
| `wallet.dripRequesting` | Requesting test MON... |
| `wallet.dripDone` | Received {amount} MON |
| `wallet.dripRateLimited` | The faucet is cooling down. Try again in {retryAfterSeconds} s. |
| `wallet.dripEmpty` | The faucet is empty right now. Ask the host for test MON. |
| `wallet.dripFailed` | The faucet could not send MON. Try again in a moment. |
| `wallet.noWallet` | No browser wallet found. Use the burner instead. |
| `wallet.lowReserve` | Balances under 10 MON can only send one transaction every few blocks. |

## 9. Trade drawer

| Slot key | String |
|---|---|
| `trade.title` | {TICKER} #{coinId} |
| `trade.buy` | Buy |
| `trade.sell` | Sell |
| `trade.amount` | Amount (MON) |
| `trade.receive` | You receive (estimate) |
| `trade.minReceived` | Minimum received |
| `trade.slippage` | Slippage {pct}% |
| `trade.deadline` | Expires in {seconds} s |
| `trade.balance` | Balance: {balance} MON |
| `trade.tokenBalance` | Your tokens: {tokens} |
| `trade.fee` | Trade fee {pct}% |
| `trade.locked` | Locked: trading resumes when the epoch resolves |
| `trade.eliminated` | This coin is eliminated. Holders can claim consolation. |
| `trade.settled` | The round is settled. The Chosen One is redeem-only. |
| `trade.seedTokens` | Creator seed tokens cannot be sold. They are claimed when the coin ends. |
| `trade.submitBuy` | Buy {TICKER} |
| `trade.submitSell` | Sell {TICKER} |
| `trade.errorAmount` | Enter an amount greater than zero. |
| `trade.errorBalance` | Not enough MON for this amount plus gas. |

## 10. Claims and redeem

| Slot key | String |
|---|---|
| `claim.consolation.button` | Claim consolation |
| `claim.consolation.rate` | Fixed rate: {rate} MON per 1M tokens |
| `claim.consolation.owed` | You can claim {amount} MON |
| `claim.consolation.waiting` | Available when the elimination is finalized |
| `claim.consolation.none` | Nothing to claim. |
| `claim.seed.button` | Claim seed |
| `claim.seed.owed` | Your seed claim is {amount} MON at the fixed rate |
| `claim.seed.waiting` | Available when the coin has ended |
| `claim.redeem.button` | Redeem |
| `claim.redeem.owed` | You can redeem {amount} MON |
| `claim.redeem.rate` | Redeem rate: {rate} MON per 1M tokens |
| `claim.redeem.waiting` | Available when the settlement is finalized |
| `claim.refund.button` | Claim refund |
| `claim.refund.owed` | Your refund is {amount} MON |

## 11. Transaction toasts

Each kind has three states. `{reason}` is the mapped sentence from section 12; `{hash}` is the short form `0x9f2...c1d4`.

| Kind | Pending title | Pending body | Confirmed title | Confirmed body | Failed title |
|---|---|---|---|---|---|
| `launch` | Launching {TICKER} | Confirm in your wallet, then wait for the arena to include it. | Coin launched | {TICKER} #{coinId} entered the arena. | Launch failed |
| `buy` | Buying {TICKER} | Sending {amount} MON. | Bought {TICKER} | You received {tokens} tokens. | Buy failed |
| `sell` | Selling {TICKER} | Sending {tokens} tokens. | Sold {TICKER} | You received {amount} MON. | Sell failed |
| `claimConsolation` | Claiming consolation | Claiming from {TICKER}. | Consolation claimed | {amount} MON added to your balance. | Claim failed |
| `claimSeed` | Claiming seed | Claiming from {TICKER}. | Seed claimed | {amount} MON added to your balance. | Claim failed |
| `redeem` | Redeeming | Redeeming {TICKER} tokens. | Redeemed | {amount} MON added to your balance. | Redeem failed |
| `refund` | Claiming refund | Claiming from {TICKER}. | Refund claimed | {amount} MON added to your balance. | Refund failed |
| `drip` | Requesting test MON | Asking the faucet. | Test MON received | {amount} MON added to your burner. | Faucet unavailable |

Shared strings: `toast.viewExplorer` View on explorer; `toast.close` Close; `toast.failedBody` {reason}; `toast.unknownError` The arena refused this transaction. Nothing was spent except gas.

Wallet-level errors: `error.userRejected` You cancelled the request. `error.insufficientFunds` Not enough MON for this amount plus gas. `error.wrongNetwork` Switch to Monad Testnet to continue. `error.rpc` The network did not answer. Try again in a moment.

## 12. Revert error mapping

The mapping covers every condition in `contracts.md` section 2.3 and the named tests in 2.7. The names in the first column are the proposed custom error names; role 01 chooses the final ones, and this table is completed against `contracts/abi/Arena.json` once the ABI exists (the frontend reads `web/src/copy` keyed by the error name from the ABI; an unknown name falls back to `toast.unknownError`).

| Error name | Raised when | Sentence shown |
|---|---|---|
| `Locked` | `buy`, `sell` or `launchCoin` between `EpochLocked` and the end of the resolve | The arena is locked while it draws its seed. Try again when the epoch resolves. |
| `WrongPhase` | A call that needs another round phase (launch after the lobby, trade in the lobby) | This action is not available in the current stage of the round. |
| `RoundNotFound` | Unknown `roundId` | That round does not exist. |
| `CoinNotFound` | Unknown `coinId` | That coin does not exist in this round. |
| `CoinNotAlive` | Trade on an eliminated or settled coin | This coin has left the arena. |
| `RoundFull` | `launchCoin` when `maxCoins` is reached | The arena is full. |
| `LaunchCapReached` | More than 2 coins from one address | This address already launched 2 coins in this round. |
| `InvalidTicker` | Ticker not `[A-Z0-9]{2,7}` | The ticker must be 2 to 7 characters, A to Z and 0 to 9. |
| `InvalidName` | Empty or too long name | The coin name must be 1 to 28 characters. |
| `InvalidMonster` | `monsterType` out of range | Choose one of the five monsters. |
| `InvalidSkin` | `skinId` out of range | Choose one of the five skins. |
| `SeedOutOfRange` | Seed below `minSeed` or above `maxSeed` | The seed must be between {minSeed} and {maxSeed} MON. |
| `WrongValue` | `msg.value` is not launch fee plus seed | The amount sent does not match the launch fee plus the seed. |
| `NotEnoughCoins` | `startRound` below `minCoins` | The round needs at least {minCoins} coins to start. |
| `LobbyStillOpen` | `startRound` before the deadline with fewer than `maxCoins` | The lobby is still open. |
| `TreasuryTooLow` | `startRound` or `lockEpoch` when the treasury cannot cover the seed fees | The treasury cannot pay for the next random seed yet. |
| `EpochTooEarly` | `lockEpoch` before `epochSeconds` has elapsed | The next epoch has not started yet. |
| `AlreadyLocked` | `lockEpoch` while locked | The arena is already locked. |
| `NotLocked` | `resolveEpoch` or `cancelEpoch` while unlocked | There is nothing to resolve right now. |
| `SeedNotReady` | `resolveEpoch` before the seed arrived | The random seed has not arrived yet. |
| `SeedFeeTooHigh` | Entropy fee above `maxEntropyFee` | The randomness fee is above the round limit. |
| `SeedAlreadyArrived` | `cancelEpoch` after a seed arrived | The seed arrived, so this epoch cannot be cancelled. |
| `SeedTimeoutNotElapsed` | `cancelEpoch` before `seedTimeoutSeconds` | Wait for the seed timeout before cancelling this epoch. |
| `CancelCapReached` | A fourth cancel in a row | Too many cancelled epochs in a row. The round can be aborted. |
| `AbortNotAllowed` | `abortRound` before 3 cancels or `maxRoundSeconds` | The round cannot be aborted yet. |
| `NotAborted` | `claimRefund` or `refundLaunch` on a live round | Refunds open only if the round is aborted. |
| `NotEliminated` | `claimConsolation` on a coin still alive | This coin has not been eliminated. |
| `CoinNotEnded` | `claimSeed` while the coin is alive | The seed is released when the coin ends. |
| `NotSettled` | `redeem` before settlement | The round has not settled yet. |
| `NotChampion` | `redeem` with tokens of a coin that is not the Chosen One | Only the Chosen One can be redeemed. |
| `NothingToClaim` | Claim with zero tokens or zero rate | There is nothing to claim. |
| `InsufficientTokens` | `sell` or claim above the caller balance | You do not hold that many tokens. |
| `SeedTokensLocked` | `sell` of creator seed tokens | Creator seed tokens cannot be sold. |
| `SlippageExceeded` | Output below `minTokensOut` or `minMonOut` | The price moved. Raise the slippage or try a smaller amount. |
| `DeadlineExpired` | `deadline` in the past | This transaction expired. Try again. |
| `ZeroAmount` | Trade amount zero | Enter an amount greater than zero. |
| `OnlySeedSource` | `onSeed` from another caller | Only the randomness source can deliver a seed. |
| `OnlyOwner` | Owner-only call by another account | Only the arena owner can do this. |
| `RoundInProgress` | `createRound` or `setSeedSource` while a round runs | This can only change between rounds. |
| `TransferFailed` | MON transfer to the caller failed | The transfer could not be completed. Nothing was claimed. |
| `Reentrancy` | Re-entered a guarded function | The arena rejected a nested call. |

## 13. Feed, floaters, hunts, levels

| Slot key | String |
|---|---|
| `feed.title` | Merger feed |
| `feed.empty` | Waiting for the first clash... |
| `feed.row` | {TICKER} consumed {TICKER} |
| `feed.chip` | CONSUMED |
| `feed.boost` | +{amount} MON boost |
| `feed.consolation` | {amount} MON consolation |
| `feed.pot` | {amount} MON to the prize pot |
| `feed.treasury` | {amount} MON to the treasury |
| `feed.legend` | Boost {boostPct}% • Consolation {consolationPct}% • Pot {potPct}% • Treasury {treasuryPct}% |
| `feed.explorer` | View on explorer |
| `feed.time` | {relativeTime} |
| `floater.wins` | {TICKER} WINS |
| `floater.boost` | +{amount} MON BOOST |
| `floater.consolation` | {amount} MON TO HOLDERS |
| `floater.trade.buy` | +{amount} MON |
| `floater.trade.sell` | -{amount} MON |
| `hunt.won` | Hunt won, +{xp} xp |
| `hunt.failed` | Hunt failed |
| `level.badge` | Lv {level} |
| `level.up` | LEVEL UP |
| `level.xp` | {xp} xp |
| `status.alive` | Alive |
| `status.eliminated` | Eliminated |
| `status.champion` | Chosen One |
| `status.refunded` | Refunded |

## 14. Leaderboard, inspector and filters

| Slot key | String | Replaces (prototype line) |
|---|---|---|
| `board.title` | Leaderboard | existing |
| `board.row.sub` | {Monster} • W:{wins} | existing |
| `board.empty` | No coins yet. Launch the first one. | new |
| `inspector.empty` | Select a coin to inspect it. | new |
| `inspector.poolReserve` | Pool Reserve | `Validated LP (Sim)` (418, 421-424) |
| `inspector.poolValue` | Pool value | `Simulated LP` (325) |
| `inspector.tokenAddress` | Token Address | existing (431) |
| `inspector.copyAddress` | Copy address | new |
| `inspector.wins` | Wins | `Wins: n` with trophy (439) |
| `inspector.zoneOpponent` | Zone & Opponent | `Lokasi & Lawan` (426) |
| `inspector.currentActivity` | Current Activity | `Aktivitas Saat Ini (Live Action)` (394) |
| `inspector.activityPlaceholder` | Roaming the arena... | `Menjelajahi arena dengan santai...` (396) |
| `inspector.animationPreview` | Animation Preview | `Uji Animasi & Ekspresi (Live 3D)` (438); dev only, `?sim=1` |
| `inspector.modelSize` | Monster Model / Size | existing (414) |
| `inspector.signatureAttack` | Signature Attack | existing (418) |
| `filter.monsterTypes` | Monster Types | `MVP Monster Catalog (5)` (307) |
| `filter.clickToFilter` | Click to filter | existing (308) |
| `catalog.live` | Live | `Visual Layer` (339) |
| `merger.explainer` | A losing coin's pool is split into a boost for the winner, a consolation for its holders, the prize pot and the treasury. | the line at 342 |
| `world.waiting` | Waiting for the first clash... | the line at 346 |
| `camera.free` | Camera: Free | `Auto-Battle Zoom: OFF` (478) |

Activity narrative lines (inspector, replaces the Indonesian generator at prototype 3310-3348):

| State | Badge | Text |
|---|---|---|
| idle | IDLE • ALERT | Resting and watching the {biome} Zone |
| walk | ROAMING | Exploring the {biome} Zone for opponents ({speed} u/s) |
| combat | DUEL vs {opponent} | Fighting fiercely with {attackName}! |
| attack | DUEL vs {opponent} | Unleashing {attackName}! |
| hit | TAKING A HIT | Bracing against the opponent's strike! |
| victory | VICTORY! | Celebrating the win and absorbing the loser's pool! |
| consuming | CONSUMED | Defeated: energy absorbed by the winner... |

The `{opponent}` falls back to `ENEMY` for a wild monster. Zone names: Ice, Dark, Lava, Forest and `Central Citadel` (the same name the floating tag uses).

Remaining prototype strings that must change in chain mode (from `01-design-system.md` F12.2):

| Prototype | Replacement |
|---|---|
| `Monster Arena — Global 3D Arena Prototype (Spec v1.0)` (6) | `Monster Arena` |
| `Spec v1.0` badge (185) | `Monad Testnet` |
| `Global View Only (No Auto-Zoom) • 4 Connected Biomes` (190) | the connection status line (section 2) |
| `/ 60 target` (201) | `/ {max}` |
| `Scale Test`, `Trigger Nearby Duel`, `Auto-Respawn Consumed` (217-234, 298) | removed in chain mode |
| `Launch Token Monster` (240) | `Launch Coin` |
| `Section 8: Validated Token-to-Monster Identity Assignment` (501) | `Choose how your coin looks in the arena` |
| `Initial Validated LP (Simulated USD)` (544) | `Seed (MON)` |
| `Sanitized Identity Mapping Payload` (551) | `On-chain identity` |
| `Spawn in Shared Arena` (561) | `Launch in the Arena` |
| `... VICTORY & ABSORB!` (3139) | `{TICKER} WINS` |
| `Just now`, `Particle absorption complete`, `Sim LP: $` (3746-3753) | real relative time, the merger amounts of section 13 |

## 15. Chosen One screen

| Slot key | String |
|---|---|
| `chosen.overline` | STAGE 4 |
| `chosen.title` | THE CHOSEN ONE |
| `chosen.sub` | Last coin standing |
| `chosen.finalPool` | Final pool |
| `chosen.prizePot` | Prize pot |
| `chosen.consumed` | Coins consumed |
| `chosen.wins` | Wins |
| `chosen.holders` | Holders |
| `chosen.address` | Token Address |
| `chosen.roundLength` | Round length |
| `chosen.rate` | Redeem rate: {rate} MON per 1M tokens |
| `chosen.rateNote` | Published at settlement: (pool + prize pot) divided by supply. It cannot change. |
| `chosen.redeem` | Redeem |
| `chosen.noHolding` | You do not hold the Chosen One. |
| `chosen.explorer` | View on Explorer |
| `chosen.replay` | Watch Replay |
| `chosen.close` | Close |

The rate unit is MON per 1M tokens so the number is readable; the exact value is available as `redeemPool / redeemSupply` from the chain.

## 16. Aborted round

| Slot key | String |
|---|---|
| `abort.title` | Round aborted |
| `abort.body` | The arena could not draw a random seed. Every holder can claim a refund of their tokens at the pro-rata rate. |
| `abort.reasonCancels` | Three epochs in a row were cancelled. |
| `abort.reasonTime` | The round reached its maximum duration. |
| `abort.lobby` | The round was aborted in the lobby. Launch refunds are open. |
| `abort.claim` | Claim refund |
| `abort.next` | A new round can start after this one is cleared. |

## 17. Empty and loading states

| Slot key | String |
|---|---|
| `empty.claims` | Nothing to claim. |
| `empty.holdings` | You do not hold any coins yet. |
| `empty.feed` | Waiting for the first clash... |
| `loading.arena` | Loading the arena... |
| `loading.skeleton` | (no text, skeleton blocks only) |
| `loading.snapshot` | Reading the arena from the chain... |
| `connection.relayDown` | Live feed paused. Reading the chain directly. |

## 18. Disclosures that must stay visible

| Where | String |
|---|---|
| Header badge | Testnet play-money, no real value |
| Rules card and burner banner | Testnet play-money, do not deposit real funds |
| Demo preset banner | Demo preset: the lobby lasts {lobbySeconds} s and each epoch {epochSeconds} s. Standard rounds are longer. |
| House coin chip | House |
| Replay and simulation modes | `banner.replay` and `banner.simMode` from section 2 |

Legal review of the product framing is the owner's responsibility. This file contains no legal advice.
