# 02 — Tech stack

> PM note (2026-10-19, revision 2): the user decided that the brainstorm plan wins every conflict, and chose Vite instead of Next.js. In this file the sections on the pool primitive (D3), randomness (D4), keeper pairing, indexer and relay (D6) and the Next.js migration (D7) are **superseded** by `05-synthesis.md` revision 2 and `docs/handoffs/contracts.md` revision 2. Monad facts (F1), toolchain (F2, D2), wallet and burner (D8), hosting and platform limits (D10) still stand.

Date: 2026-10-19. Author: research agent, Track 02. Every URL below was read on 2026-10-19. Tags such as [S3] point to the Sources section; tags such as [P3] are my own read-only probes (RPC calls, `npm view`, file greps), listed with the exact command in Sources. Prototype citations are `proto:LINE` for `monster_arena_3d_prototype (1).html`.

## Summary

- **Chain.** Monad testnet (chain id 10143) is the demo target. Mainnet (chain id 143) is live and reachable but is not worth the risk for a demo. Both produce a block every ~0.30 s (measured: 1000 blocks in 303 s on testnet, 302 s on mainnet) and finalize about 0.5 to 0.7 s after proposal (measured over a WebSocket `monadNewHeads` stream). Public RPCs cap `eth_getLogs` at 100 blocks per call. [S3][S9][P1][P2][P3]
- **Contracts.** Foundry (1.8.3 installed, Monad needs 1.8 or later), Solidity 0.8.31 with `evm_version = "osaka"` as Monad's own Hardhat page requires, OpenZeppelin Contracts 5.6.1. A live opcode probe shows the testnet executes `CLZ`, `TSTORE`, `MCOPY` and `BLOCKHASH`. [S11][S14][P4][P8]
- **Pool primitive.** One `Arena` contract that owns a minimal constant-product pool per coin in its own storage, plus one small `CoinToken` ERC-20 per coin. Merger is pure storage arithmetic inside one transaction, with O(1) gas regardless of holder count, and loser holders claim pro-rata by burning their tokens. This is the only option of the four that one contracts engineer can finish and test in days and that can make "merge atomically" literally true.
- **Randomness.** Demo: commit to a pair, then derive the seed from the hash of a block that did not exist at commit time (`blockhash(startBlock + 2)`), with trading frozen on both coins and a permissionless `resolveClash`. Production: Pyth Entropy, one request per round. Entropy has a verified mainnet deployment (fee 1.4 MON, about 0.03 USD today) but I could not verify a working testnet deployment: the address in Monad's docs does not answer the Entropy V2 interface. Chainlink VRF does not list Monad. [S16][S20][S21][P5][P6]
- **Keeper and indexer.** One Node/TypeScript service on Railway, built on viem, doing both jobs: it drives clashes and fans chain events out to browsers over SSE. No database and no hosted indexer for the demo, because arena state is fully readable from `getCoins()` and the event history is small. Ponder 0.18.2 is the documented production upgrade.
- **Frontend.** Next.js 16.4.2 App Router, React 19.3.1, `three@0.128.0` pinned (do not upgrade, colour management and light units changed after r128), the 4,184-line scene moved almost verbatim into a client-only module mounted via `next/dynamic` with `ssr: false` from a `'use client'` leaf. Tailwind 3.4.19 (the CDN currently serves 3.4.17). Plain Vite would be somewhat simpler for a one-page canvas app; the cost of staying on Next.js is real but small (hours, not days).
- **Wallet.** wagmi 3.7.7 + viem 2.57.7 with a custom connect button in the prototype's glass style, plus a one-click burner wallet for the demo. RainbowKit 2.2.11 and ConnectKit 1.9.2 are rejected: their peer dependencies are wagmi 2.x, not 3.x. `viem/chains` already exports `monad` and `monadTestnet`, but the testnet entry has a stale explorer and a `blockTime` of 400 ms. [P9][S22]
- **Biggest Monad-specific design consequences.** Gas is charged on the gas limit, not gas used; cold storage and account access are far more expensive than on Ethereum; accounts under 10 MON can send value only as the first transaction in a 3-block window; the public RPC `eth_getLogs` window is 100 blocks; there is no global mempool, so the realistic front-running channel is leaders and RPC providers, but I design as if the resolution transaction is public anyway. [S4][S5][S6][S7]

## Findings

Each finding maps to one of the ten questions in the brief.

### F1. Monad current facts (question 1)

| Fact | Value | Source |
|---|---|---|
| Mainnet chain id | 143 (`0x8f` returned by `eth_chainId` at rpc.monad.xyz) | [S1][P1] |
| Testnet chain id | 10143 (`0x279f` returned by `eth_chainId` at testnet-rpc.monad.xyz) | [S2][P1] |
| Node versions | Docs: mainnet v0.16.4, testnet v0.16.5, revision `MONAD_TEN`. `web3_clientVersion`: mainnet `Monad/0.16.4`, testnet `Monad/0.16.3` (that QuickNode node lags the doc) | [S1][S2][P1] |
| Testnet reset | "testnet was reset from genesis on 2025-12-16"; frequency of resets not stated | [S2] |
| Block time | Docs: minimum 300 ms. Measured: testnet 0.303 s per block, mainnet 0.302 s per block over 1000 blocks. viem 2.57.7 hardcodes `blockTime: 400` for both chains, which is stale. | [S9][P1][P9] |
| Finality | Docs: speculative finality 1 slot (300 ms), full finality 2 slots (600 ms). Measured on testnet over 7 consecutive blocks (client-side clock, includes network jitter): Voted +0.23 to +0.43 s after Proposed, Finalized +0.47 to +0.68 s, Verified +1.36 to +1.50 s. | [S9][P3] |
| RPC block tags | `latest` = Proposed, `safe` = Voted, `finalized` = Finalized; `pending` behaves as `latest` | [S3][S8] |
| Block and tx limits | Block gas limit 150,000,000 (also read from `eth_getBlockByNumber`), tx gas limit 30,000,000, up to 3,750 txs per block | [S3][S5][P1] |
| Fees | Min base fee 100 gwei (read: 1e11 wei), `eth_maxPriorityFeePerGas` hardcoded 2 gwei (read: `0x77359400`), 200k-gas tx about 0.02 MON | [S3][S5][P1] |
| Gas model | Charged on gas limit, not gas used: `gas_paid = gas_limit * price_per_gas`. Docs warn that wallets that set a huge limit when estimation reverts get expensive. | [S5] |
| Opcode and storage pricing | Cold account access 2600 to 10,100; precompiles repriced (`ecRecover` 6000, `ecMul` 30,000, `ecPairing` 225,000 + 170,000 per point); storage warmed per 128-slot page: SLOAD 8100 on first page access, SSTORE +8000 page load, +2800 first value-changing write to a page, +17,000 when a page's slot count reaches a new high; memory expansion linear, capped 8 MB per tx | [S6] |
| EVM version | Docs do not name a hardfork on the differences and opcode pages. Monad's Hardhat page: `solc 0.8.31`, `evmVersion: "osaka"`, "The `osaka` EVM target is required when compiling for Monad". Foundry page: local default hardfork `MonadTen`. Probe: testnet and mainnet both execute `CLZ` (0x1e, EIP-7939); testnet executes `TSTORE/TLOAD`, `MCOPY`, `BLOCKHASH`, `PREVRANDAO` | [S11][S14][P4] |
| Contract limits | 128 KB code, 256 KB init code (Ethereum: 24 KB and 48 KB) | [S4][S11] |
| `BLOCKHASH` | Returns a real hash for `number - 1` and returns 0 for `number - 300` (consistent with the usual 256-block window, about 77 s at 0.3 s blocks) | [P4] |
| Mempool | No global mempool. Transactions are forwarded to the next few leaders. Default ordering is descending total gas price (priority gas auction). | [S4][S5] |
| Reserve balance | 10 MON per EOA. A sender may spend value that leaves it under 10 MON only via the "emptying exception": undelegated, no other tx from it in the past k = 3 blocks. A reverted-for-reserve tx is still included and still pays gas. The docs state the rule in terms of EOAs and do not say how it applies to contract accounts. | [S7] |
| Deferred validation and RPC quirks | `eth_sendRawTransaction` may accept a nonce gap or insufficient balance; `eth_getTransactionByHash` is `null` for mempool txs; `eth_call` on old blocks may fail; EIP-4844 blob txs rejected; `eth_sendRawTransactionSync` exists on testnet (probe returned a tx-validation error, not "method not found") | [S3][P7] |
| `eth_getLogs` limit | Docs: QuickNode 100 blocks, Alchemy 1,000 blocks and 10,000 logs, Ankr 1,000 blocks, Monad Foundation 100 blocks. Probe: testnet-rpc.monad.xyz rejects a 4,096-block range with code -32614 "eth_getLogs is limited to a 100 range"; a 100-block range works. | [S3][P2] |
| Public RPC, mainnet | rpc.monad.xyz (QuickNode, 25 rps, batch 100, wss yes); rpc1.monad.xyz (Alchemy, 15 rps, wss yes); rpc2.monad.xyz (Goldsky Edge, 300 per 10 s, batch 10, no wss listed); rpc3.monad.xyz (Ankr, 300 per 10 s, batch 10, wss yes); rpc-mainnet.monadinfra.com (MF, 20 rps, batch 1, wss yes) | [S1] |
| Public RPC, testnet | testnet-rpc.monad.xyz (QuickNode, 50 rps, 25 rps for `eth_call`/`eth_estimateGas`, batch 100, archive, wss yes); rpc.ankr.com/monad_testnet (300 per 10 s, no archive, no wss listed); rpc-testnet.monadinfra.com (MF, 20 rps, no batch, archive, wss yes). All three answered `eth_chainId` today. | [S2][P1] |
| WebSocket | `eth_subscribe` is WebSocket-only. Standard `newHeads` and `logs` fire at the Proposed state. Monad adds `monadNewHeads` and `monadLogs`, which add `blockId` and `commitState` (Proposed, Voted, Finalized, Verified). Probe: a `monadLogs` subscription on testnet emitted messages carrying `blockId`, `commitState`, `removed` and the usual log fields, and re-emitted the same logs as the state advanced. | [S3][S10][P3] |
| Explorers | Mainnet: MonadVision https://monadvision.com, Monadscan https://monadscan.com. Testnet: https://testnet.monadvision.com, https://testnet.monadscan.com/. viem's `monadTestnet` still points at testnet.monadexplorer.com. | [S1][S2][P9] |
| Faucet | https://faucet.monad.xyz listed on the Testnets page. Amount and cooldown are not in the docs; fetching the faucet returned HTTP 429, so I could not read its terms. | [S2] |
| Canonical contracts | Multicall3 `0xcA11bde05977b3631167028862bE2a173976CA11` on both networks; WMON mainnet `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A`, testnet `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541`; Permit2, CreateX, ERC-4337 EntryPoints v0.6 to v0.9 on mainnet | [S1][S2] |
| Verification | Foundry: `forge verify-contract ... --chain 10143 --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/` (no API key), or Etherscan-style for Monadscan with a key. Needs `metadata = true`, `metadata_hash = "none"`, `use_literal_content = true`. | [S13] |
| Official AI offerings | `https://docs.monad.xyz/llms.txt` (index, pages also served as `.md`); a guide to build your own MCP server for testnet (`/guides/monad-mcp`, repo `monad-developers/monad-mcp`); an "AI Index" page linking x402 and ERC-8004 guides. No official "skills" package found in the docs. Third-party "monad wingman" skills turn up in web search and give older guidance (prague, solc 0.8.28), so treat them as unverified. viem's docs point to an MCP server at `https://viem.sh/api/mcp`. | [S15][S31] |

### F2. Contracts toolchain (question 2)

