import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateAndCacheSummary } from '@/lib/portfolio-summary'
import { refreshOne, refreshAllPatents, PATENT_SELECT } from '@/lib/patent-refresh'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')

  if (id) {
    const patent = await prisma.patent.findUnique({ where: { id }, select: PATENT_SELECT })
    if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const result = await refreshOne(patent)
    if (result.status === 'updated') generateAndCacheSummary().catch(() => {})
    return NextResponse.json(result)
  }

  const patents = await prisma.patent.findMany({ select: PATENT_SELECT, orderBy: { updatedAt: 'asc' } })
  return NextResponse.json({ patents, total: patents.length })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const ids: string[] | undefined = body.ids
    const summary = await refreshAllPatents(ids)
    return NextResponse.json(summary)
  } catch (e) {
    console.error('Bulk refresh error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Refresh failed' }, { status: 500 })
  }
}
