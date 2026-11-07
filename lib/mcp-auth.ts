import { createHash, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'

// Auth for /api/mcp. Two accepted credentials:
//  1. A Supabase access token issued by Supabase's OAuth 2.1 server (claude.ai / Claude Desktop
//     custom connectors). The token's user must exist in our `users` table (team member).
//  2. The shared MCP_API_KEY (Claude Code / mcp-remote configs) — kept as a fallback.

export type McpPrincipal =
  | { kind: 'apiKey' }
  | { kind: 'user'; userId: string; email: string; clientId: string | null }

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization')
  const m = h?.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

function matchesApiKey(token: string): boolean {
  const key = process.env.MCP_API_KEY
  if (!key) return false
  const a = createHash('sha256').update(token).digest()
  const b = createHash('sha256').update(key).digest()
  return timingSafeEqual(a, b)
}

let supabase: ReturnType<typeof createClient> | null = null
function supabaseClient() {
  supabase ??= createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  return supabase
}

export async function authenticateMcp(req: Request): Promise<McpPrincipal | null> {
  const token = bearer(req)
  if (!token) return null
  if (matchesApiKey(token)) return { kind: 'apiKey' }

  // Only JWT-shaped tokens go to Supabase.
  if (token.split('.').length !== 3) return null

  // Verifies signature + expiry locally against the project JWKS (asymmetric signing keys),
  // or via a round-trip to Supabase Auth if the project still uses a symmetric secret.
  const { data, error } = await supabaseClient().auth.getClaims(token)
  if (error || !data?.claims?.sub) return null
  const claims = data.claims as Record<string, unknown>

  const sub   = String(claims.sub)
  const email = typeof claims.email === 'string' ? claims.email : ''

  const user = await prisma.user.findFirst({
    where: { OR: [{ supabaseId: sub }, ...(email ? [{ email }] : [])] },
    select: { id: true, email: true },
  })
  if (!user) return null // signed in to Supabase but not a Plaz4 team member

  return {
    kind: 'user',
    userId: user.id,
    email: user.email,
    clientId: typeof claims.client_id === 'string' ? claims.client_id : null,
  }
}

/** Public origin of this deployment as seen by the caller (used in OAuth metadata URLs). */
export function publicOrigin(req: Request): string {
  const url   = new URL(req.url)
  const host  = req.headers.get('x-forwarded-host') ?? url.host
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '')
  return `${proto}://${host}`
}

export function resourceMetadataUrl(req: Request): string {
  return `${publicOrigin(req)}/.well-known/oauth-protected-resource/api/mcp`
}
