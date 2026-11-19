'use client'

// "Connect your AI": HARDSTOP as a tool an AI assistant installs (an MCP
// server, web/mcp/). Connected, the assistant is the vault's agent: it can
// check status, preview a payment, pay, list recipients and ask the owner
// for more, and nothing an owner can do.
//
// The logos say which assistants can install it ("works with"); none of
// these companies has reviewed or endorses HARDSTOP. They are self-hosted in
// public/logos/, as light-filled copies of: Simple Icons (CC0 icon data) for
// Claude, Cursor, GitHub Copilot, Windsurf and Python; LobeHub icons (MIT)
// for OpenAI and Hermes (the Nous Research mark). Neither set has a VS Code
// logo, so that entry shows GitHub Copilot, which is how it runs there.

import { useState, type CSSProperties } from 'react'
import { source } from '@/lib/links'

/** The one install line shown: the stdio form from web/mcp/clients/claude-code/README.md, on one line. Keep the two in step. */
export const INSTALL_COMMAND =
  'claude mcp add --env HARDSTOP_AGENT_KEY=<agent key> --env HARDSTOP_VAULT=<vault> --env HARDSTOP_CHAIN_ID=84532 --transport stdio --scope user hardstop -- node /path/to/hardstop/web/mcp/server.ts'
const SETUP_GUIDE = source('web/mcp/README.md')

// Each logo's own colour, shown on hover (and always on a touch screen).
// Brands whose mark is black use their light-on-dark form, white. Python's
// two colours are split along the diagonal, as its two snakes are.
const CLIENTS = [
  { file: 'claude', name: 'Claude', brand: '#d97757' },
  { file: 'openai', name: 'ChatGPT', brand: '#ffffff' },
  { file: 'cursor', name: 'Cursor', brand: '#ffffff' },
  { file: 'githubcopilot', name: 'VS Code + Copilot', brand: '#ffffff' },
  { file: 'windsurf', name: 'Windsurf', brand: '#ffffff' },
  { file: 'hermes', name: 'Hermes', brand: '#ffffff' },
  { file: 'python', name: 'Python', brand: 'linear-gradient(135deg, #3776ab 50%, #ffd43b 50%)' },
] as const

export function ConnectAI() {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard refused (permissions, an old browser): the line is on screen and selectable.
      setCopied(false)
    }
  }

  return (
    <section className="wrap band" aria-labelledby="connect-title">
      <p className="eyebrow">Connect your AI</p>
      <h2 id="connect-title" className="section-title mt-4 max-w-[40rem]">
        Give your assistant a wallet it cannot raise
      </h2>
      <p className="section-lede">
        Install HARDSTOP as a tool in your AI assistant. It then pays only through your vault, and it can never raise
        its own limit.
      </p>

      <ul className="connect-clients" aria-label="Works with">
        {CLIENTS.map((client) => (
          <li key={client.file}>
            {/* The logo file is the shape; the colour is painted through it, grey until hovered. */}
            <span
              className="connect-logo"
              aria-hidden="true"
              style={{ '--logo': `url(/logos/${client.file}.svg)`, '--brand': client.brand } as CSSProperties}
            />
            <span>{client.name}</span>
          </li>
        ))}
      </ul>

      <div className="connect-install card mt-10">
        <p className="panel-title">
          Install in Claude Code
        </p>
        <div className="connect-line mt-3">
          {/* Focusable, so the line can be scrolled with the keyboard where it is wider than the screen. */}
          <code tabIndex={0}>{INSTALL_COMMAND}</code>
          <button type="button" className="btn" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <p className="sr-only" role="status" aria-live="polite">
          {copied ? 'Install line copied.' : ''}
        </p>
        <p className="small soft mt-4">
          The other assistants, and the tools the agent gets, are in the{' '}
          <a href={SETUP_GUIDE} rel="noopener noreferrer">
            full setup guide
          </a>
          . Works with: these assistants can install it; none of their makers has reviewed or endorses HARDSTOP.
        </p>
      </div>
    </section>
  )
}
