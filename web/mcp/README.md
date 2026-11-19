# HARDSTOP for AI assistants (MCP)

This folder makes any AI assistant that speaks the Model Context Protocol an agent of a HARDSTOP vault. Claude Code, Claude Desktop, ChatGPT, Cursor, VS Code and Python agent frameworks all work. The assistant can check its limits, preview a payment, pay, and ask its owner for more. It cannot do anything else.

- `server.ts`: the MCP server, over stdio (default) or Streamable HTTP (`--http`).
- `watch.ts`: a 24/7 watcher for the owner, which reads the vault and raises alerts.
- `vault.ts`: what both share. It reads the configuration, holds the JSON-RPC connection, and reaches the vault through the web app's own code (`src/lib/live`, `src/lib/hardstop/sim.ts`).
- `http.ts`: the HTTP mode.
- `demo.ts`: `HARDSTOP_FAKE=1`, an in-memory network with a freshly launched vault.
- `clients/`: ready-to-copy configurations for each client.
- `example.mcp.json`: a Claude Code project file with placeholders.

The contract decides every payment. Nothing in this folder restates a rule. Payments, previews and limits are what the vault answers, and the sentences come from `src/lib/describe.ts` and `src/lib/hardstop/reasons.ts`.

## Why there are no owner tools

The point of HARDSTOP is that the agent cannot loosen its own leash. The vault has owner powers: propose new limits, cancel a waiting change, pause, approve or remove recipients, and withdraw. Every one of them needs the owner's key. This server never holds the owner's key, never asks for it, and offers no tool for any owner power. The JSON-RPC connection it uses refuses `eth_sendTransaction` and wallet requests outright. The only thing it sends is a payment request signed with the agent's own key.

An agent that wants more room calls `hardstop_request_more`. That tool drafts a message for the owner, with a link to https://hardstop-omega.vercel.app/activity, and changes nothing. If the owner agrees, they propose the change from their own wallet. Looser rules then wait out the vault's cooling period, during which the owner can still cancel.

## Setup

You need Node 24 or later, and `npm ci` run once in `web/`. The server runs as TypeScript directly, with no build step.

| Variable | |
|---|---|
| `HARDSTOP_AGENT_KEY` | The agent's private key, hex. **Never the owner's key.** The server needs it; the watcher does not. |
| `HARDSTOP_VAULT` | The vault address. The server and the watcher check its code before trusting anything it answers: the runtime code, minus the 128 bytes the constructor fills in (owner, agent, token, schedule), must hash to a vault build a HARDSTOP launcher deployed. Those are listed in `KNOWN_VAULT_CODE` in `vault.ts`, the current build first, then earlier builds that answer the same functions and events; each entry names the launcher it came from. Anything else is refused with a plain message. |
| `HARDSTOP_CHAIN_ID` | `84532` (Base Sepolia, default) or `11155111` (Sepolia). Any other chain is refused. |
| `HARDSTOP_RPC` | Optional. Defaults to the network's public endpoint. The server checks that the RPC is on the chain you named. |
| `HARDSTOP_RECIPIENTS` | Optional. `name=0x...,name2=0x...` lets the assistant say "pay Cloud hosting". |
| `HARDSTOP_HTTP_TOKEN` | HTTP mode only. At least 32 characters. Required before the server is reachable from anywhere but localhost: without it, `--host` other than `127.0.0.1`, `::1` or `localhost` is refused at start. |
| `HARDSTOP_FAKE=1` | Demo: an in-memory network and vault. No other settings are needed. |

**Finding your agent key and vault.** A vault opened on the site keeps them in that browser. On your vault's page, open Connect your AI: it has this vault's setup for each client, filled in and ready to copy, and the agent key behind "Show agent key".

The key is never logged, never echoed in an error, and never passed to child processes. A configuration problem comes back to the assistant as one plain sentence that names the variable to fix.

## Install

