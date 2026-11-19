# HARDSTOP in Hermes Agent (Nous Research)

Checked 2026-11-18 against:
- https://hermes-agent.nousresearch.com/docs/user-guide/features/mcp
- https://hermes-agent.nousresearch.com/docs/reference/mcp-config-reference

Add to `~/.hermes/config.yaml` under the top-level `mcp_servers` key (MCP ships with the standard install):

```yaml
mcp_servers:
  hardstop:
    command: "node"
    args: ["/ABSOLUTE/PATH/TO/hardstop/web/mcp/server.ts"]
    env:
      HARDSTOP_AGENT_KEY: "${HARDSTOP_AGENT_KEY}"   # put the real value in ~/.hermes/.env
      HARDSTOP_VAULT: "0xYOUR_VAULT_ADDRESS"
      HARDSTOP_CHAIN_ID: "84532"
    timeout: 120          # tool-call timeout, seconds (default 300)
    connect_timeout: 60   # default 60
```

Then run `/reload-mcp` in a session.

- Hermes does not pass your shell environment to stdio servers; only the `env` block plus a safe baseline reach the process, so every HARDSTOP variable must be listed.
- `${VAR}` and `${env:VAR}` both expand from the environment; the docs recommend keeping secrets in `~/.hermes/.env`. `~/.hermes/.env` should contain `HARDSTOP_AGENT_KEY=0xYOUR_AGENT_KEY`.
- Optional filter: `tools: { include: [hardstop_status, hardstop_preview_payment] }` gives a read-only agent (`include` wins over `exclude`).
- Demo with no keys: `env: { HARDSTOP_FAKE: "1" }`.
- HTTP variant: `url: "http://127.0.0.1:8787/mcp"` plus `headers: { Authorization: "Bearer ${HARDSTOP_HTTP_TOKEN}" }` instead of `command`/`args`/`env`.

Run 2026-11-19 with Hermes Agent v0.18.2 on Windows, demo server: the nesting above is right. `hermes mcp test hardstop` connected and found the five tools, and a headless `hermes chat -q` session called them. Output: [qa/mcp-clients/hermes-agent.md](../../../qa/mcp-clients/hermes-agent.md).

- On Windows the file is `%LOCALAPPDATA%\hermes\config.yaml`, not `~/.hermes/config.yaml`. `hermes config path` prints the one your install reads.
- `hermes mcp test hardstop` checks the connection without starting a session.
