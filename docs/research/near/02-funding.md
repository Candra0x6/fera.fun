# RT-2 - Testnet funding (role B, 2026-11-10)

No keys in this file. Keys live in `~/.config/animal-near/<account>.json` (chmod 600).

## Helper API

- `POST https://helper.nearprotocol.com/account` with `{newAccountId, newAccountPublicKey}`, no auth, creates the account with 10 NEAR. Returned 200 for all 7 calls used.
- Rate limit header: `x-ratelimit-limit: 10`; the counter dropped by 1 per call (4, 3, 2 remaining after the three throwaway calls). Window length not observed; budget about 10 creations per window per IP.
- CORS: preflight answers 204 and reflects the request origin, so a browser can call it directly (POST from a browser not exercised).
- Backup if the helper refuses: the testnet faucet web form (not used) or a transfer from `fera-drip.testnet` to the implicit account of the key.

## Funding route

- Throwaway accounts `fera-fund1..3.testnet` created through the helper, then swept with a DeleteAccount action (beneficiary receives the full balance, so nothing is left behind).
- fund1 -> arena, fund2 -> 5.1 NEAR to arena then sweep to drip, fund3 -> drip. Script: `keeper/scripts/near-fund.ts` (`fund` once, `balances` any time).

## Balances after funding (view_account, final)

| Account | NEAR |
|---|---|
| fera-arena.testnet | 25.0997 |
| fera-drip.testnet | 24.8993 |
| fera-keeper.testnet | 10 |
| fera-seeder.testnet | 10 |

The `fera-fund1..3` accounts no longer exist (deleted); their key files remain outside the repo.
