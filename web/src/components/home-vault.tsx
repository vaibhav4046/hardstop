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
  /** The contract's own `exposure(until)` for each moment asked about. Null when the vault is not running. */
  exposureAt: (untils: bigint[]) => Promise<bigint[] | null>
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
  // The simulated chain does one thing at a time: a read that ran in the
  // middle of a payment could see it half applied.
  const turn = useRef<Promise<unknown>>(Promise.resolve())
  function inTurn<T>(work: () => Promise<T>): Promise<T> {
    const result = turn.current.then(work, work)
    turn.current = result.catch(() => undefined)
    return result
  }

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

  // The EVM is most of the page's script, and every part that uses it is well
  // below the fold, so it loads when one of them comes near the screen (or
  // on the first request). Runs once: `boot` only touches a ref and state setters.
  useEffect(() => {
    const parts = document.querySelectorAll('[data-practice-vault]')
    if (parts.length === 0 || typeof IntersectionObserver === 'undefined') return boot()
    const observer = new IntersectionObserver(
      (seen) => {
        if (!seen.some((part) => part.isIntersecting)) return
        observer.disconnect()
        boot()
      },
      { rootMargin: '200px 0px' },
    )
    parts.forEach((part) => observer.observe(part))
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function send(make: (state: State) => Action) {
    if (isSending.current) return
    isSending.current = true
    setStatus('working')
    try {
      const { sim, session } = await start()
      const [entry, after] = await inTurn(async () => {
        const made = await apply(sim, make(await sim.state()), nextId.current++)
        return [made, await snapshot(sim, session)] as const
      })
      setEntries((earlier) => [entry, ...earlier])
      setView(after)
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

  async function exposureAt(untils: bigint[]): Promise<bigint[] | null> {
    const running = demoRef.current
    if (running === null) return null
    try {
      const { sim } = await running
      return await inTurn(async () => {
        const answers: bigint[] = []
        for (const until of untils) answers.push(await sim.exposure(until))
        return answers
      })
    } catch {
      return null
    }
  }

  return (
    <HomeVaultContext.Provider value={{ view, entries, status, send, restart, exposureAt }}>{children}</HomeVaultContext.Provider>
  )
}

export function useHomeVault(): HomeVault {
  const vault = useContext(HomeVaultContext)
  if (vault === null) throw new Error('useHomeVault needs a HomeVaultProvider above it')
  return vault
}
