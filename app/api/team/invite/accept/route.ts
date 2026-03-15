import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// GET /api/team/invite/accept?token=xxx  — validate token, return invite details
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    const invite = await prisma.invite.findUnique({ where: { token } })

    if (!invite)                       return NextResponse.json({ error: 'Invite not found' },   { status: 404 })
    if (invite.status === 'ACCEPTED')  return NextResponse.json({ error: 'Invite already used' }, { status: 410 })
    if (new Date() > invite.expiresAt) return NextResponse.json({ error: 'Invite has expired' },  { status: 410 })

    return NextResponse.json({ email: invite.email, name: invite.name, role: invite.role })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// POST /api/team/invite/accept — accept invite, create Supabase Auth user + DB user
export async function POST(req: NextRequest) {
  try {
    const { token, name } = await req.json()
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    const invite = await prisma.invite.findUnique({ where: { token } })

    if (!invite)                       return NextResponse.json({ error: 'Invite not found' },   { status: 404 })
    if (invite.status === 'ACCEPTED')  return NextResponse.json({ error: 'Invite already used' }, { status: 410 })
    if (new Date() > invite.expiresAt) return NextResponse.json({ error: 'Invite has expired' },  { status: 410 })

    // Check if DB user already exists
    const existing = await prisma.user.findUnique({ where: { email: invite.email } })
    if (existing) {
      await prisma.invite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED' } })
      return NextResponse.json({ ok: true, message: 'Account already exists. Please log in.' })
    }

    // Create Supabase Auth user (passwordless — they sign in via magic link)
    const { data: authData, error: authError } = await getSupabaseAdmin().auth.admin.createUser({
      email:         invite.email,
      email_confirm: true,
      user_metadata: { full_name: name || invite.name || '' },
    })

    if (authError) {
      console.error('Supabase auth create user error:', authError)
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    // Create DB user + mark invite accepted
    await prisma.$transaction([
      prisma.user.create({
        data: {
          supabaseId: authData.user.id,
          email:      invite.email,
          name:       name || invite.name || null,
          role:       invite.role,
        },
      }),
      prisma.invite.update({
        where: { id: invite.id },
        data:  { status: 'ACCEPTED' },
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 })
  }
}
