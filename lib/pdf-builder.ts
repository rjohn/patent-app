/**
 * Minimal PDF builder — pure TypeScript, zero dependencies.
 * Generates valid PDF 1.4 documents with text, tables, and basic styling.
 */

interface TextOptions {
  x: number; y: number; size?: number; bold?: boolean; color?: string
  maxWidth?: number
}

interface RGB { r: number; g: number; b: number }

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#',''), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

function rgbCmd(c: RGB) { return `${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)}` }

// Rough character width estimation for Helvetica at size 1
const CHAR_WIDTHS: Record<string, number> = {
  ' ':0.278,'!':0.278,'"':0.355,'#':0.556,'$':0.556,'%':0.889,'&':0.667,"'":0.191,
  '(':0.333,')':0.333,'*':0.389,'+':0.584,',':0.278,'-':0.333,'.':0.278,'/':0.278,
  '0':0.556,'1':0.556,'2':0.556,'3':0.556,'4':0.556,'5':0.556,'6':0.556,'7':0.556,
  '8':0.556,'9':0.556,':':0.278,';':0.278,'<':0.584,'=':0.584,'>':0.584,'?':0.556,
}
function charWidth(ch: string, bold: boolean): number {
  const base = CHAR_WIDTHS[ch] ?? (ch.charCodeAt(0) < 128 ? 0.5 : 0.6)
  return bold ? base * 1.05 : base
}
function textWidth(str: string, size: number, bold = false) {
  return str.split('').reduce((w, c) => w + charWidth(c, bold) * size, 0)
}
function truncateToWidth(str: string, maxW: number, size: number, bold = false) {
  if (textWidth(str, size, bold) <= maxW) return str
  let s = str
  while (s.length > 1 && textWidth(s + '…', size, bold) > maxW) s = s.slice(0,-1)
  return s + '…'
}

export class PDFBuilder {
  private objects: string[] = []
  private offsets: number[] = []
  private pages: number[] = []
  private currentStream: string[] = []
  private currentPageObj = 0
  private pageHeight = 841.89  // A4
  private pageWidth  = 595.28
  private cursor = 0           // current Y from top

  // PDF coordinate system: origin bottom-left, Y increases upward
  // We track cursor from top and convert: pdfY = pageHeight - cursorY
  private py(y: number) { return this.pageHeight - y }

  private addObject(content: string): number {
    const idx = this.objects.length + 1
    this.objects.push(content)
    return idx
  }

  startDocument() {
    // Object 1 = catalog (filled later), 2 = pages (filled later)
    this.objects.push('') // placeholder catalog
    this.objects.push('') // placeholder pages
    return this
  }

  newPage() {
    if (this.currentStream.length > 0) this.flushPage()
    this.currentStream = []
    this.cursor = 48 // top margin
    return this
  }

