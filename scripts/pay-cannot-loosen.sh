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
#    a transfer imported into vault.fe
#    beside the sealed payout: an edit that pays the caller a thousand times
#    that way compiles, and so does one made through a function whose
#    `uses` lists no `Call`, because any type can implement `Call` (both
#    shown to compile). A hand-made payout does not compile. `open` and `founding` after deployment and zeroed
#    `Terms` are runtime checks, tested in fe/src/vault_tests.fe.
# 7. The kernel's compile-time checks bite: a duplicate verdict code, a
#    verdict answering with another verdict's code, `meet` keeping the larger
#    cap, `loosens` ignoring a field, `cooled` letting `NEVER` through,
#    `current` ignoring the queue, or `amend` applying a raise at once, must
#    fail with "static assertion failed"; `+` wrapping instead of saturating
#    must fail with "arithmetic overflow in const context".
# 8. The grid laws in kernel/laws.fe bite too: `decide` ignoring a cap, the
#    end date or a pause, and `exposure` forgetting later windows or a
#    waiting raise, edits no earlier check catches, must fail to compile.
set -euo pipefail

FE=${FE:-fe}
ROOT=$(cd "$(dirname "$0")/.." && pwd)

# Build a copy of the project whose vault.fe is the given file.
build_vault() {
  local src=$1 dir
  dir=$(mktemp -d)
  cp -r "$ROOT/fe" "$dir/"
  rm -rf "$dir/fe/out"
  # The kernel's grid laws (kernel/laws.fe) add about 20 s to every build
  # and say nothing about vault.fe; section 8 runs them on kernel edits.
  rm -f "$dir/fe/src/kernel/laws.fe"
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
# $SRC, if set, is edited instead of vault.fe, to combine two edits.
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
  ' "${SRC:-$ROOT/fe/src/vault.fe}" || { echo "could not find '$target' in $handler" >&2; exit 2; }
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
FIRST='let rules = terms.now()'
ONLY_LINE='let proof = only(owner, ctx)'
STORE='terms.amend(proof, proposed)'

# 1. The agent's code path cannot write the rules, the recipients or its own
#    key.
control 'Pay may read its own spending' "$PAY" "$FIRST" before 'let seen = ledger.ledger()'
# 8-0018 "left-hand side of assignment is immutable" for a field,
# 8-0066 "does not provide mutable access" for a map.
refused 'Pay writing terms' 'is immutable' 8-0018 "$PAY" "$FIRST" before 'terms = terms'
refused 'Pay replacing its own agent key' 'is immutable' 8-0018 "$PAY" "$FIRST" before 'seat = seat'
refused 'Pay approving a recipient' 'does not provide mutable access' 8-0066 \
  "$PAY" "$FIRST" before 'approved_from.set(key: to, value: approved_from.get(key: ctx.caller()))'

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
for handler in 'Propose {' 'CancelQueued uses' 'Pause uses' 'SetRecipient {' 'Withdraw {' 'SetAgent {'; do
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
PAY_OWNER='withdraw(proof, owner, token, amount)'
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
      if (!ininit || code != "        let (owner_of, seat_of, terms_of, books_of) = match open(") bad = "`open` called outside init, or differently: " $0
      want = 1; next
    }
    want && code ~ /^ +ctx,$/ { next }
    want == 1 { if (code != "            owner: owner_,") bad = "`open` not given `owner: owner_`: " $0; want = 2; next }
    want == 2 { if (code != "            agent: agent_,") bad = "`open` not given `agent: agent_`: " $0; want = 0 }
    code == "        owner = owner_of" { stores++ }
    code == "        seat = seat_of" { seats++ }
    END {
      if (bad != "") { print bad; exit 1 }
      if (opens != 1 || stores != 1 || seats != 1) { print "expected one `open`, one `owner = owner_of` and one `seat = seat_of`, found " opens + 0 ", " stores + 0 " and " seats + 0; exit 1 }
    }
  ' "$ROOT/fe/src/vault.fe"
}
if ! why=$(check_open); then
  echo "FAIL vault.fe: $why"
  exit 1
fi
echo "ok   source check: init opens once, with owner_ and agent_, and stores that Owner and Seat"

