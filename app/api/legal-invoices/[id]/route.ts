import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const invoice = await prisma.legalInvoice.findUnique({
      where: { id },
      select: {
        id: true, lawFirm: true, invoiceNumber: true, invoiceDate: true,
        totalAmount: true, currency: true, parseStatus: true, notes: true,
        pdfName: true, createdAt: true, updatedAt: true,
        lineItems: {
          orderBy: { serviceDate: 'asc' },
          include: {
            patent: {
              select: { id: true, applicationNumber: true, patentNumber: true, title: true },
            },
            maintenanceFee: {
              select: { id: true, feeType: true, dueDate: true, amount: true, status: true },
            },
          },
        },
      },
    })
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ invoice })
  } catch (e) {
    console.error('[legal-invoices/[id]] GET error:', e)
    return NextResponse.json({ error: 'Failed to load invoice' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.legalInvoice.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[legal-invoices/[id]] DELETE error:', e)
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
