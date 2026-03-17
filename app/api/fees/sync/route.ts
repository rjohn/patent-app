import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateMaintenanceFees } from '@/lib/uspto-api'

export const dynamic = 'force-dynamic'

const PAYMENT_EVENT_CODES: Record<string, string> = {
  M1551: 'MAINTENANCE_3_5',  M2551: 'MAINTENANCE_3_5',  M3551: 'MAINTENANCE_3_5',
  M1552: 'MAINTENANCE_7_5',  M2552: 'MAINTENANCE_7_5',  M3552: 'MAINTENANCE_7_5',
  M1553: 'MAINTENANCE_11_5', M2553: 'MAINTENANCE_11_5', M3553: 'MAINTENANCE_11_5',
}

function parsePaidFromEvents(events: any[]): Map<string, Date | null> {
  const paid = new Map<string, Date | null>()
  for (const ev of events) {
    const code = (ev.eventCode || '').toUpperCase().trim()
    if (PAYMENT_EVENT_CODES[code]) {
      paid.set(PAYMENT_EVENT_CODES[code], ev.eventDate ? new Date(ev.eventDate) : null)
      continue
    }
    const desc = (ev.eventDescriptionText || '').toLowerCase()
    if (desc.includes('maintenance') && (desc.includes('paid') || desc.includes('payment') || desc.includes('received'))) {
      if      (desc.includes('3.5')  || desc.includes('3 1/2') || desc.includes('3½'))  paid.set('MAINTENANCE_3_5',  ev.eventDate ? new Date(ev.eventDate) : null)
      else if (desc.includes('7.5')  || desc.includes('7 1/2') || desc.includes('7½'))  paid.set('MAINTENANCE_7_5',  ev.eventDate ? new Date(ev.eventDate) : null)
      else if (desc.includes('11.5') || desc.includes('11 1/2')|| desc.includes('11½')) paid.set('MAINTENANCE_11_5', ev.eventDate ? new Date(ev.eventDate) : null)
    }
  }
  return paid
}

export async function POST() {
  try {
    // Find all US utility patents that have fees and rawJsonData with events
    const patents = await prisma.patent.findMany({
      where: {
        maintenanceFees: { some: {} },
        grantDate: { not: null },
        NOT: { rawJsonData: { equals: 'DbNull' as any } },
        OR: [{ jurisdiction: 'US' }, { jurisdiction: null }],
      },
      select: { id: true, grantDate: true, rawJsonData: true },
    })

    let synced = 0
    let updated = 0

    for (const patent of patents) {
      synced++
      const raw = patent.rawJsonData as any
      const events: any[] = raw?.patentFileWrapperDataBag?.[0]?.eventDataBag ?? []
      if (events.length === 0) continue

      const paidFees = parsePaidFromEvents(events)
      if (paidFees.size === 0) continue

      // Only update fees that are currently not PAID but should be
      const existingFees = await prisma.maintenanceFee.findMany({
        where: { patentId: patent.id, status: { not: 'PAID' } },
      })

      for (const fee of existingFees) {
        if (paidFees.has(fee.feeType)) {
          await prisma.maintenanceFee.update({
            where: { id: fee.id },
            data: {
              status: 'PAID',
              paidDate: paidFees.get(fee.feeType) ?? undefined,
            },
          })
          updated++
        }
      }
    }

    return NextResponse.json({ synced, updated })
  } catch (e: any) {
    console.error('fee sync error:', e)
    return NextResponse.json({ error: e?.message || 'Sync failed' }, { status: 500 })
  }
}
