# Draft: ask MetaMask to review the HARDSTOP site

Not sent. The owner sends it, through MetaMask support (the security-alerts
help page says URL warnings go to the support team for manual review:
https://support.metamask.io/configure/wallet/security-alerts/).

---

**Subject:** Review request: hardstop-omega.vercel.app flagged as phishing on connect

Hello,

When connecting MetaMask to https://hardstop-omega.vercel.app, MetaMask shows
"Continue at your own risk: This site shows signs of phishing or
wallet-draining activity." I build this site and believe the warning is a
false positive. Please review it.

What the site is: HARDSTOP, an open-source spending limit for AI agents,
entered in the Fe Builders Challenge 2026. The source is public:
https://github.com/vaibhav4046/hardstop

What the site asks a wallet for, and nothing else:

- `eth_requestAccounts`, then `wallet_switchEthereumChain` (or
  `wallet_addEthereumChain`) to Base Sepolia (84532) or Sepolia (11155111),
  both test networks. It never asks for Ethereum mainnet or any other network.
- On first use of a network, one transaction to the deterministic deployment
  proxy `0x4e59b44847b379578588920ca78fbf26c0b4956c` that installs the
  open-source launcher contract (value 0).
- One transaction to the launcher `0x956fbbde5fcb981e5a8507b369c79105815d562d`
  that creates the user's own vault (value 0.00003 test ETH on Base Sepolia,
  passed to the agent's key to pay its network fees).
- Owner actions on that vault (pause, lower a limit, propose a raise).

It never requests token approvals, `eth_sign`, `personal_sign`,
`eth_signTypedData` or permit signatures. The agent key it creates in the
browser is for the agent's own test transactions and is never sent anywhere.

A run of this flow on Base Sepolia, with the transactions, is listed in the
README: https://github.com/vaibhav4046/hardstop#build-and-test

Network: Base Sepolia (84532) and Sepolia (11155111).
Official links: the repository above and https://hardstop-omega.vercel.app

Thank you.
