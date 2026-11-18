# HARDSTOP in ChatGPT (developer mode, custom MCP server)

Checked 2026-11-18 against:
- https://developers.openai.com/api/docs/guides/developer-mode
- https://developers.openai.com/api/docs/guides/secure-mcp-tunnels
- https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/

ChatGPT runs in OpenAI's cloud and cannot reach `127.0.0.1`. It supports SSE and streaming HTTP transports, with auth set to OAuth, No authentication, or mixed. Bearer headers are not an option, so use the token-in-path URL.

## 1. Run the server in HTTP mode

```bash
cd /ABSOLUTE/PATH/TO/hardstop/web && npm ci
export HARDSTOP_AGENT_KEY=0xYOUR_AGENT_KEY HARDSTOP_VAULT=0xYOUR_VAULT_ADDRESS HARDSTOP_CHAIN_ID=84532
export HARDSTOP_HTTP_TOKEN=$(openssl rand -hex 32)
node mcp/server.ts --http --port 8787
```

## 2. Get an HTTPS URL

Option A, Cloudflare quick tunnel (no account needed):

```bash
cloudflared tunnel --url http://localhost:8787
```

It prints `https://<random>.trycloudflare.com`. Your server URL is `https://<random>.trycloudflare.com/mcp/<HARDSTOP_HTTP_TOKEN>`. The hostname changes on every run, and Cloudflare gives no uptime guarantee.
Cloudflare states quick tunnels do not support Server-Sent Events. HARDSTOP's HTTP mode does not use them: it is stateless and answers every POST with plain JSON (`enableJsonResponse`), and GET is refused. UNVERIFIED: that ChatGPT itself works through a quick tunnel (not tried; no ChatGPT account was used). If it stalls on tool calls, use option B.

Option B, OpenAI Secure MCP Tunnel (no public URL). Run OpenAI's `tunnel-client` next to the server. It needs a Platform tunnel and the Tunnels Read+Use permissions. Per the guide, it can launch the stdio server directly (`--mcp-command "node /ABSOLUTE/PATH/TO/hardstop/web/mcp/server.ts"`) or point at an HTTP one (`--mcp-server-url`). Then choose **Tunnel** in step 3 instead of a URL.
UNVERIFIED: whether `tunnel-client` passes the shell's `HARDSTOP_*` env to the stdio command.

## 3. Add it in ChatGPT (web)

1. Go to ChatGPT Plugins (chatgpt.com/plugins) and click **+**, then **Add custom MCP server**.
2. Enter the name `HARDSTOP`. Under **Connection**, paste the server URL from step 2 (or select **Tunnel**).
3. Authentication: **No authentication** (the token in the path is the secret).
4. Read the risk warning, select **I understand and want to continue**, then **Create as a plugin**, and install it.

Write actions need confirmation by default, so ChatGPT asks before each `hardstop_pay` unless the tool is annotated `readOnlyHint`.

UNVERIFIED: how to turn developer mode on and which plans have it (help.openai.com returned 403). Third-party guides say Settings > Apps/Connectors > Advanced > Developer mode, on paid plans, with an admin toggle on Business/Enterprise.

## Warning

- The agent key lives on the machine running the server, not in ChatGPT. Keep that machine trusted.
- Anyone with the full URL can call `hardstop_pay` and spend up to the vault's per-payment and per-day limits. Treat the URL as a password.
- The token sits in the URL path, so it can appear in tunnel and proxy logs. Rotate `HARDSTOP_HTTP_TOKEN` and restart when you are done.
- Never use the owner key. The vault limits are the only thing standing between a leaked URL and your funds.
