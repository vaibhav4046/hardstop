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
          <p className="small soft mt-7 max-w-[36rem]">
            The vault is written in <Link href="/developers">Fe</Link>: a payment that tries to change your rules does
            not compile.
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

      <section className="wrap band" aria-labelledby="tricked-title">
        <p className="eyebrow">Even if you are fooled</p>
        <h2 id="tricked-title" className="section-title mt-4 max-w-[40rem]">
          A tricked approval still cannot spend for a day
        </h2>
        <p className="section-lede">
          Spending caps fail through the path that changes them: in the study, agents got their own cap raised.
          HARDSTOP makes that path slow. A run of the practice vault after its owner was talked into $1,000 a day:
        </p>
        <ol className="tricked-steps mt-8" aria-label="What happens after a tricked approval">
          <li className="card">
            <span className="tricked-when mono">Minute 0</span>
            <p>The owner approves $1,000 a payment and a day. Nothing changes yet: the raise is queued for 24 hours.</p>
          </li>
          <li className="card">
            <span className="tricked-when mono">Minute 1</span>
            <p>
              The agent asks to pay $500. <strong className="text-stop">Refused</strong>: one payment may be at most $10.
            </p>
          </li>
          <li className="card">
            <span className="tricked-when mono">Any time</span>
            <p>
              The vault&rsquo;s worst case over the next 24 hours jumps from $40 to <strong>$1,020</strong>, computed by the
              contract: those 24 hours reach the second the raise would start. Up to that second it stays $40. The danger
              has a number before any money moves.
            </p>
          </li>
          <li className="card">
            <span className="tricked-when mono">Before hour 24</span>
            <p>
              The owner cancels, or sets any tighter limit, and the raise is gone. <strong className="text-paid">$0</strong>{' '}
              extra left the vault.
            </p>
          </li>
        </ol>
        <p className="small soft mt-5">
          Run it yourself: <code className="mono">npx -y github:vaibhav4046/hardstop --tricked</code>, as any AI
          assistant&rsquo;s MCP server.
        </p>
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
        <p className="section-lede">
          The vault is written in <Link href="/developers">Fe</Link>. Its payment handler is given the rules read-only,
          so an agent payment that tries to change them does not compile.
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
