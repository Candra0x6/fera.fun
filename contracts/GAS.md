# Gas profile

Measured with `forge test --network monad --match-test test_gasProfile -vv` (`test/Gas.t.sol`, `vm.lastCallGas`, Monad gas schedule in forge 1.8.3, 30 coins, demo preset, fresh storage so most slots are cold). Monad charges the gas limit, not gas used, so keepers pass the recommended limit (measured plus 15 percent, rounded up).

| Call | Gas used | Recommended explicit limit |
|---|---|---|
| `launchCoin` (clone, init, seed buy, mint) | 379,754 | 440,000 |
| `buy` | 137,516 | 160,000 |
| `sell` | 111,342 | 130,000 |
| `lockEpoch` (30 coins snapshot, seed request via mock source) | 556,641 | 640,000 |
| `resolveEpoch`, leveling epoch (0 clashes, 30 hunts) | 528,508 | 610,000 |
| `resolveEpoch`, knockout, 6 clashes, 24 hunts (demo preset) | 1,001,342 | 1,160,000 |
| `resolveEpoch`, knockout, 15 clashes, 15 hunts (cap 15) | 1,617,972 | 1,870,000 |
| `resolveEpoch`, knockout, 15 clashes, 15 hunts, `consolationMode = 1` | 5,249,052 | 6,050,000 |

Notes:

- The brainstorm estimated 2 to 4M (author) and 7 to 9M (red team) for 6 to 15 clashes plus hunts; the measured 1.0M to 1.6M is below both. Nothing is near the 25M design-finding threshold or the 30M per-transaction cap, so the keeper can resolve a whole epoch in one call (`maxClashes = 255`).
- Entropy's own cost is paid by the source: `EntropySeedSource` forwards `getFeeV2(provider, 200000)` and the callback (`onSeed`, one storage write plus one event) is far below the 200,000 callback limit.
- Real testnet numbers can differ (storage pages already warm, level-ups emitting `LevelUp`); re-measure on testnet in Day-1 check 3 and widen the limits by 30 percent for the first live round.
- The `Arena` runtime is about 37 KB, inside Monad's 128 KB contract limit.