# Where `Pay` sends money is the compiler's now (2026-11-23): vault.fe holds
# no transfer of its own. `Books::judge` counts an allowed payment and returns
# a sealed `Payout` that can pay only that recipient that amount, from the
# caller and time read by `moment` and the agent read by `seat.now`; `Payout`,
# `Moment`, `TermsNow` and `AgentNow` have private fields, so none can be
# made by hand. What the compiler still lets through: vault.fe importing a
# transfer of its own and calling it. A source check refuses that (below).
SEND='payout.send()'
JUDGE='let verdict = ledger'
SEALED='ingot::kernel::sealed'
refused 'Pay sending to the caller, 1000x, through a hand-made Payout' '`to` is not visible' 2-0003 \
  "$PAY" "$SEND" replace "$SEALED::Payout { token: ctx.address(), to: ctx.caller(), amount: amount * 1000 }.send()"
refused 'Pay sending the payout twice' 'cannot use a value after it was moved' 16-0002 \
  "$PAY" "$SEND" after "$SEND"
refused 'Pay judged as if the caller were the agent' '`agent` is not visible' 2-0003 \
  "$PAY" 'let agent = seat.now(ctx)' replace "let agent = $SEALED::AgentNow { agent: ctx.caller() }"
refused 'Pay judged against rules other than the stored ones' '`rules` is not visible' 2-0003 \
  "$PAY" "$FIRST" replace "let rules = $SEALED::TermsNow { rules: terms.rules() }"
refused 'Pay judged at a made-up time or as another caller' '`caller` is not visible' 2-0003 \
  "$PAY" 'let at = moment(ctx)' replace "let at = $SEALED::Moment { caller: ctx.caller(), now: Instant::at(1) }"
refused 'Pay judged with a hand-made approval' '`who` is not visible' 2-0003 \
  "$PAY" 'let approval = approved_from.get(key: to)' replace 'let approval = Approval { who: to, from: Instant::at(1) }'
refused 'Pay forgetting what was spent today' '`ledger` is not visible' 2-0003 \
  "$PAY" "$FIRST" before "ledger = $SEALED::Books { ledger: Ledger { window: 0, spent: 0, next_nonce: nonce } }"

TRANSFER_IMPORT='
use std::evm::erc20::safe_transfer
'
APPEND=$TRANSFER_IMPORT control 'NOT covered by the compiler: Pay importing a transfer of its own and paying the caller 1000x' \
  "$PAY" "$SEND" before 'let stolen = ledger.token()\n            safe_transfer(token: stolen, receiver: ctx.caller(), amount: amount * 1000)'
# On Fe 26.6, taking `mut call` away from `Pay` would not close this: `Call`'s
# methods have default bodies and its seal is reachable, so any type can be a
# `Call`. A compiler with the private-trait fix refuses the forged `Call`.
FORGED_CALL='
use std::evm::erc20::safe_transfer
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
  "$PAY" "$SEND" before 'let stolen = ledger.token()\n            steal(stolen, to: ctx.caller(), amount: amount * 1000)'

