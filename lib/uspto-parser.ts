import { parseStringPromise } from 'xml2js'
import { PatentStatus, PatentType, ContinuationType } from '@prisma/client'

export interface ParsedPatent {
  applicationNumber?: string
  publicationNumber?: string
  patentNumber?: string
  title: string
  abstract?: string
  status: PatentStatus
  type: PatentType
  filingDate?: Date
  publicationDate?: Date
  grantDate?: Date
  expirationDate?: Date
  priorityDate?: Date
  inventors: string[]
  assignee?: string
  cpcCodes: string[]
  uspcCodes: string[]
  continuationType?: ContinuationType
  parentApplicationNumber?: string
  rawXmlData?: string
}

export interface ParseResult {
  patents: ParsedPatent[]
  errors: string[]
  totalFound: number
}

/**
 * Parse USPTO XML bulk data format
 * Handles both single patent XML and bulk XML files
 */
export async function parseUSPTOXml(xmlContent: string): Promise<ParseResult> {
  const errors: string[] = []
  const patents: ParsedPatent[] = []

  try {
    const parsed = await parseStringPromise(xmlContent, {
      explicitArray: false,
      ignoreAttrs: false,
      trim: true,
    })

    // Handle bulk XML with multiple patents
    const root = parsed['us-patent-grant'] || parsed['patent-application'] || parsed

    if (Array.isArray(root)) {
      for (const patentXml of root) {
        try {
          const patent = extractPatentData(patentXml, xmlContent)
          patents.push(patent)
        } catch (e) {
          errors.push(`Failed to parse patent: ${e instanceof Error ? e.message : 'Unknown error'}`)
        }
      }
    } else {
      try {
        const patent = extractPatentData(root, xmlContent)
        patents.push(patent)
      } catch (e) {
        errors.push(`Failed to parse patent: ${e instanceof Error ? e.message : 'Unknown error'}`)
      }
    }
  } catch (e) {
    errors.push(`XML parse error: ${e instanceof Error ? e.message : 'Unknown error'}`)
  }

  return { patents, errors, totalFound: patents.length }
}

function extractPatentData(data: any, rawXml: string): ParsedPatent {
  // Navigate USPTO XML structure
  const biblio = data?.['us-bibliographic-data-grant'] || 
                 data?.['us-bibliographic-data-application'] ||
                 data?.['bibliographic-data'] || 
                 data || {}

  // Application/patent numbers
  const docId = biblio?.['publication-reference']?.['document-id'] || {}
  const appRef = biblio?.['application-reference']?.['document-id'] || {}

  const patentNumber = extractText(docId?.['doc-number'])
  const applicationNumber = extractText(appRef?.['doc-number'])

  // Title
  const title = extractText(biblio?.['invention-title']) || 'Unknown Title'

  // Abstract
  const abstract = extractText(data?.abstract?.['p']) || 
                   extractText(data?.abstract) || undefined

  // Dates
  const filingDate = parseUSPTODate(extractText(appRef?.['date']) || extractText(biblio?.['application-reference']?.date))
  const pubDate = parseUSPTODate(extractText(docId?.['date']))
  const grantDate = pubDate // For granted patents, publication date is grant date

  // Inventors
  const inventors = extractInventors(biblio?.parties?.inventors || biblio?.inventors)

  // Assignee
  const assignee = extractAssignee(biblio?.parties?.assignees || biblio?.assignees)

  // CPC Classifications
  const cpcCodes = extractCPCCodes(biblio?.['classifications-cpc'] || biblio?.['classification-cpc'])

  // USPC Classifications  
  const uspcCodes = extractUSPCCodes(biblio?.['classification-national'])

  // Patent type
  const type = determinePatentType(biblio?.['application-reference']?.['$']?.['appl-type'] || '')

  // Continuation relationships
  const relatedDocs = biblio?.['us-related-documents'] || biblio?.['related-documents']
  const { continuationType, parentApplicationNumber } = extractContinuationInfo(relatedDocs)

  return {
    applicationNumber,
    publicationNumber: patentNumber,
    patentNumber,
    title,
    abstract,
    status: PatentStatus.GRANTED,
    type,
    filingDate: filingDate || undefined,
    publicationDate: pubDate || undefined,
    grantDate: grantDate || undefined,
    inventors,
    assignee,
    cpcCodes,
    uspcCodes,
    continuationType: continuationType || undefined,
    parentApplicationNumber: parentApplicationNumber || undefined,
    rawXmlData: rawXml.substring(0, 50000), // Truncate for storage
  }
}

function extractText(value: any): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'object' && value._) return value._.trim()
  if (Array.isArray(value)) return extractText(value[0])
  return undefined
}

function parseUSPTODate(dateStr?: string): Date | null {
  if (!dateStr) return null
  // USPTO dates are in YYYYMMDD format
  const clean = dateStr.replace(/\D/g, '')
  if (clean.length === 8) {
    const year = parseInt(clean.substring(0, 4))
    const month = parseInt(clean.substring(4, 6)) - 1
    const day = parseInt(clean.substring(6, 8))
    const date = new Date(year, month, day)
    return isNaN(date.getTime()) ? null : date
  }
  return null
}

