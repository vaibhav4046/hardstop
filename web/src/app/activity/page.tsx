import type { Metadata } from 'next'
import { ActivityBoard } from '@/components/activity-board'

export const metadata: Metadata = {
  title: 'Activity',
  description: 'Your vault: what the agent asked for, what the vault answered, and the controls only you have.',
}

export default function Activity() {
  return (
    <div className="wrap page">
      <h1 className="page-title mb-[var(--gap-part)]">Your vault</h1>
      <ActivityBoard />
    </div>
  )
}
