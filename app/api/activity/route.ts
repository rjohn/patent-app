import { NextRequest, NextResponse } from 'next/server'
import { buildActivitySummary, buildEmailHtml } from '@/lib/activity'

export const dynamic = 'force-dynamic'

function parsePeriod(req: NextRequest): { from: Date; to: Date } {
  const { searchParams } = new URL(req.url)
  const period = searchParams.get('period')
  const fromParam = searchParams.get('from')
  const toParam   = searchParams.get('to')

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  if (fromParam && toParam) {
    return { from: new Date(fromParam), to: new Date(toParam + 'T23:59:59') }
  }

  if (period === 'week') {
    const from = new Date(today)
    from.setDate(today.getDate() - 6)
    return { from, to: new Date(today.getTime() + 86399999) }
  }

  if (period === 'lastmonth') {
    const from = new Date(today.getFullYear(), today.getMonth() - 1, 1)
    const to   = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59)
    return { from, to }
  }

  // Default: current month
  const from = new Date(today.getFullYear(), today.getMonth(), 1)
  return { from, to: new Date(today.getTime() + 86399999) }
}

export async function GET(req: NextRequest) {
  try {
    const { from, to } = parsePeriod(req)
    const summary = await buildActivitySummary(from, to)

    const format = new URL(req.url).searchParams.get('format')
    if (format === 'html') {
      return new NextResponse(buildEmailHtml(summary), { headers: { 'Content-Type': 'text/html' } })
    }

    return NextResponse.json(summary)
  } catch (e: any) {
    console.error('activity error:', e)
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
