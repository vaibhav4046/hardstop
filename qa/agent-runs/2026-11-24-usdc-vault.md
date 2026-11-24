# A vault holding real testnet USDC (Base Sepolia, 2026-11-24)

Until v3 every vault held the launcher's own test dollar. The v3 launcher
(`0x40646dfb8d374037a4011e8ab222c6e13d35d707`) takes a token address: zero
means test dollars, minted into the vault; any other address means the
vault holds that token, nothing is minted, and the owner funds it with an
ordinary transfer. This run used Circle's testnet USDC on Base Sepolia,
`0x036CbD53842c5426634e7929541eC2318f3dCF7e`.

This is a script, not an AI agent: `web/scripts/base-sepolia-usdc.ts`, run
with a throwaway test owner key kept outside the repo. The site itself
still opens test-dollar vaults.

Vault `0x4c6b636f6f3f1bacd42f1cdf4f43e72cab744486`: 3 USDC a payment, 5 USDC
a day, valid 30 days, a one-day cooling period, one approved recipient
(`0x…5109`, "Cloud hosting"). Owner `0x296067b49F888DE31C0e654871cBC2256A261870`,
agent `0x1887c9a604a30532d04ef45183c92fcf715c4490` (both from the
launcher's `Launched` log).

| Step | Transaction | What the script printed |
|---|---|---|
| Launch the vault with the USDC address | [tx](https://sepolia.basescan.org/tx/0x1312cbdf642d4e34230728894631802936b9ee5edace115536da7c7a8b6f7a98) | `vault 0x4c6b… holds token 0x036c… (USDC: true)` |
| Owner sends 10 USDC to the vault | [tx](https://sepolia.basescan.org/tx/0xc71b4c5743bb8b471f9adcd3459e6bca8bb98d65d7d0c22b3b85170fccea1b0c) | `ok` |
| Agent pays 2 USDC to Cloud hosting | [tx](https://sepolia.basescan.org/tx/0xaabce2066d4ddb7ff58e0407925ff4b7bbacdcee6d2d8a04126d583b1213414e) | `ok  gas 143297  verdict 0` |
| Agent asks for 4 USDC | [tx](https://sepolia.basescan.org/tx/0x34e32be404beac681d67370e4494423ea786cc0a4d52275463a2ed53daee5a29) | `ok  gas 56659  verdict 10 detail 3000000` |
| After | | `vault 8 USDC, recipient 2 USDC` |

## Receipts read back (eth_getTransactionReceipt, sepolia.base.org)

| Transaction | Status | Block (UTC time) | Gas used | Logs |
|---|---|---|---|---|
| `0x1312cbdf…` (launch) | `0x1` | 62806514 (01:19:31) | 1,915,772 | launcher `Launched` only (`0x0ece0669…`; its last topic is the USDC address). No token `Transfer`: nothing was minted |
| `0xc71b4c57…` (funding) | `0x1` | 62806525 (01:19:33) | 62,159 | USDC `Transfer` (`0xddf252ad…`), owner to vault, 10,000,000 units |
| `0xaabce206…` (paid 2 USDC) | `0x1` | 62806537 (01:19:36) | 143,297 | USDC `Transfer` (`0xddf252ad…`, emitted by `0x036c…`), vault to `0x…5109`, 2,000,000 units + vault `Paid` (`0xf43b3631…`, 3,000,000 left in the window) |
| `0x34e32be4…` (asked 4 USDC) | `0x1` | 62806548 (01:19:38) | 56,659 | vault `Blocked` only (`0xf063b480…`, code 10, detail 3,000,000: the 3 USDC per-payment limit) |

Read back afterwards with `eth_call`: the vault's `token()` returns the USDC
address, and USDC's `balanceOf` the vault is 8,000,000 (8 USDC).

The payout's transfer was made by USDC's own contract, so this is the same
sealed payout as with test dollars, paying in a token the launcher did not
make.
