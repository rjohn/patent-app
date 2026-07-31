import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'
const OPS_BASE = 'https://ops.epo.org/3.2/rest-services'

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

// ── USPTO event categorization ────────────────────────────────────────────────

function categorize(code: string): EventCategory {
  const c = code.toUpperCase()
  // Filing
  if (['COMP','OIPE','FLRCPT.O','FLRCPT.R','IEXX','APPERMS','BIG.','SMAL','MICR'].some(p => c === p || c.startsWith(p))) return 'filing'
  // Office actions — check before broad M prefix
  if (['CTNF','CTFR','MCTNF','MCTFR','NON','OA.','RESTRICTION','ELEC'].some(p => c.startsWith(p))) return 'office_action'
  // Examination
  if (['FWDX','DOCK','EX.','EXIN','AWAIT','RES.','MPEP'].some(p => c.startsWith(p))) return 'examination'
  // Response
  if (['RCE','RCEX','RESP','AFTER','AMEND','REPL','TRAN','AFCP','REAS'].some(p => c.startsWith(p))) return 'response'
  // Publication
  if (['PUB','B.','A.','WO','PUBTC','PG-ISSUE'].some(p => c === p || c.startsWith(p))) return 'publication'
  // Allowance — real ODP codes: MN/=. (Mail NOA), N/=. (NOA verification), CNOA, MCNOA, PILS, plus legacy
  if (['NOA','ALLOW','ISSUE.REQ','M326','CNOA','MCNOA','PILS'].some(p => c === p || c.startsWith(p))) return 'allowance'
  if (c.startsWith('MN/') || c.startsWith('N/=')) return 'allowance'
  // Grant — real ODP codes: PTGR, MPTGR, PGM/ (grant mailed), WPIR (issue notification)
  if (['PTGR','MPTGR','PGM/','WPIR','ISSUE','ISSR','GRANT','USSN'].some(p => c === p || c.startsWith(p))) return 'grant'
  // Fee — use M+digit for maintenance fee codes (M1551, M1552, M844) to avoid catching mailing codes
  if (['FEE','PAY','SURCHARGE','REFUND','IFEE','SMALL','MF'].some(p => c.startsWith(p))) return 'fee'
  if (/^M\d/.test(c)) return 'fee'
  // Assignment
  if (['ASSI','ASSIGN','1756','ASGN'].some(p => c.startsWith(p))) return 'assignment'
  // Correspondence (IDS, mailings)
  if (['MAIL','CORR','PA..','POA','IDS','WIDS','INFO'].some(p => c.startsWith(p))) return 'correspondence'
  // Status
  if (['ABANDON','EXPIRE','DISP','WITHDRAWN','STAT'].some(p => c.startsWith(p))) return 'status'
  return 'other'
}

// ── EPO OPS auth ──────────────────────────────────────────────────────────────

let _epoTokenCache: { token: string; expires: number } | null = null

async function getEpoToken(): Promise<string> {
  if (_epoTokenCache && Date.now() < _epoTokenCache.expires - 30000) return _epoTokenCache.token
  const key = process.env.EPO_OPS_KEY
  const secret = process.env.EPO_OPS_SECRET
  if (!key || !secret) throw new Error('EPO API credentials not configured (EPO_OPS_KEY / EPO_OPS_SECRET)')
  const res = await fetch('https://ops.epo.org/3.2/auth/accesstoken', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`EPO auth failed: ${res.status}`)
  const data = await res.json()
  _epoTokenCache = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 }
  return _epoTokenCache.token
}

// ── EPO XML helpers (namespace-agnostic) ──────────────────────────────────────

function epFirstTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}(?:[^>]*)>([\\s\\S]*?)<\\/(?:[^:>]+:)?${tag}>`, 'i')
  const m = xml.match(re)
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null
}

function epAttr(fragment: string, tag: string, attr: string): string | null {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*\\b${attr}="([^"]*)"`, 'i')
  const m = fragment.match(re)
  return m ? m[1] : null
}

function epAllBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}(?:[^>]*)>[\\s\\S]*?<\\/(?:[^:>]+:)?${tag}>`, 'gi')
  return xml.match(re) || []
}

// ── EPO event categorization ──────────────────────────────────────────────────

function categorizeEpStep(code: string, text: string): EventCategory {
  const c = code.toUpperCase()
  const t = text.toLowerCase()

  if (['RFILING', 'RDAPS', 'FILING', 'FILED', 'RECEIPT'].some(p => c.includes(p))) return 'filing'
  if (['RSRCH', 'RSEAI', 'SEARCH'].some(p => c.includes(p))) return 'examination'
  if (['REXAM'].some(p => c.includes(p))) return 'examination'
  if (['ROAG', 'SUMMONS', 'OBJECTION'].some(p => c.includes(p))) return 'office_action'
  if (c.startsWith('RESP') || ['REPLY', 'AMEND', 'RREPL'].some(p => c.includes(p))) return 'response'
  if (['RPUBL', 'RBULD', 'PUBL'].some(p => c.includes(p))) return 'publication'
  if (['RGRANT', 'INTENT', 'ALLOW', 'RNOTG'].some(p => c.includes(p))) return 'allowance'
  if (['RISSG', 'RMSGG', 'RGRAN', 'GRANT', 'ISSUE'].some(p => c.includes(p))) return 'grant'
  if (['RFEE', 'RANT', 'RANTE', 'ANNUIT', 'RENEWAL', 'PAYMENT'].some(p => c.includes(p))) return 'fee'
  if (['RTRAN', 'ASSIGN', 'TRANSFER', 'CHANGE'].some(p => c.includes(p))) return 'assignment'
  if (['RWITHD', 'RREFUS', 'REXPI', 'ROPPO', 'RREVOC', 'LAPSE', 'EXPIRE'].some(p => c.includes(p))) return 'status'

  // Fall back to text
  if (t.includes('filing') || t.includes('filed')) return 'filing'
  if (t.includes('search report') || t.includes('search opinion')) return 'examination'
  if (t.includes('examination')) return 'examination'
  if (t.includes('communication') && (t.includes('art') || t.includes('examination'))) return 'office_action'
  if (t.includes('summons') || t.includes('objection')) return 'office_action'
  if (t.includes('response') || t.includes('reply') || t.includes('amendment')) return 'response'
  if (t.includes('publication') || t.includes('published')) return 'publication'
  if (t.includes('intention to grant') || t.includes('notice of allowance')) return 'allowance'
  if (t.includes('grant') || t.includes('mention of grant')) return 'grant'
  if (t.includes('fee') || t.includes('annuity') || t.includes('renewal')) return 'fee'
  if (t.includes('assignment') || t.includes('transfer')) return 'assignment'
  if (t.includes('withdrawal') || t.includes('refusal') || t.includes('lapsed') || t.includes('expired') || t.includes('opposition')) return 'status'

  return 'other'
}

// ── Categorize EPO register event codes (from /register/events) ──────────────

function categorizeRegisterEvent(code: string, text: string): EventCategory {
  const c = code.toUpperCase().replace(/\s/g, '')
  const t = text.toLowerCase()

  // Specific known codes
  if (c === '0009012') return 'publication'
  if (c === '0009016') return 'examination'     // search report
  if (c === '0009171') return 'examination'     // request for examination
  if (c === '0009210') return 'grant'           // (expected) grant
  if (c === '0009250') return 'status'          // lapse
  if (c === '0009261') return 'status'          // no opposition / opposition outcome
  if (c === '0009290') return 'other'           // correction
  if (c.startsWith('0009199FREP')) return 'correspondence'  // representative change
  if (c.startsWith('0009199EXPT')) return 'filing'          // extension states
  if (c.startsWith('0009299')) return 'assignment'          // change of owner/inventor
  if (c.startsWith('0008199')) return 'other'               // classification change
  if (c === 'EPIDOSPCT') return 'filing'
  if (c === 'EPIDOSABEX') return 'response'
  if (c === 'EPIDOSNADW2') return 'status'
  if (c === 'EPIDOSNIGR1') return 'allowance'  // intention to grant
  if (c === 'EPIDOSNIGR3' || c === 'EPIDOSNIGR5') return 'fee'
  if (c === 'EPIDOSNIGR7') return 'correspondence'
  if (c === 'EPIDOSNRFE2') return 'fee'         // renewal fee paid
  if (c.startsWith('EPIDOSNRFP')) return 'status'

  return categorizeEpStep(code, text)
}

// ── Parse EPO procedural-steps XML ───────────────────────────────────────────

function parseEpProceduralSteps(xml: string): PatentEvent[] {
  const events: PatentEvent[] = []
  const blocks = epAllBlocks(xml, 'procedural-step')

  for (const block of blocks) {
    const rawDate = epFirstTag(block, 'date')
    if (!rawDate || rawDate.length < 8) continue
    const d = rawDate.replace(/\D/g, '')
    if (d.length < 8) continue
    const eventDate = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`

    const code = epFirstTag(block, 'procedural-step-code') || 'UNKNOWN'

    const enTextMatch = block.match(/<(?:[^:>]+:)?procedural-step-text[^>]*language="EN"[^>]*>([^<]+)<\/(?:[^:>]+:)?procedural-step-text>/i)
    const anyTextMatch = block.match(/<(?:[^:>]+:)?procedural-step-text[^>]*>([^<]+)<\/(?:[^:>]+:)?procedural-step-text>/i)
    const phaseText = epFirstTag(block, 'procedural-step-phase')
    const description = (enTextMatch?.[1] || anyTextMatch?.[1] || phaseText || code).trim()

    events.push({ eventCode: code, eventDate, description, category: categorizeEpStep(code, description) })
  }

  return events
}

