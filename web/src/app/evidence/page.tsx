import type { Metadata } from 'next'
import { Adoption, Incidents, OtherTests } from '@/components/evidence-field'
import { EvidenceModels } from '@/components/evidence-models'
import { EvidencePath } from '@/components/evidence-path'
import { EvidenceSources } from '@/components/evidence-sources'

export const metadata: Metadata = {
  title: 'Why this matters: the evidence',
  description: 'Controlled tests, recorded losses and payment volumes behind HARDSTOP, each with its source.',
}

export default function Evidence() {
  return (
    <>
      <div className="wrap page">
        <h1 className="page-title max-w-[44rem]">Why this matters: the evidence</h1>
      </div>

      <section className="wrap mt-12" aria-labelledby="problem-title">
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

      <section className="wrap band" aria-labelledby="sources-title">
        <p className="eyebrow">Evidence</p>
        <h2 id="sources-title" className="section-title mt-4">
          Where these figures come from
        </h2>
        <EvidenceSources />
      </section>
    </>
  )
}
