# Cursor as a native MCP client (2026-11-22) — blocked, partial

Goal: drive the HARDSTOP MCP server from inside the real Cursor app (its own
MCP client and agent chat) against the throwaway test vault
`0x1ec8f8f564b7758c81ab674aac721e7f7753f4cc` on Base Sepolia.

Result: Cursor loaded and connected the `hardstop` server with 5 tools (from
Cursor's own logs). The six chat prompts were **not run**. No payments were
made and there are no new tx hashes from this run.

## What was proven

Cursor was launched at 01:19 local time on this machine, with config `C:\Users\lalwa\.cursor\mcp.json`
(server `node D:/hardstop/web/mcp/dist/hardstop-mcp.mjs`). Cursor's own logs
(`%APPDATA%\Cursor\logs\20261122T011930\`):

```
mcp-server-user-hardstop.workbench.log:
  01:20:07.597 [MCPService] createClient: identifier="user-hardstop", serverName="hardstop"
  01:20:24.073 [MCPService] createClient completed for server: user-hardstop, connected=true, statusType=connected
anysphere.cursor-agent-exec (Mcp FileSystem Writer):
  "user-hardstop","sanitizedId":"user-hardstop","toolCount":5
```

So `node` was found and no config fix was needed. Cursor was signed in
(screenshot `cursor-2026-11-22/01-cursor-open-signed-in.png`, Agents window).
There is no screenshot of the MCP settings page: see below.

## Why the chat steps did not run

1. The session had no computer-use tools (`mcp__computer-use__*` were not
   offered, and no enable tool either).
2. Fallback 1: launched Cursor with `--remote-debugging-port=9333` to drive
   its UI over the Chrome DevTools Protocol. The port listened and a
   WebSocket opened, but Cursor answered no CDP command (`Target.getTargets`
   and `Runtime.evaluate` both timed out after 10 s; Playwright
   `connectOverCDP` timed out after 30 s). Cursor appears to block DevTools
   on its windows.
3. Fallback 2: plain Windows screen capture plus mouse/keyboard from
   PowerShell. The first screenshot worked, but Windows refused to bring
   Cursor to the front (`SetForegroundWindow` from a background process), so
   the next two clicks landed on the Claude desktop app, which the owner was
   using at the time. Both clicks hit plain transcript text and changed
   nothing, but driving the shared screen while the owner works is unsafe, so
   this was stopped.

## To finish

Run it either with computer use turned on (Claude desktop app → Settings →
Computer use) in a session that gets the `mcp__computer-use__*` tools, or by
hand in Cursor: Customize → MCPs (screenshot `hardstop`, 5 tools), then in
a new agent chat send the six prompts from `DESKTOP-TEST-BRIEF.md` and approve
only Cursor's own "run tool" prompts. Then read each tx receipt (status 1,
`to` = the vault) before recording it here.
