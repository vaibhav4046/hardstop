# OpenAI Agents SDK and the HARDSTOP MCP server

Date: 2026-11-19. Machine: Windows 11, Node v24.22.3, uv 0.13.6, Python 3.13. Client: PyPI `openai-agents` 0.25.0.
Server: demo mode (`HARDSTOP_FAKE=1`, in-memory network, nothing real), started by `agents.mcp.MCPServerStdio` over stdio.

**Result: verified, with a local model.** An `Agent` given the server through `mcp_servers=[server]` called
`hardstop_status`, `hardstop_preview_payment`, `hardstop_pay` ($4, paid) and `hardstop_pay` ($15, refused by the vault). Exit code 0.

What drove it: no OpenAI key is set on this machine (`OPENAI_API_KEY` not set), so the model was **`qwen3.5:9b` running locally in Ollama 0.40.4**,
reached through Ollama's OpenAI-compatible endpoint (`http://localhost:11434/v1`) with `OpenAIChatCompletionsModel`.
Not exercised: an OpenAI-hosted model, the Responses API, and OpenAI tracing (turned off, since it calls api.openai.com).

## Command

```
> uv run -q --with openai-agents python openai_agents_proof.py
exit=0
```

## Script (`openai_agents_proof.py`, kept outside the repository)

```python
"""OpenAI Agents SDK -> HARDSTOP demo server, with a local Ollama model."""

import asyncio
import importlib.metadata as md
import sys

from agents import Agent, OpenAIChatCompletionsModel, Runner, set_tracing_disabled
from agents.mcp import MCPServerStdio
from openai import AsyncOpenAI

from common import ENV, EXPECTED, INSTRUCTIONS, MODEL, OLLAMA_URL, PROMPT, SERVER, first_line


async def main() -> int:
    print("openai-agents", md.version("openai-agents"), "| model", MODEL, "via", OLLAMA_URL)
    set_tracing_disabled(True)  # tracing would call api.openai.com
    params = {"command": "node", "args": [SERVER], "env": ENV}
    async with MCPServerStdio(name="hardstop", params=params, client_session_timeout_seconds=120) as server:
        names = sorted(t.name for t in await server.list_tools())
        print("tools via MCPServerStdio.list_tools():", ", ".join(names))
        assert set(names) == EXPECTED, names

        if "--no-model" in sys.argv:
            return 0
        client = AsyncOpenAI(base_url=OLLAMA_URL, api_key="ollama")  # placeholder, Ollama ignores it
        model = OpenAIChatCompletionsModel(model=MODEL, openai_client=client)
        agent = Agent(name="payer", instructions=INSTRUCTIONS, mcp_servers=[server], model=model)
        result = await Runner.run(agent, PROMPT, max_turns=12)
        called = []
        for item in result.new_items:
            if item.type == "tool_call_item":
                called.append(item.raw_item.name)
                print(f"\nMODEL CALLED {item.raw_item.name} {item.raw_item.arguments}")
            elif item.type == "tool_call_output_item":
                print("TOOL ANSWERED:", first_line(item.output))
        print("\nFINAL OUTPUT:\n" + str(result.final_output))
        print("\ntools the model called:", called)
        assert {"hardstop_status", "hardstop_preview_payment", "hardstop_pay"} <= set(called), called
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
```

`common.py`, shared by the three framework proofs:

```python
"""Shared settings for the framework proofs. Demo server only (HARDSTOP_FAKE=1)."""

import os

SERVER = "D:/hardstop/web/mcp/server.ts"
ENV = {"HARDSTOP_FAKE": "1"}
EXPECTED = {
    "hardstop_status",
    "hardstop_preview_payment",
    "hardstop_pay",
    "hardstop_recipients",
    "hardstop_request_more",
}
# Local model through Ollama's OpenAI-compatible endpoint. No key, nothing leaves this machine.
OLLAMA_URL = "http://localhost:11434/v1"
MODEL = os.environ.get("PROOF_MODEL", "qwen3.5:9b")
INSTRUCTIONS = "You are a payment agent. Use the HARDSTOP tools exactly as asked, one call at a time."
PROMPT = (
    "Do these four steps in order, each with one tool call:\n"
    "1. Call hardstop_status.\n"
    '2. Call hardstop_preview_payment with to="Cloud hosting" and amount_usd=4.\n'
    '3. Call hardstop_pay with to="Cloud hosting" and amount_usd=4.\n'
    '4. Call hardstop_pay with to="Cloud hosting" and amount_usd=15. This is over the limit; '
    "send it anyway so the refusal is shown.\n"
    "Then say in one line each what every tool answered."
)


def first_line(text: object) -> str:
    """The plain-language part of a tool answer (the JSON copy follows it)."""
    return str(text).split("\n{")[0].strip()
```

## Output (complete)

Each tool answer is the plain sentence followed by the same facts as JSON.

