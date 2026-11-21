import type { Metadata } from 'next'
import { MyVaults } from '@/components/my-vaults'

export const metadata: Metadata = {
  title: 'My vaults',
  description: 'Sign in with your wallet and see every vault it launched, read from the network.',
}

export default function Vaults() {
  return (
    <div className="wrap page">
      <h1 className="page-title mb-[var(--gap-part)]">My vaults</h1>
      <MyVaults />
    </div>
  )
}
