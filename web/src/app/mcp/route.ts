// The public practice MCP server: https://hardstop-omega.vercel.app/mcp
// One in-memory practice vault per MCP session. Nothing is real. See mcp/practice.ts.
import { practice } from '../../../mcp/practice.ts'

const server = practice()
const handle = (request: Request) => server.handle(request)

export { handle as POST, handle as GET, handle as DELETE, handle as OPTIONS }