- Foundry installed: forge/cast 1.8.3 (build 2026-09-15). Latest GitHub release is v1.8.5 (2026-10-05). Monad requires Foundry 1.8.0 or later. `forge test --help` lists `-n, --network` with possible values `ethereum, optimism, tempo, monad`, and `--hardfork`. [P8][S11][S12]
- Monad's Foundry page: `network = "monad"` in `foundry.toml` (or `--network monad`) makes forge, cast and chisel use Monad's gas model and opcode pricing; local default hardfork is `MonadTen`; when forking testnet or mainnet the hardfork is chosen from chain id and block timestamp; `anvil --network monad` and `anvil --fork-url https://testnet-rpc.monad.xyz` work; CI: `foundry-rs/foundry-toolchain@v1` then `forge test --network monad -vvv`. [S11]
- Deploy guide: template `forge init --template monad-developers/foundry-monad`, keystore flow `cast wallet import monad-deployer ...` then `forge create ... --account monad-deployer --broadcast`; the guide's `foundry.toml` sets `eth-rpc-url`, `chain_id = 10143`, and does not set `evm_version` or `solc_version`. [S12]
- Monad's Hardhat 3 page requires `solc 0.8.31` and `osaka`, Hardhat 3.1.0 or later, Node 22.13 or later. npm latest: hardhat 3.20.0. [S14][P10]
- Foundry's own compiler docs list `prague` as the default `evm_version` and do not mention `osaka`; Foundry auto-detects solc unless `solc_version` is pinned. So `osaka` is an explicit setting and needs a first-build check with forge 1.8.3. [S28]
- OpenZeppelin Contracts 5.6.1 (pragma `^0.8.20` on `ERC20.sol` and `ReentrancyGuard.sol`). Latest solc on npm is 0.8.37. forge-std latest GitHub release v1.17.0. [P10]
- Pyth Entropy Solidity SDK on npm: `@pythnetwork/entropy-sdk-solidity` 2.2.1; its `IEntropyV2.sol` declares `requestV2()` overloads, `getFeeV2()` overloads and `getDefaultProvider()`; `IEntropyConsumer.sol` requires `msg.sender == entropy` in `_entropyCallback`. [P5][S20]

### F3. Pool primitive landscape (question 3)

- Monad mainnet has Uniswap v2, v3 and v4 deployments (factory, routers, position managers listed in `monad-crypto/protocols`), Kuru, nad.fun (a bonding-curve launchpad with `BONDING_CURVE`, `BONDING_CURVE_ROUTER`, `LP_MANAGER`, and later a V2-style pair factory) and many more. On testnet the protocols repo lists nad.fun, Kuru and an unofficial Uniswap v4 hook-development deployment ("not an official Uniswap deployment"), and no Uniswap v2 or v3. [S19]
- The brief's reference "Rug Rumble" (a game on Monad mainnet) appears in the protocols repo as "a provably fair gaming platform"; it is a comparable for the domain track, not a dependency. [S19]
- The prototype's `lp` field is a USD number set once at spawn and sorted on, never changed by a duel: `resolveDuel` (proto:3123) edits `wins`, `state` and particles only; the leaderboard sorts by `lp` then `wins` (proto:3691-3693); the launch form passes `lp` (proto:4119) from an input with min 1000, max 250000 (proto:545). In a chain build, `lp` has to become a reserve read from the chain.
- Prototype combat is proximity-triggered and local: `startDuel` is called when two walking monsters are within 4.5 units with a 0.08 chance per frame, max 8 concurrent (proto:3505-3511); each strike is `18 + Math.random() * 22` damage every 0.45 s (proto:3401, 3406); when HP reaches 0 the attacker wins (proto:3413-3414). In chain mode the pairing and winner come from the chain; the scene only replays.

### F4. Randomness on Monad (question 4)

