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

// ── EP renewal fee schedule (EPO official rates, EUR) ─────────────────────────
const EP_RENEWAL_AMOUNTS: Record<number, number> = {
  2: 130, 3: 160, 4: 190, 5: 270, 6: 370, 7: 470, 8: 580, 9: 700, 10: 820,
  11: 950, 12: 1090, 13: 1230, 14: 1380, 15: 1530, 16: 1680, 17: 1830, 18: 1980, 19: 2135, 20: 2290,
}

function generateEpRenewalFees(filingDate: Date) {
  const now = new Date()
  return Array.from({ length: 19 }, (_, i) => i + 2).map(yr => {
    const due = new Date(filingDate)
    due.setFullYear(due.getFullYear() + yr)
    const grace = new Date(due)
    grace.setMonth(grace.getMonth() + 6)
    const status = grace < now ? 'OVERDUE' : due < now ? 'DUE' : 'UPCOMING'
    return { yr, due, grace, status }
  })
}

// Match a fee payment date to the renewal year using the filing date anniversaries
function matchPaymentToYear(paymentDate: Date, filingDate: Date): number | null {
  for (let yr = 2; yr <= 20; yr++) {
    const due = new Date(filingDate)
    due.setFullYear(due.getFullYear() + yr)
    const grace = new Date(due)
    grace.setMonth(grace.getMonth() + 6)
    // Payment must fall within the window: up to 12 months before due through grace end
    const windowStart = new Date(due)
    windowStart.setFullYear(windowStart.getFullYear() - 1)
    if (paymentDate >= windowStart && paymentDate <= grace) return yr
  }
  return null
}

// Fetch EPIDOSNRFE2 (renewal fee paid) events from EPO register
let _epTokenCache: { token: string; expires: number } | null = null
async function getEpToken(): Promise<string | null> {
  if (_epTokenCache && Date.now() < _epTokenCache.expires - 30000) return _epTokenCache.token
  const key = process.env.EPO_OPS_KEY; const secret = process.env.EPO_OPS_SECRET
  if (!key || !secret) return null
  try {
    const res = await fetch('https://ops.epo.org/3.2/auth/accesstoken', {
      method: 'POST',
      headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials', signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return null
    const data = await res.json()
    _epTokenCache = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 }
    return _epTokenCache.token
  } catch { return null }
}

async function fetchEpRenewalPayments(epNumber: string): Promise<Date[] | null> {
  const token = await getEpToken()
  if (!token) return null
  const docId = /^EP/i.test(epNumber) ? epNumber : `EP${epNumber}`
  try {
    const res = await fetch(`https://ops.epo.org/3.2/rest-services/register/publication/epodoc/${docId}/events`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml' },
      signal: AbortSignal.timeout(12000),
    })
    if (!res.ok) return null
    const xml = await res.text()
    const dates: Date[] = []
    const re = /<(?:[^:>]+:)?dossier-event[\s\S]*?<\/(?:[^:>]+:)?dossier-event>/gi
    let m
    while ((m = re.exec(xml)) !== null) {
      const block = m[0]
      if (!block.includes('EPIDOSNRFE2')) continue
      const dateMatch = block.match(/<(?:[^:>]+:)?date[^>]*>(\d{8})<\/(?:[^:>]+:)?date>/i)
      if (dateMatch) {
        const d = dateMatch[1]
        dates.push(new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`))
      }
    }
    return dates
  } catch { return null }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const patent = await prisma.patent.findUnique({
      where: { id },
      select: { id: true, grantDate: true, filingDate: true, jurisdiction: true, status: true, patentNumber: true, epNumber: true, publicationNumber: true, rawJsonData: true }
    })
    if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ── EP patent: generate annual renewal fees from filing date ──────────────
    if (patent.jurisdiction === 'EP') {
      if (!patent.filingDate) {
        return NextResponse.json({ error: 'No filing date on record for this EP patent.' }, { status: 422 })
      }

      // Fetch EPO register events to detect paid renewal fees
      const epNum = patent.epNumber
        || patent.publicationNumber?.replace(/^EP/i, '')
        || patent.patentNumber?.replace(/^EP/i, '')
        || null
      const paymentDates = epNum ? await fetchEpRenewalPayments(epNum) : []
      if (paymentDates === null) {
        return NextResponse.json({ error: 'Could not fetch EPO payment data — fee history not modified' }, { status: 503 })
      }

      // Map payment dates → renewal year
      const paidYears = new Set<number>()
      const paidDateByYear = new Map<number, Date>()
      for (const pd of paymentDates) {
        const yr = matchPaymentToYear(pd, patent.filingDate)
        if (yr) { paidYears.add(yr); paidDateByYear.set(yr, pd) }
      }

      await prisma.maintenanceFee.deleteMany({ where: { patentId: id } })

      const feeRows = generateEpRenewalFees(patent.filingDate)
      await Promise.all(feeRows.map(({ yr, due, grace, status }) => {
        const isPaid = paidYears.has(yr)
        return prisma.maintenanceFee.create({
          data: {
            patentId:       id,
            feeType:        'ANNUITY' as any,
            dueDate:        due,
            gracePeriodEnd: grace,
            status:         isPaid ? 'PAID' : status as any,
            amount:         EP_RENEWAL_AMOUNTS[yr] ?? null,
            currency:       'EUR',
            notes:          `Year ${yr} Renewal`,
            ...(isPaid ? { paidDate: paidDateByYear.get(yr) } : {}),
          },
        })
      }))

      const created = await prisma.maintenanceFee.findMany({
        where: { patentId: id },
        orderBy: { dueDate: 'asc' },
      })
      return NextResponse.json({ fees: created, count: created.length, paidFromEpo: Array.from(paidYears) })
    }

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
    Array.from(paidFromApi.entries()).forEach(([ft, val]) => resolvedPaid.set(ft, val.paidDate))
    Array.from(paidFromEvents.entries()).forEach(([ft, date]) => {
      if (!resolvedPaid.has(ft)) resolvedPaid.set(ft, date)
    })

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
      paidFromEvents: Array.from(paidFromEvents.keys()),
      paidFromApi:   Array.from(paidFromApi.keys()),
    }

    return NextResponse.json({ fees: created, count: created.length, sources })
  } catch (e: any) {
    console.error('generate-fees error:', e)
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
