#!/usr/bin/env bash
# Proves README claims by editing a copy of `vault.fe` and requiring the
# compiler to refuse each edit, plus one source check the compiler cannot do.
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
# 3. A proof is spent by its first use: using one twice must fail with a
#    move error, and making one and dropping it must fail (`#[must_use]`).
# 4. A source check, NOT a compiler guarantee: `authorize` is public, so
#    `authorize(owner: ctx.caller(), caller: ctx.caller()).unwrap()` in a
#    handler compiles and proves anyone is the owner. `check_proofs` reads
#    vault.fe and requires that `authorize` is called exactly once, inside
#    `fn only`, and that every `only(...)` call is in a handler and passes
#    the stored `owner` and `ctx.caller()`, with neither name rebound. It is
#    a text check of one file: it does not see a helper in another module
#    that hands out proofs. The script also shows that the forgeries it
#    rejects do compile, so this check is the only thing catching them.
# 5. The verdict codes stay distinct: see the end of this script.
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

# Print vault.fe with one line of the handler whose header starts with $1
# edited: the first line containing $2 is replaced by $4 (deleted if $4 is
# empty) when $3 is "replace", or gets $4 after or before it when $3 is
# "after" or "before".
edit_handler() {
  local handler=$1 target=$2 mode=$3 text=${4:-}
  awk -v head="$handler" -v target="$target" -v mode="$mode" -v text="$text" '
    index($0, "        " head) == 1 { inh = 1 }
    inh && index($0, target) {
      if (mode == "after") print
      if (text != "") print "            " text
      if (mode == "before") print
      inh = 0; done = 1; next
    }
    { print }
    END { if (!done) exit 3 }
  ' "$ROOT/fe/src/vault.fe" || { echo "could not find '$target' in $handler" >&2; exit 2; }
}

# Build vault.fe edited as by `edit_handler`.
build_edited() {
  local edited status=0
  edited=$(mktemp)
  edit_handler "$@" > "$edited"
  build_vault "$edited" || status=$?
  rm -f "$edited"
  return $status
}

ONLY_LINE='let proof = only(owner, caller: ctx.caller())'

# Delete the `only(...)` line from the handler whose header starts with $1,
# or put $2 in its place.
build_without_check() {
  build_edited "$1" "$ONLY_LINE" replace "${2:-}"
}

