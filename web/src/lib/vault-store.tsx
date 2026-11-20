'use client'

// Owns the visitor's one vault. It is one of two kinds:
//
// - On a real test network, created through their wallet. What is kept in
//   this browser is where the vault is, the trial agent's key, the names
//   given to recipients and the receipts. The vault itself is on the network.
// - In this browser only (an in-memory chain). The session is kept as
//   `{setup, actions}` and the vault is rebuilt from it on load.

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import type { Sim } from './hardstop/sim.ts'
import type { LiveChain } from './live/chain.ts'
import type { LiveVault, Step } from './live/launch.ts'
import { parseVaultLink, type VaultLink } from './live/link.ts'
import { parseLive, stringifyLive } from './live/saved.ts'
import { injectedWallet, isRefusal, networkOf, type Network } from './live/wallet.ts'
import { loadSim } from './load-sim.ts'
import {
  apply,
  build,
  parseSession,
  snapshot,
  toSetup,
  type Action,
  type Entry,
  type Session,
  type SessionSetup,
  type View,
} from './session.ts'

const STORAGE_KEY = 'hardstop.practice.v1'
const LIVE_KEY = 'hardstop.live.v1'

/** A vault on a real network: which network, where, and what the trial agent has left for gas. */
export type Live = { network: Network; vault: LiveVault; agentGas: bigint }

type Store = {
  /** `starting`: loading or rebuilding. `none`: no vault yet. */
  status: 'starting' | 'none' | 'ready' | 'error'
  session: Session | null
  entries: Entry[]
  view: View | null
  /** Set when the vault is on a real network; null for one that lives in this browser. */
  live: Live | null
  /** An action is with the contract; controls should wait. */
  busy: boolean
  /** While a vault is being created on a network: which step it is at. */
  step: Step | null
  /** Something did not go through, but the vault is as it was. */
  problem: string | null
  /** False when the browser refused to store the vault. */
  saved: boolean
  error: string | null
  /** The error is about a vault a link named, not the visitor's own. */
  isLinkError: boolean
}

type Change =
  | { type: 'starting' }
  | { type: 'none' }
  | { type: 'busy' }
  | { type: 'step'; step: Step | null }
  | { type: 'problem'; message: string }
  | { type: 'ready'; session: Session; entries: Entry[]; view: View; live: Live | null; saved: boolean }
  | { type: 'acted'; session: Session; entry: Entry; view: View; agentGas: bigint | null; saved: boolean }
  | { type: 'error'; message: string; isLink?: boolean }

const INITIAL: Store = {
  status: 'starting',
  session: null,
  entries: [],
  view: null,
  live: null,
  busy: false,
  step: null,
  problem: null,
  saved: true,
  error: null,
  isLinkError: false,
}

function reduce(store: Store, change: Change): Store {
  switch (change.type) {
    case 'starting':
      return { ...INITIAL }
    case 'none':
      return { ...INITIAL, status: 'none' }
    case 'busy':
      return { ...store, busy: true, problem: null }
    case 'step':
      return { ...store, step: change.step, problem: null }
    case 'problem':
      return { ...store, busy: false, step: null, problem: change.message }
    case 'ready':
      return {
        ...INITIAL,
        status: 'ready',
        session: change.session,
        entries: change.entries,
        view: change.view,
        live: change.live,
        saved: change.saved,
      }
    case 'acted':
      return {
        ...store,
        busy: false,
        session: change.session,
        entries: [...store.entries, change.entry],
        view: change.view,
        live: store.live && change.agentGas !== null ? { ...store.live, agentGas: change.agentGas } : store.live,
        saved: change.saved,
      }
    case 'error':
      return { ...INITIAL, status: 'error', error: change.message, isLinkError: change.isLink === true }
  }
}

type VaultApi = Store & {
  /** Create a vault in this browser, replacing any existing one. Resolves true when it is ready. */
  create: (setup: SessionSetup) => Promise<boolean>
  /** Create a vault on a real test network through the visitor's wallet. Resolves true when it is ready. */
  createLive: (setup: SessionSetup, network: Network) => Promise<boolean>
  /** Send one action to the contract. Resolves with what it did, or null if it could not be sent. */
  act: (action: Action) => Promise<Entry | null>
  /** Forget the vault. One on a network stays there; this browser only stops showing it. Leaving a vault opened from a link forgets nothing. */
  reset: () => void
  /** Try again after an error: rebuild from what is stored. */
  retry: () => void
}

const VaultContext = createContext<VaultApi | null>(null)

function write(storage: 'sessionStorage' | 'localStorage', key: string, value: string): boolean {
  try {
    globalThis[storage].setItem(key, value)
    return true
  } catch {
    return false
  }
}

