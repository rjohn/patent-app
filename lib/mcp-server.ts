import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { prisma } from './prisma'
import { patentSearchConditions } from './patent-search'
import { buildActivitySummary } from './activity'
import { getCachedSummary } from './portfolio-summary'

// Read-only MCP server exposing the Plaz4 IP portfolio to Claude.
// Served statelessly from app/api/mcp/route.ts — a fresh server per request.

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const

const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)

function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

function notFound(ref: string) {
  return {
    isError: true,
    content: [{ type: 'text' as const, text: `No patent found for "${ref}". Try search_patents to find it.` }],
  }
}

const PATENT_LIST_SELECT = {
  id: true, patentNumber: true, applicationNumber: true, epNumber: true, publicationNumber: true,
  jurisdiction: true, title: true, status: true, type: true,
  filingDate: true, grantDate: true, expirationDate: true, adjustedExpirationDate: true,
  assignee: true, inventors: true, continuationType: true, source: true,
  family: { select: { id: true, name: true } },
} as const

function shapeListItem(p: any) {
  return {
    id:                p.id,
    jurisdiction:      p.jurisdiction,
    patentNumber:      p.patentNumber,
    applicationNumber: p.applicationNumber,
    epNumber:          p.epNumber,
    publicationNumber: p.publicationNumber,
    title:             p.title,
    status:            p.status,
    type:              p.type,
    filingDate:        day(p.filingDate),
    grantDate:         day(p.grantDate),
    expirationDate:    day(p.adjustedExpirationDate ?? p.expirationDate),
    assignee:          p.assignee,
    inventors:         p.inventors,
    continuationType:  p.continuationType,
    trackedOnly:       p.source === 'CONTINUATION',
    family:            p.family?.name ?? null,
  }
}

// Accepts an internal id, or a patent / application / EP / publication number in
// any common format ("US 11,234,567 B2", "18/336,362", "EP 3 456 789").
async function resolvePatentId(ref: string): Promise<string | null> {
  const raw = ref.trim()
  const byId = await prisma.patent.findUnique({ where: { id: raw }, select: { id: true } })
  if (byId) return byId.id

  const compact = raw.toUpperCase().replace(/[\s,/.-]/g, '')
  const ep      = compact.match(/^EP0*(\d+)/)?.[1]
  const digits  = compact.replace(/^(US|EP)/, '').replace(/[A-Z]\d?$/, '').replace(/\D/g, '')

  const or: any[] = [{ publicationNumber: { equals: compact, mode: 'insensitive' } }]
  if (ep)     or.push({ epNumber: ep })
  if (digits) or.push({ patentNumber: digits }, { applicationNumber: digits }, ...(ep ? [] : [{ epNumber: digits }]))

  const hit = await prisma.patent.findFirst({ where: { OR: or }, select: { id: true } })
  return hit?.id ?? null
}

function wrapper(rawJsonData: unknown): any {
  return (rawJsonData as any)?.patentFileWrapperDataBag?.[0] ?? null
}

