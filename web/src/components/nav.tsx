'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

const LINKS = [
  { href: '/protect', label: 'Protect my AI' },
  { href: '/activity', label: 'Activity' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/developers', label: 'Developers' },
]

export function Nav() {
  const pathname = usePathname()

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
    <nav className="nav" aria-label="Main">
      {LINKS.map(({ href, label }) => (
        <Link key={href} href={href} aria-current={pathname === href ? 'page' : undefined}>
          {label}
        </Link>
      ))}
    </nav>
  )
}
