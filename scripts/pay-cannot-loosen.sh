#!/usr/bin/env bash
# Proves two README claims by editing a copy of `vault.fe` and requiring the
# compiler to refuse each edit.
#
# 1. The agent's `Pay` handler cannot change the rules: an edit that writes to
#    `active`, `queued` or `approved_from` inside `Pay` must fail. A control
#    edit that writes to `ledger` (which `Pay` declares `mut`) must still
#    compile, so a refusal cannot come from a broken edit.
# 2. No owner handler can change the rules or withdraw without checking its
#    caller: deleting the `only(...)` line from `Propose`, `CancelQueued`,
#    `Pause`, `SetRecipient` or `Withdraw` must fail, because the handler then
#    has no `OwnerProof` to hand to the kernel (or to `pay_owner`). Nor can
#    it write its own: `OwnerProof { granted: true }` in place of the check
#    must fail too, because the field is private to the kernel.
set -euo pipefail

FE=${FE:-fe}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

# Build a copy of the project whose vault.fe is the given file.
build_vault() {
  local src=$1 dir
  dir=$(mktemp -d)
  cp -r "$ROOT/fe" "$dir/"
  rm -rf "$dir/fe/out"
  cp "$src" "$dir/fe/src/vault.fe"
  (cd "$dir/fe" && "$FE" build > "$dir/build.log" 2>&1)
  local status=$?
  LOG=$(cat "$dir/build.log")
  rm -rf "$dir"
  return $status
}

# Insert one line into the body of `Pay`, right after its `let now = ...`.
build_with() {
  local line=$1 edited
  edited=$(mktemp)
  awk -v add="            $line" '
    /Pay \{ to, amount, nonce \} -> u8 uses/ { inpay = 1 }
    { print }
    inpay && /let now = seconds\(ctx.timestamp\(\)\)/ { print add; inpay = 0; done = 1 }
    END { if (!done) exit 3 }
  ' "$ROOT/fe/src/vault.fe" > "$edited" || { echo "could not find the body of Pay in vault.fe"; exit 2; }
  local status=0
  build_vault "$edited" || status=$?
  rm -f "$edited"
  return $status
}

# Delete the `only(...)` line from the handler whose header starts with $1,
# or put $2 in its place.
build_without_check() {
  local handler=$1 instead=${2:-} edited
  edited=$(mktemp)
  awk -v head="$handler" -v instead="$instead" '
    index($0, "        " head) == 1 { inh = 1 }
    inh && /only\(owner, caller: ctx.caller\(\)\)/ {
      if (instead != "") print "            " instead
      inh = 0; done = 1; next
    }
    { print }
    END { if (!done) exit 3 }
  ' "$ROOT/fe/src/vault.fe" > "$edited" || { echo "could not find the owner check in $handler"; exit 2; }
  local status=0
  build_vault "$edited" || status=$?
  rm -f "$edited"
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

for handler in 'Propose {' 'CancelQueued uses' 'Pause uses' 'SetRecipient {' 'Withdraw {'; do
  name=${handler%% *}
  if build_without_check "$handler"; then
    echo "FAIL $name compiled without its owner check"
    exit 1
  fi
  # 8-0012 "undefined variable `proof`", and nothing else: the handler has no
  # proof to pass on.
  if ! grep -q 'undefined variable `proof`' <<<"$LOG" \
    || grep -E '^error\[' <<<"$LOG" | grep -qv 'error\[8-0012\]: undefined variable'; then
    echo "FAIL $name was refused for another reason without its owner check"
    echo "$LOG"
    exit 1
  fi
  echo "ok   refused: $name without its owner check"
done

if build_without_check 'Propose {' 'let proof = OwnerProof { granted: true }'; then
  echo "FAIL Propose compiled with a hand-made OwnerProof"
  exit 1
fi
if ! grep -q '`granted` is not visible' <<<"$LOG"; then
  echo "FAIL a hand-made OwnerProof was refused for another reason"
  echo "$LOG"
  exit 1
fi
echo "ok   refused: Propose with a hand-made OwnerProof"
