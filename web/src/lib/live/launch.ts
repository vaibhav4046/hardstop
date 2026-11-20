// Opening a vault on a real network: one transaction to the Launcher, which
// is a Fe contract in this repository (fe/src/launcher.fe).
//
// Nobody had to deploy the Launcher in advance. It is installed through the
// deterministic deployment proxy that already exists at the same address on
// most networks, so it lands at one known address everywhere; the first
// person to use a network pays for that once, and everyone after finds it
// there.

import { decodeEventLog, encodeFunctionData, getCreate2Address, type Hex } from 'viem'
import { generatePrivateKey } from 'viem/accounts'
import { launcherAbi, launcherBytecode } from '../hardstop/artifacts.ts'
import { Sim, ZERO, type Setup } from '../hardstop/sim.ts'
import { LiveChain } from './chain.ts'
import { accountOf, sendAsOwner, toHex, switchTo, waitFor, type Network, type Wallet } from './wallet.ts'

/** The deterministic deployment proxy (Arachnid's), present at this address on the supported networks. */
export const DEPLOYER: Hex = '0x4e59b44847b379578588920ca78fbf26c0b4956c'
const SALT: Hex = `0x${'00'.repeat(32)}`

/** Where the Launcher is, or will be, on every network. */
export const LAUNCHER: Hex = getCreate2Address({ from: DEPLOYER, salt: SALT, bytecode: launcherBytecode }).toLowerCase() as Hex

/** What has to be kept to find the vault again and to act as its trial agent. */
export type LiveVault = {
  chainId: number
  vault: Hex
  token: Hex
  owner: Hex
  /** Null for a vault opened from a link: this browser then acts only as its owner. */
  agentKey: Hex | null
  /** The agent's address; read from the vault when there is no key. */
  agent?: Hex
  /** The transaction that created it; null when the vault was opened from a link. */
  launchedIn: Hex | null
}

/** A vault this browser created: it holds the agent's key and knows the creating transaction. */
export type LaunchedVault = LiveVault & { agentKey: Hex; launchedIn: Hex }

export type Step = 'wallet' | 'network' | 'installing' | 'launching' | 'confirming'

const hasCode = async (wallet: Wallet, address: Hex): Promise<boolean> =>
  ((await wallet.request({ method: 'eth_getCode', params: [address, 'latest'] })) as Hex).length > 2

/**
 * Creates the vault. The wallet asks its owner to approve one transaction,
 * or two the first time anyone uses this network.
 */
export async function launchVault(
  wallet: Wallet,
  network: Network,
  setup: Setup,
  onStep: (step: Step) => void,
  pollMs = 1500,
): Promise<LaunchedVault> {
  onStep('wallet')
  const owner = await accountOf(wallet)
  onStep('network')
  await switchTo(wallet, network)

  // Say so plainly before the wallet fails with its own error: the launch forwards gas money to the agent.
  const balance = BigInt((await wallet.request({ method: 'eth_getBalance', params: [owner, 'latest'] })) as string)
  if (balance < network.gasMoney) {
    throw new Error(
      `Your wallet has no test ETH on ${network.name} to pay for this. Get some free from a ${network.name} faucet, then try again.`,
    )
  }

  if (!(await hasCode(wallet, LAUNCHER))) {
    if (!(await hasCode(wallet, DEPLOYER))) throw new Error(`${network.name} does not have the deployment proxy this site relies on.`)
    onStep('installing')
    const installed = await sendAsOwner(wallet, { from: owner, to: DEPLOYER, data: `${SALT}${launcherBytecode.slice(2)}` })
    const receipt = await waitFor(wallet, installed, pollMs)
    if (receipt.status !== '0x1' || !(await hasCode(wallet, LAUNCHER))) throw new Error('Installing the launcher failed.')
  }

  const agentKey = generatePrivateKey()
  const chain = new LiveChain(wallet, network.chainId, owner, agentKey)
  const [a = ZERO, b = ZERO, c = ZERO] = setup.payees
  const salt = BigInt(generatePrivateKey()) // any number nobody has used before
  const data = encodeFunctionData({
    abi: launcherAbi,
    functionName: 'launch',
    args: [chain.agent, setup.perPayment, setup.perWindow, setup.validUntil, setup.windowSecs, setup.coolingSecs, a, b, c, ZERO, setup.funding, salt],
  })

  onStep('launching')
  const launchedIn = await sendAsOwner(wallet, { from: owner, to: LAUNCHER, data, value: toHex(network.gasMoney) })
  onStep('confirming')
  const receipt = await waitFor(wallet, launchedIn, pollMs)
  if (receipt.status !== '0x1') throw new Error('The network refused the transaction that creates the vault.')

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== LAUNCHER) continue
    const { eventName, args } = decodeEventLog({ abi: launcherAbi, topics: log.topics as [Hex, ...Hex[]], data: log.data })
    if (eventName !== 'Launched') continue
    return {
      chainId: network.chainId,
      vault: args.vault.toLowerCase() as Hex,
      token: args.token.toLowerCase() as Hex,
      owner,
      agentKey,
      launchedIn,
    }
  }
  throw new Error('The vault was created but its address could not be read from the transaction.')
}

/** The vault wrapper for a vault that is already on a network. */
export async function attach(wallet: Wallet, live: LiveVault, pollMs = 1500): Promise<{ sim: Sim; chain: LiveChain }> {
  const chain = new LiveChain(wallet, live.chainId, live.owner, live.agentKey, live.agent)
  chain.pollMs = pollMs
  await chain.refresh(true)
  return { sim: Sim.attach(chain, live.token, live.vault, live.owner, chain.agent), chain }
}

/**
 * A vault found from its address alone, as an alert's link gives it: checked
 * to be a HARDSTOP vault, then opened for its owner. No agent key.
 */
export async function openByAddress(wallet: Wallet, network: Network, vault: Hex): Promise<LiveVault> {
  await switchTo(wallet, network)
  const { findVault } = await import('./find.ts')
  const found = await findVault(wallet, network, vault, { address: 'Check the link.', addressAndNetwork: 'Check the link.' })
  return { chainId: network.chainId, vault, token: found.token, owner: found.owner, agent: found.agent, agentKey: null, launchedIn: null }
}
