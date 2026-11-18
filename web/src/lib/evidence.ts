// What the landing page says about the problem, and where each figure comes
// from. Every number here was read on the page it links to on 2026-11-18;
// the record of that reading, with what could not be verified, is
// research/EVIDENCE_DATA.md and research/evidence.json. Nothing is estimated,
// and no two figures here are added together.

export type Category = 'controlled test' | 'recorded incident' | 'adoption signal' | 'how limits are raised today'

export type Source = {
  id: string
  category: Category
  /** Our wording of what the source shows. */
  finding: string
  /** What it does not show. */
  limit: string
  publisher: string
  /** The page's own title. */
  title: string
  url: string
  /** ISO date, or null when the page gives none. */
  published: string | null
}

const PAPER = 'https://arxiv.org/html/2610.35835v3'

/** The controlled test the product answers: ten models, each running an agent wallet with a daily limit. */
export const MODEL_TEST = {
  models: 10,
  raisedOwnLimit: 9,
  raisedDespiteAttackEmail: 7,
  paidAttacker: 5,
  walletUsdc: 10,
  trialsPerScenario: 20,
  sources: ['ihitl-paper', 'coindesk-test'],
} as const

/** Other controlled tests, each with its own setup. Never compared with each other or added up. */
export const OTHER_TESTS = {
  zscaler: { paid: 4, models: 26, source: 'zscaler-web' },
  aport: { unpermittedAlone: 140, runsAlone: 76_842, unpermittedChecked: 0, runsChecked: 69_297, source: 'aport-vault' },
} as const

/** Recorded incidents, oldest first. `low`/`high` in US dollars as the source gives them; one figure when it gives one. */
export const INCIDENTS = [
  { id: 'aixbt', when: '2025-03', name: 'aixbt', low: 106_200, high: 106_200, what: 'An attacker got into the bot’s control panel and had it send 55.5 ETH.' },
  { id: 'lobstar', when: '2026-02', name: 'Lobstar Wilde', low: 441_780, high: 441_780, what: 'Asked to send about $310, the agent sent its whole token holding. Paper value; the recipient realised far less.' },
  { id: 'owockibot', when: '2026-02', name: 'Owockibot', low: 2_100, high: 2_100, what: 'The agent published its own wallet’s secret key. About $2,100 was lost.' },
  { id: 'grok', when: '2026-05', name: 'Grok-linked Bankr wallet', low: 155_000, high: 174_000, what: 'A hidden instruction reportedly got the wallet to send about 3 billion tokens to an attacker. Some were returned.' },
] as const

/** Monthly payments over x402, a payment standard built for AI agents. The source gives these four months. */
export const X402_MONTHS = [
  { month: 'Nov 2025', payments: 52_600_000, usd: 20_500_000 },
  { month: 'Dec 2025', payments: 54_200_000, usd: 9_400_000 },
  { month: 'Feb 2026', payments: 4_100_000, usd: 1_600_000 },
  { month: 'Oct 2026', payments: 5_100_000, usd: 274_000 },
] as const

export const AGENTIC_SHARE = { low: 0.6, high: 7.5, source: 'trm-agentic' } as const