| Client | Transport | Config | Verified |
|---|---|---|---|
| Claude Code | stdio or HTTP | `claude mcp add ...` ([clients/claude-code/](clients/claude-code/README.md)), or [example.mcp.json](example.mcp.json) | **Partly.** `claude mcp add --scope project` was run and wrote the expected `.mcp.json`. `claude mcp get` parsed both it and `example.mcp.json`. A session using the tools was not run, because the CLI's login had expired. |
| Claude Desktop | stdio | [clients/claude-desktop/](clients/claude-desktop/claude_desktop_config.json) | **Docs only** ([modelcontextprotocol.io](https://modelcontextprotocol.io/docs/develop/connect-local-servers)). Not loaded in the app. |
| ChatGPT (developer mode) | Streamable HTTP over HTTPS | [clients/chatgpt.md](clients/chatgpt.md) | **Partly.** The HTTP mode is tested with the SDK client, token in header or path. Steps follow the OpenAI docs. Not tried in ChatGPT. Enabling developer mode is unverified (help page returned 403). |
| Cursor | stdio (HTTP variant) | [clients/cursor.json](clients/cursor.json) as `.cursor/mcp.json` | **Docs only** ([cursor.com](https://cursor.com/docs/context/mcp)). |
| VS Code / GitHub Copilot | stdio (HTTP variant) | [clients/vscode.json](clients/vscode.json) as `.vscode/mcp.json` | **Docs only** ([code.visualstudio.com](https://code.visualstudio.com/docs/copilot/reference/mcp-configuration)). |
| Windsurf (now Devin Desktop) | stdio (HTTP variant) | [clients/windsurf.json](clients/windsurf.json) | **Partly, docs only.** The current Devin paths are documented. The legacy `~/.codeium/windsurf/mcp_config.json` path is unverified. |
| Hermes Agent (Nous Research) | stdio (HTTP variant) | [clients/hermes-agent.md](clients/hermes-agent.md), `~/.hermes/config.yaml` | **Docs only.** The key names are confirmed. The YAML nesting was rebuilt from a page that lost its indentation. |
| Python, official `mcp` SDK (2.3.0) | stdio | [clients/python/harness.py](clients/python/harness.py) | **Yes.** `uv run --with mcp python web/mcp/clients/python/harness.py` lists the tools, checks there are no owner tools, reads status and previews a payment, against the demo server. |
| OpenAI Agents SDK, LangChain/LangGraph, Pydantic AI | stdio | [clients/python/README.md](clients/python/README.md) | **Docs only.** Snippets were not run. The notes mark which APIs are deprecated or unverified. |
| Any MCP client (TypeScript SDK) | stdio and HTTP | `node mcp/server.ts` / `--http` | **Yes.** `tests/mcp-transports.test.ts` drives a child process over stdio and over Streamable HTTP through every tool. |

**Claude Code** (stdio, user scope):

```bash
claude mcp add \
  --env HARDSTOP_AGENT_KEY=0xYOUR_AGENT_KEY \
  --env HARDSTOP_VAULT=0xYOUR_VAULT_ADDRESS \
  --env HARDSTOP_CHAIN_ID=84532 \
  --transport stdio --scope user \
  hardstop -- node /ABSOLUTE/PATH/TO/hardstop/web/mcp/server.ts
```

**Claude Desktop** (`claude_desktop_config.json`; on Windows, `%APPDATA%\Claude\claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "hardstop": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/hardstop/web/mcp/server.ts"],
      "env": { "HARDSTOP_AGENT_KEY": "0xYOUR_AGENT_KEY", "HARDSTOP_VAULT": "0xYOUR_VAULT_ADDRESS", "HARDSTOP_CHAIN_ID": "84532" }
    }
  }
}
```

**ChatGPT and other remote clients.** ChatGPT connects to MCP servers over HTTPS, so it cannot start a local process. Run the HTTP mode with a token and put an HTTPS tunnel in front of it. [clients/chatgpt.md](clients/chatgpt.md) has the steps.

```bash
HARDSTOP_HTTP_TOKEN=$(openssl rand -hex 32) node mcp/server.ts --http --port 8787
cloudflared tunnel --url http://localhost:8787
# server URL in ChatGPT: https://<random>.trycloudflare.com/mcp/<HARDSTOP_HTTP_TOKEN>
```

In HTTP mode, the agent key lives on whatever machine runs the server, and anyone with the full URL can spend inside the vault's limits. Without a token, the server answers only requests from this machine addressed to localhost, and refuses browser requests from other origins, which also blocks DNS-rebinding pages. The HTTP mode is stateless and replies with plain JSON, not a stream.

**Try it with no setup:** `HARDSTOP_FAKE=1 node mcp/server.ts`. This starts an in-memory network with a launched vault ($10 per payment, $20 a day, one recipient called "Cloud hosting").

## Tools

Each tool returns a plain-language answer first, then the same facts as JSON (`structuredContent`, also repeated as a text block for older clients).

| Tool | What it does |
|---|---|
| `hardstop_status` | Shows the limits in force (per payment, per window, end date, paused), what has been spent and what is left in the current window, when it resets, the vault's balance, the agent's ETH for network fees, any waiting change and when it takes effect, and the worst case over the next window, from the contract's `exposure`. Changes nothing. |
| `hardstop_preview_payment { to, amount_usd }` | Shows what the vault would answer right now. Sends nothing and costs nothing. |
| `hardstop_pay { to, amount_usd, nonce? }` | Sends `pay` signed with the agent's key. The nonce defaults to the ledger's next number. Returns `result` `paid` or `refused` with the reason in plain words, what is left in the window, and an explorer link. A refusal is recorded on chain too, so the owner sees it, and it costs a small fee. `reverted` means the payment was sent and mined but undone (the vault changed between the check and inclusion, for example the owner withdrew): nothing was paid, and the link shows it. `not_sent` means no transaction left the server. Payments are sent one at a time. |
| `hardstop_recipients` | Lists the recipients named in `HARDSTOP_RECIPIENTS`, each checked with `approvedFrom` on chain: approved, approved from a later time, or not approved. |
| `hardstop_request_more { reason, per_payment_usd?, per_day_usd? }` | Drafts a request to the owner, with the current limits, the ask, the reason and the link to the Activity page. Sends nothing and changes nothing. |
| resource `hardstop://status` | The same text as `hardstop_status`. |

`to` takes an address, or the name of a recipient from `HARDSTOP_RECIPIENTS`. Amounts are dollars with at most two decimals, such as `4` or `"12.50"`.

**The spending window.** A vault can be launched with any window length, given in the status as `window_secs`. The words follow it: "per day" and "today" only when it is 86,400 seconds, otherwise "per 1 hour", "per window of 90 seconds", "in this window". The JSON names are kept from when every window was a day, and mean the window: `per_day_usd` is the limit per window, `spent_today_usd` and `left_today_usd` are for the current window, `day_resets_at` is when it ends, and `worst_case_24h_usd` is the worst case over the next `window_secs` seconds.

## The watcher

`watch.ts` is for the owner. It only reads, so it needs the vault address and a network but no key at all. If `HARDSTOP_AGENT_KEY` is set in its environment, it ignores it. It checks the vault every `HARDSTOP_WATCH_SECS` seconds (default 30) and reports:

- **a loosening waiting out its cooling period** (`loosening_waiting`): what it would allow, when it takes effect, and the worst case one window after that. If the owner did not ask for it, this is the moment to cancel. Later it reports `loosening_in_force` or `loosening_cancelled`.
- **a loosening proposed and withdrawn between two checks** (`loosening_withdrawn`, with `ended_by` `cancelled` or `replaced`), read from the vault's `PolicyProposed` and `QueueCancelled` events. Nothing changed, but only the owner's key can do this; if the owner did not, treat that key as compromised. A loosening that took effect before any check saw it waiting is reported as `loosening_in_force` with `unseen: true` (this needs an outage longer than the cooling period; see below).
- **every payment and refusal** (`paid`, `refused`), read from the vault's own `Paid` and `Blocked` events with `eth_getLogs`, with the transaction link and the reason in plain words.
- **a pause, a resume or a stricter rule** (`paused`, `resumed`, `rules_changed`), **recipients added or removed** (`recipient_approved`, `recipient_removed`), and **withdrawals** (`withdrawn`).
- **the end date** coming (`ending_soon`, three days before) and passing (`expired`). Each is reported once.

Each alert is one line of JSON on stdout. It also goes as a POST to `HARDSTOP_ALERT_WEBHOOK` if that is set, and to a desktop notification if `HARDSTOP_DESKTOP_NOTIFY=1` (Windows toast, macOS `osascript`, Linux `notify-send`). If the network fails, the watcher says so once (`watch_error`), retries with doubling waits up to 10 minutes or half the cooling period, whichever is shorter, and says when it recovers (`watch_recovered`). SIGINT and SIGTERM stop it cleanly.

**The check interval must fit the vault.** A looser rule takes effect one cooling period after it is proposed, and a vault may have a cooling period as short as 60 seconds. At start the watcher reads the vault's cooling period and refuses to run if `HARDSTOP_WATCH_SECS` is more than half of it, saying what to set. `HARDSTOP_WATCH_UNSAFE=1` runs anyway; this is **unsafe**: a loosening can then take effect before you are warned. The watcher also refuses, and stops instead of retrying, at an address that is not a known vault build.

```bash
cd web
HARDSTOP_VAULT=0xYOUR_VAULT_ADDRESS HARDSTOP_CHAIN_ID=84532 \
HARDSTOP_ALERT_WEBHOOK=https://example.com/your-hook \
node mcp/watch.ts >> hardstop-alerts.jsonl
```

**Running it 24/7.** Any process supervisor will do. With systemd:

```ini
# /etc/systemd/system/hardstop-watch.service
[Service]
WorkingDirectory=/ABSOLUTE/PATH/TO/hardstop/web
Environment=HARDSTOP_VAULT=0xYOUR_VAULT_ADDRESS HARDSTOP_CHAIN_ID=84532
Environment=HARDSTOP_ALERT_WEBHOOK=https://example.com/your-hook
ExecStart=/usr/bin/node mcp/watch.ts
Restart=always

[Install]
WantedBy=multi-user.target
```

Then run `systemctl enable --now hardstop-watch`. pm2 works too: `pm2 start "node mcp/watch.ts" --name hardstop-watch`. The webhook receives each alert as the JSON body. Point it at anything that takes JSON (a Slack or Discord relay, ntfy, your own endpoint).

## Limits

- **Test networks only.** Base Sepolia and Sepolia. The dollars are a test token with no value.
- **The agent key is a real key.** Whoever holds it can spend inside the vault's limits, which is all HARDSTOP promises. Keep it out of repositories and shared configs. Use `${VAR}` expansion (Claude Code, Cursor) or a secret prompt (VS Code `inputs`).
- **Refusals cost gas.** A refused `hardstop_pay` is still a transaction, so the owner can see it. Use `hardstop_preview_payment` when unsure. The agent's ETH for fees comes from the launch, about 34 payments on Base Sepolia.
- **Recipients by name** are only the ones you list in `HARDSTOP_RECIPIENTS`. The server does not scan the chain for every approved address.
- **The watcher polls.** It sees a waiting change within one interval, not instantly. A change made and undone between two checks is still reported, from the events. It reads at most 1,000 blocks of events per check, and catches up over several checks after an outage. It starts from the current block, so it does not replay history.
- **Desktop notifications are best effort.** They were not tested on macOS or Linux.
- **HTTP mode has one shared secret**, not per-user OAuth. Use it behind a tunnel you control.