- Pyth Entropy, mainnet: proxy `0xD458261E832415CFd3BAE5E416FdF3230ce6F134` listed in `monad-crypto/protocols` `mainnet/pyth.jsonc`. On-chain probe: code is 177 bytes (an ERC-1967 proxy), implementation slot points at `0x1235841f8df7b47b2b35c9654a13bb3be57ee9c6`, `version()` returns "2.0.0", `getDefaultProvider()` returns `0x52DeaA1c84233F7bb8C8A45baeDE41091c616506` (identical to the mainnet default provider printed on Pyth's chainlist page), `getFeeV2()` returns 1.4e18 wei, i.e. 1.4 MON. The Pyth MON/USD feed on Monad (read on-chain from the PriceFeed contract at `0x2880aB155794e7179c9eE2e38200202908C17B43`) returned 2000079 with exponent -8, about 0.0200 USD per MON, so one request is about 0.028 USD today. [S19][S20][P5][P6]
- Pyth Entropy, testnet: Monad's oracle page lists `0x36825bf3Fbdf5a29E2d5148bfe7Dcf7B5639e320` as Entropy. On-chain probe against testnet-rpc.monad.xyz: the address has 8,061 bytes of code, `version()` returns "0.1.1", and `getDefaultProvider()`, `getFeeV2()`, `getFee(address)` and `getProviderInfo(address)` all revert. A web search surfaced the same address as a Pyth contract on Story's Aeneid testnet. So the testnet Entropy address is unverified and probably wrong. Pyth's own chainlist page renders its tables client-side and showed no Monad rows to my fetch. Pyth's testnet default provider (generic) is `0x6CC14824Ea2918f5De5C2f75A9Da968ad4BD6344`. [S16][S20][P5]
- Entropy semantics from Pyth docs: two-party commit/reveal; the provider commits a hash chain and reveals after "sufficient block confirmations"; the callback "must NEVER revert"; fees are fetched on-chain with `getFeeV2()` or `getFeeV2(gasLimit)`; callback gas 50k to 100k for simple, 200k to 500k+ for complex; the provider can censor by withholding and can predict `r` before revealing, so randomness holds as long as either party is honest. [S20]
- Chainlink VRF v2.5 supported-networks page lists Arbitrum, Avalanche, Base, BNB, Ethereum, OP, Polygon, Ronin, Soneium; no Monad. [S21]
- Monad's oracle page lists VRF on mainnet: Pyth Entropy and Supra dVRF; testnet: Gelato VRF (no address listed), Pyth Entropy (address above), Supra dVRF (Router `0x5CbC3Dfa33223884E7752a833Fa6aD28Ee015FC4`). [S16]
- `PREVRANDAO` returns a value on Monad testnet but the docs say nothing about its entropy source, so it is not used. [P4]

### F5. Automation and keeper (question 5)

- Monad's tooling index lists 15 or 16 categories (analytics, explorers, indexers, oracles, RPC providers, wallets, wallet infra, and so on). There is no keeper or automation category. I did not verify Gelato Web3 Functions or Chainlink Automation on Monad from a primary source. Gelato VRF is listed for testnet only. [S16][S29]
- viem 2.57.7 ships `nonceManager` (default source: `getTransactionCount` at block tag `pending`) usable as `privateKeyToAccount(key, { nonceManager })`, and `writeContractSync` / `sendTransactionSync` actions. `sendTransactionSync` waits for inclusion and returns the receipt; its docs say it is for chains with low block times and fast finality; for local accounts it uses `eth_sendRawTransactionSync`; default `timeout` is `chain.blockTime * 3`. [P9][S22]
- Monad accepts nonce gaps at `eth_sendRawTransaction` (deferred validation), so a dropped or late transaction can leave later nonces queued behind a hole. [S3]
- Gas is charged on the gas limit, so the keeper should pass explicit `gas` per call instead of leaning on `eth_estimateGas`, which is the docs' own guidance when cost is known. [S5]

### F6. Indexer and realtime (question 6)

- Monad's indexing page lists nine providers. Envio HyperIndex: hosted, WebSocket subscriptions yes, GraphQL; Goldsky: subgraph and Turbo Pipelines, no WebSocket subs; The Graph: subgraphs, no WebSocket subs; SQD: WebSocket yes; Streamingfast: gRPC; Sentio and Streamingfast mainnet only, the other seven also on testnet. Ponder is not in the Monad list but runs on any EVM RPC. [S17]
- Envio hosted free "Development plan": free, soft limits at 100,000 events, 5 GB or 7 days without requests, then a 7-day grace period, 3 days read-only, then deletion; deployments older than 30 days are deleted; self-hosting via a generated Dockerfile. [S26]
- Ponder 0.18.2: `engines.node >= 22.12`; peer `viem >= 2.35`, `hono >= 4.5`. Chain config has `pollingInterval` (default 1,000 ms), `ws`, `ethGetLogsBlockRange` (if unset, Ponder infers the range from RPC error messages), `reorgWindow` (default 180 s). `@ponder/client` has `client.live(...)` that streams query results over Server-Sent Events. [P11][S25]
- Event volume on the whole testnet is high: an unfiltered `monadLogs` subscription delivered 857 messages in 4 seconds (the same log is re-sent as its block advances through commit states). Filtering by the Arena address on the server side removes this, so volume for the Arena itself is bounded by our own transaction rate (a few events per second at most). [P3]
- Browser fan-out risk: the public RPC limits are 25 to 50 rps per endpoint and are shared by all users of that provider; one WebSocket per judge's browser on a public endpoint is fragile. [S1][S2]
- viem `watchEvent` and `watchContractEvent` use `eth_subscribe` when the transport is WebSocket and otherwise poll with filters or `getLogs`. They surface logs at the Proposed state and expose no `commitState`. [P9]

### F7. Frontend migration (question 7)

- Versions on npm today: next 16.4.2, react and react-dom 19.3.1, tailwindcss 4.3.3 (3.4.19 is the latest v3), @tailwindcss/postcss 4.3.3, three 0.186.1 (target r128 is 0.128.0), @types/three 0.186.0 (0.128.0 also exists), typescript 7.0.2 latest (5.9.3 is the 5.9 line; wagmi and @wagmi/core require TypeScript >= 5.9.3), vite 8.3.4, zustand 5.0.15, @tanstack/react-query 5.104.4. [P10]
- The prototype loads three@r128 as a global from cdnjs and OrbitControls from `three@0.128.0/examples/js/controls/OrbitControls.js` (proto:8-9). The `examples/js` build is a non-module script that reads a global `THREE` and attaches `THREE.OrbitControls`. `three@0.128.0` on npm has `main: build/three.js`, `module: build/three.module.js`, no `exports` field, and ships `examples/jsm/controls/OrbitControls.js` as an ES module (HTTP 200 on unpkg for both). The scene constructs it as `new THREE.OrbitControls(camera, renderer.domElement)` (proto:732). [P12]
- Prototype Three API surface in use (grep): `BoxGeometry`, `BufferGeometry` (proto:2894), `CanvasTexture` (proto:823), `CircleGeometry`, `ConeGeometry`, `CylinderGeometry`, `DodecahedronGeometry`, `OctahedronGeometry`, `RingGeometry`, `SphereGeometry`, `TorusGeometry`; `ACESFilmicToneMapping` with exposure 1.12 and `PCFSoftShadowMap` (proto:725-728); no `outputEncoding`, no `sRGBEncoding`, no `physicallyCorrectLights`; 11 light constructors, including `PointLight(0xff5500, 2.4, 130)` with explicit distance (proto:779-795). [P9]
- Three changed colour management and light units after r128 (colour management on by default and `outputColorSpace` in r152, physically based light units in r155), so a straight upgrade would shift every colour and light intensity in the scene. I did not render this; the claim rests on Three's release history, not on a test here, so it is listed as an assumption below.
- The prototype is one inline classic script (proto:567 onward) with top-level `const`/`let` state, 58 `document.getElementById` calls and `window.innerWidth/innerHeight` reads at proto:716, 723, 2879-2880, 3628-3629, 3925-3926. HUD markup is built through template strings with literal Tailwind class names (proto:3706, 3708, 3730-3755), including conditional full class names such as `isSel ? 'bg-amber-500/25 border border-amber-400/50' : ...`. Tailwind therefore needs the extracted JS in its `content` globs but no safelist. [P9]
- Tailwind CDN: `https://cdn.tailwindcss.com` answers with a 302 to `/3.4.17`, so the prototype's utilities are Tailwind v3.4.17 semantics; the page defines no `tailwind.config` (grep: 0). Utilities that change meaning in v4: the prototype has 9 `ring` uses, 6 `outline-none`, 1 `shadow-sm`, 5 `blur`/`blur-sm`. [P9][P13]
- Next.js rules: `ssr: false` with `next/dynamic` is only allowed in Client Components and errors in Server Components; `next/font/google` self-hosts fonts and non-variable fonts need an explicit `weight`; Tailwind v3 install for Next is `tailwindcss@^3 postcss autoprefixer` with `content` globs over `app`, `pages`, `components`. The Next page says Tailwind v3 works with Turbopack. [S24]
- The prototype's HUD, inspector renderer and main renderer are three separate WebGL/DOM systems all wired by id lookup; a second WebGLRenderer (inspector, 340x176, proto:2663-2670) already exists, so a React remount must dispose both.

### F8. Wallet and signing (question 8)

- wagmi 3.7.7 (peers: viem 2.x, @tanstack/react-query >= 5, TypeScript >= 5.9.3; dependencies @wagmi/core 3.6.5 and @wagmi/connectors 8.2.0). Breaking changes from v2: `useAccount` is now `useConnection`; mutation hooks return `mutate`/`mutateAsync`; connector dependencies are optional peers you must install (`walletConnect` needs `@walletconnect/ethereum-provider@^2.21.1`, `metaMask` needs `@metamask/connect-evm@^2.1.0`; the page lists nothing extra for `injected`). `wagmi/chains` re-exports `viem/chains`. `wagmi/connectors/injected` is an export. [P14][S23]
- RainbowKit 2.2.11 (latest) peers `wagmi ^2.9.0`; ConnectKit 1.9.2 peers `wagmi 2.x` and `react 17.x || 18.x`. Neither supports wagmi 3 or React 19 as declared. `@privy-io/wagmi` 4.0.19 peers `wagmi >=2` and `@privy-io/react-auth ^3`; `@reown/appkit-adapter-wagmi` 1.8.24 peers `wagmi >=2.19.5`. [P14]
- viem 2.57.7 `monad` chain: id 143, RPC `rpc.monad.xyz` and `rpc1.monad.xyz`, WebSocket on both, Multicall3 at block 9,248,132. `monadTestnet`: id 10,143, RPC `testnet-rpc.monad.xyz` only, no WebSocket URL, explorer testnet.monadexplorer.com (stale versus the docs), Multicall3 at block 251,449. [P9]
- Monad docs list software wallets for mainnet (MetaMask, Rabby, Rainbow, OKX, Trust, Backpack, and others). Embedded wallets and account-abstraction providers sit behind sub-pages I did not enumerate; ERC-4337 EntryPoints v0.6 to v0.9 and Simple7702Account are canonical mainnet deployments, but a bundler and paymaster would still be needed. [S1][S18]
- Reserve balance rule affects burner wallets (see F1): a burner funded with less than 10 MON can spend value only as its first transaction in each 3-block window. [S7]

### F9. Hosting (question 9)

- Vercel Hobby: free, "non-commercial, personal use only", function maximum duration 300 s, 100 deployments per day, 100 GB fast data transfer. A long-lived SSE or WebSocket connection cannot live in a Vercel function beyond that cap. [S27]
- Railway: Free $0 with $1 credit per month and 0.5 GB RAM, 1 vCPU per service; Trial one-time $5; Hobby $5 per month including $5 of usage; RAM $10 per GB-month, CPU $20 per vCPU-month; builds free. The pricing page says nothing about sleeping or cold starts. [S27]
- A Node service with one WebSocket upstream, one HTTP port and under 200 MB resident RAM costs roughly 2 USD per month at the posted rates (my arithmetic, assumption A9). The Railway MCP tools are available to the user but are not needed by this track.

### F10. Platform limits and gotchas (question 10)

Consolidated in the table under D10 below, each row citing its finding above.

## Recommendations

### D1. Monad target and RPC plan (question 1)

- **Decision.** Develop, deploy and demo on Monad testnet (10143). Keep the code chain-agnostic (a `chains.ts` with both `monad` and `monadTestnet`, addresses in `deployments/<chainId>.json`) so a mainnet redeploy is a config change. Use `https://testnet-rpc.monad.xyz` and `wss://testnet-rpc.monad.xyz` as primary, `https://rpc-testnet.monadinfra.com` and `wss://rpc-testnet.monadinfra.com` as fallback via viem's `fallback` transport. Override the viem `monadTestnet` object locally with `defineChain` (docs explorers, `blockTime: 300`, both WebSocket URLs). Treat testnet resets as a risk: the deploy script is idempotent and writes the deployment block and addresses to a JSON file the web and server packages both read.
- **Rejected: mainnet for the demo.** Real MON, no faucet, and any contract bug is a real loss; a testnet demo already has the same 0.3 s blocks and finality. Mainnet stays a stretch goal.
- **Rejected: viem's built-in `monadTestnet` unchanged.** Its explorer URL is stale and it lacks a WebSocket URL. [P9][S2]

### D2. Contracts toolchain (question 2)

- **Decision.** Foundry. `foundry.toml`: `network = "monad"`, `solc_version = "0.8.31"`, `evm_version = "osaka"`, `optimizer = true`, `optimizer_runs = 200`, `metadata = true`, `metadata_hash = "none"`, `use_literal_content = true`. OpenZeppelin Contracts 5.6.1 via `forge install`; forge-std v1.17.0. Unit, fuzz and handler-based invariant tests run with `forge test --network monad`; fork-test with `anvil --network monad --fork-url https://testnet-rpc.monad.xyz`. Deploy with a keystore (`cast wallet import`, `forge script --account`), never `--private-key`. Verify on MonadVision through Sourcify (no API key). Day-1 check: confirm forge 1.8.3 accepts `evm_version = "osaka"` and downloads solc 0.8.31; if not, run `foundryup` (1.8.5 exists) and fall back to `prague` only as a last resort (the testnet clearly executes osaka-era opcodes, so `prague` bytecode will also run). Share ABIs with the other packages by copying `forge inspect Arena abi` output into `packages/shared`.
- **Rejected: Hardhat 3.20.0.** Monad documents it and it needs solc 0.8.31 and `osaka` as well, but Foundry is already installed, has native fuzz and invariant testing (the AMM and merger need exactly that), and `--network monad` gives Monad-accurate gas locally. The deciding factor is invariant testing time, not capability.

### D3. Pool primitive (question 3)

- **Decision.** Option (a), an arena-owned constant-product pool per coin, implemented as storage structs inside one `Arena` contract rather than one pool contract per coin. Each coin also has a minimal `CoinToken` ERC-20.
- **Rejected: (b) bonding curve per coin (pump.fun or nad.fun style).** Curves are built around a terminal graduation event and a one-sided virtual reserve; adding MON to a loser-absorbing winner without minting tokens has no natural meaning on a curve, and a curve has no real reserve to hand to loser holders. nad.fun's contracts are a closed launchpad, so reusing them cannot give atomic merge. [S19]
- **Rejected: (c) integrate Uniswap v2/v3 or nad.fun pools.** The arena does not own those reserves (LPs or LP NFTs do), so "merge atomically" would mean removing liquidity from pools it does not control. Token holders hold only the token, so "redistribute to loser holders" would need a holder snapshot. Testnet has no official Uniswap v2/v3 and the protocols repo describes the v4 testnet deployment as unofficial. Exposure to MEV and external pool behavior goes up with audit surface unchanged. [S19]
- **Rejected: (d) hybrid** (own AMM that later graduates to a DEX). Out of scope for a days-long build; it is a post-demo roadmap line.
- **Why a single contract rather than a pool contract per coin.** With all pools in one contract, the merger in section "Merger, atomically" touches two storage structs and never makes an external call to move MON. A per-coin pool contract would need an external MON transfer between pools, a trust relationship between pool contracts and the arena, and a factory with 30 deployments of pool code. A single contract is also one address for the indexer to watch.

#### D3.1 Contracts

| Contract | Responsibility | State it holds |
|---|---|---|
| `Arena` | Launch, swap, stage machine, PvE, clash lifecycle, merger, claims, prize pool. One deployed address. Inherits `PoolBook` (storage, AMM math, merge primitive) and OpenZeppelin `Ownable2Step` and `ReentrancyGuard`. | `Coin[31] coins` (index 0 unused, ids 1..30), `Stage stage`, `uint8 coinCount`, `uint8 aliveCount`, `uint256 prizePool`, `mapping(uint32 => Clash) clashes`, `uint32 nextClashId`, `mapping(uint8 => uint256) claimPot`, `mapping(uint8 => uint256) claimSupply`, `address keeper`, parameters (below) |
| `CoinToken` | ERC-20 (OpenZeppelin `ERC20`), fixed supply minted to `Arena` in the constructor. `arena` is immutable. Only `Arena` may call `arenaBurn(address,uint256)`. The allowance check is bypassed when the spender is `arena`, so sells need no separate approve transaction. | name, symbol, balances |
| `ClashMath` (library) | Pure functions: `weight(level, reserveSnapshot, element)`, `elementEdge(a, b)`, `isqrt`, `pickWinner(seed, wA, wB)` | none |

There is deliberately no separate `ArenaFactory`: `launch` lives in `Arena`, which keeps the cap and the registry in one place. `CoinToken` is created with `new` inside `launch` (128 KB code limit and 30 deployments make clones unnecessary).

Protocol parameters (constants or owner-set within hard bounds, frozen once `Stage.Battle` starts): `MAX_COINS = 30` (diagram stage 1, A3), `TOKEN_SUPPLY = 1_000_000_000e18`, `MIN_SEED` (testnet: 1 MON), `LAUNCH_FEE` (testnet: 0.5 MON, goes to `prizePool`), `SWAP_FEE_BPS = 100` (stays in the pool reserve), `CLASH_DELAY_BLOCKS = 3`, `CLASH_EXPIRY_BLOCKS = 250`, `COOLDOWN_BLOCKS = 20`, and the merger split `BOOST_BPS = 7000`, `HOLDER_BPS = 2000`, `FEE_BPS = 1000` (A7's suggested 70/20/10, sum must equal 10,000, enforced in the setter).

#### D3.2 Types

```solidity
enum Stage  { Spawn, Battle, Finished }          // diagram stages 1, 2-3, 4
enum Status { None, Alive, Merged, Champion }

struct Coin {
    address token;        // CoinToken
    address creator;
    uint128 reserveMon;   // pool quote reserve, wei. Prototype "lp"
    uint128 reserveToken; // pool token reserve
    uint64  launchedAt;
    uint64  lastCombatBlock;
    uint32  wins;         // clash wins
    uint32  pveWins;
    uint32  activeClash;  // 0 = free, else clashId (trading frozen)
    uint16  level;
    uint8   monsterId;    // 0 fire_dragon, 1 ice_wolf, 2 earth_golem, 3 electric_fox, 4 dark_spirit
    uint8   skinId;       // 0 default, 1 obsidian, 2 royal, 3 crystal, 4 celestial
    Status  status;
}

struct Clash {
    uint8  a; uint8 b;
    uint64 startBlock;
    uint32 weightA; uint32 weightB;   // snapshot at start
    bool   resolved;
}
```

The monster and skin index order follows `MONSTER_CATALOG` (proto:578 onward) and `SKIN_MODIFIERS` key order; `packages/shared` owns the single mapping table and a test that the Solidity enum count equals the catalog length.

#### D3.3 External functions (the role-boundary surface)

```solidity
// ---- Players (frontend, burner wallets) ----
function launch(string calldata name, string calldata symbol, uint8 monsterId, uint8 skinId)
    external payable returns (uint8 coinId);
    // Stage.Spawn only; coinCount < 30; msg.value >= MIN_SEED + LAUNCH_FEE;
    // symbol 2-6 chars A-Z0-9; seed = msg.value - LAUNCH_FEE becomes reserveMon;
    // all TOKEN_SUPPLY is minted into the pool (reserveToken). Creator holds no tokens.

function buy(uint8 coinId, uint256 minTokensOut, uint64 deadline)
    external payable returns (uint256 tokensOut);
function sell(uint8 coinId, uint256 tokensIn, uint256 minMonOut, uint64 deadline)
    external returns (uint256 monOut);
    // both require status == Alive (or Champion) and activeClash == 0

function claim(uint8 loserId) external returns (uint256 monPaid);
    // burn-to-claim of the holder's whole balance of a Merged coin

// ---- Views (frontend, server) ----
function getCoins() external view returns (Coin[] memory);        // ids 1..coinCount in one call
function getCoin(uint8 coinId) external view returns (Coin memory);
function quoteBuy(uint8 coinId, uint256 monIn) external view returns (uint256 tokensOut);
function quoteSell(uint8 coinId, uint256 tokensIn) external view returns (uint256 monOut);
function previewClash(uint8 a, uint8 b) external view returns (uint16 oddsABps);
function pendingClaim(uint8 loserId, address holder) external view returns (uint256 monOwed);
function arenaState() external view
    returns (Stage stage, uint8 coinCount, uint8 aliveCount, uint256 prizePool, uint32 nextClashId);

// ---- Keeper only ----
function startBattle() external;                                  // owner, or anyone if full or deadline passed
function startClash(uint8 a, uint8 b) external returns (uint32 clashId);
function runPvE(uint8[] calldata coinIds, uint8[] calldata npcIds) external;

// ---- Anyone (liveness does not depend on the keeper) ----
function resolveClash(uint32 clashId) external;                   // callable from startBlock + 3 until startBlock + 250
function cancelClash(uint32 clashId) external;                    // after startBlock + 250 with no resolution

// ---- Owner ----
function setKeeper(address) external;
function fundPrize() external payable;
```

#### D3.4 Events (consumed by the indexer and the 3D client)

Rule: every event carries the post-state numbers the UI needs, so neither the server nor the browser has to do a state read to render an event.

```solidity
event CoinLaunched(uint8 indexed coinId, address indexed token, address indexed creator,
                   string name, string symbol, uint8 monsterId, uint8 skinId, uint256 seedMon);
event Swap(uint8 indexed coinId, address indexed trader, bool isBuy,
           uint256 monAmount, uint256 tokenAmount, uint256 reserveMon, uint256 reserveToken);
event StageChanged(Stage stage);
event ClashStarted(uint32 indexed clashId, uint8 indexed a, uint8 indexed b,
                   uint64 startBlock, uint64 resolvableFromBlock, uint32 weightA, uint32 weightB);
event ClashResolved(uint32 indexed clashId, uint8 indexed winner, uint8 indexed loser,
                    bytes32 seed, uint16 winnerOddsBps);
event Merged(uint32 indexed clashId, uint8 indexed winner, uint8 indexed loser,
             uint256 loserReserve, uint256 boostMon, uint256 tokensBurnedByAutoBuy,
             uint256 holderPot, uint256 fee, uint256 winnerReserveAfter, uint256 winnerTokenReserveAfter);
event ClashCancelled(uint32 indexed clashId);
event PvEResolved(uint8 indexed coinId, uint8 npcId, bool won, uint16 level,
                  uint256 rewardMon, uint256 reserveMonAfter);
event Claimed(uint8 indexed loserId, address indexed holder, uint256 tokensBurned, uint256 monPaid);
event ChosenOne(uint8 indexed coinId, uint256 finalReserveMon, uint32 wins);
```

| Consumer | Events it needs |
|---|---|
| 3D scene | `CoinLaunched` (spawn), `ClashStarted` (approach), `ClashResolved` + `Merged` (decisive blow, absorb particles, pool vessel resize, kill-feed row), `PvEResolved` (monster fight and reserve change), `Swap` (pool vessel level, floaters), `StageChanged`, `ChosenOne` (finale) |
| Leaderboard | `Swap`, `Merged`, `PvEResolved`, `CoinLaunched` (sort by `reserveMon`, tie-break `wins`, same as proto:3692) |
| Keeper | `CoinLaunched`, `ClashStarted` (schedule `resolveClash`), `ClashResolved`, `ClashCancelled`, `StageChanged` |

#### D3.5 Swap math

Constant product on real reserves with the fee kept in the pool:

```solidity
// buy: monIn is msg.value
uint256 monInAfterFee = monIn * (10_000 - SWAP_FEE_BPS) / 10_000;
tokensOut = reserveToken * monInAfterFee / (reserveMon + monInAfterFee);
reserveMon   += monIn;            // fee stays in the reserve, so k only grows
reserveToken -= tokensOut;
// sell: symmetrical, MON paid out with a pull-safe low-level call after state is written
```

The prototype's `lp` becomes `reserveMon` (shown in MON, optionally converted to USD with the Pyth MON/USD feed id `0x31491744...cd1` from `monad-crypto/protocols`). There is no `lp` token and no add/remove liquidity function: pool depth only changes through swaps, PvE rewards and merger. That is the single biggest simplification versus a real AMM and is what makes the invariants cheap to state.

#### D3.6 Merger, atomically

`resolveClash` ends in `_merge(winner, loser)`. All of it happens in one transaction with no external call before the state is final (the MON never leaves the contract during a merge; `CoinToken.arenaBurn` is a call to a contract we deployed):

```solidity
function _merge(uint8 w, uint8 l) internal {
    Coin storage W = coins[w];
    Coin storage L = coins[l];

    uint256 r     = L.reserveMon;
    uint256 fee   = r * FEE_BPS   / 10_000;
    uint256 boost = r * BOOST_BPS / 10_000;
    uint256 pot   = r - fee - boost;               // holders; absorbs rounding dust

    // 1. close the loser
    L.status = Status.Merged;  L.reserveMon = 0;
    uint256 poolTokens = L.reserveToken;  L.reserveToken = 0;
    CoinToken(L.token).arenaBurn(address(this), poolTokens);   // pool-side supply leaves circulation
    uint256 circulating = IERC20(L.token).totalSupply();       // = what traders hold
    if (circulating == 0) { prizePool += pot; pot = 0; }
    claimPot[l] = pot;  claimSupply[l] = circulating;

    // 2. "Auto-Buy Boosts Winner": market-buy the winner token with `boost` and burn it
    uint256 out = W.reserveToken * boost / (W.reserveMon + boost);   // no swap fee on the protocol buy
    W.reserveMon   += uint128(boost);
    W.reserveToken -= uint128(out);
    CoinToken(W.token).arenaBurn(address(this), out);

    // 3. books
    prizePool += fee;
    W.wins += 1;  W.level += 1;
    aliveCount -= 1;
    emit Merged(...);                                   // carries all numbers above
    if (aliveCount == 1) _finish(w);                    // champion: add prizePool to its reserve
}

function claim(uint8 id) external nonReentrant returns (uint256 paid) {
    require(coins[id].status == Status.Merged, "not merged");
    uint256 bal = IERC20(coins[id].token).balanceOf(msg.sender);
    require(bal > 0, "no balance");
    paid = claimPot[id] * bal / claimSupply[id];
    claimPot[id]    -= paid;
    claimSupply[id] -= bal;                              // last claimer receives the exact remainder
    CoinToken(coins[id].token).arenaBurn(msg.sender, bal);
    (bool ok, ) = msg.sender.call{value: paid}(""); require(ok, "send failed");
    emit Claimed(id, msg.sender, bal, paid);
}
```

How this maps to the diagram:

- "Auto-Buy Boosts Winner" is step 2: 70% of the loser's reserve market-buys the winner token from its own pool and burns it. Winner price after is `(R + x)^2 / (R * T)` times the old price, a larger jump than a plain donation, and the Swap-like numbers are in the `Merged` event for the visual.
- "Value Redistributed to Losers" is `pot`: 20% of the loser's reserve, paid in MON to loser holders pro-rata to their token balance through burn-to-claim. There is no snapshot and no loop over holders, so gas is O(1) at merge time; each holder pays for their own claim.
- The remaining 10% goes to `prizePool`. PvE rewards draw from it; at `_finish`, whatever is left is added to the champion's reserve, giving the diagram's stage 4 "one large consolidated pool".
- Variant if the product owner prefers in-kind redistribution (winner tokens instead of MON): replace `pot` with a second protocol buy and a `claimSupply`-proportional token payout. Costs one more swap computation and exposes the holder payout to the winner's price impact; not recommended for the demo.

#### D3.7 Invariants (Foundry invariant tests, handler-driven)

| ID | Invariant |
|---|---|
| I1 Solvency | `address(arena).balance >= sum(reserveMon of Alive/Champion) + sum(claimPot of Merged) + prizePool`. Accounting uses stored numbers, never `address(this).balance` (forced sends via selfdestruct or coinbase can only raise the left side). |
| I2 k monotonic | For buy and sell, `reserveMon * reserveToken` after is not lower than before (the fee stays in). Merger step 2 strictly raises it. |
| I3 Conservation at merge | `loserReserve == fee + boost + holderPot` exactly (the remainder term makes this hold by construction; test it with fuzzed reserves). |
| I4 Monotone status | `None -> Alive -> Merged` or `Alive -> Champion`; a Merged coin never trades, never fights, never returns to Alive. |
| I5 Population | `aliveCount` equals the count of `Alive` + `Champion` coins and drops by exactly 1 per merge; `Stage.Finished` iff `aliveCount == 1` after the first clash. |
| I6 Freeze | A coin with `activeClash != 0` cannot `buy`, `sell` or join another clash; both coins are unlocked in the same transaction as `resolveClash` or `cancelClash`. |
| I7 Claim pro-rata | `sum(paid over all claims of loser l) <= holderPot[l]`, and when `claimSupply[l]` reaches 0 then `claimPot[l]` is 0. |
| I8 Token supply | For an Alive coin, `token.balanceOf(arena) >= reserveToken`. For a Merged coin, `totalSupply == claimSupply + claimedSoFar`. |

#### D3.8 Known attack vectors and mitigations

| Vector | Mitigation in this design | Residual risk |
|---|---|---|
| Front-run or sandwich around the merger (buy the winner just before `resolveClash`, sell right after) | Both coins are frozen from `startClash` until resolution, so nobody can trade the winner in the window where the outcome is knowable; the price jump happens inside `resolveClash` and cannot be bought before it. | Anticipation attack: trading before `startClash` on a coin the attacker expects the keeper to pair. Outcome is still random, odds are public via `previewClash`. Treated as a game mechanic. |
| Resolution transaction visible in the mempool | No keeper secret exists. The seed is a public function of `blockhash(startBlock + 2)`, so there is nothing hidden to front-run and anyone can submit the resolution. | Whoever sees block `startBlock + 2` can compute the outcome before the resolve lands, but both coins are frozen, so there is no trade to make. |
| Keeper grinds outcomes (picks pairs or timing to get a desired winner) | Keeper chooses the pair before the seed block exists; seed depends on a future block hash; resolve is permissionless, so withholding it only delays. | Keeper can cancel by not starting; block proposers can bias one bit by skipping a block, which on testnet is accepted. Production: Entropy. |
| Pool-size manipulation to win (flash buy before `startClash`, dump after) | Weights use `isqrt(reserveSnapshot)` snapshotted at `startClash` (dampened), and the pair is frozen. | A wealthy actor can legitimately buy their own coin earlier. This is the pay-to-support loop by design, to be disclosed in the rules shown to judges. |
| Reentrancy via MON send in `sell` and `claim` | `nonReentrant`, state written before the call, pull-based claims. | None known. |
| Donation or forced-send accounting attacks | Reserves are stored numbers, not `balance` reads. | None. |
| Rounding and dust | Holder pot takes the remainder; last claimer takes the exact remainder; `circulating == 0` redirects the pot to `prizePool`. | Dust under 1 wei per claim. |
| Spawn spam or slot squatting (30-slot cap) | `MIN_SEED + LAUNCH_FEE` with a non-withdrawable seed and a fee that funds the prize pool. A squatter pays real MON and holds no tokens. | A rich attacker can fill all 30 slots. Production: allowlist or higher bond. |
| Honest-but-curious `arenaBurn` privilege | Only `Arena` can call it and `Arena` only burns `msg.sender` balances in `claim` and its own pool tokens. | Arena bug equals token seizure. Needs the audit focus. |
| Loser tokens listed on an external DEX before merge | Out of scope for the demo. | The pool address becomes the claimant and can lock claim value. Production: transfer lock on loser tokens or a snapshot module. |
| Owner key | Parameters frozen at `Battle` start, `Ownable2Step`, keeper address changeable but unable to move funds. | Owner can still `setKeeper`. Production: timelock plus multisig. |

#### D3.9 Simplified for the demo versus production

| Area | Demo | Production |
|---|---|---|
| Randomness | Future blockhash, permissionless resolve | Pyth Entropy per round, or Supra dVRF |
| Pool | Single-contract constant product, fee stays in pool, no LP shares, no liquidity add/remove | Audited AMM or CLMM integration, LP accounting |
| Quote asset | Native MON (no WMON wrapping, no approvals for buys) | WMON or stablecoin, oracle-based USD display |
| Holder redistribution | Burn-to-claim in MON by current balance | Snapshot at announcement, anti-wash rules, vesting |
| PvE | Keeper-triggered, outcome computed on-chain from `blockhash(block.number - 1)`; keeper can simulate and choose when to send, so only level and a capped prize-pool reward are at stake | Same commit-then-future-block pattern as clashes, or Entropy |
| Anti-MEV | Pair freeze | Batch auctions or private order flow |
| Admin | One owner EOA | Timelock and multisig (Safe is a canonical Monad deployment) |
| Audit | Foundry unit, fuzz and invariant tests only | External audit before any real funds |
| Gas numbers | Not measured yet (assumption A10) | `forge snapshot` and `--gas-report` gating |

### D4. Randomness and combat resolution (question 4)

- **Decision (demo).** Commit-then-future-blockhash with a permissionless resolve and a pair freeze, as in D3.8. **Production-grade:** Pyth Entropy on mainnet with one `requestV2` per round (not per clash), the callback storing a round seed, per-clash randomness derived as `keccak256(roundSeed, clashId)`. That amortizes the 1.4 MON fee over every clash in the round and keeps the callback trivially non-reverting. [S20][P5]
- **Rejected: Pyth Entropy for the demo.** No verifiable testnet deployment (F4), a provider-run async callback adds a dependency and latency we cannot measure here, and a failed callback stalls the arena. **Rejected: Chainlink VRF** (not offered on Monad, [S21]). **Rejected: keeper-signed randomness** (the keeper becomes a trusted oracle and the contract has to verify signatures for no gain). **Rejected: classic commit-reveal with a keeper secret** (the reveal is calldata in a public transaction, so the front-run channel reopens; Entropy is exactly this design with an honest provider). **Rejected: `PREVRANDAO`** (not documented as unbiased on Monad). **Rejected: Supra dVRF** for the demo only because it needs an account and subscription flow we have not verified; it stays a production alternative. [S16]

#### D4.1 End-to-end flow

| Step | Actor | Call | Randomness | On-chain effect |
|---|---|---|---|---|
| 0 | Owner | `startBattle()` once `coinCount == 30`, or a deadline passes with at least 2 coins, or the owner forces it for the demo | none | `Stage.Battle`, `StageChanged` |
| 1 | Keeper (every N s, N around 6 to 8) | `runPvE(coinIds, npcIds)` for coins that are free and off cooldown | `blockhash(block.number - 1)` mixed with coin id and nonce; trusted-keeper simplification | level +1 and a capped reward from `prizePool` on a win; `PvEResolved` |
| 2 | Keeper | `startClash(a, b)` | none yet | both coins frozen (`activeClash = id`); weights snapshotted; `ClashStarted(startBlock, resolvableFromBlock = startBlock + 3)` |
| 3 | Keeper (also any watcher) | `resolveClash(id)` once block >= `startBlock + 3` | `seed = keccak256(blockhash(startBlock + 2), id, a, b)`; winner = `uint256(seed) % (wA + wB) < wA ? a : b` | `ClashResolved`, then `_merge`, `Merged`, unfreeze, possibly `ChosenOne` |
| 3b | Anyone | `cancelClash(id)` if `block > startBlock + 250` (the `BLOCKHASH` window) | none | unfreeze, `ClashCancelled` |
| 4 | Loser holders | `claim(loserId)` any time after the merge | none | MON paid, tokens burned, `Claimed` |

`wA` and `wB` come from `ClashMath.weight`: `isqrt(reserveSnapshot) * (100 + 10 * level) * elementMultiplier / 100`, with `elementMultiplier` 120 for an elemental edge and 100 otherwise. The edge table (a five-element cycle) and the numbers are a game-design proposal for product to confirm; the contract exposes `previewClash` so the UI can show odds.

Pacing for the demo: 30 coins means 29 merges. At one clash every 6 to 8 seconds with up to 2 in parallel that is about 2 to 4 minutes, which is the right length for the pitch; the demo can start with fewer coins by calling `startBattle()` early. Each clash costs the keeper 2 transactions (start and resolve), so the keeper sends well under 1 transaction per second.

#### D4.2 Time-to-finality implications for the 3D replay

Numbers from F1: block 0.3 s, Voted about 0.3 s after Proposed, Finalized about 0.55 to 0.7 s, Verified about 1.4 to 1.5 s. Timeline of one clash, measured from the moment the keeper submits `startClash`:

| Time | Event | What the client may do |
|---|---|---|
| t = 0.0 s | `startClash` submitted | nothing visible yet |
| t about 0.3 to 0.9 s | `ClashStarted` seen as Proposed on `monadLogs` (a few ms after proposal) | cosmetic only: walk the two monsters toward each other and raise HP bars. This is reversible and carries no result. |
| t about 1.2 to 1.8 s | block `startBlock + 3` exists; keeper sends `resolveClash` | keep the stall choreography going: strike exchange with both HP bars hovering around 40 to 70 percent, derived from the pre-announced odds |
| t about 2.0 to 2.4 s | `ClashResolved` and `Merged` Proposed | do not commit visuals yet |
| t about 2.6 to 3.1 s | same logs Finalized | decisive blow, absorb particle stream, pool-vessel resize, leaderboard re-sort, kill-feed row |

Rules for the 3D and indexer roles:

1. The chain is the source of truth and the screen lags it by design: the winner is already known and final (about 0.6 s after proposal) when the decisive visual begins, so the scene never has to roll a visual back. The end-to-end visible delay per clash is roughly 3 s, comparable to the prototype's own duel length (strikes every 0.45 s, proto:3401; a duel is 4 to 8 strikes).
2. Irreversible UI (leaderboard order, feed, pool vessel levels, win counters, claim button) updates on `commitState == Finalized`; cosmetic anticipation may use Proposed or Voted.
3. Blocks are identified by `blockId`, not number: a Proposed block can be replaced by another block at the same height with no abandonment event; discard provisional events whose `blockId` never reaches Voted or Finalized once a different `blockId` finalizes at that height. [S10]
4. The client may derive a deterministic fight script from the emitted `seed` (so reloads and slow clients replay the same fight) but never decides the winner.
5. A user's own `buy` or `launch` transaction can be shown as pending on the wallet side immediately and confirmed on Proposed or Voted for snappy UX; the pool vessel level update still waits for the `Swap` event at Voted or later.

### D5. Keeper and automation (question 5)

- **Decision.** One TypeScript service (`server/`) built on viem 2.57.7 with a funded testnet keeper EOA. It owns the scheduling loop (`runPvE`, `startClash`, `resolveClash`), uses `privateKeyToAccount(key, { nonceManager })`, passes an explicit `gas` limit per call (measured with `forge --gas-report` plus 20 percent headroom, because Monad charges the limit), sets a priority fee at or above the 2 gwei default, and uses `writeContractSync` so the next step starts after the previous receipt. Two accounts, "pve lane" and "clash lane", if throughput ever needs parallelism, never two senders on one account. A watcher inside the same process calls `resolveClash` for any started clash that nobody resolved after `startBlock + 3`, and `cancelClash` after the expiry, so correctness does not depend on the keeper being alive for more than one block window.
- **Key handling rules.** (1) No keys in the repo or its history; `.env` is gitignored and the repo ships `.env.example` with variable names only (`KEEPER_PRIVATE_KEY`, `DRIP_PRIVATE_KEY`, `RPC_HTTP_URL`, `RPC_WS_URL`). (2) Deployer key lives in a Foundry keystore (`cast wallet import`), not in env. (3) Keeper and deployer are different keys; the keeper can only call `startClash` and `runPvE`, which cannot move funds. (4) Keeper key is injected as a Railway service variable. (5) Testnet-only balances, low float (a few MON), refilled by hand. (6) A startup log prints the keeper address, never the key; error handlers redact variables. (7) Run a secret scanner (for example gitleaks) in pre-commit and CI; the tooling track owns the choice.
- **Rejected: on-chain automation (Gelato, Chainlink Automation).** Neither appears in Monad's tooling index (no keeper or automation category) and I did not find a primary source for either on Monad; Gelato VRF is listed for testnet only. [S16][S29] **Rejected: browser-side scheduling** (a viewer's tab would decide when fights happen). **Rejected: Vercel cron or functions as keeper**: 300 s maximum function duration on Hobby and no long-lived WebSocket. [S27]

### D6. Indexer and realtime (question 6)

- **Decision.** No separate indexer for the demo. The `server/` service holds a single upstream WebSocket to `wss://testnet-rpc.monad.xyz` subscribed to `monadLogs` filtered by the Arena address, keeps a typed in-memory model (coins from `getCoins()` at boot and refreshed after each `Finalized` event, plus a ring buffer of the last 200 events for the feed), and fans out to browsers with Server-Sent Events from a small Hono app (`streamSSE`, `@hono/node-server`). On cold start it rebuilds the feed with `eth_getLogs` in 100-block pages from the recorded deployment block, 5 concurrent requests, well under the 25 to 50 rps limits. Raw WebSocket (`monadLogs`) is used instead of viem's `watchContractEvent` because viem's subscription is the plain `logs` type and exposes no `commitState`; viem is still used for ABI decoding, `readContract`/multicall, and writes. Wire format: first message `snapshot` (stage, coins, last event id), then `event` (decoded log with `blockNumber`, `blockId`, `logIndex`, `commitState`), plus `commit` updates `{blockId, state}`. `Last-Event-ID` is `blockNumber-logIndex`; SSE reconnects automatically.
- **Client data path.** The 3D scene and panels read arena state from the server SSE stream. Wallet-specific reads (user balance, quotes, `pendingClaim`) go straight to the RPC through wagmi with viem's multicall batching (Multicall3 exists on both networks). If the SSE stream is down, the client degrades to polling `getCoins()` once per second through a `fallback` transport, which at a handful of viewers stays inside the public limits.
- **Rejected: Ponder 0.18.2 for the demo.** It is the right production indexer (typed schema, reorg handling with `reorgWindow`, SQL and live queries over SSE, `ethGetLogsBlockRange` or automatic range detection) but it needs Postgres or PGlite, a schema and handlers, a second process next to the keeper, and its 1 s default polling adds latency on top of the 0.3 s blocks; here the event volume is tiny and state is entirely readable from `getCoins()`. It is the upgrade path if the project continues. [S25]
- **Rejected: Envio HyperIndex.** Hosted free tier deletes deployments at 30 days and flags at 100,000 events or 7 days idle, and indexing latency for a live 3D feed is unmeasured; it is a good production choice with WebSocket subscriptions. [S17][S26] **Rejected: Goldsky and The Graph** (no WebSocket subscriptions, subgraph deploy cycle on a testnet that has been reset before). **Rejected: browser-direct `watchContractEvent` over WebSocket as the only path**: every judge's tab would open its own upstream subscription on a shared public endpoint rated at 25 to 50 rps, and viem exposes no commit state. [S1][S2][P9]

### D7. Frontend migration (question 7)

- **Decision.** Next.js 16.4.2 App Router, React 19.3.1, TypeScript 5.9.3, Tailwind 3.4.19, `three@0.128.0`, zustand 5.0.15, with this structure:
  1. Create the Next app with TypeScript for the shell and React panels. Pin `three@0.128.0` exactly in `package.json` (no caret) and add `@types/three@0.128.0` only if typing the scene is wanted.
  2. Move the prototype's `<script>` body (proto:567-4183) into `web/src/scene/arena-scene.js` (plain JS with `// @ts-nocheck`), exposing `mountArena(container, bridge)` and `unmount()`. Keep the 2,000 plus lines of scene code as they are. Inside the module, replace the CDN globals with:
     ```js
     import * as THREE_NS from 'three';
     import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
     const THREE = { ...THREE_NS, OrbitControls };   // keeps every `THREE.X` and `new THREE.OrbitControls` line unchanged
     ```
     This avoids the `examples/js` global-script problem completely: the module version of OrbitControls is exported by the package and needs no global.
  3. `web/src/components/ArenaCanvas.tsx` is `'use client'`, renders the container div and calls `mountArena` in a `useEffect` with a cleanup that cancels the render loop, removes listeners and disposes both renderers (main and inspector, proto:716-723 and 2663-2670). `web/src/app/page.tsx` imports `dynamic(() => import('../components/ArenaCanvas'), { ssr: false })` from a `'use client'` leaf, because `ssr: false` is rejected in Server Components. [S24]
  4. The HUD markup (the `<style>` block and markup, proto:12-566) becomes a static React/JSX shell keeping the same element ids at first, so the imperative code keeps working with its 58 `getElementById` calls; then migrate leaderboard, feed, inspector and launch modal to React panels one at a time, reading from the store.
  5. State bridge: a vanilla zustand store (`createStore`) is the single source of arena state. Chain events enter through the SSE client and write the store; React panels read with `useStore`; the scene subscribes imperatively (`store.subscribe`) and pushes UI intents (select coin, hover) back through a small typed `EventTarget` emitter. A separate emitter carries one-shot animation triggers (`clashResolved`) so React renders never replay them.
  6. Tailwind: `tailwindcss@3.4.19`, `postcss@8.5.31`, `autoprefixer@10.6.1`, `content: ['./src/**/*.{js,ts,jsx,tsx}']`. The glob must include `src/scene/*.js`, because the leaderboard and feed rows are template strings built in JS (proto:3706, 3730-3755); all their class names are literal strings, so no safelist is needed. The CSS variables block and custom classes (the `<style>` block in proto:12-566) move into `globals.css` unchanged.
  7. Fonts: `next/font/google` for Cinzel (weights 700, 800, 900), Plus Jakarta Sans (400 to 800), JetBrains Mono (500 to 700), exposed as CSS variables mapped to the prototype's font stacks. Import names use underscores for multi-word families (`Plus_Jakarta_Sans`, `JetBrains_Mono`); confirm at first build.
  8. Chain mode: delete `autoRespawn`, `syncPopulation` and `createRandomTokenConfig` use (proto:2858, 3439-3441) and the proximity trigger at proto:3505-3511; entities come from `getCoins()` and clashes from events. This is Track 04's seam list; the point here is that the migration above does not require changing the scene's rendering code.
- **Rejected: upgrading Three past r128** (for example to 0.186.1). Colour management and light units changed after r128, so every colour and light value in the scene would shift (assumption A6, unverified by render). The scene keeps working on r128 with the module build, so there is no reason to take the risk during a demo build.
- **Rejected: keeping the CDN scripts inside Next.** It works (`next/script` with `beforeInteractive`) but it ties the app to three CDNs, breaks offline demos, and makes the Tailwind CDN's runtime class scanning an uncontrolled dependency.
- **Rejected: Tailwind v4 (4.3.3).** The CDN serves 3.4.17 today; v4 changes defaults for `ring`, `shadow-sm`, `outline-none` and `blur`, all of which the prototype uses (9, 1, 6 and 5 occurrences), so v3 is the pixel-faithful route. Revisit after the demo.
- **Vite versus Next.js, honestly.** Vite 8.3.4 with `@vitejs/plugin-react` 6.1.2 would be materially simpler for this app: it is a single canvas page with no SSR value, no server components, no hydration risk, no `ssr: false` leaf, and the global-script and font handling are trivial. The saving is roughly half a day of setup friction and hydration debugging, not a week. Keeping Next.js costs that half day, buys native Vercel deploys with preview URLs, route handlers for small things (metadata, a faucet-drip proxy), and obeys the PM playbook rule. Recommendation: stay on Next.js; if the `dynamic`/mount boundary eats more than half a day, falling back to Vite is cheap because the scene module and the store do not import anything from Next.

### D8. Wallet and signing UX (question 8)

- **Decision.** wagmi 3.7.7 + viem 2.57.7 + @tanstack/react-query 5.104.4. Config with the locally defined Monad testnet chain (D1), `injected()` from `wagmi/connectors` (wallet discovery via the browser's installed wallets), and `http` plus `webSocket` transports behind `fallback`. A custom connect button in the prototype's glass vocabulary (Track 01 specifies it) rather than a prebuilt modal. WalletConnect is optional and needs `@walletconnect/ethereum-provider@^2.21.1` and a project id; skip unless mobile demo is needed. Add the chain with `wallet_addEthereumChain` through wagmi's `switchChain`, using the chain object from `defineChain`.
- **One-click demo path.** A burner wallet: `generatePrivateKey()` and `privateKeyToAccount()` from `viem/accounts`, stored in `localStorage` with a plainly labelled "demo wallet, testnet only, do not deposit real funds" notice. The server exposes `POST /drip` that sends 2 to 3 MON from a funded `DRIP_PRIVATE_KEY` account, rate-limited per IP and per address. Trades from the burner use `writeContractSync` with explicit gas, so a buy shows confirmed in about one block. This gives judges zero popups and zero faucet visits. Spectators need no wallet at all.
- **Reserve-balance caution for the burner and for judges' wallets.** With under 10 MON, a value-sending transaction succeeds only if it is that account's only transaction in the previous 3 blocks (about 0.9 s). The UI therefore serializes value-sending transactions per account and enforces at least 4 blocks between them. [S7]
- **Rejected: RainbowKit 2.2.11 and ConnectKit 1.9.2.** Their declared peers are wagmi 2.x (ConnectKit also React 17 or 18), incompatible with wagmi 3.7.7 and React 19.3.1; downgrading wagmi to 2.19.5 would work but gains a stock modal that clashes with the design language. [P14] **Rejected: Privy embedded wallets** (`@privy-io/react-auth` 3.50.0, `@privy-io/wagmi` 4.0.19) and **ERC-4337 session keys**: they need accounts, app ids, a bundler and paymaster flow, which is more setup than a burner key gives for a testnet demo. They are the production path. [P14][S18]

### D9. Hosting (question 9)

- **Decision.** Frontend on Vercel (Hobby is acceptable for a hackathon but is restricted to non-commercial use, so move to Pro if this becomes a product). Keeper plus SSE fan-out as one always-on Node service on Railway (Hobby $5 per month with $5 of usage included, or the one-time Trial credit), single replica, health check on `/healthz`, restart on failure. Server environment: `NODE_ENV`, `RPC_HTTP_URL`, `RPC_WS_URL`, `ARENA_ADDRESS`, `DEPLOY_BLOCK`, `KEEPER_PRIVATE_KEY`, `DRIP_PRIVATE_KEY`, `ALLOWED_ORIGIN`. CORS limited to the Vercel domain. No cold-start strategy needed: an always-on container has none, but I could not confirm from Railway's docs that services never sleep (assumption A8), so the first deploy should verify uptime for an hour. Contract deployment is run from a laptop with the keystore, never from CI.
- **Rejected: keeper and SSE on Vercel functions or cron.** Maximum duration 300 s on Hobby and no persistent WebSocket upstream. [S27] **Rejected: everything on Railway.** Gives up Vercel previews for the frontend and the playbook default for no benefit; it remains a one-step fallback.

### D10. Platform limits that change the design (question 10)

| Monad fact | Design consequence |
|---|---|
| Gas charged on limit, not used [S5] | Explicit `gas` on every keeper, burner and script transaction; no reliance on estimation fallbacks; `forge --gas-report` to size limits; do not let wallets default to huge limits |
| Cold storage and account access are expensive, page-based [S6] | Keep `Coin` structs compact and contiguous, read `getCoins()` once per block batch rather than field by field, avoid per-holder loops in any state-changing function (merge is O(1) for this reason), and avoid calling many distinct external contracts in one transaction |
| Reserve balance, 10 MON per EOA, 3-block emptying window [S7] | Burner serialization (D8); keeper never sends value; verify on Day 1 that `Arena` (a contract) can pay out its full balance, since the docs describe the rule for EOAs only (assumption A1) |
| No global mempool; priority gas auction ordering [S4][S5] | Treat the resolution transaction as public; no secrets in calldata (D4); keeper uses a modest priority fee so its transactions are not outbid by noise |
| `eth_getLogs` window 100 blocks on the public endpoints [S3][P2] | Never poll `getLogs` over long ranges; backfill in 100-block pages with bounded concurrency; prefer WebSocket subscriptions and `getCoins()` for state; record `DEPLOY_BLOCK` |
| Deferred nonce validation; txs can sit behind a gap [S3] | One in-flight transaction per account, viem `nonceManager` with `pending` source, reset on any send failure, `writeContractSync` for sequencing |
| `latest` is speculative; blocks can be replaced at the same height without an event [S8][S10] | Key events by `blockId`; Finalized for irreversible UI (D4.2) |
| `BLOCKHASH` window about 256 blocks (about 77 s) [P4] | `CLASH_EXPIRY_BLOCKS = 250` and `cancelClash`; keeper resolves within seconds |
| `eth_call` gas cap 200M (QuickNode, Alchemy, MF) and 30M by default on self-run nodes [S3] | `getCoins()` over 30 coins is far under any cap; still avoid unbounded loops in views |
| Rate limits 25 to 50 rps per public endpoint [S1][S2] | Single upstream WebSocket in the server, SSE to browsers, multicall batching in wagmi, fallback RPC list, and get a private keyed endpoint for the keeper and server if one is free to obtain (open question Q4) |
| Testnet reset history (2025-12-16) [S2] | Idempotent deploy script, deployment JSON checked in, a `scripts/seed.ts` that re-creates the 12 curated coins in one command |
| Foundry needs 1.8 or later, `network = "monad"` [S11] | CI uses `foundry-rs/foundry-toolchain@v1`; local forge 1.8.3 is fine, update to 1.8.5 if `osaka` is rejected |

### Fixed stack proposal

| Layer | Choice | Exact version | Reason |
|---|---|---|---|
| Network | Monad testnet, chain id 10143 (mainnet 143 as redeploy target) | node v0.16.5 per docs | 0.3 s blocks, about 0.6 s finality, free MON; mainnet adds risk, not demo value |
| RPC | `https://testnet-rpc.monad.xyz` + `wss://testnet-rpc.monad.xyz`; fallback `https://rpc-testnet.monadinfra.com` | n/a | Official, supports WebSocket and `monadLogs`; 100-block `getLogs` window |
| Contracts toolchain | Foundry (forge, cast, anvil) | 1.8.3 installed (1.8.5 latest) | Monad support from 1.8.0 with `--network monad`; native fuzz and invariant tests |
| Solidity | solc 0.8.31, `evm_version = "osaka"` | 0.8.31 | Monad's own Hardhat page requirement; probe shows osaka opcodes live |
| Contract libs | OpenZeppelin Contracts, forge-std | 5.6.1, v1.17.0 | ERC20, ReentrancyGuard, Ownable2Step; pragma ^0.8.20 |
| Pool | Own constant-product per coin inside one `Arena`, plus `CoinToken` | n/a | Atomic O(1) merger, one engineer, small audit surface |
| Randomness (demo) | Future `blockhash(startBlock + 2)`, pair freeze, permissionless resolve | n/a | No hidden secret, no external dependency, works on testnet today |
| Randomness (production) | Pyth Entropy, one request per round | `@pythnetwork/entropy-sdk-solidity` 2.2.1; mainnet proxy `0xD458261E832415CFd3BAE5E416FdF3230ce6F134` | Verified on mainnet, fee 1.4 MON; testnet address unverified |
| Frontend framework | Next.js App Router, React | next 16.4.2, react and react-dom 19.3.1, typescript 5.9.3 | Playbook rule; wagmi needs TypeScript 5.9.3 or later |
| 3D | three, OrbitControls from `three/examples/jsm` | three 0.128.0 (pinned exactly) | Keeps r128 look; module OrbitControls fixes the global-script problem |
| Styling | Tailwind CSS v3, PostCSS, Autoprefixer | tailwindcss 3.4.19, postcss 8.5.31, autoprefixer 10.6.1 | CDN serves 3.4.17; v4 changes utilities the prototype uses |
| Fonts | `next/font/google`: Cinzel, Plus Jakarta Sans, JetBrains Mono | bundled with next 16.4.2 | Self-hosted, no layout shift |
| UI-scene bridge | zustand vanilla store + typed `EventTarget` emitter | zustand 5.0.15 | One state source for React panels and the imperative scene |
| Wallet | wagmi + viem + @tanstack/react-query, custom connect UI, burner wallet | wagmi 3.7.7, viem 2.57.7, @tanstack/react-query 5.104.4 | RainbowKit and ConnectKit do not support wagmi 3 |
| Backend runtime | Node, TypeScript, Hono + `@hono/node-server`, zod, pino | Node 26.2.0 local (engines `>=22.12`), hono 4.13.13, @hono/node-server 2.1.5, zod 4.6.7, pino 10.4.0 | Same language and viem as the frontend; `streamSSE` helper exists in hono |
| Keeper | viem service with `nonceManager`, explicit gas, `writeContractSync` | viem 2.57.7 | Sub-second sequencing on a 0.3 s chain |
| Indexer | In-process `monadLogs` WebSocket listener with in-memory model and SSE fan-out; Ponder as upgrade | ponder 0.18.2 (upgrade only) | Tiny event volume, zero database, commit-state aware |
| Hosting | Vercel (web), Railway (keeper + SSE) | n/a (Hobby plans) | SSE and WebSocket need a long-lived process; Vercel cap is 300 s |
| Package manager and repo | pnpm workspace: `contracts/`, `web/`, `server/`, `packages/shared` | pnpm 11.4.0 | Installed; shared ABI and monster id tables |
| Verification | Sourcify via MonadVision, `forge verify-contract --verifier sourcify --verifier-url https://sourcify-api-monad.blockvision.org/` | n/a | No API key needed |

## Implications per role

### smart-contracts

- Build `Arena`, `CoinToken`, `ClashMath` exactly as specified in D3 and keep the function and event signatures above stable; they are the contract with every other role. If a signature must change, change the shared ABI package in the same commit.
- Day-1 spikes, in order: (1) `forge build` with `solc 0.8.31` and `evm_version = "osaka"`; (2) deploy a 20-line contract on testnet that receives MON and pays out its whole balance, to settle the reserve-balance question for contracts (A1); (3) call `blockhash(block.number - 3)` from a deployed contract to confirm the permitted window; (4) measure gas of `launch`, `buy`, `sell`, `startClash`, `resolveClash` with `forge test --gas-report --network monad` and write the numbers into the keeper config.
- Tests: unit tests per function; fuzz tests on swap math and merger conservation; handler-driven invariant tests for I1 to I8 with handlers for launch, buy, sell, start and resolve clash, cancel, claim; fork test against testnet with `anvil --network monad --fork-url https://testnet-rpc.monad.xyz`.
- Keep storage compact (Monad pages storage in 128-slot groups) and never loop over holders in a state-changing function; merger gas must not scale with the number of holders.
- Deployment: script writes `deployments/10143.json` (addresses, deploy block, commit hash), keystore deploy only, then Sourcify verify.
- Production notes belong in the README of `contracts/`: the simplification table in D3.9 is the honest scope statement.

### frontend / 3D integration

- Follow D7 literally: pin `three@0.128.0`, wrap the namespace with OrbitControls in one line, keep the scene file nearly verbatim, mount from a `'use client'` leaf through `dynamic(..., { ssr: false })`, dispose both renderers on unmount.
- Entities come from the store. Rank and the leaderboard sort stay `reserveMon` descending then `wins` (the prototype's own comparator at proto:3692, with `lp` replaced). Pool vessels and floaters should be sized from the reserve numbers carried in `Swap` and `Merged`.
- Duels: remove the proximity trigger (proto:3505-3511). On `ClashStarted` walk the two named monsters toward each other and start the stall choreography; on Finalized `ClashResolved`/`Merged` play the decisive blow and absorb stream. Do not decide a winner locally. Use the `seed` for a deterministic fight script if you want reload-stable replays. See the D4.2 timeline for exactly which commit state triggers which visual.
- Data path: SSE from the server for arena state; wagmi/viem direct to RPC for the connected wallet's reads and for writes. If SSE drops, poll `getCoins()` once per second.
- Wallet: custom connect button, burner wallet with `/drip`, `writeContractSync` with explicit gas, one value-sending transaction per account per 4 blocks while balance is under 10 MON. Add `wallet_addEthereumChain` data from the locally defined chain, not from viem's stale testnet entry.
- Tailwind v3 with `content` globs including `src/scene/*.js`; fonts via `next/font/google`. Translate the Indonesian strings during the move (Track 01 lists them).
- Browser targets for the demo: a laptop with a discrete or integrated GPU; budget at most 30 coins, which is half of the prototype's default 60 (proto:2649) and far below its 500 stress test.

### indexer + keeper (backend)

- Build `server/` as one process with four modules: `chain` (viem clients, `fallback` transport, ABI), `watch` (raw `monadLogs` WebSocket, reconnect with backoff, `blockId`-keyed event store, backfill in 100-block pages), `keeper` (PvE, clash scheduling, resolver watchdog, nonce manager, gas table), `api` (Hono: `GET /stream` SSE, `GET /snapshot`, `POST /drip`, `GET /healthz`).
- Provisional versus final: every event is stored with `{blockNumber, blockId, logIndex, commitState}`; Proposed events are forwarded immediately flagged provisional; on `Voted`/`Finalized` send `commit` messages; when a different `blockId` finalizes at a height, emit `retract` for provisional events of the abandoned block. Reconnect must resubscribe and refresh the snapshot with `getCoins()` to close gaps.
- Keeper loop: wait for `Stage.Battle`; every 6 to 8 s pick free, off-cooldown, alive coins (random pairs, optionally biased toward coins with similar reserves so fights stay interesting), call `startClash`; for each `ClashStarted` schedule `resolveClash` at `startBlock + 3`; watchdog cancels expired clashes; periodic `runPvE` batch. One in-flight transaction per account, explicit gas, `nonceManager` reset on error, priority fee at or above 2 gwei.
- Secrets per D5: environment variables only, never logged, different keys for deployer, keeper and drip wallet; `.env.example` lists names only.
- Operations: structured logs (pino) with tx hashes and block ids, `/healthz` reporting last seen block and age, alert if no block for 5 s. Expected load is a handful of events per second; the 4-second unfiltered testnet stream (857 messages) shows why the filter by Arena address is mandatory.
- Upgrade path, not for the demo: Ponder 0.18.2 with the same ABI if persistence, historical queries or multi-instance serving are needed.

### product / demo / pitch

- What is real: a factory-less arena contract on Monad testnet with real MON-denominated pools, real swaps, an on-chain clash lifecycle and an atomic, verifiable merger. What is simplified: randomness, PvE trust, single admin, no audit (table D3.9). Say so on stage; the claim "outcomes are chain-decided and replayed by the 3D client" is true and verifiable on MonadVision.
- The pitch story fits the timing: a clash takes roughly 3 seconds from keeper decision to visible merger, and Monad's 0.3 s blocks and about 0.6 s finality are why the arena can feel real-time. A judge can click a `Merged` event and see the exact numbers: loser reserve, 70 percent auto-buy, 20 percent to holders, 10 percent to the prize pool.
- Demo script (3 minutes): spectate with no wallet; click "demo wallet" and receive 2 to 3 MON from the drip; launch a coin from the modal (it appears as a new monster within a second); buy another coin and watch its pool vessel rise; watch a clash with live odds and a merger; claim as a loser holder; if time allows, run a compressed arena of 8 to 12 coins so the Chosen One finale lands inside the slot (call `startBattle()` early).
- Decisions needed from product: the merger split (suggested 70/20/10), the cap (30 versus a smaller demo arena), whether pay-to-support weights (`sqrt(reserve)`) are acceptable to disclose as the game rule, and whether holder redistribution should be MON (recommended) or winner tokens.
- Risks to mention honestly: testnet resets (last on 2025-12-16), faucet limits unknown, public RPC limits, and the reserve-balance rule that can make rapid wallet transactions revert for accounts under 10 MON.

## Assumptions and open questions

Assumptions (uncited or only partially evidenced; each is something to verify before it matters):

- **A1.** Contract accounts are exempt from the 10 MON reserve rule. The docs define it per EOA and are silent on contracts. If wrong, `Arena` could not pay out its full balance and the pool design would need a floor. Verify with the Day-1 spike in the smart-contracts section.
- **A2.** `forge` 1.8.3 accepts `evm_version = "osaka"` and downloads solc 0.8.31. Foundry's public docs list `prague` as default and do not mention osaka. Verify at first build; fall back to `foundryup` (1.8.5 exists).
- **A3.** Pyth Entropy has no working testnet deployment at the address in Monad's docs (probe evidence above), but Pyth may have a different testnet address I could not read (its chainlist page renders client-side). If one is found and verified, Entropy could replace the blockhash seed on testnet.
- **A4.** `monadLogs` filtered by address and topics behaves like `logs` with the same filter syntax. I verified the unfiltered subscription and message shape, not the filtered variant.
- **A5.** The merger split 70/20/10, the 30-coin cap, the element-edge table and the `sqrt(reserve)` weight are my proposals mapped from PRD assumptions A3 and A7, not user decisions.
- **A6.** Three releases after r128 change colour management and light units, so an upgrade would alter the look. Based on Three's release history, not rendered here.
- **A7.** Tailwind v3.4.19 produces the same output as the CDN's 3.4.17 for the prototype's utilities. Not diffed; the class set was only grepped.
- **A8.** Railway services on the paid plans do not sleep. The pricing page is silent on sleeping and cold starts.
- **A9.** The Railway cost figure (about 2 USD per month for a small always-on Node service) is my arithmetic from the posted per-GB and per-vCPU rates.
- **A10.** Gas per `launch`, `swap`, `startClash`, `resolveClash` is not measured; no contract exists yet. Any number in a plan is a guess until `forge --gas-report`.
- **A11.** Node 26.2.0 locally versus the Node version Railway will use; set `engines.node >= 22.12` (Ponder's floor) and check the Railway build log.
- **A12.** Block time on the docs' page for JSON-RPC says 300 ms and MonadBFT says "minimum 300 ms"; viem says 400 ms. I measured 0.30 s on both networks today, but it may differ under load.

Open questions for the user or the PM:

1. **Q1.** Which competition and deadline? A required sponsor SDK (for example Pyth Entropy or a specific indexer) would change D4 and D6. Domain track owns this.
2. **Q2.** Is a testnet-only demo acceptable (PRD A2)? The whole plan assumes yes.
3. **Q3.** Confirm the arena-owned constant-product pool is acceptable instead of a real DEX pool per coin (PRD question 3). This research recommends yes and explains why a real DEX integration cannot deliver atomic merger.
4. **Q4.** Can the team obtain a private keyed RPC endpoint (QuickNode, Alchemy, Goldsky Edge or Ankr; the Monad RPC providers page lists them) for the keeper and server so they do not share the public rate limits? Keys must stay out of the repo.
5. **Q5.** What are the faucet's per-claim amount and cooldown? The page returned HTTP 429 to my fetch. The 12-coin seed (about 1 MON each plus 0.5 MON launch fee) plus the drip float is on the order of 30 to 60 MON; this should be confirmed against the faucet before the arena is seeded.
6. **Q6.** Should loser holders be paid in MON (recommended) or winner tokens?
7. **Q7.** Is a pay-to-support win probability acceptable to present to judges, or should odds depend only on level and element?

## Sources

All read on 2026-10-19.

Monad docs and GitHub
- [S1] https://docs.monad.xyz/developer-essentials/network-information (mainnet chain id, RPCs, rate limits, canonical contracts)
- [S2] https://docs.monad.xyz/developer-essentials/testnets (testnet RPCs, explorers, faucet, WMON, reset note)
- [S3] https://docs.monad.xyz/reference/json-rpc/overview.md (RPC differences, `eth_getLogs` limits, block tags, WebSocket subscriptions, error codes) and https://docs.monad.xyz/reference/json-rpc/api.md
- [S4] https://docs.monad.xyz/developer-essentials/differences.md (contract size, gas limit charged, no global mempool, storage pages, EIP-7702)
- [S5] https://docs.monad.xyz/developer-essentials/gas-pricing.md
- [S6] https://docs.monad.xyz/developer-essentials/opcode-pricing.md
- [S7] https://docs.monad.xyz/developer-essentials/reserve-balance.md
- [S8] https://docs.monad.xyz/monad-arch/consensus/block-states.md
- [S9] https://docs.monad.xyz/monad-arch/consensus/monad-bft.md (300 ms block, 1 slot speculative finality, 2 slots finality)
- [S10] https://docs.monad.xyz/monad-arch/realtime-data/spec-realtime.md and https://docs.monad.xyz/monad-arch/realtime-data/index.md
- [S11] https://docs.monad.xyz/tooling-and-infra/toolkits/foundry.md
- [S12] https://docs.monad.xyz/guides/deploy-smart-contract/foundry.md
- [S13] https://docs.monad.xyz/guides/verify-smart-contract/foundry.md
- [S14] https://docs.monad.xyz/tooling-and-infra/toolkits/hardhat.md
- [S15] https://docs.monad.xyz/llms.txt and https://docs.monad.xyz/ai/developers.md
- [S16] https://docs.monad.xyz/tooling-and-infra/oracles.md and https://docs.monad.xyz/tooling-and-infra/index.md
- [S17] https://docs.monad.xyz/tooling-and-infra/indexers/indexing-frameworks.md and https://docs.monad.xyz/tooling-and-infra/indexers.md
- [S18] https://docs.monad.xyz/tooling-and-infra/wallets/software-wallets.md, https://docs.monad.xyz/tooling-and-infra/wallets.md, https://docs.monad.xyz/tooling-and-infra/wallet-infra.md
- [S19] https://github.com/monad-crypto/protocols (raw files: `mainnet/pyth.jsonc`, `mainnet/nad_fun.jsonc`, `mainnet/uniswap.jsonc`, `mainnet/rug_rumble.jsonc`, `testnet/nad_fun.jsonc`, `testnet/uniswap_v4.jsonc`, plus the directory listings of `mainnet/` and `testnet/` via the GitHub contents API)
- [S31] GitHub API repo listings for orgs `monad-crypto`, `monad-developers`, `category-labs` (e.g. `monad-developers/foundry-monad`, `monad-developers/monad-mcp`, `monad-developers/send-transaction-sync-example`, `monad-crypto/paged-solady`)

Randomness and oracles
- [S20] https://docs.pyth.network/llms-entropy.txt, https://docs.pyth.network/entropy/chainlist (default providers; tables not rendered to my fetch), https://docs.pyth.network/entropy/protocol-design.mdx, https://docs.pyth.network/entropy/fees.mdx, https://docs.pyth.network/entropy/request-callback-variants (via search), `@pythnetwork/entropy-sdk-solidity@2.2.1` sources at https://unpkg.com/@pythnetwork/entropy-sdk-solidity@2.2.1/IEntropyV2.sol and `IEntropyConsumer.sol`
- [S21] https://docs.chain.link/vrf/v2-5/supported-networks (no Monad entry)

Frontend and tooling docs
- [S22] https://viem.sh/docs/actions/wallet/sendTransactionSync and viem 2.57.7 sources at https://unpkg.com/viem@2.57.7/ (`utils/nonceManager.ts`, `actions/public/watchEvent.ts`, `actions/public/watchContractEvent.ts`, `actions/wallet/writeContractSync.ts`, `chains/definitions/monad.ts`, `chains/definitions/monadTestnet.ts`)
- [S23] https://wagmi.sh/react/guides/migrate-from-v2-to-v3 and https://wagmi.sh/react/getting-started
- [S24] https://nextjs.org/docs/app/guides/lazy-loading, https://nextjs.org/docs/app/getting-started/fonts, https://nextjs.org/docs/app/guides/tailwind-v3-css
- [S25] https://ponder.sh/docs/api-reference/ponder/config and https://ponder.sh/docs/query/sql-over-http
- [S26] https://envio.dev/pricing
- [S27] https://docs.railway.com/pricing/plans and https://vercel.com/docs/plans/hobby
- [S28] https://www.getfoundry.sh/config/compiler
- [S29] Monad tooling index (see S16) for the absence of a keeper or automation category

Probes (own, read-only, 2026-10-19; scratch scripts under the session scratchpad, no repo files touched)
- [P1] `eth_chainId`, `eth_getBlockByNumber` (latest, safe, finalized), `eth_gasPrice`, `eth_maxPriorityFeePerGas`, `web3_clientVersion` against `https://testnet-rpc.monad.xyz` and `https://rpc.monad.xyz`; block time from the timestamps of blocks spaced 50 apart over 1000 blocks (testnet 303 s, mainnet 302 s); `eth_chainId` on rpc1, rpc3, rpc-mainnet.monadinfra.com, rpc-testnet.monadinfra.com and rpc.ankr.com/monad_testnet.
- [P2] `eth_getLogs` with a 4,096-block range on testnet-rpc.monad.xyz returned error -32614 "eth_getLogs is limited to a 100 range"; a 100-block range returned a result.
- [P3] Node 26 WebSocket client subscribed to `monadNewHeads` on `wss://testnet-rpc.monad.xyz` for 5 s (commit-state timings in F1) and to `monadLogs` with an empty filter for 4 s (857 messages, fields `blockId`, `commitState`, `removed`, and so on).
- [P4] `eth_call` with a state override placing hand-written bytecode at a dummy address: `BLOCKHASH(number-1)` returns a hash, `BLOCKHASH(number-300)` returns zero, `PREVRANDAO` returns a value, `TSTORE/TLOAD` works, `MCOPY` works, `CLZ` returns 255 for input 1 on both testnet and mainnet.
- [P5] `cast call` and `cast storage` against the Entropy addresses: mainnet `0xD458...F134` (`getDefaultProvider`, `getFeeV2()`, `version()`, ERC-1967 implementation slot), testnet `0x3682...e320` (`version()` = "0.1.1", V2 getters revert, `cast codesize` 8,061).
- [P6] `cast call getPriceUnsafe` on Pyth PriceFeed `0x2880aB155794e7179c9eE2e38200202908C17B43` on mainnet for the MON/USD feed id from `mainnet/pyth.jsonc` (price 2000079, exponent -8).
- [P7] `eth_sendRawTransactionSync` with a garbage payload on testnet returned a transaction-validation error, while an unknown method returned -32601.
- [P8] `forge --version`, `cast --version`, `forge test --help` (shows `--network` values `ethereum, optimism, tempo, monad` and `--hardfork`), `forge build --help` (`--evm-version`), GitHub releases API for foundry-rs/foundry (v1.8.5, 2026-10-05) and forge-std (v1.17.0).
- [P9] Prototype greps and reads (line numbers cited inline): `monster_arena_3d_prototype (1).html` lines 1-12, 545, 567-760, 2644-2850, 3098-3150, 3359-3420, 3500-3515, 3691-3760, 4077-4130, plus counts of `document.getElementById` (58), Tailwind utility uses, and Three API uses; viem chain definitions via unpkg (see S22).
- [P10] `npm view` for next, react, react-dom, tailwindcss, @tailwindcss/postcss, wagmi, viem, @wagmi/core, @wagmi/connectors, @tanstack/react-query, three, @types/three, typescript, vite, @vitejs/plugin-react, zustand, ponder, hono, @hono/node-server, zod, pino, @openzeppelin/contracts, @pythnetwork/entropy-sdk-solidity, hardhat, solc, postcss, autoprefixer, @privy-io/react-auth, @privy-io/wagmi, @reown/appkit-adapter-wagmi, connectkit, @rainbow-me/rainbowkit (including `peerDependencies` where cited), run 2026-10-19; plus `node -v` (v26.2.0), `pnpm -v` (11.4.0), `bun -v` (1.3.14).
- [P11] `ponder@0.18.2` metadata from unpkg: `engines.node >=22.12`, peers `hono >=4.5`, `typescript >=5.4.0`, `viem >=2.35`.
- [P12] `three@0.128.0` package metadata (`main`, `module`, no `exports`) and HTTP 200 for `examples/jsm/controls/OrbitControls.js` and `build/three.module.js`; head of `examples/js/controls/OrbitControls.js` (an IIFE that attaches to `THREE`).
- [P13] `curl -I https://cdn.tailwindcss.com` returned `302` with `location: /3.4.17`.
- [P14] Peer dependency and export metadata from unpkg for wagmi 3.7.7, @wagmi/core 3.6.5, @rainbow-me/rainbowkit 2.2.11, connectkit 1.9.2, @privy-io/wagmi 4.0.19, @reown/appkit-adapter-wagmi 1.8.24.