// ── Parse EPO register/events XML (dossier-event blocks) ─────────────────────

function parseEpRegisterEvents(xml: string): PatentEvent[] {
  const events: PatentEvent[] = []
  const blocks = epAllBlocks(xml, 'dossier-event')

  for (const block of blocks) {
    const rawDate = epFirstTag(block, 'date')
    if (!rawDate) continue
    const d = rawDate.replace(/\D/g, '')
    if (d.length < 8) continue
    const eventDate = `${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`

    const code = epFirstTag(block, 'event-code') || 'UNKNOWN'
    const textMatch = block.match(/<(?:[^:>]+:)?event-text[^>]*event-text-type="DESCRIPTION"[^>]*>([^<]+)<\/(?:[^:>]+:)?event-text>/i)
                   || block.match(/<(?:[^:>]+:)?event-text[^>]*>([^<]+)<\/(?:[^:>]+:)?event-text>/i)
    const description = (textMatch?.[1] || code).trim()

    events.push({ eventCode: code, eventDate, description, category: categorizeRegisterEvent(code, description) })
  }

  return events
}

// ── Fetch and merge both EPO register endpoints ───────────────────────────────

async function fetchEpEvents(epNumber: string): Promise<PatentEvent[]> {
  const token = await getEpoToken()
  const docId = /^EP/i.test(epNumber) ? epNumber : `EP${epNumber}`
  const hdrs = { Authorization: `Bearer ${token}`, Accept: 'application/xml' }
  const base = `${OPS_BASE}/register/publication/epodoc/${docId}`

  const [stepsRes, eventsRes] = await Promise.all([
    fetch(`${base}/procedural-steps`, { headers: hdrs, signal: AbortSignal.timeout(15000) }),
    fetch(`${base}/events`,           { headers: hdrs, signal: AbortSignal.timeout(15000) }),
  ])

  if (!stepsRes.ok && !eventsRes.ok) {
    const txt = await stepsRes.text().catch(() => '')
    if (stepsRes.status === 404) throw new Error(`No register entry found for ${docId} at EPO`)
    throw new Error(`EPO register error ${stepsRes.status}: ${txt.slice(0, 200)}`)
  }

  const [stepsXml, eventsXml] = await Promise.all([
    stepsRes.ok  ? stepsRes.text()  : Promise.resolve(''),
    eventsRes.ok ? eventsRes.text() : Promise.resolve(''),
  ])

  const steps  = stepsXml  ? parseEpProceduralSteps(stepsXml) : []
  const regEvs = eventsXml ? parseEpRegisterEvents(eventsXml)  : []

  // Merge and deduplicate by date+code
  const seen = new Set<string>()
  const merged: PatentEvent[] = []
  for (const ev of [...steps, ...regEvs]) {
    const key = `${ev.eventDate}:${ev.eventCode}`
    if (!seen.has(key)) { seen.add(key); merged.push(ev) }
  }

  return merged.sort((a, b) => b.eventDate.localeCompare(a.eventDate))
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const patent = await prisma.patent.findUnique({
      where: { id },
      select: { applicationNumber: true, rawJsonData: true, jurisdiction: true, epNumber: true, publicationNumber: true }
    })
    if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ── EP patent: stored cache first, live EPO fetch on miss or refresh ────────
    if (patent.jurisdiction === 'EP') {
      const epNum = patent.epNumber
        || patent.publicationNumber?.replace(/^EP/i, '')
        || null
      if (!epNum) {
        return NextResponse.json({ error: 'No EP number on record for this patent' }, { status: 422 })
      }

      const stored = patent.rawJsonData as any
      const forceRefresh = new URL(req.url).searchParams.get('refresh') === 'true'

      if (!forceRefresh && Array.isArray(stored?.epEventBag) && stored.epEventBag.length > 0) {
        return NextResponse.json({
          events: stored.epEventBag,
          total:  stored.epEventBag.length,
          source: 'stored',
          fetchedAt: stored.epEventBagFetchedAt ?? null,
        })
      }

      // Live fetch — then store back into rawJsonData
      const events = await fetchEpEvents(epNum)
      const fetchedAt = new Date().toISOString()
      await prisma.patent.update({
        where: { id },
        data: {
          rawJsonData: {
            ...(stored ?? {}),
            epEventBag: events,
            epEventBagFetchedAt: fetchedAt,
          } as any,
        },
      })

      return NextResponse.json({ events, total: events.length, source: 'live', fetchedAt })
    }

    // ── US patent: use stored ODP data or fetch fresh ─────────────────────────
    let eventBag: any[] = []
    const stored = patent.rawJsonData as any
    const storedBag = stored?.patentFileWrapperDataBag?.[0]?.eventDataBag
    if (Array.isArray(storedBag) && storedBag.length > 0) {
      eventBag = storedBag
    } else if (patent.applicationNumber) {
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
