// Trademark record parsing, normalization, deadlines and persistence.
// Input is one raw <case-file> block from USPTO bulk data (see lib/trademark-bulk.ts).
// Field reference: Trademark-Applications-Documentation-v2.3 (TRTDXFAP product docs).

import { parseStringPromise } from 'xml2js'
import type { TrademarkSource, TrademarkStatus } from '@prisma/client'
import { prisma } from './prisma'
import { TRADEMARK_STATUS_CODES } from './trademark-status-codes'

// ─── Normalized record ────────────────────────────────────────────────────────

export interface TmStatement { typeCode: string; text: string }
export interface TmEvent { code: string; type: string; description: string; date: string | null; number: number | null }
export interface TmClass {
  internationalCodes: string[]
  usCodes: string[]
  primaryCode: string | null
  statusCode: string | null
  statusDate: string | null
  firstUseAnywhereDate: string | null
  firstUseInCommerceDate: string | null
}
export interface TmParty {
  entryNumber: number | null
  partyType: string | null
  name: string
  legalEntityTypeCode: string | null
  address: string[]
  city: string | null
  state: string | null
  country: string | null
  postcode: string | null
  nationality: { state?: string; country?: string } | null
}
export interface TmGoodsServices { classCode: string; text: string; kind: 'goods' | 'less-goods' | 'embedded-less-goods' }

export interface TrademarkRecord {
  serialNumber: string
  registrationNumber: string | null
  transactionDate: string | null
  header: Record<string, string>
  flags: Record<string, boolean>
  goodsServices: TmGoodsServices[]
  otherStatements: { kind: string; typeCode: string; text: string }[]
  events: TmEvent[]
  classifications: TmClass[]
  owners: TmParty[]
  correspondent: string[]
  raw: Record<string, unknown>   // remaining sections (madrid, foreign apps, prior registrations, design searches…)
}

const STATEMENT_KINDS: Record<string, string> = {
  AF: 'In Another Form', A0: 'Amendment to Registration', B0: 'Certificate of Correction',
  CC: 'Colors Claimed', CD: 'Description of Colors', CS: 'Certification Statement', CU: 'Concurrent Use',
  DM: 'Description of Mark', D0: 'Disclaimer', D1: 'Disclaimer', DS: 'Disclaimer', FN: 'Foreign Registration',
  IN: 'Interference', LS: 'Lining/Stippling', MD: 'Undefined', MK: 'Mark Overflow', NR: 'Non-Registration Info',
  N0: 'Name/Portrait Consent', OR: 'Order Restricting Scope', PM: 'Pseudo Mark', TF: 'Section 2(f) Limitation',
  TR: 'Translation', TL: 'Transliteration', TN: 'Transformation', LI: 'Linkage',
}

