# Desktop apps: Claude Desktop, Cursor, VS Code, Windsurf, ChatGPT

Date: 2026-11-19. Machine: Windows 11.

**Result: not run in any of these apps.** They are driven by a person through a window; this check was headless.
What was checked instead: whether each app is installed here, whether its config file exists at the documented path,
and whether the repository's config file for it parses and has the documented shape. None of the installed apps' own
config files was changed, and no values were read from them (only key names).

| App | Installed here | Its config file on this machine | Repository config | Run in the app |
|---|---|---|---|---|
| Claude Desktop | Yes (Store package `Claude` 6.6395.1.0) | `%APPDATA%\Claude\claude_desktop_config.json` exists, as documented. It has a top-level `mcpServers` whose one entry has the keys `command` + `args`. | `clients/claude-desktop/claude_desktop_config.json` parses; `mcpServers.hardstop` has `command`, `args`, `env`. Same shape. | No |
| Cursor | Yes (`D:\cursor\Cursor.exe`). The headless `cursor-agent` CLI is not installed. | `~/.cursor/mcp.json` exists, as documented. Top-level `mcpServers`; its two entries have the keys `url`, and `command` + `args`. | `clients/cursor.json` parses; `mcpServers.hardstop` has `type: "stdio"`, `command`, `args`, `env`. Same shape (the existing entries work without `type`, as the note in `cursor.md` says the docs' examples do). | No |
| VS Code / GitHub Copilot | Yes (`%LOCALAPPDATA%\Programs\Microsoft VS Code\Code.exe`) | No user `mcp.json` in `%APPDATA%\Code\User` (nothing to compare with). | `clients/vscode.json` parses; top-level `servers.hardstop` with `type: "stdio"`, `command`, `args`, `env`; both `${input:...}` references (`hardstop-agent-key`, `hardstop-vault`) are defined under `inputs`. | No |
| Windsurf (now Devin Desktop) | Yes, an older Windsurf (`%LOCALAPPDATA%\Programs\Windsurf`, data in `~/.codeium/windsurf`). `windsurf` is not on PATH. | Neither documented file exists: no `~/.codeium/windsurf/mcp_config.json` (legacy path) and no `~/.config/devin/` (current docs). So this machine says nothing about which path the app reads. | `clients/windsurf.json` parses; `mcpServers.hardstop` has `command`, `args`, `env`. | No |
| ChatGPT (developer mode) | Yes (Store package `OpenAI.ChatGPT-Desktop` 1.2026.190.0) | Not applicable: connectors are added in the app's settings, signed in, and need an HTTPS URL. | `clients/chatgpt.md` (steps, no config file). | No. Needs a signed-in ChatGPT account and a public HTTPS tunnel; neither was used. |

## The shape check

Run from `web/mcp` with a short Node script that parses each file and prints the keys of each server entry:

```
clients/claude-desktop/claude_desktop_config.json: parses; top-level "mcpServers" present
   hardstop: command="node" args[0] ends "mcp/server.ts" type=undefined env keys=HARDSTOP_AGENT_KEY+HARDSTOP_VAULT+HARDSTOP_CHAIN_ID OK
clients/cursor.json: parses; top-level "mcpServers" present
   hardstop: command="node" args[0] ends "mcp/server.ts" type="stdio" env keys=HARDSTOP_AGENT_KEY+HARDSTOP_VAULT+HARDSTOP_CHAIN_ID OK
clients/vscode.json: parses; top-level "servers" present
   hardstop: command="node" args[0] ends "mcp/server.ts" type="stdio" env keys=HARDSTOP_AGENT_KEY+HARDSTOP_VAULT+HARDSTOP_CHAIN_ID OK
clients/windsurf.json: parses; top-level "mcpServers" present
   hardstop: command="node" args[0] ends "mcp/server.ts" type=undefined env keys=HARDSTOP_AGENT_KEY+HARDSTOP_VAULT+HARDSTOP_CHAIN_ID OK
example.mcp.json: parses; top-level "mcpServers" present
   hardstop: command="node" args[0] ends "mcp/server.ts" type="stdio" env keys=HARDSTOP_AGENT_KEY+HARDSTOP_VAULT+HARDSTOP_CHAIN_ID+HARDSTOP_RECIPIENTS OK
   hardstop-demo: command="node" args[0] ends "mcp/server.ts" type="stdio" env keys=HARDSTOP_FAKE OK
```

The installed apps' own files, key names only:

```
%APPDATA%\Claude\claude_desktop_config.json
  top keys: mcpServers,coworkUserFilesPath,preferences
  mcpServers: 1 entries; entry key sets: args+command
~/.cursor/mcp.json
  top keys: mcpServers
  mcpServers: 2 entries; entry key sets: url | args+command
```

## To finish any of these rows

Copy the repository config into the app's file with `"env": { "HARDSTOP_FAKE": "1" }` and the real path to `server.ts`,
restart the app, and ask it for the HARDSTOP status. That needs a person at the window.

## Other programs on this machine

- **Ollama** (0.40.4) is installed. It runs models; it is not an MCP client and cannot connect to an MCP server by itself. It was used here only as the local model behind the Python frameworks, Hermes Agent and OpenCode.
- **aider** (0.86.2) is installed. Its `--help` lists no MCP option, so it was not tried.
- `codex`, `gemini`, `cursor-agent`, `goose`, `qwen` and `windsurf` are not on PATH.
