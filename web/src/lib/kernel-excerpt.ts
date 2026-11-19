// Copied verbatim from fe/src/kernel.fe. session.test.ts fails if either
// excerpt stops matching the source.

/** kernel.fe: what counts as loosening. */
export const LOOSENS = `/// Whether \`to\` lets the agent do anything \`from\` does not.
pub const fn loosens(_ from: Policy, to: Policy) -> bool {
    to.per_payment > from.per_payment
        || to.per_window > from.per_window
        || to.valid_until > from.valid_until
        || (from.paused && !to.paused)
}`

/** kernel.fe: how a change to the rules is applied. */
export const AMEND = `/// The owner proposes \`proposed\` at \`now\`.
///
/// Whatever in the proposal is tighter than the policy in force applies
/// immediately. If any part is looser, the whole proposal is queued and
/// takes effect \`cooling_secs\` later; a proposal with nothing looser clears
/// the queue. So a limit can drop in one step but can only rise after the
/// cooling period, and any later tightening cancels a pending rise.
pub const fn amend(_ proof: own OwnerProof, rules: Rules, proposed: Policy, now: Instant) -> Rules {
    let in_force = rules.current(now)
    let active = meet(in_force, proposed)
    let queued = if loosens(active, to: proposed) {
        Queued { policy: proposed, effective_at: matures_at(rules.schedule, now) }
    } else {
        Queued::none()
    }
    Rules { schedule: rules.schedule, active, queued }
}`
