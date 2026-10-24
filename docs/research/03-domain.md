# 03 — Domain

> PM note (2026-10-19, revision 2): hackathon and competition findings (Finding 2, Recommendations 1-3, the demo script timing) are informational only. There is no competition target. Comparables, risks and guardrails still stand.

Date read for every URL below: 2026-10-19. Author: Track 03 research agent. Scope: Monad facts, hackathons, comparables, assumption check A1-A12, demo economics, risks.

Method note. WebFetch returns model-written summaries of pages, and WebSearch returns summaries of search results. Where a number comes from a summary of a page I could not read in full, or from a third party, I say so. Items marked "analysis" are my own reasoning, not sourced facts.

## Summary

- Monad mainnet is live (chain id 143, launched 2025-11-24). The testnet is live (chain id 10143, reset from genesis on 2025-12-16, current testnet node v0.16.5 released 2026-10-15). Blocks are 300 ms with 600 ms full finality since a July 2026 hard fork. Public RPCs are rate-limited (15-50 requests per second depending on provider), which matters for a 30-coin live arena.
- The only large Monad competition in this window is **Metropolis** (Monad Foundation, $250,000+, four tracks, build window 2026-09-01 to 2026-10-13). **Its submission deadline passed six days ago.** Judging runs 2026-10-14 to 2026-10-27 and winners are announced 2026-11-03. Metropolis publishes no judging rubric and no required integrations. Pre-existing code is allowed only if the work shown was built during the six weeks. I found no extension, no late-submission rule and no "Monad Mission" event. One page (`hackathon.monad.xyz`) still shows "Intake · Open", which conflicts with every other source; the user must verify on the platform.
- The only things still ahead are one-day Monad Blitz events: Jogja Vol. 2 (2026-10-24, registration closes 2026-10-20 or 2026-10-21 depending on which language section you read), Ankara v4 (2026-10-24) and Mumbai Devcon Edition (2026-11-04, $5,000 pool). They are build-in-a-day formats judged by audience vote, so a full 3D on-chain arena only fits as a pre-built project if the rules allow it, and the rules do not say.
- The likely target is Metropolis, but only if the team already submitted by 2026-10-13. If not, there is no open Monad competition that matches this scope as of today. This is the first thing the user must confirm.
- Comparables show three recurring lessons: bonding-curve launchpads (nad.fun, pump.fun) set the expected liquidity primitive; every "token fight" product that pays winners from losers' money invites a gambling framing (pump.fun faces an unproven RICO class action alleging that); and open on-chain state makes combat outcomes front-runnable (Dark Forest and the Splinterlands example). The merger mechanic is credible only with pre-announced rules, a trading freeze and holder snapshot before the result is known, caps, and a claim-based redistribution.
- Of A1-A12: A1 and A11 are confirmed, A2 and A12 are partly confirmed, A7 is unverified and the highest-risk, and no assumption is flatly refuted. A2 carries a new risk: the Metropolis intake page lists chain id 143 (mainnet).

## Findings

### 1. Monad facts that matter for a demo

| Fact | Value | Source |
|---|---|---|
| Mainnet status | Live. Launched 2025-11-24 with the MON token. Docs show current mainnet metrics. | The Block via search result, https://www.theblock.co/news/ecosystems/2025-11-24-monad-mainnet-launches-380094 ; https://docs.monad.xyz/ai/current-facts.md |
| Mainnet chain id / RPC | 143; `https://rpc.monad.xyz`, `wss://rpc.monad.xyz` | https://docs.monad.xyz/developer-essentials/network-information |
| Mainnet node version | v0.16.4, released 2026-09-28 (network-information page and releases page). The `current-facts.md` page still says v0.16.1, so it is stale. | https://docs.monad.xyz/developer-essentials/changelog/releases |
| Testnet status | Live. Chain id 10143, version v0.16.5 (released 2026-10-15, not yet on mainnet). Reset from genesis 2025-12-16. No deprecation notice seen (releases page was truncated at 100,000 of 138,593 characters, so a later notice cannot be ruled out). | https://docs.monad.xyz/developer-essentials/testnets ; releases page above |
| Testnet RPCs | QuickNode `https://testnet-rpc.monad.xyz` 50 rps (25 rps for `eth_call`/`eth_estimateGas`), batch 100, WebSocket yes, archive yes. Monad Foundation `https://rpc-testnet.monadinfra.com` 20 rps, no batching, WebSocket yes. Ankr 300 per 10 s. | https://docs.monad.xyz/developer-essentials/testnets |
| Mainnet public RPC limits | QuickNode 25 rps; Alchemy 15 rps; Goldsky Edge 300 per 10 s (batch 10); Ankr 300 per 10 s; Foundation 20 rps (batch 1). | https://docs.monad.xyz/developer-essentials/network-information |
| Block time and finality | 300 ms blocks, 300 ms speculative finality, 600 ms full finality. A hard fork in July 2026 (MIP-12) cut them from 400 ms and 800 ms. | https://docs.monad.xyz/ai/current-facts.md ; https://monad.xyz/blog/monad-ecosystem-highlights-july-2026 |
| Gas model | Charged on gas limit, not gas used. Block gas limit 150M, per-transaction limit 30M. | https://themonadpulse.substack.com/p/the-monad-pulse-018 ; current-facts.md |
| Storage change | MIP-8 (page-encoded storage) live on mainnet since 2026-09-02 (MONAD_TEN). | releases page; https://monad.xyz/blog/monad-ecosystem-highlights-september-2026 |
| Testnet faucet | `https://faucet.monad.xyz` is the official one; the docs state no limits. My fetch of it returned HTTP 429, so I could not read its terms. Third-party faucets differ: Alchemy lists 0.1 or 1 MON per day (cached pages disagree), QuickNode lists a claim every 12 hours. These are third-party and may be stale. | https://docs.monad.xyz/developer-essentials/testnets ; https://www.alchemy.com/faucets/monad-testnet ; https://faucet.quicknode.com/monad (via search) |
| Mempool and MEV | FastLane (2026-01-15): "Monad does not yet have a public mempool." Validators run an opt-in sidecar that orders top-of-block and backrun bundles. The post does not discuss sandwiching. I found no measured sandwich frequency on Monad. | https://www.fastlane.xyz/blog/fastlane-mev-protocol |
| Ecosystem size (2026-09-30) | DeFi TVL $1.01B+, 4.3M+ mainnet wallets, 860M+ transactions, $33.1B cumulative DEX volume, 170+ live apps, about 200 validators. | https://monad.xyz/blog/monad-ecosystem-highlights-september-2026 |
| Apps seen | Trading: Drake, 1inch, Moose Trade, o1 (launchpad stack, "over $1B launchpad volume in two months"). Launchpads: Crystal, o1, nad.fun (mainnet contracts published). Token sales via Sonar. Kuru is a DEX and a Metropolis sponsor. | September highlights above; https://monad.xyz/blog/monad-ecosystem-highlights-july-2026 ; https://nad.fun/skill.md ; https://monad.xyz/metropolis |

