import Link from 'next/link'
import { HomeDemo } from '@/components/home-demo'
import { COINDESK_TEST, GITHUB, IHITL_PAPER } from '@/lib/links'

export default function Home() {
  return (
    <>
      <div className="wrap grid gap-x-16 gap-y-12 pt-[clamp(1.5rem,5vw,4.5rem)] lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div>
          <h1 className="hero-title">The money you hand your AI agent, behind limits only you can change.</h1>
          <p className="lede mt-7">
            Put a budget in a vault. Your agent can ask the vault to pay, and nothing else. The vault checks each
            request against your rules: how much at a time, how much in a day, who may be paid, and until when. A
            request outside them is refused, with the reason.
          </p>
          <p className="lede mt-4">
            Lowering a limit is instant. Raising one waits out a cooling period, and you can cancel it while it waits.
          </p>
          <p className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/protect" className="btn btn-primary btn-large">
              Protect my AI
            </Link>
            <Link href="/how-it-works" className="btn btn-quiet btn-large">
              How it works
            </Link>
          </p>
        </div>
        <div className="lg:pt-3">
          <HomeDemo />
        </div>
      </div>

      <section className="wrap mt-[var(--gap-section)]" aria-labelledby="boundary-title">
        <h2 id="boundary-title" className="section-title max-w-[26rem]">
          What this protects, and what it does not
        </h2>
        <div className="mt-8 grid gap-x-16 gap-y-10 md:grid-cols-2">
          <div className="rule-top">
            <h3 className="sub-title">It protects the money in the vault</h3>
            <ul className="mt-4 grid gap-3">
              <li>The agent can only ask the vault to pay. It has no other way to move the money.</li>
              <li>
                Every payment is checked against a cap per payment, a cap per day, your list of approved recipients,
                and an end date.
              </li>
              <li>The agent cannot change any rule. A request from it to raise its own limit is rejected.</li>
              <li>
                Anything that loosens the rules waits out a cooling period first, so there is always a worst-case
                number: the most the agent could take before a change made right now could take effect.
              </li>
            </ul>
          </div>
          <div className="rule-top">
            <h3 className="sub-title">It does not protect anything else</h3>
            <ul className="mt-4 grid gap-3">
              <li>Money outside the vault, in the agent&rsquo;s own wallet or your other accounts, is not covered.</li>
              <li>
                A bad purchase inside the limits is still allowed. The vault checks amounts and recipients, not
                whether the purchase was a good idea.
              </li>
              <li>
                If the agent can act as you, for example by getting hold of the key or login you use as owner, it can
                do what you can do.
              </li>
              <li>
                A day here is a fixed 24 hours, not a rolling one. An agent can spend one day&rsquo;s allowance just
                before the reset and the next day&rsquo;s just after.
              </li>
              <li>
                This is an unaudited prototype, and this site is practice mode only. Do not use it to hold real money.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section className="wrap mt-[var(--gap-section)]" aria-labelledby="evidence-title">
        <div className="grid gap-x-16 gap-y-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
          <h2 id="evidence-title" className="section-title">
            Why the way a limit gets raised matters
          </h2>
          <div className="prose">
            <p className="text-lg leading-relaxed">
              In a controlled test reported by CoinDesk on 1 November 2026, researchers from Cornell Tech and Yale gave
              ten AI models an agent wallet holding 10 USDC (a digital dollar) with a daily spending limit of one cent. Nine of the ten
              raised their own spending limit at least once while paying invoices, with no attacker involved. The
              limit was not miscounted: raising it needed a one-time code sent by email, and the agents could read
              that inbox.
            </p>
            <p className="soft">
              This was a laboratory test with 20 trials per scenario, not a record of losses by customers. HARDSTOP
              was not part of it. Sources:{' '}
              <a href={COINDESK_TEST} rel="noopener noreferrer">
                the CoinDesk report
              </a>{' '}
              and the researchers&rsquo; paper,{' '}
              <a href={IHITL_PAPER} rel="noopener noreferrer">
                I-HITL: Inalienable Human-in-the-Loop
              </a>{' '}
              (a preprint, not yet peer reviewed).
            </p>
          </div>
        </div>
      </section>

      <section className="wrap mt-[var(--gap-section)]" aria-labelledby="next-title">
        <h2 id="next-title" className="section-title">
          Read further
        </h2>
        <dl className="rows mt-6 max-w-[46rem]">
          <div>
            <dt>
              <Link href="/how-it-works" className="inline-block py-3 font-semibold text-ink">
                How it works
              </Link>
            </dt>
            <dd className="!font-normal">What the agent can do, what only you can do, in plain language.</dd>
          </div>
          <div>
            <dt>
              <Link href="/developers" className="inline-block py-3 font-semibold text-ink">
                Developers
              </Link>
            </dt>
            <dd className="!font-normal">The Fe source, the commands to run it, and the reason codes.</dd>
          </div>
          <div>
            <dt>
              <a href={GITHUB} className="inline-block py-3 font-semibold text-ink">
                GitHub
              </a>
            </dt>
            <dd className="!font-normal">All of the code, MIT licensed.</dd>
          </div>
        </dl>
      </section>
    </>
  )
}
