import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const SETTING_KEYS = ['company_name'] as const

export async function GET() {
  try {
    const rows = await prisma.setting.findMany({
      where: { key: { in: [...SETTING_KEYS] } },
    })
    const result: Record<string, string> = {}
    for (const row of rows) result[row.key] = row.value
    return NextResponse.json(result)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const updates = Object.entries(body).filter(([k]) =>
      (SETTING_KEYS as readonly string[]).includes(k)
    )
    await Promise.all(updates.map(([key, value]) =>
      prisma.setting.upsert({
        where:  { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      })
    ))
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
