/**
 * USPTO PatentsView API Client
 * Docs: https://patentsview.org/apis/api-endpoints/patents
 */

const USPTO_BASE = process.env.USPTO_API_BASE_URL || 'https://api.patentsview.org'

export interface USPTOSearchParams {
  patentNumbers?: string[]
  applicationNumbers?: string[]
  assignee?: string
  inventorName?: string
  title?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  perPage?: number
}

export interface USPTOPatent {
  patent_id: string
  patent_number: string
  patent_title: string
  patent_abstract: string
  patent_date: string
  patent_type: string
  app_number: string
  app_date: string
  inventors: Array<{
    inventor_id: string
    inventor_first_name: string
    inventor_last_name: string
  }>
  assignees: Array<{
    assignee_id: string
    assignee_first_name: string
    assignee_last_name: string
    assignee_organization: string
  }>
  cpcs: Array<{
    cpc_subgroup_id: string
    cpc_subgroup_title: string
  }>
  applications: Array<{
    app_id: string
    app_number: string
    app_date: string
    app_type: string
  }>
}

export interface USPTOSearchResult {
  patents: USPTOPatent[]
  total_patent_count: number
  count: number
}

const DEFAULT_FIELDS = [
  'patent_id', 'patent_number', 'patent_title', 'patent_abstract',
  'patent_date', 'patent_type', 'app_number', 'app_date',
  'inventors.inventor_id', 'inventors.inventor_first_name', 'inventors.inventor_last_name',
  'assignees.assignee_id', 'assignees.assignee_organization',
  'assignees.assignee_first_name', 'assignees.assignee_last_name',
  'cpcs.cpc_subgroup_id', 'cpcs.cpc_subgroup_title',
  'applications.app_id', 'applications.app_number', 'applications.app_date',
]

/**
 * Search USPTO PatentsView API
 */
export async function searchUSPTO(params: USPTOSearchParams): Promise<USPTOSearchResult> {
  const query = buildQuery(params)
  
  const body = {
    q: query,
    f: DEFAULT_FIELDS,
    o: {
      page: params.page || 1,
      per_page: params.perPage || 25,
      sort: [{ patent_date: 'desc' }],
    },
  }

  const response = await fetch(`${USPTO_BASE}/patents/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.USPTO_API_KEY || '',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`USPTO API error ${response.status}: ${error}`)
  }

  return response.json()
}

/**
 * Fetch a single patent by number
 */
export async function fetchPatentByNumber(patentNumber: string): Promise<USPTOPatent | null> {
  const result = await searchUSPTO({ patentNumbers: [patentNumber], perPage: 1 })
  return result.patents[0] || null
}

/**
 * Fetch patent family (continuation chain)
 */
export async function fetchPatentFamily(applicationNumber: string): Promise<USPTOPatent[]> {
  const result = await searchUSPTO({ applicationNumbers: [applicationNumber] })
  return result.patents
}

/**
 * Build PatentsView query object from search params
 */
function buildQuery(params: USPTOSearchParams): Record<string, any> {
  const conditions: any[] = []

  if (params.patentNumbers?.length) {
    conditions.push({ '_or': params.patentNumbers.map(n => ({ patent_number: n })) })
  }

  if (params.applicationNumbers?.length) {
    conditions.push({ '_or': params.applicationNumbers.map(n => ({ app_number: n })) })
  }

  if (params.assignee) {
    conditions.push({ '_contains': { assignee_organization: params.assignee } })
  }

  if (params.inventorName) {
    conditions.push({ '_contains': { inventor_last_name: params.inventorName } })
  }

  if (params.title) {
    conditions.push({ '_contains': { patent_title: params.title } })
  }

  if (params.dateFrom || params.dateTo) {
    const dateFilter: Record<string, any> = {}
    if (params.dateFrom) dateFilter['_gte'] = { patent_date: params.dateFrom }
    if (params.dateTo) dateFilter['_lte'] = { patent_date: params.dateTo }
    conditions.push(dateFilter)
  }

  if (conditions.length === 0) return {}
  if (conditions.length === 1) return conditions[0]
  return { '_and': conditions }
}

// ── USPTO ODP shared helpers ──────────────────────────────────────────────────

/** Build headers for USPTO ODP API calls */
export function odpHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (process.env.USPTO_API_KEY) h['X-Api-Key'] = process.env.USPTO_API_KEY
  return h
}

/** Normalize a patent number to bare digits, e.g. "US 11,234,567 B2" → "11234567" */
export function normalizePatentNumber(raw: string): string {
  return raw.replace(/^US\s*/i, '').replace(/[,\s]/g, '').replace(/[A-Z]\d*$/i, '').trim()
}

/** Strip heavy fields (attorney/correspondence bags) before storing in rawJsonData */
export function slimJson(data: any): any {
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
          cpcClassificationBag:            meta.cpcClassificationBag,
          publicationSequenceNumberBag:    meta.publicationSequenceNumberBag,
          publicationDateBag:              meta.publicationDateBag,
        },
        eventDataBag:        rec.eventDataBag || [],
        parentContinuityBag: rec.parentContinuityBag,
        childContinuityBag:  rec.childContinuityBag,
        documentBag:         rec.documentBag || [],
      }
    })
    return { count: data.count, patentFileWrapperDataBag: records }
  } catch { return null }
}

/**
 * Calculate USPTO maintenance fee due dates for a US utility patent
 */
export function calculateMaintenanceFees(grantDate: Date): Array<{
  feeType: string
  dueDate: Date
  gracePeriodEnd: Date
  description: string
}> {
  const fees = [
    { years: 3.5,  type: 'MAINTENANCE_3_5',  label: '3.5-year maintenance fee' },
    { years: 7.5,  type: 'MAINTENANCE_7_5',  label: '7.5-year maintenance fee' },
    { years: 11.5, type: 'MAINTENANCE_11_5', label: '11.5-year maintenance fee' },
  ]

  return fees.map(({ years, type, label }) => {
    const dueDate = new Date(grantDate)
    dueDate.setMonth(dueDate.getMonth() + Math.round(years * 12))
    
    const gracePeriodEnd = new Date(dueDate)
    gracePeriodEnd.setMonth(gracePeriodEnd.getMonth() + 6) // 6-month grace period

    return {
      feeType: type,
      dueDate,
      gracePeriodEnd,
      description: label,
    }
  })
}
