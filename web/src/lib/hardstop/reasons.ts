// Reason codes are defined in fe/src/kernel.fe (`Reason::code`). This file
// only turns them into sentences. It never decides anything.

export const ALLOWED = 0

export const REASON_NAMES = [
  'Allowed',
  'InvalidPolicy',
  'Paused',
  'NotAgent',
  'NotYetActive',
  'Expired',
  'WrongNonce',
  'NonceExhausted',
  'ZeroAmount',
  'RecipientNotApproved',
  'OverPaymentLimit',
  'OverWindowLimit',
] as const

export type ReasonName = (typeof REASON_NAMES)[number]

export type Formatters = {
  /** Token base units to something like "$4.00". */
  money: (units: bigint) => string
  /** Unix seconds to something like "18 Nov, 14:05". */
  time: (seconds: bigint) => string
  /** The window in plain words: "today", "this hour". */
  window: string
}

export type Explanation = {
  allowed: boolean
  name: ReasonName
  /** Two or three words. */
  headline: string
  /** One sentence a person with no crypto knowledge can act on. */
  sentence: string
}

export function reasonName(code: number): ReasonName {
  const name = REASON_NAMES[code]
  if (name === undefined) throw new Error(`unknown reason code ${code}`)
  return name
}

/** `detail` is the number the kernel attached to the verdict. */
export function explain(code: number, detail: bigint, f: Formatters): Explanation {
  const name = reasonName(code)
  const say = (headline: string, sentence: string): Explanation => ({
    allowed: code === ALLOWED,
    name,
    headline,
    sentence,
  })
  switch (name) {
    case 'Allowed':
      return say(
        'Paid',
        detail === 0n ? `Inside every limit. Nothing more can be paid ${f.window}.` : `Inside every limit. ${f.money(detail)} left ${f.window}.`,
      )
    case 'InvalidPolicy':
      return say('Blocked', 'This vault was created with a broken schedule, so nothing can be paid from it.')
    case 'Paused':
      return say('Blocked: paused', 'You paused this agent. Nothing it asks for is paid until you resume it.')
    case 'NotAgent':
      return say('Blocked: not your agent', 'This request did not come from the agent you authorised.')
    case 'NotYetActive':
      return say('Blocked: too early', `These rules start on ${f.time(detail)}.`)
    case 'Expired':
      return say('Blocked: expired', `The agent's permission ended on ${f.time(detail)}.`)
    case 'WrongNonce':
      return say(
        'Blocked: repeat request',
        `This request was already used, or came out of order. The agent must send a new one (request ${detail}).`,
      )
    case 'NonceExhausted':
      return say('Blocked', 'This vault has used up its request numbers. Create a new one.')
    case 'ZeroAmount':
      return say('Blocked: nothing to pay', 'The agent asked to pay an amount of zero.')
    case 'RecipientNotApproved':
      return say(
        'Blocked: unknown recipient',
        'This recipient is not on your approved list, or was added so recently that its waiting period has not ended.',
      )
    case 'OverPaymentLimit':
      return say('Blocked: too large', `One payment may be at most ${f.money(detail)}.`)
    case 'OverWindowLimit':
      return say(
        'Blocked: limit reached',
        detail === 0n ? `Nothing is left ${f.window}: the limit is used up.` : `Only ${f.money(detail)} is left ${f.window}.`,
      )
  }
}
