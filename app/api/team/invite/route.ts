import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase'

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

    const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/invite/${invite.token}`

    // Send invite email via Supabase — recipient gets a link straight to our invite page
    const { error: emailError } = await getSupabaseAdmin().auth.admin.inviteUserByEmail(email, {
      redirectTo: inviteUrl,
      data: { full_name: name || '' },
    })
    if (emailError) {
      // Log but don't fail — invite URL can still be shared manually
      console.warn('Supabase invite email error:', emailError.message)
    }

    return NextResponse.json({ invite, inviteUrl, emailSent: !emailError })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
  }
}
