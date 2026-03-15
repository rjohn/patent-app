import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const fee = await prisma.maintenanceFee.update({
      where: { id },
      data: {
        status:   body.status,
        paidDate: body.paidDate ? new Date(body.paidDate) : null,
        paidAmount: body.paidAmount ?? null,
        notes:    body.notes ?? undefined,
      },
    })
    return NextResponse.json(fee)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to update fee' }, { status: 500 })
  }
}
