# HARDSTOP from Python agents

Checked 2026-11-18. Runnable end-to-end harness: `harness.py` in this folder.

```bash
uv run --with mcp python web/mcp/clients/python/harness.py
```

All snippets launch the server over stdio. Put this at the top of each one:

```python
SERVER = "/ABSOLUTE/PATH/TO/hardstop/web/mcp/server.ts"
ENV = {"HARDSTOP_FAKE": "1"}  # demo; real: HARDSTOP_AGENT_KEY, HARDSTOP_VAULT, HARDSTOP_CHAIN_ID
```

Pass every `HARDSTOP_*` variable explicitly. The MCP SDK, FastMCP and Hermes give stdio children only a small allowlisted environment, with `env` merged on top.

## Official `mcp` SDK

Docs: https://py.sdk.modelcontextprotocol.io/client/transports/ and https://py.sdk.modelcontextprotocol.io/v2/migration/. PyPI `mcp` is at 2.3.0, the v2 line.

```python
import asyncio
from mcp import Client, StdioServerParameters

async def main():
    params = StdioServerParameters(command="node", args=[SERVER], env=ENV)
    async with Client(params) as client:
        print([t.name for t in (await client.list_tools()).tools])
        res = await client.call_tool("hardstop_status", {})
        print(res.structured_content)  # v2 is snake_case (v1: structuredContent)

asyncio.run(main())
```

The v1 low-level pattern still exists in v2: `async with stdio_client(params) as (read, write)`, then `async with ClientSession(read, write) as s: await s.initialize()`, from `mcp.client.stdio` and `mcp`. v2 changed `stdio_client` shutdown and `ClientSession` internals.
UNVERIFIED: the exact v2 call signatures for this low-level path. Prefer `Client`.

## OpenAI Agents SDK

Docs: https://openai.github.io/openai-agents-python/mcp/ and https://openai.github.io/openai-agents-python/ref/mcp/server/

```python
from agents import Agent, Runner
from agents.mcp import MCPServerStdio

async with MCPServerStdio(name="hardstop", params={"command": "node", "args": [SERVER], "env": ENV}) as server:
    agent = Agent(name="payer", instructions="Use HARDSTOP to pay. Preview first.", mcp_servers=[server])
    result = await Runner.run(agent, "What is my HARDSTOP status?")
    print(result.final_output)
```

`params` also accepts `cwd` and `encoding`. Optional constructor arguments are `cache_tools_list` and `client_session_timeout_seconds`.

## LangChain / LangGraph

Docs: https://github.com/langchain-ai/langchain-mcp-adapters (README, plus `StdioConnection` in `langchain_mcp_adapters/sessions.py`) and https://docs.langchain.com/oss/python/migrate/langchain-mcp-adapters

`langchain-mcp-adapters` (`MultiServerMCPClient`) is archived. LangChain now points to `langchain[mcp]>=1.4.0`. The legacy API is below; its `env` key is verified in source:

```python
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain.agents import create_agent

client = MultiServerMCPClient({"hardstop": {"transport": "stdio", "command": "node", "args": [SERVER], "env": ENV}})
tools = await client.get_tools()
agent = create_agent("openai:gpt-4.1", tools)
```

Current replacement:

```python
from langchain.mcp import MCPAdapter
async with MCPAdapter({"mcpServers": {"hardstop": {"command": "node", "args": [SERVER], "env": ENV}}}) as adapter:
    tools = await adapter.list_tools()
```

UNVERIFIED: that the new `MCPAdapter` config honors `env` (the migration page shows only `command`/`args`). Use the legacy client if the server starts without its variables.

## Pydantic AI

Docs: https://pydantic.dev/docs/ai/mcp/client/ and https://gofastmcp.com/clients/transports. Install with `pip install "pydantic-ai-slim[mcp]"`.

The current docs no longer show `MCPServerStdio`. They use `MCPToolset` over a FastMCP transport:

```python
from fastmcp.client.transports import StdioTransport
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset

toolset = MCPToolset(StdioTransport(command="node", args=[SERVER], env=ENV))
agent = Agent("openai:gpt-4.1", toolsets=[toolset])
async with agent:
    print((await agent.run("What is my HARDSTOP status?")).output)
```

UNVERIFIED: the legacy form `MCPServerStdio("node", args=[SERVER], env=ENV)` from `pydantic_ai.mcp`, passed via `toolsets=[server]`. One secondary source (PR #5325) says it is deprecated but works until V3. It is not in the current docs.