What "real-time" implies for a live arena (analysis, built on the sourced numbers): a 300 ms block and 600 ms finality mean the chain is faster than the prototype's 0.45 s strike cadence, so the client can animate a clash from emitted events almost as they land. The constraint is not block speed. It is the public RPC rate limit (15-50 rps) and the entropy or keeper round-trip, which this track did not measure. A browser that polls 30 pools through a public RPC will hit the limit; the indexer and RPC choice belongs to Track 02.

### 2. Hackathons and competitions open now or recently closed

I searched Monad's official pages, Luma, Rise In, DoraHacks, Devpost and ETHGlobal. **Nothing named "Monad Mission" exists in what I found.** I found no Devpost listing for a Monad event, no ETHGlobal 2026 event with Monad listed as a sponsor in the results I saw, and no DoraHacks event in 2026. (A search result suggested a "Monad Madness" $500,000 DoraHacks event. Cross-checking showed that is the 2024 Bangkok edition, deadline 2024-10-25; the DoraHacks page returned HTTP 405. I treat it as not current.)

| Name | Sponsor | Dates | Prize | Tracks | Required integrations | Judging criteria | Submission format | Link | Fit |
|---|---|---|---|---|---|---|---|---|---|
| Metropolis | Monad Foundation | Build 2026-09-01 to 2026-10-13; **submissions closed 2026-10-13**; judging 2026-10-14 to 2026-10-27; winners 2026-11-03 | $250,000+. $30,000 per track split evenly across 3 teams; $25,000 grand champion; plus sponsored prizes and 22 sponsor bounties ($1,000-$10,000, some in credits) | 1 Onchain Finance and Trading; 2 Consumer Products and Payments; 3 Social, Attention and Culture; 4 Trust, Identity and AI Infrastructure | None required. | Not published. Page says only "judged per track" and "Judges need to be able to verify what you built during the six weeks." | "A working product with a public project profile: a demo, a short write-up, and a link to the code." Open source optional. Apply at hackathon.monad.xyz; choose a track on application. | https://monad.xyz/metropolis ; https://monad.xyz/developers/hackathons/metropolis | **High thematically (tracks 2, 3, 1), but closed.** Status unknown for this team. |
| Monad Blitz Jogja Vol. 2 | Monad Foundation, hosted at GIK UGM | 2026-10-24, 09:00-21:00 WIB; registration closes 2026-10-21 (English section) or 2026-10-20 (Indonesian section) | "COMING SOON" | None; build and ship a consumer-ready dApp | None | Not specified. Community vote at 20:30. | Submission 18:30, pitch 18:45; teams up to 3; code freeze 18:00; host approval needed. No repo format stated. | https://luma.com/blitz-jogja-okt-2026 | Medium. Pre-existing work not addressed by the page; demo-first and audience-voted, which suits a 3D scene. |
| Monad Blitz Ankara v4 | Monad Foundation | 2026-10-24 | Not listed | Not listed | Not listed | Not listed | Not listed | https://lu.ma/blitz-ankara-24-Oct (listed on https://monad.xyz/developers/hackathons; page itself not fetched) | Low (location; details unread). |
| Monad Blitz Mumbai, Devcon Edition | Monad Foundation | 2026-11-04, 09:00 | $5,000 shared among winners | Open theme, must be built on Monad | None | Not specified | Teams of 2-3; demo a working MVP | https://www.startupgrantsindia.com/events/monad-blitz-mumbai-devcon-edition (third-party listing) | Medium. Pre-existing work not addressed. |
| Nitro (accelerator) | Monad Foundation | Cohort 1 done; cohort 2 applications "will open soon" (July 2026 page); no confirmed date | Up to $500K per team across 15 teams, 3 months | n/a | n/a | Admission needs four consecutive public weekly ship logs | Application plus ship logs | https://monad.xyz/blog/home-for-builders ; https://monad.xyz/blog/monad-ecosystem-highlights-july-2026 | Low now; a later option. |
| ETHGlobal Mumbai | ETHGlobal | 2026-11-05 to 2026-11-07 | Sponsors listed (EF, ENS, Chainlink, Uniswap, 1inch and others); **Monad not listed** in what I saw | n/a | Per sponsor | n/a | n/a | https://www.criptonoticias.com/calendario-eventos/ethglobal-new-york-2026/ (via search; calendar site, not ETHGlobal) | Low. |
| Moltiverse | Monad, nad.fun and others | 2026-02-02 to 2026-02-15 (Notion page says "2025", TechFlow says 2026); closed | $200K | Agent + Token ($140K), Agent only ($60K) | Agent track required a nad.fun token | Not read | Not read | https://monad-foundation.notion.site/External-Moltiverse-Hackathon-2fa6367594f2802baf07f6aa900599e7 | Closed; precedent only. |
| Rebel in Paradise | Monad (per search summary) | 2026-01-19 to 2026-02-28 | $20K cash plus $20K credits | AI-focused | Not read | Not read | Not read | https://everstake.one/resources/blog/monad-ignites-the-builder-economy-hackathons-ai-and-a-3-month-accelerator | Closed. |

