import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const now       = new Date()
    const yearEnd   = new Date(now.getFullYear(), 11, 31)
    const ninety    = new Date(now); ninety.setDate(ninety.getDate() + 90)

    const [
      totalPatents, granted, pending, abandoned, families,
      upcomingDeadlines, overdueDeadlines, expiringYear,
      grantedUS, grantedEP, openApplications,
      recentDeadlinesRaw, recentPatents,
    ] = await Promise.all([
      prisma.patent.count(),
      prisma.patent.count({ where: { status: 'GRANTED' } }),
      prisma.patent.count({ where: { status: 'PENDING' } }),
      prisma.patent.count({ where: { status: 'ABANDONED' } }),
      prisma.patentFamily.count(),
      prisma.maintenanceFee.count({ where: { status: { in: ['UPCOMING','DUE'] }, dueDate: { lte: ninety } } }),
      prisma.maintenanceFee.count({ where: { status: 'OVERDUE' } }),
      prisma.patent.count({ where: { expirationDate: { gte: now, lte: yearEnd } } }),
      // Granted by jurisdiction
      prisma.patent.count({ where: { status: 'GRANTED', jurisdiction: 'US' } }),
      prisma.patent.count({ where: { status: 'GRANTED', jurisdiction: 'EP' } }),
      // Open applications = PENDING or PUBLISHED (not yet granted/abandoned/expired)
      prisma.patent.count({ where: { status: { in: ['PENDING', 'PUBLISHED'] } } }),
      prisma.maintenanceFee.findMany({
        where: { status: { in: ['OVERDUE','UPCOMING','DUE'] } },
        orderBy: { dueDate: 'asc' },
        take: 5,
        include: { patent: { select: { patentNumber: true, title: true } } },
      }),
      prisma.patent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true, patentNumber: true, applicationNumber: true,
          title: true, status: true, filingDate: true,
          family: { select: { id: true, name: true } },
        },
      }),
    ])

    const today = new Date()
    const recentDeadlines = recentDeadlinesRaw.map(f => ({
      id:            f.id,
      patentId:      f.patentId,
      patentNumber:  f.patent.patentNumber,
      title:         f.patent.title,
      feeType:       f.feeType,
      dueDate:       f.dueDate.toISOString(),
      gracePeriodEnd: f.gracePeriodEnd?.toISOString() ?? null,
      status:        f.status,
      daysUntil:     Math.round((f.dueDate.getTime() - today.getTime()) / 86400000),
    }))

    return NextResponse.json({
      stats: { totalPatents, granted, pending, abandoned, families, upcomingDeadlines, overdueDeadlines, expiringYear, grantedUS, grantedEP, openApplications },
      recentDeadlines,
      recentPatents,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
