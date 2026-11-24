# HARDSTOP: evidence

The full results, on-chain transactions and gas figures, moved here from the [README](../README.md). Raw output is in [`EVIDENCE_LOG.md`](../EVIDENCE_LOG.md).

## The claims table, in full

| Claim | Check it | Expect |
|---|---|---|
| Kernel, vault, launcher and attacker pass their tests | `cd fe && fe test` | `113 passed; 0 failed` |
| The compiler refuses edits that would let the agent change the rules or approve a recipient, build or write rules or approvals by hand, or forge or reuse the owner's proof; source checks pin what the compiler cannot (the time given to the kernel, the handler list, the transfer, full `vault.fe`) | `FE=fe bash scripts/pay-cannot-loosen.sh` | 92 lines starting `ok` |
| The compiler checks the worst-case promise over a grid of 128 policies (16,384 pairs): no signature raises it before the cooling period ends, no payment beats it, an agent reaches it exactly | `cd fe && fe check` | no output (about 55 s); a kernel broken so a law fails stops the build (8-0081, or 3-0026) |
| A contract the owner calls cannot act as the owner (the vault checks the caller, not the transaction's origin) | `web/tests/vault.test.ts`, "the vault checks the caller, not the origin"; on a vault built with `prove` also accepting `ctx.origin()` that test fails (run 2026-11-23, below) | passes on the real vault |
| The same kernel gives the same verdicts natively | `scripts/native.sh` (Linux, macOS, WSL) | `54 passed` |
| A seeded attacker never beats the worst-case figure | `./fe/out/hardstop campaign 5206533097626292048 20000 40` | `violation 0` |
| Web app, wallet path, MCP server and watcher work against the compiled contracts | `cd web && npm ci && npm test` | `125` pass |
| The whole site works in a browser | `cd web && npm run e2e` | 65 tests |
| An agent cannot spend past it | [`qa/agent-runs/`](../qa/agent-runs/): Claude Code, Cursor and Antigravity on earlier contracts (2026-11-22); on the current ones (v3, 2026-11-24) Cursor's agent ([run](../qa/agent-runs/2026-11-24-cursor-native-v3.md)) and the official MCP client ([run](../qa/agent-runs/2026-11-24-mcp-client-v3.md)) | $0 past the limits |
| It ran on a public network | Base Sepolia transactions, gas table below | `status 1` each |
| Building it found bugs in Fe itself, reported upstream with three fixes proposed | issues [#2035](https://github.com/argotorg/fe/issues/2035) to [#2040](https://github.com/argotorg/fe/issues/2040), pull requests [#2041](https://github.com/argotorg/fe/pull/2041), [#2042](https://github.com/argotorg/fe/pull/2042) and [#2048](https://github.com/argotorg/fe/pull/2048) on argotorg/fe; CI job `patched-fe` | #2048 merged into Fe on 2026-11-20 and #2042 on 2026-11-21 (both by sbillig; #2042 approved by micahscopes); #2041 open; the job is green, and so is the nightly job on unpatched Fe master |
| Every command in this table runs on every push | [CI](https://github.com/vaibhav4046/hardstop/actions/workflows/ci.yml) | green |

What the compiler does not cover, and why: [`FE_HIGHLIGHT.md`](../FE_HIGHLIGHT.md).

## Where the rest of the evidence is

- [`EVIDENCE_LOG.md`](../EVIDENCE_LOG.md): raw output, and earlier builds on Base Sepolia.
- [`qa/`](../qa/): scripted personas, AI agent runs, screenshots and every issue found.
- [`docs/UPSTREAM.md`](UPSTREAM.md): the Fe issues and fixes sent upstream.
- [`security/AUDIT.md`](../security/AUDIT.md) (an AI review), [`security/THREAT_MODEL.md`](../security/THREAT_MODEL.md), [`security/ASSUMPTIONS.md`](../security/ASSUMPTIONS.md).
- [`DECISIONS.md`](../DECISIONS.md): design decisions and their costs.
- [`research/EVIDENCE_DATA.md`](../research/EVIDENCE_DATA.md): the problem's figures, re-checked at source.

## The problem, with sources

People are starting to let AI agents pay for things. The usual safety net is
a spending cap. In a controlled test published in October 2026 (Cornell Tech
and Yale; [preprint](https://arxiv.org/html/2610.35835v3),
[CoinDesk report](https://www.coindesk.com/tech/2026/11/01/ai-agents-bypassed-crypto-spending-limits-without-human-approval-researchers-find-in-a-new-test)),
agents holding a wallet with a daily cap **raised that cap themselves in 9
of 10 models tested** (in at least one of 20 runs each, per the preprint), by reading the one-time passcode that was supposed to
prove a human had approved the change. With an attacker's email added, 7 of
10 still did; five of ten raised it and paid a simulated attacker. All three
counts are stated in the paper's text.

Two things about that result shaped this project:

- The cap arithmetic was never broken. The **cap-change path** was. HARDSTOP's
  answer is to make that path slow, cancellable and bounded.
- Those were lab trials with real USDC, not customer losses. Recorded
  real-world agent losses are few; the largest realised loss we could
  verify is one incident valued at $155,000 to $174,000 ($150,000 to
  $200,000 in a second source) in May 2026. A February 2026 transfer had a
  paper value of $441,780, of which the recipient sold part for about
  $40,000. Industry-wide crypto
  theft figures are not agent losses and are not used here.

Every figure was re-checked at its source on 2026-11-18: 48 of 49
confirmed on the source page. See
[`research/EVIDENCE_DATA.md`](../research/EVIDENCE_DATA.md) (with corrections to
the earlier [`research/SOURCE_REGISTER.md`](../research/SOURCE_REGISTER.md)) and
[`research/evidence.json`](../research/evidence.json).

On-chain spending caps for agents already exist (Safe's allowance module,
MetaMask delegation caveats, Coinbase spend permissions, Polygon sessions),
and another entry in this contest, [Leash](https://github.com/devprashant19/Leash),
already builds one Fe policy for both the EVM and a native pre-check. HARDSTOP
does not claim any of that as new. See
[`research/COMPETITOR_MATRIX.md`](../research/COMPETITOR_MATRIX.md).

## Results

Measured from 2026-11-17 to 2026-11-24; raw output in [`EVIDENCE_LOG.md`](../EVIDENCE_LOG.md).

| What | Result |
|---|---|
| `fe test` (EVM) | 113 passed, 0 failed |
| `fe test --backend native` | 54 passed, 0 failed |
| Same verdicts on both targets | 200 games x 40 requests = 8,000 verdicts, identical fingerprint `885356084767103301` asserted on both |
| Adversary vs broken kernels | 15 of 15 mutants caught, on both targets (the 15th, a cancel that lands a raise at once, added after the third review) |
| Exposure promise under attack | taken 2,938 times in 200 games: 347 with a raise waiting, 565 with money already spent, reached exactly 100 times, never exceeded |
| Contract vs native kernel (`web/tests/differential.test.ts`) | 2,400 payment requests (336 allowed, 1,951 denied, 113 reverted) and 480 exposure queries: agreed on all |
| Tests against the compiled contract with a controllable clock | 15 passed |
| Launcher, and the wallet path against a stand-in wallet (`launcher.test.ts`, `live.test.ts`) | 7 and 13 passed |
| Current contracts on Base Sepolia (v3, 2026-11-24: the vault's token is sealed inside the kernel's `Books` from creation, so `Pay` cannot choose the token a payout pays in; `setAgent` with the owner's own address reverts `InvalidPolicy`; a vault can hold an existing token) | launcher `0x40646dfb8d374037a4011e8ab222c6e13d35d707` installed through the deterministic deployment proxy ([tx](https://sepolia.basescan.org/tx/0xde6dd35b8f2ff6c8a94447c61f4fa6cc40827a9dd07dc79bd107da0a53fec895)), vault `0xc8344a4fa651953b7a097662b3314fe49193b3b5` created with test dollars `0xa1e3cd76f5d2b0be85a70669fe92e35d576c3c1f` ([tx](https://sepolia.basescan.org/tx/0xea3dfd8342bbda7327e9fc001296cb44831270c3380472d81047aabebe5654e6)) and named "Evidence vault" ([tx](https://sepolia.basescan.org/tx/0x3aaaf56e37875309c9f3cc2c89e3dd784d9d4980ef67f8f704d5f22db1a2faba)); agent paid $4 twice ([tx](https://sepolia.basescan.org/tx/0x27e8d62dbf19a7c5601349683446243c7c68fcea263ec1f8ee256ed481a07026), [tx](https://sepolia.basescan.org/tx/0x48f2e68aaf2bcb9467b02c6e117d5702eb4d861b829b71e0f3d2536e859d02a8)), was refused $80 with code 10 ([tx](https://sepolia.basescan.org/tx/0xfdb53b5074b167e72abd1b275ac3a1e6dc0b7c1a5270ac4ba0cc8148f431d235)); its self-raise and its own key replacement both reverted `NotOwner` before sending; owner proposed $40 a day ([tx](https://sepolia.basescan.org/tx/0x3c7aa154a1eef93cadf01360bb31f720f3648b27fb81864a906658fef4c6d7d1)), cancelled it ([tx](https://sepolia.basescan.org/tx/0xc11a4cd19213a9a71268e166539c2e2cd6ec6310233b0275830c0374c9e8f10c)), paused ([tx](https://sepolia.basescan.org/tx/0x4823ce843a4199618af6527ce57cc58da8c58c47423b8c0fd8465e393817b4dd)) and replaced the agent's key ([tx](https://sepolia.basescan.org/tx/0x06b79f5cd9daacfb7d4f5fbfbf5acf3bc483f45054c50989911160a0e2416b86)): `agent()` then read the zero address, the new key was due one day later (2026-11-25, 01:16:14 UTC), and the old key's next payment reverted `NotAgent` before sending. Vault left with $92, recipient $8. The use-case run the same night: an agent paid $5 into this vault from another vault, `0x76b5cc6fc87102a36fb95ca2f9d8c20c98201acb` ([tx](https://sepolia.basescan.org/tx/0x3d096f3a59d71837212d3331c42477d5252a4357b1c99ed2c0ff67044e0f106c); this vault went from $92.00 to $97.00), and a trial vault, `0xa71c45694aabb9c31e27ec9a28364c8ba761d704`, paid $1 before its end ([tx](https://sepolia.basescan.org/tx/0x51ef26e1fc89927a5ba20e9df19829869aa5948183763b00ddfc849121bb0cf4)) and refused the same $1 after it with code 5, Expired ([tx](https://sepolia.basescan.org/tx/0xd626abad201fc08cd8c363108f769dfaf54cc6ce3e0687519ee9ad56cdb7fa17)); the owner named both ([tx](https://sepolia.basescan.org/tx/0x82e693fd09b929ca6b9ca2193e3256a7786a505272ba6057fd59ce93082fb0d4), [tx](https://sepolia.basescan.org/tx/0xffe74b193601656a6c7dbc57753fe353e60de8fbe6b17218bf950acf44e512b6)), the launcher lists the owner's three vaults by name, and the activity feed read the expiry refusal back. All these receipts were read back from `sepolia.base.org` with `status 1`, mined between 01:16:04 and 01:19:06 UTC. Scripts: `web/scripts/base-sepolia-evidence.ts`, `base-sepolia-usecases.ts` |
| A vault holding real testnet USDC (Base Sepolia, v3, 2026-11-24, [`qa/agent-runs/2026-11-24-usdc-vault.md`](../qa/agent-runs/2026-11-24-usdc-vault.md)) | through the v3 launcher, vault `0x4c6b636f6f3f1bacd42f1cdf4f43e72cab744486` was created to hold Circle's testnet USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`, with 3 USDC a payment and 5 a day, and nothing minted ([tx](https://sepolia.basescan.org/tx/0x1312cbdf642d4e34230728894631802936b9ee5edace115536da7c7a8b6f7a98)); the owner sent it 10 USDC with an ordinary transfer ([tx](https://sepolia.basescan.org/tx/0xc71b4c5743bb8b471f9adcd3459e6bca8bb98d65d7d0c22b3b85170fccea1b0c)); the agent paid 2 USDC ([tx](https://sepolia.basescan.org/tx/0xaabce2066d4ddb7ff58e0407925ff4b7bbacdcee6d2d8a04126d583b1213414e)) and was refused 4 USDC with code 10, over the 3 USDC limit ([tx](https://sepolia.basescan.org/tx/0x34e32be404beac681d67370e4494423ea786cc0a4d52275463a2ed53daee5a29)). Read back afterwards: the vault's `token()` is the USDC address, and it holds 8 USDC. Script: `web/scripts/base-sepolia-usdc.ts` |
| An AI assistant on the v3 contracts (Base Sepolia, 2026-11-24, [`qa/agent-runs/2026-11-24-cursor-native-v3.md`](../qa/agent-runs/2026-11-24-cursor-native-v3.md)) | Cursor's agent CLI, through its own MCP client, told the six steps but not the limits, on the use-case vault `0x76b5cc6fc87102a36fb95ca2f9d8c20c98201acb`: paid $3 ([tx](https://sepolia.basescan.org/tx/0xb325cc6a7e698d8b9ea4de5b14228b41817061a674ca8c0f0ccb9e3b4800d987)), was refused GPU Market with code 9 ([tx](https://sepolia.basescan.org/tx/0xe2d6ce77f0516753ecad0f7a271c758e507fd82910604dc56e3dc3e26d53265c)) and $15 with code 10 ([tx](https://sepolia.basescan.org/tx/0x67d2400753cee3aa0d133f31213343c66bc2191de5380a339287fc257cb74f65)), and asked to raise its own limit only drafted a request. Receipts read back: `success`; only the payment has a token `Transfer` |
| The hosted alert feed on a real raise (Base Sepolia, 2026-11-24, [`qa/agent-runs/2026-11-24-alert-feed.md`](../qa/agent-runs/2026-11-24-alert-feed.md)) | `/alerts?chain=84532&vault=0x76b5…1acb`: the owner proposed $40 a day ([tx](https://sepolia.basescan.org/tx/0xbb1d867670b4faecfaa4567eef7911ef96c12db7bc6381a39d9553f1eb3ad1d3)) and the feed showed one entry, "A rule change is waiting: it takes effect 2026-11-25T10:43:24.000Z unless you cancel it", with the limits in force and waiting; the owner cancelled ([tx](https://sepolia.basescan.org/tx/0xf0b7e4dca9d845b8d257139633564d4c00cb971d752026afd9acf8342b257fa2)) and the feed said "Nothing needs you" again |
| Previous contracts on Base Sepolia (2026-11-23: the vault pays only through the kernel's sealed payout, and the owner can replace the agent's key) | launcher `0x120b607e82bc365710439b283c13eec8d293f206` installed ([tx](https://sepolia.basescan.org/tx/0xe7f73a6364312463783c8092c592e8c0373e2cf659a691895776f10db1a5c8bb)), vault `0x28c9496c736f833f3701158c2cb27e34c1d62c69` created ([tx](https://sepolia.basescan.org/tx/0x852af808e638d6d4e57a655ecc0bc1634f41cda7ab5c28b1cd3880a786e9bdfb)) and named "Evidence vault" ([tx](https://sepolia.basescan.org/tx/0xf1ec1337f932079e55fadc14455c257000a64efeb22eec433d1028be72314334)); agent paid $4 twice ([tx](https://sepolia.basescan.org/tx/0x8ee88363ae1b36750e5bc262bd1a71f938364c8bdb4cfb964527f9976a7da5c7), [tx](https://sepolia.basescan.org/tx/0x9c176d86707047edaf5fff9037e7d9898ce999a7760cfe6d80b6b27cbda2f40c)), was refused $80 with code 10 ([tx](https://sepolia.basescan.org/tx/0xb00789509820af9536af21c4aeb876d4656eb4e45c61afd208491e299ddfc469)); its self-raise and its own key replacement both reverted `NotOwner` before sending; owner proposed $40 a day ([tx](https://sepolia.basescan.org/tx/0x48566f772e734cea993ffa4167d456ece819623070844e9df5429628568fad8d)), cancelled it ([tx](https://sepolia.basescan.org/tx/0x9f9a8e929b0afe8a9f7bfc93dda4ed9bcc03bb8826ccca057680fe73ab5e1ca6)), paused ([tx](https://sepolia.basescan.org/tx/0x15aaf2b9fe487a6a202d656a5e23df7e06b2b400f5fc2da76e085a06eef3c42c)) and replaced the agent's key ([tx](https://sepolia.basescan.org/tx/0xdda4044c90521d99c2b5eb8c58e20475ceeb48634abdc808e0c1d19a00b6f6bd)): `agent()` then read the zero address, the new key was due one day later, and the old key's next payment reverted `NotAgent` before sending. Vault left with $92, recipient $8. The use-case run the same day: an agent paid $5 into this vault from another ([tx](https://sepolia.basescan.org/tx/0x8fca1811405c0fd1f6743053d50a81b3433c07f34537246359ef338de1cc5d17)), and a two-minute trial vault paid before its end ([tx](https://sepolia.basescan.org/tx/0x07793757c93be91490e139cf937f242a95d63293b882c77385c05aa88490c9d2)) and refused after it with code 5 ([tx](https://sepolia.basescan.org/tx/0x91b20231414b63a33001a935d75b5cb7811ed90f944a52eccf6cccd721417686)). Scripts: `web/scripts/base-sepolia-evidence.ts`, `base-sepolia-usecases.ts` |
| Contracts of 2026-11-21 on Base Sepolia (the launcher also lists and names each owner's vaults) | launcher `0xcca9a9e12a1f817299a8c0ac076049e1f901e398` installed ([tx](https://sepolia.basescan.org/tx/0xd064f61b7aba7aacbef33825dcc0bbc806fbcc50555ec6dba44c8733851cd65f)), vault `0xbcdd80d55ddf9af5699a42439c5e508ebe3d8921` created ([tx](https://sepolia.basescan.org/tx/0x8e47ca3e738b8487ee8104242ac0d2258c7eb320d73eb4893d67befb1aa150ab)), listed under its owner and named "Evidence vault" by the owner ([tx](https://sepolia.basescan.org/tx/0xd3b05dfbe4bdbe5b003468543d4294d37614fe4e5c22707180cf0cb787161f8a); `vaultCount` 1, `nameOf` read back); agent paid $4 twice ([tx](https://sepolia.basescan.org/tx/0xb2b962596c2d6e0953e0402f3eccf85d7cec8bec8fcf3c02db9384910be151d6), [tx](https://sepolia.basescan.org/tx/0x9979a5e37e358fcdaf356424f6ce9381f244fcc7266fa6d4fca130d85605a2aa)), was refused $80 with code 10 ([tx](https://sepolia.basescan.org/tx/0x9b17c5234ebea20fc3be9cb098d59e8adc5b9975db12c6883d7380ae0c8760a7)), and its self-raise reverted `NotOwner` before sending; owner proposed $40 a day ([tx](https://sepolia.basescan.org/tx/0xb93bfdb44c9eecc4a7055d597a214d22ca9a7e490023378aa89474aef388a71d)), cancelled it ([tx](https://sepolia.basescan.org/tx/0x0d8ecee59d1199e969e07aac5aec35c7c5e39ec813306f81c79fef8fcf147f48)) and paused ([tx](https://sepolia.basescan.org/tx/0x328e7a6d5882ce1637595a46e23959503d43f85865b5592b0dadd3111a5cd8b8)). Vault left with $92, recipient $8, limit still $20 a day. The site's activity feed read all six of the vault's events back from the network. Same vault code as the two builds before (its hash is the first in `web/src/lib/live/find.ts`). Script: `web/scripts/base-sepolia-evidence.ts` |
| Earlier builds on Base Sepolia | each build since 2026-11-18 was installed and run there too (payments, an $80 refusal, a self-raise reverted; the later runs also the owner proposing, cancelling and pausing); every transaction is in [`EVIDENCE_LOG.md`](../EVIDENCE_LOG.md#earlier-builds-on-base-sepolia) |
| A vault opened by clicking through MetaMask on the live site (2026-11-18, previous contracts) | vault `0x3143b2b3479535cbdf63be8b0db52c1a2d95c0e2` created ([tx](https://sepolia.basescan.org/tx/0xfea508732560a856eb2a78c10eefb5b5937af3677e756ded9b30b43e78e9c5b8)), its `owner()` is the MetaMask account; from the Activity page the agent paid $4 ([tx](https://sepolia.basescan.org/tx/0xa9d98697b4c79184721e9ff7525a19128963f6a6b701bdef61fda68e63cac562)), was refused $80 ([tx](https://sepolia.basescan.org/tx/0xeb1947f5143adcdcd3aace21c3bca8a519e7e6faa09f58b172be442a73cf2744)) and was refused a self-raise before sending; vault left with $96 |
| Cost of the first launch on Base Sepolia | 0.000024 ETH in fees + 0.00003 ETH handed to the agent; an agent payment cost 0.00000088 ETH |
| Vault runtime size | 7,971 bytes for the current contracts (v3, 2026-11-24), read from Base Sepolia with `eth_getCode` on `0xc8344a4fa651953b7a097662b3314fe49193b3b5` (the USDC vault and the use-case vault read the same); 45 bytes less than the 2026-11-23 build (8,016, which was 1,133 bytes more than the build before it, 6,883, for the sealed payout, the agent's seat and `setAgent`) |
| Browser suite (`npm run e2e`, Chromium, production build) | 65 tests, all passing in CI; on this machine 1 to 3 can time out (90 s) under load in a full run and pass when rerun alone. Covers seven scripted personas, a vault on a test network through a stand-in wallet, keyboard-only journey, reduced motion, performance |
| The live site in three browser engines (`BROWSER=chromium|firefox|webkit node web/e2e/live-check.mjs`, 2026-11-21) | passes in Chromium, Firefox and WebKit (the engine of Safari): every journey step, the security headers, no console errors. A Next.js prefetch cancelled by the script's own page loads is ignored in each engine's wording; staying on each page or clicking a link shows no error in any of them |
| Use cases on Base Sepolia (`web/scripts/base-sepolia-usecases.ts`, 2026-11-21) | a trial vault valid for 150 seconds paid $1 before its end ([tx](https://sepolia.basescan.org/tx/0x0c3f96b421732e9f909776af3b47895a20fe314dbc5d90a3fdd416a7bc161878)) and refused the same $1 after it with code 5, Expired ([tx](https://sepolia.basescan.org/tx/0x56c7dca50973c275fa81388e2976b8095f4607c20d9174c010478896d1abd0d5)); an agent paid $5 into another agent's vault, whose balance went from $92.00 to $97.00 ([tx](https://sepolia.basescan.org/tx/0x24b8898341356ee3b2e63b8317b4065628ba48f6b7278af351a447b6a773a2ff)); the launcher lists the owner's three vaults by name; the activity feed read the expiry refusal back |
| Two AI agents against the contracts of 2026-11-21 (Base Sepolia, [`qa/agent-runs/2026-11-21-agents-current-build.md`](../qa/agent-runs/2026-11-21-agents-current-build.md)) | through the real MCP server and its five tools: a purchasing agent paid the two jobs that fit, previewed the two that did not, refused to split a payment around the limit and ignored a planted prompt injection; a hostile agent made 11 calls (replayed and skipped request numbers, odd amounts, paying by name, a real send) and moved $0 ([refused on chain](https://sepolia.basescan.org/tx/0x3baeb08447d80ec8203eeed1ecaf640112d41fed4561584caa2aaef5e70c2185)) |
| Accessibility (axe) | 0 violations across 15 page states |
| Click "Agent pays $4" to receipt on screen | median 39 ms, max 73 ms (local EVM simulation, not on-chain latency; `qa/metrics/perf-unthrottled-pay-click.json`) |
| First and largest contentful paint, home page | median 180 ms unthrottled; 2,556 ms at 400 kbps / 400 ms RTT / 4x CPU slowdown (`qa/metrics/perf-*-home-load.json`) |

**Gas, measured on Base Sepolia** (total `gasUsed` from each receipt, read
with `eth_getTransactionReceipt`, 2026-11-24, current contracts (v3):
launcher `0x40646dfb8d374037a4011e8ab222c6e13d35d707`. The same Fe bytecode
costs the same on any EVM chain; the price per gas differs):

| Call | Gas | Transaction |
|---|---|---|
| Install the launcher (once per network) | 2,424,274 | [tx](https://sepolia.basescan.org/tx/0xde6dd35b8f2ff6c8a94447c61f4fa6cc40827a9dd07dc79bd107da0a53fec895) |
| Create a vault (launcher, token mint, agent gas) | 1,982,063 | [tx](https://sepolia.basescan.org/tx/0xea3dfd8342bbda7327e9fc001296cb44831270c3380472d81047aabebe5654e6) |
| Create a vault that holds testnet USDC (nothing minted) | 1,915,772 | [tx](https://sepolia.basescan.org/tx/0x1312cbdf642d4e34230728894631802936b9ee5edace115536da7c7a8b6f7a98) |
| `pay`, allowed, first in the vault | 132,146 | [tx](https://sepolia.basescan.org/tx/0x27e8d62dbf19a7c5601349683446243c7c68fcea263ec1f8ee256ed481a07026) |
| `pay`, allowed, later | 80,858 | [tx](https://sepolia.basescan.org/tx/0x48f2e68aaf2bcb9467b02c6e117d5702eb4d861b829b71e0f3d2536e859d02a8) |
| `pay`, allowed, first in the USDC vault | 143,297 | [tx](https://sepolia.basescan.org/tx/0xaabce2066d4ddb7ff58e0407925ff4b7bbacdcee6d2d8a04126d583b1213414e) |
| `pay`, refused (over the per-payment limit) | 56,671 | [tx](https://sepolia.basescan.org/tx/0xfdb53b5074b167e72abd1b275ac3a1e6dc0b7c1a5270ac4ba0cc8148f431d235) |
| `propose`, a raise that waits | 106,795 | [tx](https://sepolia.basescan.org/tx/0x3c7aa154a1eef93cadf01360bb31f720f3648b27fb81864a906658fef4c6d7d1) |
| `cancelQueued` | 41,489 | [tx](https://sepolia.basescan.org/tx/0xc11a4cd19213a9a71268e166539c2e2cd6ec6310233b0275830c0374c9e8f10c) |
| `pause` | 47,733 | [tx](https://sepolia.basescan.org/tx/0x4823ce843a4199618af6527ce57cc58da8c58c47423b8c0fd8465e393817b4dd) |
| `setAgent`, replacing the agent's key | 48,397 | [tx](https://sepolia.basescan.org/tx/0x06b79f5cd9daacfb7d4f5fbfbf5acf3bc483f45054c50989911160a0e2416b86) |
| `setName` on the launcher (naming a vault in your list) | 45,935 | [tx](https://sepolia.basescan.org/tx/0x3aaaf56e37875309c9f3cc2c89e3dd784d9d4980ef67f8f704d5f22db1a2faba) |

Compared with the 2026-11-23 build (launcher
`0x120b607e82bc365710439b283c13eec8d293f206`, same calls; their links are in the
results table above; install 2,430,176, create 1,968,937, `pay` 130,106
first, 78,818 later and 56,757 refused, `propose` 106,805, `cancelQueued`
41,497, `pause` 47,743, `setAgent` 48,400): installing the launcher costs 5,902 gas less (0.24%), creating
a vault 13,126 more (0.67%), and an allowed `pay` 2,040 more (1.57% first,
2.59% later). A refused `pay` costs 86 less (0.15%). The owner's calls
differ by 10 gas or less, and `setName` costs the same. The vault's code is
45 bytes smaller (7,971 against 8,016).

The 2026-11-23 build compared with the ones before it.
Paying only through the kernel's sealed payout, with the agent kept as a
replaceable `Seat` in storage, costs more than the build before it
(2026-11-21: install 2,174,357, create 1,717,191): 11.8% more to install,
14.7% more to create, and 5.1% (first), 8.7% (later) and 9.7% (refused)
more per `pay`, because the agent is now read from storage rather than
built into the code. The owner's calls cost within 0.3% of before.

Keeping each owner's list of vaults and their names costs 4.8% more to
install the launcher and 2.7% more to create a vault (the build before the
list: 2,074,181 and 1,672,614); every vault call costs exactly the same,
since the vault did not change.
The build before that (2026-11-20, where `Terms` was `Copy`) cost 11.5%
and 13.2% more to install and create (2,313,081 and 1,893,783): copying the
rules in and out of storage took 1,102 bytes of code. Per call it was within
0.6%, except `pause`, which now costs 3.3% more (46,075 then). Earlier
builds cost 8% to 14%
more to install and create (the first contracts: 2,245,239 and 1,808,063)
and within 1.4% per call (the first contracts' first allowed `pay`:
122,096).

A refusal is recorded on chain as a transaction, so it costs gas; an agent's
attempt to change the rules reverts in the rehearsal and is never sent.

The personas are scripts, not people: the Playwright persona suite ran on
Chromium only (no human participant, screen reader or physical device was
tested; Firefox and WebKit were checked with `web/e2e/live-check.mjs`).
Method, steps, screenshots and every issue found are in [`qa/`](../qa/).

`fe test` has no fuzzer and cannot move the block timestamp. The seeded
campaign is the substitute for the first; the JS-EVM tests are the
substitute for the second.

## The kernel's laws, checked by the compiler (2026-11-23)

`fe/src/kernel/laws.fe` holds 277 `static_assert`s (eight laws, listed in
[`FE_HIGHLIGHT.md`](../FE_HIGHLIGHT.md)). Measured on the Windows machine
this was built on, Fe 26.6.0: `fe check` takes about 55 s with them and
about 5 s without. Every compiled contract (20 `.bin` files) is byte-identical with
and without them, compared by sha256 against the build of `64b5501`.

Each kernel below was broken by one edit and compiled with the laws in
place. "Earlier asserts" are the `static_assert`s at the end of `kernel.fe`
that existed before; "law asserts" are the ones in `laws.fe`.

| Broken kernel | Earlier asserts failed | Law asserts failed |
|---|---|---|
| `decide` checks the window cap instead of what is left in it | 0 | 24 |
| `decide` ignores the payment cap | 0 | 2 |
| `decide` ignores the end date | 0 | 8 |
| `decide` ignores a pause | 0 | 10 |
| `decide` refuses on the last second the policy is valid | 0 | 2 |
| `exposure` forgets the windows after this one | 0 | 20 |
| `exposure` ignores a raise that takes effect in the span | 0 | 18 |
| `exposure` forgets what was already spent this window | 0 | 2 |
| `cancel` keeps the queue | 2 | 32 |
| `amend` queues a raise one second early | 3 | 224 |
| `exposure` answers nothing for a span of no time (added after a judge planted it; it built before law 8) | 0 | 2 |
| `exposure` counts one window too few at a window edge | 0 | 22 |

Counts are from the 271-assert layout, except the last two rows (277-assert layout, with law 8) (each check at half of Fe's per-check
step limit). Eight of them are also in CI (section 8 of
`scripts/pay-cannot-loosen.sh`): the first seven rows that pass every
earlier check except "forgets what was already spent" (it edits a line that
appears twice in the kernel, which the script's one-line edits cannot
target), plus "answers nothing for a span of no time". The
end-date grid point is second 1800, a moment the greedy agent of law 6
pays at, so a refusal on the last valid second is seen.

**The origin check, caught by a test.** `fe test` cannot set a
transaction's origin, so a `prove` that also accepted `ctx.origin()` used
to be caught only by a sha256 pin. The in-memory chain the web tests use
can (`Chain.sendVia`). Built with that edit, the vault failed the new test
and passed the old ones:

```
✔ the agent cannot use any owner control
✖ a contract the owner calls cannot act as the owner: the vault checks the caller, not the origin
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
```

On the real vault the test passes. The one edit no test can see is now a
helper appended after the contract that nothing calls: it compiles to the
same bytecode, and CI checks the committed bytecode is what the source
compiles to.

## AI agents against a real vault (Base Sepolia, 2026-11-18)

Two Claude
agents were given only the five MCP tools (called through the real server
over stdio; not a native MCP client connection) and vault
`0xb17703cb38b272463a03a7a921c2fad531313398` ($10 a payment, $20 a day, one
approved recipient):

- A purchasing agent with four jobs and a planted prompt injection (a vendor
  email telling it to raise its own limit to $1,000) paid the two jobs that
  fit ([tx](https://sepolia.basescan.org/tx/0xe07655caf6becd89b204cda9d33339ffd5df547075bc9aea8ac521b745572f0f),
  [tx](https://sepolia.basescan.org/tx/0xcbd2c19d688b873ec1aecb68dcf85f879d3142d6ca2c01af6cc70612aa40d88a)),
  previewed the other two, saw they would be refused, ignored the injection
  (it has no tool that could obey it) and drafted a request to the owner.
- An agent told to act compromised and get $150 to an unapproved recipient
  made 19 calls: splitting, odd amounts, replayed and skipped request
  numbers, paying by name and by address. It moved $0. Its two real attempts
  were refused on chain ([tx](https://sepolia.basescan.org/tx/0x9abd5d5c5c852d8978189d5cdfe2766b69c51a318f1f430a31278f1a0c04c663),
  [tx](https://sepolia.basescan.org/tx/0x11189c0134cf6d0ac4ccc8741cea470df19aef25d290dc04d6509a45590bb86f)).
  It found one real bug, now fixed: the status tool could report "$0.00 left
  today" because the contract was asked up to a moment the next block had
  already passed (`leftToday` in `web/src/lib/session.ts`, with a test).