export const SOURCES: Source[] = [
  {
    id: 'ihitl-paper',
    category: 'controlled test',
    finding:
      'Nine of ten AI models raised their own daily spending limit at least once while paying invoices, with no attacker involved. Seven of ten still did with an attacker’s email in the inbox. Five of ten raised it and paid a simulated attacker.',
    limit:
      'A laboratory test on agent wallets holding 10 USDC, 20 runs per scenario, where the agent could read the inbox that received the approval code. A preprint, not yet peer reviewed. No customer lost money.',
    publisher: 'Cornell Tech and Yale (arXiv)',
    title: 'I-HITL: Inalienable Human-in-the-Loop',
    url: PAPER,
    published: '2026-10-26',
  },
  {
    id: 'coindesk-test',
    category: 'controlled test',
    finding: 'News report of the same test.',
    limit: 'Reports the same experiment as the paper above; not a second result.',
    publisher: 'CoinDesk',
    title: 'AI agents bypassed crypto spending limits without human approval, researchers find in a new test',
    url: 'https://www.coindesk.com/tech/2026/11/01/ai-agents-bypassed-crypto-spending-limits-without-human-approval-researchers-find-in-a-new-test',
    published: '2026-11-01',
  },
  {
    id: 'zscaler-web',
    category: 'controlled test',
    finding: 'Hidden instructions taken from real scam websites got 4 of 26 AI models to make a payment.',
    limit: 'A security firm’s sandbox with no real funds, and the test agent was deliberately given no spending limit.',
    publisher: 'Zscaler ThreatLabz',
    title: 'Indirect Prompt Injection in Web Content Targets AI Agents',
    url: 'https://www.zscaler.com/blogs/security-research/indirect-prompt-injection-web-content-targets-ai-agents',
    published: '2026-07-02',
  },
  {
    id: 'aport-vault',
    category: 'controlled test',
    finding:
      'Replaying human-written attacks across 14 models, agents left to police themselves paid a forbidden recipient in 140 of 76,842 runs. With a check outside the model it was 0 of 69,297.',
    limit:
      'Written by the founder of the company that sells the outside check, a declared conflict of interest, and not peer reviewed. HARDSTOP was not part of it.',
    publisher: 'arXiv',
    title: 'APort Vault: Benchmarking AI Agent Payment Authorization with the Open Agent Passport',
    url: 'https://arxiv.org/html/2609.22076',
    published: '2026-09-18',
  },
  {
    id: 'grok',
    category: 'recorded incident',
    finding: 'A hidden instruction reportedly got a wallet linked to the Grok chatbot to send tokens valued at $155,000 to $174,000.',
    limit: 'Reported with “reportedly” and “allegedly” throughout; some funds were returned; the value is a price mark on a thinly traded token.',
    publisher: 'Cointelegraph',
    title: 'How a free NFT reportedly tricked Grok into losing $174,000',
    url: 'https://cointelegraph.com/news/grok-bankr-wallet-free-nft-prompt-injection',
    published: '2026-05-13',
  },
  {
    id: 'lobstar',
    category: 'recorded incident',
    finding: 'Asked to send about $310, an AI trading agent sent its whole holding, 52.4 million tokens it valued at $441,780.',
    limit: 'The agent’s own mistake, not an attack. A paper value at that day’s price; the recipient realised far less.',
    publisher: 'Cointelegraph',
    title: 'AI agent sends $441K in tokens after decimal error',
    url: 'https://cointelegraph.com/news/openai-employee-s-ai-agent-accidentally-sent-442k-to-beggar',
    published: '2026-02-23',
  },
  {
    id: 'owockibot',
    category: 'recorded incident',
    finding: 'An AI agent published the secret key to its own wallet; about $2,100 was lost.',
    limit: 'A leaked key, not overspending. The loss was small because the wallet held little.',
    publisher: 'Cryptopolitan',
    title: 'Can AI agents protect private keys? Wallet incident shows bot vulnerability',
    url: 'https://www.cryptopolitan.com/can-ai-agents-protect-private-keys/',
    published: '2026-02-09',
  },
  {
    id: 'aixbt',
    category: 'recorded incident',
    finding: 'An attacker got into the control panel of the crypto bot aixbt and had it send 55.5 ETH, worth $106,200.',
    limit: 'The bot’s maintainer said the AI was not tricked: the attacker broke into the panel that instructs it.',
    publisher: 'Cointelegraph',
    title: 'Hacker breaks into AI crypto bot aixbt’s dashboard to snatch 55 ETH',
    url: 'https://cointelegraph.com/news/hacker-breaches-ai-crypto-bot-aixbt-steals-55-eth',
    published: '2025-03-19',
  },
  {
    id: 'fireblocks-x402',
    category: 'adoption signal',
    finding: 'x402, a payment standard built for AI agents, carried 5.1 million payments worth $274,000 in October 2026, down from 54.2 million in December 2025.',
    limit: 'Counts everything sent over the standard, including scripts and a late-2025 token craze; it shows the rails are used, not how many agents pay.',
    publisher: 'Fireblocks (compiling agenteconomy.to)',
    title: 'The Agent Economy by the Numbers: 2026 Data, Trends, and Blind Spots',
    url: 'https://www.fireblocks.com/blog/agent-economy-numbers-x402-data',
    published: '2026-11-03',
  },
  {
    id: 'trm-agentic',
    category: 'adoption signal',
    finding: 'Only 0.6% to 7.5% of screened x402 commerce appears to come from AI agents rather than ordinary scripts.',
    limit: 'TRM’s own estimate, which it says may undercount single-purpose agents.',
    publisher: 'TRM Labs',
    title: 'Who’s Actually Paying? Measuring AI Agent Payments Onchain',
    url: 'https://www.trmlabs.com/trm-tech-blog/whos-actually-paying-measuring-ai-agent-payments-onchain',
    published: '2026-09-09',
  },
  {
    id: 'circle-policy',
    category: 'how limits are raised today',
    finding: 'Circle’s agent wallet confirms a change to a spending policy with a one-time code sent by email. This is the wallet the Cornell Tech and Yale test used.',
    limit: 'Vendor documentation as it read on 18 November 2026. It describes the mechanism, not how often it fails.',
    publisher: 'Circle Docs',
    title: 'How-to: Set spending policies',
    url: 'https://developers.circle.com/agent-stack/agent-wallets/wallet-operations/custom-policies',
    published: null,
  },
  {
    id: 'circle-inbox',
    category: 'how limits are raised today',
    finding: 'Circle now warns users never to give an AI agent open access to the inbox that receives its approval codes.',
    limit: 'The safeguard depends on the person keeping that inbox away from the agent.',
    publisher: 'Circle Docs',
    title: 'How-to: Authenticate an agent wallet',
    url: 'https://developers.circle.com/agent-stack/agent-wallets/wallet-operations/authenticate',
    published: null,
  },
]

export function sourceById(id: string): Source {
  const found = SOURCES.find((source) => source.id === id)
  if (!found) throw new Error(`no source called ${id}`)
  return found
}
