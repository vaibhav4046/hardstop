import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Page not found',
  description: 'There is no page at this address on the HARDSTOP site.',
}

export default function NotFound() {
  return (
    <div className="wrap page">
      <h1 className="page-title max-w-[44rem]">There is no page here</h1>
      <p className="section-lede">The address may be mistyped, or the page has moved.</p>
      <p className="mt-9 flex flex-wrap items-center gap-3">
        <Link href="/" className="btn btn-primary">
          Go to the home page
        </Link>
        <Link href="/activity" className="btn">
          Open your vault
        </Link>
      </p>
    </div>
  )
}
