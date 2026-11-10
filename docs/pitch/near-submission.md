# NEAR HACKATHON submission: drafts and checklist

Drafts only. Nothing here has been posted or submitted. The team lead records the video, publishes the X post and submits the form. Every `<<PLACEHOLDER: ...>>` is a value only the lead can supply; do not invent it. The hackathon rules checked on 2026-11-10 from `https://nearhackathon.com/HACKATHON.md` and `SUBMITTING.md`: submissions close **2026-11-14T23:59:00Z**, one submission per project, the repository must be public, a submission cannot be edited directly (changes go through `https://nearhackathon.com/request-changes`), and the demo post needs a video or screenshots, the words "built at NEAR HACKATHON", `@NEARProtocol` and `#NEARHackathon`.

## 1. Demo video script (90 seconds, 9 shots)

Follows the demo path of the project (`/?demo` on the real route against NEAR testnet). Record the whole round once at normal speed (about 75 s after the lobby fills), then cut dead time so the finished video is at most 90 s. Show no keys, no `.env` and no terminal with secrets. Narration is in the lead's own voice.

| # | Time | Screen | On-screen text | Narration |
|---|---|---|---|---|
| 1 | 0:00 - 0:07 | Title card, then the arena at `/?demo` with the status chip live | `FERA.FUN on NEAR` | "What if memecoin launches were a battle royale, with every rule in the contract?" |
| 2 | 0:07 - 0:16 | Page load: burner account appears, balance 2 NEAR, no popup | `Burner key, 2 NEAR from the keeper` | "No wallet popup, no seed phrase, no gas prompt. The browser makes a key and the keeper funds it." |
| 3 | 0:16 - 0:24 | Click **Create Lobby**; toast with the explorer link; open it for one second | `1 signed call` | "One call creates the round on fera-arena.testnet." |
| 4 | 0:24 - 0:36 | Click **Seed 5 Animals**; five House coins appear; launch the sixth coin yourself; the lobby fills and the round starts | `6 coins, 0.1 NEAR seed each` | "Five house coins and mine fill the lobby. The round starts by itself." |
| 5 | 0:36 - 0:50 | Arena locks; lockdown panel with power ratings; buy one coin between epochs | `Lock: odds frozen, trading stops` | "At each lock, odds freeze. The seed only exists after the lock, so nobody can trade on it." |
| 6 | 0:50 - 1:08 | Resolve: hunts, a clash, a merger boost, an elimination (speed up the quiet parts) | `Loser's liquidity: 50% boost, 30% consolation, 15% pot, 5% treasury` | "The loser's pool is merged into the winner. Its holders get a fixed consolation rate." |
| 7 | 1:08 - 1:18 | Last coin left: Chosen One screen; press **Redeem**; balance rises | `Redeem = pool + prize pot` | "The last coin redeems for its pool plus the pot, paid in NEAR." |
| 8 | 1:18 - 1:25 | README, section "Fairness and trust" | `Block seed read 3 blocks after the lock` | "The seed is the NEAR block seed, read after the lock. The README states the validator limit plainly." |
| 9 | 1:25 - 1:30 | Compare page `monad-final...near-submission` and the repo URL | `Built at NEAR HACKATHON. Ported from our Monad version in the window` | "Ported from our Monad version during the hackathon. Diff and code are in the repo." |

Capture notes: use a fresh browser profile so the burner is new; start recording before step 2; if hosting is not up, record against `http://127.0.0.1:5173/?demo` with the keeper running locally, or use `?replay=fixture&speed=4` as the fallback and say so in the narration (the rules accept a local demo with a video, not screenshots alone). Keep the explorer link, not any account key, on screen.

## 2. X post draft

Required content: says it was built at NEAR HACKATHON, tags `@NEARProtocol` and `#NEARHackathon`, attaches the video, links the demo and the repository, leads with the user problem, says concretely what NEAR does, and asks a genuine question. Links count as 23 characters on X. The lead posts it.

Main post (219 characters of text plus the two links, 268 counted the way X counts links, under the 280 limit):

