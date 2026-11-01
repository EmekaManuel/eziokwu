#!/usr/bin/env bash
# Dev-network helper: acts as a requester (posts a test bounty) or as the verifier (resolves a submission).
# Keys come from a local file outside the repo and are never printed. Every command except `status` SENDS a
# transaction on Celo mainnet (dev G$ / dev Identity contracts) and spends a little CELO.
#
#   scripts/dev-requester.sh create [reward_gd] [bond_gd]     post a 1-hour, 1-answer bounty
#   scripts/dev-requester.sh status <bountyId> [worker]       read-only
#   scripts/dev-requester.sh resolve <bountyId> <worker> accept|reject   (verifier key)
set -euo pipefail

KEYS="${EZIOKWU_KEYS:-$HOME/.eziokwu-dev-keys.json}"
RPC="${CELO_RPC_URL:-https://forno.celo.org}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BOARD="${BOUNTY_BOARD:-$(grep -E '^BOUNTY_BOARD=' "$ROOT/api/.env.local" | cut -d= -f2)}"
GD=0xFa51eFDc0910CCdA91732e6806912Fa12e2FD475 # dev G$; this script refuses to run against anything else
key() { jq -r ".$1.privateKey" "$KEYS"; }

case "${1:-}" in
  create)
    REWARD="${2:-10}"; BOND="${3:-0}"
    K=$(key requester)
    TOTAL=$(cast to-wei "$REWARD")
    echo "Approving $REWARD G\$ for the board…"
    REQ=$(jq -r .requester.address "$KEYS")
    allowance() { cast call "$GD" "allowance(address,address)(uint256)" "$REQ" "$BOARD" --rpc-url "$RPC" | awk '{print $1}'; }
    # Amounts are 18-decimal and overflow shell integers, so compare with bc.
    ge() { [ "$(echo "$1 >= $2" | bc)" = 1 ]; }
    if ! ge "$(allowance)" "$TOTAL"; then
      cast send "$GD" "approve(address,uint256)" "$BOARD" "$TOTAL" --private-key "$K" --rpc-url "$RPC" >/dev/null
    fi
    # The RPC is load-balanced; wait until the approval is visible before the next call, or gas estimation reverts.
    for _ in $(seq 1 20); do ge "$(allowance)" "$TOTAL" && break; sleep 1; done
    DEADLINE=$(( $(date +%s) + 3600 ))
    SPEC=$(cast keccak "eziokwu-dev-test-bounty-$(date +%s)")
    echo "Creating bounty (reward $REWARD G\$, bond $BOND G\$, closes in 1 hour)…"
    cast send "$BOARD" "createBounty(uint256,uint8,uint256,uint8,uint64,bytes32)" \
      "$TOTAL" 1 "$(cast to-wei "$BOND")" 0 "$DEADLINE" "$SPEC" --private-key "$K" --rpc-url "$RPC" >/dev/null
    NEXT=$(cast call "$BOARD" "nextBountyId()(uint256)" --rpc-url "$RPC" | awk '{print $1}')
    echo "Done. Task number: $((NEXT - 1))"
    ;;
  status)
    ID="${2:?bountyId}"
    echo "bounty: $(cast call "$BOARD" 'bounties(uint256)' "$ID" --rpc-url "$RPC" | cut -c1-200)"
    if [ -n "${3:-}" ]; then
      echo "claim state (0 none,1 claimed,2 submitted,3 accepted,4 rejected,5 expired): $(cast call "$BOARD" 'claims(uint256,address)(uint8,address,uint64,uint64,bytes32)' "$ID" "$3" --rpc-url "$RPC" | head -1)"
      echo "worker dev G\$: $(cast call "$GD" 'balanceOf(address)(uint256)' "$3" --rpc-url "$RPC" | awk '{print $1}' | xargs cast from-wei)"
    fi
    ;;
  resolve)
    ID="${2:?bountyId}"; WORKER="${3:?worker address}"; V="${4:?accept|reject}"
    [ "$V" = accept ] && FLAG=true || FLAG=false
    cast send "$BOARD" "resolve(uint256,address,bool)" "$ID" "$WORKER" "$FLAG" --private-key "$(key verifier)" --rpc-url "$RPC" >/dev/null
    echo "Resolved bounty $ID for $WORKER: $V"
    ;;
  *) sed -n '2,9p' "$0"; exit 1 ;;
esac
