# A Safe owns a v3 vault (Base Sepolia, 2026-11-24)

The vault checks only that an owner action comes from its owner's address,
so the owner can be a contract. Here it is a 2-of-2 Safe (Safe v1.4.1, the
official deployment on Base Sepolia). A tricked approval then needs a
tricked quorum, and it still waits out the cooling period, where any owner
can see it and the Safe can cancel it.

Script: [`safe-owner-v3/safe-owner.mjs`](safe-owner-v3/safe-owner.mjs). It
uses the site's own `launchVault` and `attach` with a wallet whose every
transaction goes through the Safe's `execTransaction`, signed by both
owners. Both owner keys are throwaway test keys kept outside the repo.

| Step | Transaction | Block (UTC) | Result | Gas |
|---|---|---|---|---|
| Create the Safe: owners `0x2960…1870` and `0x0185…f811`, 2 signatures needed | [`0x33de236e…`](https://sepolia.basescan.org/tx/0x33de236e79407a3ad9f62e54dc2069cd7f75497d98ad40b5821d04183ca6713a) | 63006310 (12:25:30) | Safe `0xC35093fc09108d690412506c6d35941B58aA81BA`; `getOwners` and `getThreshold` (2) read back | 282,407 |
| The Safe launches a vault (v3 launcher `0x4064…d707`), $10 a payment, $20 a day, one-day cooling | [`0x52fba949…`](https://sepolia.basescan.org/tx/0x52fba949f7c0680ab8c14e874ac043705cf51494e8d42331394db2dcf7449d39) | 63006321 (12:25:33) | vault `0x3a4845db4d535ff4154342242b2de48b817ba726`, owner the Safe | 2,038,889 |
| The agent pays $4 | [`0xae733e3a…`](https://sepolia.basescan.org/tx/0xae733e3a221e757e6ec159249c96e8197afde48fbde1ff0b554b33974e8ae365) | 63006332 (12:25:35) | paid | 115,046 |
| The agent raises its own limit | not sent | | reverted `NotOwner` in simulation | |
| **One owner alone** signs a raise to $40 a day | [`0x1088945b…`](https://sepolia.basescan.org/tx/0x1088945bd100c8e0fbd6d7bc698b32d888e0a72a7c9d8b17352696e3b9e50434) | 63006345 | **reverted**: the Safe refuses with `GS020` (not enough signatures); the vault never sees it | 48,558 |
| Both owners sign the same raise | [`0x4d395141…`](https://sepolia.basescan.org/tx/0x4d39514199ec1e396abed2a2998a7e449c135f593b03915165e00c6aa863b4e5) | 63006350 (12:25:38) | queued, not applied: `policy` still $20 a window, `queued` $40; the hosted alert feed showed "A rule change is waiting: it takes effect 2026-11-25T12:25:38.000Z unless you cancel it" | 154,583 |
| The Safe cancels it | [`0x59ff0494…`](https://sepolia.basescan.org/tx/0x59ff04944a66bd17e3efec10b33d5e32f707845ee356b21381b3fb946bbeda1a) | 63006368 (12:25:42) | cancelled | 84,143 |

All receipts were read back from `sepolia.base.org`. The `GS020` reason was
read by simulating the same one-signature call against the Safe.

What this does not show: a Safe *module* (Leash runs as one; a HARDSTOP
vault is a separate contract the Safe owns), and the site's own pages with
a Safe connected (the site's wallet path was not tried with a Safe).
