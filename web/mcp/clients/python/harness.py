"""Drive the HARDSTOP MCP server from Python with the official `mcp` SDK, over stdio.

Run from the repository root (Node 24+ and `npm ci` in web/ first):

    uv run --with mcp python web/mcp/clients/python/harness.py

With no HARDSTOP_* settings it starts the server in demo mode (HARDSTOP_FAKE=1:
an in-memory network with a freshly launched vault). With HARDSTOP_VAULT set it
passes your HARDSTOP_* settings through and talks to the real test network;
the preview sends nothing either way.

It lists the tools, checks that none of them is an owner power, reads the
status and previews a payment. Exits non-zero if any check fails.
"""

import asyncio
import os
import re
import shutil
import sys
from pathlib import Path

from mcp import Client, StdioServerParameters

WEB = Path(__file__).resolve().parents[3]
SERVER = WEB / "mcp" / "server.ts"
EXPECTED = {
    "hardstop_status",
    "hardstop_preview_payment",
    "hardstop_pay",
    "hardstop_recipients",
    "hardstop_request_more",
}
OWNER_POWER = re.compile(r"propose|cancel|pause|withdraw|owner|set_?recipient|recipient_(add|remove)", re.I)


def server_env() -> dict[str, str]:
    settings = {k: v for k, v in os.environ.items() if k.startswith("HARDSTOP_")}
    if "HARDSTOP_VAULT" not in settings:
        return {"HARDSTOP_FAKE": "1"}
    settings.pop("HARDSTOP_FAKE", None)
    return settings


def text_of(result) -> str:
    return "\n".join(getattr(part, "text", "") for part in result.content)


async def main() -> int:
    node = shutil.which("node")
    if node is None:
        print("node is not on PATH; HARDSTOP's server needs Node 24 or later.", file=sys.stderr)
        return 1
    env = server_env()
    params = StdioServerParameters(command=node, args=[str(SERVER)], env=env, cwd=str(WEB))
    async with Client(params) as client:
        tools = (await client.list_tools()).tools
        names = sorted(tool.name for tool in tools)
        print("tools:", ", ".join(names))
        assert set(names) == EXPECTED, f"unexpected tool list: {names}"
        owner_tools = [name for name in names if OWNER_POWER.search(name)]
        assert not owner_tools, f"owner tools exposed: {owner_tools}"
        print("no owner tool: ok")

        status = await client.call_tool("hardstop_status", {})
        assert not status.is_error, text_of(status)
        print("\nstatus:\n" + text_of(status).split("\n{")[0])

        recipient = "Cloud hosting" if "HARDSTOP_FAKE" in env else os.environ.get("HARDSTOP_PREVIEW_TO", "")
        if not recipient:
            print("\nSet HARDSTOP_PREVIEW_TO (an address or recipient name) to preview a payment on a real vault.")
            return 0
        preview = await client.call_tool("hardstop_preview_payment", {"to": recipient, "amount_usd": 4})
        assert not preview.is_error, text_of(preview)
        print("\npreview:", text_of(preview).split("\n{")[0])
        assert preview.structured_content["would_pay"] in (True, False)
        if "HARDSTOP_FAKE" in env:
            assert preview.structured_content["would_pay"] is True
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
