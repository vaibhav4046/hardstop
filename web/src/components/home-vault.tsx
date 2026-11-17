'use client'

// The one practice vault on the home page. The example and the three step
// panels all read from it and send to it. It is separate from the visitor's
// own vault and is not saved: a reload starts it again.

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Sim, State } from '@/lib/hardstop/sim'
import { loadSim } from '@/lib/load-sim'
import { apply, build, exampleSetup, snapshot, type Action, type Entry, type Session, type View } from '@/lib/session'

type Demo = { sim: Sim; session: Session }

type HomeVault = {
  /** Null until the vault has been deployed. */
  view: View | null
  /** Newest first. */
  entries: Entry[]
  status: 'idle' | 'working' | 'failed'
  /** Sends one action. It is built from the contract's state at that moment, so a request carries the right number. */
  send: (make: (state: State) => Action) => Promise<void>
  /** Throws the vault away and deploys a new one. */
  restart: () => void
}

const HomeVaultContext = createContext<HomeVault | null>(null)

export function HomeVaultProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Entry[]>([])
  const [view, setView] = useState<View | null>(null)
  const [status, setStatus] = useState<HomeVault['status']>('idle')
  const demoRef = useRef<Promise<Demo> | null>(null)
  // One request at a time, and a number of its own for each receipt. Two
  // clicks can arrive before the buttons are redrawn as disabled.
  const isSending = useRef(false)
  const nextId = useRef(0)

  /** Deploys the example vault once; later calls reuse it. */
  function start(): Promise<Demo> {
    demoRef.current ??= (async () => {
      const session: Session = { setup: exampleSetup(BigInt(Math.floor(Date.now() / 1000))), actions: [] }
      const { sim } = await build(await loadSim(), session)
      setView(await snapshot(sim, session))
      return { sim, session }
    })()
    return demoRef.current
  }

  function boot() {
    start()
      .then(() => setStatus('idle'))
      .catch(() => {
        demoRef.current = null
        setStatus('failed')
      })
  }

  // Runs once, after the page has rendered: `boot` only touches a ref and state setters.
  useEffect(boot, [])

  async function send(make: (state: State) => Action) {
    if (isSending.current) return
    isSending.current = true
    setStatus('working')
    try {
      const { sim, session } = await start()
      const entry = await apply(sim, make(await sim.state()), nextId.current++)
      setEntries((earlier) => [entry, ...earlier])
      setView(await snapshot(sim, session))
      setStatus('idle')
    } catch {
      demoRef.current = null
      setStatus('failed')
    } finally {
      isSending.current = false
    }
  }

  function restart() {
    if (isSending.current) return
    demoRef.current = null
    setEntries([])
    setView(null)
    boot()
  }

  return <HomeVaultContext.Provider value={{ view, entries, status, send, restart }}>{children}</HomeVaultContext.Provider>
}

export function useHomeVault(): HomeVault {
  const vault = useContext(HomeVaultContext)
  if (vault === null) throw new Error('useHomeVault needs a HomeVaultProvider above it')
  return vault
}
