import type { Metadata } from 'next'
import { Besley, IBM_Plex_Mono, Schibsted_Grotesk } from 'next/font/google'
import Link from 'next/link'
import { Nav } from '@/components/nav'
import { GITHUB } from '@/lib/links'
import { VaultProvider } from '@/lib/vault-store'
import './globals.css'

const besley = Besley({ variable: '--font-besley', subsets: ['latin'], display: 'swap' })
const schibsted = Schibsted_Grotesk({ variable: '--font-schibsted', subsets: ['latin'], display: 'swap' })
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
    <html lang="en" className={`${besley.variable} ${schibsted.variable} ${plexMono.variable} antialiased`}>
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
        <header className="wrap masthead">
          <Link href="/" className="wordmark" aria-label="HARDSTOP home">
            HARDSTOP
            <span className="fullstop" aria-hidden="true" />
          </Link>
          <Nav />
        </header>
        <VaultProvider>
          <main id="main" className="flex-1">
            {children}
          </main>
        </VaultProvider>
        <footer className="wrap">
          <div className="colophon">
            <p className="max-w-[40rem]">
              HARDSTOP is an unaudited prototype built for the Fe Builders Challenge 2026. This site is practice mode
              only: nothing here holds or moves real money.
            </p>
            <p className="mt-2 flex flex-wrap gap-x-6">
              <a href={GITHUB}>Source on GitHub</a>
              <a href={`${GITHUB}/blob/main/LICENSE`}>MIT licence</a>
              <Link href="/how-it-works">How it works</Link>
              <Link href="/developers">Developers</Link>
            </p>
          </div>
        </footer>
      </body>
    </html>
  )
}
