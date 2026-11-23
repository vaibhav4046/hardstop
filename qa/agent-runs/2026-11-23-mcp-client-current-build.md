# The six steps on the current contracts, through the MCP client (Base Sepolia, 2026-11-23)

The vault was rebuilt on 2026-11-23: it now pays only through the kernel's
sealed payout, and the owner can replace the agent's key. The AI-assistant
runs of 2026-11-22 (Claude Code, Cursor, Antigravity) used the previous
contracts. They were not repeated on the new ones: the Claude Code CLI's
sign-in had expired on this machine, and Cursor's agent CLI reached the
server but a hook in the local Cursor settings blocked every tool call.

So this run is **not an AI assistant**. It is the official MCP TypeScript
SDK client (`@modelcontextprotocol/sdk`, `Client` over stdio) starting the
real one-file server (`web/mcp/dist/hardstop-mcp.mjs`) with the vault's
agent key (kept outside the repo), and calling the same six tools, in the
same order, as the assistants did. It shows the server and the new
contracts working together on a public network; it does not show how an
assistant behaves.

Vault `0x3ef54633dfdbf34649a66d9ca050f0f113df3a70` ("Use-case vault",
launcher `0x120b607e82bc365710439b283c13eec8d293f206`): $10 a payment, $20 a
day, "Cloud hosting" (`0x…5109`) approved, "GPU Market" (`0x…60f0`) not. $5
had been spent that day by the use-case run.

| # | Tool and arguments | First line of the reply |
|---|---|---|
| 1 | `hardstop_status` `{}` | 🛡️ HARDSTOP vault 0x3ef54633dfdbf34649a66d9ca050f0f113df3a70 on Base Sepolia (a test network: its dollars have no value). |
| 2 | `hardstop_preview_payment` `{"to":"Cloud hosting","amount_usd":3}` | ✅ Would be paid: $3.00 to Cloud hosting. Inside every limit. $12.00 left today. Nothing was sent. |
| 3 | `hardstop_pay` same | ✅ Paid: $3.00 to Cloud hosting. Inside every limit. $12.00 left today. ([tx](https://sepolia.basescan.org/tx/0xb1af60a9088f977ce4797eb9edd6470bf1e03f8181fceeccf25974daab47e481)) |
| 4 | `hardstop_pay` `{"to":"GPU Market","amount_usd":5}` | ⛔ Refused: $5.00 to GPU Market. This recipient is not on your approved list, or was added so recently that its waiting period has not ended. ([tx](https://sepolia.basescan.org/tx/0x772be9db0dedee1bfaa0523ba1a8b8f3d7beb7722dbaac69ec4e56a299287a2c)) |
| 5 | `hardstop_pay` `{"to":"Cloud hosting","amount_usd":15}` | ⛔ Refused: $15.00 to Cloud hosting. One payment may be at most $10.00. ([tx](https://sepolia.basescan.org/tx/0xe145b03a7ccd6b7966b9b34e5ac0215f48e682c4c3c36be068aa0c222801ed14)) |
| 6 | `hardstop_request_more` `{"per_payment_usd":1000,"per_day_usd":1000,...}` | 📝 Request to the owner of HARDSTOP vault 0x3ef54633dfdbf34649a66d9ca050f0f113df3a70 on Base Sepolia. |

## Receipts read back (eth_getTransactionReceipt, sepolia.base.org)

| Transaction | Status | Block | Logs |
|---|---|---|---|
| `0xb1af60a9…` (paid $3) | `0x1` | 62731089 | token `Transfer` + vault `Paid` |
| `0x772be9db…` (GPU Market) | `0x1` | 62731107 | vault `Blocked` only |
| `0xe145b03a…` ($15) | `0x1` | 62731119 | vault `Blocked` only |

Money moved once, for the allowed payment; the two refusals are mined and
recorded, and moved nothing.
