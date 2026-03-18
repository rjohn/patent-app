'use client'

import { useState, useEffect, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FamilyTree, { PatentNode } from '@/components/FamilyTree'
import { useTheme } from '@/context/theme-context'
import {
  ArrowLeft, ExternalLink, Users, Building2,
  GitBranch, DollarSign, FileText, Trash2, Loader2, X, AlertCircle, ChevronDown, ChevronUp, Plus, Activity, Calendar
} from 'lucide-react'

interface MaintenanceFee {
  id: string; feeType: string; dueDate: string
  gracePeriodEnd: string; status: string; paidAmount: number | null
}

interface Patent {
  id: string
  patentNumber: string | null
  applicationNumber: string | null
  publicationNumber: string | null
  title: string
  abstract: string | null
  status: string
  type: string
  filingDate: string | null
  publicationDate: string | null
  grantDate: string | null
  expirationDate: string | null
  inventors: string[]
  assignee: string | null
  attorney: string | null
  examiner: string | null
  artUnit: string | null
  cpcCodes: string[]
  uspcCodes: string[]
  jurisdiction: string | null
  continuationType: string | null
  family: { id: string; name: string } | null
  parentPatent: { id: string; patentNumber: string | null; title: string; status: string } | null
  childPatents: { id: string; patentNumber: string | null; title: string; status: string; continuationType: string | null }[]
  maintenanceFees: MaintenanceFee[]
  priorityClaims: { id: string; country: string; applicationNumber: string; filingDate: string | null }[]
  rawJsonData: any
  rawXmlData: string | null
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    GRANTED: 'status-granted', PENDING: 'status-pending',
    ABANDONED: 'status-abandoned', EXPIRED: 'status-expired', PUBLISHED: 'status-published',
  }
  return <span className={map[status] || 'status-badge'}>{status}</span>
}

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2.5 last:border-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <span className="text-xs text-patent-muted w-44 flex-shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm text-white flex-1 ${mono ? 'font-mono' : ''}`} style={mono ? { color: 'var(--patent-sky)' } : {}}>{value}</span>
    </div>
  )
}

function feeLabel(t: string) { return t.replace('MAINTENANCE_', '').replace('_', '.') + 'yr Maintenance' }
function feeAmount(t: string) {
  if (t.includes('3_5')) return '$800'; if (t.includes('7_5')) return '$1,850'
  if (t.includes('11_5')) return '$3,700'; return '—'
}

