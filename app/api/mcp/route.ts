import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { createMcpServer } from '@/lib/mcp-server'
import { authenticateMcp, resourceMetadataUrl } from '@/lib/mcp-auth'

// Remote MCP endpoint (Streamable HTTP, stateless) — lets Claude query the portfolio.
// Exempt from the session middleware. Accepts either a Supabase OAuth access token
// (claude.ai / Desktop custom connector) or `Authorization: Bearer $MCP_API_KEY`.
// See lib/mcp-auth.ts and /.well-known/oauth-protected-resource.

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

async function handle(req: Request): Promise<Response> {
  const principal = await authenticateMcp(req)
  if (!principal) {
    return Response.json(
      { jsonrpc: '2.0', error: { code: -32001, message: 'Unauthorized' }, id: null },
      {
        status: 401,
        headers: { 'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl(req)}"` },
      },
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
