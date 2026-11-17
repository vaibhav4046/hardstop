'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

const LINKS = [
  { href: '/activity', label: 'Activity' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/developers', label: 'Developers' },
]
const PROTECT = '/protect'

export function Nav() {
  const pathname = usePathname()
  const current = (href: string) => (pathname === href ? 'page' : undefined)

  // Next.js leaves focus where it was when the page changes without a reload,
  // which is on a link that is no longer shown, so the next Tab landed in the
  // footer. Move focus to the new page's content instead.
  const shownPath = useRef(pathname)
  useEffect(() => {
    if (shownPath.current === pathname) return
    shownPath.current = pathname
    document.getElementById('main')?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <>
      {/* Shown beside the wordmark on a narrow screen; the copy inside the nav is shown on a wide one. */}
      <Link href={PROTECT} className="btn btn-primary nav-cta" aria-current={current(PROTECT)}>
        Protect my AI
      </Link>
      <nav className="nav" aria-label="Main">
        {LINKS.map(({ href, label }) => (
          <Link key={href} href={href} aria-current={current(href)}>
            {label}
          </Link>
        ))}
        <Link href={PROTECT} className="btn btn-primary nav-cta" aria-current={current(PROTECT)}>
          Protect my AI
        </Link>
      </nav>
    </>
  )
}