```
Memecoin launches are mostly a chart. What if six coins had to fight, and the loser's liquidity went to the winner?

FERA.FUN, built at NEAR HACKATHON on @NEARProtocol: one Rust contract, no wallet popup. #NEARHackathon

<<PLACEHOLDER: demo URL>> https://github.com/Candra0x6/fera.fun
```

Reply under the main post (272 characters, honest scope):

```
Honest scope: a port of our earlier Monad version (tag monad-final); the NEAR contract, keeper and burner wallet were built in the window. Testnet play money, unaudited, block-seed randomness has a validator-skip limit (README). What would you want to see in a coin fight?
```

Attach: the demo video. Do not post a screenshot of any key, token or terminal.

## 3. Submission form texts

Form: `https://nearhackathon.com/#apply` (or `POST https://nearhackathon.com/api/applications`). One submission per project. The consent line must be read and ticked by the lead: "I agree that the organizers may use these details to review our submission and contact us about this hackathon."

| Field | Rule | Draft value |
|---|---|---|
| `projectName` | 2-80 characters | `FERA.FUN on NEAR` |
| `leadName` | 2-80 characters | `<<PLACEHOLDER: team lead name>>` |
| `email` | valid, max 160 | `<<PLACEHOLDER: contact email>>` |
| `size` | one of `1`, `2 - 4`, `4 - 6`, `6 - 8`, `8+` | `1` (assumes one human with AI agents; the lead confirms) |
| `tracks` | ids, each once | `["games", "memecoins"]` (see the note below) |
| `nearAddress` | mainnet account, 2-64 chars, lowercase | `<<PLACEHOLDER: mainnet NEAR account for the prize payout, created by the lead>>` |
| `projectUrl` | public repository, max 300, unique | `https://github.com/Candra0x6/fera.fun` |
| `demoUrl` | public demo post, max 300 | `<<PLACEHOLDER: X post URL, after the lead publishes it>>` |
| `idea` | 20-2000 characters | the text below |
| `consent` | `true` | set by the lead only |
| `requestId` | UUID, generated once and reused on a retry | generated at submission time (`node -e 'console.log(crypto.randomUUID())'`); not stored in the repository |

