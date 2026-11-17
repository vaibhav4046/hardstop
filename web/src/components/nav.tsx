'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/protect', label: 'Protect my AI' },
  { href: '/activity', label: 'Activity' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/developers', label: 'Developers' },
]

export function Nav() {
  const pathname = usePathname()
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
