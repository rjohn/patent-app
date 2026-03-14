import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'

function odpHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.USPTO_API_KEY) h['X-Api-Key'] = process.env.USPTO_API_KEY
  return h
}

export interface PatentEvent {
  eventCode: string
  eventDate: string        // ISO date string YYYY-MM-DD
  description: string
  category: EventCategory
}

export type EventCategory =
  | 'filing'
  | 'examination'
  | 'office_action'
  | 'response'
  | 'publication'
  | 'allowance'
  | 'grant'
  | 'fee'
  | 'assignment'
  | 'correspondence'
  | 'status'
  | 'other'

// Map ODP event codes to human-readable categories
function categorize(code: string): EventCategory {
  const c = code.toUpperCase()
  if (['COMP','OIPE','FLRCPT.O','FLRCPT.R','IEXX','APPERMS','BIG.','SMAL','MICR'].some(p => c.startsWith(p) || c === p)) return 'filing'
  if (['FWDX','DOCK','EX.','EXIN','EXPRO','AWAIT','RES.','MPEP'].some(p => c.startsWith(p))) return 'examination'
  if (['NON','OA.','CTNF','CTFR','MCTNF','MCTFR','RESTRICTION','ELEC'].some(p => c.startsWith(p))) return 'office_action'
  if (['RCE','RCEX','RESP','AFTER','AMEND','REPL','TRAN','AFCP'].some(p => c.startsWith(p))) return 'response'
  if (['PUB','B.','A.','WO'].some(p => c.startsWith(p))) return 'publication'
  if (['NOA','ALLOW','ISSUE.REQ','M326','WIDS','WIDS.'].some(p => c.startsWith(p))) return 'allowance'
  if (['ISSUE','PTGR','ISSR','GRANT','I.','USSN'].some(p => c.startsWith(p))) return 'grant'
  if (['FEE','PAY','M','SURCHARGE','REFUND','SMALL','MF'].some(p => c.startsWith(p))) return 'fee'
  if (['ASSI','ASSIGN','1756','ASGN'].some(p => c.startsWith(p))) return 'assignment'
  if (['MAIL','CORR','PA..','POA','IDS','INFO'].some(p => c.startsWith(p))) return 'correspondence'
  if (['ABANDON','EXPRO','EXPIRE','DISP','WITHDRAWN','STAT'].some(p => c.startsWith(p))) return 'status'
  return 'other'
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const patent = await prisma.patent.findUnique({
      where: { id },
      select: { applicationNumber: true, rawJsonData: true }
    })
    if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Try stored data first
    let eventBag: any[] = []
    const stored = patent.rawJsonData as any
    const storedBag = stored?.patentFileWrapperDataBag?.[0]?.eventDataBag
    if (Array.isArray(storedBag) && storedBag.length > 0) {
      eventBag = storedBag
    } else if (patent.applicationNumber) {
      // Fetch fresh from ODP
      const cleanNum = patent.applicationNumber.replace(/[\/,\s]/g, '')
      try {
        const url = new URL(`${ODP_BASE}/search`)
        url.searchParams.set('q', `applicationNumberText:${cleanNum}`)
        url.searchParams.set('limit', '1')
        const res = await fetch(url.toString(), {
          headers: odpHeaders(),
          signal: AbortSignal.timeout(12000),
        })
        if (res.ok) {
          const data = await res.json()
          eventBag = data?.patentFileWrapperDataBag?.[0]?.eventDataBag || []
        }
      } catch { /* proceed with empty */ }
    }

    // Normalize and sort reverse-chronological
    const events: PatentEvent[] = eventBag
      .filter((e: any) => e.eventDate && e.eventDescriptionText)
      .map((e: any) => ({
        eventCode:   e.eventCode || '',
        eventDate:   e.eventDate,
        description: e.eventDescriptionText,
        category:    categorize(e.eventCode || ''),
      }))
      .sort((a: PatentEvent, b: PatentEvent) =>
        b.eventDate.localeCompare(a.eventDate)
      )

    return NextResponse.json({ events, total: events.length })
  } catch (e: any) {
    console.error('events error:', e)
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
