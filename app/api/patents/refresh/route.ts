import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { calculateMaintenanceFees } from '@/lib/uspto-api'
import { generateAndCacheSummary } from '@/lib/portfolio-summary'

// ── USPTO ODP ─────────────────────────────────────────────────────────────────

const ODP_BASE = 'https://api.uspto.gov/api/v1/patent/applications'

function odpHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.USPTO_API_KEY) h['X-Api-Key'] = process.env.USPTO_API_KEY
  return h
}

function normalizePatentNumber(raw: string): string {
  return raw.replace(/^US\s*/i, '').replace(/[,\s]/g, '').replace(/[A-Z]\d*$/i, '').trim()
}

// Strip heavy fields (attorney bags, correspondence bags) before storing
function slimJson(data: any): any {
  if (!data) return null
  try {
    const records = (data.patentFileWrapperDataBag || []).map((rec: any) => {
      const meta = rec.applicationMetaData || {}
      return {
        applicationNumberText: rec.applicationNumberText,
        applicationMetaData: {
          applicationStatusCode:            meta.applicationStatusCode,
          applicationStatusDescriptionText: meta.applicationStatusDescriptionText,
          applicationTypeCode:              meta.applicationTypeCode,
          applicationTypeCategory:          meta.applicationTypeCategory,
          applicationTypeLabelName:         meta.applicationTypeLabelName,
          filingDate:                       meta.filingDate,
          effectiveFilingDate:              meta.effectiveFilingDate,
          grantDate:                        meta.grantDate,
          earliestPublicationDate:          meta.earliestPublicationDate,
          earliestPublicationNumber:        meta.earliestPublicationNumber,
          patentNumber:                     meta.patentNumber,
          inventionTitle:                   meta.inventionTitle,
          firstInventorName:                meta.firstInventorName,
          firstApplicantName:               meta.firstApplicantName,
          applicationConfirmationNumber:    meta.applicationConfirmationNumber,
          customerNumber:                   meta.customerNumber,
          docketNumber:                     meta.docketNumber,
          entityStatusData:                 meta.entityStatusData,
          firstInventorToFileIndicator:     meta.firstInventorToFileIndicator,
          uspcSymbolText:                   meta.uspcSymbolText,
          abstractText:                     meta.abstractText,
          inventorBag: (meta.inventorBag || []).map((inv: any) => ({
            inventorNameText: inv.inventorNameText,
            firstName: inv.firstName, middleName: inv.middleName, lastName: inv.lastName,
          })),
          applicantBag: (meta.applicantBag || []).map((a: any) => ({
            applicantNameText: a.applicantNameText,
          })),
          cpcClassificationBag: meta.cpcClassificationBag,
          publicationSequenceNumberBag: meta.publicationSequenceNumberBag,
          publicationDateBag: meta.publicationDateBag,
        },
        // Keep event history but strip correspondence addresses from attorneys
        eventDataBag: rec.eventDataBag || [],
        // Keep continuity bags
        parentContinuityBag: rec.parentContinuityBag,
        childContinuityBag:  rec.childContinuityBag,
        // Keep document bag (stored separately via fetchDocuments)
        documentBag: rec.documentBag || [],
      }
    })
    return { count: data.count, patentFileWrapperDataBag: records }
  } catch { return null }
}

async function fetchFromODP(patentNumber: string | null, appNumber: string | null): Promise<any | null> {
  const attempts: { q: string }[] = []
  if (patentNumber) attempts.push({ q: `applicationMetaData.patentNumber:${normalizePatentNumber(patentNumber)}` })
  if (appNumber)    attempts.push({ q: `applicationNumberText:${appNumber.replace(/[\/,\s]/g, '')}` })
  for (const attempt of attempts) {
    const url = new URL(`${ODP_BASE}/search`)
    url.searchParams.set('q', attempt.q)
    url.searchParams.set('limit', '1')
    try {
      const res = await fetch(url.toString(), { headers: odpHeaders(), signal: AbortSignal.timeout(15000) })
      if (!res.ok) continue
      const data = await res.json()
      if (data?.patentFileWrapperDataBag?.length > 0) return data
    } catch { continue }
  }
  return null
}

