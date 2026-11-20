import { NextRequest, NextResponse } from 'next/server'
import { refreshTrademarks } from '@/lib/trademark-refresh'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const summary = await refreshTrademarks()
  return NextResponse.json(summary)
}
