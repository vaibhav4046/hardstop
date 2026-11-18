#!/usr/bin/env bash
# Proves the README's claim that the agent's `Pay` handler cannot change the
# rules: in a copy of the project, edit `Pay` to write to `active`, `queued` or
# `approved_from`, and require the compiler to refuse each edit. A control edit
# that writes to `ledger` (which `Pay` declares `mut`) must still compile, so a
# refusal cannot come from a broken edit.
set -euo pipefail

FE=${FE:-fe}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

# Insert one line into the body of `Pay`, right after its `let now = ...`.
build_with() {
  local line=$1 dir
  dir=$(mktemp -d)
  cp -r "$ROOT/fe" "$dir/"
  rm -rf "$dir/fe/out"
  awk -v add="            $line" '
    /Pay \{ to, amount, nonce \} -> u8 uses/ { inpay = 1 }
    { print }
    inpay && /let now = seconds\(ctx.timestamp\(\)\)/ { print add; inpay = 0; done = 1 }
    END { if (!done) exit 3 }
  ' "$ROOT/fe/src/vault.fe" > "$dir/fe/src/vault.fe" || { echo "could not find the body of Pay in vault.fe"; exit 2; }
  (cd "$dir/fe" && "$FE" build > "$dir/build.log" 2>&1)
  local status=$?
  LOG=$(cat "$dir/build.log")
  rm -rf "$dir"
  return $status
}

if ! build_with 'ledger = ledger'; then
  echo "control failed: writing to ledger inside Pay should compile"
  echo "$LOG"
  exit 1
fi
echo "ok   control: Pay may write its own ledger"

for line in 'active = active' 'queued = queued' 'approved_from.set(key: to, value: now)'; do
  if build_with "$line"; then
    echo "FAIL Pay compiled with: $line"
    exit 1
  fi
  # 8-0018 "left-hand side of assignment is immutable" for a field,
  # 8-0066 "does not provide mutable access" for a map.
  if ! grep -qE 'is immutable|does not provide mutable access' <<<"$LOG"; then
    echo "FAIL Pay was refused for another reason with: $line"
    echo "$LOG"
    exit 1
  fi
  echo "ok   refused: $line"
done
