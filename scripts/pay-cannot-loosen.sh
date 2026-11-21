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
# 5. No handler can approve a recipient except through the kernel. The
#    recipient map stores `Approval`s (fe/src/kernel/sealed.fe), whose fields
#    are private to the kernel. In `SetRecipient`, storing a date or a
#    hand-built `Approval` must fail. Copying an approval the kernel made
#    under another address still compiles; it approves no one, a runtime
#    check tested in fe/src/vault_tests.fe.
# 6. What the compiler does not check, kept visible so the README cannot
#    drift: which address `init` gives `open` (a source check below), and
#    where `Pay` sends money: an edit that pays the caller a thousand times
#    the amount compiles, and so does one made through a function whose
#    `uses` lists no `Call`, because any type can implement `Call` (both
#    shown to compile). `open` and `founding` after deployment and zeroed
#    `Terms` are runtime checks, tested in fe/src/vault_tests.fe.
# 7. The kernel's compile-time checks bite: a duplicate verdict code, a
#    verdict answering with another verdict's code, `meet` keeping the larger
#    cap, `loosens` ignoring a field, `cooled` letting `NEVER` through,
#    `current` ignoring the queue, or `amend` applying a raise at once, must
#    fail with "static assertion failed"; `+` wrapping instead of saturating
#    must fail with "arithmetic overflow in const context".
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
STORE='terms.amend(proof, proposed)'

# 1. The agent's code path cannot write the rules or the recipients.
control 'Pay may write its own ledger' "$PAY" "$NOW" after 'ledger = ledger'
# 8-0018 "left-hand side of assignment is immutable" for a field,
# 8-0066 "does not provide mutable access" for a map.
refused 'Pay writing terms' 'is immutable' 8-0018 "$PAY" "$NOW" after 'terms = terms'
refused 'Pay approving a recipient' 'does not provide mutable access' 8-0066 \
  "$PAY" "$NOW" after 'approved_from.set(key: to, value: approved_from.get(key: ctx.caller()))'

# 2. Only the kernel makes new terms.
HAND_RULES='ingot::kernel::Rules { schedule: terms.rules().schedule, active: proposed, queued: ingot::kernel::Queued::none() }'
control 'Propose may build a Policy and a Rules' 'Propose {' "$STORE" after "let built = $HAND_RULES"
refused 'Propose storing hand-built terms (an instant raise)' '`rules` is not visible' 2-0003 \
  'Propose {' "$STORE" replace "terms = Terms { rules: $HAND_RULES }"
refused 'Propose storing a hand-built Rules' 'expected `Terms`, but `Rules` is given' 8-0000 \
  'Propose {' "$STORE" replace "terms = $HAND_RULES"
refused 'Propose writing a field of terms' '`rules` is not visible' 2-0003 \
  'Propose {' "$STORE" replace 'terms.rules = terms.rules()'

# 3. A proof comes only from `prove`, with the stored owner and the real caller.
for handler in 'Propose {' 'CancelQueued uses' 'Pause uses' 'SetRecipient {' 'Withdraw {'; do
  # 8-0012 "undefined variable `proof`": the handler has no proof to pass on.
  refused "${handler%% *} without its owner check" 'undefined variable `proof`' 8-0012 \
    "$handler" "$ONLY_LINE" replace ''
done
refused 'Withdraw with a hand-made OwnerCall' '`granted` is not visible' 2-0003 \
  'Withdraw {' "$ONLY_LINE" replace 'let proof = OwnerCall { granted: true, now: Instant::at(1) }'
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
# Fe 26.6 does not check a private trait's visibility in an impl header, so
# the stand-in compiles there (research/UPSTREAM_ISSUES.md, Draft 6). With
# research/fe-patches/2-private-trait-visibility.patch it is refused at the seal.
# This script checks whichever compiler it is given; CI pins 26.6.
SEAL='`EvmCapabilitySeal` is not visible'
LIAR_LINE='let liar = Liar { says: owner.address(), ts: ctx.timestamp() }'
SEAL_CHECKED=0
if ! APPEND=$FAKE_CTX build_edited 'Withdraw {' "$ONLY_LINE" before "$LIAR_LINE"; then
  if grep -qF -- "$SEAL" <<<"$LOG"; then
    SEAL_CHECKED=1
  else
    echo "control failed: a stand-in Ctx that claims the owner is calling should compile"
    echo "$LOG"
    exit 1
  fi
fi

