import type { Metadata } from 'next'
import { explain, REASON_NAMES, type ReasonName } from '@/lib/hardstop/reasons'
import { AMEND, LOOSENS } from '@/lib/kernel-excerpt'
import { GITHUB, source } from '@/lib/links'
import { formatTime, formatUsd, USD } from '@/lib/money'

export const metadata: Metadata = {
  title: 'Developers',
  description: 'The HARDSTOP policy kernel in Fe: source, commands to run it, and the reason codes it returns.',
}

/** Sample numbers so each example sentence reads like a real one. */
const SAMPLE_TIME = 1_800_000_000n
const SAMPLE_DETAIL: Partial<Record<ReasonName, bigint>> = {
  Allowed: 16n * USD,
  NotYetActive: SAMPLE_TIME,
  Expired: SAMPLE_TIME,
  WrongNonce: 3n,
  OverPaymentLimit: 10n * USD,
  OverWindowLimit: 2n * USD,
}

const EXAMPLE_FORMAT = {
  money: formatUsd,
  time: (seconds: bigint) => `${formatTime(seconds, 'UTC')} UTC`,
  window: 'today',
}

const COMMANDS = `# in fe/  (Fe 26.6.0)
fe test                       # kernel, adversary and vault tests on the EVM
fe test --backend native      # the same kernel and adversary tests, as a native program
fe build --backend native     # builds ./out/hardstop (x86-64 Linux or AArch64 macOS; use WSL on Windows)
./out/hardstop decide …       # one verdict from the native kernel

# in web/
npm test                      # the compiled vault against the native kernel, plus tests that move the clock`

const DECIDE_USAGE = `hardstop decide   RULES LEDGER amount nonce from_agent to_approved now

RULES  = anchor window_secs cooling_secs
         per_payment per_window valid_until paused
         q_per_payment q_per_window q_valid_until q_paused q_effective_at
LEDGER = window spent next_nonce

decide prints: code detail window spent next_nonce`

export default function Developers() {
  return (
    <div className="wrap pt-[clamp(1.5rem,4vw,3.5rem)]">
      <h1 className="page-title max-w-[44rem]">One kernel, written in Fe, compiled for the chain and for your terminal</h1>
      <p className="lede mt-5">
        HARDSTOP is a standalone vault for one token and one agent. Its rules are a pure Fe module with no storage, no
        calls and no logs, so the same source builds into the contract that holds the money and into a native command-line tool.
      </p>
      <dl className="rows mt-8 max-w-[34rem]">
        <div>
          <dt>Language</dt>
          <dd>Fe 26.6.0</dd>
        </div>
        <div>
          <dt>Licence</dt>
          <dd>
            <a href={source('LICENSE')}>MIT</a>
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            <a href={GITHUB}>github.com/vaibhav4046/hardstop</a>
          </dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>Unaudited contest prototype</dd>
        </div>
      </dl>

      <section className="mt-[var(--gap-section)]" aria-labelledby="kernel-title">
        <h2 id="kernel-title" className="section-title">
          The kernel in brief
        </h2>
        <div className="prose mt-4">
          <p>
            <a href={source('fe/src/kernel.fe')}>kernel.fe</a> holds three ideas. <code className="mono">decide</code>{' '}
            answers whether one payment may go through and, if not, why. <code className="mono">amend</code> applies a
            change by the owner: tighter parts at once, looser parts after the cooling period.{' '}
            <code className="mono">exposure</code> returns the most the agent can move between two moments.
          </p>
          <p>
            No function in the kernel has a <code className="mono">uses</code> clause, so the compiler rejects any
            attempt to read storage, make a call or emit a log from it. The vault gathers the facts, hands them over,
            and does what the kernel decided.
          </p>
          <p>These two functions are the whole of the slow-to-loosen rule, copied unchanged from the source:</p>
        </div>
        <pre className="code mt-5 max-w-[52rem]" tabIndex={0} aria-label="Excerpt from kernel.fe: loosens and amend">
          <code>
            {LOOSENS}
            {'\n\n'}
            {AMEND}
          </code>
        </pre>
        <p className="small soft mt-3">
          From <a href={source('fe/src/kernel.fe')}>fe/src/kernel.fe</a>. A test in this site&rsquo;s suite fails if
          the excerpt stops matching the file.
        </p>
      </section>

      <section className="mt-[var(--gap-section)]" aria-labelledby="run-title">
        <h2 id="run-title" className="section-title">
          Run it
        </h2>
        <pre className="code mt-5 max-w-[60rem]" tabIndex={0} aria-label="Commands">
          <code>{COMMANDS}</code>
        </pre>
        <p className="prose mt-5">
          <code className="mono">decide</code> takes twenty decimal numbers. This is its usage text, from{' '}
          <a href={source('fe/src/cli.fe')}>cli.fe</a>:
        </p>
        <pre className="code mt-4 max-w-[60rem]" tabIndex={0} aria-label="Usage of hardstop decide">
          <code>{DECIDE_USAGE}</code>
        </pre>
      </section>

      <section className="mt-[var(--gap-section)]" aria-labelledby="codes-title">
        <h2 id="codes-title" className="section-title">
          Reason codes
        </h2>
        <p className="prose mt-4">
          <code className="mono">pay</code> returns one byte: 0 when the payment was made, otherwise why it was
          refused. The names come from <code className="mono">Reason</code> in kernel.fe; the sentences are what this
          site shows a person, with sample amounts and dates filled in.
        </p>
        <div className="table-scroll mt-6">
          <table className="ledger min-w-[36rem]">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Name</th>
                <th scope="col">Example of what a person reads</th>
              </tr>
            </thead>
            <tbody>
              {REASON_NAMES.map((name, code) => (
                <tr key={name}>
                  <td className="mono">{code}</td>
                  <th scope="row" className="mono">
                    {name}
                  </th>
                  <td>{explain(code, SAMPLE_DETAIL[name] ?? 0n, EXAMPLE_FORMAT).sentence}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="prose small soft mt-4">
          From <code className="mono">pay</code>, a caller that is not the agent never gets code 3: the contract reverts with{' '}
          <code className="mono">NotAgent()</code> instead, so strangers cannot write to the log. Owner-only functions
          revert with <code className="mono">NotOwner()</code> for anyone else, the agent included.
        </p>
      </section>
    </div>
  )
}
