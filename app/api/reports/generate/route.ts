import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'
import { PDFBuilder } from '@/lib/pdf-builder'

export const dynamic = 'force-dynamic'

// Load assets once at module startup (null if file missing)
let sansationFont: Buffer | null = null
let aptosFont:     Buffer | null = null
let aptosBoldFont: Buffer | null = null
let appIconSVG:    string | null = null
try {
  sansationFont = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Sansation-Regular.ttf'))
} catch { /* fall back to Helvetica-Bold for titles */ }
try {
  aptosFont     = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Aptos.ttf'))
  aptosBoldFont = fs.readFileSync(path.join(process.cwd(), 'public/fonts/Aptos-Bold.ttf'))
} catch { /* fall back to Helvetica for body text */ }
try {
  appIconSVG = fs.readFileSync(path.join(process.cwd(), 'public/p4-icon-vector.svg'), 'utf8')
} catch { /* icon not found — header will render without icon */ }

function fmt(d: Date | null | undefined) {
  return d ? new Date(d).toISOString().slice(0, 10) : '-'
}

async function getCompanyName(): Promise<string> {
  const row = await prisma.setting.findUnique({ where: { key: 'company_name' } })
  return row?.value || 'Plaz4 IP'
}

function newPDF(): PDFBuilder {
  const pdf = new PDFBuilder()
  if (sansationFont) pdf.withFont(sansationFont)
  if (aptosFont)     pdf.withBodyFont(aptosFont, aptosBoldFont ?? undefined)
  if (appIconSVG)    pdf.withIconSVG(appIconSVG)
  return pdf
}

// ── Granted Patents Report PDF ────────────────────────────────────────────────
function buildGrantedReport(patents: any[], date: string, companyName: string): Buffer {
  // Landscape A4 content width: 841.89 - 44 margins = 797.89 px
  const cols = [
    { label: 'Patent No.',  width: 115 },
    { label: 'Title',       width: 432 },
    { label: 'Filed',       width: 84  },
    { label: 'Granted',     width: 84  },
    { label: 'Expiry',      width: 84  },
  ]

  const usPatents = patents.filter(p => (p.jurisdiction || 'US') === 'US')
  const epPatents = patents.filter(p => p.jurisdiction === 'EP')

  const pdf = newPDF()
  pdf.startDocument().newPage()
  pdf.header('Granted Patent Portfolio', `Generated: ${date} · ${patents.length} patents`, companyName)
  pdf.statBoxes([
    { value: patents.length, label: 'Granted Patents' },
    { value: usPatents.length, label: 'US' },
    { value: epPatents.length, label: 'EP' },
  ])

  let page = 1

  // ── US Patents ──
  pdf.sectionTitle(`US Patents (${usPatents.length})`)
  if (usPatents.length === 0) {
    pdf.text('No granted US patents.', { x: 22, y: pdf.y, size: 10, color: '#6B7280' })
    pdf.moveY(14)
  } else {
    pdf.tableHeader(cols)
    usPatents.forEach((p, i) => {
      if (pdf.y > 560) { pdf.footer(page++) }
      pdf.tableRow([
        p.patentNumber || p.applicationNumber || '-',
        p.title,
        fmt(p.filingDate),
        fmt(p.grantDate),
        fmt(p.expirationDate),
      ], cols, i)
    })
  }

  // ── EP Patents ──
  if (pdf.y > 480) { pdf.footer(page++) }
  pdf.sectionTitle(`European Patents (${epPatents.length})`)
  if (epPatents.length === 0) {
    pdf.text('No granted European patents.', { x: 22, y: pdf.y, size: 10, color: '#6B7280' })
    pdf.moveY(14)
  } else {
    pdf.tableHeader(cols)
    epPatents.forEach((p, i) => {
      if (pdf.y > 560) { pdf.footer(page++) }
      pdf.tableRow([
        p.epNumber ? `EP${p.epNumber}` : (p.publicationNumber || p.applicationNumber || '-'),
        p.title,
        fmt(p.filingDate),
        fmt(p.grantDate),
        fmt(p.expirationDate),
      ], cols, i)
    })
  }

  pdf.footer(page)
  return pdf.build()
}

// ── Pending Applications Report PDF ──────────────────────────────────────────
function buildPendingReport(patents: any[], date: string, companyName: string): Buffer {
  const pending   = patents.filter(p => p.status === 'PENDING').length
  const published = patents.filter(p => p.status === 'PUBLISHED').length

  const cols = [
    { label: 'App. No.',    width: 125 },
    { label: 'Title',       width: 408 },
    { label: 'Type',        width: 80  },
    { label: 'Filed',       width: 87  },
    { label: 'Status',      width: 98  },
  ]

  const pdf = newPDF()
  pdf.startDocument().newPage()
  pdf.header('Pending Applications', `Generated: ${date} · ${patents.length} applications`, companyName)
  pdf.statBoxes([
    { value: patents.length, label: 'Total Applications' },
    { value: pending,        label: 'Pending' },
    { value: published,      label: 'Published' },
  ])
  pdf.sectionTitle('Application Listing')
  pdf.tableHeader(cols)

  let page = 1
  patents.forEach((p, i) => {
    if (pdf.y > 560) { pdf.footer(page++) }
    const typeLabel: Record<string, string> = {
      UTILITY: 'Utility', DESIGN: 'Design', PLANT: 'Plant', PROVISIONAL: 'Prov.', PCT: 'PCT',
    }
    pdf.tableRow([
      p.applicationNumber || p.publicationNumber || '-',
      p.title,
      typeLabel[p.type] || p.type,
      fmt(p.filingDate),
      p.status,
    ], cols, i, { index: 4, value: p.status })
  })
  pdf.footer(page)
  return pdf.build()
}

