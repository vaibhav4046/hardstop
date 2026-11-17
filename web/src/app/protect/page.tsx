import type { Metadata } from 'next'
import { ProtectForm } from '@/components/protect-form'

export const metadata: Metadata = {
  title: 'Protect my AI',
  description: 'Set a cap per payment, a cap per day, an end date and up to three recipients, then create a practice vault.',
}

export default function Protect() {
  return (
    <div className="wrap pt-[clamp(1.5rem,4vw,3.5rem)]">
      <h1 className="page-title max-w-[40rem]">Set the rules your agent has to live inside</h1>
      <p className="lede mt-5 mb-[var(--gap-part)]">
        Five short questions. Nothing here needs a wallet or an account, and the money is test dollars.
      </p>
      <ProtectForm />
    </div>
  )
}