const arr = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v])
const str = (v: unknown): string | null => {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'object' && '_' in (v as any)) return String((v as any)._).trim() || null
  return null
}
const ymd = (v: unknown): string | null => {
  const s = str(v)
  return s && /^\d{8}$/.test(s) && s !== '00000000' ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null
}
const toDate = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00Z`) : null)

export async function parseCaseFile(xml: string): Promise<TrademarkRecord> {
  const doc = await parseStringPromise(xml, { explicitArray: false, trim: true, emptyTag: () => null })
  const cf = doc['case-file'] ?? {}

  const header: Record<string, string> = {}
  const flags: Record<string, boolean> = {}
  for (const [k, v] of Object.entries(cf['case-file-header'] ?? {})) {
    const s = str(v)
    if (s == null) continue
    if (k.endsWith('-in') && (s === 'T' || s === 'F')) flags[k] = s === 'T'
    else header[k] = s
  }

  const goodsServices: TmGoodsServices[] = []
  const otherStatements: TrademarkRecord['otherStatements'] = []
  for (const st of arr(cf['case-file-statements']?.['case-file-statement'])) {
    const typeCode = str(st['type-code']) ?? ''
    const text = arr(st['text']).map(str).filter(Boolean).join(' ')
    if (!text) continue
    if (typeCode.startsWith('GS')) {
      const pos6 = typeCode[5]
      goodsServices.push({
        classCode: typeCode.slice(2, 5),
        text,
        kind: pos6 === '2' ? 'less-goods' : pos6 === '3' ? 'embedded-less-goods' : 'goods',
      })
    } else {
      otherStatements.push({ kind: STATEMENT_KINDS[typeCode.slice(0, 2)] ?? typeCode.slice(0, 2), typeCode, text })
    }
  }

  const events: TmEvent[] = arr(cf['case-file-event-statements']?.['case-file-event-statement']).map((e: any) => ({
    code: str(e.code) ?? '',
    type: str(e.type) ?? '',
    description: str(e['description-text']) ?? '',
    date: ymd(e.date),
    number: str(e.number) ? parseInt(str(e.number)!, 10) : null,
  })).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? '') || (b.number ?? 0) - (a.number ?? 0))

  const classifications: TmClass[] = arr(cf.classifications?.classification).map((c: any) => ({
    internationalCodes: arr(c['international-code']).map(str).filter(Boolean) as string[],
    usCodes: arr(c['us-code']).map(str).filter(Boolean) as string[],
    primaryCode: str(c['primary-code']),
    statusCode: str(c['status-code']),
    statusDate: ymd(c['status-date']),
    firstUseAnywhereDate: ymd(c['first-use-anywhere-date']),
    firstUseInCommerceDate: ymd(c['first-use-in-commerce-date']),
  }))

  const owners: TmParty[] = arr(cf['case-file-owners']?.['case-file-owner']).map((o: any) => ({
    entryNumber: str(o['entry-number']) ? parseInt(str(o['entry-number'])!, 10) : null,
    partyType: str(o['party-type']),
    name: str(o['party-name']) ?? '',
    legalEntityTypeCode: str(o['legal-entity-type-code']),
    address: ['address-1', 'address-2', 'address-3', 'address-4', 'address-5'].map(k => str(o[k])).filter(Boolean) as string[],
    city: str(o.city), state: str(o.state), country: str(o.country), postcode: str(o.postcode),
    nationality: o.nationality ? { state: str(o.nationality.state) ?? undefined, country: str(o.nationality.country) ?? undefined } : null,
  }))

  const corr = cf.correspondent ?? {}
  const correspondent = ['address-1', 'address-2', 'address-3', 'address-4', 'address-5'].map(k => str(corr[k])).filter(Boolean) as string[]

  const known = new Set(['serial-number', 'registration-number', 'transaction-date', 'case-file-header', 'case-file-statements',
    'case-file-event-statements', 'classifications', 'case-file-owners', 'correspondent'])
  const raw: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(cf)) if (!known.has(k) && v != null) raw[k] = v

  const reg = str(cf['registration-number'])
  return {
    serialNumber: str(cf['serial-number']) ?? '',
    registrationNumber: reg && /[1-9]/.test(reg) ? reg.replace(/^0+/, '') : null,
    transactionDate: ymd(cf['transaction-date']),
    header, flags, goodsServices, otherStatements, events, classifications, owners, correspondent, raw,
  }
}

// ─── Status & owner helpers ───────────────────────────────────────────────────

export function describeStatus(code: string | null | undefined): { liveDead: string; description: string } {
  const hit = code ? TRADEMARK_STATUS_CODES[code] : undefined
  return { liveDead: hit?.[0] ?? 'Unknown', description: hit?.[1] ?? (code ? `Status ${code}` : 'Unknown') }
}

export function statusFromCode(code: string | null | undefined): TrademarkStatus {
  const ld = describeStatus(code).liveDead.toLowerCase()
  if (ld === 'live/registered') return 'REGISTERED'
  if (ld.startsWith('live')) return 'PENDING'
  if (ld.includes('abandon')) return 'ABANDONED'
  if (ld.includes('expired')) return 'EXPIRED'
  if (ld.startsWith('dead') || ld.includes('cancel')) return 'CANCELLED'
  return 'UNKNOWN'
}

/** Current owner(s): entries with the highest party-type code (10 = original applicant … 30+ = post-registration). */
export function currentOwners(rec: TrademarkRecord): TmParty[] {
  const typed = rec.owners.filter(o => o.partyType && /^\d+$/.test(o.partyType))
  if (!typed.length) return rec.owners
  const max = Math.max(...typed.map(o => parseInt(o.partyType!, 10)))
  return typed.filter(o => parseInt(o.partyType!, 10) === max)
}

export function filingBasis(flags: Record<string, boolean>): string | null {
  const b: string[] = []
  if (flags['use-application-currently-in']) b.push('1(a)')
  if (flags['intent-to-use-current-in']) b.push('1(b)')
  if (flags['filing-basis-current-44d-in']) b.push('44(d)')
  if (flags['filing-basis-current-44e-in']) b.push('44(e)')
  if (flags['filing-basis-current-66a-in']) b.push('66(a)')
  if (flags['without-basis-currently-in'] || flags['filing-current-no-basis-in']) b.push('No basis')
  return b.length ? b.join(', ') : null
}

/** Maps a parsed record to Trademark table columns. */
export function recordToColumns(rec: TrademarkRecord) {
  const h = rec.header
  const { description } = describeStatus(h['status-code'])
  const classes = Array.from(new Set(rec.classifications.flatMap(c => c.internationalCodes)))
    .filter(c => /^\d+$/.test(c)).sort()
  return {
    serialNumber: rec.serialNumber,
    registrationNumber: rec.registrationNumber,
    markText: h['mark-identification'] ?? null,
    status: statusFromCode(h['status-code']),
    statusCode: h['status-code'] ?? null,
    statusDescription: description,
    statusDate: toDate(ymd(h['status-date'])),
    filingDate: toDate(ymd(h['filing-date'])),
    publicationDate: toDate(ymd(h['published-for-opposition-date'])),
    registrationDate: toDate(ymd(h['registration-date'])),
    renewalDate: toDate(ymd(h['renewal-date'])),
    abandonmentDate: toDate(ymd(h['abandonment-date'])),
    cancellationDate: toDate(ymd(h['cancellation-date'])),
    owner: currentOwners(rec).map(o => o.name).filter(Boolean).join('; ') || null,
    attorney: h['attorney-name'] ?? null,
    docketNumber: h['attorney-docket-number'] ?? null,
    internationalClasses: classes,
    rawJsonData: rec as unknown as object,
    dataAsOf: toDate(rec.transactionDate),
  }
}

// ─── Deadlines (US post-registration maintenance) ─────────────────────────────

export interface TrademarkDeadline {
  key: string
  label: string
  windowOpens: string
  dueDate: string
  graceEnds: string
  state: 'upcoming' | 'open' | 'grace' | 'filed' | 'missed'
}

function addYears(d: Date, years: number, months = 0) {
  const r = new Date(d)
  r.setUTCFullYear(r.getUTCFullYear() + years)
  r.setUTCMonth(r.getUTCMonth() + months)
  return r
}
const iso = (d: Date) => d.toISOString().slice(0, 10)

/**
 * Section 8 declaration (due between years 5 and 6) and combined Section 8 & 9
 * renewals (between years 9 and 10, then every 10 years), each with a 6-month grace
 * period. Only for live registrations. "filed" is inferred from the header flags and
 * the renewal date in the record.
 */
export function trademarkDeadlines(
  t: { status: TrademarkStatus; registrationDate: Date | string | null; renewalDate?: Date | string | null; rawJsonData?: unknown },
  today = new Date(),
): TrademarkDeadline[] {
  if (t.status !== 'REGISTERED' || !t.registrationDate) return []
  const reg = new Date(t.registrationDate)
  const rec = t.rawJsonData as TrademarkRecord | null
  const flags = rec?.flags ?? {}
  const events = rec?.events ?? []
  const renewed = t.renewalDate ? new Date(t.renewalDate) : null

  // Filings show up in the timeline before the header flags/renewal date change
  // (e.g. "TEAS SECTION 8 & 9 RECEIVED"), so check events inside the window too.
  const filedBetween = (re: RegExp, from: Date, to: Date) => events.some(e => {
    if (!e.date || /REMINDER/i.test(e.description) || !re.test(e.description)) return false
    const d = new Date(`${e.date}T00:00:00Z`)
    return d >= from && d <= to && /RECEIVED|ACCEPT|FILED|REGISTRATION RENEWED/i.test(e.description)
  })

  const state = (opens: Date, due: Date, grace: Date, filed: boolean): TrademarkDeadline['state'] => {
    if (filed) return 'filed'
    if (today < opens) return 'upcoming'
    if (today <= due) return 'open'
    if (today <= grace) return 'grace'
    return 'missed'
  }

  const out: TrademarkDeadline[] = []
  {
    const opens = addYears(reg, 5), due = addYears(reg, 6), grace = addYears(reg, 6, 6)
    const filed = !!(flags['section-8-accepted-in'] || flags['section-8-filed-in'] || flags['section-8-partial-accept-in'])
      || filedBetween(/SEC(TION|\.)?\s*8\b/i, addYears(opens, 0, -1), grace)
    out.push({
      key: 'sec8-6yr', label: 'Section 8 Declaration of Use (6-year)',
      windowOpens: iso(opens), dueDate: iso(due), graceEnds: iso(grace),
      state: state(opens, due, grace, filed),
    })
  }
  for (let n = 10; n <= 200; n += 10) {
    const opens = addYears(reg, n - 1), due = addYears(reg, n), grace = addYears(reg, n, 6)
    const filed = (!!renewed && renewed >= addYears(opens, 0, -1))
      || filedBetween(/8\s*&\s*9|SEC(TION|\.)?\s*9\b|RENEW/i, addYears(opens, 0, -1), grace)
    out.push({
      key: `renewal-${n}yr`, label: `Section 8 & 9 Renewal (${n}-year)`,
      windowOpens: iso(opens), dueDate: iso(due), graceEnds: iso(grace),
      state: state(opens, due, grace, filed),
    })
    if (due > today) break   // stop after the first renewal still in the future
  }
  // Keep the most recent completed filing for context, drop older history.
  let lastFiled = -1
  out.forEach((d, i) => { if (d.state === 'filed') lastFiled = i })
  return out.slice(Math.max(0, lastFiled))
}

/** The next deadline the owner needs to act on, if any. */
export function nextDeadline(t: Parameters<typeof trademarkDeadlines>[0], today = new Date()) {
  return trademarkDeadlines(t, today).find(d => d.state === 'upcoming' || d.state === 'open' || d.state === 'grace') ?? null
}

// ─── Persistence ──────────────────────────────────────────────────────────────

export type UpsertResult = 'created' | 'updated' | 'unchanged' | 'stale'

/**
 * Creates or updates a trademark from a parsed record. Records older than the
 * stored dataAsOf are ignored, so files can be processed in any order.
 */
export async function upsertTrademarkRecord(
  rec: TrademarkRecord,
  source: TrademarkSource,
): Promise<UpsertResult> {
  const cols = recordToColumns(rec)
  const existing = await prisma.trademark.findUnique({
    where: { serialNumber: rec.serialNumber },
    select: { id: true, dataAsOf: true },
  })
  const now = new Date()
  if (!existing) {
    await prisma.trademark.create({ data: { ...cols, source, lastCheckedAt: now } })
    return 'created'
  }
  if (existing.dataAsOf && cols.dataAsOf && cols.dataAsOf < existing.dataAsOf) return 'stale'
  if (existing.dataAsOf && cols.dataAsOf && cols.dataAsOf.getTime() === existing.dataAsOf.getTime()) {
    await prisma.trademark.update({ where: { id: existing.id }, data: { lastCheckedAt: now } })
    return 'unchanged'
  }
  await prisma.trademark.update({ where: { id: existing.id }, data: { ...cols, lastCheckedAt: now } })
  return 'updated'
}

// ─── Links ────────────────────────────────────────────────────────────────────

export const tsdrStatusUrl = (serial: string) =>
  `https://tsdr.uspto.gov/#caseNumber=${serial}&caseSearchType=US_APPLICATION&caseType=DEFAULT&searchType=statusSearch`
export const tsdrDocumentsUrl = (serial: string) =>
  `https://tsdr.uspto.gov/#caseNumber=${serial}&caseSearchType=US_APPLICATION&caseType=DEFAULT&searchType=documentSearch`
export const tsdrImageUrl = (serial: string) => `https://tsdr.uspto.gov/img/${serial}/large`
