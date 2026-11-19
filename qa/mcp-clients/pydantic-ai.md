# Pydantic AI and the HARDSTOP MCP server

Date: 2026-11-19. Machine: Windows 11, Node v24.22.3, uv 0.13.6, Python 3.13.
Client: `pydantic-ai-slim` 2.71.0 with `fastmcp` 4.2.2 (`MCPToolset` over `StdioTransport`).
Server: demo mode (`HARDSTOP_FAKE=1`, in-memory network, nothing real), over stdio.

**Result: verified, with a local model, on the second attempt.** An `Agent` with `toolsets=[MCPToolset(...)]` called
`hardstop_status`, `hardstop_preview_payment`, `hardstop_pay` ($4, paid) and `hardstop_pay` ($15, refused by the vault). Exit code 0.

What drove it: no model API key is set on this machine, so the model was **`qwen3.5:9b` running locally in Ollama 0.40.4**,
through `OpenAIChatModel` with `OllamaProvider`. Not exercised: a hosted model.

**The first attempt failed.** `MCPToolset` gives the server 5 seconds to answer `initialize` (its default `init_timeout`).
The server took longer, because the machine was busy with the local model from the run before, and the attempt ended in
`TimeoutError` / `RuntimeError: Client failed to connect: Failed to initialize server session` before any tool was called.
Measured on this machine with a direct probe, the server answers `initialize` in 1.6 to 2.1 seconds when idle and took 4.6 seconds
while the local model was running (Hermes reported 8.5 seconds to connect under the same load). The same script, unchanged, passed when rerun on an idle machine. Passing `init_timeout=30` to
`MCPToolset` removes the risk; that form connected and listed the five tools in a separate check with no model (last section).

## Command

```
> uv run -q --with pydantic-ai-slim[mcp,openai] --with fastmcp python pydantic_ai_proof.py
attempt 1: exit=1
attempt 2: exit=0
```

## Script (`pydantic_ai_proof.py`, kept outside the repository; `common.py` is in openai-agents-sdk.md)

```python
"""Pydantic AI (MCPToolset over a FastMCP stdio transport) -> HARDSTOP demo server, local Ollama model."""

import asyncio
import importlib.metadata as md
import sys

from fastmcp.client.transports import StdioTransport
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPToolset
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.ollama import OllamaProvider

from common import ENV, EXPECTED, INSTRUCTIONS, MODEL, OLLAMA_URL, PROMPT, SERVER, first_line


async def main() -> int:
    print("pydantic-ai-slim", md.version("pydantic-ai-slim"), "| fastmcp", md.version("fastmcp"))
    print("model", MODEL, "via", OLLAMA_URL)
    toolset = MCPToolset(StdioTransport(command="node", args=[SERVER], env=ENV))
    model = OpenAIChatModel(MODEL, provider=OllamaProvider(base_url=OLLAMA_URL))
    agent = Agent(model, toolsets=[toolset], instructions=INSTRUCTIONS)
    async with agent:
        result = await agent.run(PROMPT)
    called = []
    for message in result.all_messages():
        for part in message.parts:
            if part.part_kind == "tool-call":
                called.append(part.tool_name)
                print(f"\nMODEL CALLED {part.tool_name} {part.args}")
            elif part.part_kind == "tool-return":
                print("TOOL ANSWERED:", first_line(part.content))
    print("\nFINAL OUTPUT:\n" + str(result.output))
    print("\ntools the model called:", called)
    assert set(called) <= EXPECTED, called
    assert {"hardstop_status", "hardstop_preview_payment", "hardstop_pay"} <= set(called), called
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

## Output of attempt 2 (complete)

Pydantic AI hands the model the tool's structured answer (the JSON), not the plain sentence.

```
hardstop: demo mode, an in-memory network with a freshly launched vault. Nothing is real.
                 pydantic-ai v2.71.0 • Python 3.13.3
      / \
     /   \       agent: agent • model: ollama:qwen3.5:9b • tools: 5 • capabilities: 0
   /___.___\
  /    |    \    observability: off — see every model and tool call live, with cost
