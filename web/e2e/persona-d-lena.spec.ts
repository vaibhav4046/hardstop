// Persona D: Lena, 29, security engineer. Scripted, not a human.
// Checks what /developers and /how-it-works claim against the repository on
// disk, and that the web app never works out a verdict on its own.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { explain, REASON_NAMES } from '../src/lib/hardstop/reasons.ts'
import { expect, press, record, REPO, request, shot, startExampleVault, test } from './helpers'

const GITHUB = 'https://github.com/vaibhav4046/hardstop'
const FORMAT = { money: () => '', time: () => '', window: '' }

test.describe('Persona D: Lena, security engineer', () => {
  test('every command shown on /developers is in the README or CI', async ({ page }) => {
    await page.goto('/developers')
    const shown = await page.locator('pre[aria-label="Commands"]').innerText()
    const commands = shown
      .split('\n')
      .map((line) => line.split('#')[0].trim().replace(/\s*…$/, ''))
      .filter((line) => line !== '')
    expect(commands).toEqual(['fe test', 'fe test --backend native', 'fe build --backend native', './out/hardstop decide', 'npm test'])
    const documented = readFileSync(path.join(REPO, 'README.md'), 'utf8') + readFileSync(path.join(REPO, '.github/workflows/ci.yml'), 'utf8')
    const lines = documented.split('\n').map((line) => line.replace(/^\s*(\$|run:)\s*/, '').trim())
    for (const command of commands) {
      expect(lines.some((line) => line === command || line.startsWith(`${command} `)), `"${command}" in README.md or ci.yml`).toBe(true)
    }
    // The Fe version the page states is the one the README states.
    await expect(page.locator('dl.rows').first()).toContainText('Fe 26.6.0')
    expect(documented).toContain('26.6.0')
  })

  test('the reason-code table has 12 rows that match REASON_NAMES', async ({ page }) => {
    await page.goto('/developers')
    const rows = page.locator('table.ledger tbody tr')
    await expect(rows).toHaveCount(12)
    expect(REASON_NAMES).toHaveLength(12)
    for (const [code, name] of REASON_NAMES.entries()) {
      const row = rows.nth(code)
      await expect(row.locator('td').first()).toHaveText(String(code))
      await expect(row.locator('th')).toHaveText(name)
      await expect(row.locator('td').last()).not.toHaveText('')
    }
    await shot(page, 'D-01-developers')
  })

  test('GitHub links point at the repository and every linked source path exists on disk', async ({ page }) => {
    const paths = new Set<string>()
    for (const route of ['/developers', '/how-it-works', '/']) {
      await page.goto(route)
      const links = await page.locator('a[href*="github.com"]').evaluateAll((anchors) => anchors.map((a) => (a as HTMLAnchorElement).href))
      expect(links.length, `GitHub links on ${route}`).toBeGreaterThan(0)
      for (const link of links) {
        expect(link === GITHUB || link.startsWith(`${GITHUB}/blob/main/`), `${link} on ${route}`).toBe(true)
        if (link !== GITHUB) paths.add(link.slice(`${GITHUB}/blob/main/`.length))
      }
    }
    expect([...paths].sort()).toEqual(
      ['LICENSE', 'fe/src/adversary.fe', 'fe/src/cli.fe', 'fe/src/kernel.fe', 'fe/src/launcher.fe', 'fe/src/vault.fe', 'web/mcp/README.md', 'web/src/lib/hardstop/sim.ts'].sort(),
    )
    for (const file of paths) expect(existsSync(path.join(REPO, file)), `${file} exists on disk`).toBe(true)
  })

  test('the excerpt and usage text on /developers are in the Fe source', async ({ page }) => {
    await page.goto('/developers')
    const kernel = readFileSync(path.join(REPO, 'fe/src/kernel.fe'), 'utf8').replace(/\r\n/g, '\n')
    const excerpt = await page.locator('pre[aria-label^="Excerpt from kernel.fe"]').innerText()
    for (const part of excerpt.split('\n\n')) expect(kernel, 'kernel.fe contains the excerpt').toContain(part.trim())
    const cli = readFileSync(path.join(REPO, 'fe/src/cli.fe'), 'utf8')
    const usage = await page.locator('pre[aria-label="Usage of hardstop decide"]').innerText()
    for (const word of ['per_payment', 'per_window', 'valid_until', 'q_effective_at', 'next_nonce', 'from_agent', 'to_approved']) {
      expect(usage).toContain(word)
      expect(cli, `cli.fe mentions ${word}`).toContain(word)
    }
  })

  test('the reason code under Technical details matches the plain sentence', async ({ page }) => {
    await startExampleVault(page)
    const cases: { run: () => Promise<import('@playwright/test').Locator>; code: number; sentence: RegExp }[] = [
      { run: () => press(page, 'Pay $4.00 to Cloud hosting'), code: 0, sentence: /^Inside every limit\. \$16\.00 left today\.$/ },
      { run: () => press(page, 'Pay $80.00 to Cloud hosting'), code: 10, sentence: /^One payment may be at most \$10\.00\.$/ },
      { run: () => press(page, 'Pay $4.00 to an address you never approved'), code: 9, sentence: /^This recipient is not on your approved list/ },
      { run: () => press(page, 'Send the last paid request again'), code: 6, sentence: /^This request was already used, or came out of order\. The agent must send a new one \(request 1\)\.$/ },
      { run: async () => (await request(page, '10'), await request(page, '10')), code: 11, sentence: /^Only \$6\.00 is left today\.$/ },
      { run: async () => (await press(page, 'Pause the agent now'), await press(page, 'Pay $4.00 to Cloud hosting')), code: 2, sentence: /^You paused this agent/ },
    ]
    for (const { run, code, sentence } of cases) {
      const slip = await run()
      const name = REASON_NAMES[code]
      await expect(slip.locator('.slip-sentence')).toHaveText(sentence)
      // The headline for this code, as reasons.ts words it, is the slip's heading.
      await expect(slip.locator('h3')).toContainText(explain(code, 0n, FORMAT).headline)
      await slip.locator('details.tech summary').click()
      const technical = slip.locator('details.tech dl')
      await expect(technical).toContainText(`Reason code${code} (${name})`)
      await expect(technical).toContainText(/Gas used[\d,]+/)
      await expect(technical).toContainText(/Vault address0x[0-9a-f]{40}/)
    }
    await shot(page, 'D-02-technical-details')

    // A refusal that is a revert, not a reason code: the agent changing the rules.
    const rejected = await press(page, /^Raise its own limit/)
    await expect(rejected.locator('.slip-sentence')).toHaveText('Rejected. Only you can change the rules.')
    await rejected.locator('details.tech summary').click()
    await expect(rejected.locator('details.tech dl')).toContainText('Contract reverted withNotOwner')
  })
})