async function fetchContinuity(appNumber: string): Promise<any> {
  try {
    const res = await fetch(`${ODP_BASE}/${appNumber}/continuity`, {
      headers: odpHeaders(), signal: AbortSignal.timeout(10000),
    })
    return res.ok ? res.json() : null
  } catch { return null }
}

async function fetchDocuments(appNumber: string): Promise<any[]> {
  try {
    const res = await fetch(`${ODP_BASE}/${appNumber}/documents`, {
      headers: odpHeaders(), signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const data = await res.json()
    // Real response shape: { count, documentBag: [...] }  (top-level, not nested)
    const bag = data?.documentBag
    if (!Array.isArray(bag)) return []
    return bag
      .map((d: any) => {
        // Pick the PDF download option first, then any other
        const pdfOption = d.downloadOptionBag?.find((o: any) => o.mimeTypeIdentifier === 'PDF')
        const anyOption = d.downloadOptionBag?.[0]
        const chosen    = pdfOption || anyOption
        return {
          documentIdentifier:          d.documentIdentifier          || null,
          documentCode:                d.documentCode                || '',
          documentCodeDescriptionText: d.documentCodeDescriptionText || '',
          officialDate:                d.officialDate                || null,
          directionCategory:           d.directionCategory           || '',
          pageCount:                   chosen?.pageTotalQuantity     || null,
          downloadUrl:                 chosen?.downloadUrl           || null,
          mimeType:                    chosen?.mimeTypeIdentifier    || null,
        }
      })
      .filter((d: any) => d.officialDate)
      .sort((a: any, b: any) => b.officialDate.localeCompare(a.officialDate))
  } catch { return [] }
}

function mapStatus(s: string): string {
  const l = s.toLowerCase()
  if (l.includes('patented') || l.includes('grant') || l.includes('issued')) return 'GRANTED'
  if (l.includes('abandon')) return 'ABANDONED'
  if (l.includes('expired')) return 'EXPIRED'
  if (l.includes('publish')) return 'PUBLISHED'
  return 'PENDING'
}

function mapType(code: string): string {
  const c = code.toUpperCase()
  if (c === 'DES' || c.includes('DESIGN'))  return 'DESIGN'
  if (c === 'PLT' || c.includes('PLANT'))   return 'PLANT'
  if (c === 'PRV' || c.includes('PROV'))    return 'PROVISIONAL'
  if (c === 'PCT')                          return 'PCT'
  return 'UTILITY'
}

// ── EPO OPS ───────────────────────────────────────────────────────────────────

let _epoTokenCache: { token: string; expires: number } | null = null

async function getEpoToken(): Promise<string | null> {
  if (_epoTokenCache && Date.now() < _epoTokenCache.expires - 30000) return _epoTokenCache.token
  const key = process.env.EPO_OPS_KEY
  const secret = process.env.EPO_OPS_SECRET
  if (!key || !secret) return null
  try {
    const res = await fetch('https://ops.epo.org/3.2/auth/accesstoken', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const data = await res.json()
    _epoTokenCache = { token: data.access_token, expires: Date.now() + data.expires_in * 1000 }
    return _epoTokenCache.token
  } catch { return null }
}

function extractXmlText(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*lang="en"[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
           || xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  if (!m) return null
  return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
}

async function fetchEpoBiblio(epNumber: string): Promise<any | null> {
  const token = await getEpoToken()
  if (!token) return null
  try {
    const bare = epNumber.replace(/^EP/i, '').replace(/[,\s]/g, '').replace(/[A-Z]\d*$/i, '')
    const res = await fetch(
      `https://ops.epo.org/3.2/rest-services/published-data/publication/epodoc/EP${bare}/biblio`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/xml' }, signal: AbortSignal.timeout(12000) }
    )
    return res.ok ? await res.text() : null
  } catch { return null }
}

async function fetchEpoAbstractAndClaims(epNumber: string): Promise<{ abstract: string | null; claimsJson: any[] | null }> {
  const token = await getEpoToken()
  if (!token) return { abstract: null, claimsJson: null }
  try {
    const bare = epNumber.replace(/^EP/i, '').replace(/[,\s]/g, '').replace(/[A-Z]\d*$/i, '')
    const base = `https://ops.epo.org/3.2/rest-services/published-data/publication/epodoc/EP${bare}`
    const hdrs = { Authorization: `Bearer ${token}`, Accept: 'application/xml' }
    const [absRes, claimRes] = await Promise.all([
      fetch(`${base}/abstract`, { headers: hdrs, signal: AbortSignal.timeout(10000) }),
      fetch(`${base}/claims`,   { headers: hdrs, signal: AbortSignal.timeout(10000) }),
    ])
    const abstract   = absRes.ok   ? extractXmlText(await absRes.text(),   'abstract') : null
    const claimsText = claimRes.ok ? extractXmlText(await claimRes.text(), 'claims')   : null
    let claimsJson: any[] | null = null
    if (claimsText) {
      const parts = claimsText.split(/(?=\b\d{1,2}\.\s)/).filter(p => p.trim())
      claimsJson = (parts.length > 1 ? parts : [claimsText])
        .map((t, i) => ({ claim_sequence: i + 1, claim_text: t.trim() }))
    }
    return { abstract, claimsJson }
  } catch { return { abstract: null, claimsJson: null } }
}

function parseEpoDate(d: string | null): Date | null {
  if (!d) return null
  const s = d.replace(/\D/g, '')
  if (s.length === 8) return new Date(`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`)
  return null
}

function getXmlTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))
  return m ? m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : null
}

function shapeEpoBiblio(biblioXml: string) {
  const titleEn = biblioXml.match(/<invention-title[^>]*lang="en"[^>]*>([\s\S]*?)<\/invention-title>/i)
  const titleAny = biblioXml.match(/<invention-title[^>]*>([\s\S]*?)<\/invention-title>/i)
  const title = (titleEn || titleAny)?.[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null

  // EPO XML: filing date is nested in <application-reference><document-id><date>
  const filingDate = parseEpoDate((() => {
    const appRef = biblioXml.match(/<application-reference[^>]*>[\s\S]*?<\/application-reference>/i)?.[0] || ''
    return getXmlTag(appRef, 'date') || getXmlTag(biblioXml, 'filing-date')
  })())
  const grantDate = parseEpoDate(getXmlTag(biblioXml, 'date-of-grant'))
  const pubDate   = parseEpoDate((() => {
    const pubRef = biblioXml.match(/<publication-reference[^>]*>[\s\S]*?<\/publication-reference>/i)?.[0] || ''
    return getXmlTag(pubRef, 'date') || getXmlTag(biblioXml, 'date-of-publication') || getXmlTag(biblioXml, 'publication-date')
  })())

  let expirationDate: Date | null = null
  if (filingDate) {
    expirationDate = new Date(filingDate)
    expirationDate.setFullYear(expirationDate.getFullYear() + 20)
  }

  const proceedingsStatus = (() => {
    const m = biblioXml.match(/<status-of-proceedings[^>]*>([^<]+)<\/status-of-proceedings>/i)
    return m ? m[1].toLowerCase().trim() : ''
  })()
  const kindCodes = (biblioXml.match(/kind="([^"]+)"/gi) || [])
    .map(m => m.replace(/kind="/i, '').replace(/"$/, '').toUpperCase())
  const hasGrantKind = kindCodes.some(k => /^B/.test(k))

  let status = 'PENDING'
  if (grantDate || hasGrantKind || proceedingsStatus.includes('grant') || proceedingsStatus.includes('opposition')) {
    status = 'GRANTED'
  } else if (kindCodes.some(k => /^A/.test(k)) || pubDate || proceedingsStatus.includes('published')) {
    status = 'PUBLISHED'
  } else if (proceedingsStatus.includes('withdrawn') || proceedingsStatus.includes('refused')) {
    status = 'ABANDONED'
  }

  const inventors = (biblioXml.match(/<inventor[^>]*>[\s\S]*?<\/inventor>/gi) || [])
    .map(b => getXmlTag(b, 'name') || '')
    .filter(Boolean)

  const assignee = (() => {
    const m = biblioXml.match(/<applicant[^>]*>[\s\S]*?<\/applicant>/i)
    return m ? getXmlTag(m[0], 'name') : null
  })()

  const ipcCodes = (biblioXml.match(/<classification-ipcr[^>]*>[\s\S]*?<\/classification-ipcr>/gi) || [])
    .map(b => b.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .slice(0, 8)

  return { title, filingDate, grantDate, pubDate, expirationDate, status, inventors, assignee, cpcCodes: ipcCodes }
}

// ── EPO abstract/claims (used for US patents too) ─────────────────────────────

async function fetchAbstractAndClaims(patentNumber: string): Promise<{ abstract: string | null; claimsJson: any[] | null }> {
  try {
    const token = await getEpoToken()
    if (!token) return { abstract: null, claimsJson: null }
    const bare = patentNumber.replace(/^US/i, '').replace(/[,\s]/g, '').replace(/[A-Z]\d*$/i, '')
    const base = `https://ops.epo.org/3.2/rest-services/published-data/publication/epodoc/US${bare}`
    const hdrs = { Authorization: `Bearer ${token}`, Accept: 'application/xml' }
    const [absRes, claimRes] = await Promise.all([
      fetch(`${base}/abstract`, { headers: hdrs, signal: AbortSignal.timeout(10000) }),
      fetch(`${base}/claims`,   { headers: hdrs, signal: AbortSignal.timeout(10000) }),
    ])
    const abstract   = absRes.ok   ? extractXmlText(await absRes.text(),   'abstract') : null
    const claimsText = claimRes.ok ? extractXmlText(await claimRes.text(), 'claims')   : null
    let claimsJson: any[] | null = null
    if (claimsText) {
      const parts = claimsText.split(/(?=\b\d{1,2}\.\s)/).filter(p => p.trim())
      claimsJson = (parts.length > 1 ? parts : [claimsText])
        .map((t, i) => ({ claim_sequence: i + 1, claim_text: t.trim() }))
    }
    return { abstract, claimsJson }
  } catch { return { abstract: null, claimsJson: null } }
}

// ── Shared types ──────────────────────────────────────────────────────────────

interface PatentRecord {
  id: string
  patentNumber: string | null
  applicationNumber: string | null
  epNumber: string | null
  jurisdiction: string | null
  title: string
  abstract?: string | null
}

interface RefreshResult {
  id: string
  patentNumber: string | null
  title: string
  status: 'updated' | 'unchanged' | 'error' | 'skipped'
  message?: string
  changes?: string[]
}

// ── EP refresh ────────────────────────────────────────────────────────────────

async function refreshEp(patent: PatentRecord): Promise<RefreshResult> {
  const epNum = patent.epNumber
  if (!epNum) {
    return { id: patent.id, patentNumber: null, title: patent.title, status: 'skipped', message: 'No EP number' }
  }

  try {
    const [biblioXml, abstractData] = await Promise.all([
      fetchEpoBiblio(epNum),
      fetchEpoAbstractAndClaims(epNum),
    ])

    if (!biblioXml) {
      return { id: patent.id, patentNumber: null, title: patent.title, status: 'error', message: 'Not found in EPO OPS' }
    }

    const shaped = shapeEpoBiblio(biblioXml)

    const existing = await prisma.patent.findUnique({
      where: { id: patent.id },
      select: { status: true, title: true, grantDate: true, assignee: true, abstract: true },
    })

    const changes: string[] = []
    if (existing?.status   !== shaped.status)    changes.push(`status: ${existing?.status} → ${shaped.status}`)
    if (shaped.title && existing?.title !== shaped.title) changes.push('title updated')
    if (shaped.assignee && existing?.assignee !== shaped.assignee) changes.push(`assignee → ${shaped.assignee}`)
    if (!existing?.grantDate && shaped.grantDate) changes.push(`grant date: ${shaped.grantDate.toISOString().slice(0,10)}`)
    if (!existing?.abstract && abstractData.abstract) changes.push('abstract saved')
    if (abstractData.claimsJson) changes.push(`${abstractData.claimsJson.length} claims saved`)

    await prisma.patent.update({
      where: { id: patent.id },
      data: {
        ...(shaped.title        ? { title: shaped.title }               : {}),
        status:                   shaped.status as any,
        ...(shaped.filingDate   ? { filingDate: shaped.filingDate }     : {}),
        ...(shaped.grantDate    ? { grantDate: shaped.grantDate }       : {}),
        ...(shaped.pubDate      ? { publicationDate: shaped.pubDate }   : {}),
        ...(shaped.expirationDate ? { expirationDate: shaped.expirationDate } : {}),
        ...(shaped.inventors.length ? { inventors: shaped.inventors }   : {}),
        ...(shaped.assignee     ? { assignee: shaped.assignee }         : {}),
        ...(shaped.cpcCodes.length  ? { cpcCodes: shaped.cpcCodes }     : {}),
        jurisdiction: 'EP',
        rawXmlData: biblioXml,
        ...(abstractData.abstract   ? { abstract: abstractData.abstract } : {}),
        ...(abstractData.claimsJson ? { claimsJson: abstractData.claimsJson } : {}),
      },
    })

    return {
      id: patent.id, patentNumber: `EP${epNum}`, title: shaped.title || patent.title,
      status: changes.length > 0 ? 'updated' : 'unchanged', changes,
    }
  } catch (e) {
    return { id: patent.id, patentNumber: `EP${epNum}`, title: patent.title, status: 'error', message: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// ── US refresh ────────────────────────────────────────────────────────────────

async function refreshUs(patent: PatentRecord): Promise<RefreshResult> {
  if (!patent.patentNumber && !patent.applicationNumber) {
    return { id: patent.id, patentNumber: null, title: patent.title, status: 'skipped', message: 'No identifiers' }
  }

  try {
    const raw = await fetchFromODP(patent.patentNumber, patent.applicationNumber)
    if (!raw) {
      return { id: patent.id, patentNumber: patent.patentNumber, title: patent.title, status: 'error', message: 'Not found in USPTO ODP' }
    }

    const record  = raw.patentFileWrapperDataBag?.[0] || {}
    const appMeta = record.applicationMetaData || {}
    const appNum  = record.applicationNumberText || patent.applicationNumber

    const [continuity, abstractData, documents] = await Promise.all([
      appNum ? fetchContinuity(appNum) : Promise.resolve(null),
      patent.patentNumber ? fetchAbstractAndClaims(patent.patentNumber) : Promise.resolve({ abstract: null, claimsJson: null }),
      appNum ? fetchDocuments(appNum) : Promise.resolve([]),
    ])

    const inventors = (appMeta.inventorBag || [])
      .map((inv: any) => inv.inventorNameText || `${inv.inventorFirstNameText || ''} ${inv.inventorLastNameText || ''}`.trim())
      .filter(Boolean)
    const cpcCodes = (appMeta.cpcClassificationBag || [])
      .map((c: any) => (typeof c === 'string' ? c : c?.cpcClassificationText || ''))
      .filter(Boolean)

    let expirationDate: Date | null = null
    if (appMeta.filingDate) {
      const d = new Date(appMeta.filingDate)
      d.setFullYear(d.getFullYear() + 20)
      expirationDate = d
    }

    const newGrantDate = appMeta.grantDate ? new Date(appMeta.grantDate) : null
    const newStatus    = mapStatus(appMeta.applicationStatusDescriptionText || appMeta.applicationStatusCode || '')
    const newType      = mapType(appMeta.applicationTypeCode || '')
    const newTitle     = appMeta.inventionTitle || appMeta.patentTitle || patent.title
    const newAssignee  = appMeta.applicantBag?.[0]?.applicantNameText || appMeta.firstApplicantName || null
    const newPatentNum = appMeta.patentNumber || patent.patentNumber

    const existing = await prisma.patent.findUnique({
      where: { id: patent.id },
      select: { status: true, title: true, grantDate: true, assignee: true, type: true, patentNumber: true, abstract: true },
    })

    const changes: string[] = []
    if (existing?.status   !== newStatus)    changes.push(`status: ${existing?.status} → ${newStatus}`)
    if (existing?.title    !== newTitle)     changes.push('title updated')
    if (existing?.assignee !== newAssignee)  changes.push(`assignee → ${newAssignee}`)
    if (!existing?.grantDate && newGrantDate) changes.push(`grant date: ${newGrantDate.toISOString().slice(0,10)}`)
    if (!existing?.patentNumber && newPatentNum) changes.push(`patent number: ${newPatentNum}`)
    if (!existing?.abstract && abstractData?.abstract) changes.push('abstract saved')
    if (abstractData?.claimsJson) changes.push(`${abstractData.claimsJson.length} claims saved`)

    await prisma.patent.update({
      where: { id: patent.id },
      data: {
        applicationNumber: appNum || patent.applicationNumber,
        patentNumber:      newPatentNum,
        publicationNumber: appMeta.earliestPublicationNumber || null,
        title:             newTitle,
        status:            newStatus as any,
        type:              newType   as any,
        filingDate:        appMeta.filingDate              ? new Date(appMeta.filingDate)              : null,
        publicationDate:   appMeta.earliestPublicationDate ? new Date(appMeta.earliestPublicationDate) : null,
        grantDate:         newGrantDate,
        expirationDate,
        inventors,
        assignee:          newAssignee,
        cpcCodes,
        rawJsonData:       { ...slimJson(raw), documentBag: documents },
        ...(abstractData?.abstract   ? { abstract:   abstractData.abstract }   : {}),
        ...(abstractData?.claimsJson ? { claimsJson: abstractData.claimsJson } : {}),
      },
    })

    // ── Wire up continuity relationships ───────────────────────────────────────
    // continuity data has parentContinuityBag and childContinuityBag
    // each entry has applicationNumberText and continuityTypeCategory
    if (continuity) {
      const bag = continuity.patentFileWrapperDataBag?.[0] || continuity
      const parents: any[] = bag.parentContinuityBag || []
      const children: any[] = bag.childContinuityBag || []

      // Map continuity type string → our enum
      function mapConType(t: string): string {
        const u = (t || '').toUpperCase()
        if (u.includes('CONTINUATION IN PART') || u.includes('CIP')) return 'CONTINUATION_IN_PART'
        if (u.includes('CONTINUATION'))   return 'CONTINUATION'
        if (u.includes('DIVISIONAL'))     return 'DIVISIONAL'
        if (u.includes('REISSUE'))        return 'REISSUE'
        return 'CONTINUATION'
      }

      // Try to link this patent to a parent already in DB
      if (parents.length > 0 && !existing?.parentPatentId) {
        for (const parent of parents) {
          const parentAppNum = parent.applicationNumberText?.replace(/[\/,\s]/g, '')
          if (!parentAppNum) continue
          const parentInDb = await prisma.patent.findFirst({
            where: {
              OR: [
                { applicationNumber: { contains: parentAppNum } },
                { applicationNumber: parentAppNum },
              ]
            },
            select: { id: true }
          })
          if (parentInDb) {
            await prisma.patent.update({
              where: { id: patent.id },
              data: {
                parentPatentId:   parentInDb.id,
                continuationType: mapConType(parent.continuityTypeCategory) as any,
              }
            })
            changes.push(`linked to parent (${mapConType(parent.continuityTypeCategory)})`)
            break
          }
        }
      }

      // Try to link children already in DB back to this patent
      for (const child of children) {
        const childAppNum = child.applicationNumberText?.replace(/[\/,\s]/g, '')
        if (!childAppNum) continue
        const childInDb = await prisma.patent.findFirst({
          where: {
            AND: [
              { OR: [{ applicationNumber: { contains: childAppNum } }, { applicationNumber: childAppNum }] },
              { parentPatentId: null },  // don't overwrite existing links
            ]
          },
          select: { id: true }
        })
        if (childInDb) {
          await prisma.patent.update({
            where: { id: childInDb.id },
            data: {
              parentPatentId:   patent.id,
              continuationType: mapConType(child.continuityTypeCategory) as any,
            }
          })
          changes.push(`child ${childAppNum} linked (${mapConType(child.continuityTypeCategory)})`)
        }
      }
    }

    if (newGrantDate && newType === 'UTILITY') {
      const feeCount = await prisma.maintenanceFee.count({ where: { patentId: patent.id } })
      if (feeCount === 0) {
        const fees = calculateMaintenanceFees(newGrantDate)
        await Promise.allSettled(fees.map(fee =>
          prisma.maintenanceFee.create({
            data: { patentId: patent.id, feeType: fee.feeType as any, dueDate: fee.dueDate, gracePeriodEnd: fee.gracePeriodEnd, status: 'UPCOMING' }
          })
        ))
        changes.push('maintenance fees auto-generated')
      }
    }

    return { id: patent.id, patentNumber: newPatentNum, title: newTitle, status: changes.length > 0 ? 'updated' : 'unchanged', changes }
  } catch (e) {
    return { id: patent.id, patentNumber: patent.patentNumber, title: patent.title, status: 'error', message: e instanceof Error ? e.message : 'Unknown error' }
  }
}

// ── Router: EP vs US ──────────────────────────────────────────────────────────

async function refreshOne(patent: PatentRecord): Promise<RefreshResult> {
  // Detect EP by epNumber presence OR jurisdiction field
  const isEp = !!patent.epNumber || (patent.jurisdiction || '').toUpperCase() === 'EP'
  return isEp ? refreshEp(patent) : refreshUs(patent)
}

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  const select = { id: true, patentNumber: true, applicationNumber: true, epNumber: true, jurisdiction: true, title: true }

  if (id) {
    const patent = await prisma.patent.findUnique({ where: { id }, select })
    if (!patent) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const result = await refreshOne(patent)
    if (result.status === 'updated') generateAndCacheSummary().catch(() => {})
    return NextResponse.json(result)
  }

  const patents = await prisma.patent.findMany({ select, orderBy: { updatedAt: 'asc' } })
  return NextResponse.json({ patents, total: patents.length })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const ids: string[] | undefined = body.ids
    const select = { id: true, patentNumber: true, applicationNumber: true, epNumber: true, jurisdiction: true, title: true }

    const targets = ids?.length
      ? await prisma.patent.findMany({ where: { id: { in: ids } }, select })
      : await prisma.patent.findMany({ select, orderBy: { updatedAt: 'asc' } })

    const results: RefreshResult[] = []
    for (const p of targets) {
      results.push(await refreshOne(p))
      await new Promise(r => setTimeout(r, 300))
    }

    const updatedCount = results.filter(r => r.status === 'updated').length
    if (updatedCount > 0) generateAndCacheSummary().catch(() => {})

    return NextResponse.json({
      results,
      total:     targets.length,
      updated:   updatedCount,
      unchanged: results.filter(r => r.status === 'unchanged').length,
      failed:    results.filter(r => r.status === 'error' || r.status === 'skipped').length,
    })
  } catch (e) {
    console.error('Bulk refresh error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Refresh failed' }, { status: 500 })
  }
}
