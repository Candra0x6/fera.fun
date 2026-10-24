#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
forge build >/dev/null
mkdir -p abi
for name in Arena MonsterCoin ISeedSource; do
  forge inspect "$name" abi --json | jq . > "abi/$name.json"
  echo "abi/$name.json: $(jq length "abi/$name.json") entries"
done
