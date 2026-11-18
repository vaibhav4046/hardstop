# HARDSTOP in Cursor

Verified against https://cursor.com/docs/context/mcp (checked 2026-11-18).

Put `cursor.json` in `.cursor/mcp.json` (this project) or `~/.cursor/mcp.json` (all projects).

- The docs list `"type": "stdio"` as required, though their own examples omit it; it is included here.
- Keep the key out of a committed file by using Cursor's interpolation: `"HARDSTOP_AGENT_KEY": "${env:HARDSTOP_AGENT_KEY}"` (resolved in `command`, `args`, `env`, `url`, `headers`).
- Demo with no keys: `"env": { "HARDSTOP_FAKE": "1" }`.

Streamable HTTP variant (server started with `--http --port 8787`):

```json
{
  "mcpServers": {
    "hardstop": {
      "url": "http://127.0.0.1:8787/mcp",
      "headers": { "Authorization": "Bearer ${env:HARDSTOP_HTTP_TOKEN}" }
    }
  }
}
```
