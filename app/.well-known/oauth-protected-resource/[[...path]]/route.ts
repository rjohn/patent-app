import { publicOrigin } from '@/lib/mcp-auth'

// RFC 9728 Protected Resource Metadata for the MCP endpoint. Served at both
// /.well-known/oauth-protected-resource and /.well-known/oauth-protected-resource/api/mcp.
// Points MCP clients (claude.ai, Claude Desktop) at Supabase's OAuth 2.1 server.

export const dynamic = 'force-dynamic'

export function GET(req: Request) {
  const origin = publicOrigin(req)
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ['header'],
      resource_name: 'Plaz4 IP',
    },
    { headers: { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' } },
  )
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  })
}