function extractInventors(inventors: any): string[] {
  if (!inventors) return []
  const list = inventors?.inventor || inventors
  const arr = Array.isArray(list) ? list : [list]
  return arr.map((inv: any) => {
    const name = inv?.['inventor-name'] || inv?.name || inv
    const first = extractText(name?.['given-name'] || name?.first)
    const last = extractText(name?.['family-name'] || name?.last)
    return [first, last].filter(Boolean).join(' ')
  }).filter(Boolean)
}

function extractAssignee(assignees: any): string | undefined {
  if (!assignees) return undefined
  const list = assignees?.assignee || assignees
  const first = Array.isArray(list) ? list[0] : list
  return extractText(first?.['assignee-name'] || first?.orgname || first?.name) || undefined
}

function extractCPCCodes(cpc: any): string[] {
  if (!cpc) return []
  const classifications = cpc?.['classification-cpc'] || cpc
  const arr = Array.isArray(classifications) ? classifications : [classifications]
  return arr.map((c: any) => {
    const section = extractText(c?.section)
    const cls = extractText(c?.class)
    const subclass = extractText(c?.subclass)
    const group = extractText(c?.['main-group'])
    const subgroup = extractText(c?.subgroup)
    return [section, cls, subclass, group, subgroup ? `/${subgroup}` : ''].filter(Boolean).join('')
  }).filter(Boolean)
}

function extractUSPCCodes(classification: any): string[] {
  if (!classification) return []
  const main = extractText(classification?.['main-classification'])
  const further = classification?.['further-classification']
  const furtherArr = Array.isArray(further) ? further : further ? [further] : []
  return [main, ...furtherArr.map(extractText)].filter(Boolean) as string[]
}

function determinePatentType(applType: string): PatentType {
  const t = applType.toLowerCase()
  if (t.includes('design')) return PatentType.DESIGN
  if (t.includes('plant')) return PatentType.PLANT
  if (t.includes('provisional')) return PatentType.PROVISIONAL
  if (t.includes('pct')) return PatentType.PCT
  return PatentType.UTILITY
}

function extractContinuationInfo(relatedDocs: any): { 
  continuationType?: ContinuationType, 
  parentApplicationNumber?: string 
} {
  if (!relatedDocs) return {}
  
  const mappings: Record<string, ContinuationType> = {
    'continuation': ContinuationType.CONTINUATION,
    'continuation-in-part': ContinuationType.CONTINUATION_IN_PART,
    'divisional': ContinuationType.DIVISIONAL,
    'reissue': ContinuationType.REISSUE,
    'reexamination': ContinuationType.REEXAMINATION,
  }

  for (const [key, value] of Object.entries(mappings)) {
    const rel = relatedDocs?.[key]
    if (rel) {
      const docId = rel?.['document-id']
      const parentAppNum = extractText(docId?.['doc-number'])
      return { continuationType: value, parentApplicationNumber: parentAppNum }
    }
  }

  return {}
}

/**
 * Parse USPTO JSON format (PatentsView API response)
 */
export function parseUSPTOJson(jsonData: any): ParseResult {
  const errors: string[] = []
  const patents: ParsedPatent[] = []

  try {
    const patentList = jsonData?.patents || jsonData?.data || (Array.isArray(jsonData) ? jsonData : [jsonData])

    for (const p of patentList) {
      try {
        patents.push({
          patentNumber: p.patent_number || p.id,
          applicationNumber: p.application_number,
          title: p.patent_title || p.title || 'Unknown',
          abstract: p.patent_abstract || p.abstract,
          status: mapUSPTOStatus(p.patent_type),
          type: mapUSPTOType(p.patent_type),
          filingDate: p.app_date ? new Date(p.app_date) : undefined,
          grantDate: p.patent_date ? new Date(p.patent_date) : undefined,
          inventors: (p.inventors || []).map((inv: any) => 
            `${inv.inventor_first_name || ''} ${inv.inventor_last_name || ''}`.trim()
          ),
          assignee: p.assignees?.[0]?.assignee_organization || 
                    `${p.assignees?.[0]?.assignee_first_name || ''} ${p.assignees?.[0]?.assignee_last_name || ''}`.trim() || 
                    undefined,
          cpcCodes: (p.cpcs || []).map((c: any) => c.cpc_subgroup_id).filter(Boolean),
          uspcCodes: (p.uspcs || []).map((u: any) => u.uspc_mainclass_id).filter(Boolean),
        })
      } catch (e) {
        errors.push(`Failed to parse patent ${p.patent_number}: ${e instanceof Error ? e.message : 'Unknown'}`)
      }
    }
  } catch (e) {
    errors.push(`JSON parse error: ${e instanceof Error ? e.message : 'Unknown error'}`)
  }

  return { patents, errors, totalFound: patents.length }
}

function mapUSPTOStatus(type: string): PatentStatus {
  if (!type) return PatentStatus.GRANTED
  return PatentStatus.GRANTED
}

function mapUSPTOType(type: string): PatentType {
  const t = (type || '').toLowerCase()
  if (t.includes('design')) return PatentType.DESIGN
  if (t.includes('plant')) return PatentType.PLANT
  return PatentType.UTILITY
}
