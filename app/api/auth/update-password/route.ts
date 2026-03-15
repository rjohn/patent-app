import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    if (password.length < 8)  return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })

    const admin = getSupabaseAdmin()

    // Find the user by email
    const { data: { users }, error: listError } = await admin.auth.admin.listUsers()
    if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

    const user = users.find(u => u.email === email)
    if (!user) return NextResponse.json({ error: 'No account found for that email' }, { status: 404 })

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, { password })
    if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