Track note: `games` fits the game loop (hunts, clashes, redeem every round) and the no-popup burner flow. `memecoins` asks for NEP-141 tokens and a contract with no admin key; this project has neither fully (coins are ledger assets of one contract, and the testnet account still has the deployer's key). The README says both plainly. If the lead prefers not to carry that gap, replace `memecoins` with `open`.

`idea` text (1,708 characters, inside the 20-2,000 limit):

```
FERA.FUN turns memecoin launches into a real-time battle royale. Up to six coins are launched into a lobby, level up by hunting, and then fight in knockout epochs until one is left. A defeated coin's liquidity is merged into its winner (50% boost, 30% fixed-rate consolation for its holders, 15% prize pot, 5% treasury) and the last coin is redeemable for its pool plus the prize pot. The problem: launchpad coins have no mechanic beyond the chart. Here the rules, the odds and the payouts live in one contract and every outcome can be reproduced from public state.

NEAR's role: the whole game is one Rust near-sdk contract (fera-arena.testnet) with an internal multi-token ledger instead of one token contract per coin, so a launch, a trade or an epoch costs only a few Tgas. Randomness is the NEAR block seed, read at least three blocks after the epoch lock, so the odds are frozen before the seed exists. Players get a browser burner key funded by a keeper, so there is no wallet popup, seed phrase or gas prompt in the game loop. A permissionless keeper only provides liveness; it cannot choose outcomes.

Honest scope: this is a port of our earlier Monad version (tag monad-final). The NEAR contract, the keeper port, the event feed, the burner wallet and the parity vectors were built in the hackathon window. The Rust math is bit-exact with the Solidity libraries, proved by 6,100 curve rows, 11,349 combat rows and a 258-step scenario replay generated from the real Solidity contracts. It runs on testnet with play money and is not audited. Coins are ledger assets, not NEP-141 tokens. The README states the validator-skip limit of block randomness and the deployer key still on the testnet account.
```

## 4. Submission checklist

Sources: `SUBMITTING.md`, `HACKATHON.md` (checked 2026-11-10) and the project plan. Status as of this draft; update the evidence before submitting.

| # | Item | Status | Evidence or next step |
|---|---|---|---|
| 1 | Repository is public | done | the repository answered as public on 2026-11-10 (GitHub API `private: false`); recheck before submitting |
| 2 | Tags and branches pushed (`monad-final`, `monad-archive`, `near`; `near-submission` at the freeze) | partly | `monad-final`, `monad-archive`, `near` are on origin; `near-submission` does not exist yet; push needs the lead's approval |
| 3 | README has "do X, see Y" steps and the Monad baseline and diff link | done, with placeholders | `README.md` sections 1, 2 and 9; the hosted URL is a placeholder |
| 4 | README lists libraries and AI-generated code | done | `README.md` section 11, derived from `git diff monad-final near` |
| 5 | No keys or secrets anywhere in the repository history | done, rescan before the freeze | full-history scan on 2026-11-10, see section 5 |
| 6 | A `LICENSE` file (rule Q-014: any license, file required) | missing | add a license file (MIT is fine); not created by the submission role |
| 7 | Hosted demo up and left up to 2026-11-18, ideally 2026-11-25 | not done | keeper (Railway) and web (Vercel) are prepared in the repository but not deployed |
| 8 | Three consecutive clean testnet rounds logged with timings | not done | the integration run (D3) waits for the keeper restart |
| 9 | Demo video recorded (90 s script above) | not done | lead records; a rough capture right after the freeze is the insurance |
| 10 | X post published: built at NEAR HACKATHON, `@NEARProtocol`, `#NEARHackathon`, video attached | not done | lead posts; draft in section 2 |
| 11 | Mainnet NEAR account for the payout | not done | lead creates it; never created by an agent |
| 12 | Tracks selected (`games`, plus `memecoins` or `open`) | decision | see the track note in section 3 |
| 13 | Form payload checked: name 2-80, size value, description 20-2,000 characters, both links present | draft | texts in section 3; the full JSON payload is shown to the lead before sending |
| 14 | Submit before the internal target (2026-11-14 12:00 UTC); hard limit 2026-11-14 23:59 UTC | not done | the lead submits; an agent shows the payload and waits for an explicit yes |
| 15 | Second project entered by the same person | no | none, so no cross-naming needed |

## 5. Secret scan of the full git history (D7a)

Run on 2026-11-10 over every ref (`git rev-list --all`: all branches, `origin/*`, the tag `monad-final`; 59 commits).

- Tracked file names ever added: no `.env` (only `.env.example`, whose variable values are empty in every version), no keystore, no PEM or key file, no `contracts/broadcast` (ignored and never tracked).
- Content patterns searched with `git grep` over all revisions and `git log -S`: NEAR `ed25519:` secret keys (80 or more base58 characters), PEM and OpenSSH private key headers, GitHub, OpenAI, Slack and AWS style tokens, JWTs, `Bearer` literals, private key assignments of 64 hex digits, key-like assignments with long values, RPC URLs with embedded keys, query-string keys, `-S PRIVATE_KEY=0x` and `-S PRIVATE_KEY=ed25519`.
- Result: no finding. The only `ed25519:` strings of key length are one 44-character public-key test fixture in `keeper/test/api.test.ts`; 64-hex strings occur only as fixture block ids, transaction hashes, seeds, code hashes and Cargo checksums; `mnemonic` and `PRIVATE_KEY` appear only as variable names, redaction rules and documentation.
- Local only, not in history: an ignored `.env.local`, the untracked `demo-video/` and `pitch/` folders, and secrets under `~/.config/animal-near` (outside the repository). Unreachable dangling objects exist in the local `.git` and are not part of any pushed ref.
- Not a secret but worth knowing: the arena testnet account still has one full-access key; see `README.md` section 6.
