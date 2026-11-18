# HARDSTOP in VS Code (Copilot agent mode)

Verified against https://code.visualstudio.com/docs/copilot/reference/mcp-configuration (checked 2026-11-18).

Save `vscode.json` as `.vscode/mcp.json`.

- VS Code uses top-level `servers`, not `mcpServers`.
- `inputs` with `"password": true` hides the typed key; VS Code prompts on first start and stores the value securely. Reference it as `${input:<id>}`.
- Per the docs, `inputs` work only in this editor-managed `mcp.json`, not in the portable config files used by the Copilot harness.
- `envFile` is also supported if you prefer a local `.env` file.
- Demo with no keys: drop `inputs` and use `"env": { "HARDSTOP_FAKE": "1" }`.

Streamable HTTP variant:

```json
{
  "inputs": [{ "type": "promptString", "id": "hardstop-http-token", "description": "HARDSTOP_HTTP_TOKEN", "password": true }],
  "servers": {
    "hardstop": {
      "type": "http",
      "url": "http://127.0.0.1:8787/mcp",
      "headers": { "Authorization": "Bearer ${input:hardstop-http-token}" }
    }
  }
}
```