// ── Deadline / Fee Report PDF ─────────────────────────────────────────────────
function buildDeadlineReport(patents: any[], date: string, companyName: string): Buffer {
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

  const overdue = fees.filter(f => f.daysUntil < 0).length
  const dueSoon = fees.filter(f => f.daysUntil >= 0 && f.daysUntil <= 90).length

  const feeAmounts: Record<string, string> = {
    MAINTENANCE_3_5: '$800', MAINTENANCE_7_5: '$1,850', MAINTENANCE_11_5: '$3,700',
  }
  const feeLabel = (t: string) => t.replace('MAINTENANCE_', '').replace('_', '.') + 'yr'

  const cols = [
    { label: 'Patent No.', width: 105 },
    { label: 'Title',      width: 252 },
    { label: 'Fee',        width: 55  },
    { label: 'Due Date',   width: 82  },
    { label: 'Amount',     width: 75  },
    { label: 'Days',       width: 70  },
    { label: 'Status',     width: 159 },
  ]

  const pdf = newPDF()
  pdf.startDocument().newPage()
  pdf.header('Maintenance Fee Deadline Report', `Generated: ${date} · ${fees.length} upcoming fees`, companyName)
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
      if (pdf.y > 560) { pdf.footer(page++) }
      const daysStr = daysUntil < 0 ? 'OVERDUE' : `${daysUntil}d`
      pdf.tableRow([
        p.patentNumber || p.applicationNumber || '-',
        p.title,
        feeLabel(f.feeType),
        fmt(f.dueDate),
        feeAmounts[f.feeType] || '-',
        daysStr,
        f.status,
      ], cols, i, { index: 6, value: f.status })
    })
    pdf.footer(page)
  }

  return pdf.build()
}

// ── Excel (.xlsx) helpers ─────────────────────────────────────────────────────
function generateXLSX(reportId: string, patents: any[]): Buffer {
  let rows: Record<string, string | number>[]
  let sheetName: string

  if (reportId === 'deadlines') {
    sheetName = 'Maintenance Fees'
    rows = []
    for (const p of patents) {
      for (const fee of p.maintenanceFees) {
        rows.push({
          'Patent Number':    p.patentNumber || p.applicationNumber || '',
          'Title':            p.title,
          'Fee Type':         fee.feeType,
          'Due Date':         fee.dueDate ? new Date(fee.dueDate).toISOString().slice(0, 10) : '',
          'Amount':           fee.amount ?? '',
          'Status':           fee.status,
          'Grace Period End': fee.gracePeriodEnd ? new Date(fee.gracePeriodEnd).toISOString().slice(0, 10) : '',
        })
      }
    }
  } else if (reportId === 'pending-applications') {
    sheetName = 'Pending Applications'
    rows = patents.map(p => ({
      'Application Number': p.applicationNumber || '',
      'Publication Number': p.publicationNumber || '',
      'Title':              p.title,
      'Status':             p.status,
      'Type':               p.type,
      'Family':             p.family?.name || '',
      'Filing Date':        fmt(p.filingDate),
      'Assignee':           p.assignee || '',
    }))
  } else {
    sheetName = 'Granted Patents'
    rows = patents.map(p => ({
      'Patent Number':      p.patentNumber || '',
      'Application Number': p.applicationNumber || '',
      'Title':              p.title,
      'Type':               p.type,
      'Family':             p.family?.name || '',
      'Filing Date':        fmt(p.filingDate),
      'Grant Date':         fmt(p.grantDate),
      'Expiration Date':    fmt(p.expirationDate),
      'Inventors':          (p.inventors || []).join('; '),
      'Assignee':           p.assignee || '',
    }))
  }

  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }))
}

// ── Route handler ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { reportId, format, dateRange } = await req.json()

    // Build query based on report type
    const baseWhere: any = {}
    if (dateRange?.from || dateRange?.to) {
      baseWhere.filingDate = {}
      if (dateRange.from) baseWhere.filingDate.gte = new Date(dateRange.from)
      if (dateRange.to)   baseWhere.filingDate.lte = new Date(dateRange.to)
    }

    let where: any
    if (reportId === 'pending-applications') {
      where = { ...baseWhere, status: { in: ['PENDING', 'PUBLISHED'] } }
    } else if (reportId === 'deadlines') {
      where = baseWhere  // all patents with fees
    } else {
      // portfolio-summary and others → granted only
      where = { ...baseWhere, status: 'GRANTED' }
    }

    const patents = await prisma.patent.findMany({
      where,
      include: { family: true, maintenanceFees: { orderBy: { dueDate: 'asc' } } },
      orderBy: { filingDate: 'desc' },
    })

    const date        = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const companyName = await getCompanyName()

    if (format === 'Excel') {
      const xlsxBuffer = generateXLSX(reportId, patents)
      return new NextResponse(new Uint8Array(xlsxBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="patent-${reportId}-${Date.now()}.xlsx"`,
        },
      })
    }

    let pdfBuffer: Buffer
    if (reportId === 'deadlines') {
      pdfBuffer = buildDeadlineReport(patents, date, companyName)
    } else if (reportId === 'pending-applications') {
      pdfBuffer = buildPendingReport(patents, date, companyName)
    } else {
      pdfBuffer = buildGrantedReport(patents, date, companyName)
    }

    return new NextResponse(new Uint8Array(pdfBuffer), {
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
