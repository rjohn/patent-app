import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { matchDocket, PatentCandidate } from '@/lib/invoice-matching'

export const dynamic = 'force-dynamic'

// POST: re-run docket matching on line items
// Body: { invoiceIds?: string[], force?: boolean }
// - invoiceIds: limit to specific invoices; omit for all
// - force: re-match even already-matched items
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const { invoiceIds, force } = body as { invoiceIds?: string[]; force?: boolean }

    const itemWhere: any = {}
    if (invoiceIds?.length) itemWhere.invoiceId = { in: invoiceIds }
    if (!force) itemWhere.patentId = null

    const [allPatents, lineItems] = await Promise.all([
      prisma.patent.findMany({
        select: { id: true, applicationNumber: true, patentNumber: true, docketNumber: true, title: true },
      }),
      prisma.invoiceLineItem.findMany({
        where: itemWhere,
        select: { id: true, docketNumber: true, description: true },
      }),
    ])

    const candidates: PatentCandidate[] = allPatents
    let matched = 0

    for (const item of lineItems) {
      const result = matchDocket(item.docketNumber, candidates, item.description)
      if (result.patentId) {
        await prisma.invoiceLineItem.update({
          where: { id: item.id },
          data: { patentId: result.patentId, matchConfidence: result.confidence },
        })
        matched++
      }
    }

    return NextResponse.json({ checked: lineItems.length, matched })
  } catch (e: any) {
    console.error('[rematch] error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
