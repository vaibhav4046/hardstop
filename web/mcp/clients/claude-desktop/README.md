# HARDSTOP in Claude Desktop

Verified against https://modelcontextprotocol.io/docs/develop/connect-local-servers (checked 2026-11-18).

Merge `claude_desktop_config.json` (in this folder) into the `mcpServers` object of:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

Or open it via Claude menu > Settings... > Developer > Edit Config. Fully quit and restart Claude Desktop afterwards.

Notes:
- Paths must be absolute. On Windows escape backslashes in JSON: `"C:\\Users\\you\\hardstop\\web\\mcp\\server.ts"`.
- If `node` is not on the PATH Claude Desktop sees, use the full path to the Node 24+ binary as `command`.
- Demo with no keys: replace `env` with `{ "HARDSTOP_FAKE": "1" }`.
- Logs: `~/Library/Logs/Claude/mcp-server-hardstop.log` (macOS), `%APPDATA%\Claude\logs` (Windows).
