import Link from 'next/link'
import { BuiltWith } from '@/components/built-with'
import { ConnectAI } from '@/components/connect-ai'
import { Adoption, Incidents, OtherTests } from '@/components/evidence-field'
import { EvidenceModels } from '@/components/evidence-models'
import { EvidencePath } from '@/components/evidence-path'
import { EvidenceSources } from '@/components/evidence-sources'
import { ExposureChart } from '@/components/exposure-chart'
import { HeroBackdrop } from '@/components/hero-backdrop'
import { HomeDemo } from '@/components/home-demo'
import { AskPanel, OwnerPanel, RulesPanel } from '@/components/home-steps'
import { HomeVaultProvider } from '@/components/home-vault'
import { VaultDiagram } from '@/components/vault-diagram'

export default function Home() {
  return (
    <HomeVaultProvider>
      <div className="hero">
        <div className="wrap hero-copy">
          <h1 className="hero-title lines">
            <span>Your agent can spend.</span> <span>It cannot raise the limit.</span>
          </h1>
          <p className="lede mt-7">
            Put a budget in a vault. Your agent can ask it to pay, and nothing else. Outside your rules, the answer is
            no.
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

      <BuiltWith />

      <section className="wrap band" aria-labelledby="problem-title">
        <p className="eyebrow">The problem</p>
        <h2 id="problem-title" className="section-title lines mt-4">
          <span>The limit held.</span> <span>The way to raise it did not.</span>
        </h2>
        <p className="section-lede">In a controlled test, AI agents did not break their spending limit. They raised it.</p>
        <EvidenceModels />
      </section>

      <section className="wrap band" aria-labelledby="field-title">
        <p className="eyebrow">Not just one lab</p>
        <h2 id="field-title" className="section-title mt-4 max-w-[40rem]">
          Other tests, and money that has already moved
        </h2>
        <OtherTests />
        <h3 className="column-title mt-16">Recorded losses involving AI agents</h3>
        <Incidents />
        <h3 className="column-title mt-16">Agents are being handed money, in small amounts so far</h3>
        <Adoption />
      </section>

      <section className="wrap band" aria-labelledby="path-title">
        <p className="eyebrow">How it happened</p>
        <h2 id="path-title" className="section-title mt-4 max-w-[40rem]">
          A limit that can be raised at once is only as strong as whoever can raise it
        </h2>
        <EvidencePath />
      </section>

      <section className="wrap band" aria-labelledby="checks-title">
        <p className="eyebrow">Inside the vault</p>
        <h2 id="checks-title" className="section-title mt-4 max-w-[40rem]">
          Every request meets the same checks
        </h2>
        <p className="section-lede">
          The agent can only ask. The vault checks each payment against your rules, in the same order, every time, and
          a request to change a rule never reaches them.
        </p>
        <VaultDiagram />
      </section>

      <HomeDemo />

      <section className="wrap band" aria-labelledby="worst-case-title">
        <div className="split">
          <div>
            <p className="eyebrow">A number you can check</p>
            <h2 id="worst-case-title" className="section-title mt-4">
              The worst case, before anything goes wrong
            </h2>
            <p className="section-lede">
              Because a raise has to wait, there is always an answer to &ldquo;what is the most this agent could
              take?&rdquo; The vault works it out itself. This chart is that answer for the practice vault above, hour
              by hour.
            </p>
            <p className="section-lede">
              Where a limit can be raised at once, the honest answer is the red line: everything.
            </p>
          </div>
          <ExposureChart />
        </div>
      </section>

      <section className="wrap band" aria-labelledby="home-steps-title">
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

      <ConnectAI />

      <section className="wrap band" aria-labelledby="boundary-title">
        <h2 id="boundary-title" className="section-title max-w-[36rem]">
          What this protects, and what it does not
        </h2>

        <div className="reveal mt-10">
          <p className="panel-title">What the agent&rsquo;s key can do</p>
          <dl className="perms mt-2">
            <div>
              <dt>Ask the vault to pay an approved recipient</dt>
              <dd>Allowed, inside your limits</dd>
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

        <div className="reveal mt-14 grid gap-x-16 gap-y-12 md:grid-cols-2">
          <div>
            <h3 className="column-title">It protects the money in the vault</h3>
            <ul className="bullets">
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
          <div>
            <h3 className="column-title">It does not protect anything else</h3>
            <ul className="bullets">
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
              <li>This is an unaudited prototype. Do not use it to hold real money.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="wrap band" aria-labelledby="sources-title">
        <p className="eyebrow">Evidence</p>
        <h2 id="sources-title" className="section-title mt-4">
          Where these figures come from
        </h2>
        <EvidenceSources />
      </section>
    </HomeVaultProvider>
  )
}
