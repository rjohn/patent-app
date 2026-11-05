import { createHash, timingSafeEqual } from 'crypto'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '@/lib/mcp-server'

// Remote MCP endpoint (Streamable HTTP, stateless) — lets Claude query the portfolio.
// Exempt from the session middleware; guarded by `Authorization: Bearer $MCP_API_KEY`.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function authorized(req: Request): boolean {
  const key = process.env.MCP_API_KEY
  if (!key) return false // fail closed if unset
  const given = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const a = createHash('sha256').update(given).digest()
  const b = createHash('sha256').update(key).digest()
  return timingSafeEqual(a, b)
}

async function handle(req: Request): Promise<Response> {
  if (!authorized(req)) {
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } },
    )
  }
  const server    = createMcpServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — required on serverless
    enableJsonResponse: true,
  })
  await server.connect(transport)
  return transport.handleRequest(req)
}

export { handle as GET, handle as POST, handle as DELETE }
