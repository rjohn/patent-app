import { prisma } from '@/lib/prisma'

export interface ActivityEvent {
  patentId:      string
  patentNumber:  string | null
  appNumber:     string | null
  title:         string
  jurisdiction:  string | null
  eventCode:     string
  eventDate:     string
  description:   string
  category:      string
}

export interface ActivityFee {
  patentId:     string
  patentNumber: string | null
  appNumber:    string | null
  title:        string
  jurisdiction: string | null
  feeType:      string
  dueDate:      string
  status:       string
  amount:       number | null
  currency:     string
  paidDate:     string | null
}

export interface ActivityChange {
  patentId:    string
  patentNumber: string | null
  appNumber:   string | null
  title:       string
  jurisdiction: string | null
  changeType:  'granted' | 'added' | 'abandoned' | 'status_change'
  date:        string
  detail:      string
}

export interface ActivitySummary {
  period:   { from: string; to: string }
  events:   ActivityEvent[]
  fees:     ActivityFee[]
  changes:  ActivityChange[]
}

function categorize(code: string): string {
  const c = code.toUpperCase()
  if (['COMP','OIPE','FLRCPT'].some(p => c.startsWith(p))) return 'filing'
  if (['CTNF','CTFR','MCTNF','MCTFR','NON','RESTRICTION'].some(p => c.startsWith(p))) return 'office_action'
  if (['RCE','RCEX','RESP','AMEND','REPL','AFCP'].some(p => c.startsWith(p))) return 'response'
  if (['NOA','ALLOW','CNOA','MCNOA','PILS'].some(p => c === p || c.startsWith(p))) return 'allowance'
  if (c.startsWith('MN/') || c.startsWith('N/=')) return 'allowance'
  if (['PTGR','MPTGR','PGM/','WPIR','ISSUE','GRANT'].some(p => c === p || c.startsWith(p))) return 'grant'
  if (['FEE','PAY','SURCHARGE','IFEE'].some(p => c.startsWith(p)) || /^M\d/.test(c)) return 'fee'
  if (['ASSI','ASSIGN','ASGN'].some(p => c.startsWith(p))) return 'assignment'
  if (['MAIL','IDS','WIDS','CORR','INFO'].some(p => c.startsWith(p))) return 'correspondence'
  if (['ABANDON','EXPIRE','WITHDRAWN','DISP'].some(p => c.startsWith(p))) return 'status'
  if (['PUB','A.','WO '].some(p => c.startsWith(p))) return 'publication'
  return 'other'
}

