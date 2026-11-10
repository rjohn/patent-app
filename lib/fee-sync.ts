import { prisma } from '@/lib/prisma'

// Reconciles US maintenance fee records with USPTO prosecution-history payment events.
//
// USPTO event codes for maintenance fee payments: M<entity>55<stage>
//   entity: 1 = undiscounted (large), 2 = small, 3 = micro
//   stage:  1 = 3.5-year (4th yr), 2 = 7.5-year (8th yr), 3 = 11.5-year (12th yr)
// (M<entity>554 etc. are late-payment surcharges — not the fee itself.)

const STAGE_TO_FEE: Record<string, string> = {
  '1': 'MAINTENANCE_3_5',
  '2': 'MAINTENANCE_7_5',
  '3': 'MAINTENANCE_11_5',
}
const PAYMENT_CODE = /^M[123]55([123])$/

/** Fee type → earliest USPTO payment date found in the event history. */
export function paidFeesFromEvents(events: any[]): Map<string, Date | null> {
  const paid = new Map<string, Date | null>()
  const record = (feeType: string, rawDate: string | undefined) => {
    const date = rawDate ? new Date(rawDate) : null
    const prev = paid.get(feeType)
    if (!paid.has(feeType) || (date && (!prev || date < prev))) paid.set(feeType, date)
  }

  for (const ev of events ?? []) {
    const code = String(ev?.eventCode ?? '').toUpperCase().trim()
    const m = code.match(PAYMENT_CODE)
    if (m) { record(STAGE_TO_FEE[m[1]], ev.eventDate); continue }

    // Fallback: description text (older/odd records)
    const desc = String(ev?.eventDescriptionText ?? '').toLowerCase()
    if (!desc.includes('maintenance fee') || !desc.includes('payment') || desc.includes('surcharge')) continue
    if      (/\b(3\.5|3 1\/2|4th)\b/.test(desc))   record('MAINTENANCE_3_5',  ev.eventDate)
    else if (/\b(7\.5|7 1\/2|8th)\b/.test(desc))   record('MAINTENANCE_7_5',  ev.eventDate)
    else if (/\b(11\.5|11 1\/2|12th)\b/.test(desc)) record('MAINTENANCE_11_5', ev.eventDate)
  }
  return paid
}

/** Event list from a stored (slimmed) or live USPTO search response. */
export function eventsFromRaw(raw: any): any[] {
  return raw?.patentFileWrapperDataBag?.[0]?.eventDataBag ?? []
}

const sameDay = (a: Date | null, b: Date | null) =>
  !!a && !!b && a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10)

export interface FeeSyncResult {
  markedPaid:      string[]  // fee types newly marked PAID
  datesCorrected:  string[]  // already PAID, paidDate replaced with the USPTO date
  duplicatesRemoved: number
}

/**
 * Brings a patent's US maintenance fee rows in line with USPTO payment events:
 *  - removes duplicate rows of the same fee type (keeping the one with invoice links / PAID / oldest)
 *  - marks fees PAID when USPTO shows a payment, using the USPTO payment date
 *    (also corrects a hand-entered paidDate when USPTO has the real one)
 * Never marks a fee unpaid.
 */
export async function syncUsFeePayments(patentId: string, events: any[]): Promise<FeeSyncResult> {
  const result: FeeSyncResult = { markedPaid: [], datesCorrected: [], duplicatesRemoved: 0 }

  const fees = await prisma.maintenanceFee.findMany({
    where:   { patentId, feeType: { in: Object.values(STAGE_TO_FEE) as any } },
    include: { _count: { select: { invoiceItems: true } } },
    orderBy: { createdAt: 'asc' },
  })

  // ── De-duplicate ────────────────────────────────────────────────────────────
  const byType = new Map<string, typeof fees>()
  for (const f of fees) byType.set(f.feeType, [...(byType.get(f.feeType) ?? []), f])

  const keepers: typeof fees = []
  for (const rows of Array.from(byType.values())) {
    const ranked = [...rows].sort((a, b) =>
      (b._count.invoiceItems - a._count.invoiceItems) ||
      (Number(b.status === 'PAID') - Number(a.status === 'PAID')) ||
      (a.createdAt.getTime() - b.createdAt.getTime()))
    const [keep, ...dupes] = ranked
    keepers.push(keep)
    for (const d of dupes) {
      await prisma.$transaction([
        prisma.invoiceLineItem.updateMany({ where: { maintenanceFeeId: d.id }, data: { maintenanceFeeId: keep.id } }),
        prisma.maintenanceFee.delete({ where: { id: d.id } }),
      ])
      result.duplicatesRemoved++
    }
  }

  // ── Apply USPTO payments ────────────────────────────────────────────────────
  const paid = paidFeesFromEvents(events)
  for (const fee of keepers) {
    if (!paid.has(fee.feeType)) continue
    const usptoDate = paid.get(fee.feeType) ?? null

    if (fee.status !== 'PAID') {
      await prisma.maintenanceFee.update({
        where: { id: fee.id },
        data:  { status: 'PAID', paidDate: usptoDate ?? fee.paidDate ?? new Date() },
      })
      result.markedPaid.push(fee.feeType)
    } else if (usptoDate && !sameDay(fee.paidDate, usptoDate)) {
      await prisma.maintenanceFee.update({ where: { id: fee.id }, data: { paidDate: usptoDate } })
      result.datesCorrected.push(fee.feeType)
    }
  }

  return result
}
