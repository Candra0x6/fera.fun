# Monster Arena on Monad: research

Back to the plan: [../2026-10-19-monad-monster-arena-onchain.md](../2026-10-19-monad-monster-arena-onchain.md)

Research was run on 2026-10-19 (sandbox clock showed 2026-10-18 about 20:00 UTC) by five parallel research agents
that read primary sources and probed the public Monad RPCs live. Claims marked "live" were verified by an RPC call
or a WebSocket subscription, not only read from docs. Re-verify anything marked `medium` or `low` before relying on it.

## Questions

1. Monad network facts: chain ids, RPC/WS, explorers, faucet, block time, finality, gas rules, EVM version, mempool, MEV.
2. Which randomness providers are live on Monad, what do they cost and how fast are they; what about `prevrandao`.
3. Which indexers support Monad, and what is the best path to a sub-second event stream for a 3D client.
4. Is nad.fun (or another launchpad/AMM) usable as the liquidity layer; what is the reference curve math; prior art and exploit classes.
5. Which hackathons are live; which gasless/embedded-wallet options exist.
6. Which skills / MCP servers / docs help a builder agent on Monad.

## Findings

### A. Network and protocol

| # | Claim | Source | Read on | Confidence |
|---|---|---|---|---|
| R1 | Mainnet chain id 143, MON, version v0.16.4. Testnet chain id 10143, version v0.16.5. Testnet was reset from genesis on 2025-12-16, so redeploy instead of relying on old state. Both confirmed live with `eth_chainId`. | https://docs.monad.xyz/developer-essentials/network-information , https://docs.monad.xyz/developer-essentials/testnet | 2026-10-19 | high |
| R2 | Mainnet public RPC (HTTP/WS, limit): `rpc.monad.xyz` QuickNode 25 rps batch 100; `rpc1.monad.xyz` Alchemy 15 rps; `rpc2.monad.xyz` Goldsky no WS; `rpc3.monad.xyz` Ankr; `rpc-mainnet.monadinfra.com` MF 20 rps, batch 1. Testnet: `testnet-rpc.monad.xyz` (+`wss://`) QuickNode 50 rps (25 for eth_call), `rpc-testnet.monadinfra.com` (+`wss://`) 20 rps no batching, `rpc.ankr.com/monad_testnet` no WS. | same | 2026-10-19 | high |
| R3 | Official explorers: MonadVision (`monadvision.com`, `testnet.monadvision.com`) and Monadscan (`monadscan.com`, `testnet.monadscan.com`). Faucet: `https://faucet.monad.xyz` sits behind a Vercel checkpoint (needs a browser); drip amount and limits could not be read. | https://docs.monad.xyz/official-links , https://docs.monad.xyz/tooling-and-infra/block-explorers | 2026-10-19 | high (URLs), low (drip) |
| R4 | Block time 300 ms (measured about 300 ms live; viem's chain definition says 400 and is stale). Speculative finality (`Voted`) about 250 ms after `Proposed`, `Finalized` about 500-600 ms. `TIMESTAMP` has 1 s granularity (3-4 blocks share a timestamp). | https://docs.monad.xyz/developer-essentials/summary , live WS probe | 2026-10-19 | high |
| R5 | Block gas limit 150M (live), per-tx gas cap 30M, up to 3,750 tx per block. Gas is charged on the gas LIMIT, not gas used. Min base fee 100 gwei (live); a 200k-gas tx costs about 0.02 MON. Max contract size 128 kb. | https://docs.monad.xyz/developer-essentials/summary , https://docs.monad.xyz/developer-essentials/gas-pricing | 2026-10-19 | high |
| R6 | EVM supports Osaka-era opcodes including PUSH0, TSTORE/TLOAD, MCOPY, CLZ. Hardhat guide requires `evmVersion: "osaka"`. Repriced storage: cold account access 10,100 gas, cold storage 8,100 per 128-slot page, fresh SSTORE about 17,000 per new slot. Tx types 0,1,2,4 (EIP-7702); type 3 rejected. | https://docs.monad.xyz/developer-essentials/opcode-pricing , https://docs.monad.xyz/developer-essentials/transactions , https://docs.monad.xyz/tooling-and-infra/toolkits/hardhat | 2026-10-19 | high |
| R7 | No global mempool. Each validator has a local mempool; the RPC node forwards a tx to the next 3 leaders (retries up to 3 times). Ordering is a priority-gas auction at the leader's discretion. `newPendingTransactions` is unsupported. The front-running surface is leaders and RPC operators, not a public pending feed. | https://docs.monad.xyz/monad-arch/consensus/local-mempool , https://docs.monad.xyz/reference/rpc-differences | 2026-10-19 | high |
| R8 | Reserve balance: an account must keep a default 10 MON reserve against in-flight txs. Delegated (EIP-7702) EOAs cannot dip below 10 MON and delegated code cannot run CREATE/CREATE2. Impact for this project: EIP-7702 session keys on faucet-sized balances are risky. Behaviour for plain EOAs with small balances still needs a hands-on test. | https://docs.monad.xyz/developer-essentials/reserve-balance , https://docs.monad.xyz/developer-essentials/eip-7702 | 2026-10-19 | high (rule), low (practical effect) |
| R9 | `prevrandao`: the docs never mention it. From the `monad-bft` source, `mix_hash` is the hash of the proposer's BLS signature over the round number: deterministic per (leader key, round), known to the leader while it orders txs, and not accumulated across blocks (source has a TODO about `parent_block_id`). Weaker than Ethereum's RANDAO. Do not use it for anything with money at stake. | https://github.com/category-labs/monad-bft (`monad-consensus-types/src/payload.rs`) | 2026-10-19 | medium (code reading) |
| R10 | `BLOCKHASH` window is still 256 blocks, which is only about 77 s at 300 ms (live). | live `eth_call` probe | 2026-10-19 | high |
| R11 | ERC-4337 EntryPoints v0.6 to v0.9, Multicall3 (`0xcA11bde05977b3631167028862bE2a173976CA11`) and Permit2 have code on both networks (live `eth_getCode`). EIP-7702 is live. | https://docs.monad.xyz/developer-essentials/network-information | 2026-10-19 | high |
| R12 | Canonical addresses (mainnet): WMON `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A`. Uniswap v2/v3/v4 are deployed (registry in `monad-crypto/protocols`). Not needed for the recommended design because liquidity lives inside the Arena. | https://docs.monad.xyz/developer-essentials/network-information , https://github.com/monad-crypto/protocols | 2026-10-19 | high |

### B. Randomness

| # | Claim | Source | Read on | Confidence |
|---|---|---|---|---|
| R13 | Pyth Entropy mainnet (143): `0xD458261E832415CFd3BAE5E416FdF3230ce6F134`, v2.0.0 with `getFeeV2`, default provider `0x52DeaA1c84233F7bb8C8A45baeDE41091c616506` (live). | https://github.com/monad-crypto/protocols/blob/main/mainnet/pyth.jsonc , https://dev-forum.pyth.network/t/hi-team-vrf-for-monad-mainnet-is-available/473 | 2026-10-19 | high |
| R14 | **Testnet trap.** Monad docs list Entropy `0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320` for testnet, but that contract is v0.1.1 and `getFeeV2()` reverts. Pyth's contract store lists `0x825c0390f379C631f3Cf11A82a37D20BddF93c07` (v2.0.0, works, `getFeeV2()` about 0.128 MON, default provider `0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344`). Use the 0x825c address on testnet and re-check at deploy time. | https://raw.githubusercontent.com/pyth-network/pyth-crosschain/main/contract_manager/src/store/contracts/EvmEntropyContracts.json , live RPC | 2026-10-19 | high |
| R15 | Entropy fee is paid in MON per request. Mainnet `getFeeV2()` read about 1.4 MON (about $0.03). Fees track gas and spiked to 40 MON in Dec 2025 before Pyth capped it at 10 MON: budget 10 MON worst case. | https://docs.pyth.network/entropy/fees , https://dev-forum.pyth.network/t/monad-mainnet-entropy-fee-40-mon/483 | 2026-10-19 | high |
| R16 | Callback: provider default gas limit 1,000,000, custom via `requestV2(gasLimit)`. Delivered by the provider's keeper after a reveal delay. The callback must never revert; anyone can re-run `revealWithCallback`. Measured testnet latency: 3 requests revealed 6, 8, 10 blocks after the request (2, 2, 3 s). Mainnet latency was not measured (no recent requests). Plan for 2-4 s. | https://docs.pyth.network/entropy/set-custom-gas-limits , https://docs.pyth.network/entropy/debug-callback-failures , live testnet probe | 2026-10-19 | high (rules), medium (latency, n=3) |
| R17 | Entropy trust: the provider can compute the result before revealing and could censor an unfavourable one; it must not front-run requests. Freeze all inputs before requesting. | https://docs.pyth.network/entropy/protocol-design | 2026-10-19 | high |
| R18 | Chainlink VRF v2.5 is NOT on Monad (supported-networks page has no Monad). Chainlink on Monad is price feeds, Data Streams and CCIP only. Gelato VRF: docs say testnet only, no addresses found, example repo stale (2024). API3 QRNG, Switchboard, RedStone VRF: no evidence of presence. | https://docs.chain.link/vrf/v2-5/supported-networks.md , https://docs.monad.xyz/tooling-and-infra/oracles | 2026-10-19 | high (Chainlink), medium (others) |
| R19 | Supra dVRF 3.0 is live on mainnet (router `0x8c009E02C1902126bB88901084B3f0714c6d4304`, testnet router `0x5CbC3Dfa33223884E7752a833Fa6aD28Ee015FC4`); prepaid subscription, up to 255 numbers per request, 30% premium, latency undocumented. Viable backup, more setup than Entropy. | https://docs.supra.com/dvrf/learn-supra-dvrf/networks | 2026-10-19 | high |
| R20 | Chainlink VRF security rules generalise: no re-request or cancel to discard bad randomness, no inputs accepted after the request, match by request id, callback must not revert, safe confirmation count. Derive many values from one seed with `keccak256(seed, id)`; modulo mapping has small bias on non powers of two. | https://docs.chain.link/vrf/v2-5/security , https://docs.pyth.network/entropy/transform-entropy-results | 2026-10-19 | high |
| R21 | Trail of Bits "bad randomness": block hashes and timestamps must never be randomness; commit-reveal has last-revealer problems (withhold or abort). | https://github.com/crytic/not-so-smart-contracts/tree/master/bad_randomness | 2026-10-19 | high |
| R22 | MON/USD for display: Chainlink proxy `0xBcD78f76005B7515837af6b50c7C52BCf73822fb` (8 decimals, live), Pyth feed `0x2880aB155794e7179c9eE2e38200202908C17B43` with id `0x3149...6cd1`, RedStone `0x1C9582E87eD6E99bc23EC0e6Eb52eE9d7C0D6bcd`. Easiest for a client is the Chainlink `latestRoundData()` read. Testnet MON has no value, so show a fixed demo rate. | https://github.com/monad-crypto/protocols/blob/main/mainnet/chainlink.jsonc , https://docs.monad.xyz/tooling-and-infra/oracles | 2026-10-19 | high |

### C. Events and indexing

| # | Claim | Source | Read on | Confidence |
|---|---|---|---|---|
| R23 | `eth_subscribe` works only over WebSocket. `newHeads` and `logs` fire at `Proposed` (speculative). `monadNewHeads` and `monadLogs` fire at `Proposed` and re-emit with `blockId` and `commitState` (Proposed, Voted, Finalized, Verified). A block can skip Voted. Failed proposals are abandoned silently, with no event, so de-duplicate by `blockId`, not block number. | https://docs.monad.xyz/reference/websockets | 2026-10-19 | high |
| R24 | Live: `monadNewHeads` on mainnet and testnet public WS showed Proposed, then Voted about 250 ms later, then Finalized about 500 ms after Proposed. Blocks about every 300 ms. | WS probe 2026-10-18 | 2026-10-19 | high |
| R25 | Block tags: `latest` = Proposed, `safe` = Voted, `finalized` = Finalized. Non-finalized data can change on repeat requests. | https://docs.monad.xyz/monad-arch/consensus/block-states | 2026-10-19 | high |
| R26 | `eth_getLogs` range limit on public RPCs is about 100 blocks (QuickNode, MF); Alchemy 1,000 blocks; Ankr 1,000. 101 failed live on four public endpoints. MF endpoints do not allow JSON-RPC batching: use Multicall3 instead. | https://docs.monad.xyz/reference/rpc-limits , live probe | 2026-10-19 | high |
| R27 | Indexers listed for Monad by the official docs (mainnet and testnet): Envio, Goldsky, SQD, SubQuery, The Graph; push via websocket: Envio, SQD, Streamingfast. Goldsky subgraphs are partner-sponsored (need a code from Monad DevRel) and have no subscriptions. Envio free Development plan is dev-only and deletes deployments after 30 days; Envio GraphQL subscriptions are live queries (latest result), not an event stream. Ponder has no Monad-specific docs. | https://docs.monad.xyz/tooling-and-infra/indexers/indexing-frameworks , https://envio.dev/pricing/hosting , https://docs.goldsky.com/chains/monad | 2026-10-19 | high (list), medium (Envio details) |
| R28 | Execution Events SDK is for self-run nodes (C/Rust), not browser or hackathon scope. | https://docs.monad.xyz/execution-events/overview | 2026-10-19 | high |
| R29 | Public full nodes keep about 40,000 blocks of state for `eth_call`; `rpc-mainnet.monadinfra.com` and `rpc2.monad.xyz` support historical state. | https://docs.monad.xyz/developer-essentials/historical-data | 2026-10-19 | high |

### D. Launchpads, AMMs, curve math, prior art

| # | Claim | Source | Read on | Confidence |
|---|---|---|---|---|
| R30 | nad.fun is live on mainnet. V2: NadFunRouter `0x8986C8fD44eb85294A725a7e61AF35E76bA26F91`, Factory `0xA25b13127e63ddae6d0b35570FF3D39dBD621001`. Curve: virtual quote 70,000, virtual token 1,060,569,000, graduation about 225,000 MON raised. Fees: 10 MON create, 1,000 MON graduation, 2% curve trade fee. Anti-sniping penalty decays 80/40/20/15/10/10/5/0 % by block after creation. Third-party-contract integration is not documented ("only tokens launched through our frontend or official api"). | https://nad-fun.gitbook.io/nad.fun , https://github.com/Naddotfun/nadfun-v2-intergration | 2026-10-19 | high (params), medium (3rd-party use) |
| R31 | Conclusion for this project: nad.fun cannot be the liquidity layer, because the Arena must lock trading on a coin during a clash, inject MON into the winner's reserve and drain the loser's reserve atomically. None of that is possible through someone else's curve. Its anti-sniping decay and its Hypeboard (winning token gets buyback) are useful prior art. | derived from R30 and nad.fun docs | 2026-10-19 | high (design inference) |
| R32 | pump.fun curve: virtual token reserve 1,073,000,000, virtual SOL 30, real token reserve 793,100,000, supply 1B, fee 1%. Buy (fee on input): `in' = in*(1-f)`, `out = y - ceil(k/(x+in'))`; sell: `gross = x - ceil(k/(y+tokenIn))`, then fee. Round up so the pool never loses to rounding. nad.fun V1 asserts `virtualNative*virtualToken >= k` after each trade. | https://raw.githubusercontent.com/pump-fun/pump-public-docs/main/docs/PUMP_PROGRAM_README.md , https://raw.githubusercontent.com/Naddotfun/contracts/main/src/BondingCurve.sol | 2026-10-19 | high |
| R33 | OpenZeppelin `Clones` (ERC-1167): lock the implementation with `_disableInitializers()`, initialise in the same tx as the clone, because an uninitialised clone can be hijacked. | https://docs.openzeppelin.com/contracts/5.x/api/proxy#Clones | 2026-10-19 | high |
| R34 | Fomo3D round 1 was won by block stuffing (about 8M gas per block for 175 s) against a "last buyer wins" timer. Lesson: use a fixed epoch schedule, not an extendable countdown. | https://solmaz.io/2018/10/18/anatomy-block-stuffing/ | 2026-10-19 | high |
| R35 | pump.fun admin exploit (2024-05-16, about 12,300 SOL): withdraw authority plus flash loans. Four.meme (Feb 2025, about $183k): migration did not check an existing pair. Lessons: no owner withdraw, immutable payout path, check existing pair if you ever graduate to a DEX. | https://www.theblock.co/post/295029/pump-fun-post-mortem , https://blog.verichains.io/p/fourmeme-hack-analysis | 2026-10-19 | high / medium |
| R36 | Closest prior art: Rug.fun (Base, 24 h rounds, losers rugged to winners, no post-mortem found), Meme Royale (Solana, winner absorbs loser liquidity, low-confidence info), The Rug Game (predicted Matthew effect: leader dominates), Token Run (low confidence). No outcome or exploit data found for any. | https://decrypt.co/230157/rug-fun-turns-minting-ethereum-meme-coins-into-a-competitive-game , https://wublock.substack.com/p/10-token-10-communities-special-game | 2026-10-19 | medium / low |
| R37 | Regulatory flags (not legal advice): a SDNY class action calls pump.fun an unlicensed slot machine; CFTC vs states fight over event contracts; nad.fun's terms bar wash trading and require 18+. A pool-pays-holders wagering game should be framed as a testnet play-money simulation with no cash-out. | https://decrypt.co/331528/solana-pump-fun-amended-rico-suit-alleging-meme-coin-gambling , https://nad-fun.gitbook.io/nad.fun/legal-and-risk/terms-of-use-and-warranty-disclaimer.md | 2026-10-19 | high (that it exists), low (merits) |

### E. Hackathons and wallets

| # | Claim | Source | Read on | Confidence |
|---|---|---|---|---|
| R38 | Monad **Metropolis** (flagship): build window 1 Sep to 13 Oct 2026, submissions closed 13 Oct, judging 14-27 Oct, winners 3 Nov. Tracks: Onchain Finance and Trading; Consumer Products and Payments; Social, Attention and Culture; Trust, Identity and AI Infrastructure (no gaming track). Work must have been built during the six weeks. `hackathon.monad.xyz` still says "Intake is open" but looks stale. | https://monad.xyz/metropolis , https://monad.xyz/developers/hackathons/metropolis | 2026-10-19 | high |
| R39 | **Monad Blitz Jogja Vol. 2**: Sat 24 Oct 2026, 09:00-21:00 WIB, GIK UGM Yogyakarta, one day, in person, free, approval required, teams up to 3, judging by pitch plus community vote, registration deadline shown as 20 or 21 Oct (page conflicts). No required SDK. **Blitz Ankara v4**: 24 Oct, prize $2,000. No GameFi-specific Monad hackathon was found for Oct-Nov 2026. | https://luma.com/blitz-jogja-okt-2026 , https://luma.com/blitz-ankara-24-Oct | 2026-10-19 | high |
| R40 | Embedded-wallet providers listed for Monad mainnet and testnet: Privy (subsidising testnet), Dynamic, thirdweb, Reown, Alchemy, Coinbase CDP, Crossmint, Para, Turnkey. Bundlers/paymasters on mainnet: Alchemy, Biconomy, Pimlico, Sequence, thirdweb, ZeroDev. Session keys feasible (ZeroDev, Biconomy, Openfort, Para) subject to R8. | https://docs.monad.xyz/tooling-and-infra/wallet-infra/embedded-wallets , https://docs.monad.xyz/tooling-and-infra/wallet-infra/account-abstraction | 2026-10-19 | high |

### F. Tooling

| # | Claim | Source | Read on | Confidence |
|---|---|---|---|---|
| R41 | Monad serves an official docs MCP at `https://docs.monad.xyz/mcp` (valid `initialize` reply; tools include a read-only search/fetch pair and a `submit_feedback` tool that posts to the docs team), an official skill at `https://docs.monad.xyz/skill.md`, and `llms.txt` with a "For AI Agents" section (`/ai/current-facts.md`, `/ai/developers.md`, `/ai/rpc.md`). | https://docs.monad.xyz/.well-known/mcp/server-card.json , https://docs.monad.xyz/llms.txt | 2026-10-19 | high |
| R42 | Foundry v1.8+ has first-class Monad support: `network = "monad"` in `foundry.toml`, `anvil --network monad`, fork with `--fork-url https://testnet-rpc.monad.xyz`. The old `category-labs/foundry` fork and the `monad-developers/foundry-monad` template are stale. Verification: Sourcify `--verifier-url https://sourcify-api-monad.blockvision.org/` (MonadVision) or Etherscan v2 (Monadscan). | https://docs.monad.xyz/tooling-and-infra/toolkits/foundry , https://docs.monad.xyz/guides/verify-smart-contract/foundry | 2026-10-19 | high |
| R43 | Third-party Monad skill `therealharpaljadeja/monskills` is stale on chain numbers (400 ms / 800 ms), registers three PreToolUse Bash hooks and has a repo-URL mismatch in `plugin.json`. Not recommended. | GitHub, read by the tooling agent | 2026-10-19 | high |
| R44 | Other candidates and their red flags are listed in the plan's Tooling section (OpenZeppelin MCP, Trail of Bits skills, Slither MCP, Cyfrin solskill, Envio docs MCP, CloudAI-X threejs-skills, Privy docs MCP). | see plan | 2026-10-19 | high |

## How it applies here

- R7, R9, R10, R16, R17, R20, R21 -> the fairness design: outcomes come from a per-epoch Pyth Entropy seed that is
  requested only after clash inputs are frozen and the coins are locked; `prevrandao` and blockhash are never used for
  value (blockhash may be used only for the testnet demo seed behind a flag).
- R7 and R31 -> the "combat lock" (no buying or selling a coin between declare and resolve) is the main anti-sandwich
  mechanism. It works with leader-level ordering because there is nothing to front-run once the coin cannot trade.
- R5 and R6 -> storage layout: pack coin state into 2 slots, avoid a global counter written on every trade (a hot slot),
  set tight gas limits on keeper txs.
- R15 and R16 -> epoch length default 15-20 s on the demo preset, one Entropy request per epoch, treasury pays fees.
- R23 to R26 -> client feed: direct `monadLogs` WebSocket with a keyed provider, snapshot with Multicall3 at `safe`,
  gate irreversible animations on `commitState >= Voted`, gate payout UI on `Finalized`, backfill in chunks of at most 100 blocks.
- R30 and R31 -> own bonding curve inside the Arena instead of nad.fun.
- R8 and R40 -> wallet P0 is plain EOA (injected plus in-browser burner on testnet); EIP-7702 and sponsored gas are P2.
- R37 -> testnet-only play-money framing for the demo.
- R38 and R39 -> Metropolis is closed; Blitz Jogja (24 Oct) is a possible target, so the plan includes a one-day cut.

## Disagreements in the sources

| Topic | Sources | Plan takes |
|---|---|---|
| Block time | Monad docs 300 ms and live probe 300 ms; viem chain definition 400 ms; monskills 400 ms / 800 ms finality | 300 ms, 600 ms finality (primary docs and live measurement) |
| Network version | `/ai/current-facts.md` and cached `llms-full.txt` show v0.16.1/v0.16.2; live pages show v0.16.4/v0.16.5 | live pages |
| Entropy testnet address | Monad docs `0x3682...e320` (v0.1.1, broken) vs Pyth contract store `0x825c...3c07` (v2.0.0) | `0x825c...3c07`, verified by live `getFeeV2()` |
| Testnet WMON | Monad docs `0xFb8b...C541` vs nad.fun `0x5a4E...BfDd` | not needed (no WMON in the design) |
| Hackathon status | `hackathon.monad.xyz` says intake open; monad.xyz and Risein say Metropolis ended | closed; confirm with organisers |

## Assumptions

1. **(Riskiest)** The game economy is fun and not degenerate under the proposed numbers (rich-get-richer through the pool factor, harsh losses, champion payout multiple). Only a simulation can tell. See the simulation spike in the plan.
2. Entropy mainnet latency is similar to the testnet sample (2-3 s). Not measured on mainnet.
3. A hackathon judge accepts "testnet, play-money, house-seeded coins clearly labelled" as a legitimate demo.
4. 15 clashes plus hunts fit comfortably in one resolve tx (estimated about 2-4M gas, under the 30M cap). Needs a gas profile on a testnet fork.
5. Faucet drip is enough for a seed buy of a few MON per judge. Unknown (faucet unreadable).
6. Solc 0.8.31 with `evm_version = "osaka"` compiles and deploys on Monad testnet as the Hardhat template suggests.
