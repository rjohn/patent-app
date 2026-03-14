import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const [members, invites] = await Promise.all([
      prisma.user.findMany({
        orderBy: { createdAt: 'asc' },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      }),
      prisma.invite.findMany({
        where: { status: 'PENDING', expiresAt: { gte: new Date() } },
        orderBy: { createdAt: 'desc' },
        select: { id: true, email: true, name: true, role: true, token: true, createdAt: true, expiresAt: true, status: true },
      }),
    ])
    return NextResponse.json({ members, invites })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load team' }, { status: 500 })
  }
}