function read(storage: 'sessionStorage' | 'localStorage', key: string): string | null {
  try {
    return globalThis[storage].getItem(key)
  } catch {
    // Storage is blocked: carry on as if nothing were saved.
    return null
  }
}

/** Takes ?chain=&vault= out of the address bar, so a reload does not open that vault again. */
function leaveLink(): void {
  try {
    if (window.location.search !== '') window.history.replaceState(null, '', window.location.pathname)
  } catch {
    // No history to change: nothing to do.
  }
}

/** What a vault opened from a link starts with: the names are not on the network, except the one the link names. */
const linkSession = (link: VaultLink): Session => ({
  setup: {
    perPayment: '0',
    perDay: '0',
    validUntil: '0',
    coolingSecs: '0',
    funding: '0',
    now: '0',
    recipients: link.who === null ? [] : [{ name: 'The recipient in the alert', address: link.who }],
  },
  actions: [],
})

function forget(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY)
    localStorage.removeItem(LIVE_KEY)
  } catch {
    // Storage is unavailable, so there is nothing stored to remove.
  }
}

// Wallets report failures as plain { code, message } objects, not Error instances.
const messageOf = (error: unknown): string => {
  const message = (error as { message?: unknown } | null)?.message
  if (typeof message !== 'string') return String(error)
  return /insufficient funds/i.test(message)
    ? 'your wallet does not have enough test ETH on this network to pay the network fee.'
    : message
}

/** Why something sent through the wallet did not happen, in words. */
const walletProblem = (error: unknown): string =>
  isRefusal(error)
    ? 'You closed the wallet without approving, so nothing was sent.'
    : `That did not go through: ${messageOf(error)}`

