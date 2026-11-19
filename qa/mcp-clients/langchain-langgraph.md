# LangChain / LangGraph and the HARDSTOP MCP server

Date: 2026-11-19. Machine: Windows 11, Node v24.22.3, uv 0.13.6, Python 3.13.
Client: `langchain` 1.5.2, `langgraph` 1.2.23, `langchain-mcp-adapters` 0.3.2, `langchain-openai` 1.8.3.
Server: demo mode (`HARDSTOP_FAKE=1`, in-memory network, nothing real), over stdio.

**Result: verified, with a local model.** A `create_agent` agent with the tools loaded by `langchain-mcp-adapters` called
`hardstop_status`, `hardstop_preview_payment`, `hardstop_pay` ($4, paid) and `hardstop_pay` ($15, refused by the vault). Exit code 0.

What drove it: no model API key is set on this machine, so the model was **`qwen3.5:9b` running locally in Ollama 0.40.4**,
through `ChatOpenAI(base_url="http://localhost:11434/v1")`. Not exercised: a hosted model.

Two things to know:

- The model's last message came back empty (see `FINAL OUTPUT` below). The four tool calls and the vault's answers are in the message list; the model simply wrote no closing summary.
- The run holds one MCP session open (`client.session("hardstop")` plus `load_mcp_tools`). The README's shorter `await client.get_tools()` opens a new session for every tool call, which in demo mode means a fresh vault each time, so a payment would not show up in the next status. That is a property of the demo (the vault lives in the server process), not of a real vault.

## Command 1: the agent run

```
> uv run -q --with langchain --with langchain-mcp-adapters --with langchain-openai --with langgraph python langchain_proof.py
exit=0
```

### Script (`langchain_proof.py`, kept outside the repository; `common.py` is in openai-agents-sdk.md)

```python
"""LangChain / LangGraph (langchain-mcp-adapters) -> HARDSTOP demo server, with a local Ollama model."""

import asyncio
import importlib.metadata as md
import sys

from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_openai import ChatOpenAI

from common import ENV, EXPECTED, INSTRUCTIONS, MODEL, OLLAMA_URL, PROMPT, SERVER, first_line


def text_of(content: object) -> str:
    if isinstance(content, list):
        return "\n".join(str(p.get("text", p)) if isinstance(p, dict) else str(p) for p in content)
    return str(content)


async def main() -> int:
    versions = {p: md.version(p) for p in ("langchain", "langgraph", "langchain-mcp-adapters", "langchain-openai")}
    print(versions, "| model", MODEL, "via", OLLAMA_URL)
    client = MultiServerMCPClient(
        {"hardstop": {"transport": "stdio", "command": "node", "args": [SERVER], "env": ENV}}
    )
    # One session for the whole run: the demo vault lives in the server process.
    async with client.session("hardstop") as session:
        from langchain_mcp_adapters.tools import load_mcp_tools

        tools = await load_mcp_tools(session)
        names = sorted(t.name for t in tools)
        print("tools via langchain-mcp-adapters:", ", ".join(names))
        assert set(names) == EXPECTED, names

        if "--no-model" in sys.argv:
            return 0
        model = ChatOpenAI(model=MODEL, base_url=OLLAMA_URL, api_key="ollama")  # placeholder key
        agent = create_agent(model, tools, system_prompt=INSTRUCTIONS)
        result = await agent.ainvoke({"messages": [{"role": "user", "content": PROMPT}]})
        called = []
        for message in result["messages"]:
            for call in getattr(message, "tool_calls", None) or []:
                called.append(call["name"])
                print(f"\nMODEL CALLED {call['name']} {call['args']}")
            if message.type == "tool":
                print("TOOL ANSWERED:", first_line(text_of(message.content)))
        print("\nFINAL OUTPUT:\n" + text_of(result["messages"][-1].content))
        print("\ntools the model called:", called)
        assert {"hardstop_status", "hardstop_preview_payment", "hardstop_pay"} <= set(called), called
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

### Output (complete)

```
hardstop: demo mode, an in-memory network with a freshly launched vault. Nothing is real.
{'langchain': '1.5.2', 'langgraph': '1.2.23', 'langchain-mcp-adapters': '0.3.2', 'langchain-openai': '1.8.3'} | model qwen3.5:9b via http://localhost:11434/v1
tools via langchain-mcp-adapters: hardstop_pay, hardstop_preview_payment, hardstop_recipients, hardstop_request_more, hardstop_status

MODEL CALLED hardstop_status {}
TOOL ANSWERED: HARDSTOP vault 0x88f64a050543450cec03734294c1e98775192c59 on in-memory demo network (HARDSTOP_FAKE=1, nothing is real) (a test network: its dollars have no value).
Rules in force: up to $10.00 per payment and $20.00 per day, until 19 Dec 2026, 16:34.
Today: $0.00 spent, $20.00 left. The day resets 20 Nov 2026, 16:34.
The vault holds $100.00. The agent has 0.00003 ETH left for network fees.
No change to the rules is waiting.
Worst case over the next 24 hours, by the contract's own arithmetic: $40.00. This span can cross the day's reset, so it can include part of the next day's allowance.
Next request number: 0.

