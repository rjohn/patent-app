import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; lineItemId: string }> }
) {
  try {
    const { lineItemId } = await params
    const body = await req.json()
    const { patentId, maintenanceFeeId, matchConfidence } = body

    const item = await prisma.invoiceLineItem.update({
      where: { id: lineItemId },
      data: {
        patentId: patentId ?? null,
        maintenanceFeeId: maintenanceFeeId ?? null,
        matchConfidence: matchConfidence ?? (patentId ? 'MANUAL' : null),
      },
      include: {
        patent: { select: { id: true, applicationNumber: true, patentNumber: true, title: true } },
        maintenanceFee: { select: { id: true, feeType: true, dueDate: true, status: true } },
      },
    })

    return NextResponse.json({ item })
  } catch (e) {
    console.error('[line-items PATCH] error:', e)
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }
}
