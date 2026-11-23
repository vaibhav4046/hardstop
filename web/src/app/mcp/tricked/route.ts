// The practice MCP server, each vault starting with a $1,000 raise its owner
// was talked into, waiting out its cooling period. See mcp/practice.ts.
import { practice } from '../../../../mcp/practice.ts'

const server = practice({ trickedRaise: true })
const handle = (request: Request) => server.handle(request)

export { handle as POST, handle as GET, handle as DELETE, handle as OPTIONS }