Conflicts and gaps inside the Metropolis record (so nobody builds a plan on one source):
- Deadline: official page says 2026-10-13; Rise In header says 2026-10-12 and lists an end date of 2026-11-02 and "Applications closed" (https://www.risein.com/monad/monad-metropolis-hackathon).
- Grand prize: official page says $25,000; a Luma London page reportedly says $30,000 for the overall winner (via search summary, https://luma.com/metropolis-lon-oct-2026).
- Intake status: `https://hackathon.monad.xyz` shows "Intake · Open", "$250,000+", "Network: Monad, Chain ID 143", but gave no rules. All other sources say submissions closed. I cannot tell whether that label is stale.
- The official rules live on the application platform behind a login (GitHub, Google or Discord). I could not read them. They hold eligibility and country restrictions.

Metropolis sponsor bounties that map to this project (analysis of the 21 bounties I could see; moot unless already entered): Envio "Best Use of Envio" ($1,000) plus an Envio sponsored prize ($5,000) fit an indexer; Kuru "Bring New Assets and Markets to Kuru" ($5,000); Monad Foundation "Best Community Team Project" ($5,000); Privy ($5,000) and Dynamic ($5,000) for wallet onboarding. None mentions gaming or nad.fun.

Likely target. Metropolis, because it is the only large live-judged Monad competition and its brief ("working product", demo, write-up, code link) matches this repo. The honest status is "closed for new submissions". What the user must confirm:
1. Was a project submitted to Metropolis by 2026-10-13? If yes, which track, and what was in that submission? Judging runs to 2026-10-27, so work shown now may be limited to what judges can verify.
2. If no: which competition is "the competition" in the user's message? It may be a non-Monad event, an internal event, or a future Blitz.
3. Does the competition require mainnet (the intake page shows chain id 143) or accept testnet?
4. Is the prototype's origin date inside the build window? The HTML file's modification time is 2026-10-19 03:00 local, which only reflects when it was copied here, so file metadata cannot answer this.

### 3. Comparable products

| Product | Mechanic | How value or liquidity moves | Good | Failed or risky | Source |
|---|---|---|---|---|---|
| nad.fun (Monad) | Bonding-curve launchpad. Graduation at "target reserves" moves a token to a Uniswap V3 pool. Mainnet and testnet contract addresses are published (bonding curve router, lens, V3 factory, WMON). | Buyers fund the curve; at graduation the reserves seed a V3 pool. | Existing Monad primitive with an API (10 req/min without key, 100 with) and a lens contract; Moltiverse's Agent + Token track required a nad.fun token. | Official page gives no numeric graduation target or fee. Third parties say about 1% per trade and about 10 MON creation (unverified, conflicting on the DEX: one says Capricorn CLMM). | https://nad.fun/skill.md ; https://www.alchemy.com/dapps/nad-fun |
| pump.fun (Solana) | Bonding curve, about 800M tokens on the curve, graduation at about 85 SOL (third-party). PumpSwap fee 0.25% (0.2% LPs, 0.05% protocol) per The Block. Sources conflict on whether graduation goes to PumpSwap or Raydium. | Same pattern as above. | Defined the "everyone can launch" template. | A consolidated class action (S.D.N.Y.) alleges unlicensed gambling and RICO, claiming $4B-$5.5B extracted. Allegations are unproven; I found no ruling or SEC action. | https://www.theblock.co/post/347360/pump-fun-launches-dex-called-pumpswap-to-instantly-migrate-graduated-tokens ; https://decrypt.co/331528/solana-pump-fun-amended-rico-suit-alleging-meme-coin-gambling |
| Dark Forest (Ethereum) | Space-conquest game with fog of war; zkSNARKs prove moves without revealing coordinates; state fully on-chain. | No token value moves in the core game. | Showed that hidden information on a public chain needs cryptography; its docs describe permissionless community contracts around the core game ("autonomous world"). | Not directly about liquidity. The Splinterlands example in the same coverage: team choices went on-chain at lock-in, so an opponent could read the chain and counter. | https://naavik.co/deep-dives/dark-forest-beacon-of-light/ ; https://medium.com/zeroknowledge/zero-knowledge-the-game-688ec3709b41 (via search). My direct fetch of zkga.me returned only a title. |
| BATTLEMEME | Fair-launch memecoins fight to "graduate". Built on Uniswap V4 per the site. | Per the site as summarised by a search tool: the winner gets two liquidity positions; one is a buy wall funded by every loser's escrowed ETH; losing holders can exchange into winner tokens at a rate locked at elimination. | The closest analogue to this project's merger. The "rate locked at elimination" idea gives losers a defined claim. | **Unverified.** The page body would not load in my fetch (title only). A second search found nothing on it. Contracts and audits unchecked. | https://battle.meme/ (via search summary only) |
| League of Memes (Solana) | Pick memes, two snake-drafted teams, best average price movement wins. | Winning team splits 97% of the pot. | Clear rules. | A pot paid from entrants is a wager; page stats are unverifiable. | https://www.lom.wtf/ (via search summary) |
| Meme Battle! (Solana) | 1v1 meme battles with SOL wagers, token $MEBA. | Player vs player wagers. | n/a | Wagering. Listing only. | https://dappradar.com/dapp/meme-battle (via search summary) |
| LastMonad (Monad testnet) | Elimination game: each round players pick heads or tails; the minority survives. Pool creators stake MON and earn 12% of the prize. | Entrants fund a prize pool. | Fast rounds suit Monad; wagmi for writes and an Envio indexer for reads. | Prize pool from entrants: gambling framing risk. No hackathon result stated. | https://hackquest.io/projects/Last-Monad |
| The Crucible (Monad testnet) | Agent battle royale with commit-reveal combat; last agent standing wins MON. | Prize pool. | Commit-reveal is the standard answer to open-state front-running. | Source is a skill listing, not primary. | https://getclawkit.com/skills/official-velikanghost-crucible (via search; my direct fetch returned HTTP 500) |
| Moltiverse winners | 16 winners from 400+ submissions; Agent + Token track winners include Claw IO, Soulbyte, Monagotchi, ChainMMO. A battle-royale entry by the Claw IO author was among early submissions (inference, not confirmed). | n/a | Shows the Monad Foundation rewards on-chain games tied to tokens. | Winner details not read. | https://themonadpulse.substack.com/p/the-monad-pulse-018 |
| Axie Infinity (Ronin) | Play-to-earn battles; SLP reward token with no cap. | Emissions paid players. | Mass adoption after the Ronin move. | SLP fell about 94% from its July 2021 high to about $0.01 by early 2022; emissions outran sinks. | https://www.theblock.co/post/146915/the-decline-of-axie-infinity ; https://www.fxstreet.com/cryptocurrencies/news/axie-infinity-reduces-slp-emissions-to-prevent-collapse-202202081128 |
| Other Monad games | Lumiterra (open-world MMORPG), Bro.fun (beer-pong wagering), MapleStory Universe, Monad Go (AR creature game with a battle arena, from an Ankara hackathon). | n/a | Gaming exists on Monad. | Which are fully on-chain is unverified. | https://www.mexc.com/news/186674 (via search) ; https://github.com/hsankc/MonadGO |

What the comparables teach (analysis):
- No sourced product combines a 3D live arena, per-coin pools, PvE and a merger. That is a differentiator and also means no precedent for judges.
- Products that pay winners from entrants' money are described as wagers by critics and plaintiffs. This project's merger is the same flow in a different costume, so the language and guardrails matter (see Guardrails).
- Axie shows that rewards must be funded by participants or sinks, not emissions. The merger is a transfer, not an emission, which is a strength to state.
- Hiding or delaying information (commit-reveal, Dark Forest) is the established fix for front-running on open state.

### 4. Assumption check A1-A12

| # | Verdict | Evidence |
|---|---|---|
| A1 Chain is Monad; ids and RPC verified | **Confirmed** | Mainnet 143, testnet 10143, RPC and explorers from https://docs.monad.xyz/developer-essentials/network-information and /testnets. Explorers: MonadVision and Monadscan. |
| A2 Competition demo, judged live, testnet acceptable | **Unverified, with a new risk** | No competition is confirmed for this project. Metropolis asks for "a working product" with demo, write-up and code link; it does not say testnet or mainnet, but its intake page lists "Chain ID 143". Blitz events say participants deploy a prototype on testnet (https://monad.xyz/blog/home-for-builders). Ask the user. |
| A3 30-coin cap is the real demo size | **Unverified** | Only the diagram says "0 / 30" (`docs/download (1).png`, stage 1). No competition rule touches it. The prototype's `targetPopulation = 60` is at `monster_arena_3d_prototype (1).html:2649`. Treat 30 as a config constant. |
| A4 PvE monsters are NPC enemies | **Unverified** | Diagram stage 2 shows orange horned creatures distinct from coin tokens. Design choice, not testable externally. |
| A5 Coin is an ERC-20 with its own pool from a factory | **Unverified, feasible** | No competition requires a particular DEX. nad.fun and pump.fun both use curves then a DEX (above). A factory-made ERC-20 per coin matches both. Pool type is Track 02's decision. |
| A6 Combat outcome is chain-resolved with verifiable randomness; client replays events | **Unverified as a rule, supported as practice** | Metropolis judges must "verify what you built". Dark Forest, Splinterlands and Crucible coverage support hiding or committing inputs. Pyth Entropy on Monad: forum titles hint it exists (one titled "Monad Mainnet Entropy Fee 40 MON") but I did not confirm the address or fee from official docs; Track 02 owns this. |
| A7 Merge split: auto-buy, redistribution, 70/20/10 | **Unverified, highest risk** | No source validates the split. BATTLEMEME (unverified) uses a different shape: escrowed loser value as a winner buy wall plus a locked-rate swap for losing holders. In a constant-product pool, moving the loser's reserves out leaves the loser's tokens against an empty pool, so holders need a snapshot-based claim, not an AMM exit (analysis). The split is a parameter the user must approve. |
| A8 Spectator needs no wallet | **Unverified, plausible** | Metropolis's consumer track asks for "the user's first five minutes". Blitz Jogja uses a crowd vote at 20:30, so spectators matter. Read-only access is cheap with an indexer. |
| A9 Prototype scene kept verbatim | **Unverified (user instruction)** | Metropolis allows existing projects only if "what you show on 13 Oct should have been built during the six weeks." The prototype's authorship date is unknown. If it predates 2026-09-01, the new work must be the chain integration and say so. Blitz rules do not address it. |
| A10 Five archetypes map to five elements; chain stores `monsterId` and `skinId` | **Unverified, internal** | Inferred from `MONSTER_CATALOG`; no external source applies. |
| A11 English product; translate Indonesian strings | **Confirmed (strings exist)** | Present at lines 394 "Aktivitas Saat Ini (Live Action)", 426 "Lokasi & Lawan", 438 "Uji Animasi & Ekspresi (Live 3D)" in the prototype. Translation is still to do. |
| A12 No fiat, no KYC, no custody; testnet funds | **Partly confirmed** | The project design fits it. Competition side is unknown: Metropolis eligibility and country restrictions sit in rules I could not read; Blitz Jogja needs host approval; prize payout terms for any event are unread. |

No assumption is refuted. A2, A7 and A9 are the ones where a wrong answer changes the plan.

Is "loser's liquidity merges into the winner" economically and legally sensible? (analysis, plus the cited legal context)
- Economically it is a defined transfer between pools, so it is not an emission and cannot inflate like Axie's SLP. It is exposed to five attacks:
  1. Known-loser front-running: if stats (pool size, level) predict the result, a trader buys the winner or exits the loser before the clash settles.
  2. Holder-snapshot gaming: buying the losing token just before a snapshot to farm redistribution, or splitting across wallets.
  3. Wash trading to inflate level or pool size, which feeds combat stats.
  4. Sandwiching around the merge's own swap (the auto-buy into the winner). Monad has no public mempool as of FastLane's 2026-01-15 post, but the keeper's transaction and the contract state are public, and I found no data on Monad sandwiching.
  5. Rug-style drains if the creator or an admin can pull liquidity.
- Legally: the SEC staff statement of 2025-02-27 says certain meme-coin transactions are not securities offers, but it is staff opinion, fact-specific, and not law (https://www.ropesgray.com/en/insights/alerts/2025/02/meme-coins-sec-staff-says-this-is-fine). The pump.fun class action shows plaintiffs will frame token games as gambling (https://decrypt.co/331528). Indonesia's ITE Law Article 27(2), as amended by Law No. 1 of 2024, penalises distributing or facilitating access to electronic gambling content, up to six years and a fine of up to one billion rupiah (secondary sources via search). I found nothing on whether crypto-game wagers fall under it. This is research context, not legal advice.

### 5. Demo economics

What a judge needs to see in under three minutes: a coin launched, trades, a clash, a merger with visible value flow, a Chosen One. Budget from the diagram's four stages is in the demo script below.

What is realistic on testnet with fake liquidity (analysis, with sourced limits):
- Use a mintable mock quote token for all liquidity. Real testnet MON is then needed only for gas, which avoids the small, changing faucet drips (0.1-1 MON per day on Alchemy, per 12 hours on QuickNode; official faucet limits unknown).
- Seed the arena with a script before the demo. Monad produces a block every 300 ms, so 30 factory calls fit in seconds, but public RPCs allow 20-50 rps and the Foundation testnet RPC allows no batching. Use a dedicated provider key for the demo and throttle the seeding script.
- Start the live demo at roughly 12 of 30 coins, not 0. An empty arena wastes the first minute. Show the counter moving as one new coin is launched live.
- Shorten timers (clash window, merge timelock, PvE cadence) through config constants and say so on screen. Judges accept a disclosed fast-forward more readily than a hidden one.
- Pre-stage the endgame state (two coins left) so stage 4 does not depend on 30 coins resolving in real time.
- Keep a recorded fallback of the full run in case the RPC or keeper fails during judging.

### 6. Risks

| Risk | Detail | Mitigation (see Guardrails) |
|---|---|---|
| Regulatory framing | "Game, not gambling." Pump.fun faces an unproven gambling-framed RICO case; LastMonad, League of Memes and Meme Battle! all pay winners from entrants. SEC staff statement is not law. | Testnet only, no entry fee redeemable for value, no yield or "bet" language, rules on screen, legal wording reviewed by the user. |
| Copyright | Monster art is procedural and original per the PRD (`prd-inferred.md`, A10 and product paragraph). Third-party token logos and the diagram's Ethereum-style coin icon are not original. Fonts are from Google Fonts. | Use only generated glyphs for coins; do not use real project logos. I did not audit asset licences. |
| MEV | No public mempool as of 2026-01-15; no measured sandwich data on Monad; FastLane describes spam-style blind backrunning. | Slippage limits, per-block trade caps, freeze and snapshot before settlement. |
| Oracle manipulation | The arena uses its own reserves, so manipulation means moving the arena's own pools. | Time-weighted reserve values, per-wallet caps, no external price feeds for combat stats. |
| Griefing the 30-slot cap | Spawn spam fills slots with junk coins. | Creation fee plus locked deposit, per-wallet limit, queue, slot freed only on elimination. |
| Rate limits | 15-50 rps on public RPCs. | Indexer plus SSE or WebSocket to the client (Track 02). |
| Randomness availability | Entropy address and fee on Monad unconfirmed here. | Commit-reveal fallback (Track 02). |
| Event status | Metropolis closed; Blitz events are one-day. | User confirms target (above). |

## Recommendations

1. Resolve the target first. Ask the user whether a Metropolis entry exists. If yes, align the narrative to the track chosen. If no, say plainly there is no open Monad competition matching this scope and choose between Blitz Jogja Vol. 2 (register by 2026-10-20 to be safe), Blitz Mumbai Devcon Edition (2026-11-04) or a non-Monad event. Do not tell judges the project was built in a window it was not.
2. If Metropolis was entered, pitch Track 3 (Social, Attention and Culture) first and Track 2 second. The arena is a spectator and community product more than a trading product, and it has no payments angle. Track 1 only if the pool and merger mechanics are what the team can defend.
3. State provenance honestly: the prototype is pre-existing (date unknown); the chain contracts, keeper, indexer and wiring are the new work. Log commits so a judge can verify.
4. Build on testnet 10143 for the demo, with all value in a mock quote token, and keep mainnet as a stated non-goal until the user says otherwise.
5. Make the merge rules a public, immutable-per-round artifact shown in the UI before a round starts (see Guardrails).
6. Plan the demo for 12 of 30 coins at start, shortened timers, pre-staged endgame, and a recorded fallback.
7. Have the user approve the split in A7 explicitly. Treat 70/20/10 as a placeholder.
8. Before any real-money, mainnet or public-token step, have the user get legal advice for the jurisdictions involved.

### Guardrails that make the merger credible

1. Rules published before the round: split percentages, caps, timers and the formula for combat stats are shown in the UI and read from an immutable per-round config in the contract.
2. Clash window with a trading freeze: when a clash is committed, trading in the two coins pauses (or is capped per block) until settlement, so nobody can trade on a known outcome.
3. Snapshot before the result: holder balances for redistribution are checkpointed at the clash-commit block, before randomness is requested.
4. Merge timelock: settlement executes a fixed number of blocks after the result is emitted, so the effect is visible and auditable before funds move.
5. Claim-based redistribution: losing holders claim pro rata against the snapshot rather than through the loser's pool, so there is no empty-pool exit race.
6. Caps: maximum share of a loser's reserve moved per clash, maximum protocol fee, per-wallet cap on holdings per coin, per-block trade size cap.
7. Verifiable randomness and no keeper discretion: the keeper can only call settle with a randomness proof or reveal; it cannot choose winners. Admin functions limited to pause, with a delay.
8. No rug paths: fixed supply minted into the pool at creation; no owner mint; liquidity not withdrawable except by merge rules; factory-deployed token code is identical for all coins.
9. Anti-wash and anti-spam: time-weighted reserve values for stats, creation fee plus locked deposit, per-wallet coin limit, slot reuse only after elimination.
10. Transparency: every merge emits an event with auto-buy amount, redistribution amount, fee and snapshot block; the UI links each to the explorer.
11. Language: "arena", "clash", "merge"; never "bet", "wager", "payout" or "guaranteed". Testnet banner shown at all times.

### Three-minute demo script

Setup before recording: arena seeded to 12 of 30 coins with a mock quote token; timers shortened and disclosed in a corner label; a funded burner wallet; a second browser with a spectator view (no wallet); explorer tabs open on the factory and arena contracts; a recorded fallback ready.

| Time | Diagram stage | What the audience sees | What is real |
|---|---|---|---|
| 0:00-0:20 | Framing | One line of pitch: coins are monsters, every coin has a pool, losers merge into winners. Rules card shows split, caps and "testnet, no real value". | Contract addresses on screen. |
| 0:20-0:55 | 1 Arena Spawn | Counter reads 12/30. Launch a coin through the modal with the burner wallet; the monster spawns on the island and the counter moves to 13/30. Open the inspector: that coin's own pool and reserve. | Factory transaction, `Spawned` event, pool created. |
| 0:55-1:35 | 2 PvE Leveling | Coins fight NPC monsters; levels and pool sizes change on the leaderboard. Make one buy on a coin and show its reserve move. | Keeper-posted PvE results, trade event, indexer feed. |
| 1:35-2:30 | 3 Liquidity Merger | A clash is announced: countdown, trading-freeze banner, snapshot block shown. Result lands; the winner's blue "Auto-Buy Boosts Winner" stream plays, the green "Value Redistributed to Losers" streams split to many small pools. Open the explorer: the merge event with auto-buy, redistribution and fee amounts. A losing holder claims their share live. | Randomness, settlement transaction, claim transaction. |
| 2:30-2:55 | 4 The Chosen One | Fast-forward to the pre-staged end state: the last coin is crowned and shows one consolidated pool, rank 1. | Final state read from the chain; disclosed that the endgame was staged. |
| 2:55-3:00 | Close | Guardrails slide: freeze, snapshot, caps, timelock, no keeper discretion. | n/a |

## Implications per role

### Smart-contracts
- Put the guardrails above into the contract design from day one: clash commit with snapshot block, trading freeze, merge timelock, immutable per-round config, caps, claim-based redistribution, no owner mint, creation fee plus locked deposit, per-wallet limits.
- The merge cannot use an AMM exit on the loser's pool and leave holders with an empty pool. Redistribution should be a snapshot-backed claim (analysis).
- The quote asset should be a mintable mock token on testnet. Gas is charged by gas limit on Monad, so set tight gas limits on keeper calls (https://themonadpulse.substack.com/p/the-monad-pulse-018).
- Emit rich events (`Spawned`, `PveResult`, `ClashCommitted`, `ClashSettled` with auto-buy, redistribution, fee, snapshot block, `Claimed`, `ChosenOne`). The demo depends on them.
- nad.fun's mainnet and testnet addresses are published, but the official page states no graduation target or fees. Do not depend on it unless Track 02 chooses to.

### Frontend / 3D integration
- The scene replays chain events. Needs a visible rules card, a stage and round banner, a clash countdown with trading-freeze state, snapshot block display, merge stream visuals mapped to the diagram's blue (auto-buy) and green (redistribution) flows, a claim button, and the Chosen One screen.
- Spectator mode with no wallet must work (A8). Show a "testnet, no real value" label permanently.
- Avoid wording that reads as gambling in any string; translate the three Indonesian strings noted under A11.
- Do not poll pools from the browser through a public RPC (15-50 rps). Read from the indexer stream.
- The demo starts at 12 of 30 coins; the UI must handle partial population and a pre-staged endgame.

### Indexer + keeper (backend)
- The keeper holds the only discretionary power, so limit it to calling settle with randomness or reveal data; log every call. Use a dedicated RPC key, not the public endpoint, and throttle seeding to stay under 20-50 rps.
- Handle 300 ms blocks: keep a nonce queue, and treat events as final only at the finality level you choose (speculative 300 ms vs full 600 ms).
- Provide one ordered event stream to the client and a replay endpoint for the demo.
- Envio HyperIndex fits the Metropolis Envio bounty and prize if the team is entered, and LastMonad already pairs wagmi writes with an Envio indexer. This is a fit note, not a recommendation; Track 02 decides.
- The seeding script and the fast-forward admin path belong here; keep both behind config and out of the repo secrets.

### Product / demo / pitch
- Confirm the target competition and track before writing the pitch (see Recommendations 1-3).
- Pitch the arena as a spectator-first, community game on a 300 ms chain; lead with the guardrails because judges will ask about rug and front-running.
- Provenance statement: prototype pre-existing, chain layer new. Keep a commit log.
- Use the three-minute script above; disclose shortened timers and the staged endgame.
- Language: "game", "arena", "testnet". Never "bet", "payout", "yield" or price promises.
- Decide who can speak to legal framing; do not make claims about regulation in the pitch.

## Assumptions and open questions

Open questions for the user (blocking):
1. Was anything submitted to Metropolis before 2026-10-13? Which track? Judging runs until 2026-10-27.
2. If not, what is "the competition"? There is no other open Monad competition I could find that fits this scope.
3. Testnet or mainnet? The Metropolis intake page lists chain id 143; the prompt text and the Blitz format point to testnet.
4. When was the prototype created, relative to 2026-09-01? I cannot tell from file metadata.
5. Approve or change the A7 split (70/20/10 is a placeholder) and the 30-coin cap.
6. Is the team in Indonesia, and does the user want Blitz Jogja Vol. 2 as a fallback? Registration closes 2026-10-20 or 2026-10-21, and the page is inconsistent about which.

Things I could not establish:
- Metropolis judging criteria (not published on the pages I read), full rules and eligibility (behind login), whether late submissions are accepted (not stated), and the real status of `hackathon.monad.xyz` ("Intake · Open").
- Prize amounts for Blitz Jogja Vol. 2 ("COMING SOON"), judging for any Blitz, and whether Blitz allows pre-built projects.
- Ankara v4 details and ETHGlobal sponsor lists beyond search summaries.
- Official faucet limits (HTTP 429 on my fetch).
- Official nad.fun fees and graduation target; official Pyth Entropy address and fee on Monad.
- Whether BATTLEMEME, League of Memes, The Crucible and Meme Battle! behave as their marketing says. Only marketing pages or search summaries were available.
- Whether Monad has any current sandwiching, and whether a public mempool now exists (the cited post is 2026-01-15).
- Legal advice for any jurisdiction. Nothing here is legal advice.
- The "Monad Mission" series named in the brief: I found no such event.
- Network version discrepancy on Monad docs: `current-facts.md` (mainnet v0.16.1, testnet v0.16.2) is stale against the network-information page (mainnet v0.16.4) and the releases page (mainnet v0.16.4, testnet v0.16.5).

## Sources

All read 2026-10-19.

Monad official
- https://docs.monad.xyz/developer-essentials/network-information
- https://docs.monad.xyz/developer-essentials/testnets
- https://docs.monad.xyz/ai/current-facts.md
- https://docs.monad.xyz/developer-essentials/changelog/releases (first 100,000 of 138,593 characters)
- https://monad.xyz/metropolis
- https://monad.xyz/developers/hackathons
- https://monad.xyz/developers/hackathons/metropolis
- https://hackathon.monad.xyz
- https://monad.xyz/events (first 100,000 of 209,408 characters)
- https://monad.xyz/blog/home-for-builders
- https://monad.xyz/blog/announcing-open-2026
- https://monad.xyz/blog/monad-ecosystem-highlights-september-2026
- https://monad.xyz/blog/monad-ecosystem-highlights-july-2026
- https://luma.com/blitz-jogja-okt-2026
- https://themonadpulse.substack.com/p/the-monad-pulse-018 (newsletter, dated 2026-02-26)

Hackathon third-party and search-only
- https://www.risein.com/monad/monad-metropolis-hackathon
- https://www.startupgrantsindia.com/events/monad-blitz-mumbai-devcon-edition
- https://luma.com/metropolis-lon-oct-2026 (search summary only)
- https://monad-foundation.notion.site/External-Moltiverse-Hackathon-2fa6367594f2802baf07f6aa900599e7 (search summary only)
- https://everstake.one/resources/blog/monad-ignites-the-builder-economy-hackathons-ai-and-a-3-month-accelerator (search summary only)
- https://www.criptonoticias.com/calendario-eventos/ethglobal-new-york-2026/ (search summary only)
- https://dorahacks.io/hackathon/monadmadness (HTTP 405; 2024 edition per search cross-check)
- https://monad.xyz/blog/monads-1m-pitch-competition-monad-madness (search listing only)

Chain and ecosystem
- https://www.theblock.co/news/ecosystems/2025-11-24-monad-mainnet-launches-380094 (search summary only)
- https://www.fastlane.xyz/blog/fastlane-mev-protocol (post dated 2026-01-15)
- https://nad.fun/skill.md
- https://www.alchemy.com/dapps/nad-fun (search summary only)
- https://www.alchemy.com/faucets/monad-testnet and https://faucet.quicknode.com/monad (search summaries only)
- https://faucet.monad.xyz (HTTP 429)

Comparables and legal
- https://www.theblock.co/post/347360/pump-fun-launches-dex-called-pumpswap-to-instantly-migrate-graduated-tokens (search summary only)
- https://decrypt.co/331528/solana-pump-fun-amended-rico-suit-alleging-meme-coin-gambling (search summary only)
- https://pump.fun/docs (no mechanics on the page)
- https://battle.meme/ (title only on fetch; mechanics from a search summary)
- https://www.lom.wtf/ and https://dappradar.com/dapp/meme-battle (search summaries only)
- https://hackquest.io/projects/Last-Monad
- https://getclawkit.com/skills/official-velikanghost-crucible (search summary only; fetch HTTP 500)
- https://github.com/hsankc/MonadGO (search listing only)
- https://naavik.co/deep-dives/dark-forest-beacon-of-light/ and https://medium.com/zeroknowledge/zero-knowledge-the-game-688ec3709b41 (search summaries only; https://zkga.me returned title only)
- https://www.theblock.co/post/146915/the-decline-of-axie-infinity and https://www.fxstreet.com/cryptocurrencies/news/axie-infinity-reduces-slp-emissions-to-prevent-collapse-202202081128 (search summaries only)
- https://www.ropesgray.com/en/insights/alerts/2025/02/meme-coins-sec-staff-says-this-is-fine (search summary only)
- Indonesian ITE Law Article 27(2): academic papers surfaced by search, for example https://journals.usm.ac.id/index.php/humani/article/download/13089/6696/46899 (search summary only)

Repo
- `/home/cn/Projects/Competition/Web3/ANIMAL/docs/research/00-brief.md`
- `/home/cn/Projects/Competition/Web3/ANIMAL/docs/research/prd-inferred.md`
- `/home/cn/Projects/Competition/Web3/ANIMAL/docs/download (1).png` (4 stages)
- `/home/cn/Projects/Competition/Web3/ANIMAL/monster_arena_3d_prototype (1).html` lines 394, 426, 438, 689, 2649