# The source check described in point 4 above. Prints why and fails if the
# given vault.fe breaks the rule. Comments are stripped first.
check_proofs() {
  awk '
    function bad(why) { print "line " NR ": " why ": " $0; failed = 1 }
    function word(w, s) { return s ~ ("(^|[^A-Za-z0-9_])" w "([^A-Za-z0-9_]|$)") }
    {
      code = $0
      sub(/\/\/.*/, "", code)
      sub(/[ \t]+$/, "", code)
    }
    code == "    recv VaultMsg {" { inrecv = 1 }
    inrecv && code == "    }" { inrecv = 0 }
    code ~ /^fn only[^A-Za-z0-9_]/ {
      onlydefs++
      if (code != "fn only(_ allowed: Address, caller: Address) -> OwnerProof {")
        bad("`fn only` has a different signature")
      inonly = 1
    }
    inonly && code == "}" { inonly = 0 }
    word("authorize", code) {
      if (code == "    authorize,") imports++
      else if (inonly && code == "    match authorize(owner: allowed, caller) {") calls++
      else bad("`authorize` used outside `only`, or with other arguments")
    }
    code ~ /(^|[^A-Za-z0-9_])only[ \t]*[(<]/ && code !~ /^fn only/ {
      if (!inrecv || code != "            let proof = only(owner, caller: ctx.caller())")
        bad("`only` called outside a handler, or with other arguments")
      else onlycalls++
    }
    # `owner` and `ctx` must mean the stored owner and the real context.
    code ~ /(^|[^A-Za-z0-9_])(let|var)[ \t]/ {
      lhs = code
      sub(/=.*/, "", lhs)
      if (word("owner", lhs) || word("ctx", lhs)) bad("`owner` or `ctx` rebound")
    }
    code ~ /=>/ {
      lhs = code
      sub(/=>.*/, "", lhs)
      if (word("owner", lhs) || word("ctx", lhs)) bad("`owner` or `ctx` bound by a pattern")
    }
    inrecv && code ~ /^        [A-Z][A-Za-z]* *[{]/ {
      lhs = code
      sub(/(uses|->).*/, "", lhs)
      if (word("owner", lhs) || word("ctx", lhs)) bad("a message field named `owner` or `ctx`")
    }
    code ~ /(^|[^A-Za-z0-9_])with[ \t]*[(]/ { bad("`with` could swap the context `ctx.caller()` reads") }
    END {
      if (onlydefs != 1) { print "expected exactly one `fn only`, found " onlydefs + 0; failed = 1 }
      if (imports != 1 || calls != 1) {
        print "expected `authorize` imported once and called once in `only`, found " \
          imports + 0 " import(s) and " calls + 0 " call(s)"
        failed = 1
      }
      if (onlycalls < 1) { print "no handler calls `only`"; failed = 1 }
      exit failed
    }
  ' "$1"
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

# 3. Proofs are spent on use and cannot be dropped.
PAY_OWNER='pay_owner(proof, token, owner, amount)'
if build_edited 'Withdraw {' "$PAY_OWNER" after "$PAY_OWNER"; then
  echo "FAIL Withdraw compiled using one proof twice"
  exit 1
fi
# 16-0002 "cannot use a value after it was moved", and nothing else.
if ! grep -q 'cannot use a value after it was moved' <<<"$LOG" \
  || grep -E '^error\[' <<<"$LOG" | grep -qv 'error\[16-0002\]: move conflict'; then
  echo "FAIL using one proof twice was refused for another reason"
  echo "$LOG"
  exit 1
fi
echo "ok   refused: Withdraw using one proof twice"

if build_edited 'Withdraw {' "$ONLY_LINE" after 'only(owner, caller: ctx.caller())'; then
  echo "FAIL Withdraw compiled dropping a proof"
  exit 1
fi
# 8-0082 "unused value of type `OwnerProof`", and nothing else.
if ! grep -q 'unused value of type `OwnerProof`' <<<"$LOG" \
  || grep -E '^error\[' <<<"$LOG" | grep -qv 'error\[8-0082\]: unused value'; then
  echo "FAIL dropping a proof was refused for another reason"
  echo "$LOG"
  exit 1
fi
echo "ok   refused: Withdraw dropping a proof"

# 4. The source check passes on the real vault, and rejects forgeries that
#    the compiler accepts.
if ! why=$(check_proofs "$ROOT/fe/src/vault.fe"); then
  echo "FAIL vault.fe: proofs must come only from only(owner, caller: ctx.caller()) in a handler"
  echo "$why"
  exit 1
fi
echo "ok   source check: authorize is called once, in only, with the stored owner and ctx.caller()"

forge() {
  local name=$1 edited why status=0
  shift
  edited=$(mktemp)
  edit_handler "$@" > "$edited"
  if why=$(check_proofs "$edited"); then
    echo "FAIL the source check accepted: $name"
    rm -f "$edited"
    exit 1
  fi
  build_vault "$edited" || status=$?
  rm -f "$edited"
  if [ $status -ne 0 ]; then
    echo "FAIL this forgery no longer compiles, so it no longer shows why the source check exists: $name"
    echo "$LOG"
    exit 1
  fi
  echo "ok   source check rejects, though the compiler accepts: $name"
  echo "       $why"
}
forge 'a proof for whoever calls' 'Withdraw {' "$ONLY_LINE" replace \
  'let proof = authorize(owner: ctx.caller(), caller: ctx.caller()).unwrap()'
forge 'owner rebound to the caller' 'Withdraw {' "$ONLY_LINE" before \
  'let owner = ctx.caller()'

# 5. The verdict codes are checked at compile time: making one refusal code a
#    duplicate of another must fail with "static assertion failed" (8-0081).
dir=$(mktemp -d)
cp -r "$ROOT/fe" "$dir/"
rm -rf "$dir/fe/out"
sed -i 's/^pub const CODE_PAUSED: u8 = 2$/pub const CODE_PAUSED: u8 = 1/' "$dir/fe/src/kernel.fe"
grep -q '^pub const CODE_PAUSED: u8 = 1$' "$dir/fe/src/kernel.fe" || { echo "could not edit CODE_PAUSED"; rm -rf "$dir"; exit 2; }
if (cd "$dir/fe" && "$FE" build > "$dir/build.log" 2>&1); then
  echo "FAIL a duplicate verdict code compiled"
  rm -rf "$dir"
  exit 1
fi
if ! grep -q 'static assertion failed' "$dir/build.log"; then
  echo "FAIL a duplicate verdict code was refused for another reason"
  cat "$dir/build.log"
  rm -rf "$dir"
  exit 1
fi
rm -rf "$dir"
echo "ok   refused: a duplicate verdict code"
