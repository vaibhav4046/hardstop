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

Note: the fetched reference page lost its YAML indentation, so the nesting above is rebuilt from the documented key names. The key names are verified; the exact indentation is not.
