/**
 * Docket-number → Patent matching logic for invoice line items.
 * Preload all portfolio patents once per invoice upload; run matching in-memory.
 */

export interface PatentCandidate {
  id: string
  applicationNumber: string | null
  patentNumber: string | null
  docketNumber: string | null
  title: string
}

export function normalizeDocket(raw: string): string {
  return raw.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

export type MatchConfidence = 'EXACT' | 'PARTIAL' | 'NONE'

export interface MatchResult {
  patentId: string | null
  confidence: MatchConfidence
}

/**
 * Extract all digit runs of 7–11 digits from a string (potential serial/patent numbers).
 */
export function extractNumbers(text: string): string[] {
  return (text.match(/\d{7,11}/g) ?? [])
}

export function matchDocket(
  docket: string | null | undefined,
  candidates: PatentCandidate[],
  description?: string | null,
): MatchResult {
  if (!docket?.trim() && !description?.trim()) return { patentId: null, confidence: 'NONE' }

  const norm = docket ? normalizeDocket(docket) : ''

  // 1. Exact match: normalized docket == docketNumber, applicationNumber, or patentNumber
  if (norm) {
    for (const p of candidates) {
      const docketNorm = p.docketNumber ? normalizeDocket(p.docketNumber) : null
      const appNorm = p.applicationNumber ? normalizeDocket(p.applicationNumber) : null
      const patNorm = p.patentNumber ? normalizeDocket(p.patentNumber) : null
      if (
        (docketNorm && docketNorm === norm) ||
        (appNorm && appNorm === norm) ||
        (patNorm && patNorm === norm)
      ) {
        return { patentId: p.id, confidence: 'EXACT' }
      }
    }
  }

  // 2. Extract any serial/patent numbers embedded in the docket or description
  const combined = `${docket ?? ''} ${description ?? ''}`
  const embeddedNums = extractNumbers(combined)

  if (embeddedNums.length > 0) {
    for (const p of candidates) {
      const appNorm = p.applicationNumber ? normalizeDocket(p.applicationNumber) : null
      const patNorm = p.patentNumber ? normalizeDocket(p.patentNumber) : null
      for (const n of embeddedNums) {
        if ((appNorm && appNorm === n) || (patNorm && patNorm === n)) {
          return { patentId: p.id, confidence: 'EXACT' }
        }
      }
    }
  }

  // 3. Partial: docket contains or is contained by an app/patent number
  if (norm) {
    for (const p of candidates) {
      const appNorm = p.applicationNumber ? normalizeDocket(p.applicationNumber) : null
      const patNorm = p.patentNumber ? normalizeDocket(p.patentNumber) : null
      const isPartial =
        (appNorm && (norm.includes(appNorm) || appNorm.includes(norm))) ||
        (patNorm && (norm.includes(patNorm) || patNorm.includes(norm)))
      if (isPartial) return { patentId: p.id, confidence: 'PARTIAL' }
    }
  }

  // 4. EP national phase fallback: strip trailing country/sequence suffix and match base docket
  //    e.g. "38051.0002DE1" → base "38051.0002", matches patent with docket "38051.0002U9"
  if (docket) {
    const baseMatch = docket.match(/^([\d.]+(?:\.\d+)*)[A-Z]{2,3}\d*$/i)
    if (baseMatch) {
      const baseNorm = normalizeDocket(baseMatch[1])
      for (const p of candidates) {
        const docketNorm = p.docketNumber ? normalizeDocket(p.docketNumber) : null
        if (docketNorm && docketNorm.startsWith(baseNorm)) {
          return { patentId: p.id, confidence: 'PARTIAL' }
        }
      }
    }
  }

  return { patentId: null, confidence: 'NONE' }
}
