#!/usr/bin/env bash
# Proves README claims by editing a copy of `vault.fe` and requiring the
# compiler to refuse each edit with one exact error, next to a control edit
# that must still compile, so a refusal cannot come from a broken edit.
#
# 1. The agent's `Pay` handler cannot change the rules or the recipients:
#    writing `terms` or `approved_from` inside `Pay` must fail.
# 2. No handler can loosen the rules except through the kernel. The vault
#    stores its rules as `Terms` (fe/src/kernel/sealed.fe), whose field is
#    private to the kernel. In `Propose`, storing hand-built terms, storing a
#    hand-built `Rules`, or writing a field of `terms` must fail. A `Policy`
#    or `Rules` literal on its own still compiles: the vault needs one to
#    make a proposal, and neither can be stored as its rules.
# 3. No owner handler can change the rules or withdraw without a proof bound
#    to the real caller: deleting the `only(...)` line from `Propose`,
#    `CancelQueued`, `Pause`, `SetRecipient` or `Withdraw` must fail. So must
#    every other way of getting an `OwnerCall`: writing one, writing an
#    `Owner` for the caller, using the kernel's `authorize` (its proof is an
#    `OwnerProof`, which nothing here accepts), or handing `prove` a stand-in
#    context. The control shows the stand-in itself compiles: it is the
#    `Evm` parameter of `prove` that keeps it out.
# 4. A proof is spent by its first use: using one twice must fail with a
#    move error, and making one and dropping it must fail (`#[must_use]`).
# 5. What the compiler does not check, kept visible so the README cannot
#    drift: which address `init` gives `open` (a source check below), and a
#    handler that lists `mut approved_from` writing the map directly (shown
#    to compile). `open` after deployment and zeroed `Terms` are runtime
#    checks, tested in fe/src/vault_tests.fe.
# 6. The verdict codes stay distinct: see the end of this script.
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

# Print vault.fe with one line of the handler whose header starts with $1
# edited: the first line containing $2 is replaced by $4 (deleted if $4 is
# empty) when $3 is "replace", or gets $4 after or before it when $3 is
# "after" or "before". Anything in $APPEND goes at the end of the file.
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
  printf '%s' "${APPEND:-}"
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

# The edit must compile.
control() {
  local name=$1
  shift
  if ! build_edited "$@"; then
    echo "control failed: $name should compile"
    echo "$LOG"
    exit 1
  fi
  echo "ok   control: $name"
}

# The edit must fail, with $2 in the log and no error other than code $3.
refused() {
  local name=$1 message=$2 code=$3
  shift 3
  if build_edited "$@"; then
    echo "FAIL compiled: $name"
    exit 1
  fi
  if ! grep -qF -- "$message" <<<"$LOG" \
    || grep -E '^error\[' <<<"$LOG" | grep -qvF "error[$code]"; then
    echo "FAIL refused for another reason: $name"
    echo "$LOG"
    exit 1
  fi
  echo "ok   refused: $name"
}

PAY='Pay { to, amount, nonce }'
NOW='let now = seconds(ctx.timestamp())'
ONLY_LINE='let proof = only(owner, ctx)'
STORE='terms = next'

# 1. The agent's code path cannot write the rules or the recipients.
control 'Pay may write its own ledger' "$PAY" "$NOW" after 'ledger = ledger'
# 8-0018 "left-hand side of assignment is immutable" for a field,
# 8-0066 "does not provide mutable access" for a map.
refused 'Pay writing terms' 'is immutable' 8-0018 "$PAY" "$NOW" after 'terms = terms'
refused 'Pay approving a recipient' 'does not provide mutable access' 8-0066 \
  "$PAY" "$NOW" after 'approved_from.set(key: to, value: now)'

# 2. Only the kernel makes new terms.
HAND_RULES='ingot::kernel::Rules { schedule: terms.rules().schedule, active: proposed, queued: ingot::kernel::Queued::none() }'
control 'Propose may build a Policy and a Rules' 'Propose {' "$STORE" after "let built = $HAND_RULES"
refused 'Propose storing hand-built terms (an instant raise)' '`rules` is not visible' 2-0003 \
  'Propose {' "$STORE" replace "terms = Terms { rules: $HAND_RULES }"
refused 'Propose storing a hand-built Rules' 'expected `Terms`, but `Rules` is given' 8-0000 \
  'Propose {' "$STORE" replace "terms = $HAND_RULES"
refused 'Propose writing a field of terms' '`rules` is not visible' 2-0003 \
  'Propose {' "$STORE" replace 'terms.rules = next.rules()'

# 3. A proof comes only from `prove`, with the stored owner and the real caller.
for handler in 'Propose {' 'CancelQueued uses' 'Pause uses' 'SetRecipient {' 'Withdraw {'; do
  # 8-0012 "undefined variable `proof`": the handler has no proof to pass on.
  refused "${handler%% *} without its owner check" 'undefined variable `proof`' 8-0012 \
    "$handler" "$ONLY_LINE" replace ''
done
refused 'Withdraw with a hand-made OwnerCall' '`granted` is not visible' 2-0003 \
  'Withdraw {' "$ONLY_LINE" replace 'let proof = OwnerCall { granted: true }'
