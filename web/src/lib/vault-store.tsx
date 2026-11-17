'use client'

// Owns the visitor's one practice vault. The session is kept in
// sessionStorage as `{setup, actions}` and the vault is rebuilt from it on
// load, so moving between pages or reloading keeps the same vault.

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import type { Sim } from './hardstop/sim.ts'
import { loadSim } from './load-sim.ts'
import { apply, build, parseSession, snapshot, type Action, type Entry, type Session, type SessionSetup, type View } from './session.ts'

const STORAGE_KEY = 'hardstop.practice.v1'

type Store = {
  /** `starting`: loading or rebuilding. `none`: no vault yet. */
  status: 'starting' | 'none' | 'ready' | 'error'
  session: Session | null
  entries: Entry[]
  view: View | null
  /** An action is with the contract; controls should wait. */
  busy: boolean
  /** False when the browser refused to store the session. */
  saved: boolean
  error: string | null
}

type Change =
  | { type: 'starting' }
  | { type: 'none' }
  | { type: 'busy' }
  | { type: 'ready'; session: Session; entries: Entry[]; view: View; saved: boolean }
  | { type: 'acted'; session: Session; entry: Entry; view: View; saved: boolean }
  | { type: 'error'; message: string }

const INITIAL: Store = { status: 'starting', session: null, entries: [], view: null, busy: false, saved: true, error: null }

function reduce(store: Store, change: Change): Store {
  switch (change.type) {
    case 'starting':
      return { ...INITIAL }
    case 'none':
      return { ...INITIAL, status: 'none' }
    case 'busy':
      return { ...store, busy: true }
    case 'ready':
      return { ...INITIAL, status: 'ready', session: change.session, entries: change.entries, view: change.view, saved: change.saved }
    case 'acted':
      return {
        ...store,
        busy: false,
        session: change.session,
        entries: [...store.entries, change.entry],
        view: change.view,
        saved: change.saved,
      }
    case 'error':
      return { ...INITIAL, status: 'error', error: change.message }
  }
}

type VaultApi = Store & {
  /** Create a vault, replacing any existing one. Resolves true when it is ready. */
  create: (setup: SessionSetup) => Promise<boolean>
  /** Send one action to the contract. Resolves with what it did, or null if it could not be sent. */
  act: (action: Action) => Promise<Entry | null>
  /** Forget the vault. */
  reset: () => void
  /** Try again after an error: rebuild from what is stored. */
  retry: () => void
}

const VaultContext = createContext<VaultApi | null>(null)

function save(session: Session): boolean {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    return true
  } catch {
    return false
  }
}

function forget(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage is unavailable, so there is nothing stored to remove.
  }
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export function VaultProvider({ children }: { children: ReactNode }) {
  const [store, dispatch] = useReducer(reduce, INITIAL)
  const simRef = useRef<Sim | null>(null)
  const sessionRef = useRef<Session | null>(null)
  const busyRef = useRef(false)

  const open = useCallback(async (session: Session, persist: boolean): Promise<boolean> => {
    dispatch({ type: 'starting' })
    try {
      const { sim, entries } = await build(await loadSim(), session)
      const view = await snapshot(sim, session)
      simRef.current = sim
      sessionRef.current = session
      dispatch({ type: 'ready', session, entries, view, saved: persist ? save(session) : true })
      return true
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error) })
      return false
    }
  }, [])

  const boot = useCallback(async () => {
    let raw: string | null = null
    try {
      raw = sessionStorage.getItem(STORAGE_KEY)
    } catch {
      // Storage is blocked: carry on with no saved vault.
    }
    if (raw === null) return dispatch({ type: 'none' })
    const session = parseSession(raw)
    if (session === null) return dispatch({ type: 'error', message: 'The saved practice vault could not be read.' })
    await open(session, false)
  }, [open])

  useEffect(() => {
    void boot()
  }, [boot])

  const create = useCallback((setup: SessionSetup) => open({ setup, actions: [] }, true), [open])

  const act = useCallback(async (action: Action): Promise<Entry | null> => {
    const sim = simRef.current
    const session = sessionRef.current
    if (sim === null || session === null || busyRef.current) return null
    busyRef.current = true
    dispatch({ type: 'busy' })
    try {
      const entry = await apply(sim, action, session.actions.length)
      const next: Session = { ...session, actions: [...session.actions, action] }
      sessionRef.current = next
      const saved = save(next)
      dispatch({ type: 'acted', session: next, entry, view: await snapshot(sim, next), saved })
      return entry
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error) })
      return null
    } finally {
      busyRef.current = false
    }
  }, [])

  const reset = useCallback(() => {
    forget()
    simRef.current = null
    sessionRef.current = null
    dispatch({ type: 'none' })
  }, [])

  const retry = useCallback(() => {
    void boot()
  }, [boot])

  const api = useMemo(() => ({ ...store, create, act, reset, retry }), [store, create, act, reset, retry])
  return <VaultContext.Provider value={api}>{children}</VaultContext.Provider>
}

export function useVault(): VaultApi {
  const api = useContext(VaultContext)
  if (api === null) throw new Error('useVault needs a VaultProvider above it')
  return api
}
