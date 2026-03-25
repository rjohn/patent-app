import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const items = await prisma.invoiceLineItem.findMany({
      where: { patentId: id },
      orderBy: { serviceDate: 'desc' },
      include: {
        invoice: {
          select: { id: true, lawFirm: true, invoiceNumber: true, invoiceDate: true, currency: true },
        },
      },
    })
    return NextResponse.json({ items })
  } catch (e) {
    console.error('[invoice-items] GET error:', e)
    return NextResponse.json({ error: 'Failed to load invoice items' }, { status: 500 })
  }
}
