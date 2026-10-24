set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
RPC=http://127.0.0.1:8545
WORK=${WORK:-$(mktemp -d)}
cp "$ROOT/shared/house-coins.json" "$WORK/house-coins.json"
cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
  cp "$WORK/house-coins.json" "$ROOT/shared/house-coins.json"
}
trap cleanup EXIT

anvil --network monad --port 8545 --accounts 40 --block-time 1 --slots-in-an-epoch 1 > "$WORK/anvil.log" 2>&1 &
until cast block-number --rpc-url "$RPC" > /dev/null 2>&1; do sleep 0.3; done
MULTICALL3=0xcA11bde05977b3631167028862bE2a173976CA11
cast rpc anvil_setCode "$MULTICALL3" "$(cast code "$MULTICALL3" --rpc-url https://testnet-rpc.monad.xyz)" --rpc-url "$RPC" > /dev/null
devkey() { sed -n "s/^($1) \(0x[0-9a-f]\{64\}\)$/\1/p" "$WORK/anvil.log" | head -1; }

(cd "$ROOT/contracts" && forge script script/DeployLocal.s.sol --rpc-url "$RPC" --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 > "$WORK/deploy.log" 2>&1)

ARENA=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["arena"])' "$ROOT/deployments/31337.json")
cast send "$ARENA" "fundTreasury(uint64)" 1 --value "${EXTRA_TREASURY:-0}" --from 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 --unlocked --rpc-url "$RPC" > /dev/null
export RPC_HTTP_URL="$RPC" RPC_WS_URL=ws://127.0.0.1:8545 PORT=8787 DEMO_FAST=1 ALLOWED_ORIGIN='*'
export KEEPER_PRIVATE_KEY=$(devkey 1) DRIP_PRIVATE_KEY=$(devkey 2) SEEDER_PRIVATE_KEY=$(devkey 3)
export OWNER_PRIVATE_KEY=$(devkey 0) DEMO_ADMIN_TOKEN=${DEMO_ADMIN_TOKEN:-dev-demo-token}

cd "$ROOT"
pnpm --filter keeper seed-house > "$WORK/seed-house.log" 2>&1
pnpm --filter keeper deliver-mock-seed > "$WORK/seed.log" 2>&1 &
pnpm --filter keeper start > "$WORK/keeper.log" 2>&1 &

export VITE_CHAIN_ID=31337 VITE_RPC_HTTP_URL="$RPC" VITE_RPC_WS_URL=ws://127.0.0.1:8545 VITE_ARENA_ADDRESS="$ARENA" VITE_ROUND_ID=1 VITE_KEEPER_URL=http://127.0.0.1:8787
echo "arena $ARENA  logs $WORK"
pnpm --filter web dev --host 127.0.0.1 --port 5173
