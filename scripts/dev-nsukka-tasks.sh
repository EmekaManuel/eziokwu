#!/usr/bin/env bash
# Dev: posts three 24-hour test tasks around a point in Nsukka (3 task descriptions + 3 on-chain bounties).
# SENDS ~6 transactions on Celo from the requester wallet (about 0.4 CELO in gas, 30 dev G$ locked).
# Needs DATABASE_URL (the database your bot and Mini App API use) in the environment.
#   DATABASE_URL=... scripts/dev-nsukka-tasks.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
: "${DATABASE_URL:?set DATABASE_URL to the database your bot uses}"
KEYS="${EZIOKWU_KEYS:-$HOME/.eziokwu-dev-keys.json}"
RPC="${CELO_RPC_URL:-https://forno.celo.org}"
REQ=$(jq -r .requester.address "$KEYS")

# Fail before sending anything if the whole run can't finish (3 x ~0.12 CELO plus the safety margin).
HAVE=$(cast balance "$REQ" --ether --rpc-url "$RPC")
if [ "$(echo "$HAVE < 0.6" | bc)" = 1 ]; then
  echo "Requester $REQ has $HAVE CELO; this run needs about 0.6. Send it more CELO on Celo first." >&2
  exit 1
fi

task() { # title item unit lat lng
  local hash
  hash=$(cd "$ROOT/api" && pnpm exec tsx scripts/task.ts create --title "$1" --item "$2" --unit "$3" --city Nsukka --lat "$4" --lng "$5")
  DURATION=86400 SPEC_HASH="$hash" "$ROOT/scripts/dev-requester.sh" create 10 0
}

# Spread a few hundred metres around 6.8574, 7.4110 so each task is a different spot.
task "Rice price" "Rice, 50 kg bag" bag 6.8590 7.4125
task "Garri price" "Garri (white), 1 derica cup" cup 6.8555 7.4095
task "Eggs price" "Eggs, 1 crate (30)" crate 6.8580 7.4075