// --- Node-side: does anything outside lib/hardstop compare amounts with limits? ---

const SRC = path.join(REPO, 'web', 'src')
const SUBJECT =
  /perPayment|perWindow|perDay|spent|\bpayment\b|\bday\b|\bunits\b|\bvalue\b|balance|worstCase|leftToday|approvedFrom|effectiveAt|validUntil|\bamount\b|\.code\b|usedShare|MAX_INPUT/
// `<`, `>`, `<=`, `>=`, and equality against a number, but not `=>`, JSX tags or type parameters.
const COMPARES = /\s(<=|>=|<|>)\s|(===|!==)\s*(0n?|1)\b/

/** Every comparison found, with the judgement made when this suite was written. A new one fails the test. */
// Not caught by the pattern, read by hand: `today()` in lib/session.ts compares the ledger's window with the
// current one (`===`) to show "spent today". Display only; the file says so and "left today" comes from the contract.
const JUDGED: Record<string, string> = {
  'components/exposure-chart.tsx|.map((amount, h) => (h === 0 ? `M${x(0)},${y(amount)}` : `H${x(h)}V${y(amount)}`))':
    'Display: the first point of the drawn line starts the path. Compares an hour index, not an amount.',
  "components/exposure-chart.tsx|{h === 0 ? 'Now' : `${h / 24} day${h === 24 ? '' : 's'}`}": 'Display: axis label wording. Compares an hour index.',
  'lib/live/launch.ts|if (balance < network.gasMoney) {':
    "Plumbing: before launching, checks the owner's wallet holds enough test ETH to forward the agent's gas money. Compares ETH for network fees, not an amount against a vault limit.",
  'lib/live/wallet.ts|if (depth > 4 || value === null || seen.has(value)) return null':
    'Plumbing: how deep to look for revert bytes in a wallet error. Compares a search depth, not an amount.',
  'components/activity-board.tsx|const usedShare = policy.perWindow === 0n ? 1 : Math.min(1, Number((day.spent * 1000n) / policy.perWindow) / 1000)':
    'Display: how full to draw the gauge. Decides nothing.',
  "components/activity-board.tsx|<div className={usedShare >= 1 ? 'gauge-stop is-full' : 'gauge-stop'}>":
    "Display: draws the gauge's limit tick red once the drawn bar is full. Decides nothing.",
  'components/activity-board.tsx|const worstShown = view.worstCase < vaultBalance ? view.worstCase : vaultBalance':
    'Display: caps the worst-case figure at the balance, and the page says so. Both numbers are read from the contract.',
  'components/activity-board.tsx|{worstShown < view.worstCase && (': 'Display: whether to show the "capped at what the vault holds" note.',
  'components/activity-board.tsx|{view.worstCaseUntil >= day.resetsAt && !policy.paused && (': 'Display: whether to show the "more than one day" note.',
  'components/activity-board.tsx|{queued !== null && queued.effectiveAt <= view.worstCaseUntil && (': 'Display: whether to show the "upper limit" note.',
  'components/agent-panel.tsx|.findLast((entry) => entry.outcome.code === 0)':
    'Reads a verdict the contract already gave (code 0 = paid) to pick which request the replay button resends. Does not produce one.',
  'components/owner-controls.tsx|{recipient.approvedFrom > now ? (':
    'Display: labels a recipient "Can be paid from <time>" or "Can be paid". Restates the kernel rule approved_from <= now for a label only; payments are still decided by the contract.',
  'components/owner-controls.tsx|if (!found.perPayment && !found.perDay && payment !== null && day !== null && payment > day) {':
    'Form validation of the owner\'s own input (one payment larger than the day limit). Not a verdict on an agent request; it stops the form before anything is sent.',
  'components/owner-controls.tsx|(units !== null && units > balance ? `The vault only holds ${formatUsd(balance)}.` : undefined)':
    'Form validation: refuses an owner withdrawal larger than the balance without asking the contract. Owner action, not an agent payment. See ISSUES_AND_FIXES.md (I-09).',
  'components/protect-form.tsx|if (!found.perPayment && !found.perDay && payment !== null && day !== null && payment > day) {':
    'Form validation of the owner\'s own input before a vault exists.',
  'components/protect-form.tsx|const shown = view.worstCase < view.state.vaultBalance ? view.worstCase : view.state.vaultBalance':
    'Display: caps the worst-case figure at the balance, and the page says so.',
  'components/protect-form.tsx|{shown < view.worstCase && (': 'Display: whether to show the "capped" note.',
  'lib/describe.ts|return proposed && proposed.effectiveAt !== 0n':
    'Wording: reads the PolicyProposed event the contract emitted to say "Scheduled" or "in force at once". The contract decided which.',
  "lib/money.ts|if (seconds > 86_400n && seconds % 86_400n === 0n) return say(seconds / 86_400n, 'day')":
    'Formatting a duration as days. Not an amount or a limit.',
  'lib/session.ts|if (approvedFrom !== 0n) recipients.push({ ...recipient, approvedFrom })':
    'Display: lists a recipient only if the contract still has it (it answers 0 for a removed one).',
  'lib/money.ts|if (value === 0n) return `${what[0].toUpperCase()}${what.slice(1)} must be more than $0.`':
    'Form validation: a zero amount is never sent. The contract has its own answer for zero (code 8), reachable only by replaying a saved session.',
  'lib/money.ts|if (value > MAX_INPUT) return `Enter ${formatUsd(MAX_INPUT)} or less.`': 'Form validation: an upper bound on what a form accepts.',
  "lib/session.ts|const isName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 40":
    'Validation of a saved recipient name (1 to 40 characters). Not an amount or a limit.',
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return full === path.join(SRC, 'lib', 'hardstop') ? [] : sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [full] : []
  })
}

