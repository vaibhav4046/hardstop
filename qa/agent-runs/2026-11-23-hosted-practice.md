# The public practice server, driven by an MCP client (2026-11-23)

`https://hardstop-omega.vercel.app/mcp` (and `/mcp/tricked`) is the
HARDSTOP MCP server on the site itself: each MCP session gets its own
practice vault, the compiled Fe contracts on the in-memory demo network.
Nothing is real and no key is read.

**Client.** The official MCP TypeScript SDK (`Client` with
`StreamableHTTPClientTransport`), against production, after deploying
commit `4963667`. Not an AI assistant: the Claude Code CLI's sign-in had
expired on this machine, and Cursor's agent CLI reached the server but a
hook in the local Cursor settings blocked every tool call.

**One problem found and fixed first.** Before `4963667`, a session's second
request sometimes reached another server instance, which did not hold the
vault, and the client got `404`. The server is now stateless at the MCP
layer and issues its own session ids; an instance that does not hold a
session opens a new practice vault under the same id, so the session
carries on (with a reset vault) instead of failing. A test drives one
session across two server copies (`web/tests/practice.test.ts`).

**The run** (first line of each reply, cut where marked):

```
=== https://hardstop-omega.vercel.app/mcp
hardstop_status {}
  🛡️ HARDSTOP vault 0x85b56456d8a88cd5f01802d8367fb6000d40313c on public practice server (an in-memory vault for this session only; nothing is real, and it may reset) ...
hardstop_pay {"to":"Cloud hosting","amount_usd":"4"}
  ✅ Paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today.
hardstop_pay {"to":"Cloud hosting","amount_usd":"500"}
  ⛔ Refused: $500.00 to Cloud hosting. One payment may be at most $10.00.
hardstop_status {}
  🛡️ HARDSTOP vault 0x85b56456d8a88cd5f01802d8367fb6000d40313c ... [████░░░…] $4.00 of $20.00 used today.
=== https://hardstop-omega.vercel.app/mcp/tricked
hardstop_status {}
  🛡️ HARDSTOP vault 0x28b8eb0bf10c6a2d8ec6cfb09981f3e01aea406f ...
hardstop_pay {"to":"Cloud hosting","amount_usd":"4"}
  ✅ Paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today.
hardstop_pay {"to":"Cloud hosting","amount_usd":"500"}
  ⛔ Refused: $500.00 to Cloud hosting. One payment may be at most $10.00.
hardstop_status {}
  🛡️ HARDSTOP vault 0x28b8eb0bf10c6a2d8ec6cfb09981f3e01aea406f ... $4.00 of $20.00 used today.
```

The same vault answered all four calls of each session. `/mcp/tricked`
starts with the owner's $1,000 raise waiting, and the agent's $500 is still
refused. The post-deploy live check (`web/e2e/live-check.mjs`) drives both
endpoints on every deploy.
