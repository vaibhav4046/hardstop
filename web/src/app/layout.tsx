import type { Metadata } from 'next'
import { IBM_Plex_Mono, Instrument_Serif, Outfit } from 'next/font/google'
import Link from 'next/link'
import { Nav } from '@/components/nav'
import { ScrollReveal } from '@/components/scroll-reveal'
import { GITHUB } from '@/lib/links'
import { VaultProvider } from '@/lib/vault-store'
import './globals.css'

const instrument = Instrument_Serif({ variable: '--font-instrument', subsets: ['latin'], weight: '400', display: 'swap' })
const outfit = Outfit({ variable: '--font-outfit', subsets: ['latin'], display: 'swap' })
const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
  preload: false,
})

export const metadata: Metadata = {
  title: { default: 'HARDSTOP: spending limits your AI agent cannot change', template: '%s | HARDSTOP' },
  description:
    'Put money for your AI agent in a vault with limits only you can change. Practice mode: the real contract runs in your browser with test dollars.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${instrument.variable} ${outfit.variable} ${plexMono.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <a className="skip" href="#main">
          Skip to content
        </a>
        <aside className="practice" aria-label="Practice mode">
          <p className="wrap">
            <strong>Practice mode.</strong> The real contract runs here in your browser, on a private simulated chain,
            with test dollars. No wallet, no network, no real money.
          </p>
        </aside>
        <header className="topbar">
          <div className="wrap topbar-row">
            <Link href="/" className="wordmark" aria-label="HARDSTOP home">
              HARDSTOP
              <span className="fullstop" aria-hidden="true" />
            </Link>
            <Nav />
          </div>
        </header>
        <VaultProvider>
          <main id="main" tabIndex={-1} className="flex-1">
            {children}
          </main>
        </VaultProvider>
        <footer className="wrap">
          <div className="colophon grid gap-x-16 gap-y-6 md:grid-cols-[minmax(0,1fr)_auto]">
            <div>
              <p className="wordmark" aria-hidden="true">
                HARDSTOP
                <span className="fullstop" />
              </p>
              <p className="mt-1 max-w-[36rem]">
                HARDSTOP is an unaudited prototype built for the Fe Builders Challenge 2026. This site is practice mode
                only: nothing here holds or moves real money, and it should not be used for real money.
              </p>
            </div>
            <ul className="flex flex-wrap content-start gap-x-8 md:justify-end">
              <li>
                <Link href="/how-it-works">How it works</Link>
              </li>
              <li>
                <Link href="/developers">Developers</Link>
              </li>
              <li>
                <a href={GITHUB}>GitHub</a>
              </li>
              <li>
                <a href={`${GITHUB}/blob/main/LICENSE`}>MIT licence</a>
              </li>
            </ul>
          </div>
        </footer>
        <ScrollReveal />
      </body>
    </html>
  )
}
