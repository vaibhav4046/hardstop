# Python, official `mcp` SDK, and the HARDSTOP MCP server

Date: 2026-11-19. Machine: Windows 11, Node v24.22.3, uv 0.13.6. Client: PyPI `mcp` 2.3.0.
Server: demo mode (`HARDSTOP_FAKE=1`, in-memory network, nothing real), started by the harness over stdio.

**Result: verified.** The harness lists the tools, checks there is no owner tool, reads the status and previews a payment. Exit code 0.
It does not call `hardstop_pay`.

## Command (from the repository root)

```
> uv run --with mcp python web/mcp/clients/python/harness.py
exit=0
```

## Output (uv's package download lines cut)

```
hardstop: demo mode, an in-memory network with a freshly launched vault. Nothing is real.
tools: hardstop_pay, hardstop_preview_payment, hardstop_recipients, hardstop_request_more, hardstop_status
no owner tool: ok

status:
HARDSTOP vault 0xe5c95217a12adce7824ad4000f64086cd0dfd2a7 on in-memory demo network (HARDSTOP_FAKE=1, nothing is real) (a test network: its dollars have no value).
Rules in force: up to $10.00 per payment and $20.00 per day, until 19 Dec 2026, 16:25.
Today: $0.00 spent, $20.00 left. The day resets 20 Nov 2026, 16:25.
The vault holds $100.00. The agent has 0.00003 ETH left for network fees.
No change to the rules is waiting.
Worst case over the next 24 hours, by the contract's own arithmetic: $40.00. This span can cross the day's reset, so it can include part of the next day's allowance.
Next request number: 0.

preview: Would be paid: $4.00 to Cloud hosting. Inside every limit. $16.00 left today. Nothing was sent.

all checks passed
```

SDK version check:

```
> uv run --with mcp python -c "import importlib.metadata as m; print('mcp', m.version('mcp'))"
mcp 2.3.0
```
