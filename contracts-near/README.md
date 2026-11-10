# contracts-near

Rust (near-sdk 5.30.1) port of the Arena. Math lives in `src/engine*` and is bit-exact with the Solidity libraries.

Tests (`cargo test`): `vectors` (curve.json, combat.json), `replay` (258 steps of scenario.json against the Solidity Arena), `scenario` (error codes, failed payout, aborts, event names, ring), `invariants` (1000 random scripts).

Sandbox tests (`tests/sandbox.rs`) were not written; they are replaced by the native tests above and by a round driven through the `near` CLI on testnet, with gas measured in `deployments/near-testnet.json`.
