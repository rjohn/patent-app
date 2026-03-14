/**
 * Minimal PDF builder — pure TypeScript, zero dependencies.
 * Landscape A4 orientation.
 *
 * Fonts:
 *   F1 = Helvetica (fallback body regular)
 *   F2 = Helvetica-Bold (fallback body bold)
 *   F3 = Sansation (title/heading font, optional embed)
 *   F4 = Aptos regular (body text, optional embed)
 *   F5 = Aptos Bold   (body text bold, optional embed)
 */

import * as zlib from 'zlib'

interface TextOptions {
  x: number; y: number; size?: number; bold?: boolean; color?: string
  maxWidth?: number
}

interface RGB { r: number; g: number; b: number }

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16)
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

function rgbCmd(c: RGB) { return `${c.r.toFixed(3)} ${c.g.toFixed(3)} ${c.b.toFixed(3)}` }

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
  while (s.length > 1 && textWidth(s + '...', size, bold) > maxW) s = s.slice(0, -1)
  return s + '...'
}

/**
 * Map Unicode code points that are above U+00FF but have Windows-1252 equivalents
 * (the 0x80-0x9F block) back to their single Win1252 byte so they survive the
 * final `Buffer.from(…, 'latin1')` step and render correctly via WinAnsiEncoding.
 * Truly unmappable characters are replaced with '?'.
 */
const UNICODE_TO_WIN1252: Record<number, number> = {
  0x20AC:0x80, 0x201A:0x82, 0x0192:0x83, 0x201E:0x84, 0x2026:0x85,
  0x2020:0x86, 0x2021:0x87, 0x02C6:0x88, 0x2030:0x89, 0x0160:0x8A,
  0x2039:0x8B, 0x0152:0x8C, 0x017D:0x8E, 0x2018:0x91, 0x2019:0x92,
  0x201C:0x93, 0x201D:0x94, 0x2022:0x95, 0x2013:0x96, 0x2014:0x97,
  0x02DC:0x98, 0x2122:0x99, 0x0161:0x9A, 0x203A:0x9B, 0x0153:0x9C,
  0x017E:0x9E, 0x0178:0x9F,
}
function encodeForPDF(str: string): string {
  let out = ''
  for (const ch of str) {
    const cp = ch.codePointAt(0) ?? 0
    if (cp <= 0xFF) { out += ch }
    else if (UNICODE_TO_WIN1252[cp] !== undefined) { out += String.fromCharCode(UNICODE_TO_WIN1252[cp]) }
    else { out += '?' }
  }
  return out
}

function ascii85Encode(data: Buffer): string {
  const out: string[] = []
  for (let i = 0; i < data.length; i += 4) {
    const remaining = Math.min(4, data.length - i)
    let v = 0
    for (let j = 0; j < 4; j++) v = v * 256 + (j < remaining ? data[i + j] : 0)
    if (v < 0) v += 4294967296
    if (remaining === 4 && v === 0) {
      out.push('z')
    } else {
      let n = v
      const d4 = n % 85; n = Math.floor(n / 85)
      const d3 = n % 85; n = Math.floor(n / 85)
      const d2 = n % 85; n = Math.floor(n / 85)
      const d1 = n % 85; n = Math.floor(n / 85)
      const d0 = n % 85
      out.push(String.fromCharCode(...[d0+33, d1+33, d2+33, d3+33, d4+33].slice(0, remaining+1)))
    }
  }
  out.push('~>')
  return out.join('')
}

function buildFontObjects(addObject: (s: string) => number, fontData: Buffer, fontName: string): number {
  const compressed = zlib.deflateSync(fontData)
  const encoded    = ascii85Encode(compressed)
  const fileObj = addObject(
    `<< /Length ${encoded.length} /Length1 ${fontData.length} /Filter [/ASCII85Decode /FlateDecode] >>\nstream\n${encoded}\nendstream`
  )
  const descObj = addObject(
    `<< /Type /FontDescriptor /FontName /${fontName} /Flags 32 /FontBBox [-100 -210 1000 728] /ItalicAngle 0 /Ascent 800 /Descent -200 /CapHeight 600 /StemV 80 /FontFile2 ${fileObj} 0 R >>`
  )
  return addObject(
    `<< /Type /Font /Subtype /TrueType /BaseFont /${fontName} /Encoding /WinAnsiEncoding /FontDescriptor ${descObj} 0 R >>`
  )
}