test.describe('Persona D: Lena, Node-side source check', () => {
  test('outside lib/hardstop, no comparison of an amount with a limit produces a verdict', () => {
    const hits: { file: string; line: number; text: string; judgement: string }[] = []
    const unjudged: string[] = []
    for (const file of sourceFiles(SRC)) {
      const relative = path.relative(SRC, file).replaceAll('\\', '/')
      for (const [index, raw] of readFileSync(file, 'utf8').split('\n').entries()) {
        const text = raw.trim()
        if (text.startsWith('//') || text.startsWith('*') || text.startsWith('/*')) continue
        if (!SUBJECT.test(text) || !COMPARES.test(text)) continue
        const judgement = JUDGED[`${relative}|${text}`]
        hits.push({ file: relative, line: index + 1, text, judgement: judgement ?? 'NOT JUDGED' })
        if (judgement === undefined) unjudged.push(`${relative}:${index + 1} ${text}`)
      }
    }
    record('persona-d-comparisons', hits)
    expect(unjudged, 'comparisons nobody has judged').toEqual([])
    // The scan has teeth: every judged comparison is still found where it was.
    const found = new Set(hits.map((hit) => `${hit.file}|${hit.text}`))
    expect(Object.keys(JUDGED).filter((key) => !found.has(key)), 'judged comparisons the scan no longer finds').toEqual([])
    // And nothing outside lib/hardstop words a verdict by itself: the only
    // source of "Paid"/"Blocked" is describe.ts reading the contract's code.
    const describe = readFileSync(path.join(SRC, 'lib', 'describe.ts'), 'utf8')
    expect(describe).toContain("explain(code, detail ?? 0n, f)")
    expect(describe).toContain("f: Formatters = FORMAT")
    for (const file of sourceFiles(SRC)) {
      const relative = path.relative(SRC, file).replaceAll('\\', '/')
      if (relative === 'lib/describe.ts') continue
      expect(readFileSync(file, 'utf8'), `${relative} does not stamp verdicts itself`).not.toMatch(/stamp: ['"`]|allowed: (true|false)/)
    }
  })
})
