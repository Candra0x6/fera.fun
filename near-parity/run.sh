#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
tsx="$repo/shared/node_modules/.bin/tsx"
lock="$HOME/.cache/animal-build.lock"
export FOUNDRY_OUT="$HOME/.cache/animal-parity-forge/out"
export FOUNDRY_CACHE_PATH="$HOME/.cache/animal-parity-forge/cache"
mkdir -p "$here/forge/work" "$FOUNDRY_OUT" "$FOUNDRY_CACHE_PATH"

curve() {
  "$tsx" "$here/gen/curve.ts" inputs
  (cd "$here/forge" && flock "$lock" forge script script/GenCurve.s.sol --silent)
  "$tsx" "$here/gen/curve.ts" merge
}

combat() {
  "$tsx" "$here/gen/combat.ts" inputs
  (cd "$here/forge" && flock "$lock" forge script script/GenCombat.s.sol --silent)
  "$tsx" "$here/gen/combat.ts" merge
}

case "${1:-all}" in
  curve) curve ;;
  combat) combat ;;
  all) curve; combat ;;
  *) echo "usage: run.sh curve|combat|all" >&2; exit 2 ;;
esac
