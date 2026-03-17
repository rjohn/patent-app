import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

    const dbUser = await prisma.user.findFirst({
      where: {
        OR: [
          { supabaseId: session.user.id },
          { email: session.user.email ?? '' },
        ],
      },
      select: { name: true, email: true, role: true },
    })

    return NextResponse.json({
      name:  dbUser?.name  || session.user.user_metadata?.full_name || null,
      email: dbUser?.email || session.user.email,
      role:  dbUser?.role  || null,
    })
  } catch (e) {
    console.error('me error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