  private flushPage() {
    const streamContent = this.currentStream.join('\n')
    const streamObj = this.addObject(
      `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`
    )
    const pageObj = this.addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Contents ${streamObj} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >> >> >> >>`
    )
    this.pages.push(pageObj)
    this.currentPageObj = pageObj
  }

  // ── Drawing primitives ──────────────────────────────────────────────────────

  setColor(hex: string, stroke = false) {
    const c = hexToRgb(hex)
    const cmd = stroke ? `${rgbCmd(c)} RG` : `${rgbCmd(c)} rg`
    this.currentStream.push(cmd)
    return this
  }

  rect(x: number, y: number, w: number, h: number, fill = true, stroke = false) {
    const pdfY = this.py(y) - h
    this.currentStream.push(`${x} ${pdfY} ${w} ${h} re ${fill ? (stroke ? 'B' : 'f') : 's'}`)
    return this
  }

  line(x1: number, y1: number, x2: number, y2: number) {
    this.currentStream.push(`${x1} ${this.py(y1)} m ${x2} ${this.py(y2)} l S`)
    return this
  }

  text(str: string, opts: TextOptions) {
    if (!str) return this
    const { x, y, size = 10, bold = false, color = '#1a1a2e', maxWidth } = opts
    const display = maxWidth ? truncateToWidth(str, maxWidth, size, bold) : str
    const escaped = display.replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')
    const c = hexToRgb(color)
    const font = bold ? 'F2' : 'F1'
    this.currentStream.push(
      `BT /${font} ${size} Tf ${rgbCmd(c)} rg ${x} ${this.py(y)} Td (${escaped}) Tj ET`
    )
    return this
  }

  // ── High-level helpers ──────────────────────────────────────────────────────

  get y() { return this.cursor }
  moveY(delta: number) { this.cursor += delta; return this }
  setY(y: number)      { this.cursor = y;      return this }

  header(title: string, subtitle: string) {
    // Navy top bar
    this.setColor('#1B3A6B')
    this.rect(0, 0, this.pageWidth, 36)
    this.text('PatentOS', { x: 22, y: 14, size: 13, bold: true, color: '#FFFFFF' })
    this.text(title, { x: this.pageWidth - 22 - textWidth(title, 9), y: 15, size: 9, color: '#FFFFFF' })
    // Gold accent
    this.setColor('#C8A951')
    this.rect(0, 36, this.pageWidth, 2)
    this.cursor = 58
    // Page title
    this.text(title, { x: 22, y: this.cursor, size: 18, bold: true, color: '#1B3A6B' })
    this.cursor += 22
    this.text(subtitle, { x: 22, y: this.cursor, size: 9, color: '#6B7280' })
    this.cursor += 18
    return this
  }

  sectionTitle(label: string) {
    this.cursor += 4
    this.text(label, { x: 22, y: this.cursor, size: 12, bold: true, color: '#2D5A9E' })
    this.cursor += 14
    this.setColor('#E5E7EB')
    this.rect(22, this.cursor, this.pageWidth - 44, 0.5)
    this.cursor += 6
    return this
  }

  statBoxes(stats: { value: string | number; label: string }[]) {
    const margin = 22, gap = 8
    const w = (this.pageWidth - margin * 2 - gap * (stats.length - 1)) / stats.length
    const h = 44
    stats.forEach((s, i) => {
      const x = margin + i * (w + gap)
      this.setColor('#F0F4F8'); this.rect(x, this.cursor, w, h)
      const valStr = String(s.value)
      const valX = x + w / 2 - textWidth(valStr, 20, true) / 2
      this.text(valStr,  { x: valX, y: this.cursor + 15, size: 20, bold: true, color: '#1B3A6B' })
      const labX = x + w / 2 - textWidth(s.label, 8) / 2
      this.text(s.label, { x: labX, y: this.cursor + 34, size: 8, color: '#6B7280' })
    })
    this.cursor += h + 12
    return this
  }

  tableHeader(cols: { label: string; width: number }[]) {
    const h = 20, x0 = 22
    this.setColor('#1B3A6B'); this.rect(x0, this.cursor, this.pageWidth - 44, h)
    let x = x0 + 6
    for (const col of cols) {
      this.text(col.label, { x, y: this.cursor + 7, size: 8, bold: true, color: '#FFFFFF' })
      x += col.width
    }
    this.cursor += h
    return this
  }

  tableRow(cells: string[], cols: { label: string; width: number }[], rowIndex: number, statusCell?: { index: number; value: string }) {
    const h = 18, x0 = 22
    const needsNewPage = this.cursor + h > this.pageHeight - 40
    if (needsNewPage) { this.flushPage(); this.currentStream = []; this.cursor = 20 }

    // Alternating row bg
    if (rowIndex % 2 === 1) { this.setColor('#F9FAFB'); this.rect(x0, this.cursor, this.pageWidth - 44, h) }
    this.setColor('#E5E7EB'); this.rect(x0, this.cursor + h - 0.5, this.pageWidth - 44, 0.5)

    let x = x0 + 6
    cells.forEach((cell, ci) => {
      const col = cols[ci]
      if (!col) return
      const maxW = col.width - 10

      if (statusCell && ci === statusCell.index) {
        const statusColors: Record<string,string> = {
          GRANTED:'#166534', PENDING:'#854D0E', ABANDONED:'#991B1B',
          PAID:'#166534', OVERDUE:'#991B1B', UPCOMING:'#1D4ED8', WAIVED:'#374151',
        }
        const statusBg: Record<string,string> = {
          GRANTED:'#DCFCE7', PENDING:'#FEF9C3', ABANDONED:'#FEE2E2',
          PAID:'#DCFCE7', OVERDUE:'#FEE2E2', UPCOMING:'#DBEAFE', WAIVED:'#F3F4F6',
        }
        const bg  = statusBg[cell]  || '#F3F4F6'
        const fg  = statusColors[cell] || '#374151'
        const bw  = Math.min(textWidth(cell, 7, true) + 10, maxW)
        this.setColor(bg); this.rect(x, this.cursor + 4, bw, 11)
        this.text(cell, { x: x + 4, y: this.cursor + 8, size: 7, bold: true, color: fg })
      } else {
        const isNum = ci === 0
        this.text(cell, { x, y: this.cursor + 6, size: 8, bold: isNum, color: isNum ? '#2D5A9E' : '#333333', maxWidth: maxW })
      }
      x += col.width
    })
    this.cursor += h
    return this
  }

  footer(pageNum: number) {
    this.setColor('#E5E7EB')
    this.rect(22, this.pageHeight - 24, this.pageWidth - 44, 0.5)
    this.text('PatentOS Portfolio Manager — Confidential',
      { x: 22, y: this.pageHeight - 18, size: 7, color: '#9CA3AF' })
    this.text(`Page ${pageNum}`,
      { x: this.pageWidth - 50, y: this.pageHeight - 18, size: 7, color: '#9CA3AF' })
    return this
  }

  // ── Build final PDF bytes ───────────────────────────────────────────────────

  build(): Buffer {
    if (this.currentStream.length > 0) this.flushPage()

    // Fix catalog and pages objects
    const pageRefs = this.pages.map(p => `${p} 0 R`).join(' ')
    this.objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`
    this.objects[1] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${this.pages.length} >>`

    // Write PDF
    const lines: string[] = ['%PDF-1.4']
    const xrefOffsets: number[] = []

    for (let i = 0; i < this.objects.length; i++) {
      xrefOffsets.push(lines.join('\n').length + 1)
      lines.push(`${i + 1} 0 obj`)
      lines.push(this.objects[i])
      lines.push('endobj')
      lines.push('')
    }

    const xrefOffset = lines.join('\n').length + 1
    lines.push('xref')
    lines.push(`0 ${this.objects.length + 1}`)
    lines.push('0000000000 65535 f ')
    for (const off of xrefOffsets) {
      lines.push(off.toString().padStart(10, '0') + ' 00000 n ')
    }
    lines.push('trailer')
    lines.push(`<< /Size ${this.objects.length + 1} /Root 1 0 R >>`)
    lines.push('startxref')
    lines.push(String(xrefOffset))
    lines.push('%%EOF')

    return Buffer.from(lines.join('\n'), 'latin1')
  }
}