# A control that a compiler checking private traits must refuse at the seal.
seal_control() {
  local name=$1
  shift
  if [ "$SEAL_CHECKED" = 1 ]; then
    refused "$name (this compiler checks the seal)" "$SEAL" 2-0003 "$@"
  else
    control "$name" "$@"
  fi
}

APPEND=$FAKE_CTX seal_control 'a stand-in Ctx that claims the owner is calling' \
  'Withdraw {' "$ONLY_LINE" before "$LIAR_LINE"
if [ "$SEAL_CHECKED" = 1 ]; then
  echo "skip refused: Withdraw proving against a stand-in Ctx (the stand-in itself is refused above)"
else
  APPEND=$FAKE_CTX refused 'Withdraw proving against a stand-in Ctx' 'expected `Evm`, but `Liar` is given' 8-0000 \
    'Withdraw {' "$ONLY_LINE" replace \
    'let proof = only(owner, ctx: Liar { says: owner.address(), ts: ctx.timestamp() })'
fi

# 4. Proofs are spent on use and cannot be dropped.
PAY_OWNER='pay_owner(proof, token, owner, amount)'
# 16-0002 "cannot use a value after it was moved".
refused 'Withdraw using one proof twice' 'cannot use a value after it was moved' 16-0002 \
  'Withdraw {' "$PAY_OWNER" after "$PAY_OWNER"
# 8-0082 "unused value of type `OwnerCall`".
refused 'Withdraw dropping a proof' 'unused value of type `OwnerCall`' 8-0082 \
  'Withdraw {' "$ONLY_LINE" after 'only(owner, ctx)'

# 5. Only the kernel makes new approvals.
SET_RECIPIENT='SetRecipient {'
STORE_APPROVAL='approved_from.set(key: who, value: from)'
control 'SetRecipient may copy an approval the kernel made' \
  "$SET_RECIPIENT" "$STORE_APPROVAL" replace \
  'approved_from.set(key: who, value: approved_from.get(key: ctx.caller()))'
refused 'SetRecipient storing a date (skipping the cooling period)' \
  'expected `Approval`, but `Instant` is given' 8-0000 \
  "$SET_RECIPIENT" "$STORE_APPROVAL" replace 'approved_from.set(key: who, value: Instant::at(1))'
refused 'SetRecipient storing a hand-built Approval' '`from` is not visible' 2-0003 \
  "$SET_RECIPIENT" "$STORE_APPROVAL" replace \
  'approved_from.set(key: who, value: Approval { who, from: Instant::at(1) })'

# 6. Not the compiler's: which address `init` hands to `open`. A source check
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

# Not the compiler's: where `Pay` sends money. The kernel decides whether
# `to` may receive `amount`; the transfer is ordinary code.
TRANSFER='safe_transfer(token, receiver: to, amount)'
control 'NOT covered by the compiler: Pay paying the caller 1000x the amount' \
  "$PAY" "$TRANSFER" replace 'safe_transfer(token, receiver: ctx.caller(), amount: amount * 1000)'
# On Fe 26.6, taking `mut call` away from `Pay` would not close this: `Call`'s
# methods have default bodies and its seal is reachable, so any type can be a
# `Call`. A compiler with the private-trait fix refuses the forged `Call`.
FORGED_CALL='
pub struct Forged {}
impl std::evm::effects::EvmCapabilitySeal for Forged {}
impl Call for Forged {}
fn steal(_ token: Address, to: Address, amount: u256) uses (ctx: Ctx) {
    var forged = Forged {}
    with (Call = mut forged) {
        safe_transfer(token, receiver: to, amount)
    }
}
'
APPEND=$FORGED_CALL seal_control 'NOT covered by Fe 26.6: Pay paying through a function with no Call in its uses' \
  "$PAY" "$TRANSFER" replace 'steal(token, to: ctx.caller(), amount: amount * 1000)'

