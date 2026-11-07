import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextRequest, NextResponse } from 'next/server'
import { safeNext } from '@/lib/safe-next'

const PUBLIC_PATHS = ['/login', '/invite', '/reset-password']
// /api/cron/* has no session cookie (Vercel Cron sends a CRON_SECRET bearer token instead) —
// exempt from the session gate here, but each route still checks that token itself.
// /api/mcp likewise authenticates itself (Supabase OAuth token or MCP_API_KEY; Claude clients have
// no session cookie). /.well-known serves the public OAuth protected-resource metadata for it.
const PUBLIC_API   = ['/api/auth', '/api/team/invite/accept', '/api/cron', '/api/mcp', '/.well-known']

export async function middleware(req: NextRequest) {
  const res      = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // Refresh session cookie if needed
  const { data: { session } } = await supabase.auth.getSession()

  const { pathname } = req.nextUrl

  const isPublic =
    PUBLIC_PATHS.some(p => pathname.startsWith(p)) ||
    PUBLIC_API.some(p => pathname.startsWith(p)) ||
    pathname === '/_next' ||
    pathname.startsWith('/_next/')

  // Redirect unauthenticated users to login
  if (!session && !isPublic) {
    const url = req.nextUrl.clone()
    url.pathname = '/login'
    url.search   = ''
    // Keep the query string — e.g. /oauth/consent?authorization_id=… must survive sign-in
    url.searchParams.set('next', pathname + req.nextUrl.search)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from login (back to where they were headed, if given)
  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL(safeNext(req.nextUrl.searchParams.get('next')), req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|p4-icon.png|p4-icon-favicon.png|fonts/|manifest.json|icons/).*)',],
}
