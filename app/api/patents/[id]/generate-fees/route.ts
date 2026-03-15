import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateMaintenanceFees } from '@/lib/uspto-api'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const patent = await prisma.patent.findUnique({
      where: { id },
      select: { id: true, grantDate: true, jurisdiction: true, status: true }
    })
    if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    if (!patent.grantDate) {
      return NextResponse.json({ error: 'No grant date on record. Try refreshing this patent first.' }, { status: 422 })
    }

    // Clear and regenerate
    await prisma.maintenanceFee.deleteMany({ where: { patentId: id } })

    const fees = calculateMaintenanceFees(patent.grantDate)
    const now = new Date()
    await Promise.all(fees.map(f => {
      const status = f.dueDate < now ? (f.gracePeriodEnd < now ? 'OVERDUE' : 'DUE') : 'UPCOMING'
      return prisma.maintenanceFee.create({
        data: {
          patentId:       id,
          feeType:        f.feeType as any,
          dueDate:        f.dueDate,
          gracePeriodEnd: f.gracePeriodEnd,
          status:         status as any,
        }
      })
    }))

    const created = await prisma.maintenanceFee.findMany({
      where: { patentId: id },
      orderBy: { dueDate: 'asc' }
    })
    return NextResponse.json({ fees: created, count: created.length })
  } catch (e: any) {
    console.error('generate-fees error:', e)
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
