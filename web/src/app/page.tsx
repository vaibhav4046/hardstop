import Link from 'next/link'
import { HeroBackdrop } from '@/components/hero-backdrop'
import { HomeDemo } from '@/components/home-demo'
import { AskPanel, OwnerPanel, RulesPanel } from '@/components/home-steps'
import { HomeVaultProvider } from '@/components/home-vault'
import { COINDESK_TEST, IHITL_PAPER } from '@/lib/links'

export default function Home() {
  return (
    <HomeVaultProvider>
      <div className="hero">
        <div className="wrap hero-copy">
          <p className="chip">Try it below. No sign-up, nothing to install.</p>
          <h1 className="hero-title lines mt-7">
            <span>Your agent can spend.</span> <span>It cannot raise the limit.</span>
          </h1>
          <p className="lede mt-7">
            Put a budget in a vault. Your agent can ask the vault to pay, and nothing else. The vault checks each
            request against your rules: how much at a time, how much in a day, who may be paid, and until when. A
            request outside them is refused, with the reason.
          </p>
          <p className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/protect" className="btn btn-primary btn-large">
              Protect my AI
            </Link>
            <a href="#live-example" className="btn btn-large">
              See a payment refused
            </a>
          </p>
        </div>
        <HeroBackdrop />
        <div className="hero-scrim" aria-hidden="true" />
      </div>

      <HomeDemo />

      <section className="wrap section" aria-labelledby="home-steps-title">
        <h2 id="home-steps-title" className="section-title lines">
          <span>Three steps.</span> <span>The vault holds the line.</span>
        </h2>
        <div className="steps">
          <div className="split split-center reveal">
            <div>
              <p className="step-number">01</p>
              <h3 className="step-title">Set the rules once.</h3>
              <p className="step-text">
                A cap per payment, a cap per day, who may be paid, and an end date. The vault keeps them, and works out
                the most your agent could take before any change could loosen them.
              </p>
            </div>
            <div className="card card-live">
              <RulesPanel />
            </div>
          </div>

          <div className="split split-center split-flip reveal">
            <div>
              <p className="step-number">02</p>
              <h3 className="step-title">The agent asks. The vault answers.</h3>
              <p className="step-text">
                Your agent has one move: ask the vault to pay. It has no other way to reach the money, and a request
                outside the rules comes back refused, with the reason.
              </p>
            </div>
            <div className="card card-live">
              <AskPanel />
            </div>
          </div>

          <div className="split split-center reveal">
            <div>
              <p className="step-number">03</p>
              <h3 className="step-title">You stay in charge.</h3>
              <p className="step-text">
                Lowering a limit is instant. Raising one waits out a cooling period, and you can cancel it while it waits.
              </p>
              <p className="step-text">Pausing is instant too. While the agent is paused, the vault pays nothing it asks for.</p>
            </div>
            <div className="card card-live">
              <OwnerPanel />
            </div>
          </div>
        </div>
      </section>

      <section className="wrap section" aria-labelledby="boundary-title">
        <h2 id="boundary-title" className="section-title max-w-[36rem]">
          What this protects, and what it does not
        </h2>

        <div className="card card-live reveal mt-10">
          <p className="panel-title">What the agent&rsquo;s key can do</p>
          <dl className="perms mt-2">
            <div>
              <dt>Ask the vault to pay an approved recipient</dt>
              <dd className="perm-yes">Allowed, inside your limits</dd>
            </div>
            <div>
              <dt>Raise its own limit</dt>
              <dd className="perm-never">Never</dd>
            </div>
            <div>
              <dt>Add a recipient</dt>
              <dd className="perm-never">Never</dd>
            </div>
            <div>
              <dt>Take the money out</dt>
              <dd className="perm-never">Never</dd>
            </div>
          </dl>
          <p className="mt-5">
            <span className="text-gold">Only you:</span> pause, change limits, withdraw.
          </p>
        </div>

        <div className="reveal mt-6 grid gap-6 md:grid-cols-2">
          <div className="card">
            <h3 className="sub-title">It protects the money in the vault</h3>
            <ul className="bullets mt-5">
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
          <div className="card">
            <h3 className="sub-title">It does not protect anything else</h3>
            <ul className="bullets mt-5">
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

      <section className="wrap section" aria-labelledby="evidence-title">
        <div className="split reveal">
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
    </HomeVaultProvider>
  )
}
