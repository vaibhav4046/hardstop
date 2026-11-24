# The six steps on the v3 contracts, through the MCP client (Base Sepolia, 2026-11-24)

The contracts were rebuilt on 2026-11-24 (v3): the vault's token is sealed
inside the kernel's `Books` from creation, so `Pay` cannot choose the token
a payout pays in; `setAgent` with the owner's own address now reverts; and a
vault can hold an existing token. The AI-assistant runs of 2026-11-22
(Claude Code, Cursor, Antigravity) used earlier contracts. The Claude Code
CLI's sign-in had expired on this machine, so it was not repeated on v3;
Cursor's agent was, later the same day: `2026-11-24-cursor-native-v3.md`.

So this run is **not an AI assistant**. It is the official MCP TypeScript
SDK client (`@modelcontextprotocol/sdk`, `Client` over stdio) starting the
real one-file server (`web/mcp/dist/hardstop-mcp.mjs`) with the vault's
agent key (kept outside the repo), and calling the same six tools, in the
same order, as the assistants did. It shows the server and the v3
contracts working together on a public network. It does not show how an
assistant behaves.

Vault `0x76b5cc6fc87102a36fb95ca2f9d8c20c98201acb` ("Use-case vault",
launcher `0x40646dfb8d374037a4011e8ab222c6e13d35d707`): $10 a payment, $20 a
day, "Cloud hosting" (`0x…5109`) approved, "GPU Market" (`0x…60f0`) not. $5
had been spent that day by the use-case run. The agent key that sent the
three transactions is `0x906c4da796bd0a0d33ab8a07e462d9fdd953a5c3`.

| # | Tool and arguments | First line of the reply |
|---|---|---|
| 1 | `hardstop_status` `{}` | 🛡️ HARDSTOP vault 0x76b5cc6fc87102a36fb95ca2f9d8c20c98201acb on Base Sepolia (a test network: its dollars have no value). |
| 2 | `hardstop_preview_payment` `{"to":"Cloud hosting","amount_usd":3}` | ✅ Would be paid: $3.00 to Cloud hosting. Inside every limit. $12.00 left today. Nothing was sent. |
| 3 | `hardstop_pay` same | ✅ Paid: $3.00 to Cloud hosting. Inside every limit. $12.00 left today. ([tx](https://sepolia.basescan.org/tx/0xea11d064dae80cb7f94655c948400f733f14a57024f2e1c1c974b24f5d8acdd3)) |
| 4 | `hardstop_pay` `{"to":"GPU Market","amount_usd":5}` | ⛔ Refused: $5.00 to GPU Market. This recipient is not on your approved list, or was added so recently that its waiting period has not ended. ([tx](https://sepolia.basescan.org/tx/0x2834627a6b6867ae311c761bbb2ab38ad367b7cadc58ad4036811b0d9e03d82b)) |
| 5 | `hardstop_pay` `{"to":"Cloud hosting","amount_usd":15}` | ⛔ Refused: $15.00 to Cloud hosting. One payment may be at most $10.00. ([tx](https://sepolia.basescan.org/tx/0x01509bcc83238cf8fe373cb4280e7bd4a3505bf462f7877af23bd93ac3d800cf)) |
| 6 | `hardstop_request_more` `{"per_payment_usd":1000,"per_day_usd":1000,...}` | 📝 Request to the owner of HARDSTOP vault 0x76b5cc6fc87102a36fb95ca2f9d8c20c98201acb on Base Sepolia. |

## Receipts read back (eth_getTransactionReceipt, sepolia.base.org)

| Transaction | Status | Block (UTC time) | Gas used | Logs |
|---|---|---|---|---|
| `0xea11d064…` (paid $3) | `0x1` | 62806681 (01:20:05) | 80,870 | token `Transfer` (`0xddf252ad…`, vault to `0x…5109`, 3,000,000 units) + vault `Paid` (`0xf43b3631…`, $12 left in the window) |
| `0x2834627a…` (GPU Market) | `0x1` | 62806699 (01:20:08) | 56,561 | vault `Blocked` only (`0xf063b480…`, code 9: recipient not approved) |
| `0x01509bcc…` ($15) | `0x1` | 62806710 (01:20:10) | 56,671 | vault `Blocked` only (`0xf063b480…`, code 10, detail 10,000,000: the $10 per-payment limit) |

Money moved once, for the allowed payment. The two refusals are mined and
recorded, and moved nothing. Step 6 sends nothing: it only drafts a request
for the owner.
