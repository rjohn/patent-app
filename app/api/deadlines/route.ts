import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const days   = parseInt(searchParams.get('days') || '365')
    const status = searchParams.get('status') || ''

    const now    = new Date()
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() + days)

    const where: any = { dueDate: { lte: cutoff } }
    if (status) where.status = status

    const fees = await prisma.maintenanceFee.findMany({
      where,
      include: {
        patent: {
          select: {
            id: true, patentNumber: true, applicationNumber: true,
            title: true, status: true,
            family: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    })

    const deadlines = fees.map(fee => ({
      id:             fee.id,
      patentId:       fee.patentId,
      patentNumber:   fee.patent.patentNumber,
      applicationNumber: fee.patent.applicationNumber,
      title:          fee.patent.title,
      feeType:        fee.feeType,
      dueDate:        fee.dueDate.toISOString(),
      gracePeriodEnd: fee.gracePeriodEnd?.toISOString() ?? null,
      status:         fee.status,
      paidDate:       fee.paidDate?.toISOString() || null,
      amount:         fee.paidAmount || null,
      daysUntil:      Math.round((fee.dueDate.getTime() - now.getTime()) / 86400000),
      family:         fee.patent.family,
    }))

    return NextResponse.json({ deadlines })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch deadlines' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, paidDate, paidAmount } = await req.json()
    const fee = await prisma.maintenanceFee.update({
      where: { id },
      data: {
        status,
        paidDate:   paidDate   ? new Date(paidDate) : undefined,
        paidAmount: paidAmount ?? undefined,
      },
    })
    return NextResponse.json(fee)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to update fee' }, { status: 500 })
  }
}