// ── SVG → PDF path converter ──────────────────────────────────────────────────

interface SVGShape { fill: string; path: string }

/** Tokenise an SVG path `d` string into command letters and number strings. */
function tokeniseSVGPath(d: string): string[] {
  const tokens: string[] = []
  let i = 0
  while (i < d.length) {
    const ch = d[i]
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(ch)) { tokens.push(ch); i++ }
    else if (/[-+0-9.]/.test(ch)) {
      let j = i
      if (d[j] === '-' || d[j] === '+') j++
      while (j < d.length && /[0-9.]/.test(d[j])) j++
      if (j < d.length && (d[j] === 'e' || d[j] === 'E')) {
        j++; if (j < d.length && /[-+]/.test(d[j])) j++
        while (j < d.length && /[0-9]/.test(d[j])) j++
      }
      tokens.push(d.slice(i, j)); i = j
    } else { i++ }
  }
  return tokens
}

/** Convert an SVG path `d` string to PDF path operators (in SVG coordinate space). */
function svgPathToPDF(d: string): string {
  const tokens = tokeniseSVGPath(d)
  let ti = 0
  let cx = 0, cy = 0, sx = 0, sy = 0
  const out: string[] = []

  const n = () => parseFloat(tokens[ti++] ?? '0')
  const isN = () => ti < tokens.length && /^[-+0-9.]/.test(tokens[ti])
  const p2 = (x: number, y: number, op: string) => out.push(`${x.toFixed(3)} ${y.toFixed(3)} ${op}`)

  while (ti < tokens.length) {
    const cmd = tokens[ti++]
    switch (cmd) {
      case 'M': cx=n();cy=n();sx=cx;sy=cy; p2(cx,cy,'m'); while(isN()){cx=n();cy=n();p2(cx,cy,'l')}; break
      case 'm': cx+=n();cy+=n();sx=cx;sy=cy; p2(cx,cy,'m'); while(isN()){cx+=n();cy+=n();p2(cx,cy,'l')}; break
      case 'L': while(isN()){cx=n();cy=n();p2(cx,cy,'l')}; break
      case 'l': while(isN()){cx+=n();cy+=n();p2(cx,cy,'l')}; break
      case 'H': while(isN()){cx=n();p2(cx,cy,'l')}; break
      case 'h': while(isN()){cx+=n();p2(cx,cy,'l')}; break
      case 'V': while(isN()){cy=n();p2(cx,cy,'l')}; break
      case 'v': while(isN()){cy+=n();p2(cx,cy,'l')}; break
      case 'C': while(isN()){const x1=n(),y1=n(),x2=n(),y2=n();cx=n();cy=n();out.push(`${x1.toFixed(3)} ${y1.toFixed(3)} ${x2.toFixed(3)} ${y2.toFixed(3)} ${cx.toFixed(3)} ${cy.toFixed(3)} c`)}; break
      case 'c': while(isN()){const dx1=n(),dy1=n(),dx2=n(),dy2=n(),dx=n(),dy=n();out.push(`${(cx+dx1).toFixed(3)} ${(cy+dy1).toFixed(3)} ${(cx+dx2).toFixed(3)} ${(cy+dy2).toFixed(3)} ${(cx+dx).toFixed(3)} ${(cy+dy).toFixed(3)} c`);cx+=dx;cy+=dy}; break
      case 'Z': case 'z': out.push('h'); cx=sx; cy=sy; break
    }
  }
  return out.join(' ')
}

/** Convert SVG polygon `points` string to a closed PDF path. */
function svgPolygonToPDF(points: string): string {
  const nums = points.trim().split(/[\s,]+/).map(Number)
  const out: string[] = []
  for (let i = 0; i < nums.length - 1; i += 2) {
    out.push(`${nums[i].toFixed(3)} ${nums[i+1].toFixed(3)} ${i === 0 ? 'm' : 'l'}`)
  }
  out.push('h')
  return out.join(' ')
}