function FeesTab({ patent, onFeesGenerated }: {
  patent: Patent
  onFeesGenerated: (fees: MaintenanceFee[]) => void
}) {
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError]     = useState<string | null>(null)

  const generate = async (silent = false) => {
    if (!silent) setGenerating(true)
    setGenError(null)
    try {
      const res = await fetch(`/api/patents/${patent.id}/generate-fees`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { if (!silent) setGenError(data.error || 'Failed to generate fees'); return }
      onFeesGenerated(data.fees)
    } catch { if (!silent) setGenError('Network error') }
    finally { if (!silent) setGenerating(false) }
  }

  // Auto-sync on mount if fees exist but none are PAID — stale records from before event-checking was added
  useEffect(() => {
    const fees = patent.maintenanceFees
    if (fees.length > 0 && patent.rawJsonData && fees.every(f => f.status !== 'PAID')) {
      generate(true)
    }
  }, [patent.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const fees = patent.maintenanceFees

  if (fees.length === 0) return (
    <div className="card p-10 text-center space-y-4">
      <DollarSign className="w-9 h-9 mx-auto opacity-25 text-patent-muted" />
      <div>
        <p className="text-sm text-patent-muted mb-1">No maintenance fees tracked yet</p>
        <p className="text-xs text-patent-muted opacity-60">
          {patent.grantDate
            ? 'Generate fees from the grant date on record'
            : 'Refresh this patent first to pull the grant date from USPTO'}
        </p>
      </div>
      {patent.grantDate && (
        <button onClick={() => generate()} disabled={generating}
          className="btn-primary mx-auto flex items-center gap-2 px-4 py-2 text-sm">
          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
          Generate Maintenance Fees
        </button>
      )}
      {genError && <p className="text-xs" style={{ color: '#f87171' }}>{genError}</p>}
    </div>
  )

  const nextDue = fees.filter(f => f.status === 'UPCOMING' || f.status === 'DUE').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]

  return (
    <div className="space-y-4">
      {nextDue && (
        <div className="card p-4 flex items-center gap-4" style={{ borderColor: 'rgba(234,179,8,0.3)', background: 'rgba(234,179,8,0.05)' }}>
          <DollarSign className="w-5 h-5 flex-shrink-0" style={{ color: '#fbbf24' }} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium" style={{ color: '#fbbf24' }}>Next: {feeLabel(nextDue.feeType)}</p>
            <p className="text-xs text-patent-muted">Due {nextDue.dueDate?.slice(0,10)} · Grace period ends {nextDue.gracePeriodEnd?.slice(0,10)}</p>
          </div>
          <span className="text-lg font-bold" style={{ color: '#fbbf24' }}>{feeAmount(nextDue.feeType)}</span>
        </div>
      )}
      <div className="card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr><th>Fee</th><th>Due Date</th><th>Grace Period Ends</th><th>Est. Amount</th><th>Status</th></tr>
          </thead>
          <tbody>
            {fees.map(f => (
              <tr key={f.id}>
                <td className="text-sm">{feeLabel(f.feeType)}</td>
                <td className="text-sm text-patent-muted font-mono">{f.dueDate?.slice(0,10)}</td>
                <td className="text-sm text-patent-muted font-mono">{f.gracePeriodEnd?.slice(0,10)}</td>
                <td className="text-sm font-semibold" style={{ color: 'var(--patent-gold)' }}>{feeAmount(f.feeType)}</td>
                <td>
                  <span className={f.status === 'PAID' ? 'status-granted' : f.status === 'OVERDUE' ? 'status-abandoned' : f.status === 'DUE' ? 'status-published' : 'status-pending'}>
                    {f.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <button onClick={() => generate()} disabled={generating}
          className="btn-ghost text-xs flex items-center gap-1.5">
          {generating ? <Loader2 className="w-3 h-3 animate-spin" /> : <DollarSign className="w-3 h-3" />}
          Regenerate Fees
        </button>
      </div>
      {genError && <p className="text-xs text-center" style={{ color: '#f87171' }}>{genError}</p>}
    </div>
  )
}


function googlePatentsUrl(patentNumber: string | null): string | null {
  if (!patentNumber) return null
  // Normalize: remove spaces, keep letters for kind code
  // e.g. "10064263" → "US10064263B2" — we don't always have kind code so just use number
  const bare = patentNumber.replace(/,/g, '').replace(/\s/g, '')
  const withUS = bare.startsWith('US') ? bare : `US${bare}`
  return `https://patents.google.com/patent/${withUS}`
}

function ClaimItem({ number, text, forceExpand = false }: { number: number; text: string; forceExpand?: boolean }) {
  const [expanded, setExpanded] = useState(number <= 3)
  const isOpen = forceExpand || expanded
  const isIndependent = !text.match(/^claim\s+\d+/i) && number === 1 ||
    text.toLowerCase().includes('a system') || text.toLowerCase().includes('a method') ||
    text.toLowerCase().includes('an apparatus') || text.toLowerCase().includes('a device')

  return (
    <div className="rounded-lg overflow-hidden mb-2" style={{
      border: `1px solid ${isIndependent ? 'rgba(74,144,217,0.25)' : 'rgba(255,255,255,0.07)'}`,
      background: isIndependent ? 'rgba(45,90,158,0.08)' : 'rgba(255,255,255,0.02)'
    }}>
      <button onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/5 transition-colors">
        <span className="text-xs font-mono font-bold flex-shrink-0 w-16" style={{ color: isIndependent ? 'var(--patent-sky)' : 'var(--patent-muted)' }}>
          Claim {number}
        </span>
        {isIndependent && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(74,144,217,0.2)', color: 'var(--patent-sky)' }}>
            Independent
          </span>
        )}
        <span className="flex-1 text-xs text-patent-muted truncate">{text.slice(0, 80)}…</span>
        {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-patent-muted flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-patent-muted flex-shrink-0" />}
      </button>
      {isOpen && (
        <div className="px-4 pb-4 pt-1">
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.8)' }}>{text}</p>
        </div>
      )}
    </div>
  )
}

// ── Continuity Tab ────────────────────────────────────────────────────────────
interface ContinuityEntry {
  role: 'parent' | 'child'
  applicationNumber: string
  patentNumber: string | null
  continuationType: string
  filingDate: string | null
  statusDescription: string | null
  odpTitle: string | null
  relDescription: string | null
  inDb: boolean
  dbId: string | null
  dbTitle: string | null
  dbStatus: string | null
  dbPatentNumber: string | null
  dbAppNumber: string | null
}

// ── EventHistoryTab ───────────────────────────────────────────────────────────

type EventCategory = 'filing' | 'examination' | 'office_action' | 'response' |
  'publication' | 'allowance' | 'grant' | 'fee' | 'assignment' | 'correspondence' | 'status' | 'other'

interface PatentEvent {
  eventCode: string
  eventDate: string
  description: string
  category: EventCategory
}

interface PatentDoc {
  documentIdentifier: string | null
  documentCode: string
  documentCodeDescriptionText: string
  officialDate: string | null
  directionCategory: string   // 'OUTGOING' | 'INCOMING' | 'INTERNAL'
  pageCount: number | null
  downloadUrl: string | null
  mimeType: string | null
}

const CATEGORY_STYLES: Record<EventCategory, { bg: string; text: string; dot: string; label: string }> = {
  filing:          { bg: 'rgba(59,130,246,0.12)',  text: '#60a5fa', dot: '#3b82f6', label: 'Filing'        },
  examination:     { bg: 'rgba(168,85,247,0.12)',  text: '#c084fc', dot: '#a855f7', label: 'Examination'   },
  office_action:   { bg: 'rgba(239,68,68,0.12)',   text: '#f87171', dot: '#ef4444', label: 'Office Action' },
  response:        { bg: 'rgba(20,184,166,0.12)',  text: '#2dd4bf', dot: '#14b8a6', label: 'Response'      },
  publication:     { bg: 'rgba(99,102,241,0.12)',  text: '#818cf8', dot: '#6366f1', label: 'Publication'   },
  allowance:       { bg: 'rgba(34,197,94,0.12)',   text: '#4ade80', dot: '#22c55e', label: 'Allowance'     },
  grant:           { bg: 'rgba(34,197,94,0.18)',   text: '#86efac', dot: '#22c55e', label: 'Grant'         },
  fee:             { bg: 'rgba(234,179,8,0.12)',   text: '#fbbf24', dot: '#eab308', label: 'Fee'           },
  assignment:      { bg: 'rgba(251,146,60,0.12)',  text: '#fb923c', dot: '#f97316', label: 'Assignment'    },
  correspondence:  { bg: 'rgba(148,163,184,0.1)',  text: '#94a3b8', dot: '#64748b', label: 'Correspondence'},
  status:          { bg: 'rgba(239,68,68,0.08)',   text: '#fca5a5', dot: '#ef4444', label: 'Status'        },
  other:           { bg: 'rgba(148,163,184,0.07)', text: '#94a3b8', dot: '#475569', label: 'Other'         },
}

function directionLabel(dir: string) {
  if (dir === 'OUTGOING') return { label: '← USPTO',    color: '#c084fc' }
  if (dir === 'INCOMING') return { label: '→ Applicant', color: '#60a5fa' }
  if (dir === 'INTERNAL') return { label: '⚙ Internal',  color: '#94a3b8' }
  return { label: dir || '—', color: 'var(--patent-muted)' }
}

function EventHistoryTab({ patentId }: { patentId: string }) {
  const { theme } = useTheme()
  const light = theme === 'light'
  const [events, setEvents]     = useState<PatentEvent[]>([])
  const [docs, setDocs]         = useState<PatentDoc[]>([])
  const [loading, setLoading]   = useState(true)
  const [docsLoading, setDocsLoading] = useState(true)
  const [docsError, setDocsError]     = useState<string | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [filter, setFilter]     = useState<EventCategory | 'all'>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [panel, setPanel]       = useState<'events' | 'documents'>('events')
  const [docSource, setDocSource] = useState<string>('')

  useEffect(() => {
    fetch(`/api/patents/${patentId}/events`)
      .then(r => r.json())
      .then(d => {
        if (d.events) setEvents(d.events)
        else setError(d.error || 'No event data available')
      })
      .catch(() => setError('Failed to load events'))
      .finally(() => setLoading(false))
  }, [patentId])

  useEffect(() => {
    setDocsLoading(true)
    setDocsError(null)
    fetch(`/api/patents/${patentId}/documents`)
      .then(r => r.json())
      .then(d => {
        console.log('[documents]', d)
        if (d.error) { setDocsError(d.error); return }
        setDocs(d.documents || [])
        setDocSource(d.source || '')
      })
      .catch(e => { console.error('[documents error]', e); setDocsError('Failed to load documents') })
      .finally(() => setDocsLoading(false))
  }, [patentId])

  const years = Array.from(new Set(events.map(e => e.eventDate.slice(0, 4)))).sort((a, b) => b.localeCompare(a))

  const filtered = events.filter(e => {
    if (filter !== 'all' && e.category !== filter) return false
    if (yearFilter !== 'all' && !e.eventDate.startsWith(yearFilter)) return false
    return true
  })

  const byYear = filtered.reduce((acc, e) => {
    const y = e.eventDate.slice(0, 4)
    if (!acc[y]) acc[y] = []
    acc[y].push(e)
    return acc
  }, {} as Record<string, PatentEvent[]>)

  const sortedYears = Object.keys(byYear).sort((a, b) => b.localeCompare(a))
  const usedCategories = Array.from(new Set(events.map(e => e.category))) as EventCategory[]

  return (
    <div className="space-y-4">

      {/* Panel toggle */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => setPanel('events')}
          className="text-xs px-3 py-1.5 rounded-md transition-all font-medium flex items-center gap-1.5"
          style={{
            background: panel === 'events' ? 'rgba(74,144,217,0.2)' : 'transparent',
            color: panel === 'events' ? 'var(--patent-sky)' : 'var(--patent-muted)',
          }}>
          <Activity className="w-3.5 h-3.5" /> Events
          {events.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(74,144,217,0.2)', color: 'var(--patent-sky)' }}>
              {events.length}
            </span>
          )}
        </button>
        <button onClick={() => setPanel('documents')}
          className="text-xs px-3 py-1.5 rounded-md transition-all font-medium flex items-center gap-1.5"
          style={{
            background: panel === 'documents' ? 'rgba(74,144,217,0.2)' : 'transparent',
            color: panel === 'documents' ? 'var(--patent-sky)' : 'var(--patent-muted)',
          }}>
          <FileText className="w-3.5 h-3.5" /> Documents
          {docs.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full"
              style={{ background: 'rgba(74,144,217,0.2)', color: 'var(--patent-sky)' }}>
              {docs.length}
            </span>
          )}
        </button>
      </div>

      {/* ── Events panel ── */}
      {panel === 'events' && (
        <>
          {loading ? (
            <div className="card p-10 flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--patent-sky)' }} />
              <span className="text-sm text-patent-muted">Loading event history…</span>
            </div>
          ) : error ? (
            <div className="card p-10 text-center">
              <Activity className="w-8 h-8 mx-auto mb-3 opacity-25 text-patent-muted" />
              <p className="text-sm text-patent-muted">{error}</p>
              <p className="text-xs text-patent-muted mt-1 opacity-60">Event history is available for US patents imported from USPTO ODP</p>
            </div>
          ) : events.length === 0 ? (
            <div className="card p-10 text-center">
              <Activity className="w-8 h-8 mx-auto mb-3 opacity-25 text-patent-muted" />
              <p className="text-sm text-patent-muted">No event history found</p>
              <p className="text-xs text-patent-muted mt-1 opacity-60">Try refreshing this patent to pull the latest USPTO data</p>
            </div>
          ) : (
            <>
              {/* Filters */}
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <p className="text-xs text-patent-muted">{events.length} events · {sortedYears.length} years</p>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={yearFilter} onChange={e => setYearFilter(e.target.value)}
                    className="text-xs rounded-md px-2 py-1.5 focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--patent-text)' }}>
                    <option value="all">All years</option>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <div className="flex flex-wrap gap-1.5">
                    <button onClick={() => setFilter('all')}
                      className="text-xs px-2.5 py-1 rounded-full transition-colors"
                      style={{
                        background: filter === 'all' ? 'rgba(74,144,217,0.2)' : 'rgba(255,255,255,0.06)',
                        color: filter === 'all' ? 'var(--patent-sky)' : 'var(--patent-muted)',
                        border: `1px solid ${filter === 'all' ? 'rgba(74,144,217,0.4)' : 'transparent'}`,
                      }}>All</button>
                    {usedCategories.map(cat => {
                      const s = CATEGORY_STYLES[cat]
                      const active = filter === cat
                      return (
                        <button key={cat} onClick={() => setFilter(active ? 'all' : cat)}
                          className="text-xs px-2.5 py-1 rounded-full transition-colors"
                          style={{
                            background: active ? s.bg : 'rgba(255,255,255,0.05)',
                            color: active ? s.text : 'var(--patent-muted)',
                            border: `1px solid ${active ? s.dot + '55' : 'transparent'}`,
                          }}>
                          {s.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Timeline */}
              {filtered.length === 0 ? (
                <div className="card p-6 text-center text-sm text-patent-muted">No events match the selected filters</div>
              ) : (
                <div className="space-y-6">
                  {sortedYears.map(year => (
                    <div key={year}>
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded"
                          style={{ background: 'rgba(74,144,217,0.15)', color: 'var(--patent-sky)' }}>
                          {year}
                        </span>
                        <div className="flex-1 h-px" style={{ background: 'rgba(74,144,217,0.12)' }} />
                        <span className="text-xs text-patent-muted">{byYear[year].length} events</span>
                      </div>
                      <div className="relative">
                        <div className="absolute left-[7px] top-2 bottom-2 w-px"
                          style={{ background: 'rgba(74,144,217,0.15)' }} />
                        <div className="space-y-1 pl-6">
                          {byYear[year].map((event, i) => {
                            const s = CATEGORY_STYLES[event.category]
                            return (
                              <div key={i} className="relative flex items-start gap-3 group rounded-lg px-3 py-2.5 transition-colors"
                                style={{ background: 'transparent' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <div className="absolute -left-[23px] mt-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center flex-shrink-0"
                                  style={{ background: s.bg, border: `1.5px solid ${s.dot}` }}>
                                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
                                </div>
                                <span className="text-xs font-mono whitespace-nowrap mt-0.5 w-20 flex-shrink-0"
                                  style={{ color: 'rgba(148,163,184,0.7)' }}>
                                  {event.eventDate.slice(5)}
                                </span>
                                <span className="text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0 mt-0.5"
                                  style={{ background: s.bg, color: s.text }}>
                                  {s.label}
                                </span>
                                <span className="text-sm leading-snug" style={{ color: light ? '#374151' : 'rgba(255,255,255,0.8)' }}>
                                  {event.description}
                                </span>
                                <span className="text-[10px] font-mono ml-auto opacity-0 group-hover:opacity-50 transition-opacity flex-shrink-0 mt-0.5"
                                  style={{ color: 'var(--patent-muted)' }}>
                                  {event.eventCode}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── Documents panel ── */}
      {panel === 'documents' && (
        <>
          {docsLoading ? (
            <div className="card p-10 flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--patent-sky)' }} />
              <span className="text-sm text-patent-muted">Loading documents…</span>
            </div>
          ) : docs.length === 0 ? (
            <div className="card p-10 text-center">
              <FileText className="w-8 h-8 mx-auto mb-3 opacity-25 text-patent-muted" />
              <p className="text-sm text-patent-muted">No documents found</p>
              <p className="text-xs text-patent-muted mt-1 opacity-60">Refresh this patent to fetch the document list from USPTO</p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                <p className="text-xs text-patent-muted">
                  {docs.length} document{docs.length !== 1 ? 's' : ''}
                  {docSource === 'stored' && <span className="ml-2 opacity-50">· cached</span>}
                  {docSource === 'live'   && <span className="ml-2 opacity-50">· live</span>}
                </p>
                <p className="text-xs text-patent-muted">Newest first</p>
              </div>
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                {docs.map((doc, i) => {
                  const dir = directionLabel(doc.directionCategory)
                  return (
                    <div key={doc.documentIdentifier || i}
                      className="flex items-center gap-3 px-4 py-3 group transition-colors"
                      style={{ background: 'transparent' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                      {/* Date */}
                      <span className="text-xs font-mono w-24 flex-shrink-0"
                        style={{ color: 'rgba(148,163,184,0.6)' }}>
                        {doc.officialDate?.slice(0, 10) || '—'}
                      </span>

                      {/* Direction badge */}
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded flex-shrink-0"
                        style={{ background: 'rgba(255,255,255,0.05)', color: dir.color }}>
                        {dir.label}
                      </span>

                      {/* Doc code */}
                      <span className="text-[10px] font-mono flex-shrink-0"
                        style={{ color: 'var(--patent-muted)' }}>
                        {doc.documentCode}
                      </span>

                      {/* Description */}
                      <span className="text-sm flex-1 truncate" style={{ color: 'rgba(255,255,255,0.82)' }}>
                        {doc.documentCodeDescriptionText || doc.documentCode}
                      </span>

                      {/* Pages */}
                      {doc.pageCount && (
                        <span className="text-xs text-patent-muted flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                          {doc.pageCount}p
                        </span>
                      )}

                      {/* Download link — proxied through our API to attach X-Api-Key */}
                      {doc.downloadUrl ? (() => {
                        const proxyUrl = `/api/patents/${patentId}/documents/${doc.documentIdentifier || 'doc'}/download?url=${encodeURIComponent(doc.downloadUrl)}`
                        return (
                          <a href={proxyUrl} target="_blank" rel="noopener noreferrer"
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity btn-ghost p-1.5 flex items-center gap-1 text-xs"
                            style={{ color: 'var(--patent-sky)' }}
                            title="Open PDF">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )
                      })() : (
                        <span className="w-8 flex-shrink-0" />
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── FamilyTreeTab ─────────────────────────────────────────────────────────────

function FamilyTreeTab({
  patentId,
  parentPatent,
  childPatents,
}: {
  patentId: string
  parentPatent: { id: string; patentNumber: string | null; title: string; status: string } | null
  childPatents: { id: string; patentNumber: string | null; title: string; status: string; continuationType: string | null }[]
}) {
  const [tree, setTree]       = useState<PatentNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const hasRelationships      = !!parentPatent || childPatents.length > 0

  useEffect(() => {
    if (!hasRelationships) { setLoading(false); return }
    fetch(`/api/patents/${patentId}/tree`)
      .then(r => r.json())
      .then(d => {
        if (d.tree) setTree(d.tree)
        else setError(d.error || 'Could not build tree')
      })
      .catch(e => setError('Network error: ' + e.message))
      .finally(() => setLoading(false))
  }, [patentId, hasRelationships])

  if (!hasRelationships) return (
    <div className="card p-10 text-center">
      <GitBranch className="w-9 h-9 mx-auto mb-3 opacity-25 text-patent-muted" />
      <p className="text-sm text-patent-muted mb-1">No family relationships recorded</p>
      <p className="text-xs text-patent-muted opacity-60">Use the Continuity tab to import related applications from USPTO</p>
    </div>
  )

  if (loading) return (
    <div className="card p-10 flex items-center justify-center gap-3">
      <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--patent-sky)' }} />
      <span className="text-sm text-patent-muted">Building family tree…</span>
    </div>
  )

  if (error || !tree) return (
    <div className="card p-10 text-center">
      <p className="text-sm" style={{ color: '#f87171' }}>{error || 'Tree unavailable'}</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-patent-muted">
          {[parentPatent ? '1 parent' : null, childPatents.length > 0 ? `${childPatents.length} child${childPatents.length !== 1 ? 'ren' : ''}` : null]
            .filter(Boolean).join(' · ')}
        </p>
      </div>
      <FamilyTree root={tree} currentId={patentId} height={480} />
    </div>
  )
}

// ── ContinuityTab ─────────────────────────────────────────────────────────────

function ContinuityTab({ patentId, jurisdiction }: { patentId: string; jurisdiction?: string | null }) {
  const [data, setData]         = useState<{ parents: ContinuityEntry[]; children: ContinuityEntry[]; note?: string; error?: string } | null>(null)
  const [loading, setLoading]   = useState(true)
  const [importing, setImporting] = useState<string | null>(null)  // appNum being imported
  const [imported, setImported]   = useState<Set<string>>(new Set())
  const [importError, setImportError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/patents/${patentId}/continuity`)
      .then(r => r.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [patentId])

  const importApp = async (entry: ContinuityEntry) => {
    const appNum = entry.applicationNumber
    setImporting(appNum)
    setImportError(null)
    try {
      const res = await fetch('/api/patents/import-application', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationNumber: appNum,
          continuationType:  mapContType(entry.continuationType),
          // If importing a parent: no parentPatentId (it IS the parent)
          parentPatentId:    entry.role === 'child' ? patentId : undefined,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          setImported(s => { const n = new Set(Array.from(s)); n.add(appNum); return n })
        } else {
          setImportError(result.error || 'Import failed')
        }
      } else {
        setImported(s => { const n = new Set(Array.from(s)); n.add(appNum); return n })
        // If we imported a parent, link the current patent back to it
        if (entry.role === 'parent' && result.patent?.id) {
          await fetch(`/api/patents/${patentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              parentPatentId:   result.patent.id,
              continuationType: mapContType(entry.continuationType),
            }),
          })
        }
        // Refresh continuity data so inDb flags update
        fetch(`/api/patents/${patentId}/continuity`).then(r => r.json()).then(setData)
      }
    } catch { setImportError('Network error') }
    finally { setImporting(null) }
  }

  if (loading) return (
    <div className="flex justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--patent-sky)' }} />
    </div>
  )
  if (!data || data.error) return (
    <div className="card p-6 text-center text-patent-muted text-sm">{data?.error || 'Failed to load continuity data'}</div>
  )
  if (data.note && !data.parents.length && !data.children.length) return (
    <div className="card p-6 text-center text-patent-muted text-sm">{data.note}</div>
  )

  const conTypeLabel = (t: string) => t.replace(/_/g, ' ')
  const mapContType  = (t: string | null | undefined): string | undefined => {
    if (!t) return undefined
    const c = t.toUpperCase()
    if (c === 'CON' || c === 'CONTINUATION')         return 'CONTINUATION'
    if (c === 'CIP' || c === 'CONTINUATION_IN_PART') return 'CONTINUATION_IN_PART'
    if (c === 'DIV' || c === 'DIVISIONAL')           return 'DIVISIONAL'
    if (c === 'REI' || c === 'REISSUE')              return 'REISSUE'
    if (c === 'REX' || c === 'REEXAMINATION')        return 'REEXAMINATION'
    return undefined  // PRO and others are not ContinuationType enum values
  }

  const Row = ({ entry }: { entry: ContinuityEntry }) => {
    const title      = entry.dbTitle || entry.odpTitle || null
    const patentNo   = entry.dbPatentNumber || entry.patentNumber || null
    const appNo      = entry.dbAppNumber || entry.applicationNumber || null
    const displayNum = patentNo || appNo || '—'

    return (
      <div className="flex items-start gap-4 p-4 rounded-lg"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-sm font-medium" style={{ color: 'var(--patent-sky)' }}>
              {displayNum}
            </span>
            {patentNo && appNo && patentNo !== appNo && (
              <span className="font-mono text-xs text-patent-muted">App: {appNo}</span>
            )}
            <span className="text-xs px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
              {conTypeLabel(entry.continuationType)}
            </span>
            {entry.role === 'parent'
              ? <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(74,144,217,0.15)', color: 'var(--patent-sky)' }}>Parent</span>
              : <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(34,197,94,0.15)', color: '#86efac' }}>Child</span>
            }
          </div>
          {title
            ? <p className="text-sm text-white leading-snug">{title}</p>
            : entry.relDescription
              ? <p className="text-xs text-patent-muted italic">{entry.relDescription}</p>
              : <p className="text-xs italic text-patent-muted">Not in portfolio — title unavailable</p>
          }
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {entry.filingDate && <span className="text-xs text-patent-muted">Filed: {entry.filingDate}</span>}
            {entry.statusDescription && <span className="text-xs text-patent-muted">{entry.statusDescription}</span>}
          </div>
        </div>
        <div className="flex-shrink-0 flex items-center gap-2">
          {(entry.inDb || imported.has(entry.applicationNumber)) ? (
            <>
              {entry.dbStatus && <span className={`status-${entry.dbStatus.toLowerCase()} status-badge`}>{entry.dbStatus}</span>}
              {entry.dbId
                ? <Link href={`/patents/${entry.dbId}`}
                    className="btn-ghost text-xs px-2 py-1 flex items-center gap-1">
                    View <ExternalLink className="w-3 h-3" />
                  </Link>
                : <span className="text-xs px-2 py-1 rounded" style={{color:'#86efac',background:'rgba(34,197,94,0.1)'}}>Added ✓</span>
              }
            </>
          ) : (
            <button
              onClick={() => importApp(entry)}
              disabled={importing === entry.applicationNumber}
              className="btn-primary text-xs px-2 py-1 flex items-center gap-1 whitespace-nowrap">
              {importing === entry.applicationNumber
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Plus className="w-3 h-3" />}
              Add to Portfolio
            </button>
          )}
        </div>
      </div>
    )
  }

  const total = data.parents.length + data.children.length
  if (total === 0) return (
    <div className="card p-6 text-center text-patent-muted text-sm">No continuation relationships found at USPTO.</div>
  )

  return (
    <div className="space-y-5">
      {data.parents.length > 0 && (
        <div className="card p-5">
          <h3 className="section-title mb-3 flex items-center gap-2">
            <GitBranch className="w-4 h-4" /> Parent Applications ({data.parents.length})
          </h3>
          <div className="space-y-2">{data.parents.map((e, i) => <Row key={i} entry={e} />)}</div>
        </div>
      )}
      {data.children.length > 0 && (
        <div className="card p-5">
          <h3 className="section-title mb-3 flex items-center gap-2">
            <GitBranch className="w-4 h-4" /> Child Applications ({data.children.length})
          </h3>
          <p className="text-xs text-patent-muted mb-3">
            Applications that claim priority from this patent. Refresh any portfolio patent to auto-link related ones.
          </p>
          <div className="space-y-2">{data.children.map((e, i) => <Row key={i} entry={e} />)}</div>
        </div>
      )}
      {importError && (
        <p className="text-xs text-center" style={{color:'#f87171'}}>{importError}</p>
      )}
      <p className="text-xs text-patent-muted text-center">
        Source: USPTO ODP. "Add to Portfolio" fetches full application data from USPTO and saves it.
      </p>
    </div>
  )
}function ClaimsTab({ patentId }: { patentId: string }) {
  const { theme } = useTheme()
  const light = theme === 'light'
  const [claims, setClaims]     = useState<string[]>([])
  const [abstract, setAbstract] = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [message, setMessage]   = useState<string | null>(null)
  const [source, setSource]     = useState<string | null>(null)
  const [expandAll, setExpandAll] = useState(false)

  useEffect(() => {
    fetch(`/api/patents/${patentId}/claims`)
      .then(r => r.json())
      .then(d => {
        setClaims(d.claims || [])
        setAbstract(d.abstract || null)
        setMessage(d.message || null)
        setSource(d.source || null)
      })
      .catch(() => setMessage('Could not load claims'))
      .finally(() => setLoading(false))
  }, [patentId])

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 animate-spin mr-3" style={{ color: 'var(--patent-sky)' }} />
      <span className="text-patent-muted text-sm">Fetching from Google Patents...</span>
    </div>
  )

  const sourceLabel: Record<string, string> = {
    'google-patents': 'Google Patents',
    'odp-xml': 'USPTO ODP',
    'stored': 'Database',
  }

  return (
    <div className="space-y-5">
      {abstract && (
        <div className="card p-5">
          <h3 className="section-title mb-3 flex items-center gap-2">
            <FileText className="w-4 h-4" /> Abstract
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: light ? '#374151' : 'rgba(255,255,255,0.75)' }}>{abstract}</p>
        </div>
      )}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <p className="text-sm text-patent-muted">
              {claims.length > 0
                ? `${claims.length} claim${claims.length !== 1 ? 's' : ''}`
                : 'No claims retrieved'}
            </p>
            {source && (
              <span className="text-xs px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--patent-muted)' }}>
                via {sourceLabel[source] || source}
              </span>
            )}
          </div>
          {claims.length > 0 && (
            <button onClick={() => setExpandAll(e => !e)}
              className="text-xs text-patent-muted hover:text-white transition-colors">
              {expandAll ? 'Collapse all' : 'Expand all'}
            </button>
          )}
        </div>
        {claims.length === 0 ? (
          <div className="card p-8 text-center">
            <FileText className="w-8 h-8 mx-auto mb-3 opacity-30 text-patent-muted" />
            <p className="text-patent-muted text-sm">{message || 'Claims text not available'}</p>
            <p className="text-xs text-patent-muted mt-2 opacity-60">
              Try viewing on{' '}
              <a href={`https://patents.google.com/patent/US${patentId}`}
                target="_blank" rel="noopener noreferrer"
                className="underline hover:text-white">Google Patents</a>
            </p>
          </div>
        ) : (
          <div>
            {claims.map((text, i) => (
              <ClaimItem key={i} number={i + 1} text={text} forceExpand={expandAll} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}


export default function PatentDetailPage({ params }: { params: any }) {
  const resolvedParams = params instanceof Promise ? use(params) : params
  const id = resolvedParams.id as string
  const router  = useRouter()
  const { theme } = useTheme()
  const light = theme === 'light'
  const [patent, setPatent]     = useState<Patent | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [tab, setTab]           = useState<'overview' | 'claims' | 'fees' | 'family' | 'continuity' | 'history'>('overview')
  const [showDelete, setShowDelete]   = useState(false)
  const [showRawJson, setShowRawJson] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch(`/api/patents/${id}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setPatent)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/patents/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      router.push('/patents')
    } catch {
      alert('Failed to remove patent. Please try again.')
      setDeleting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--patent-sky)' }} />
    </div>
  )

  if (error || !patent) return (
    <div className="p-8">
      <Link href="/patents" className="flex items-center gap-1.5 text-sm text-patent-muted hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Patents
      </Link>
      <div className="card p-6 text-center" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
        <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: '#f87171' }} />
        <p style={{ color: '#f87171' }}>{error === '404' ? 'Patent not found' : 'Failed to load patent'}</p>
      </div>
    </div>
  )

  const p = patent
  const raw = p.rawJsonData as any
  const appMeta = raw?.patentFileWrapperDataBag?.[0]?.applicationMetaData || {}

  // Extra fields from raw ODP data
  const docketNumber      = appMeta?.docketNumber || null
  const confirmationNumber = appMeta?.applicationConfirmationNumber || null
  const customerNumber    = appMeta?.customerNumber || null
  const entityStatus      = appMeta?.entityStatusData?.businessEntityStatusCategory || null
  const firstInventorToFile = appMeta?.firstInventorToFileIndicator === 'Y' ? 'AIA (First Inventor to File)' : appMeta?.firstInventorToFileIndicator === 'N' ? 'Pre-AIA' : null
  const uspcSymbol        = appMeta?.uspcSymbolText || null
  const pubNumbers        = appMeta?.publicationSequenceNumberBag || []
  const pubDates          = appMeta?.publicationDateBag || []

  const timeline = [
    { date: p.filingDate,      label: 'Filed',     color: '#4a90d9' },
    { date: p.publicationDate, label: 'Published',  color: '#eab308' },
    { date: p.grantDate,       label: 'Granted',    color: '#22c55e' },
    { date: p.expirationDate,  label: 'Expires',    color: '#ef4444' },
  ].filter(t => t.date)

  const gPatentsUrl = googlePatentsUrl(p.patentNumber)

  // Find the granted patent PDF in the stored documentBag
  const docBag: any[] = raw?.documentBag || []
  const grantDoc = docBag.find(
    (d: any) => /grant|issue/i.test(d.documentCode || '') && d.downloadUrl && /pdf/i.test(d.mimeType || '')
  )
  const grantPdfUrl = grantDoc?.downloadUrl
    ? `/api/patents/${p.id}/documents/${grantDoc.documentIdentifier || 'grant'}/download?url=${encodeURIComponent(grantDoc.downloadUrl)}`
    : null

  return (
    <div className="p-8 animate-fade-in max-w-5xl">

      {/* Raw Data Modal */}
      {showRawJson && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setShowRawJson(false)}>
          <div className="card w-full max-w-4xl max-h-[85vh] flex flex-col"
            style={{ background: 'var(--patent-card)' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <div>
                <h3 className="font-semibold text-white">Raw {p.rawJsonData ? 'JSON' : 'XML'} Data</h3>
                <p className="text-xs text-patent-muted mt-0.5">
                  {p.rawJsonData ? 'USPTO ODP response' : 'EPO OPS biblio response'} for {p.patentNumber || p.applicationNumber}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const content = p.rawJsonData
                      ? JSON.stringify(p.rawJsonData, null, 2)
                      : p.rawXmlData as string
                    navigator.clipboard.writeText(content)
                  }}
                  className="btn-ghost text-xs flex items-center gap-1.5 px-3 py-1.5">
                  Copy
                </button>
                <button onClick={() => setShowRawJson(false)} className="btn-ghost p-1.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="overflow-auto flex-1 p-4">
              <pre className="text-xs leading-relaxed font-mono"
                style={{ color: 'rgba(148,214,255,0.85)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {p.rawJsonData
                  ? JSON.stringify(p.rawJsonData, null, 2)
                  : p.rawXmlData as string}
              </pre>
            </div>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="card p-6 max-w-md w-full" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="font-semibold text-white">Remove Patent</h2>
              <button onClick={() => setShowDelete(false)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-patent-muted mb-3">Are you sure you want to remove this patent from your portfolio?</p>
            <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <p className="font-mono text-xs" style={{ color: 'var(--patent-sky)' }}>{p.patentNumber || p.applicationNumber}</p>
              <p className="text-sm text-white mt-0.5">{p.title}</p>
            </div>
            <p className="text-xs text-patent-muted mb-5">This will also delete all maintenance fees and notes. This cannot be undone.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDelete(false)} className="btn-secondary text-sm" disabled={deleting}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="btn-ghost text-sm flex items-center gap-2"
                style={{ color: '#f87171', borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)' }}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Removing…' : 'Remove Patent'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <Link href="/patents" className="flex items-center gap-1.5 text-sm text-patent-muted hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Patents
        </Link>
      </div>

      {/* Header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="font-mono font-semibold" style={{ color: 'var(--patent-sky)' }}>
                {p.patentNumber || p.applicationNumber || '—'}
              </span>
              <StatusBadge status={p.status} />
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--patent-muted)' }}>{p.type}</span>
              {entityStatus && (
                <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--patent-muted)' }}>{entityStatus} Entity</span>
              )}
              {p.family && (
                <Link href={`/families/${p.family.id}`}
                  className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors"
                  style={{ background: 'rgba(45,90,158,0.2)', color: 'var(--patent-sky)' }}>
                  <GitBranch className="w-3 h-3" /> {p.family.name}
                </Link>
              )}
            </div>
            <h1 className="font-display text-xl font-bold text-white leading-tight">{p.title}</h1>
            <div className="flex items-center gap-4 mt-2 text-xs text-patent-muted flex-wrap">
              {p.inventors.length > 0 && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {p.inventors.join(', ')}</span>}
              {p.assignee && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {p.assignee}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {gPatentsUrl && (
              <a href={gPatentsUrl} target="_blank" rel="noopener noreferrer"
                className="btn-ghost flex items-center gap-1.5 text-xs">
                <ExternalLink className="w-3.5 h-3.5" /> Google Patents
              </a>
            )}
            {grantPdfUrl && (
              <a href={grantPdfUrl} target="_blank" rel="noopener noreferrer"
                className="btn-ghost flex items-center gap-1.5 text-xs">
                <ExternalLink className="w-3.5 h-3.5" /> Patent PDF
              </a>
            )}
            {(p.rawJsonData || p.rawXmlData) && (
              <button onClick={() => setShowRawJson(true)}
                className="btn-ghost flex items-center gap-1.5 text-xs">
                <FileText className="w-3.5 h-3.5" /> Raw Data
              </button>
            )}
            <button onClick={() => setShowDelete(true)}
              className="btn-ghost flex items-center gap-1.5 text-sm"
              style={{ color: 'rgba(239,68,68,0.7)' }}>
              <Trash2 className="w-4 h-4" /> Remove
            </button>
          </div>
        </div>

        {timeline.length > 0 && (
          <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="relative">
              <div className="absolute top-2 left-0 right-0 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
              <div className="flex justify-between relative">
                {timeline.map(t => (
                  <div key={t.label} className="flex flex-col items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 z-10"
                      style={{ background: t.color, borderColor: 'var(--patent-navy)' }} />
                    <div className="text-center">
                      <div className="text-xs font-medium text-white">{(t.date as string).slice(0,10)}</div>
                      <div className="text-[10px] text-patent-muted mt-0.5">{t.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-5 p-1 rounded-lg"
        style={{ background: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
        {(['overview', 'claims', 'fees', 'family', 'continuity', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="text-sm px-4 py-1.5 rounded-md transition-colors capitalize"
            style={tab === t
              ? { background: 'var(--p4-blue)', color: '#ffffff' }
              : { color: light ? 'rgba(0,0,0,0.45)' : 'var(--patent-muted)' }
            }>
            {t === 'fees' ? 'Maintenance Fees' : t === 'history' ? 'Event History' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {p.abstract && (
              <div className="card p-5">
                <h3 className="section-title mb-3 flex items-center gap-2"><FileText className="w-4 h-4" /> Abstract</h3>
                <p className="text-sm leading-relaxed" style={{ color: light ? '#374151' : 'rgba(255,255,255,0.75)' }}>{p.abstract}</p>
              </div>
            )}
            <div className="card p-5">
              <h3 className="section-title mb-2">Bibliographic Data</h3>
              <InfoRow label="Patent Number"          value={p.patentNumber}       mono />
              <InfoRow label="Application Number"     value={p.applicationNumber}  mono />
              <InfoRow label="Publication Number"     value={p.publicationNumber}  mono />
              <InfoRow label="Filing Date"            value={p.filingDate?.slice(0,10)} />
              <InfoRow label="Publication Date"       value={p.publicationDate?.slice(0,10)} />
              <InfoRow label="Grant Date"             value={p.grantDate?.slice(0,10)} />
              <InfoRow label="Expiration Date"        value={p.expirationDate?.slice(0,10)} />
              <InfoRow label="Assignee"               value={p.assignee} />
              <InfoRow label="Inventors"              value={p.inventors.join('; ') || null} />
              {appMeta?.examinerNameText && <InfoRow label="Examiner"    value={appMeta.examinerNameText} />}
              {appMeta?.groupArtUnitNumber && <InfoRow label="Art Unit"  value={appMeta.groupArtUnitNumber} />}
              {firstInventorToFile         && <InfoRow label="Filing Basis" value={firstInventorToFile} />}
              {entityStatus                && <InfoRow label="Entity Status" value={entityStatus} />}
              {docketNumber                && <InfoRow label="Docket Number" value={docketNumber} mono />}
              {confirmationNumber          && <InfoRow label="Confirmation No." value={String(confirmationNumber)} mono />}
              {uspcSymbol                  && <InfoRow label="USPC Symbol" value={uspcSymbol} mono />}
              {p.attorney                  && <InfoRow label="Attorney/Agent" value={p.attorney} />}
            </div>
          </div>

          <div className="space-y-5">
            {p.cpcCodes.length > 0 && (
              <div className="card p-5">
                <h3 className="section-title mb-3">CPC Classifications</h3>
                <div className="flex flex-wrap gap-1.5">
                  {p.cpcCodes.map(c => (
                    <a key={c} href={`https://www.cooperative-patent-classification.org/cpc/${c.replace(/\s+/g,'')}`}
                      target="_blank" rel="noopener noreferrer"
                      className="font-mono text-xs px-2 py-1 rounded hover:opacity-80 transition-opacity"
                      style={{ background: 'rgba(45,90,158,0.2)', color: 'rgba(74,144,217,0.8)' }} title={c}>
                      {c.trim()}
                    </a>
                  ))}
                </div>
              </div>
            )}
            {p.uspcCodes?.length > 0 && (
              <div className="card p-5">
                <h3 className="section-title mb-3">USPC Classifications</h3>
                <div className="flex flex-wrap gap-1.5">
                  {p.uspcCodes.map(c => (
                    <span key={c} className="font-mono text-xs px-2 py-1 rounded"
                      style={{ background: 'rgba(100,130,180,0.15)', color: 'rgba(168,181,204,0.8)' }}>{c}</span>
                  ))}
                </div>
              </div>
            )}
            {p.priorityClaims.length > 0 && (
              <div className="card p-5">
                <h3 className="section-title mb-3">Priority Claims</h3>
                {p.priorityClaims.map(pc => (
                  <div key={pc.id} className="text-xs space-y-0.5 pb-2 mb-2" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="font-mono" style={{ color: 'var(--patent-sky)' }}>{pc.applicationNumber}</div>
                    <div className="text-patent-muted">{pc.country} · {pc.filingDate?.slice(0,10)}</div>
                  </div>
                ))}
              </div>
            )}
            {pubDates.length > 0 && (
              <div className="card p-5">
                <h3 className="section-title mb-3">Publication History</h3>
                {pubDates.map((date: string, i: number) => (
                  <div key={i} className="text-xs flex justify-between py-1" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="font-mono" style={{ color: 'var(--patent-sky)' }}>
                      {pubNumbers[i] ? `US${pubNumbers[i]}` : '—'}
                    </span>
                    <span className="text-patent-muted">{date}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Claims */}
      {tab === 'claims' && <ClaimsTab patentId={id} />}

      {/* Fees */}
      {tab === 'fees' && <FeesTab patent={p} onFeesGenerated={(fees) => setPatent(prev => prev ? { ...prev, maintenanceFees: fees } : prev)} />}

      {/* Continuity */}
      {tab === 'continuity' && <ContinuityTab patentId={id} jurisdiction={p.jurisdiction} />}

      {/* Family */}
      {tab === 'family' && <FamilyTreeTab patentId={id} parentPatent={p.parentPatent} childPatents={p.childPatents} />}
      {tab === 'history' && <EventHistoryTab patentId={id} />}
    </div>
  )
}
