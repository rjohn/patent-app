import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextRequest, NextResponse } from 'next/server'

const PUBLIC_PATHS = ['/login', '/invite', '/reset-password']
const PUBLIC_API   = ['/api/auth', '/api/team/invite/accept']

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
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from login
  if (session && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', req.url))
  }

  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|p4-icon.png|fonts/).*)',],
}
