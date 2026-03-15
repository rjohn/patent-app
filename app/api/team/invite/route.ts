import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { email, name, role } = await req.json()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    // Check if already a member
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'This email is already a team member' }, { status: 409 })
    }

    // Upsert invite — resend if already pending
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + 7) // 7-day expiry

    const invite = await prisma.invite.upsert({
      where: { email },
      update: {
        name: name || null,
        role: role || 'VIEWER',
        status: 'PENDING',
        expiresAt,
        token: crypto.randomUUID(),
      },
      create: {
        email,
        name: name || null,
        role: role || 'VIEWER',
        expiresAt,
      },
    })

    // In production you'd send an email here via Resend/SendGrid/etc.
    // For now we return the invite link so you can share it manually.
    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/${invite.token}`

    return NextResponse.json({ invite, inviteUrl })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
}
