import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const invoice = await prisma.legalInvoice.findUnique({
    where: { id },
    select: { pdfData: true, pdfName: true },
  })
  if (!invoice?.pdfData) {
    return NextResponse.json({ error: 'PDF not found' }, { status: 404 })
  }
  const filename = invoice.pdfName ?? 'invoice.pdf'
  return new NextResponse(invoice.pdfData as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}
