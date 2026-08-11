import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

async function getCurrentDbUser() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null

  return prisma.user.findFirst({
    where: {
      OR: [
        { supabaseId: session.user.id },
        { email: session.user.email ?? '' },
      ],
    },
  })
}

export async function GET() {
  const user = await getCurrentDbUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const sub = await prisma.activitySubscription.findUnique({ where: { userId: user.id } })

  return NextResponse.json({
    enabled:        sub?.enabled        ?? false,
    frequency:      sub?.frequency      ?? 'WEEKLY',
    onlyIfActivity: sub?.onlyIfActivity ?? true,
  })
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentDbUser()
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { enabled, frequency, onlyIfActivity } = body

  if (frequency !== undefined && frequency !== 'WEEKLY' && frequency !== 'MONTHLY') {
    return NextResponse.json({ error: 'frequency must be WEEKLY or MONTHLY' }, { status: 400 })
  }
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
  }
  if (onlyIfActivity !== undefined && typeof onlyIfActivity !== 'boolean') {
    return NextResponse.json({ error: 'onlyIfActivity must be a boolean' }, { status: 400 })
  }

  const data = {
    ...(enabled        !== undefined ? { enabled }        : {}),
    ...(frequency      !== undefined ? { frequency }      : {}),
    ...(onlyIfActivity !== undefined ? { onlyIfActivity } : {}),
  }

  const sub = await prisma.activitySubscription.upsert({
    where:  { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  })

  return NextResponse.json({
    enabled:        sub.enabled,
    frequency:      sub.frequency,
    onlyIfActivity: sub.onlyIfActivity,
  })
}