/** Parse the relevant shapes from the SVG icon content. */
function parseIconSVG(svg: string): SVGShape[] {
  const shapes: SVGShape[] = []
  const elemRe = /<(path|polygon)([\s\S]*?)\/>/g
  let m: RegExpExecArray | null

  while ((m = elemRe.exec(svg)) !== null) {
    const [, tag, attrs] = m

    // Determine fill colour
    let fill = '#000000'
    const styleM = attrs.match(/style="([^"]*)"/)
    if (styleM) {
      const fm = styleM[1].match(/fill\s*:\s*([^;"\s]+)/)
      if (fm) fill = fm[1]
    }
    const fillAttr = attrs.match(/\bfill="([^"]*)"/)
    if (fillAttr) fill = fillAttr[1]
    if (fill === 'none') continue

    let path = ''
    if (tag === 'path') {
      const dM = attrs.match(/\bd="([^"]*)"/)
      if (dM) path = svgPathToPDF(dM[1])
    } else {
      const pM = attrs.match(/\bpoints="([^"]*)"/)
      if (pM) path = svgPolygonToPDF(pM[1])
    }

    if (path) shapes.push({ fill, path })
  }
  return shapes
}

// Brand colours
const P4_BLUE   = '#1A5BC5'
const P4_PURPLE = '#5B2D9E'

export class PDFBuilder {
  private objects: string[] = []
  private pages: number[] = []
  private currentStream: string[] = []
  private currentPageObj = 0
  private pageWidth  = 841.89
  private pageHeight = 595.28
  private cursor = 0

  private _titleFontData: Buffer | null = null
  private _titleFontRef:  number | null = null
  private _bodyFontData:  Buffer | null = null
  private _bodyFontRef:   number | null = null
  private _bodyBoldData:  Buffer | null = null
  private _bodyBoldRef:   number | null = null

  private _iconShapes: SVGShape[] | null = null

  private py(y: number) { return this.pageHeight - y }

  private addObject(content: string): number {
    const idx = this.objects.length + 1
    this.objects.push(content)
    return idx
  }

  withFont(data: Buffer): this {
    this._titleFontData = data; return this
  }

  withBodyFont(regular: Buffer, bold?: Buffer): this {
    this._bodyFontData = regular
    if (bold) this._bodyBoldData = bold
    return this
  }

  /** Supply SVG source for the icon — drawn as crisp vector paths in the header. */
  withIconSVG(svgContent: string): this {
    this._iconShapes = parseIconSVG(svgContent)
    return this
  }

  startDocument() {
    this.objects.push('')  // placeholder catalog
    this.objects.push('')  // placeholder pages
    if (this._titleFontData) this._titleFontRef = buildFontObjects(this.addObject.bind(this), this._titleFontData, 'Sansation-Regular')
    if (this._bodyFontData)  this._bodyFontRef  = buildFontObjects(this.addObject.bind(this), this._bodyFontData,  'Aptos')
    if (this._bodyBoldData)  this._bodyBoldRef  = buildFontObjects(this.addObject.bind(this), this._bodyBoldData,  'Aptos-Bold')
    return this
  }

  newPage() {
    if (this.currentStream.length > 0) this.flushPage()
    this.currentStream = []
    this.cursor = 48
    return this
  }

