import { NextRequest, NextResponse } from 'next/server'
import { refreshAllPatents } from '@/lib/patent-refresh'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const summary = await refreshAllPatents()
  return NextResponse.json({
    total:     summary.total,
    updated:   summary.updated,
    unchanged: summary.unchanged,
    failed:    summary.failed,
  })
}
