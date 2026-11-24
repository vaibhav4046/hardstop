// Hosted alerts for one vault, as an Atom feed: /alerts?chain=84532&vault=0x…
// Read fresh from the chain on every request; no key, nothing stored. See mcp/feed.ts.
import { alertFeed } from '../../../mcp/feed.ts'
import { connect, ownerPage, plain, readConfig, status, windowWords } from '../../../mcp/vault.ts'

// The checks are shared with the MCP server, whose messages name its HARDSTOP_* variables; here they are query parameters.
const text = (body: string, code: number) =>
  new Response(body.replace(/HARDSTOP_CHAIN_ID/g, 'chain').replace(/HARDSTOP_VAULT/g, 'vault'), {
    status: code,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url)
  let config
  try {
    config = readConfig({
      HARDSTOP_CHAIN_ID: url.searchParams.get('chain') ?? undefined,
      HARDSTOP_VAULT: url.searchParams.get('vault') ?? undefined,
    })
  } catch (error) {
    return text(`${plain(error)}\nUse /alerts?chain=84532&vault=0x…`, 400)
  }
  try {
    const vault = await connect(config)
    const { json } = await status(vault)
    const self = new URL(`/alerts?chain=${config.network.chainId}&vault=${config.vault}`, url.origin).toString()
    const xml = alertFeed({
      vault: config.vault,
      network: config.network.name,
      ownerPage: ownerPage(vault),
      selfUrl: self,
      now: json.now as string,
      rules: json.rules as Parameters<typeof alertFeed>[0]['rules'],
      waiting: json.waiting_change as Parameters<typeof alertFeed>[0]['waiting'],
      per: windowWords(BigInt(json.window_secs as string)).per,
      coolingSecs: Number(vault.schedule.coolingSecs),
    })
    return new Response(xml, {
      headers: {
        'content-type': 'application/atom+xml; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=60',
      },
    })
  } catch (error) {
    return text(plain(error), 502)
  }
}
