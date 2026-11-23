# HARDSTOP: limitations

The full list, moved here from the [README](../README.md).

- **Test networks only.** A vault can be opened on Base Sepolia or Sepolia.
  The current launcher, `0xcca9a9e12a1f817299a8c0ac076049e1f901e398`, is installed on Base
  Sepolia (2026-11-21, transactions in the results table); on Sepolia the
  site installs it on first use, which takes one extra wallet approval.
  Earlier launchers stay on Base Sepolia with the vaults opened through them
  (nine, listed in
  [`EVIDENCE_LOG.md`](../EVIDENCE_LOG.md#launchers-on-base-sepolia)). A
  launcher's address follows from its code, so every change to the
  contracts gives a new one. The agent is a trial key kept in the browser;
  a real agent would hold its own key.
- **MetaMask can refuse the owner's transactions after a network switch.**
  A site connected while MetaMask was on Ethereum mainnet and then switched
  to Base Sepolia got error 4100 on every send, though its permissions listed
  both. The site now asks for the account again once and retries; only that
  one case was seen, in Comet (a Chromium browser) on 2026-11-18.
- **MetaMask warns before connecting.** On 2026-11-18 MetaMask's site scanner
  showed "Continue at your own risk" for `hardstop-omega.vercel.app`. The site
  is not on MetaMask's public blocklist (`eth-phishing-detect`); a review has
  to be requested from MetaMask. Until then a visitor has to click past it.
- **One vault, one token, one agent, three recipients at creation.** No Safe
  integration, no calldata rules, no multi-token caps.
- **Open only vaults you launched yourself.** The launcher makes whoever
  calls it the owner, so the founding recipients are the owner's choice. A
  vault someone else deployed with the same code and you as owner can carry
  founding recipients you did not choose. My vaults lists only vaults your
  wallet launched; a vault opened from a link is checked by its code only.
- **Alerts need the watcher running.** The site has no server and sends
  nothing: every page shows a waiting loosening with a cancel button while
  it is open. The optional, self-hosted watcher (`web/mcp/watch.ts`) checks
  the vault around the clock and alerts by phone push (ntfy), webhook or desktop notification,
  but only while someone runs it. Without it, the ratchet only helps an
  owner who looks.
- **Fixed windows.** A full cap can be spent at the end of one window and
  again at the start of the next. `exposure` accounts for it.
- **A stolen owner key is out of scope**, as is a malicious token.
- **Not professionally audited**, and built on a young compiler. An AI
  reviewer attacked it once ([`security/AUDIT.md`](../security/AUDIT.md));
  that is not the same thing.

The full list, with what breaks under each, is in the threat model.
