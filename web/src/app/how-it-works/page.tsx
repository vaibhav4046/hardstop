import type { Metadata } from 'next'
import Link from 'next/link'
import { source } from '@/lib/links'

export const metadata: Metadata = {
  title: 'How it works',
  description: 'What your AI agent can do with a HARDSTOP vault, what only you can do, and why raising a limit is slow.',
}

export default function HowItWorks() {
  return (
    <div className="wrap page">
      <h1 className="page-title max-w-[44rem]">One door for the agent. Every control for you.</h1>
      <p className="lede mt-5">
        A HARDSTOP vault holds money for one AI agent. The agent and you are treated as two different people, and the
        vault gives each a different, fixed set of things it will accept from them.
      </p>

      <section className="mt-[var(--gap-section)]" aria-labelledby="who-title">
        <h2 id="who-title" className="section-title">
          Who can do what
        </h2>
        <div className="card table-scroll mt-8 max-w-[62rem]">
          <table className="ledger min-w-[34rem]">
            <thead>
              <tr>
                <th scope="col">Action</th>
                <th scope="col">Your agent</th>
                <th scope="col">You</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Ask the vault to pay an approved recipient</th>
                <td>Yes, inside every limit</td>
                <td>No. Only the agent can ask.</td>
              </tr>
              <tr>
                <th scope="row">Lower a limit, pause, remove a recipient</th>
                <td>No</td>
                <td>Yes, at once</td>
              </tr>
              <tr>
                <th scope="row">Raise a limit, move the end date later, add a recipient, resume after a pause</th>
                <td>No</td>
                <td>Yes, after the cooling period</td>
              </tr>
              <tr>
                <th scope="row">Cancel a change that is waiting</th>
                <td>No</td>
                <td>Yes, at once</td>
              </tr>
              <tr>
                <th scope="row">Take money back out</th>
                <td>No</td>
                <td>Yes, at once, and only to you</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="prose soft mt-4">
          &ldquo;You&rdquo; means whoever controls the owner account the vault was created with. If your agent can
          use that account, the vault cannot tell it apart from you.
        </p>
      </section>

      <div className="mt-[var(--gap-section)] grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="how-agent-title" className="card">
          <h2 id="how-agent-title" className="sub-title">
            What your agent can do
          </h2>
          <div className="prose soft mt-4">
            <p>
              One thing: ask the vault to pay a certain amount to a certain recipient. The vault then checks, in a
              fixed order, that the agent is not paused, that its permission has not ended, that the request is not a
              repeat, that the recipient is on your list, that the amount is within the cap for one payment, and that
              it fits in what is left for the day.
            </p>
            <p>If every check passes, the money goes to that recipient. If one fails, nothing moves.</p>
          </div>
        </section>

        <section aria-labelledby="blocked-title" className="card">
          <h2 id="blocked-title" className="sub-title">
            What happens to a blocked request
          </h2>
          <div className="prose soft mt-4">
            <p>
              The vault refuses it and records what was asked and why it was refused, so there is a trail of what the
              agent tried. A refusal changes nothing else: the balance, the amount spent today and the rules stay
              exactly as they were.
            </p>
            <p>
              The reason comes back as a plain sentence, such as &ldquo;One payment may be at most $10.00&rdquo;. The
              same request can be sent again later; it is judged afresh against the rules in force at that moment.
            </p>
          </div>
        </section>
      </div>

      <section className="mt-[var(--gap-section)]" aria-labelledby="ratchet-title">
        <div className="grid items-start gap-x-16 gap-y-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div>
            <h2 id="ratchet-title" className="section-title">
              Why raising a limit is slow and lowering one is instant
            </h2>
            <div className="prose soft mt-6">
              <p>
                Making the rules tighter can only reduce what the agent can take, so there is no reason to wait. Making
                them looser is the dangerous direction: it is exactly what a confused or manipulated agent, or someone
                impersonating you, would want.
              </p>
              <p>
                So every loosening waits out a cooling period that is fixed when the vault is created. During the wait
                the old rules stay in force and you can cancel. Lowering a limit or pausing also cancels a waiting change.
              </p>
            </div>
          </div>
          <ol className="card card-live timeline">
            <li>
              <p className="font-medium">You ask for a higher limit</p>
              <p className="soft">Nothing changes yet. The request shows as Scheduled, with the time it takes effect.</p>
            </li>
            <li className="cooling">
              <p className="tag tag-cool">Cooling period</p>
              <p className="soft">
                The old limit still applies to every request. You can cancel at any moment. This is your chance to
                notice a change you did not make.
              </p>
            </li>
            <li>
              <p className="font-medium">The higher limit is in force</p>
              <p className="soft">From this second on, and not one second earlier.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="mt-[var(--gap-section)] max-w-[40rem]" aria-labelledby="how-worst-title">
        <h2 id="how-worst-title" className="section-title">
          The worst-case number
        </h2>
        <div className="prose soft mt-6">
          <p>
            Because nothing can get looser before the cooling period ends, the vault can work out the most the agent
            could possibly take between now and then: what is left of today&rsquo;s limit, plus a full day&rsquo;s
            limit for each new day that starts in that time.
          </p>
          <p>
            The <Link href="/activity">activity page</Link> shows that figure at all times. It is a ceiling on what the
            rules allow, so it can be more than the vault holds; the page says so when that happens.
          </p>
          <p>
            A day is a fixed 24 hours counted from when the vault was created, not a rolling one. An agent can spend
            a full day&rsquo;s limit just before the reset and another just after, and the worst-case number counts
            that.
          </p>
        </div>
      </section>

      <section className="mt-[var(--gap-section)] max-w-[46rem]" aria-labelledby="deeper-title">
        <h2 id="deeper-title" className="section-title">
          For technical readers
        </h2>
        <details className="card disclosure mt-6 !py-2">
          <summary>How the rules are written and checked</summary>
          <div className="prose">
            <p>
              The rules live in one small module written in <a href="https://fe-lang.org/">Fe</a>, called the kernel.
              It has no access to storage, calls or files, which the Fe compiler enforces, so a decision depends only
              on the numbers passed in.
            </p>
            <p>
              That one kernel is compiled twice: into the smart contract that holds the money on an EVM chain, and
              into a native command-line program. A prediction made off-chain and the verdict reached on-chain are the
              same code. The test suite replays seeded games against both and compares every answer.
            </p>
            <p>
              The contract resolves two facts for the kernel, who is calling and whether the recipient is approved by
              now, and then does exactly what the kernel decided. In this practice mode the same compiled contract
              runs in an in-browser EVM (ethereumjs); the page sends it messages and prints what it returns.
            </p>
            <p>Source files:</p>
            <ul className="grid gap-1">
              <li>
                <a href={source('fe/src/kernel.fe')}>fe/src/kernel.fe</a>, the pure rules: decide, amend, exposure
              </li>
              <li>
                <a href={source('fe/src/vault.fe')}>fe/src/vault.fe</a>, the contract that holds the money
              </li>
              <li>
                <a href={source('fe/src/adversary.fe')}>fe/src/adversary.fe</a>, a seeded attacker used in the tests
              </li>
              <li>
                <a href={source('fe/src/cli.fe')}>fe/src/cli.fe</a>, the native tool
              </li>
              <li>
                <a href={source('web/src/lib/hardstop/sim.ts')}>web/src/lib/hardstop/sim.ts</a>, how this site talks to
                the contract
              </li>
            </ul>
            <p>
              More on <Link href="/developers">the developers page</Link>.
            </p>
          </div>
        </details>
      </section>
    </div>
  )
}