/      |      \    set it up free with Pydantic Logfire: uvx logfire-cli wizard --task pydantic-ai
`---.._|_..---'    or use any OpenTelemetry backend: https://pydantic.dev/docs/ai/logfire/#otel

                 goes away once observability is on — or PYDANTIC_AI_NO_BANNER=1
pydantic-ai-slim 2.71.0 | fastmcp 4.2.2
model qwen3.5:9b via http://localhost:11434/v1

MODEL CALLED hardstop_status {}
TOOL ANSWERED: {'vault': '0xf487c9eb781e999febf90130a842b12e625e4ecf', 'agent': '0x17ce48e269460da65df5623dfa0919e2f26b4475', 'network': 'in-memory demo network (HARDSTOP_FAKE=1, nothing is real)', 'chain_id': 84532, 'now': '2026-11-19T16:40:19.000Z', 'window_secs': '86400', 'rules': {'per_payment_usd': '10.00', 'per_day_usd': '20.00', 'valid_until': '2026-12-19T16:40:19.000Z', 'paused': False}, 'spent_today_usd': '0.00', 'left_today_usd': '20.00', 'day_resets_at': '2026-11-20T16:40:19.000Z', 'vault_balance_usd': '100.00', 'agent_gas_eth': '0.00003', 'waiting_change': None, 'worst_case_24h_usd': '40.00', 'next_nonce': '0'}

MODEL CALLED hardstop_preview_payment {"to":"Cloud hosting","amount_usd":4}
TOOL ANSWERED: {'would_pay': True, 'reason': 'Allowed', 'explanation': 'Inside every limit. $16.00 left today.', 'to': '0x0000000000000000000000000000000000005109', 'amount_usd': '4.00', 'nonce': '0'}

MODEL CALLED hardstop_pay {"to":"Cloud hosting","amount_usd":4}
TOOL ANSWERED: {'paid': True, 'result': 'paid', 'reason': 'Allowed', 'explanation': 'Inside every limit. $16.00 left today.', 'to': '0x0000000000000000000000000000000000005109', 'amount_usd': '4.00', 'nonce': '0', 'left_today_usd': '16.00', 'transaction': '0xd2ec297ad039ef31b78156cfb9bc6c6092c40095d3ba72924c6103aa6d4e4fea', 'explorer': None}

MODEL CALLED hardstop_pay {"to":"Cloud hosting","amount_usd":15}
TOOL ANSWERED: {'paid': False, 'result': 'refused', 'reason': 'OverPaymentLimit', 'explanation': 'One payment may be at most $10.00.', 'to': '0x0000000000000000000000000000000000005109', 'amount_usd': '15.00', 'nonce': '1', 'left_today_usd': '16.00', 'transaction': '0x2fc06f3d3ebd03bbbdd6356fd17f105acdacfec33a526d71a442fb82f224d001', 'explorer': None}

FINAL OUTPUT:
1. hardstop_status answered with vault address 0xf487c9eb..., agent 0x17ce48e2..., per-payment limit $10, per-day limit $20, spent today $0, left today $20, vault balance $100.

2. hardstop_preview_payment for Cloud hosting $4 answered would_pay=true with reason "Allowed" because it was inside every limit and $16 left today.

3. hardstop_pay for Cloud hosting $4 answered paid=true, result="paid", explanation "Inside every limit"—the payment succeeded and $16 is left today.

4. hardstop_pay for Cloud hosting $15 answered paid=false, result="refused", reason "OverPaymentLimit" because one payment may be at most $10.

tools the model called: ['hardstop_status', 'hardstop_preview_payment', 'hardstop_pay', 'hardstop_pay']
```

## Output of attempt 1 (the failure; traceback frames in the middle cut)

```
pydantic-ai-slim 2.71.0 | fastmcp 4.2.2
model qwen3.5:9b via http://localhost:11434/v1
Traceback (most recent call last):
  File "<uv-cache>\Lib\site-packages\anyio\streams\memory.py", line 119, in receive
    return self.receive_nowait()
           ~~~~~~~~~~~~~~~~~~~^^
  File "<uv-cache>\Lib\site-packages\anyio\streams\memory.py", line 114, in receive_nowait
    raise WouldBlock
anyio._core._exceptions.WouldBlock
[... 89 traceback lines cut ...]
    await exit_stack.enter_async_context(toolset)
  File "<home>\AppData\Local\Programs\Python\Python313\Lib\contextlib.py", line 668, in enter_async_context
    result = await _enter(cm)
             ^^^^^^^^^^^^^^^^
  File "<uv-cache>\Lib\site-packages\pydantic_ai\toolsets\combined.py", line 56, in __aenter__
    await exit_stack.enter_async_context(toolset)
  File "<home>\AppData\Local\Programs\Python\Python313\Lib\contextlib.py", line 668, in enter_async_context
    result = await _enter(cm)
             ^^^^^^^^^^^^^^^^
  File "<uv-cache>\Lib\site-packages\pydantic_ai\mcp.py", line 1376, in __aenter__
    await exit_stack.enter_async_context(self.client)
  File "<home>\AppData\Local\Programs\Python\Python313\Lib\contextlib.py", line 668, in enter_async_context
    result = await _enter(cm)
             ^^^^^^^^^^^^^^^^
  File "<uv-cache>\Lib\site-packages\fastmcp\client\client.py", line 995, in __aenter__
    session_task = await self._enter_context()
                   ^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "<uv-cache>\Lib\site-packages\fastmcp\client\client.py", line 988, in _enter_context
    await self._connect()
  File "<uv-cache>\Lib\site-packages\fastmcp\client\client.py", line 1146, in _connect
    raise failure from exception
RuntimeError: Client failed to connect: Failed to initialize server session
```

## `init_timeout=30` check (no model)

```
> uv run -q --with pydantic-ai-slim[mcp,openai] --with fastmcp python pydantic_init_timeout_check.py
exit=0
```

```python
"""MCPToolset with a longer init_timeout: connect and list tools (no model)."""
import asyncio
from fastmcp.client.transports import StdioTransport
from pydantic_ai.mcp import MCPToolset
from common import SERVER, ENV

async def main():
    toolset = MCPToolset(StdioTransport(command="node", args=[SERVER], env=ENV), init_timeout=30)
    async with toolset:
        tools = await toolset.client.list_tools()
        print("tools via MCPToolset(init_timeout=30):", sorted(t.name for t in tools))

asyncio.run(main())
```

```
hardstop: demo mode, an in-memory network with a freshly launched vault. Nothing is real.
tools via MCPToolset(init_timeout=30): ['hardstop_pay', 'hardstop_preview_payment', 'hardstop_recipients', 'hardstop_request_more', 'hardstop_status']
```
