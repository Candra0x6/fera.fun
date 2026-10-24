set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
RPC=http://127.0.0.1:8545
WORK=$(mktemp -d)
cp "$ROOT/shared/house-coins.json" "$WORK/house-coins.json"
cleanup() {
  jobs -p | xargs -r kill 2>/dev/null || true
  cp "$WORK/house-coins.json" "$ROOT/shared/house-coins.json"
}
trap cleanup EXIT

anvil --network monad --port 8545 --accounts 40 --block-time 1 > "$WORK/anvil.log" 2>&1 &
until cast block-number --rpc-url "$RPC" > /dev/null 2>&1; do sleep 0.3; done
MULTICALL3=0xcA11bde05977b3631167028862bE2a173976CA11
cast rpc anvil_setCode "$MULTICALL3" "$(cast code "$MULTICALL3" --rpc-url https://testnet-rpc.monad.xyz)" --rpc-url "$RPC" > /dev/null
devkey() { sed -n "s/^($1) \(0x[0-9a-f]\{64\}\)$/\1/p" "$WORK/anvil.log" | head -1; }

(cd "$ROOT/contracts" && forge script script/DeployLocal.s.sol --rpc-url "$RPC" --broadcast --unlocked --sender 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 > "$WORK/deploy.log" 2>&1)

export RPC_HTTP_URL="$RPC" RPC_WS_URL=ws://127.0.0.1:8545 PORT=8787 DEMO_FAST=1
export KEEPER_PRIVATE_KEY=$(devkey 1) DRIP_PRIVATE_KEY=$(devkey 2) SEEDER_PRIVATE_KEY=$(devkey 3)

cd "$ROOT"
pnpm --filter keeper seed-house
pnpm --filter keeper deliver-mock-seed > "$WORK/seed.log" 2>&1 &
pnpm --filter keeper start > "$WORK/keeper.log" 2>&1 &

WAIT=${REHEARSAL_TIMEOUT_SECONDS:-420}
for _ in $(seq 1 "$WAIT"); do
  BODY=$(curl -s localhost:8787/healthz || true)
  echo "$BODY"
  case "$BODY" in
    *'"phase":"Knockout"'*|*'"epoch":2'*) break ;;
  esac
  sleep 1
done
grep -E "epoch resolved|alert" "$WORK/keeper.log" || true
echo "logs in $WORK"