```
hardstop: demo mode, an in-memory network with a freshly launched vault. Nothing is real.
openai-agents 0.25.0 | model qwen3.5:9b via http://localhost:11434/v1
tools via MCPServerStdio.list_tools(): hardstop_pay, hardstop_preview_payment, hardstop_recipients, hardstop_request_more, hardstop_status

MODEL CALLED hardstop_status {}
TOOL ANSWERED: [{'type': 'text', 'text': "HARDSTOP vault 0x63ca90295d6dfc99d1acae5f0a30d3facd65c99e on in-memory demo network (HARDSTOP_FAKE=1, nothing is real) (a test network: its dollars have no value).\nRules in force: up to $10.00 per payment and $20.00 per day, until 19 Dec 2026, 16:28.\nToday: $0.00 spent, $20.00 left. The day resets 20 Nov 2026, 16:28.\nThe vault holds $100.00. The agent has 0.00003 ETH left for network fees.\nNo change to the rules is waiting.\nWorst case over the next 24 hours, by the contract's own arithmetic: $40.00. This span can cross the day's reset, so it can include part of the next day's allowance.\nNext request number: 0."}, {'type': 'text', 'text': '{\n  "vault": "0x63ca90295d6dfc99d1acae5f0a30d3facd65c99e",\n  "agent": "0xde7fab250fb9edfff424fb833e2f062961f40d80",\n  "network": "in-memory demo network (HARDSTOP_FAKE=1, nothing is real)",\n  "chain_id": 84532,\n  "now": "2026-11-19T16:28:59.000Z",\n  "window_secs": "86400",\n  "rules": {\n    "per_payment_usd": "10.00",\n    "per_day_usd": "20.00",\n    "valid_until": "2026-12-19T16:28:59.000Z",\n    "paused": false\n  },\n  "spent_today_usd": "0.00",\n  "left_today_usd": "20.00",\n  "day_resets_at": "2026-11-20T16:28:59.000Z",\n  "vault_balance_usd": "100.00",\n  "agent_gas_eth": "0.00003",\n  "waiting_change": null,\n  "worst_case_24h_usd": "40.00",\n  "next_nonce": "0"\n}'}]

MODEL CALLED hardstop_preview_payment {"to":"Cloud hosting","amount_usd":4}
TOOL ANSWERED: [{'type': 'text', 'text': 'Would be paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today. Nothing was sent.'}, {'type': 'text', 'text': '{\n  "would_pay": true,\n  "reason": "Allowed",\n  "explanation": "Inside every limit. $16.00 left today.",\n  "to": "0x0000000000000000000000000000000000005109",\n  "amount_usd": "4.00",\n  "nonce": "0"\n}'}]

MODEL CALLED hardstop_pay {"to":"Cloud hosting","amount_usd":4}
TOOL ANSWERED: [{'type': 'text', 'text': 'Paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today.\nLeft today: $16.00.\nRecorded on the in-memory demo network, which no explorer can show.'}, {'type': 'text', 'text': '{\n  "paid": true,\n  "result": "paid",\n  "reason": "Allowed",\n  "explanation": "Inside every limit. $16.00 left today.",\n  "to": "0x0000000000000000000000000000000000005109",\n  "amount_usd": "4.00",\n  "nonce": "0",\n  "left_today_usd": "16.00",\n  "transaction": "0x82cc2b7bc06dcca8de57879529a69dad24b3e61b5d74967b1b5c21b96ee801e3",\n  "explorer": null\n}'}]

MODEL CALLED hardstop_pay {"to":"Cloud hosting","amount_usd":15}
TOOL ANSWERED: [{'type': 'text', 'text': 'Refused: $15.00 to Cloud hosting. One payment may be at most $10.00.\nLeft today: $16.00.\nRecorded on the in-memory demo network, which no explorer can show.'}, {'type': 'text', 'text': '{\n  "paid": false,\n  "result": "refused",\n  "reason": "OverPaymentLimit",\n  "explanation": "One payment may be at most $10.00.",\n  "to": "0x0000000000000000000000000000000000005109",\n  "amount_usd": "15.00",\n  "nonce": "1",\n  "left_today_usd": "16.00",\n  "transaction": "0xbf78fa36e97780173afbf89c23a1185c7bea69b0db7a38bde0560207d4e38b99",\n  "explorer": null\n}'}]

FINAL OUTPUT:
**hardstop_status**: Rules are up to $10.00 per payment and $20.00 per day until 19 Dec 2026; today $0.00 spent, $20.00 left; vault holds $100.00; agent has 0.00003 ETH; next nonce is 0.

**hardstop_preview_payment**: Would pay $4.00 to Cloud hosting; allowed, inside every limit; $16.00 left today after this hypothetical payment.

**hardstop_pay (4)**: Paid $4.00 to Cloud hosting; allowed inside every limit; $16.00 left today; transaction recorded on network.

**hardstop_pay (15)**: Refused $15.00 to Cloud hosting; over payment limit—one payment may be at most $10.00; $16.00 still left today.

tools the model called: ['hardstop_status', 'hardstop_preview_payment', 'hardstop_pay', 'hardstop_pay']
```
