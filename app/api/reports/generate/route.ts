import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PDFBuilder } from '@/lib/pdf-builder'

function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toISOString().slice(0, 10) : '—'
}
function trunc(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

// ── Portfolio Summary PDF ─────────────────────────────────────────────────────
function buildPortfolioSummary(patents: any[], date: string): Buffer {
  const granted   = patents.filter(p => p.status === 'GRANTED').length
  const pending   = patents.filter(p => p.status === 'PENDING').length
  const abandoned = patents.filter(p => p.status === 'ABANDONED').length

  const cols = [
    { label: 'Patent No.',  width: 80  },
    { label: 'Title',       width: 190 },
    { label: 'Status',      width: 72  },
    { label: 'Filed',       width: 62  },
    { label: 'Granted',     width: 62  },
    { label: 'Family',      width: 85  },
  ]

  const pdf = new PDFBuilder()
  pdf.startDocument().newPage()
  pdf.header('Portfolio Summary Report', `Generated: ${date} · ${patents.length} patents`)
  pdf.statBoxes([
    { value: patents.length, label: 'Total Patents' },
    { value: granted,        label: 'Granted' },
    { value: pending,        label: 'Pending' },
    { value: abandoned,      label: 'Abandoned' },
  ])
  pdf.sectionTitle('Patent Listing')
  pdf.tableHeader(cols)

  let page = 1
  patents.forEach((p, i) => {
    if (i > 0 && pdf.y > 800) { pdf.footer(page++); }
    pdf.tableRow([
      p.patentNumber || p.applicationNumber || '—',
      trunc(p.title, 55),
      p.status,
      fmt(p.filingDate),
      fmt(p.grantDate),
      trunc(p.family?.name || '—', 18),
    ], cols, i, { index: 2, value: p.status })
  })
  pdf.footer(page)
  return pdf.build()
}

// ── Deadline / Fee Report PDF ─────────────────────────────────────────────────
function buildDeadlineReport(patents: any[], date: string): Buffer {
  const now = new Date()

  interface FeeRow { patent: any; fee: any; daysUntil: number }
  const fees: FeeRow[] = []
  for (const p of patents) {
    for (const f of p.maintenanceFees || []) {
      if (f.status === 'PAID') continue
      const due = new Date(f.dueDate)
      fees.push({ patent: p, fee: f, daysUntil: Math.round((due.getTime() - now.getTime()) / 86400000) })
    }
  }
  fees.sort((a, b) => a.daysUntil - b.daysUntil)

  const overdue  = fees.filter(f => f.daysUntil < 0).length
  const dueSoon  = fees.filter(f => f.daysUntil >= 0 && f.daysUntil <= 90).length

  const feeAmounts: Record<string, string> = {
    MAINTENANCE_3_5: '$800', MAINTENANCE_7_5: '$1,850', MAINTENANCE_11_5: '$3,700',
  }
  function feeLabel(t: string) { return t.replace('MAINTENANCE_','').replace('_','.') + 'yr' }

  const cols = [
    { label: 'Patent No.',  width: 76  },
    { label: 'Title',       width: 168 },
    { label: 'Fee',         width: 46  },
    { label: 'Due Date',    width: 64  },
    { label: 'Amount',      width: 54  },
    { label: 'Days',        width: 52  },
    { label: 'Status',      width: 91  },
  ]

  const pdf = new PDFBuilder()
  pdf.startDocument().newPage()
  pdf.header('Maintenance Fee Deadline Report', `Generated: ${date} · ${fees.length} upcoming fees`)
  pdf.statBoxes([
    { value: fees.length, label: 'Upcoming Fees' },
    { value: overdue,     label: 'Overdue' },
    { value: dueSoon,     label: 'Due ≤ 90 Days' },
  ])
  pdf.sectionTitle('Fee Schedule')

  if (fees.length === 0) {
    pdf.text('No upcoming maintenance fees.', { x: 22, y: pdf.y, size: 10, color: '#6B7280' })
  } else {
    pdf.tableHeader(cols)
    let page = 1
    fees.forEach(({ patent: p, fee: f, daysUntil }, i) => {
      if (i > 0 && pdf.y > 800) { pdf.footer(page++); }
      const daysStr = daysUntil < 0 ? 'OVERDUE' : `${daysUntil}d`
      pdf.tableRow([
        p.patentNumber || p.applicationNumber || '—',
        trunc(p.title, 42),
        feeLabel(f.feeType),
        fmt(f.dueDate),
        feeAmounts[f.feeType] || '—',
        daysStr,
        f.status,
      ], cols, i, { index: 6, value: f.status })
    })
    pdf.footer(page)
  }

  return pdf.build()
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
function generateCSV(reportId: string, patents: any[]): string {
  if (reportId === 'deadlines') {
    const rows = [['Patent Number','Title','Fee Type','Due Date','Amount','Status','Grace Period End']]
    for (const p of patents) {
      for (const fee of p.maintenanceFees) {
        rows.push([
          p.patentNumber || p.applicationNumber || '',
          `"${p.title.replace(/"/g,'""')}"`,
          fee.feeType,
          fee.dueDate ? new Date(fee.dueDate).toISOString().slice(0,10) : '',
          fee.amount?.toString() || '',
          fee.status,
          fee.gracePeriodEnd ? new Date(fee.gracePeriodEnd).toISOString().slice(0,10) : '',
        ])
      }
    }
    return rows.map(r => r.join(',')).join('\n')
  }
  const rows = [['Patent Number','Application Number','Title','Status','Type','Family','Filing Date','Grant Date','Expiration Date','Inventors','Assignee']]
  for (const p of patents) {
    rows.push([
      p.patentNumber || '',
      p.applicationNumber || '',
      `"${p.title.replace(/"/g,'""')}"`,
      p.status, p.type, p.family?.name || '',
      fmt(p.filingDate), fmt(p.grantDate), fmt(p.expirationDate),
      `"${(p.inventors || []).join('; ')}"`,
      p.assignee || '',
    ])
  }
  return rows.map(r => r.join(',')).join('\n')
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { reportId, format, dateRange, includeAbandoned } = await req.json()

    const where: any = {}
    if (!includeAbandoned) where.status = { not: 'ABANDONED' }
    if (dateRange?.from || dateRange?.to) {
      where.filingDate = {}
      if (dateRange.from) where.filingDate.gte = new Date(dateRange.from)
      if (dateRange.to)   where.filingDate.lte = new Date(dateRange.to)
    }

    const patents = await prisma.patent.findMany({
      where,
      include: { family: true, maintenanceFees: { orderBy: { dueDate: 'asc' } } },
      orderBy: { filingDate: 'desc' },
    })

    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    })

    if (format === 'Excel') {
      return new NextResponse(generateCSV(reportId, patents), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="patent-${reportId}-${Date.now()}.csv"`,
        },
      })
    }

    const pdfBuffer = reportId === 'deadlines'
      ? buildDeadlineReport(patents, date)
      : buildPortfolioSummary(patents, date)

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="patent-${reportId}-${Date.now()}.pdf"`,
      },
    })

  } catch (e) {
    console.error('Report generation error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Generation failed' }, { status: 500 })
  }
}
