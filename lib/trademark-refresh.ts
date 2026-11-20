// Daily trademark update from USPTO bulk data. Used by /api/cron/refresh-trademarks.
//
// 1. Streams each new TRTDXFAP daily file since the last one processed and applies any
//    record for a tracked serial, or a new filing whose current owner matches the
//    owner pattern (auto-added with source AUTO).
// 2. Checks the ODP Trademark Decisions & Proceedings search for each tracked mark.

import { prisma as db } from './prisma'
import { DAILY_PRODUCT, listBulkFiles, scanBulkZip, blockSerial } from './trademark-bulk'
import { parseCaseFile, currentOwners, upsertTrademarkRecord } from './trademarks'

const LAST_FILE_KEY = 'trademarks.lastDailyFileDate'
const DECISIONS_URL = 'https://api.uspto.gov/api/v1/trademark/decision-proceeding/search'

/** Owner names to watch. Override with TRADEMARK_OWNER_PATTERN (regex, case-insensitive). */
export function ownerPattern(): RegExp {
  return new RegExp(process.env.TRADEMARK_OWNER_PATTERN || 'plasmology4', 'i')
}

export interface TrademarkRefreshSummary {
  filesProcessed: string[]
  matched: number
  created: string[]
  updated: string[]
  newProceedings: { serialNumber: string; petitionNumber: string; type: string }[]
  errors: string[]
}

export interface Proceeding {
  documentIdentifier: string
  petitionNumber: string | null
  proceedingTypeCategory: string | null
  decisionProceedingCategory: string | null
  documentTypeDescriptionText: string | null
  decisionActionDate: string | null
  petitionerName: string | null
  documentURI: string | null
}

function addDays(ymd: string, n: number) {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export async function applyDailyFiles(opts: { maxFiles?: number; deadline?: number } = {}): Promise<TrademarkRefreshSummary> {
  const summary: TrademarkRefreshSummary = { filesProcessed: [], matched: 0, created: [], updated: [], newProceedings: [], errors: [] }
  const maxFiles = opts.maxFiles ?? 3
  const today = new Date().toISOString().slice(0, 10)

  const last = (await db.setting.findUnique({ where: { key: LAST_FILE_KEY } }))?.value
  const from = last ? addDays(last, 1) : addDays(today, -3)
  if (from > today) return summary

  const files = (await listBulkFiles(DAILY_PRODUCT, from, today))
    .sort((a, b) => (a.fileDataToDate ?? a.fileName).localeCompare(b.fileDataToDate ?? b.fileName))
    .slice(0, maxFiles)

  const tracked = await db.trademark.findMany({ select: { serialNumber: true } })
  const serialTags = new Set(tracked.map(t => `<serial-number>${t.serialNumber}</serial-number>`))
  const ownerRe = ownerPattern()
  const partyRe = /<party-name>([^<]*)<\/party-name>/g

  const match = (block: string) => {
    const sm = block.match(/<serial-number>\d+<\/serial-number>/)
    if (sm && serialTags.has(sm[0])) return true
    if (!ownerRe.test(block)) return false
    for (const m of Array.from(block.matchAll(partyRe))) if (ownerRe.test(m[1])) return true
    return false
  }

  for (const f of files) {
    if (opts.deadline && Date.now() > opts.deadline) break
    try {
      const blocks = await scanBulkZip(f.fileDownloadURI, match)
      for (const xml of blocks) {
        const rec = await parseCaseFile(xml)
        const isTracked = serialTags.has(`<serial-number>${rec.serialNumber}</serial-number>`)
        if (!isTracked && !currentOwners(rec).some(o => ownerRe.test(o.name))) continue
        summary.matched++
        const res = await upsertTrademarkRecord(rec, 'AUTO')
        if (res === 'created') summary.created.push(rec.serialNumber)
        if (res === 'updated') summary.updated.push(rec.serialNumber)
        serialTags.add(`<serial-number>${blockSerial(xml)}</serial-number>`)
      }
      const fileDate = f.fileDataToDate?.slice(0, 10) ?? today
      await db.setting.upsert({
        where: { key: LAST_FILE_KEY },
        create: { key: LAST_FILE_KEY, value: fileDate },
        update: { value: fileDate },
      })
      summary.filesProcessed.push(f.fileName)
    } catch (e) {
      summary.errors.push(`${f.fileName}: ${(e as Error).message}`)
      break   // keep LAST_FILE_KEY where it is so the next run retries this file
    }
  }
  return summary
}

/** ODP Trademark Decisions & Proceedings records for one serial number. */
export async function fetchProceedings(serialNumber: string): Promise<Proceeding[]> {
  const params = new URLSearchParams({ q: `serialNumber:${serialNumber}`, limit: '100' })
  const res = await fetch(`${DECISIONS_URL}?${params}`, {
    headers: process.env.USPTO_API_KEY ? { 'X-API-KEY': process.env.USPTO_API_KEY } : {},
  })
  if (res.status === 404) return []   // ODP returns 404 for "no records found"
  if (!res.ok) throw new Error(`decision-proceeding search: HTTP ${res.status}`)
  const json = await res.json()
  return (json.trademarkDecisionsDataBag ?? []).map((d: any) => ({
    documentIdentifier: d.documentIdentifier,
    petitionNumber: d.petitionNumber ?? null,
    proceedingTypeCategory: d.proceedingTypeCategory ?? null,
    decisionProceedingCategory: d.decisionProceedingCategory ?? null,
    documentTypeDescriptionText: d.documentTypeDescriptionText ?? null,
    decisionActionDate: d.decisionActionDate ?? null,
    petitionerName: d.petitionerName ?? null,
    documentURI: d.documentURI ?? null,
  }))
}

export async function refreshProceedings(summary: TrademarkRefreshSummary, deadline?: number) {
  const marks = await db.trademark.findMany({ select: { id: true, serialNumber: true, proceedings: true } })
  for (const m of marks) {
    if (deadline && Date.now() > deadline) break
    try {
      const found = await fetchProceedings(m.serialNumber)
      const known = new Set(((m.proceedings as Proceeding[] | null) ?? []).map(p => p.documentIdentifier))
      for (const p of found) {
        if (!known.has(p.documentIdentifier)) {
          summary.newProceedings.push({ serialNumber: m.serialNumber, petitionNumber: p.petitionNumber ?? '', type: p.proceedingTypeCategory ?? '' })
        }
      }
      await db.trademark.update({ where: { id: m.id }, data: { proceedings: found as unknown as object } })
    } catch (e) {
      summary.errors.push(`proceedings ${m.serialNumber}: ${(e as Error).message}`)
    }
  }
}

/** Full daily job: bulk files, then proceedings. `budgetMs` keeps it inside the function timeout. */
export async function refreshTrademarks(budgetMs = 270_000): Promise<TrademarkRefreshSummary> {
  const deadline = Date.now() + budgetMs
  const summary = await applyDailyFiles({ deadline: deadline - 30_000 })
  await refreshProceedings(summary, deadline)
  return summary
}
