# Claude Code CLI and the HARDSTOP MCP server

Date: 2026-11-19. Machine: Windows 11, Node v24.22.3. Client: `claude` 2.1.319 (Claude Code).
Server: `node D:/hardstop/web/mcp/server.ts` with `HARDSTOP_FAKE=1` (demo: in-memory network, nothing real).

**Result: partly verified.** Claude Code started the server, connected to it and found all five tools.
No tool was called, because the CLI is not logged in and the model request was refused. Nobody logged in for this run.

`<scratch>` below stands for the temporary directory the run used (not in this repository).

## 1. Login state

```
> claude --version
2.1.319 (Claude Code)
> claude auth status
{
  "loggedIn": false,
  "authMethod": "none",
  "apiProvider": "firstParty",
  ...
}
```

## 2. `claude mcp add` (project scope, in `<scratch>`)

```
> claude mcp add -e HARDSTOP_FAKE=1 --transport stdio --scope project hardstop-demo -- node D:/hardstop/web/mcp/server.ts
Added stdio MCP server hardstop-demo with command: node D:/hardstop/web/mcp/server.ts to project config
File modified: <scratch>\.mcp.json
```

The `.mcp.json` it wrote:

```json
{
  "mcpServers": {
    "hardstop-demo": {
      "type": "stdio",
      "command": "node",
      "args": [
        "D:/hardstop/web/mcp/server.ts"
      ],
      "env": {
        "HARDSTOP_FAKE": "1"
      }
    }
  }
}
```

```
> claude mcp get hardstop-demo
hardstop-demo:
  Scope: Project config (shared via .mcp.json)
  Status: ⏸ Pending approval (run `claude` to approve)
  Type: stdio
  Command: node
  Args: D:/hardstop/web/mcp/server.ts
  Environment:
    HARDSTOP_FAKE=1
```

"Pending approval" is Claude Code's own gate for project-scope servers: a person approves them once in an interactive session.

## 3. Headless run

```
> (prompt on stdin) | claude -p --mcp-config .mcp.json --strict-mcp-config \
    --allowedTools "mcp__hardstop-demo__hardstop_status,mcp__hardstop-demo__hardstop_preview_payment,mcp__hardstop-demo__hardstop_pay,mcp__hardstop-demo__hardstop_recipients" \
    --output-format stream-json --verbose
exit code 1
```

The prompt asked for status, a $4 preview, a $4 payment and a $15 payment to "Cloud hosting".

From the `system` / `init` event of the stream (other fields cut):

```
"mcp_servers": [{"name":"hardstop-demo","status":"connected","source":"dynamic"}]
"tools" (those from this server): ["mcp__hardstop-demo__hardstop_pay","mcp__hardstop-demo__hardstop_preview_payment","mcp__hardstop-demo__hardstop_recipients","mcp__hardstop-demo__hardstop_request_more","mcp__hardstop-demo__hardstop_status"]
"apiKeySource": "none"
"claude_code_version": "2.1.319"
```

Then the only assistant message, and the result (other fields cut):

```
{"type":"assistant","message":{"model":"<synthetic>", ... "content":[{"type":"text","text":"Failed to authenticate: OAuth session expired and could not be refreshed"}]}, ... "error":"authentication_failed","is_api_error_message":true}
{"type":"result", ... "is_error":true,"num_turns":1,"terminal_reason":"api_error","result":"Failed to authenticate: OAuth session expired and could not be refreshed","total_cost_usd":0}
```

Event counts in the stream: 14 `hook_started`, 14 `hook_response` (this machine's own session hooks), 1 `init`, 1 `assistant`, 1 `result`.

## What this shows and what it does not

- Shown: the documented `claude mcp add` line works; Claude Code 2.1.319 launches the server over stdio, completes the MCP handshake (`connected`) and lists the five agent tools, with no owner tool among them.
- Not shown: a model in Claude Code calling the tools. To finish this, log in (`claude` then `/login`) and rerun step 3.