# A source check closes what the compiler leaves open here (it reads text;
# it is not a compiler guarantee): in vault.fe, comments stripped, Pay's
# handler transfers exactly once, with exactly
# safe_transfer(token, receiver: to, amount), right after ledger = next;
# it rebinds none of token, to, amount and nonce and calls nothing else that
# can move money; the only functions given mut Call are the contract and
# pay_owner (which needs an OwnerCall, so the owner's proof); and what Pay
# asks the kernel is exactly this, once each: the time from the chain, the
# stored terms' rules, a Request with the caller compared to the agent and
# the recipient's own approval, and decide(rules, ledger, request, now).
check_pay() {
  awk '
    { code = $0; sub(/\/\/.*/, "", code); sub(/[ \t]+$/, "", code) }
    code ~ /mut Call/ && code !~ /^fn pay_owner\(|^uses \(ctx: Ctx, call: mut Call\)$|^pub contract Vault uses/ { bad = "another function given mut Call: " $0 }
    code ~ /^uses \(ctx: Ctx, call: mut Call\)$/ && prev !~ /^fn pay_owner\(/ { bad = "mut Call outside pay_owner: " $0 }
    BEGIN {
      need["            let now = seconds(ctx.timestamp())"] = 0
      need["            let rules = terms.rules()"] = 0
      need["            let request = Request {"] = 0
      need["                amount,"] = 0
      need["                nonce,"] = 0
      need["                from_agent: ctx.caller() == agent,"] = 0
      need["                to_approved: cooled(at: approved_from.get(key: to).of(to), now),"] = 0
      need["            match decide(rules, ledger, request, now) {"] = 0
    }
    index(code, "        Pay {") == 1 { inpay = 1; prevcode = ""; prev = code; next }
    inpay && (code ~ /^        [A-Z][A-Za-z]* \{/ || code == "    }") { inpay = 0 }
    inpay {
      if (code ~ /transfer|pay_owner|steal|\.call\(|Call =|with \(/) {
        transfers++
        if (code != "                    safe_transfer(token, receiver: to, amount)") bad = "Pay moves money differently: " $0
        else if (prevcode != "                    ledger = next") bad = "Pay transfers somewhere other than right after ledger = next"
      }
      if (code ~ /(let|var) +(mut +)?(token|to|amount|nonce)([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_.])(token|to|amount|nonce) *[-+*\/]?= /) bad = "Pay rebinds token, to, amount or nonce: " $0
      if (code in need) need[code]++
      else if (code ~ /decide\(|Request *\{|from_agent|to_approved|(let|var) +(mut +)?(now|rules|request)([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_.])(now|rules|request) *= /) bad = "Pay asks the kernel something else: " $0
      if (code !~ /^ *$/) prevcode = code
    }
    { if (code !~ /^ *$/) prev = code }
    END {
      if (bad != "") { print bad; exit 1 }
      if (transfers != 1) { print "expected one transfer in Pay, found " transfers + 0; exit 1 }
      for (line in need) if (need[line] != 1) { print "expected once in Pay, found " need[line] " times:" line; exit 1 }
    }
  ' "$1"
}
if ! why=$(check_pay "$ROOT/fe/src/vault.fe"); then
  echo "FAIL vault.fe: $why"
  exit 1
fi
echo "ok   source check: Pay asks the kernel with the stored rules and the real caller, and its only transfer is safe_transfer(token, receiver: to, amount)"
# The check must catch the edits the compiler lets through.
pay_check_catches() {
  local name=$1 edited
  shift
  edited=$(mktemp)
  edit_handler "$@" > "$edited"
  if check_pay "$edited" >/dev/null; then
    rm -f "$edited"
    echo "FAIL source check missed: $name"
    exit 1
  fi
  rm -f "$edited"
  echo "ok   source check catches: $name"
}
pay_check_catches 'Pay paying the caller 1000x the amount' \
  "$PAY" "$TRANSFER" replace 'safe_transfer(token, receiver: ctx.caller(), amount: amount * 1000)'
APPEND=$FORGED_CALL pay_check_catches 'Pay paying through a forged Call' \
  "$PAY" "$TRANSFER" replace 'steal(token, to: ctx.caller(), amount: amount * 1000)'
pay_check_catches 'Pay doubling the amount before the transfer' \
  "$PAY" "$TRANSFER" before 'let amount = amount * 2'
pay_check_catches 'Pay transferring twice' \
  "$PAY" "$TRANSFER" after 'safe_transfer(token, receiver: to, amount)'
# What Pay tells the kernel is ordinary code too: this compiles, and pays anyone.
ANYONE='to_approved: true,'
control 'NOT covered by the compiler: Pay telling the kernel every recipient is approved' \
  "$PAY" 'to_approved: cooled(' replace "$ANYONE"
pay_check_catches 'Pay telling the kernel every recipient is approved' \
  "$PAY" 'to_approved: cooled(' replace "$ANYONE"
pay_check_catches 'Pay telling the kernel every caller is the agent' \
  "$PAY" 'from_agent: ctx.caller() == agent,' replace 'from_agent: true,'
pay_check_catches 'Pay deciding against an empty ledger' \
  "$PAY" 'match decide(rules, ledger, request, now) {' replace \
  'match decide(rules, Ledger { window: 0, spent: 0, next_nonce: nonce }, request, now) {'
pay_check_catches 'Pay deciding with rules other than the stored ones' \
  "$PAY" 'let rules = terms.rules()' replace 'let rules = Rules { schedule: terms.rules().schedule, active: terms.rules().queued.policy, queued: terms.rules().queued }'

# What the compiler does not stop either: a vault that keeps a second copy
# of its rules or approvals in storage and puts it back later (Terms and
# Approval are Copy), or a Pay that writes its own ledger. A source check of
# vault.fe (comments stripped; it reads the text, it is not a compiler
# guarantee): the name Terms appears only in the import and the one storage
# field, Approval only in the import, founded and the one map; ledger is
# assigned only in init and as ledger = next in Pay, and only init builds a
# Ledger.
check_state() {
  awk '
    { code = " " $0 " "; sub(/\/\/.*/, " ", code) }
    { terms += gsub(/[^A-Za-z0-9_]Terms[^A-Za-z0-9_]/, "&", code) }
    { approvals += gsub(/[^A-Za-z0-9_]Approval[^A-Za-z0-9_]/, "&", code) }
    { built += gsub(/[^A-Za-z0-9_]Ledger *\{/, "&", code) }
    code ~ /[^A-Za-z0-9_.]ledger *= [^=]/ {
      writes++
      if (code !~ /^ +ledger = next *$/ && code !~ /^ +ledger = Ledger \{ window: 0, spent: 0, next_nonce: 0 \} *$/) bad = "ledger written another way: " $0
    }
    END {
      if (bad != "") { print bad; exit 1 }
      if (terms != 2) { print "Terms named " terms + 0 " times, expected 2 (the import and the one field)"; exit 1 }
      if (approvals != 3) { print "Approval named " approvals + 0 " times, expected 3 (the import, founded, the one map)"; exit 1 }
      if (built != 1 || writes != 2) { print "Ledger built " built + 0 " times and ledger written " writes + 0 " times, expected 1 and 2"; exit 1 }
    }
  ' "$1"
}
if ! why=$(check_state "$ROOT/fe/src/vault.fe"); then
  echo "FAIL vault.fe: $why"
  exit 1
fi
echo "ok   source check: one stored Terms, one Approval map, and Pay writes its ledger only from the kernel"
state_check_catches() {
  local name=$1 edited
  shift
  edited=$(mktemp)
  "$@" > "$edited"
  if check_state "$edited" >/dev/null; then
    rm -f "$edited"
    echo "FAIL source check missed: $name"
    exit 1
  fi
  rm -f "$edited"
  echo "ok   source check catches: $name"
}
with_field() { sed "s/^    mut terms: Terms,\$/    mut terms: Terms,\n    $1/" "$ROOT/fe/src/vault.fe"; }
state_check_catches 'a second stored Terms, to put old rules back later' with_field 'mut backup: Terms,'
state_check_catches 'a second Approval map, to put old approvals back later' with_field 'mut kept: StorageMap<Address, Approval>,'
state_check_catches 'Pay resetting what was spent today' \
  edit_handler "$PAY" "$TRANSFER" after 'ledger = Ledger { window: next.window, spent: 0, next_nonce: next.next_nonce }'

# Putting older rules back is also the compiler's for Terms: Terms is not
# Copy and changes in place (amend, cancel and pause take `mut self`), so a
# second stored copy can be neither made from the first nor moved back. Each
# edit below is the whole vault.fe with a backup field added (16-0002).
refused_file() {
  local name=$1 message=$2 code=$3 edited
  shift 3
  edited=$(mktemp)
  sed "$@" "$ROOT/fe/src/vault.fe" > "$edited"
  if build_vault "$edited"; then
    rm -f "$edited"
    echo "FAIL compiled: $name"
    exit 1
  fi
  rm -f "$edited"
  if ! grep -qF -- "$message" <<<"$LOG" || grep -E '^error\[' <<<"$LOG" | grep -qvF "error[$code]"; then
    echo "FAIL refused for another reason: $name"
    echo "$LOG"
    exit 1
  fi
  echo "ok   refused: $name"
}
BACKUP_FIELD='s/^    mut terms: Terms,$/    mut terms: Terms,\n    mut backup: Terms,/'
refused_file 'init keeping a second copy of the founding rules' 'cannot use a value after it was moved' 16-0002 \
  -e "$BACKUP_FIELD" \
  -e 's/uses (ctx, mut owner, mut agent, mut token, mut terms, mut ledger, mut approved_from)/uses (ctx, mut owner, mut agent, mut token, mut terms, mut backup, mut ledger, mut approved_from)/' \
  -e 's/^        terms = terms_of$/        terms = terms_of\n        backup = terms_of/'
refused_file 'Pause saving the rules aside before pausing' 'cannot move out of storage' 16-0002 \
  -e "$BACKUP_FIELD" \
  -e 's/^        Pause uses (ctx, owner, mut terms, mut log) {$/        Pause uses (ctx, owner, mut terms, mut backup, mut log) {\n            backup = terms/'
refused_file 'CancelQueued putting saved rules back' 'cannot move out of storage' 16-0002 \
  -e "$BACKUP_FIELD" \
  -e 's/^        CancelQueued uses (ctx, owner, mut terms, mut log) {$/        CancelQueued uses (ctx, owner, mut terms, backup, mut log) {\n            terms = backup/'

# The vault's whole shape, pinned (comments stripped; CI's fe fmt --check
# fixes the layout this reads). A source check, not a compiler guarantee:
# exactly these imports, no glob import and no type alias, exactly these
# storage fields, exactly these handlers with exactly these uses, no token
# approval or transfer_from anywhere, and every "now" given to the kernel is
# the chain's own time (for the owner's changes the compiler sees to that
# too: the time comes with the owner's proof). A new handler, a new capability on an old one, a
# Terms kept under another name, an allowance granted to the caller, or a
# made-up time all fail here.
SHAPE_HEADS='init(owner_: Address, agent_: Address, token_: Address, per_payment: u256, per_window: u256, valid_until: u64, window_secs: u64, cooling_secs: u64, payee_a: Address, payee_b: Address, payee_c: Address) uses (ctx, mut owner, mut agent, mut token, mut terms, mut ledger, mut approved_from) {
Pay { to, amount, nonce } -> u8 uses (ctx, agent, token, terms, approved_from, mut ledger, mut call, mut log) {
Preview { caller, to, amount, nonce } -> (u8, u256) uses (ctx, agent, terms, ledger, approved_from) {
Exposure { until } -> u256 uses (ctx, terms, ledger) {
Propose { per_payment, per_window, valid_until, paused } uses (ctx, owner, mut terms, mut log) {
CancelQueued uses (ctx, owner, mut terms, mut log) {
Pause uses (ctx, owner, mut terms, mut log) {
SetRecipient { who, approved } uses (ctx, owner, terms, mut approved_from, mut log) {
Withdraw { amount } uses (ctx, owner, token, mut call, mut log) {
Owner -> Address uses (owner) {
Agent -> Address uses (agent) {
Token -> Address uses (token) {
ScheduleOf -> (u64, u64, u64) uses (terms) {
PolicyOf -> (u256, u256, u64, bool) uses (ctx, terms) {
QueuedOf -> (u256, u256, u64, bool, u64) uses (ctx, terms) {
LedgerOf -> (u64, u256, u64) uses (ledger) {
ApprovedFrom { who } -> u64 uses (approved_from) {'
SHAPE_USES='use std::evm::{Address, Call, Ctx, Evm, Log, StorageMap, revert_error}
use std::evm::erc20::safe_transfer
use ingot::kernel::{cooled, decide, exposure, left_in_window, Decision, Instant, Ledger, Policy, Reason, Request, Schedule, Seconds}
use ingot::kernel::sealed::{founding, open, prove, Approval, Owner, OwnerCall, Terms}'
SHAPE_FIELDS='owner: Owner,
agent: Address,
token: Address,
mut terms: Terms,
mut ledger: Ledger,
mut approved_from: StorageMap<Address, Approval>,'
check_shape() {
  local got
  got=$(awk '
    { code = $0; sub(/\/\/.*/, "", code); sub(/[ \t]+$/, "", code) }
    function norm(text) { gsub(/ +/, " ", text); gsub(/\( /, "(", text); gsub(/,? \)/, ")", text); return text }
    function normuse(text) { text = norm(text); gsub(/\{ /, "{", text); gsub(/,? \}/, "}", text); return text }
    function add(text) { piece = text; sub(/^ +/, "", piece); return piece }
    # imports, one statement per line
    !incontract && code ~ /^use / { inuse = 1; stmt = "" }
    inuse { stmt = stmt (stmt == "" ? "" : " ") add(code); if (code !~ /\{$/ && code !~ /,$/) { print "USE " normuse(stmt); inuse = 0 } }
    /^pub contract Vault/ { incontract = 1; infields = 1; next }
    infields && code ~ /^    init\(/ { infields = 0 }
    infields && code ~ /^    [a-z]/ { print "FIELD " add(code) }
    incontract && !inhead && (code ~ /^        [A-Z][A-Za-z]*( |\{|$)/ || code ~ /^    init\(/) { inhead = 1; head = "" }
    inhead { head = head (head == "" ? "" : " ") add(code); if (code ~ /\{$/) { print "HEAD " norm(head); inhead = 0 } }
    code ~ /(^|[^A-Za-z0-9_])type +[A-Z]/ { print "BAD a type alias: " $0 }
    code ~ /::\*/ { print "BAD a glob import: " $0 }
    code ~ /(^|[^A-Za-z0-9_])(try_)?approve *\(|transfer_from|transferFrom/ { print "BAD a token approval or transfer_from: " $0 }
    code ~ /(let|var) +(mut +)?now *=/ && code !~ /^ +let now = seconds\(ctx\.timestamp\(\)\)$/ { print "BAD now from elsewhere: " $0 }
    code ~ /(^|[^A-Za-z0-9_])now: / && code !~ /now: seconds\(ctx\.timestamp\(\)\)/ { print "BAD a time other than the chain'"'"'s: " $0 }
    code ~ /Instant::at\(/ && code !~ /^    Instant::at\(at\.as_seconds\(\)\.downcast_saturate\(\)\)$|^ +valid_until: Instant::at\(valid_until\),$|^ +until: Instant::at\(until\),$/ { print "BAD a made-up Instant: " $0 }
    code ~ /^fn seconds\(/ && code != "fn seconds(_ at: Timestamp) -> Instant {" { print "BAD seconds() changed: " $0 }
  ' "$1")
  local bad
  bad=$(grep '^BAD ' <<<"$got" | head -1)
  if [ -n "$bad" ]; then echo "${bad#BAD }"; return 1; fi
  if [ "$(sed -n 's/^HEAD //p' <<<"$got")" != "$SHAPE_HEADS" ]; then
    echo "the handlers or their uses differ from the pinned list:"; diff <(echo "$SHAPE_HEADS") <(sed -n 's/^HEAD //p' <<<"$got") | head -6; return 1
  fi
  if [ "$(sed -n 's/^USE //p' <<<"$got")" != "$SHAPE_USES" ]; then
    echo "the imports differ from the pinned list:"; diff <(echo "$SHAPE_USES") <(sed -n 's/^USE //p' <<<"$got") | head -6; return 1
  fi
  if [ "$(sed -n 's/^FIELD //p' <<<"$got")" != "$SHAPE_FIELDS" ]; then
    echo "the storage fields differ from the pinned list:"; diff <(echo "$SHAPE_FIELDS") <(sed -n 's/^FIELD //p' <<<"$got") | head -6; return 1
  fi
}
if ! why=$(check_shape "$ROOT/fe/src/vault.fe"); then
  echo "FAIL vault.fe: $why"
  exit 1
fi
echo "ok   source check: the vault's imports, storage, handlers, their uses, and the time it gives the kernel match the pinned list"
shape_check_catches() {
  local name=$1 edited
  shift
  edited=$(mktemp)
  "$@" > "$edited"
  if check_shape "$edited" >/dev/null; then
    rm -f "$edited"
    echo "FAIL source check missed: $name"
    exit 1
  fi
  rm -f "$edited"
  echo "ok   source check catches: $name"
}
vault_sed() { sed "$@" "$ROOT/fe/src/vault.fe"; }
# An Fe judge (2026-11-20) found the edits below compiled and passed fe test
# and every check above. The first is now the compiler's: the owner's proof
# carries the chain's time (read by `prove` from the concrete `Evm`), and
# `Terms`'s functions take no time of their own, so a made-up one does not
# compile. The source check catches it too.
MADE_UP_TIME='terms.amend(proof, proposed, now: Instant::at(1))'
refused 'Propose giving the kernel a made-up time (a raise would mature at once)' 'argument number mismatch' 8-0023 \
  'Propose {' 'terms.amend(proof, proposed)' replace "$MADE_UP_TIME"
shape_check_catches 'Propose giving the kernel a made-up time' \
  edit_handler 'Propose {' 'terms.amend(proof, proposed)' replace "$MADE_UP_TIME"
shape_check_catches 'a glob import, to name Terms another way' \
  vault_sed 's/^use ingot::kernel::sealed::{founding, open, prove, Approval, Owner, OwnerCall, Terms}$/use ingot::kernel::sealed::*/'
shape_check_catches 'a type alias for Terms' vault_sed 's/^pub contract Vault uses/type Kept = Terms\n\npub contract Vault uses/'
shape_check_catches 'Withdraw given the rules to write' \
  vault_sed 's/^        Withdraw { amount } uses (ctx, owner, token, mut call, mut log) {$/        Withdraw { amount } uses (ctx, owner, token, mut terms, mut call, mut log) {/'
shape_check_catches 'Pay granting the caller an allowance on the token' \
  edit_handler "$PAY" "$TRANSFER" after 'let _ = try_approve(token, spender: ctx.caller(), amount: 1)'
shape_check_catches 'a new handler that moves money with no owner check' \
  vault_sed 's/^        Owner -> Address uses (owner) {$/        Sweep { amount } uses (ctx, token, mut call) {\n            safe_transfer(token, receiver: ctx.caller(), amount)\n        }\n\n        Owner -> Address uses (owner) {/'

# A second Fe judge (2026-11-21) found three edits that compiled, passed
# fe test and every check above: `init` also approving the agent as a
# recipient (it could pay itself), `prove` accepting the transaction's
# origin as the owner (any contract the owner calls could act as the owner),
# and `seconds()` reading the clock a day ahead through a wrapper type. The
# code they changed is now pinned by its sha256, comments and blank lines
# ignored: everything in vault.fe outside the contract (helpers, events,
# `seconds`, `founded`), `init`'s body, and all of kernel/sealed.fe. A
# source check, not a compiler guarantee: any change to that code fails here
# until the pin below is updated, so it cannot go in unnoticed.
PIN_PRELUDE=7513342fc0297187e30321445439eb69a8cc4673ac61796dc1d07a34a20e172c
PIN_INIT=6b1f4723e2552bfceaaf731967477b1a688a486afcdf598c4321fdbeb6cf8234
PIN_SEALED=c940bbd6a00468876c1ae2e21377f714a16849ea941b84edd518f8aa4a1f42da
code_sha() { sed 's#//.*##; s/[ \t]*$//' | grep -v '^$' | sha256sum | cut -d' ' -f1; }
prelude_of() { awk '/^pub contract Vault/ { exit } { print }' "$1"; }
init_of() { awk '/^    init\(/ { on = 1 } on { print } on && /^    }$/ { exit }' "$1"; }
check_pinned() {
  local vault=$1 sealed=$2 got
  got=$(prelude_of "$vault" | code_sha)
  [ "$got" = "$PIN_PRELUDE" ] || { echo "vault.fe outside the contract changed (now $got)"; return 1; }
  got=$(init_of "$vault" | code_sha)
  [ "$got" = "$PIN_INIT" ] || { echo "init changed (now $got)"; return 1; }
  got=$(code_sha < "$sealed")
  [ "$got" = "$PIN_SEALED" ] || { echo "kernel/sealed.fe changed (now $got)"; return 1; }
}
if ! why=$(check_pinned "$ROOT/fe/src/vault.fe" "$ROOT/fe/src/kernel/sealed.fe"); then
  echo "FAIL $why"
  exit 1
fi
echo "ok   source check: init, the code around the contract, and kernel/sealed.fe match their pinned sha256"
pin_check_catches() {
  local name=$1 vault=$2 sealed=$3
  if check_pinned "$vault" "$sealed" >/dev/null; then
    rm -f "$vault" "$sealed"
    echo "FAIL source check missed: $name"
    exit 1
  fi
  rm -f "$vault" "$sealed"
  echo "ok   source check catches: $name"
}
copy_of() { local out; out=$(mktemp); cat "$1" > "$out"; echo "$out"; }
edited_vault() { local out; out=$(mktemp); vault_sed "$@" > "$out"; echo "$out"; }
SEALED=$ROOT/fe/src/kernel/sealed.fe
pin_check_catches 'init also approving the agent, so it can pay itself' \
  "$(edited_vault 's/^\(            approved_from.set(key: payee_c, value: founded(ctx, who: payee_c))\)$/\1\n            approved_from.set(key: agent_, value: founded(ctx, who: agent_))/')" \
  "$(copy_of "$SEALED")"
pin_check_catches 'seconds() reading the clock a day ahead through a wrapper type' \
  "$(edited_vault -e 's/^fn seconds(_ at: Timestamp) -> Instant {$/fn seconds(_ at: Timestamp) -> Instant {\n    let at = Ahead { at }/' \
    -e 's/^const MIN_COOLING_SECS: u64 = 60$/struct Ahead { at: Timestamp }\nimpl Ahead {\n    fn as_seconds(self) -> u256 { self.at.as_seconds() + 86399 }\n}\n\nconst MIN_COOLING_SECS: u64 = 60/')" \
  "$(copy_of "$SEALED")"
edited_sealed=$(mktemp)
sed 's/ctx.caller() == owner.address {$/(ctx.caller() == owner.address || ctx.origin() == owner.address) {/' "$SEALED" > "$edited_sealed"
pin_check_catches "prove accepting the transaction's origin as the owner" "$(copy_of "$ROOT/fe/src/vault.fe")" "$edited_sealed"

# 7. Kernel edits the compiler must refuse: the one line matching $2 in
#    kernel.fe becomes $3, and the build must fail with $5 in the log and no
#    error other than code $4 (by default "static assertion failed", 8-0081).
kernel_refused() {
  local name=$1 from=$2 to=$3 code=${4:-8-0081} message=${5:-static assertion failed} dir
  dir=$(mktemp -d)
  cp -r "$ROOT/fe" "$dir/"
  rm -rf "$dir/fe/out"
  sed -i "s/$from/$to/" "$dir/fe/src/kernel.fe"
  # Exactly one line changed, and it now reads as intended.
  if [ "$(diff "$ROOT/fe/src/kernel.fe" "$dir/fe/src/kernel.fe" | grep -c '^>')" != 1 ] \
    || ! grep -qF -- "$to" "$dir/fe/src/kernel.fe"; then
    echo "could not edit kernel.fe for: $name"
    rm -rf "$dir"
    exit 2
  fi
  if (cd "$dir/fe" && "$FE" build > "$dir/build.log" 2>&1); then
    echo "FAIL compiled: $name"
    rm -rf "$dir"
    exit 1
  fi
  if ! grep -qF -- "$message" "$dir/build.log" \
    || grep -E '^error\[' "$dir/build.log" | grep -qvF "error[$code]"; then
    echo "FAIL refused for another reason: $name"
    cat "$dir/build.log"
    rm -rf "$dir"
    exit 1
  fi
  rm -rf "$dir"
  echo "ok   refused: $name"
}

# The verdict codes: making one refusal code a duplicate of another, or
# having a reason answer with another reason's code.
kernel_refused 'a duplicate verdict code' \
  '^pub const CODE_PAUSED: u8 = 2$' 'pub const CODE_PAUSED: u8 = 1'
kernel_refused 'a reason answering with another code' \
  'Reason::Paused => CODE_PAUSED,' 'Reason::Paused => CODE_NOT_AGENT,'
# The ratchet's laws (end of kernel.fe). `meet` keeping the larger
# per-payment cap would let a "tightening" raise it.
kernel_refused 'meet choosing the larger cap' \
  'per_payment: if a.per_payment < b.per_payment {' 'per_payment: if a.per_payment > b.per_payment {'
# `loosens` blind to the window cap would apply a raise of it at once.
kernel_refused 'loosens ignoring the window cap' \
  '^        || to.per_window > from.per_window$' '        || false'
# A change queued past the end of time would take effect at the last second.
kernel_refused 'cooled letting NEVER through' \
  '^    at != NOT_SET && at != NEVER && now >= at$' '    !(at == NOT_SET || now < at)'
# A matured raise would never take effect, and `cancel` could not see it.
kernel_refused 'current ignoring the queue' \
  '^        if self.queued.matured(now) {$' '        if false {'
# A cooling period running past the end of time would wrap to a moment soon.
kernel_refused '+ wrapping instead of saturating' \
  'Instant { secs: self.secs.saturating_add(other.secs) }' 'Instant { secs: self.secs + other.secs }' \
  3-0034 'arithmetic overflow in const context'
# `amend` itself: a raise applied at once instead of waiting out the cooling
# period. Only the asserts that run `amend` catch this.
kernel_refused 'amend applying a raise at once' \
  '^    let active = meet(in_force, proposed)$' '    let active = proposed'
