# HARDSTOP in Windsurf (now Devin Desktop)

Checked 2026-11-18 against:
- https://docs.devin.ai/desktop/cascade/mcp (docs.windsurf.com/windsurf/cascade/mcp now redirects here)
- https://docs.devin.ai/cli/extensibility/mcp/configuration.md

Windsurf has been renamed Devin Desktop. The current official docs list these MCP config files, all with top-level `mcpServers` and stdio fields `command`, `args`, `env`:

- User: `~/.config/devin/mcp_config.json`
- Project: `.devin/mcp_config.json` (committed; do not put a key here)
- Local override: `.devin/mcp_config.local.json` (gitignored)

Merge `windsurf.json` into one of them, then reload MCP servers in the app.

- Secrets can be referenced as `${env:VAR}` or `${file:/path}`, e.g. `"HARDSTOP_AGENT_KEY": "${env:HARDSTOP_AGENT_KEY}"`.
- Demo with no keys: `"env": { "HARDSTOP_FAKE": "1" }`.
- HTTP variant: `{ "url": "http://127.0.0.1:8787/mcp", "transport": "http", "headers": { "Authorization": "Bearer ${env:HARDSTOP_HTTP_TOKEN}" } }`. The docs describe `headers` but show no example of it.

UNVERIFIED: the legacy Windsurf path `~/.codeium/windsurf/mcp_config.json` (with `serverUrl` for remote servers) is not in the current official docs. Third-party guides say older Windsurf builds still read it. On an older Windsurf install, try that path with the same JSON.

UNVERIFIED: the Windows location of the user-level file (the docs show only `~/.config/devin/mcp_config.json`).