refused 'Withdraw with an Owner made for the caller' '`address` is not visible' 2-0003 \
  'Withdraw {' "$ONLY_LINE" replace 'let proof = only(Owner { address: ctx.caller() }, ctx)'
refused "Withdraw with the kernel's authorize" 'expected `OwnerCall`, but `OwnerProof` is given' 8-0000 \
  'Withdraw {' "$ONLY_LINE" replace \
  'let proof = ingot::kernel::authorize(owner: ctx.caller(), caller: ctx.caller()).unwrap()'

# A stand-in context that says the owner is calling. It implements `Ctx`,
# because the trait's seal is reachable as `std::evm::effects::EvmCapabilitySeal`.
FAKE_CTX='
pub struct Liar { says: Address, ts: Timestamp }
impl std::evm::effects::EvmCapabilitySeal for Liar {}
impl Ctx for Liar {
    fn caller(self) -> Address { self.says }
    fn address(self) -> Address { self.says }
    fn origin(self) -> Address { self.says }
    fn coinbase(self) -> Address { self.says }
    fn balance(self, _ a: Address) -> Wei { Wei::zero() }
    fn value(self) -> Wei { Wei::zero() }
    fn gasprice(self) -> u256 { 0 }
    fn timestamp(self) -> Timestamp { self.ts }
    fn block_number(self) -> u256 { 0 }
    fn prevrandao(self) -> u256 { 0 }
    fn gaslimit(self) -> u256 { 0 }
    fn chainid(self) -> u256 { 0 }
    fn basefee(self) -> u256 { 0 }
    fn selfbalance(self) -> Wei { Wei::zero() }
    fn blockhash(self, _ n: u256) -> u256 { 0 }
    fn blobhash(self, _ n: u256) -> u256 { 0 }
    fn blobbasefee(self) -> u256 { 0 }
    fn extcodesize(self, _ a: Address) -> u256 { 0 }
    fn extcodecopy(mut self, _ a: Address, dest: mut core::MemBuffer, dest_offset: u256, src_offset: u256, len: u256) {}
    fn extcodehash(self, _ a: Address) -> u256 { 0 }
    fn gas(self) -> u256 { 0 }
}
'
APPEND=$FAKE_CTX control 'a stand-in Ctx that claims the owner is calling' \
  'Withdraw {' "$ONLY_LINE" before 'let liar = Liar { says: owner.address(), ts: ctx.timestamp() }'
APPEND=$FAKE_CTX refused 'Withdraw proving against a stand-in Ctx' 'expected `Evm`, but `Liar` is given' 8-0000 \
  'Withdraw {' "$ONLY_LINE" replace \
  'let proof = only(owner, ctx: Liar { says: owner.address(), ts: ctx.timestamp() })'

# 4. Proofs are spent on use and cannot be dropped.
PAY_OWNER='pay_owner(proof, token, owner, amount)'
# 16-0002 "cannot use a value after it was moved".
refused 'Withdraw using one proof twice' 'cannot use a value after it was moved' 16-0002 \
  'Withdraw {' "$PAY_OWNER" after "$PAY_OWNER"
# 8-0082 "unused value of type `OwnerCall`".
refused 'Withdraw dropping a proof' 'unused value of type `OwnerCall`' 8-0082 \
  'Withdraw {' "$ONLY_LINE" after 'only(owner, ctx)'

# 5. Not the compiler's: which address `init` hands to `open`. A source check
#    of vault.fe (comments stripped): `open` is called exactly once, in
#    `init`, with `owner: owner_`, and the `Owner` it returns is the one
#    stored. `open` itself refuses to run after deployment.
check_open() {
  awk '
    { code = $0; sub(/\/\/.*/, "", code); sub(/[ \t]+$/, "", code) }
    code ~ /^    init\(/ { ininit = 1 }
    ininit && code == "    }" { ininit = 0 }
    code ~ /(^|[^A-Za-z0-9_.])open\(/ {
      opens++
      if (!ininit || code != "        let (owner_of, terms_of) = match open(") bad = "`open` called outside init, or differently: " $0
      want = 1; next
    }
    want && code ~ /^ +ctx,$/ { next }
    want { if (code != "            owner: owner_,") bad = "`open` not given `owner: owner_`: " $0; want = 0 }
    code == "        owner = owner_of" { stores++ }
    END {
      if (bad != "") { print bad; exit 1 }
      if (opens != 1 || stores != 1) { print "expected one `open` and one `owner = owner_of`, found " opens + 0 " and " stores + 0; exit 1 }
    }
  ' "$ROOT/fe/src/vault.fe"
}
if ! why=$(check_open); then
  echo "FAIL vault.fe: $why"
  exit 1
fi
echo "ok   source check: init opens once, with owner_, and stores that Owner"

control 'NOT covered by the compiler: SetRecipient writing approved_from directly' \
  'SetRecipient {' 'approved_from.set(key: who, value: from)' replace \
  'approved_from.set(key: who, value: Instant::at(1))'

# 6. The verdict codes are checked at compile time: making one refusal code a
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
