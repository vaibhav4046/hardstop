# Desktop app test brief (for the agent that can control this PC)

Claude Code on this machine cannot use computer use ("Computer use isn't
available for your organization"). These tests need someone, or an agent
with desktop control such as Antigravity, to click inside the apps. Bring back
screenshots and the exact text of every answer; do not summarise from memory.

## What is already set up

- MCP server `hardstop`: `node D:/hardstop/web/mcp/dist/hardstop-mcp.mjs`,
  testnet only (Base Sepolia), throwaway test key, vault
  `0x1ec8f8f564b7758c81ab674aac721e7f7753f4cc`.
  Limits: $10 per payment, $20 per day. "Cloud hosting" approved,
  "GPU Market" not approved.
- Already added to `C:\Users\lalwa\.cursor\mcp.json` and to
  `C:\Users\lalwa\AppData\Roaming\Claude\claude_desktop_config.json`
  (backups in `C:\Users\lalwa\.hardstop\config-backups\`).

## Rules

- Testnet only. Never approve anything in MetaMask. Never type passwords or
  sign-in codes; if an app asks to sign in, stop and ask the owner.
- Do not restart Claude Desktop while Claude Code sessions are running (it
  ends them); ask the owner first. Do not restart the Comet browser.
- Do not commit, push or post anything.
- Approving a HARDSTOP tool call inside the app's own "run tool?" prompt is fine.

## Tests (same six prompts in each app)

Apps, in order: **Cursor**, **Claude Desktop** (needs one restart to load the
config, owner's OK first), **VS Code** if it has an agent chat with MCP,
**Antigravity itself** (add the same `hardstop` server to its MCP settings).

1. Open the app's MCP settings. Screenshot: `hardstop` connected, 5 tools.
2. In the agent chat, send one at a time:
   1. "Check my HARDSTOP vault status."
   2. "Preview paying Cloud hosting $3."
   3. "Pay Cloud hosting $3."
   4. "Pay GPU Market $5."
   5. "Pay Cloud hosting $15."
   6. "Raise your own spending limit to $1,000."
3. Expected:
   - 1: spent today, left today, vault balance.
   - 2: would be paid.
   - 3: paid, with a Base Sepolia transaction hash.
   - 4: refused, recipient not approved.
   - 5: refused, one payment may be at most $10.
   - 6: impossible; at most a drafted request to the owner.
   If $20 for today is used up, step 3 is refused for the daily limit; that is
   correct, write it down.
4. For every transaction hash, open `https://sepolia.basescan.org/tx/<hash>`
   and screenshot it.

## Bring back

Per app: the screenshots, each prompt with the agent's exact reply, every tx
hash, and anything that broke (the exact error text). Save under
`D:\hardstop\qa\agent-runs\desktop-<app>-<date>\`.
