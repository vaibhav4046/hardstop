// A moving picture of the one path money can take: agent, vault, recipient.
// A request inside the rules passes; one outside them stops at the vault.
// It is an illustration on a loop, not a feed of anything that happened, and
// the caption says so. The drawing is hidden from screen readers; the caption
// carries the meaning. Styles and timing are in styles/flow.css.

export function Flow() {
  return (
    <figure className="flow">
      <div className="flow-stage" aria-hidden="true">
        <div className="flow-node">Your agent</div>
        <div className="flow-track">
          <span className="flow-token flow-pass">$4</span>
          <span className="flow-token flow-refused">$80</span>
        </div>
        <div className="flow-node flow-vault">
          Vault
          <span className="flow-bar" />
        </div>
        <div className="flow-track">
          <span className="flow-token flow-pass flow-onward">$4</span>
        </div>
        <div className="flow-node flow-payee">Recipient you approved</div>
      </div>
      <figcaption className="small soft mt-4">
        Illustration, with the example limit of $10.00 per payment. A request inside the rules passes through the vault
        to a recipient you approved. A request outside them stops at the vault, and nothing moves.
      </figcaption>
    </figure>
  )
}
