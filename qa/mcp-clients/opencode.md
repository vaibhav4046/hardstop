# OpenCode and the HARDSTOP MCP server

Date: 2026-11-19. Machine: Windows 11, Node v24.22.3. Client: `opencode` 1.18.11, already installed here.
Server: demo mode (`HARDSTOP_FAKE=1`, in-memory network, nothing real), started by OpenCode over stdio.

OpenCode is not one of the clients the MCP README documents; it was tried because it is installed and runs headless.

**Result: verified for the tool calls, with a local model; the run itself did not finish.** `opencode mcp list` reported the server connected, and a headless
`opencode run` called `hardstop_status`, `hardstop_preview_payment`, `hardstop_pay` ($4, paid) and `hardstop_pay` ($15, refused by the vault);
all four calls completed with the vault's answers. The run was then stopped by its 560-second time limit (exit code 124) before the
local model wrote its closing summary, so there is no final text.

What drove it: the model was **`qwen3.5:9b` running locally in Ollama 0.40.4**, through OpenCode's `@ai-sdk/openai-compatible` provider.
Not exercised: a hosted model, the HTTP (`"type": "remote"`) variant.

The run used its own config, data and state directories (`XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME` under `<scratch>\opencode`),
so the machine's own OpenCode configuration and logins were neither read nor changed. OpenCode's built-in tools were switched off to keep
the prompt small for the local model (Ollama ran it with an 8,192-token window).

## 1. Config (`<scratch>\opencode\opencode.json`)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "model": "ollama/qwen3.5:9b",
  "autoupdate": false,
  "share": "disabled",
  "provider": {
    "ollama": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Ollama (local)",
      "options": {
        "baseURL": "http://localhost:11434/v1"
      },
      "models": {
        "qwen3.5:9b": {
          "name": "qwen3.5 9b (local)",
          "tool_call": true
        },
        "qwen3.5:0.8b": {
          "name": "qwen3.5 0.8b (local, titles only)"
        }
      }
    }
  },
  "mcp": {
    "hardstop": {
      "type": "local",
      "command": [
        "node",
        "D:/hardstop/web/mcp/server.ts"
      ],
      "environment": {
        "HARDSTOP_FAKE": "1"
      },
      "enabled": true
    }
  },
  "tools": {
    "bash": false,
    "edit": false,
    "write": false,
    "read": false,
    "grep": false,
    "glob": false,
    "list": false,
    "webfetch": false,
    "websearch": false,
    "task": false,
    "todowrite": false,
    "todoread": false,
    "patch": false,
    "skill": false
  },
  "small_model": "ollama/qwen3.5:0.8b"
}
```

## 2. `opencode mcp list` (no model)

```

┌  MCP Servers
│
●  ✓ hardstop connected
│      node D:/hardstop/web/mcp/server.ts
│
└  1 server(s)
```

## 3. Headless run

```
> opencode run --format json "Do these four steps in order, each with one tool call, using the hardstop tools: 1. Call hardstop_status. 2. Call hardstop_preview_payment with to="Cloud hosting" and amount_usd=4. 3. Call hardstop_pay with to="Cloud hosting" and amount_usd=4. 4. Call hardstop_pay with to="Cloud hosting" and amount_usd=15 (over the limit; send it anyway so the refusal is shown). Then say in one line each what every tool answered."
exit=124   (stopped by `timeout 560` after the fourth tool call)
```

### Tool calls, answers and text, from the JSON events (each answer cut at 700 characters)

OpenCode names the tools `hardstop_<tool>` after the server's name, so they appear as `hardstop_hardstop_status` and so on.

```

MODEL CALLED hardstop_hardstop_status {}  [completed]
TOOL ANSWERED: HARDSTOP vault 0x4cd27af3a303bce3d0d3ba309791dea45045cd00 on in-memory demo network (HARDSTOP_FAKE=1, nothing is real) (a test network: its dollars have no value).
Rules in force: up to $10.00 per payment and $20.00 per day, until 19 Dec 2026, 16:57.
Today: $0.00 spent, $20.00 left. The day resets 20 Nov 2026, 16:57.
The vault holds $100.00. The agent has 0.00003 ETH left for network fees.
No change to the rules is waiting.
Worst case over the next 24 hours, by the contract's own arithmetic: $40.00. This span can cross the day's reset, so it can include part of the next day's allowance.
Next request number: 0.

{
  "vault": "0x4cd27af3a303bce3d0d3ba309791dea45045cd00",
  "agent": "0x54bec828

MODEL CALLED hardstop_hardstop_preview_payment {"to":"Cloud hosting","amount_usd":4}  [completed]
TOOL ANSWERED: Would be paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today. Nothing was sent.

{
  "would_pay": true,
  "reason": "Allowed",
  "explanation": "Inside every limit. $16.00 left today.",
  "to": "0x0000000000000000000000000000000000005109",
  "amount_usd": "4.00",
  "nonce": "0"
}

MODEL CALLED hardstop_hardstop_pay {"to":"Cloud hosting","amount_usd":4}  [completed]
TOOL ANSWERED: Paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today.
Left today: $16.00.
Recorded on the in-memory demo network, which no explorer can show.

{
  "paid": true,
  "result": "paid",
  "reason": "Allowed",
  "explanation": "Inside every limit. $16.00 left today.",
  "to": "0x0000000000000000000000000000000000005109",
  "amount_usd": "4.00",
  "nonce": "0",
  "left_today_usd": "16.00",
  "transaction": "0xda39037d4967f01e39de0099cb02040d94c4a3261d526dcb0cb45585a4089402",
  "explorer": null
}

MODEL CALLED hardstop_hardstop_pay {"to":"Cloud hosting","amount_usd":15,"nonce":1}  [completed]
TOOL ANSWERED: Refused: $15.00 to Cloud hosting. One payment may be at most $10.00.
Left today: $16.00.
Recorded on the in-memory demo network, which no explorer can show.

{
  "paid": false,
  "result": "refused",
  "reason": "OverPaymentLimit",
  "explanation": "One payment may be at most $10.00.",
  "to": "0x0000000000000000000000000000000000005109",
  "amount_usd": "15.00",
  "nonce": "1",
  "left_today_usd": "16.00",
  "transaction": "0xcf4717e78e470b7169573c669fd45585a2737a82352c43472b90d9dc20086c29",
  "explorer": null
}
```

## The first attempt, which produced nothing

The first run had no `small_model` in the config. OpenCode asked the 9b model for a session title first; that request generated
more than 2,400 tokens at about 7 tokens a second and held Ollama's only slot, so the real request never started and the run was
stopped by its 540-second limit with empty output. Adding `"small_model": "ollama/qwen3.5:0.8b"` for titles fixed it. This is
about the local model set-up, not about HARDSTOP.

Also seen: with only `XDG_CONFIG_HOME` redirected, `opencode mcp list` failed against this machine's existing OpenCode data
directory with `Error: Unexpected error` / `Database is not empty and has no session table`. That data directory was left as it was.
