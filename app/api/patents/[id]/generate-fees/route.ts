import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateMaintenanceFees } from '@/lib/uspto-api'

export const dynamic = 'force-dynamic'

// ── Event codes that represent maintenance fee payments ────────────────────────
// M1xxx = small entity, M2xxx = large entity, M3xxx = micro entity
// Last digit: 1 = 3.5yr, 2 = 7.5yr, 3 = 11.5yr
const PAYMENT_EVENT_CODES: Record<string, string> = {
  M1551: 'MAINTENANCE_3_5',  M2551: 'MAINTENANCE_3_5',  M3551: 'MAINTENANCE_3_5',
  M1552: 'MAINTENANCE_7_5',  M2552: 'MAINTENANCE_7_5',  M3552: 'MAINTENANCE_7_5',
  M1553: 'MAINTENANCE_11_5', M2553: 'MAINTENANCE_11_5', M3553: 'MAINTENANCE_11_5',
}

function parsePaidFeesFromEvents(events: any[]): Map<string, Date | null> {
  const paid = new Map<string, Date | null>()
  for (const ev of events) {
    const code = (ev.eventCode || '').toUpperCase().trim()
    if (PAYMENT_EVENT_CODES[code]) {
      paid.set(PAYMENT_EVENT_CODES[code], ev.eventDate ? new Date(ev.eventDate) : null)
      continue
    }
    // Fallback: match description text
    const desc = (ev.eventDescriptionText || '').toLowerCase()
    if (desc.includes('maintenance') && (desc.includes('paid') || desc.includes('payment') || desc.includes('received'))) {
      if      (desc.includes('3.5') || desc.includes('3 1/2') || desc.includes('3½')) paid.set('MAINTENANCE_3_5',  ev.eventDate ? new Date(ev.eventDate) : null)
      else if (desc.includes('7.5') || desc.includes('7 1/2') || desc.includes('7½')) paid.set('MAINTENANCE_7_5',  ev.eventDate ? new Date(ev.eventDate) : null)
      else if (desc.includes('11.5')|| desc.includes('11 1/2')|| desc.includes('11½'))paid.set('MAINTENANCE_11_5', ev.eventDate ? new Date(ev.eventDate) : null)
    }
  }
  return paid
}

async function fetchFeeStatusFromUSPTO(patentNumber: string): Promise<Map<string, { paidDate: Date | null }>> {
  const result = new Map<string, { paidDate: Date | null }>()
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (process.env.USPTO_API_KEY) headers['X-Api-Key'] = process.env.USPTO_API_KEY

    const res = await fetch(
      `https://api.uspto.gov/api/v1/patent/fees/maintenance/${patentNumber}`,
      { headers, signal: AbortSignal.timeout(10000) }
    )
    if (!res.ok) return result

    const data = await res.json()
    // Try several possible response shapes
    const schedule: any[] =
      data?.maintenanceFeeSchedule ??
      data?.maintenanceFees ??
      data?.feeSchedule ??
      data?.fees ??
      []

    for (const item of schedule) {
      const periodRaw = (item.stage ?? item.period ?? item.feeStage ?? item.maintenanceFeeStageDescriptionText ?? '').toLowerCase()
      const statusRaw = (item.status ?? item.paymentStatus ?? item.maintenanceFeeStatusDescriptionText ?? '').toLowerCase()
      const isPaid = statusRaw.includes('paid') || statusRaw.includes('received') || statusRaw.includes('ok')
      if (!isPaid) continue

      let feeType: string | null = null
      if      (periodRaw.includes('3.5')  || periodRaw.includes('3½')  || periodRaw.includes('3 1/2') || periodRaw.includes('first'))  feeType = 'MAINTENANCE_3_5'
      else if (periodRaw.includes('7.5')  || periodRaw.includes('7½')  || periodRaw.includes('7 1/2') || periodRaw.includes('second')) feeType = 'MAINTENANCE_7_5'
      else if (periodRaw.includes('11.5') || periodRaw.includes('11½') || periodRaw.includes('11 1/2')|| periodRaw.includes('third'))  feeType = 'MAINTENANCE_11_5'

      if (feeType) {
        const rawDate = item.paidDate ?? item.paymentDate ?? item.maintenanceFeePaidDate ?? null
        result.set(feeType, { paidDate: rawDate ? new Date(rawDate) : null })
      }
    }
  } catch {
    // Silent fallback — events will cover this
  }
  return result
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const patent = await prisma.patent.findUnique({
      where: { id },
      select: { id: true, grantDate: true, jurisdiction: true, status: true, patentNumber: true, rawJsonData: true }
    })
    if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!patent.grantDate) {
      return NextResponse.json({ error: 'No grant date on record. Try refreshing this patent first.' }, { status: 422 })
    }

    // ── 1. Extract events from stored rawJsonData ──────────────────────────────
    const raw = patent.rawJsonData as any
    const events: any[] = raw?.patentFileWrapperDataBag?.[0]?.eventDataBag ?? []
    const paidFromEvents = parsePaidFeesFromEvents(events)

    // ── 2. Try USPTO maintenance fee API ──────────────────────────────────────
    const paidFromApi = patent.patentNumber
      ? await fetchFeeStatusFromUSPTO(patent.patentNumber.replace(/^US/i, '').trim())
      : new Map<string, { paidDate: Date | null }>()

    // ── 3. Merge: API is authoritative; events fill gaps ──────────────────────
    const resolvedPaid = new Map<string, Date | null>()
    for (const [ft, val] of paidFromApi)   resolvedPaid.set(ft, val.paidDate)
    for (const [ft, date] of paidFromEvents) {
      if (!resolvedPaid.has(ft)) resolvedPaid.set(ft, date)
    }

    // ── 4. Clear and regenerate ───────────────────────────────────────────────
    await prisma.maintenanceFee.deleteMany({ where: { patentId: id } })

    const fees = calculateMaintenanceFees(patent.grantDate)
    const now  = new Date()

    await Promise.all(fees.map(f => {
      const isPaid = resolvedPaid.has(f.feeType)
      const status = isPaid
        ? 'PAID'
        : f.gracePeriodEnd < now ? 'OVERDUE'
        : f.dueDate < now        ? 'DUE'
        : 'UPCOMING'

      return prisma.maintenanceFee.create({
        data: {
          patentId:       id,
          feeType:        f.feeType as any,
          dueDate:        f.dueDate,
          gracePeriodEnd: f.gracePeriodEnd,
          status:         status as any,
          ...(isPaid ? { paidDate: resolvedPaid.get(f.feeType) ?? undefined } : {}),
        }
      })
    }))

    const created = await prisma.maintenanceFee.findMany({
      where: { patentId: id },
      orderBy: { dueDate: 'asc' }
    })

    const sources = {
      eventsChecked: events.length,
      paidFromEvents: [...paidFromEvents.keys()],
      paidFromApi:   [...paidFromApi.keys()],
    }

    return NextResponse.json({ fees: created, count: created.length, sources })
  } catch (e: any) {
    console.error('generate-fees error:', e)
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
