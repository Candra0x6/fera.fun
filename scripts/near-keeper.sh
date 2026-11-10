#!/usr/bin/env bash
set -euo pipefail
dir="${ANIMAL_NEAR_DIR:-$HOME/.config/animal-near}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
field() {
  node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(j[process.argv[2]])' "$1" "$2"
}
export KEEPER_PRIVATE_KEY="$(field "$dir/fera-keeper.testnet.json" private_key)"
export SEEDER_PRIVATE_KEY="$(field "$dir/fera-seeder.testnet.json" private_key)"
export DRIP_PRIVATE_KEY="$(field "$dir/fera-drip.testnet.json" private_key)"
if [ ! -f "$dir/house-seed" ]; then
  umask 077
  node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))' > "$dir/house-seed"
fi
chmod 600 "$dir/house-seed"
export HOUSE_SEED="$(cat "$dir/house-seed")"
if [ ! -f "$dir/demo-admin-token" ]; then
  umask 077
  node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))' > "$dir/demo-admin-token"
fi
chmod 600 "$dir/demo-admin-token"
export DEMO_ADMIN_TOKEN="$(cat "$dir/demo-admin-token")"
cd "$root/keeper"
exec ./node_modules/.bin/tsx src/main.ts