export function VaultProvider({ children }: { children: ReactNode }) {
  const [store, dispatch] = useReducer(reduce, INITIAL)
  const simRef = useRef<Sim | null>(null)
  const sessionRef = useRef<Session | null>(null)
  // `fromLink`: opened from a link for its owner. It is never saved, so it cannot replace the visitor's own vault.
  const liveRef = useRef<{ vault: LiveVault; chain: LiveChain; entries: Entry[]; fromLink: boolean } | null>(null)
  const busyRef = useRef(false)

  const open = useCallback(async (session: Session, persist: boolean): Promise<boolean> => {
    dispatch({ type: 'starting' })
    try {
      const { sim, entries } = await build(await loadSim(), session)
      const view = await snapshot(sim, session)
      simRef.current = sim
      sessionRef.current = session
      liveRef.current = null
      const saved = persist ? write('sessionStorage', STORAGE_KEY, JSON.stringify(session)) : true
      dispatch({ type: 'ready', session, entries, view, live: null, saved })
      return true
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error) })
      return false
    }
  }, [])

  /** Shows a vault that is already on a network. Throws if the wallet or the network cannot be reached. */
  const openLive = useCallback(async (vault: LiveVault, session: Session, entries: Entry[], persist: boolean, fromLink = false) => {
    const wallet = injectedWallet()
    const network = networkOf(vault.chainId)
    if (wallet === null) throw new Error('Your vault is on a test network, and this browser has no wallet to reach it with.')
    if (network === undefined) throw new Error('The saved vault is on a network this site does not know.')
    const { attach } = await import('./live/launch.ts')
    const { sim, chain } = await attach(wallet, vault)
    const view = await snapshot(sim, session)
    simRef.current = sim
    sessionRef.current = session
    liveRef.current = { vault, chain, entries, fromLink }
    const saved = persist ? write('localStorage', LIVE_KEY, stringifyLive({ vault, session, entries })) : true
    dispatch({ type: 'ready', session, entries, view, live: { network, vault, agentGas: await chain.agentGas() }, saved })
  }, [])

  /** Opens the vault a link names, after checking that it is a HARDSTOP vault. */
  const openLink = useCallback(
    async (link: VaultLink) => {
      const wallet = injectedWallet()
      const network = networkOf(link.chainId)
      if (wallet === null || network === undefined) {
        throw new Error('This link opens a vault on a test network. Open it in a browser with a wallet, or in your wallet app.')
      }
      const { openByAddress } = await import('./live/launch.ts')
      const vault = await openByAddress(wallet, network, link.vault)
      await openLive(vault, linkSession(link), [], false, true)
      // Asked without a prompt: only an account the wallet already shares to this site.
      const [account] = ((await wallet.request({ method: 'eth_accounts' }).catch(() => [])) as string[]) ?? []
      if (account && account.toLowerCase() !== vault.owner) {
        dispatch({
          type: 'problem',
          message: `The wallet connected here (${account.slice(0, 6)}…${account.slice(-4)}) is not this vault's owner (${vault.owner.slice(0, 6)}…${vault.owner.slice(-4)}). You can look, but only the owner's wallet can change anything.`,
        })
      }
    },
    [openLive],
  )

  const boot = useCallback(async () => {
    const savedLive = read('localStorage', LIVE_KEY)
    const link = parseVaultLink(window.location.search)
    if (link === 'invalid') return dispatch({ type: 'error', message: 'The link names a vault this site cannot open. Check the link.', isLink: true })
    if (link !== null) {
      const saved = savedLive === null ? null : parseLive(savedLive)
      // The visitor's own vault: open it with its key and names, as usual.
      const isOwn = saved !== null && saved.vault.chainId === link.chainId && saved.vault.vault === link.vault
      try {
        return await (isOwn ? openLive(saved.vault, saved.session, saved.entries, false) : openLink(link))
      } catch (error) {
        return dispatch({ type: 'error', message: messageOf(error), isLink: !isOwn })
      }
    }
    if (savedLive !== null) {
      const parsed = parseLive(savedLive)
      if (parsed === null) return dispatch({ type: 'error', message: 'The saved vault could not be read.' })
      try {
        return await openLive(parsed.vault, parsed.session, parsed.entries, false)
      } catch (error) {
        return dispatch({ type: 'error', message: messageOf(error) })
      }
    }
    const raw = read('sessionStorage', STORAGE_KEY)
    if (raw === null) return dispatch({ type: 'none' })
    const session = parseSession(raw)
    if (session === null) return dispatch({ type: 'error', message: 'The saved practice vault could not be read.' })
    await open(session, false)
  }, [open, openLive, openLink])

  useEffect(() => {
    void boot()
  }, [boot])

  const create = useCallback(
    (setup: SessionSetup) => {
      leaveLink()
      forget()
      return open({ setup, actions: [] }, true)
    },
    [open],
  )

  const createLive = useCallback(
    async (setup: SessionSetup, network: Network): Promise<boolean> => {
      if (busyRef.current) return false
      const wallet = injectedWallet()
      if (wallet === null) {
        dispatch({ type: 'problem', message: 'This browser has no wallet. Install one, or open this page in your wallet app.' })
        return false
      }
      busyRef.current = true
      try {
        const { launchVault } = await import('./live/launch.ts')
        const vault = await launchVault(wallet, network, toSetup(setup), (step) => dispatch({ type: 'step', step }))
        leaveLink()
        forget()
        await openLive(vault, { setup, actions: [] }, [], true)
        return true
      } catch (error) {
        dispatch({ type: 'problem', message: walletProblem(error) })
        return false
      } finally {
        busyRef.current = false
      }
    },
    [openLive],
  )

  const act = useCallback(async (action: Action): Promise<Entry | null> => {
    const sim = simRef.current
    const session = sessionRef.current
    const live = liveRef.current
    if (sim === null || session === null || busyRef.current) return null
    busyRef.current = true
    dispatch({ type: 'busy' })
    try {
      const entry = await apply(sim, action, session.actions.length)
      const next: Session = { ...session, actions: [...session.actions, action] }
      sessionRef.current = next
      let saved: boolean
      let agentGas: bigint | null = null
      if (live === null) saved = write('sessionStorage', STORAGE_KEY, JSON.stringify(next))
      else if (live.fromLink) {
        live.entries = [...live.entries, entry]
        saved = true
        agentGas = await live.chain.agentGas()
      } else {
        live.entries = [...live.entries, entry]
        saved = write('localStorage', LIVE_KEY, stringifyLive({ vault: live.vault, session: next, entries: live.entries }))
        agentGas = await live.chain.agentGas()
      }
      dispatch({ type: 'acted', session: next, entry, view: await snapshot(sim, next), agentGas, saved })
      return entry
    } catch (error) {
      // On a network, a closed wallet or a dropped connection leaves the vault exactly as it was.
      if (live !== null) dispatch({ type: 'problem', message: walletProblem(error) })
      else dispatch({ type: 'error', message: messageOf(error) })
      return null
    } finally {
      busyRef.current = false
    }
  }, [])

  const reset = useCallback(() => {
    // Leaving a vault a link opened keeps the visitor's own vault saved, and shows it.
    if (parseVaultLink(window.location.search) !== null) {
      leaveLink()
      void boot()
      return
    }
    forget()
    simRef.current = null
    sessionRef.current = null
    liveRef.current = null
    dispatch({ type: 'none' })
  }, [boot])

  const retry = useCallback(() => {
    void boot()
  }, [boot])

  const api = useMemo(() => ({ ...store, create, createLive, act, reset, retry }), [store, create, createLive, act, reset, retry])
  return <VaultContext.Provider value={api}>{children}</VaultContext.Provider>
}

export function useVault(): VaultApi {
  const api = useContext(VaultContext)
  if (api === null) throw new Error('useVault needs a VaultProvider above it')
  return api
}
