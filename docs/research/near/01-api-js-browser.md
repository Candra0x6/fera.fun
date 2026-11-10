# RT-1 - near-api-js 7.4.0 in a Vite 8 browser bundle (role C, 2026-11-10)

Result: PASS. No fallback to `@near-js/*` needed.

## What was proven (headless Chromium 1254, separate profile, probe bundled with Vite 8.3.4)

- `KeyPair.fromRandom('ed25519')`, `toString()` and `KeyPairSigner.fromSecretKey()` round-trip in the browser; restored public key equals the original.
- `FailoverRpcProvider` over two `JsonRpcProvider` URLs (`test.rpc.fastnear.com`, `rpc.testnet.fastnear.com`) answers `Account.getState()`.
- `POST https://helper.nearprotocol.com/account` from the browser origin works (CORS ok, HTTP 200) and creates a 10 NEAR account for the random key.
- `Account(accountId, provider, KeyPairSigner)` signs locally and `callFunction` / `callFunctionRaw` with `waitUntil: 'EXECUTED_OPTIMISTIC'` returns `final_execution_status: EXECUTED_OPTIMISTIC` with a parsed result. No popup, no wallet request.

## Bundle

- Probe bundle: 199 kB raw, 62 kB gzip (near-api-js plus its crypto deps, tree-shaken to `Account`, providers, `KeyPair`).
- Vite warns once: module `util` externalized by `generate-function` (pulled by `is-my-json-valid`); it is lazy and never executed on the paths above.

## Findings

- The helper rate-limits: a second account creation a few minutes later returned HTTP 429 (other roles had already used the IP budget). `/drip` must keep its transfer fallback.
- One `callFunctionRaw` with `EXECUTED_OPTIMISTIC` took about 4.5 s end to end on a cold key (access key and block lookups included). Per-call latency of `INCLUDED` versus `EXECUTED_OPTIMISTIC` is not yet split; measure in the real flow.
- `Account` keeps its own nonce manager: one transaction in flight per account stays the rule.
