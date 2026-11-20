import { NextResponse } from 'next/server'
import { refreshTrademarks } from '@/lib/trademark-refresh'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Manual "Check USPTO now" from /trademarks — same job as the daily cron.
export async function POST() {
  try {
    return NextResponse.json(await refreshTrademarks())
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
