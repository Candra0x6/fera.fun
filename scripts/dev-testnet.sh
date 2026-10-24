set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
set -a; . "$ROOT/.env.local"; set +a
ARENA=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["arena"])' "$ROOT/deployments/10143.json")
BLOCK=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["deployBlock"])' "$ROOT/deployments/10143.json")
export RPC_HTTP_URL=https://testnet-rpc.monad.xyz RPC_WS_URL=wss://testnet-rpc.monad.xyz ARENA_ADDRESS="$ARENA" DEPLOY_BLOCK="$BLOCK" PORT=8787 ALLOWED_ORIGIN=http://127.0.0.1:5173 HOUSE_GAS_BUFFER=0.1 HOUSE_FLAT_SEED=1 DRIP_AMOUNT_MON=${DRIP_AMOUNT_MON:-0.2}
trap 'jobs -p | xargs -r kill 2>/dev/null || true' EXIT
cd "$ROOT"
pnpm --filter keeper start &
export VITE_DEMO_TOKEN="$DEMO_ADMIN_TOKEN" VITE_CHAIN_ID=10143 VITE_RPC_HTTP_URL="$RPC_HTTP_URL" VITE_RPC_WS_URL="$RPC_WS_URL" VITE_ARENA_ADDRESS="$ARENA" VITE_DEPLOY_BLOCK="$BLOCK" VITE_KEEPER_URL=http://127.0.0.1:8787
pnpm --filter web dev --host 127.0.0.1 --port 5173