MODEL CALLED hardstop_preview_payment {'to': 'Cloud hosting', 'amount_usd': 4}
TOOL ANSWERED: Would be paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today. Nothing was sent.

MODEL CALLED hardstop_pay {'to': 'Cloud hosting', 'amount_usd': 4}
TOOL ANSWERED: Paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today.
Left today: $16.00.
Recorded on the in-memory demo network, which no explorer can show.

MODEL CALLED hardstop_pay {'to': 'Cloud hosting', 'amount_usd': 15}
TOOL ANSWERED: Refused: $15.00 to Cloud hosting. One payment may be at most $10.00.
Left today: $16.00.
Recorded on the in-memory demo network, which no explorer can show.

FINAL OUTPUT:


tools the model called: ['hardstop_status', 'hardstop_preview_payment', 'hardstop_pay', 'hardstop_pay']
```

## Command 2: the newer `langchain.mcp.MCPAdapter` (no model)

The Python README marked as unverified whether `MCPAdapter` passes `env` to the server. It does: the server printed its demo-mode line,
which it only does when `HARDSTOP_FAKE=1` reaches it. This run lists the tools and calls `hardstop_status` directly; no model is involved.

```
> uv run -q --with langchain[mcp] python langchain_mcpadapter_check.py
exit=0
```

### Script

```python
import asyncio, importlib.metadata as md
from common import SERVER, ENV, EXPECTED
print("langchain", md.version("langchain"))
try:
    from langchain.mcp import MCPAdapter
except Exception as e:
    print("import langchain.mcp.MCPAdapter FAILED:", type(e).__name__, e); raise SystemExit(0)
async def main():
    async with MCPAdapter({"mcpServers": {"hardstop": {"command": "node", "args": [SERVER], "env": ENV}}}) as adapter:
        tools = await adapter.list_tools()
        names = sorted(t.name for t in tools)
        print("tools via langchain.mcp.MCPAdapter:", names)
        status = next(t for t in tools if t.name.endswith("hardstop_status"))
        print("status via tool.ainvoke:", str(await status.ainvoke({}))[:300])
asyncio.run(main())
```

### Output (the status line is cut at 300 characters by the script)

```
<scratch>\py\langchain_mcpadapter_check.py:5: LangChainBetaWarning: `langchain.mcp` is in beta. It is actively being worked on, so the API may change.
  from langchain.mcp import MCPAdapter
hardstop: demo mode, an in-memory network with a freshly launched vault. Nothing is real.
langchain 1.5.2
tools via langchain.mcp.MCPAdapter: ['hardstop_pay', 'hardstop_preview_payment', 'hardstop_recipients', 'hardstop_request_more', 'hardstop_status']
status via tool.ainvoke: [{'type': 'text', 'text': "HARDSTOP vault 0x03ec185bb8d50b656fe91a45f9f7d809da1bd488 on in-memory demo network (HARDSTOP_FAKE=1, nothing is real) (a test network: its dollars have no value).\nRules in force: up to $10.00 per payment and $20.00 per day, until 19 Dec 2026, 16:38.\nToday: $0.00 spent,
```

## Command 3: `get_tools()` starts a new server for every tool call (no model)

This checks the second note at the top. With the tools from `await client.get_tools()`, a $4 payment is followed by a status call.
The server's demo line is printed three times (one launch for the tool list, one per call), and the status still shows $0.00 spent:
the payment went to a different demo vault. On a real vault the payment is on the network either way, but each call still pays the
server's start-up time, and the server's rule of sending one payment at a time no longer holds across calls.

```
> uv run -q --with langchain-mcp-adapters python langchain_stateless_check.py
exit=0
```

### Script

```python
"""Does MultiServerMCPClient.get_tools() keep one server process across tool calls? (no model)"""
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from common import SERVER, ENV

def text(result):
    return result[0]["text"] if isinstance(result, list) else str(result)

async def main():
    client = MultiServerMCPClient({"hardstop": {"transport": "stdio", "command": "node", "args": [SERVER], "env": ENV}})
    tools = {t.name: t for t in await client.get_tools()}
    paid = text(await tools["hardstop_pay"].ainvoke({"to": "Cloud hosting", "amount_usd": 4}))
    print("pay:", paid.splitlines()[0])
    status = text(await tools["hardstop_status"].ainvoke({}))
    print("status after pay:", [line for line in status.splitlines() if line.startswith("Today")][0])
    print("vault line:", status.splitlines()[0][:70])

asyncio.run(main())
```

### Output (complete)

```
hardstop: demo mode, an in-memory network with a freshly launched vault. Nothing is real.
hardstop: demo mode, an in-memory network with a freshly launched vault. Nothing is real.
hardstop: demo mode, an in-memory network with a freshly launched vault. Nothing is real.
pay: Paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today.
status after pay: Today: $0.00 spent, $20.00 left. The day resets 20 Nov 2026, 16:44.
vault line: HARDSTOP vault 0xbb41d43ce5a2d3fedbf033623620b46f41d2b0bb on in-memory
```