# A source check closes what the compiler leaves open (it reads text; it is
# not a compiler guarantee): in vault.fe, comments stripped, nothing names a
# transfer, an ERC-20 function or a raw call; no function but the contract
# is given mut Call; and Pay is exactly this, once each: read the stored
# rules, the agent and the recipient's approval, read the caller and time,
# have the books judge the payment, and send the payout it returns, right
# after Verdict::Pay(payout), and nothing else that moves money.
check_pay() {
  awk '
    { code = $0; sub(/\/\/.*/, "", code); sub(/[ \t]+$/, "", code) }
    code ~ /transfer|erc20|\.call\(|steal|Call =|with \(/ { bad = "vault.fe can move money outside the payout: " $0 }
    code ~ /mut Call/ && code !~ /^pub contract Vault uses/ { bad = "a function given mut Call: " $0 }
    BEGIN {
      need["            let rules = terms.now()"] = 0
      need["            let agent = seat.now(ctx)"] = 0
      need["            let approval = approved_from.get(key: to)"] = 0
      need["            let at = moment(ctx)"] = 0
      need["            let verdict = ledger.judge(at, terms: rules, seat: agent, approval, to, amount, nonce)"] = 0
      need["            match verdict {"] = 0
      need["                Verdict::Pay(payout) => {"] = 0
      need["                    payout.send()"] = 0
    }
    index(code, "        Pay {") == 1 { inpay = 1; prevcode = ""; next }
    inpay && (code ~ /^        [A-Z][A-Za-z]* \{/ || code == "    }") { inpay = 0 }
    inpay {
      if (code ~ /send\(|withdraw|pay_owner/) {
        sends++
        if (code != "                    payout.send()") bad = "Pay moves money differently: " $0
        else if (prevcode != "                Verdict::Pay(payout) => {") bad = "Pay sends somewhere other than right after Verdict::Pay(payout)"
      }
      if (code == "                Verdict::Pay(payout) => {" && prevcode != "            match verdict {") bad = "Verdict::Pay is not the first arm of match verdict"
      if (code in need) need[code]++
      else if (code ~ /(let|var) +([^=]*[^A-Za-z0-9_])?(token|to|amount|nonce|payout|verdict|rules|agent|approval|at|pay_in)([^A-Za-z0-9_]|$)|(^|[^A-Za-z0-9_.])(token|to|amount|nonce|payout|verdict|rules|agent|approval|at|pay_in) *[-+*\/]?= [^=>]/) bad = "Pay rebinds what it asks the kernel: " $0
      else if (code ~ /judge|moment\(|\.now\(|Moment|TermsNow|AgentNow|Payout|Books|Verdict::Pay/) bad = "Pay asks the kernel something else: " $0
      if (code !~ /^ *$/) prevcode = code
    }
    END {
      if (bad != "") { print bad; exit 1 }
      if (sends != 1) { print "expected one payout.send() in Pay, found " sends + 0; exit 1 }
      for (line in need) if (need[line] != 1) { print "expected once in Pay, found " need[line] " times:" line; exit 1 }
    }
  ' "$1"
}
if ! why=$(check_pay "$ROOT/fe/src/vault.fe"); then
  echo "FAIL vault.fe: $why"
  exit 1
fi
echo "ok   source check: vault.fe moves money only through the kernel's payout, and Pay asks the kernel with the stored rules, agent and approval and the real caller and time"
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
APPEND=$TRANSFER_IMPORT pay_check_catches 'Pay importing a transfer of its own and paying the caller 1000x' \
  "$PAY" "$SEND" before 'safe_transfer(token, receiver: ctx.caller(), amount: amount * 1000)'
APPEND=$FORGED_CALL pay_check_catches 'Pay paying through a forged Call' \
  "$PAY" "$SEND" before 'steal(token, to: ctx.caller(), amount: amount * 1000)'
# Pay with `mut call` taken out of its uses, paying through the log instead.
NO_CALL=$(mktemp)
edit_handler "$PAY" 'mut call,' replace '' > "$NO_CALL"
SRC=$NO_CALL APPEND=$TRANSFER_IMPORT pay_check_catches 'Pay without mut call, paying the caller 1000x through with (Call = mut log)' \
  "$PAY" "$SEND" before \
  'with (Call = mut log) { safe_transfer(token, receiver: ctx.caller(), amount: amount * 1000) }'
rm -f "$NO_CALL"
pay_check_catches 'Pay bypassing Verdict::Refuse with a catch-all arm' \
  "$PAY" 'Verdict::Pay(payout) => {' replace '_ => {'
pay_check_catches 'Pay rebinding to and amount with a tuple destructuring' \
  "$PAY" "$JUDGE" before 'let (to, amount) = (ctx.caller(), amount * 1000)'

# What the compiler does not stop either: a vault that keeps a second
# stored Terms, Seat or Books, or a second approval map, to put old ones back
# later (Approval is Copy). A source check of vault.fe (comments stripped; it
# reads the text, it is not a compiler guarantee): Terms, Seat and Books are
# named only in the import and their one storage field, Approval only in the
# import, founded and the one map; ledger and seat are assigned only in init,
# from what `open` made; and vault.fe builds no Ledger.
check_state() {
  awk '
    { code = " " $0 " "; sub(/\/\/.*/, " ", code) }
    { terms += gsub(/[^A-Za-z0-9_]Terms[^A-Za-z0-9_]/, "&", code) }
    { approvals += gsub(/[^A-Za-z0-9_]Approval[^A-Za-z0-9_]/, "&", code) }
    { seats += gsub(/[^A-Za-z0-9_]Seat[^A-Za-z0-9_]/, "&", code) }
    { books += gsub(/[^A-Za-z0-9_]Books[^A-Za-z0-9_]/, "&", code) }
    { built += gsub(/[^A-Za-z0-9_]Ledger *\{/, "&", code) }
    code ~ /[^A-Za-z0-9_.](ledger|seat)\.[A-Za-z0-9_]+ *[-+*\/]?= [^=>]/ {
      bad = "ledger or seat field written another way: " $0
    }
    code ~ /[^A-Za-z0-9_.]ledger *= [^=]/ {
      writes++
      if (code !~ /^ +ledger = books_of *$/) bad = "ledger written another way: " $0
    }
    code ~ /[^A-Za-z0-9_.]seat *= [^=]/ {
      seated++
      if (code !~ /^ +seat = seat_of *$/) bad = "seat written another way: " $0
    }
    END {
      if (bad != "") { print bad; exit 1 }
      if (terms != 2) { print "Terms named " terms + 0 " times, expected 2 (the import and the one field)"; exit 1 }
      if (seats != 2 || books != 2) { print "Seat named " seats + 0 " and Books " books + 0 " times, expected 2 each (the import and the one field)"; exit 1 }
      if (approvals != 3) { print "Approval named " approvals + 0 " times, expected 3 (the import, founded, the one map)"; exit 1 }
      if (built != 0 || writes != 1 || seated != 1) { print "Ledger built " built + 0 " times, ledger written " writes + 0 " and seat " seated + 0 " times, expected 0, 1 and 1"; exit 1 }
    }
  ' "$1"
}
if ! why=$(check_state "$ROOT/fe/src/vault.fe"); then
  echo "FAIL vault.fe: $why"
  exit 1
fi
echo "ok   source check: one stored Terms, Seat and Books, one Approval map, each written only in init"
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
state_check_catches 'a second stored Seat, to put an old agent key back later' with_field 'mut spare: Seat,'
state_check_catches 'a second stored Books, to put old spending back later' with_field 'mut spare: Books,'

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
  -e 's/uses (ctx, mut owner, mut seat, mut token, mut terms, mut ledger, mut approved_from)/uses (ctx, mut owner, mut seat, mut token, mut terms, mut backup, mut ledger, mut approved_from)/' \
  -e 's/^        terms = terms_of$/        terms = terms_of\n        backup = terms_of/'
refused_file 'Pause saving the rules aside before pausing' 'cannot move out of storage' 16-0002 \
  -e "$BACKUP_FIELD" \
  -e 's/^        Pause uses (ctx, owner, mut terms, mut log) {$/        Pause uses (ctx, owner, mut terms, mut backup, mut log) {\n            backup = terms/'
refused_file 'CancelQueued putting saved rules back' 'cannot move out of storage' 16-0002 \
  -e "$BACKUP_FIELD" \
  -e 's/^        CancelQueued uses (ctx, owner, mut terms, mut log) {$/        CancelQueued uses (ctx, owner, mut terms, backup, mut log) {\n            terms = backup/'
# The agent's key too: Seat is not Copy and changes in place.
refused_file 'SetAgent saving the old key aside to put it back later' 'cannot move out of storage' 16-0002 \
  -e 's/^    mut seat: Seat,$/    mut seat: Seat,\n    mut spare: Seat,/' \
  -e 's/^        SetAgent { who } uses (ctx, owner, terms, mut seat, mut log) {$/        SetAgent { who } uses (ctx, owner, terms, mut seat, mut spare, mut log) {\n            spare = seat/'

# The vault's whole shape, pinned (comments stripped; CI's fe fmt --check
# fixes the layout this reads). A source check, not a compiler guarantee:
# exactly these imports, no glob import and no type alias, exactly these
# storage fields, exactly these handlers with exactly these uses, no token
# approval or transfer_from anywhere, and every "now" given to the kernel is
# the chain's own time (for the owner's changes the compiler sees to that
# too: the time comes with the owner's proof). A new handler, a new capability on an old one, a
# Terms kept under another name, an allowance granted to the caller, or a
# made-up time all fail here.
SHAPE_HEADS='init(owner_: Address, agent_: Address, token_: Address, per_payment: u256, per_window: u256, valid_until: u64, window_secs: u64, cooling_secs: u64, payee_a: Address, payee_b: Address, payee_c: Address) uses (ctx, mut owner, mut seat, mut token, mut terms, mut ledger, mut approved_from) {
Pay { to, amount, nonce } -> u8 uses (ctx, seat, terms, approved_from, mut ledger, mut call, mut log) {
Preview { caller, to, amount, nonce } -> (u8, u256) uses (ctx, seat, terms, ledger, approved_from) {
Exposure { until } -> u256 uses (ctx, terms, ledger) {
Propose { per_payment, per_window, valid_until, paused } uses (ctx, owner, mut terms, mut log) {
CancelQueued uses (ctx, owner, mut terms, mut log) {
Pause uses (ctx, owner, mut terms, mut log) {
SetRecipient { who, approved } uses (ctx, owner, terms, mut approved_from, mut log) {
Withdraw { amount } uses (ctx, owner, ledger, mut call, mut log) {
SetAgent { who } uses (ctx, owner, terms, mut seat, mut log) {
Owner -> Address uses (owner) {
Agent -> Address uses (ctx, seat) {
NextAgent -> (Address, u64) uses (ctx, seat) {
Token -> Address uses (ledger) {
ScheduleOf -> (u64, u64, u64) uses (terms) {
PolicyOf -> (u256, u256, u64, bool) uses (ctx, terms) {
QueuedOf -> (u256, u256, u64, bool, u64) uses (ctx, terms) {
LedgerOf -> (u64, u256, u64) uses (ledger) {
ApprovedFrom { who } -> u64 uses (approved_from) {'
SHAPE_USES='use std::evm::{Address, Call, Ctx, Evm, Log, StorageMap, revert_error}
use ingot::kernel::{cooled, decide, exposure, left_in_window, Decision, Instant, Ledger, Policy, Reason, Request, Schedule, Seconds}
use ingot::kernel::sealed::{founding, moment, open, prove, withdraw, Approval, Books, Owner, OwnerCall, Seat, Terms, Verdict}'
SHAPE_FIELDS='owner: Owner,
mut seat: Seat,
token: Address,
mut terms: Terms,
mut ledger: Books,
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
  vault_sed 's/^use ingot::kernel::sealed::{$/use ingot::kernel::sealed::*\nuse ingot::kernel::sealed::{/'
shape_check_catches 'a type alias for Terms' vault_sed 's/^pub contract Vault uses/type Kept = Terms\n\npub contract Vault uses/'
shape_check_catches 'Withdraw given the rules to write' \
  vault_sed 's/^        Withdraw { amount } uses (ctx, owner, ledger, mut call, mut log) {$/        Withdraw { amount } uses (ctx, owner, ledger, mut terms, mut call, mut log) {/'
shape_check_catches 'Pay granting the caller an allowance on the token' \
  edit_handler "$PAY" "$SEND" after 'let _ = try_approve(token, spender: ctx.caller(), amount: 1)'
shape_check_catches 'a new handler that moves money with no owner check' \
  vault_sed 's/^        Owner -> Address uses (owner) {$/        Sweep { amount } uses (ctx, token, mut call) {\n            safe_transfer(token, receiver: ctx.caller(), amount)\n        }\n\n        Owner -> Address uses (owner) {/'

# A second Fe judge (2026-11-21) found three edits that compiled, passed
# fe test and every check above: `init` also approving the agent as a
# recipient (it could pay itself), `prove` accepting the transaction's
# origin as the owner (any contract the owner calls could act as the owner),
# and `seconds()` reading the clock a day ahead through a wrapper type. The
# code they changed is now pinned by its sha256, comments and blank lines
# ignored: all of vault.fe (PIN_VAULT, added 2026-11-22), and on its own
# everything in vault.fe outside the contract (helpers, events,
# `seconds`, `founded`), `init`'s body, and all of kernel/sealed.fe. A
# source check, not a compiler guarantee: any change to that code fails here
# until the pin below is updated, so it cannot go in unnoticed.
PIN_PRELUDE=7983df44994504d1458498cd90b5825d29b37dcfc00900d40997e7a82aad3b4b
PIN_INIT=6e8737b66d61097f038a776378c67155a8e9353900ef898ad666034721003662
PIN_VAULT=396a650d64c23b7331d38d0f749bca3f17898431a067a615c12325a1e5359229
PIN_SEALED=a161b7bcd0636745b9158fdf4cdda55907b07206a0a14be7d005bd37980abb27
code_sha() { sed 's#//.*##; s/[ \t]*$//' | grep -v '^$' | sha256sum | cut -d' ' -f1; }
prelude_of() { awk '/^pub contract Vault/ { exit } { print }' "$1"; }
init_of() { awk '/^    init\(/ { on = 1 } on { print } on && /^    }$/ { exit }' "$1"; }
check_pinned() {
  local vault=$1 sealed=$2 got
  got=$(prelude_of "$vault" | code_sha)
  [ "$got" = "$PIN_PRELUDE" ] || { echo "vault.fe outside the contract changed (now $got)"; return 1; }
  got=$(init_of "$vault" | code_sha)
  [ "$got" = "$PIN_INIT" ] || { echo "init changed (now $got)"; return 1; }
  got=$(code_sha < "$vault")
  [ "$got" = "$PIN_VAULT" ] || { echo "vault.fe changed (now $got): an intended edit needs PIN_VAULT updated in this script"; return 1; }
  got=$(code_sha < "$sealed")
  [ "$got" = "$PIN_SEALED" ] || { echo "kernel/sealed.fe changed (now $got)"; return 1; }
}
if ! why=$(check_pinned "$ROOT/fe/src/vault.fe" "$ROOT/fe/src/kernel/sealed.fe"); then
  echo "FAIL $why"
  exit 1
fi
echo "ok   source check: vault.fe, init, prelude, and kernel/sealed.fe match their pinned sha256"
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
pin_check_catches 'Withdraw sending tokens to caller before owner proof' \
  "$(edited_vault 's/withdraw(proof, owner, token, amount)/safe_transfer(token, receiver: ctx.caller(), amount); withdraw(proof, owner, token, amount)/')" \
  "$(copy_of "$SEALED")"
with_postlude=$(mktemp)
cat "$ROOT/fe/src/vault.fe" > "$with_postlude"
printf '%s\n' "$FORGED_CALL" >> "$with_postlude"
pin_check_catches 'forged-Call helper appended after Vault contract' "$with_postlude" "$(copy_of "$SEALED")"

# A third Fe judge pass (2026-11-21) found the launcher unchecked: an edit
# to what `Launch` hands the vault (the agent approved whenever a recipient
# is left blank) compiled and passed fe test and everything above, since the
# vault's own code did not change. launcher.fe is pinned the same way, and
# web/tests/launcher.test.ts reads every rule of a launched vault back.
PIN_LAUNCHER=f4eb71ef31dab7e9d89aa4ae183fd331c99f305a49c00716a4ae6a3970958924
check_launcher() {
  local got
  got=$(code_sha < "$1")
  [ "$got" = "$PIN_LAUNCHER" ] || { echo "launcher.fe changed (now $got)"; return 1; }
}
if ! why=$(check_launcher "$ROOT/fe/src/launcher.fe"); then
  echo "FAIL $why"
  exit 1
fi
echo "ok   source check: launcher.fe matches its pinned sha256"
edited_launcher=$(mktemp)
sed 's/^                        payee_b,$/                        if payee_b == Address::zero() { agent } else { payee_b },/' "$ROOT/fe/src/launcher.fe" > "$edited_launcher"
if check_launcher "$edited_launcher" >/dev/null; then
  rm -f "$edited_launcher"
  echo "FAIL source check missed: the launcher approving the agent when a recipient is left blank"
  exit 1
fi
rm -f "$edited_launcher"
echo "ok   source check catches: the launcher approving the agent when a recipient is left blank"

# A fourth pass (2026-11-21) found kernel.fe unpinned: two one-line edits that
# only act between two dates around today (every test runs at times before
# or after them) let the agent pay past its caps, or let a raise mature after
# one second. Both compiled and passed fe test, the static asserts, the
# differential test (it builds both sides from this same file) and every
# check above. kernel.fe is pinned the same way.
PIN_KERNEL=ae596cdcc855e36374857f36948fb596d0d64b4831b9e94b3a7de1469e5d72ee
check_kernel() {
  local got
  got=$(code_sha < "$1")
  [ "$got" = "$PIN_KERNEL" ] || { echo "kernel.fe changed (now $got)"; return 1; }
}
if ! why=$(check_kernel "$ROOT/fe/src/kernel.fe"); then
  echo "FAIL $why"
  exit 1
fi
echo "ok   source check: kernel.fe matches its pinned sha256"

# kernel/laws.fe makes owner proofs by hand to run `amend` and `cancel` at
# compile time. It must stay a closed room: no `pub` item, so nothing outside
# the kernel can call into it, and all of its grid checks still there.
LAWS=$ROOT/fe/src/kernel/laws.fe
if grep -qE '(^|[^A-Za-z0-9_])pub([^A-Za-z0-9_]|$)' <(sed 's#//.*##' "$LAWS"); then
  echo "FAIL kernel/laws.fe has a pub item"
  exit 1
fi
LAW_ASSERTS=$(grep -c '^static_assert(' "$LAWS")
if [ "$LAW_ASSERTS" -lt 277 ]; then
  echo "FAIL kernel/laws.fe has $LAW_ASSERTS grid checks, expected at least 277"
  exit 1
fi
echo "ok   source check: kernel/laws.fe has no pub item and all $LAW_ASSERTS grid checks"
kernel_check_catches() {
  local name=$1 edited
  shift
  edited=$(mktemp)
  sed "$@" "$ROOT/fe/src/kernel.fe" > "$edited"
  if cmp -s "$edited" "$ROOT/fe/src/kernel.fe" || check_kernel "$edited" >/dev/null; then
    rm -f "$edited"
    echo "FAIL source check missed: $name"
    exit 1
  fi
  rm -f "$edited"
  echo "ok   source check catches: $name"
}
kernel_check_catches 'decide ignoring the caps between two dates around today'   -e 's/^    if request.amount > policy.per_payment {$/    if request.amount > policy.per_payment \&\& !(now.secs > 1790000000 \&\& now.secs < 1800000000) {/'   -e 's/^    if request.amount > left {$/    if request.amount > left \&\& !(now.secs > 1790000000 \&\& now.secs < 1800000000) {/'
kernel_check_catches 'a raise maturing after one second between two dates around today'   -e 's/^    let at = now + schedule.cooling_secs$/    let at = now + if now.secs > 1790000000 \&\& now.secs < 1800000000 { Seconds::of(1) } else { schedule.cooling_secs }/'

# A pin only proves the file changed. The same edits must also make a test
# fail: fe/src/$2 edited by the sed arguments after $3 must compile, and
# fe test must fail with every test named in $3 among the failures.
# Not here: `prove` accepting the transaction's origin, because fe test's
# origin is always the zero address, which can never be an owner. A web test
# on the compiled vault catches it instead (web/tests/vault.test.ts, "the
# vault checks the caller, not the origin"; shown failing on a vault built
# with that edit in docs/EVIDENCE.md). And the forged-Call helper appended
# after the contract: dead code, so the compiled contracts are byte-for-byte
# the same, and CI checks the committed bytecode is what the source compiles to.
test_catches() {
  local name=$1 file=$2 tests=$3 dir t
  shift 3
  dir=$(mktemp -d)
  cp -r "$ROOT/fe" "$dir/"
  rm -rf "$dir/fe/out"
  # Without the grid laws, as in build_vault: these edits act at dates the
  # laws never run at, so the laws pass them either way.
  rm -f "$dir/fe/src/kernel/laws.fe"
  sed -i "$@" "$dir/fe/src/$file"
  if cmp -s "$ROOT/fe/src/$file" "$dir/fe/src/$file"; then
    echo "could not edit $file for: $name"
    rm -rf "$dir"
    exit 2
  fi
  if (cd "$dir/fe" && "$FE" test > "$dir/test.log" 2>&1); then
    echo "FAIL fe test passed: $name"
    rm -rf "$dir"
    exit 1
  fi
  for t in $tests; do
    if grep -q '^error' "$dir/test.log" || ! grep -qE "^FAIL .* $t([^A-Za-z0-9_]|\$)" "$dir/test.log"; then
      echo "FAIL fe test failed for another reason: $name (expected $t to fail)"
      cat "$dir/test.log"
      rm -rf "$dir"
      exit 1
    fi
  done
  rm -rf "$dir"
  echo "ok   test catches: $name ($tests)"
}
test_catches 'init also approving the agent, so it can pay itself' vault.fe \
  only_the_recipients_named_at_creation_are_approved \
  's/^\(            approved_from.set(key: payee_c, value: founded(ctx, who: payee_c))\)$/\1\n            approved_from.set(key: agent_, value: founded(ctx, who: agent_))/'
test_catches 'seconds() reading the clock a day ahead through a wrapper type' vault.fe \
  the_vault_reads_the_chain_clock_to_the_second \
  -e 's/^fn seconds(_ at: Timestamp) -> Instant {$/fn seconds(_ at: Timestamp) -> Instant {\n    let at = Ahead { at }/' \
  -e 's/^const MIN_COOLING_SECS: u64 = 60$/struct Ahead { at: Timestamp }\nimpl Ahead {\n    fn as_seconds(self) -> u256 { self.at.as_seconds() + 86399 }\n}\n\nconst MIN_COOLING_SECS: u64 = 60/'
# The pinned edit above joins two calls with `;`, which Fe does not compile;
# this is the same edit on two lines.
test_catches 'Withdraw also sending the amount to its caller' vault.fe \
  owner_withdraws_to_itself \
  -e 's/^use std::evm::{Address, Call, Ctx, Evm, Log, StorageMap, revert_error}$/&\nuse std::evm::erc20::safe_transfer/' \
  -e 's/^            withdraw(proof, owner, token, amount)$/            safe_transfer(token, receiver: ctx.caller(), amount)\n            withdraw(proof, owner, token, amount)/'
# Fe 26.6 compiles this: a Log stands in for the Call that Pay no longer lists.
test_catches 'Pay without mut call, paying the caller 1000x through with (Call = mut log)' vault.fe \
  allowed_payment_moves_exactly_the_amount \
  -e '/^            mut call,$/d' \
  -e 's/^use std::evm::{Address, Call, Ctx, Evm, Log, StorageMap, revert_error}$/&\nuse std::evm::erc20::safe_transfer/' \
  -e 's/^                    payout.send()$/                    let stolen = ledger.token()\n                    with (Call = mut log) { safe_transfer(token: stolen, receiver: ctx.caller(), amount: amount * 1000) }/'
test_catches 'the launcher approving the agent when a recipient is left blank' launcher.fe \
  only_the_named_recipient_is_approved \
  's/^                        payee_b,$/                        if payee_b == Address::zero() { agent } else { payee_b },/'
test_catches 'decide ignoring the caps between two dates around today' kernel.fe \
  'the_caps_and_the_cooling_period_hold_on_every_day_from_2020_to_2040 the_kernel_survives_the_campaign_at_any_date' \
  -e 's/^    if request.amount > policy.per_payment {$/    if request.amount > policy.per_payment \&\& !(now.secs > 1790000000 \&\& now.secs < 1800000000) {/' \
  -e 's/^    if request.amount > left {$/    if request.amount > left \&\& !(now.secs > 1790000000 \&\& now.secs < 1800000000) {/'
test_catches 'a raise maturing after one second between two dates around today' kernel.fe \
  'the_caps_and_the_cooling_period_hold_on_every_day_from_2020_to_2040 the_kernel_survives_the_campaign_at_any_date' \
  -e 's/^    let at = now + schedule.cooling_secs$/    let at = now + if now.secs > 1790000000 \&\& now.secs < 1800000000 { Seconds::of(1) } else { schedule.cooling_secs }/'

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
  # A broken kernel can also make some grid laws (kernel/laws.fe) run past
  # the compiler's step limit (3-0026). No typo in an edit causes that, so
  # it may appear beside the expected error, never instead of it.
  if ! grep -qF -- "$message" "$dir/build.log" \
    || grep -E '^error\[' "$dir/build.log" | grep -vF "error[3-0026]" | grep -qvF "error[$code]"; then
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

# 8. The grid laws (kernel/laws.fe), added 2026-11-23. The compiler runs
#    `decide` and `exposure` on every policy of a grid, so these edits, which
#    pass every check above, fail the build too ("static assertion failed").
kernel_refused 'decide checking the window cap instead of what is left in it' \
  '^    if request.amount > left {$' '    if request.amount > policy.per_window {'
kernel_refused 'decide ignoring the payment cap' \
  '^    if request.amount > policy.per_payment {$' '    if false {'
kernel_refused 'decide ignoring the end date' \
  '^    if now > policy.valid_until {$' '    if false {'
kernel_refused 'decide ignoring a pause' \
  '^    if policy.paused {$' '    if false {'
kernel_refused 'exposure forgetting the windows after this one' \
  '^    let later_windows: u256 = (last - first) as u256$' '    let later_windows: u256 = 0'
kernel_refused 'exposure ignoring a raise that takes effect in the span' \
  '^    if !cooled(at: queued.effective_at, now: until) {$' '    if true {'
kernel_refused 'decide refusing on the last second the policy is valid' \
  '^    if now > policy.valid_until {$' '    if now >= policy.valid_until {'
# Law 8 (added after a judge's planted bug passed the build): exposure
# answering nothing for a span of no time.
kernel_refused 'exposure answering nothing for a span of no time' \
  '^    if end < start { return 0 }$' '    if end <= start { return 0 }'
