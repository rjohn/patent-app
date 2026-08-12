import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  const dbUrl = process.env.DATABASE_URL ?? '(not set)'
  const directUrl = process.env.DIRECT_URL ?? '(not set)'
  console.log('[DB DEBUG] DATABASE_URL:', dbUrl.replace(/:([^:@]+)@/, ':***@'))
  console.log('[DB DEBUG] DIRECT_URL:', directUrl.replace(/:([^:@]+)@/, ':***@'))

  try {
    const now       = new Date()
    const yearEnd   = new Date(now.getFullYear(), 11, 31)
    const ninety    = new Date(now); ninety.setDate(ninety.getDate() + 90)

    const [
      totalPatents, granted, pending, abandoned, families,
      upcomingDeadlines, overdueDeadlines, expiringYear,
      grantedUS, grantedEP, openApplications,
      recentDeadlinesRaw, recentPatents, grantedPatents, inventorPatents,
    ] = await Promise.all([
      // Exclude dead-end provisional filings: EXPIRED with no patentNumber means it
      // lapsed before ever becoming a real patent, not a granted patent whose term ran out.
      prisma.patent.count({ where: { NOT: { status: 'EXPIRED', patentNumber: null } } }),
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
      prisma.patent.findMany({
        where: { grantDate: { not: null } },
        select: { grantDate: true, jurisdiction: true },
      }),
      prisma.patent.findMany({
        where: { inventors: { isEmpty: false } },
        select: { inventors: true },
      }),
    ])

    // Cumulative granted-patent count by grant year, with gap years filled in —
    // one series per jurisdiction filter so the dashboard dropdown can switch instantly
    const buildSeries = (filterJurisdiction: 'US' | 'EP' | null): { year: number; total: number }[] => {
      const countsByYear = new Map<number, number>()
      for (const p of grantedPatents) {
        if (filterJurisdiction && p.jurisdiction !== filterJurisdiction) continue
        const year = p.grantDate!.getFullYear()
        countsByYear.set(year, (countsByYear.get(year) || 0) + 1)
      }
      if (countsByYear.size === 0) return []
      const years = Array.from(countsByYear.keys())
      const minYear = Math.min(...years)
      const maxYear = Math.max(new Date().getFullYear(), ...years)
      const series: { year: number; total: number }[] = []
      let running = 0
      for (let y = minYear; y <= maxYear; y++) {
        running += countsByYear.get(y) || 0
        series.push({ year: y, total: running })
      }
      return series
    }


    const growthByYear = {
      ALL: buildSeries(null),
      US:  buildSeries('US'),
      EP:  buildSeries('EP'),
    }

    // The same person shows up in structurally different formats depending on
    // source: USPTO gives "Gregory A. Watson"; EPO's epodoc format gives
    // "Watson Gregory A [US]"; other EPO records give "Watson, Gregory, A." or
    // "Watson, Gregory A." — same three tokens, different order/punctuation.
    // Sorting the cleaned tokens gives a format-agnostic grouping key.
    const titleCase = (raw: string) =>
      raw.trim().replace(/\s+/g, ' ').split(' ').map(word =>
        word.split(/([-'])/).map(seg =>
          seg && /[a-z]/i.test(seg[0]) ? seg[0].toUpperCase() + seg.slice(1).toLowerCase() : seg
        ).join('')
      ).join(' ')
    const cleanName = (raw: string) => raw.replace(/\[[^\]]*\]/g, '').trim()
    const tokenKey  = (raw: string) =>
      cleanName(raw).replace(/[.,]/g, ' ').split(/\s+/).filter(Boolean).map(t => t.toUpperCase()).sort().join(' ')
    // Prefer "First M. Last" (no comma, no "[US]"-style suffix) as the display form
    const isNaturalForm = (raw: string) => !cleanName(raw).includes(',') && !raw.includes('[')

    const inventorGroups = new Map<string, { count: number; candidates: Map<string, number> }>()
    for (const p of inventorPatents) {
      const seenKeys = new Set<string>()
      for (const raw0 of p.inventors) {
        const raw = raw0.trim()
        if (!raw) continue
        const key = tokenKey(raw)
        if (!key || seenKeys.has(key)) continue
        seenKeys.add(key)
        let group = inventorGroups.get(key)
        if (!group) { group = { count: 0, candidates: new Map() }; inventorGroups.set(key, group) }
        group.count++
        if (isNaturalForm(raw)) {
          const display = titleCase(cleanName(raw))
          group.candidates.set(display, (group.candidates.get(display) || 0) + 1)
        }
      }
    }
    const topInventors = Array.from(inventorGroups.entries())
      .map(([key, group]) => {
        const bestCandidate = Array.from(group.candidates.entries()).sort((a, b) => b[1] - a[1])[0]
        return { name: bestCandidate ? bestCandidate[0] : titleCase(key), count: group.count }
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

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
      growthByYear,
      topInventors,
    })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 })
  }
}
