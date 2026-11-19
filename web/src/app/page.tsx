import Link from 'next/link'
import { BuiltWith } from '@/components/built-with'
import { ConnectAI } from '@/components/connect-ai'
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
            <p className="section-lede">
              In a controlled test, AI agents did not break their spending limit. They raised it.{' '}
              <Link href="/evidence">See the evidence</Link>
            </p>
          </div>
          <ExposureChart />
        </div>
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
    </HomeVaultProvider>
  )
}
