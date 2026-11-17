export const GITHUB = 'https://github.com/vaibhav4046/hardstop'
/** A file in the repository, e.g. `source('fe/src/kernel.fe')`. */
export const source = (path: string): string => `${GITHUB}/blob/main/${path}`

/** The controlled test cited on the home page (S02 and S03 in research/SOURCE_REGISTER.md). */
export const COINDESK_TEST =
  'https://www.coindesk.com/tech/2026/11/01/ai-agents-bypassed-crypto-spending-limits-without-human-approval-researchers-find-in-a-new-test'
export const IHITL_PAPER = 'https://arxiv.org/abs/2610.35835'
