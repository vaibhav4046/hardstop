'use client'

// "Connect your AI" on the Activity page, for a vault opened on a test
// network: this vault's setup for each MCP client, filled in and ready to
// copy. The forms are the ones in web/mcp/clients/* and web/mcp/README.md;
// keep them in step.
//
// The agent key: it is the agent's trial key, kept in this browser by the
// site already (live.vault.agentKey), never the owner's. It is masked in what
// is shown until the owner opens "Show agent key"; a Copy button always copies
// the complete setup. It is never logged, put in a URL or sent anywhere: it
// only goes to the clipboard when the owner presses Copy. VS Code keeps its
// own masked prompt for the key, so the key never lands in a workspace file;
// the watcher needs no key at all.

import { useState } from 'react'
import type { Hex } from 'viem'
import type { Live } from '@/lib/vault-store'

/** The one-file server, fetched and run by npx from the repository (web/mcp/dist/hardstop-mcp.mjs). Needs Node.js 20 or later. */
const PACKAGE = 'github:vaibhav4046/hardstop'
const ARGS = ['-y', PACKAGE]
const MASK = '0x••••••••'

type Filled = { key: string; vault: string; chainId: string }
type Client = { id: string; label: string; where: string; text: (filled: Filled) => string }

const json = (value: unknown) => JSON.stringify(value, null, 2)
const env = ({ key, vault, chainId }: Filled) => ({ HARDSTOP_AGENT_KEY: key, HARDSTOP_VAULT: vault, HARDSTOP_CHAIN_ID: chainId })

const CLIENTS: Client[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    where: 'Run in a terminal.',
    text: ({ key, vault, chainId }) =>
      `claude mcp add --env HARDSTOP_AGENT_KEY=${key} --env HARDSTOP_VAULT=${vault} --env HARDSTOP_CHAIN_ID=${chainId} --transport stdio --scope user hardstop -- npx -y ${PACKAGE}`,
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    where: 'Add to claude_desktop_config.json (on Windows, %APPDATA%\\Claude\\claude_desktop_config.json).',
    text: (filled) => json({ mcpServers: { hardstop: { command: 'npx', args: ARGS, env: env(filled) } } }),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    where: 'Save as .cursor/mcp.json.',
    text: (filled) => json({ mcpServers: { hardstop: { type: 'stdio', command: 'npx', args: ARGS, env: env(filled) } } }),
  },
  {
    id: 'vscode',
    label: 'VS Code',
    where: 'Save as .vscode/mcp.json. VS Code asks for the agent key in a masked prompt, so it is not written in the file.',
    text: ({ vault, chainId }) =>
      json({
        inputs: [
          { type: 'promptString', id: 'hardstop-agent-key', description: 'HARDSTOP agent key (hex). Never the owner key.', password: true },
        ],
        servers: {
          hardstop: {
            type: 'stdio',
            command: 'npx',
            args: ARGS,
            env: { HARDSTOP_AGENT_KEY: '${input:hardstop-agent-key}', HARDSTOP_VAULT: vault, HARDSTOP_CHAIN_ID: chainId },
          },
        },
      }),
  },
  {
    id: 'watch',
    label: 'Watch 24/7',
    where:
      'For you, not the agent: run it on a machine that stays on. It only reads the vault and needs no key. Add HARDSTOP_ALERT_WEBHOOK=https://... to send each alert to a webhook.',
    text: ({ vault, chainId }) =>
      `HARDSTOP_VAULT=${vault} HARDSTOP_CHAIN_ID=${chainId} npx -y ${PACKAGE} --watch >> hardstop-alerts.jsonl`,
  },
]

export function VaultConnect({ live }: { live: Live & { vault: { agentKey: Hex } } }) {
  const [shown, setShown] = useState(CLIENTS[0].id)
  const [isKeyShown, setKeyShown] = useState(false)
  const [said, setSaid] = useState('')
  const client = CLIENTS.find((candidate) => candidate.id === shown) ?? CLIENTS[0]
  const real: Filled = { key: live.vault.agentKey, vault: live.vault.vault, chainId: String(live.vault.chainId) }
  const visible: Filled = { ...real, key: isKeyShown ? real.key : MASK }

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setSaid(`${what} copied.`)
    } catch {
      setSaid('Copying was refused by the browser. Select the text and copy it instead.')
    }
  }

  return (
    <section aria-labelledby="connect-vault-title" className="card lg:col-span-2">
      <h2 id="connect-vault-title" className="label">
        Connect your AI
      </h2>
      <p className="mt-2 max-w-[44rem]">
        Your assistant becomes this vault&rsquo;s agent: it pays only through the vault, inside your limits, and can never
        raise them. Each setup runs the server with npx (Node.js 20 or later); nothing to clone. On Windows, Claude Desktop may need <code>cmd /c npx</code>.
      </p>

      <div className="switch mt-5" role="group" aria-label="Which setup to show">
        {CLIENTS.map((option) => (
          <button key={option.id} type="button" aria-pressed={option.id === shown} onClick={() => setShown(option.id)}>
            {option.label}
          </button>
        ))}
      </div>

      <p className="small soft mt-4">{client.where}</p>
      <div className="setup mt-2">
        {/* Focusable so a long line can be scrolled with the keyboard. */}
        <pre tabIndex={0} aria-label={`${client.label} setup`}>
          <code>{client.text(visible)}</code>
        </pre>
        <button type="button" className="btn" onClick={() => copy(client.text(real), `${client.label} setup`)}>
          Copy
        </button>
      </div>

      <details className="disclosure mt-6" onToggle={(event) => setKeyShown(event.currentTarget.open)}>
        <summary>Show agent key</summary>
        <p className="small soft">
          This is the agent&rsquo;s key, for a test network only, never your wallet&rsquo;s. Anyone holding it can only spend
          within this vault&rsquo;s limits, and the little test ETH it keeps for network fees.
        </p>
        {/* Only in the page while open: closed, the key is not in the document at all. */}
        {isKeyShown && (
          <div className="setup mt-3">
            <pre tabIndex={0} aria-label="Agent key">
              <code>{real.key}</code>
            </pre>
            <button type="button" className="btn" onClick={() => copy(real.key, 'Agent key')}>
              Copy
            </button>
          </div>
        )}
      </details>

      <p className="sr-only" role="status" aria-live="polite">
        {said}
      </p>
    </section>
  )
}