export function createMcpServer() {
  const server = new McpServer(
    { name: 'plaz4-ip', version: '1.0.0' },
    {
      instructions:
        'Plaz4 IP patent portfolio (Plasmology4). US and EP patents, applications, families, ' +
        'continuations, maintenance fees and prosecution history. Start with portfolio_overview or ' +
        'search_patents; patent tools accept an id or any patent/application/EP number. All data is ' +
        'read-only and reflects the last USPTO/EPO refresh (daily).',
    },
  )

  server.registerTool('portfolio_overview', {
    title: 'Portfolio overview',
    description: 'Headline counts for the Plaz4 portfolio (by status, jurisdiction, type), families, fees due in the next 90 days, and the cached AI portfolio summary.',
    annotations: READ_ONLY,
  }, async () => {
    const in90 = new Date(Date.now() + 90 * 86400000)
    const [byStatus, byJurisdiction, byType, families, tracked, feesDue, summary] = await Promise.all([
      prisma.patent.groupBy({ by: ['status'], where: { source: 'PORTFOLIO' }, _count: true }),
      prisma.patent.groupBy({ by: ['jurisdiction'], where: { source: 'PORTFOLIO' }, _count: true }),
      prisma.patent.groupBy({ by: ['type'], where: { source: 'PORTFOLIO' }, _count: true }),
      prisma.patentFamily.count(),
      prisma.patent.count({ where: { source: 'CONTINUATION' } }),
      prisma.maintenanceFee.count({ where: { dueDate: { lte: in90 }, status: { in: ['UPCOMING', 'DUE', 'OVERDUE'] } } }),
      getCachedSummary().catch(() => null),
    ])
    const tally = (rows: any[], key: string) => Object.fromEntries(rows.map(r => [r[key] ?? 'UNKNOWN', r._count]))
    return json({
      portfolio: {
        byStatus:       tally(byStatus, 'status'),
        byJurisdiction: tally(byJurisdiction, 'jurisdiction'),
        byType:         tally(byType, 'type'),
      },
      families,
      trackedContinuationApplications: tracked,
      unpaidFeesDueWithin90Days: feesDue,
      aiSummary: summary ? { text: summary.text, updatedAt: summary.updatedAt } : null,
    })
  })

  server.registerTool('search_patents', {
    title: 'Search patents',
    description:
      'Search the portfolio. `query` matches any part of title, abstract, claim text, inventor names, ' +
      'CPC codes, assignee, docket number, or patent/application/publication/EP number (case-insensitive). ' +
      'Omit query to list everything matching the filters.',
    inputSchema: {
      query:        z.string().optional().describe('Free-text search, e.g. "plasma applicator", "Smith", "A61B 18"'),
      status:       z.enum(['PENDING', 'PUBLISHED', 'GRANTED', 'ABANDONED', 'EXPIRED', 'LICENSED', 'SOLD']).optional(),
      jurisdiction: z.enum(['US', 'EP']).optional(),
      type:         z.enum(['UTILITY', 'DESIGN', 'PLANT', 'PROVISIONAL', 'PCT']).optional(),
      family:       z.string().optional().describe('Family name (partial match) or id'),
      includeTracked: z.boolean().default(true).describe('Include continuation applications tracked from the continuity tab'),
      limit:        z.number().int().min(1).max(100).default(25),
    },
    annotations: READ_ONLY,
  }, async ({ query, status, jurisdiction, type, family, includeTracked, limit }) => {
    const where: any = {}
    if (query)        where.OR = await patentSearchConditions(query)
    if (status)       where.status = status
    if (jurisdiction) where.jurisdiction = jurisdiction
    if (type)         where.type = type
    if (!includeTracked) where.source = 'PORTFOLIO'
    if (family) where.family = { OR: [{ id: family }, { name: { contains: family, mode: 'insensitive' } }] }

    const [patents, total] = await Promise.all([
      prisma.patent.findMany({ where, select: PATENT_LIST_SELECT, orderBy: { filingDate: 'desc' }, take: limit }),
      prisma.patent.count({ where }),
    ])
    return json({ total, returned: patents.length, patents: patents.map(shapeListItem) })
  })

  server.registerTool('get_patent', {
    title: 'Get patent',
    description: 'Full record for one patent: bibliographic data, abstract, family, parent/child continuations, priority claims, maintenance fees and internal notes. Use get_claims for claim text.',
    inputSchema: { patent: z.string().describe('Internal id, or patent / application / EP / publication number') },
    annotations: READ_ONLY,
  }, async ({ patent }) => {
    const id = await resolvePatentId(patent)
    if (!id) return notFound(patent)
    const p = await prisma.patent.findUnique({
      where: { id },
      select: {
        ...PATENT_LIST_SELECT,
        abstract: true, docketNumber: true, attorney: true, cpcCodes: true, uspcCodes: true,
        publicationDate: true, priorityDate: true, estimatedValue: true, claimsJson: true,
        parentPatent:   { select: { id: true, patentNumber: true, applicationNumber: true, title: true } },
        childPatents:   { select: { id: true, patentNumber: true, applicationNumber: true, title: true, status: true, continuationType: true } },
        priorityClaims: { select: { country: true, applicationNumber: true, filingDate: true } },
        maintenanceFees: { select: { feeType: true, dueDate: true, gracePeriodEnd: true, status: true, amount: true, currency: true, paidDate: true }, orderBy: { dueDate: 'asc' } },
        notes: { select: { content: true, createdAt: true, author: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      },
    })
    if (!p) return notFound(patent)
    return json({
      ...shapeListItem(p),
      abstract:        p.abstract,
      docketNumber:    p.docketNumber,
      attorney:        p.attorney,
      cpcCodes:        p.cpcCodes,
      uspcCodes:       p.uspcCodes,
      publicationDate: day(p.publicationDate),
      priorityDate:    day(p.priorityDate),
      estimatedValue:  p.estimatedValue,
      claimCount:      Array.isArray(p.claimsJson) ? p.claimsJson.length : 0,
      parent:          p.parentPatent,
      children:        p.childPatents,
      priorityClaims:  p.priorityClaims.map(c => ({ ...c, filingDate: day(c.filingDate) })),
      fees:            p.maintenanceFees.map(f => ({ ...f, dueDate: day(f.dueDate), gracePeriodEnd: day(f.gracePeriodEnd), paidDate: day(f.paidDate) })),
      notes:           p.notes.map(n => ({ author: n.author?.name ?? null, date: day(n.createdAt), content: n.content })),
    })
  })

  server.registerTool('get_claims', {
    title: 'Get claims',
    description: 'Claim text for one patent, numbered. Only claims already saved from USPTO/EPO are available.',
    inputSchema: {
      patent: z.string().describe('Internal id, or patent / application / EP / publication number'),
      independentOnly: z.boolean().default(false).describe('Return only claims that do not refer to another claim'),
    },
    annotations: READ_ONLY,
  }, async ({ patent, independentOnly }) => {
    const id = await resolvePatentId(patent)
    if (!id) return notFound(patent)
    const p = await prisma.patent.findUnique({ where: { id }, select: { title: true, patentNumber: true, applicationNumber: true, epNumber: true, claimsJson: true } })
    if (!p) return notFound(patent)
    let claims = (Array.isArray(p.claimsJson) ? (p.claimsJson as any[]) : [])
      .map((c, i) => ({
        number: typeof c === 'string' ? i + 1 : (c.claim_sequence ?? i + 1),
        // Source text often repeats the number ("1 1. A device…"); `number` carries it instead.
        text:   (typeof c === 'string' ? c : c.claim_text ?? '').trim().replace(/^(?:\d+\s*\.?\s+)+/, ''),
      }))
      .filter(c => c.text)
    if (independentOnly) claims = claims.filter(c => !/\b(?:of|to|in) claim \d+/i.test(c.text))
    return json({
      patent: { title: p.title, patentNumber: p.patentNumber, applicationNumber: p.applicationNumber, epNumber: p.epNumber },
      claims,
      ...(claims.length ? {} : { note: 'No claims saved yet. They are loaded on the next refresh or when the Claims tab is opened in the app.' }),
    })
  })

  server.registerTool('get_prosecution_history', {
    title: 'Get prosecution history',
    description: 'USPTO prosecution events (office actions, responses, allowance, grant…) and file-wrapper documents for one US patent/application, newest first.',
    inputSchema: {
      patent: z.string().describe('Internal id, or patent / application number'),
      limit:  z.number().int().min(1).max(500).default(50),
    },
    annotations: READ_ONLY,
  }, async ({ patent, limit }) => {
    const id = await resolvePatentId(patent)
    if (!id) return notFound(patent)
    const p = await prisma.patent.findUnique({ where: { id }, select: { title: true, patentNumber: true, applicationNumber: true, jurisdiction: true, rawJsonData: true, updatedAt: true } })
    if (!p) return notFound(patent)
    const events = ((wrapper(p.rawJsonData)?.eventDataBag ?? []) as any[])
      .map(e => ({ date: e.eventDate, code: e.eventCode, description: e.eventDescriptionText }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    const documents = (((p.rawJsonData as any)?.documentBag ?? []) as any[])
      .map(d => ({ date: String(d.officialDate ?? '').slice(0, 10), code: d.documentCode, description: d.documentCodeDescriptionText, direction: d.directionCategory, pages: d.pageCount ?? null }))
      .sort((a, b) => b.date.localeCompare(a.date))
    return json({
      patent: { title: p.title, patentNumber: p.patentNumber, applicationNumber: p.applicationNumber },
      lastRefreshed: day(p.updatedAt),
      eventCount: events.length,
      events: events.slice(0, limit),
      documentCount: documents.length,
      documents: documents.slice(0, limit),
      ...(events.length || documents.length ? {} : {
        note: p.jurisdiction === 'EP' ? 'Prosecution history is only stored for US applications.' : 'No history stored yet — it is saved on the next USPTO refresh.',
      }),
    })
  })

  server.registerTool('list_families', {
    title: 'List patent families',
    description: 'All patent families with technology area and member counts by status.',
    annotations: READ_ONLY,
  }, async () => {
    const families = await prisma.patentFamily.findMany({
      select: { id: true, name: true, description: true, technologyArea: true, patents: { select: { status: true, jurisdiction: true } } },
      orderBy: { name: 'asc' },
    })
    return json(families.map(f => ({
      id: f.id, name: f.name, description: f.description, technologyArea: f.technologyArea,
      memberCount: f.patents.length,
      byStatus: f.patents.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }), {}),
      jurisdictions: Array.from(new Set(f.patents.map(p => p.jurisdiction ?? 'US'))),
    })))
  })

  server.registerTool('get_family', {
    title: 'Get patent family',
    description: 'One family with every member and its continuation parent, so the continuity chain can be reconstructed.',
    inputSchema: { family: z.string().describe('Family id or name (partial match)') },
    annotations: READ_ONLY,
  }, async ({ family }) => {
    const f = await prisma.patentFamily.findFirst({
      where: { OR: [{ id: family }, { name: { contains: family, mode: 'insensitive' } }] },
      select: {
        id: true, name: true, description: true, technologyArea: true,
        patents: { select: { ...PATENT_LIST_SELECT, parentPatentId: true }, orderBy: { filingDate: 'asc' } },
      },
    })
    if (!f) return { isError: true, content: [{ type: 'text' as const, text: `No family matching "${family}". Try list_families.` }] }
    return json({
      id: f.id, name: f.name, description: f.description, technologyArea: f.technologyArea,
      members: f.patents.map(p => ({ ...shapeListItem(p), parentId: p.parentPatentId })),
    })
  })

  server.registerTool('upcoming_fees', {
    title: 'Upcoming fees',
    description: 'Maintenance fees / EP renewals due within a window, oldest first, including overdue ones.',
    inputSchema: {
      days: z.number().int().min(1).max(3650).default(180).describe('Look-ahead window in days'),
      includePaid: z.boolean().default(false),
    },
    annotations: READ_ONLY,
  }, async ({ days, includePaid }) => {
    const now = new Date()
    const fees = await prisma.maintenanceFee.findMany({
      where: {
        dueDate: { lte: new Date(now.getTime() + days * 86400000) },
        ...(includePaid ? {} : { status: { in: ['UPCOMING', 'DUE', 'OVERDUE'] } }),
      },
      select: {
        feeType: true, dueDate: true, gracePeriodEnd: true, status: true, amount: true, currency: true, paidDate: true,
        patent: { select: { id: true, patentNumber: true, applicationNumber: true, epNumber: true, jurisdiction: true, title: true, status: true } },
      },
      orderBy: { dueDate: 'asc' },
    })
    const totals = fees.reduce<Record<string, number>>((acc, f) => (f.amount ? { ...acc, [f.currency]: (acc[f.currency] ?? 0) + f.amount } : acc), {})
    return json({
      windowDays: days,
      count: fees.length,
      estimatedTotals: totals,
      fees: fees.map(f => ({
        ...f,
        dueDate: day(f.dueDate), gracePeriodEnd: day(f.gracePeriodEnd), paidDate: day(f.paidDate),
        daysUntilDue: Math.round((f.dueDate.getTime() - now.getTime()) / 86400000),
      })),
    })
  })

  server.registerTool('recent_activity', {
    title: 'Recent activity',
    description: 'What happened in the portfolio over a period: prosecution events, fees due/paid, grants, new filings and status changes. Same data as the Activity page and digest email.',
    inputSchema: { days: z.number().int().min(1).max(730).default(30).describe('How many days back to look') },
    annotations: READ_ONLY,
  }, async ({ days }) => {
    const to = new Date()
    const from = new Date(to.getTime() - days * 86400000)
    return json(await buildActivitySummary(from, to))
  })

  server.registerTool('list_watchlists', {
    title: 'List watchlists',
    description: 'Competitor / technology watchlists and how many patents each tracks.',
    annotations: READ_ONLY,
  }, async () => {
    const lists = await prisma.watchlist.findMany({
      select: { id: true, name: true, description: true, updatedAt: true, _count: { select: { entries: true } } },
      orderBy: { name: 'asc' },
    })
    return json(lists.map(w => ({ id: w.id, name: w.name, description: w.description, entries: w._count.entries, updated: day(w.updatedAt) })))
  })

  server.registerTool('get_watchlist', {
    title: 'Get watchlist',
    description: 'Patents in one watchlist with abstract, notes and any saved AI analysis.',
    inputSchema: { watchlist: z.string().describe('Watchlist id or name (partial match)') },
    annotations: READ_ONLY,
  }, async ({ watchlist }) => {
    const w = await prisma.watchlist.findFirst({
      where: { OR: [{ id: watchlist }, { name: { contains: watchlist, mode: 'insensitive' } }] },
      select: {
        id: true, name: true, description: true,
        entries: {
          select: {
            patentNumber: true, appNumber: true, jurisdiction: true, title: true, assignee: true, inventors: true,
            filingDate: true, grantDate: true, expirationDate: true, status: true, cpcCodes: true,
            abstract: true, notes: true, aiSummary: true, aiSummaryAt: true, addedAt: true,
          },
          orderBy: { addedAt: 'desc' },
        },
      },
    })
    if (!w) return { isError: true, content: [{ type: 'text' as const, text: `No watchlist matching "${watchlist}". Try list_watchlists.` }] }
    return json({ ...w, entries: w.entries.map(e => ({ ...e, aiSummaryAt: day(e.aiSummaryAt), addedAt: day(e.addedAt) })) })
  })

  return server
}