export async function buildActivitySummary(from: Date, to: Date): Promise<ActivitySummary> {
  const fromStr = from.toISOString().split('T')[0]
  const toStr   = to.toISOString().split('T')[0]

  // ── 1. Pull all patents with rawJsonData ───────────────────────────────────
  const patents = await prisma.patent.findMany({
    select: {
      id: true, patentNumber: true, applicationNumber: true,
      title: true, jurisdiction: true, status: true,
      grantDate: true, createdAt: true, rawJsonData: true,
    },
  })

  const events:  ActivityEvent[]  = []
  const changes: ActivityChange[] = []

  for (const p of patents) {
    const raw = p.rawJsonData as any
    const eventBag: any[] = raw?.patentFileWrapperDataBag?.[0]?.eventDataBag ?? []

    // Extract events in range
    for (const ev of eventBag) {
      const d = ev.eventDate?.slice(0, 10)
      if (!d || d < fromStr || d > toStr) continue
      const code = ev.eventCode || ''
      const cat  = categorize(code)
      // Skip correspondence noise and routine examination steps unless allowance/grant
      if (cat === 'other' || cat === 'correspondence' || cat === 'examination') continue
      events.push({
        patentId:     p.id,
        patentNumber: p.patentNumber,
        appNumber:    p.applicationNumber,
        title:        p.title,
        jurisdiction: p.jurisdiction,
        eventCode:    code,
        eventDate:    d,
        description:  ev.eventDescriptionText || code,
        category:     cat,
      })
    }

    // Portfolio changes: newly granted
    if (p.grantDate) {
      const gd = new Date(p.grantDate).toISOString().split('T')[0]
      if (gd >= fromStr && gd <= toStr) {
        changes.push({
          patentId:     p.id,
          patentNumber: p.patentNumber,
          appNumber:    p.applicationNumber,
          title:        p.title,
          jurisdiction: p.jurisdiction,
          changeType:   'granted',
          date:         gd,
          detail:       `Granted as ${p.patentNumber || p.applicationNumber}`,
        })
      }
    }

    // Portfolio changes: newly added
    const addedDate = new Date(p.createdAt).toISOString().split('T')[0]
    if (addedDate >= fromStr && addedDate <= toStr) {
      changes.push({
        patentId:     p.id,
        patentNumber: p.patentNumber,
        appNumber:    p.applicationNumber,
        title:        p.title,
        jurisdiction: p.jurisdiction,
        changeType:   'added',
        date:         addedDate,
        detail:       'Added to portfolio',
      })
    }

    // Abandoned in period
    if (p.status === 'ABANDONED') {
      const evAbandoned = eventBag.find((ev: any) =>
        categorize(ev.eventCode || '') === 'status' &&
        (ev.eventCode || '').toUpperCase().startsWith('ABANDON')
      )
      if (evAbandoned) {
        const abd = evAbandoned.eventDate?.slice(0, 10)
        if (abd && abd >= fromStr && abd <= toStr) {
          changes.push({
            patentId:     p.id,
            patentNumber: p.patentNumber,
            appNumber:    p.applicationNumber,
            title:        p.title,
            jurisdiction: p.jurisdiction,
            changeType:   'abandoned',
            date:         abd,
            detail:       evAbandoned.eventDescriptionText || 'Abandoned',
          })
        }
      }
    }
  }

  // ── 2. Maintenance fees active in period ───────────────────────────────────
  const feeRows = await prisma.maintenanceFee.findMany({
    where: {
      OR: [
        { dueDate:  { gte: from, lte: to } },
        { paidDate: { gte: from, lte: to } },
      ],
    },
    include: {
      patent: { select: { id: true, patentNumber: true, applicationNumber: true, title: true, jurisdiction: true } },
    },
    orderBy: { dueDate: 'asc' },
  })

  const fees: ActivityFee[] = feeRows.map(f => ({
    patentId:     f.patent.id,
    patentNumber: f.patent.patentNumber,
    appNumber:    f.patent.applicationNumber,
    title:        f.patent.title,
    jurisdiction: f.patent.jurisdiction,
    feeType:      f.feeType,
    dueDate:      new Date(f.dueDate).toISOString().split('T')[0],
    status:       f.status,
    amount:       f.amount,
    currency:     f.currency || 'USD',
    paidDate:     f.paidDate ? new Date(f.paidDate).toISOString().split('T')[0] : null,
  }))

  // ── 3. Sort ────────────────────────────────────────────────────────────────
  events.sort((a, b) => b.eventDate.localeCompare(a.eventDate))
  changes.sort((a, b) => b.date.localeCompare(a.date))

  // De-duplicate changes: a patent granted AND added on the same day → keep 'granted' only
  const seen = new Set<string>()
  const deduped = changes.filter(c => {
    const key = `${c.patentId}:${c.date}`
    if (c.changeType === 'added' && seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    period: { from: fromStr, to: toStr },
    events,
    fees,
    changes: deduped,
  }
}

function feeLabel(feeType: string): string {
  if (feeType === 'MAINTENANCE_3_5')  return '3.5-yr Maintenance Fee'
  if (feeType === 'MAINTENANCE_7_5')  return '7.5-yr Maintenance Fee'
  if (feeType === 'MAINTENANCE_11_5') return '11.5-yr Maintenance Fee'
  if (feeType === 'ANNUITY')          return 'EP Annual Renewal'
  return feeType.replace(/_/g, ' ')
}

export function buildEmailHtml(s: ActivitySummary): string {
  const { period, events, fees, changes } = s
  const rows = (items: string[]) => items.join('')
  const row = (label: string, value: string) =>
    `<tr><td style="padding:6px 12px;color:#94a3b8;font-size:13px;width:40%">${label}</td><td style="padding:6px 12px;color:#e2e8f0;font-size:13px">${value}</td></tr>`

  const section = (title: string, body: string) => body ? `
    <h3 style="color:#60a5fa;font-size:15px;margin:24px 0 8px;padding-bottom:6px;border-bottom:1px solid #1e293b">${title}</h3>
    ${body}` : ''

  const eventRows = events.map(e => row(
    `${e.eventDate} · <span style="color:#a78bfa">${e.category}</span>`,
    `<strong style="color:#f1f5f9">${e.title.substring(0, 60)}</strong><br/><span style="font-size:11px">${e.description}</span>`
  ))
  const feeRowsHtml = fees.map(f => row(
    `${f.dueDate} · <span style="color:${f.status === 'PAID' ? '#4ade80' : f.status === 'OVERDUE' ? '#f87171' : '#fbbf24'}">${f.status}</span>`,
    `<strong style="color:#f1f5f9">${f.title.substring(0, 60)}</strong><br/><span style="font-size:11px">${feeLabel(f.feeType)}${f.amount ? ` · ${f.currency} ${f.amount}` : ''}</span>`
  ))
  const changeRows = changes.map(c => row(
    `${c.date} · <span style="color:#4ade80">${c.changeType}</span>`,
    `<strong style="color:#f1f5f9">${c.title.substring(0, 60)}</strong><br/><span style="font-size:11px">${c.detail}</span>`
  ))

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/></head>
<body style="background:#0f172a;font-family:sans-serif;padding:32px;max-width:700px;margin:0 auto">
  <h1 style="color:#e2e8f0;font-size:22px;margin-bottom:4px">Plaz4 IP — Portfolio Activity</h1>
  <p style="color:#64748b;font-size:13px;margin-top:0">${period.from} to ${period.to}</p>
  <p style="color:#94a3b8;font-size:13px">${events.length} events · ${fees.length} fee items · ${changes.length} portfolio changes</p>
  ${section(`USPTO Prosecution Events (${events.length})`, events.length ? `<table style="width:100%;border-collapse:collapse">${rows(eventRows)}</table>` : '')}
  ${section(`Maintenance &amp; Renewal Fees (${fees.length})`, fees.length ? `<table style="width:100%;border-collapse:collapse">${rows(feeRowsHtml)}</table>` : '')}
  ${section(`Portfolio Changes (${changes.length})`, changes.length ? `<table style="width:100%;border-collapse:collapse">${rows(changeRows)}</table>` : '')}
  <p style="color:#334155;font-size:11px;margin-top:32px">Generated by Plaz4 IP Portfolio Manager</p>
</body></html>`
}