  private flushPage() {
    const streamContent = this.currentStream.join('\n')
    const streamObj = this.addObject(
      `<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream`
    )
    const f3 = this._titleFontRef ? ` /F3 ${this._titleFontRef} 0 R` : ''
    const f4 = this._bodyFontRef  ? ` /F4 ${this._bodyFontRef} 0 R`  : ''
    const f5 = this._bodyBoldRef  ? ` /F5 ${this._bodyBoldRef} 0 R`  : ''
    const pageObj = this.addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth} ${this.pageHeight}] /Contents ${streamObj} 0 R /Resources << /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> /F2 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>${f3}${f4}${f5} >> >> >>`
    )
    this.pages.push(pageObj)
    this.currentPageObj = pageObj
  }

  // ── Primitives ───────────────────────────────────────────────────────────────

  setColor(hex: string, stroke = false) {
    const c = hexToRgb(hex)
    this.currentStream.push(stroke ? `${rgbCmd(c)} RG` : `${rgbCmd(c)} rg`)
    return this
  }

  rect(x: number, y: number, w: number, h: number, fill = true, stroke = false) {
    this.currentStream.push(`${x} ${this.py(y) - h} ${w} ${h} re ${fill ? (stroke ? 'B' : 'f') : 's'}`)
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
    const encoded = encodeForPDF(display)
    const escaped = encoded.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    const c = hexToRgb(color)
    const font = bold
      ? (this._bodyBoldRef ? 'F5' : (this._bodyFontRef ? 'F4' : 'F2'))
      : (this._bodyFontRef ? 'F4' : 'F1')
    this.currentStream.push(`BT /${font} ${size} Tf ${rgbCmd(c)} rg ${x} ${this.py(y)} Td (${escaped}) Tj ET`)
    return this
  }

  private titleText(str: string, opts: Omit<TextOptions, 'bold'>) {
    if (!str) return this
    const { x, y, size = 10, color = '#1a1a2e', maxWidth } = opts
    const display = maxWidth ? truncateToWidth(str, maxWidth, size, false) : str
    const encoded = encodeForPDF(display)
    const escaped = encoded.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    const c = hexToRgb(color)
    const font = this._titleFontRef ? 'F3' : 'F2'
    this.currentStream.push(`BT /${font} ${size} Tf ${rgbCmd(c)} rg ${x} ${this.py(y)} Td (${escaped}) Tj ET`)
    return this
  }

  // ── High-level helpers ───────────────────────────────────────────────────────

  get y() { return this.cursor }
  moveY(delta: number) { this.cursor += delta; return this }
  setY(y: number)      { this.cursor = y;      return this }

  header(title: string, subtitle: string, companyName = 'Plaz4 IP') {
    const barH = 40

    // Blue left panel, purple right panel (mirrors the icon's diagonal split)
    this.setColor(P4_BLUE);   this.rect(0, 0, this.pageWidth * 0.55, barH)
    this.setColor(P4_PURPLE); this.rect(this.pageWidth * 0.55, 0, this.pageWidth * 0.45, barH)
    // Purple accent line
    this.setColor(P4_PURPLE); this.rect(0, barH, this.pageWidth, 2)

    // Vector icon — SVG viewBox is 270×270; scale to markSize × markSize pt
    const markSize = 30
    const markX = 8
    const markY = (barH - markSize) / 2

    if (this._iconShapes && this._iconShapes.length > 0) {
      const scale = markSize / 270
      // CTM: scale SVG user coords and flip Y so SVG top-left maps to PDF top-left of icon
      this.currentStream.push(`q ${scale.toFixed(6)} 0 0 ${(-scale).toFixed(6)} ${markX} ${(this.pageHeight - markY).toFixed(3)} cm`)
      for (const shape of this._iconShapes) {
        const c = hexToRgb(shape.fill)
        this.currentStream.push(`${rgbCmd(c)} rg`)
        this.currentStream.push(`${shape.path} f`)
      }
      this.currentStream.push('Q')
    }

    // Company name — Sansation, white
    const compX = markX + markSize + 8
    this.titleText(companyName, { x: compX, y: barH * 0.62, size: 11, color: '#FFFFFF' })

    // Report title right-aligned — Sansation, white
    const titleW = textWidth(title, 9)
    this.titleText(title, { x: this.pageWidth - 20 - titleW, y: barH * 0.62, size: 9, color: '#FFFFFF' })

    this.cursor = barH + 12
    this.text(subtitle, { x: 22, y: this.cursor, size: 8.5, color: '#6B7280' })
    this.cursor += 14
    return this
  }

  sectionTitle(label: string) {
    this.cursor += 4
    this.titleText(label, { x: 22, y: this.cursor, size: 11, color: P4_PURPLE })
    this.cursor += 13
    this.setColor('#E5E7EB'); this.rect(22, this.cursor, this.pageWidth - 44, 0.5)
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
      this.text(valStr,  { x: valX, y: this.cursor + 24, size: 20, bold: true, color: P4_BLUE })
      const labX = x + w / 2 - textWidth(s.label, 8) / 2
      this.text(s.label, { x: labX, y: this.cursor + 34, size: 8, color: '#6B7280' })
    })
    this.cursor += h + 12
    return this
  }

  tableHeader(cols: { label: string; width: number }[]) {
    const h = 20, x0 = 22
    this.setColor(P4_BLUE); this.rect(x0, this.cursor, this.pageWidth - 44, h)
    let x = x0 + 6
    for (const col of cols) {
      this.text(col.label, { x, y: this.cursor + 13, size: 8, bold: true, color: '#FFFFFF' })
      x += col.width
    }
    this.cursor += h
    return this
  }

  tableRow(
    cells: string[],
    cols: { label: string; width: number }[],
    rowIndex: number,
    statusCell?: { index: number; value: string },
  ) {
    const h  = 20
    const x0 = 22
    const textBaseline = 13  // centers 8pt text vertically: (rowH + capHeight) / 2

    const needsNewPage = this.cursor + h > this.pageHeight - 36
    if (needsNewPage) { this.flushPage(); this.currentStream = []; this.cursor = 20 }

    if (rowIndex % 2 === 1) {
      this.setColor('#F9FAFB'); this.rect(x0, this.cursor, this.pageWidth - 44, h)
    }
    this.setColor('#E5E7EB'); this.rect(x0, this.cursor + h - 0.5, this.pageWidth - 44, 0.5)

    let x = x0 + 6
    cells.forEach((cell, ci) => {
      const col = cols[ci]
      if (!col) return
      const maxW = col.width - 16

      if (statusCell && ci === statusCell.index) {
        const statusColors: Record<string, string> = {
          GRANTED:'#166534', PENDING:'#854D0E', ABANDONED:'#991B1B', PUBLISHED:'#1D4ED8',
          PAID:'#166534', OVERDUE:'#991B1B', UPCOMING:'#1D4ED8', WAIVED:'#374151',
        }
        const statusBg: Record<string, string> = {
          GRANTED:'#DCFCE7', PENDING:'#FEF9C3', ABANDONED:'#FEE2E2', PUBLISHED:'#DBEAFE',
          PAID:'#DCFCE7', OVERDUE:'#FEE2E2', UPCOMING:'#DBEAFE', WAIVED:'#F3F4F6',
        }
        const badgeH = 12
        const badgeY = this.cursor + (h - badgeH) / 2
        const bw = Math.min(textWidth(cell, 7, true) + 10, maxW)
        this.setColor(statusBg[cell] || '#F3F4F6'); this.rect(x, badgeY, bw, badgeH)
        this.text(cell, { x: x + 4, y: badgeY + 8.5, size: 7, bold: true, color: statusColors[cell] || '#374151' })
      } else {
        const isNum = ci === 0
        this.text(cell, {
          x, y: this.cursor + textBaseline,
          size: 8, bold: isNum,
          color: isNum ? P4_BLUE : '#333333',
          maxWidth: maxW,
        })
      }
      x += col.width
    })
    this.cursor += h
    return this
  }

  footer(pageNum: number) {
    this.setColor('#E5E7EB')
    this.rect(22, this.pageHeight - 22, this.pageWidth - 44, 0.5)
    this.text('Confidential - generated by Plaz4 IP', { x: 22, y: this.pageHeight - 14, size: 7, color: '#9CA3AF' })
    this.text(`Page ${pageNum}`, { x: this.pageWidth - 52, y: this.pageHeight - 14, size: 7, color: '#9CA3AF' })
    return this
  }

  build(): Buffer {
    if (this.currentStream.length > 0) this.flushPage()

    const pageRefs = this.pages.map(p => `${p} 0 R`).join(' ')
    this.objects[0] = `<< /Type /Catalog /Pages 2 0 R >>`
    this.objects[1] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${this.pages.length} >>`

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
    for (const off of xrefOffsets) lines.push(off.toString().padStart(10, '0') + ' 00000 n ')
    lines.push('trailer')
    lines.push(`<< /Size ${this.objects.length + 1} /Root 1 0 R >>`)
    lines.push('startxref')
    lines.push(String(xrefOffset))
    lines.push('%%EOF')

    return Buffer.from(lines.join('\n'), 'latin1')
  }
}
