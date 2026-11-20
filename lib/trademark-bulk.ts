// USPTO trademark bulk data (Open Data Portal), used instead of the TSDR API.
//
// TRTDXFAP — daily zip: full <case-file> record for every mark with activity that day.
// TRTYRAP  — annual backfile: every mark ever filed, current to Dec 31 of the prior year.
//
// Both are ~500MB of XML per file once unzipped, so we stream: download → inflate →
// split on </case-file> → hand each block to a cheap string predicate. Only matching
// blocks are kept, so memory stays flat regardless of file size.

import { Unzip, UnzipInflate } from 'fflate'

const ODP_BASE = 'https://api.uspto.gov/api/v1/datasets/products'

export const DAILY_PRODUCT  = 'TRTDXFAP'
export const ANNUAL_PRODUCT = 'TRTYRAP'

export interface BulkFile {
  fileName: string
  fileDownloadURI: string
  fileDataFromDate?: string
  fileDataToDate?: string
  fileSize?: number
}

function odpHeaders(): Record<string, string> {
  const key = process.env.USPTO_API_KEY
  return key ? { 'X-API-KEY': key } : {}
}

/** Lists a bulk product's zip files, optionally limited to a data date range (YYYY-MM-DD). */
export async function listBulkFiles(product: string, from?: string, to?: string): Promise<BulkFile[]> {
  const params = new URLSearchParams({ includeFiles: 'true' })
  if (from) params.set('fileDataFromDate', from)
  if (to)   params.set('fileDataToDate', to)
  const res = await fetch(`${ODP_BASE}/${product}?${params}`, { headers: odpHeaders() })
  if (!res.ok) throw new Error(`ODP ${product} file list: HTTP ${res.status}`)
  const json = await res.json()
  const bag = json.bulkDataProductBag?.[0] ?? json
  const files: BulkFile[] = bag.productFileBag?.fileDataBag ?? []
  return files.filter(f => f.fileName?.toLowerCase().endsWith('.zip'))
}

/**
 * Streams a bulk zip and returns every <case-file>…</case-file> block for which
 * `match` returns true. `match` sees the raw XML text of one case file.
 */
export async function scanBulkZip(url: string, match: (block: string) => boolean): Promise<string[]> {
  const res = await fetch(url, { headers: odpHeaders(), redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`Download ${url}: HTTP ${res.status}`)

  const matches: string[] = []
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  let error: Error | null = null

  const consume = (text: string, final: boolean) => {
    buf += text
    let end: number
    while ((end = buf.indexOf('</case-file>')) !== -1) {
      const start = buf.lastIndexOf('<case-file>', end)
      if (start !== -1) {
        const block = buf.slice(start, end + '</case-file>'.length)
        if (match(block)) matches.push(block)
      }
      buf = buf.slice(end + '</case-file>'.length)
    }
    // Keep only a possible partial record; drop preamble/whitespace between records.
    if (!final) {
      const open = buf.lastIndexOf('<case-file>')
      if (open > 0) buf = buf.slice(open)
      else if (open === -1 && buf.length > 64) buf = buf.slice(-64)
    }
  }

  const unzip = new Unzip()
  unzip.register(UnzipInflate)
  unzip.onfile = file => {
    if (!file.name.toLowerCase().endsWith('.xml')) return
    file.ondata = (err, data, final) => {
      if (err) { error = err; return }
      consume(decoder.decode(data, { stream: !final }), final)
    }
    file.start()
  }

  const reader = res.body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) { unzip.push(new Uint8Array(0), true); break }
    unzip.push(value)
    if (error) throw error
  }
  if (error) throw error
  return matches
}

/** Pulls the serial number out of a raw case-file block without a full parse. */
export function blockSerial(block: string): string | null {
  const m = block.match(/<serial-number>(\d+)<\/serial-number>/)
  return m ? m[1] : null
}

/** Pulls the transaction date (YYYYMMDD) out of a raw case-file block. */
export function blockTransactionDate(block: string): string {
  const m = block.match(/<transaction-date>(\d+)<\/transaction-date>/)
  return m ? m[1] : ''
}
