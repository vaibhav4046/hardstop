# HARDSTOP in Claude Code

Verified against https://code.claude.com/docs/en/mcp (checked 2026-11-18).

Prereq: Node 24+, then `npm ci` in `web/`.

## stdio (recommended)

```bash
claude mcp add \
  --env HARDSTOP_AGENT_KEY=0xYOUR_AGENT_KEY \
  --env HARDSTOP_VAULT=0xYOUR_VAULT_ADDRESS \
  --env HARDSTOP_CHAIN_ID=84532 \
  --transport stdio --scope user \
  hardstop -- node /ABSOLUTE/PATH/TO/hardstop/web/mcp/server.ts
```

Ordering rules from the docs:
- Claude's own options (`--env`/`-e`, `--transport`, `--scope`/`-s`) go before the server name.
- Keep another option (here `--transport stdio`) between the last `--env` and the name, or the CLI reads the name as another `KEY=value` pair.
- Everything after `--` is the server command, passed through untouched.

`--scope`: `local` (default, you in this project), `project` (shared via `.mcp.json`; do not commit a key there), `user` (you, all projects).

Optional: `--env HARDSTOP_RPC=https://...`, `--env HARDSTOP_RECIPIENTS=alice=0x...,bob=0x...`.

Demo, no keys needed:

```bash
claude mcp add -e HARDSTOP_FAKE=1 --transport stdio hardstop-demo -- node /ABSOLUTE/PATH/TO/hardstop/web/mcp/server.ts
```

## Streamable HTTP

Start the server yourself (`HARDSTOP_HTTP_TOKEN=... node web/mcp/server.ts --http --port 8787`), then:

```bash
claude mcp add --transport http hardstop http://127.0.0.1:8787/mcp \
  --header "Authorization: Bearer YOUR_HTTP_TOKEN"
```

Check with `claude mcp list`, or `/mcp` inside a session.
