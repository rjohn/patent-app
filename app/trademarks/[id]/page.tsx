'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Loader2, AlertCircle, ExternalLink, Trash2, X, FileText, Building2, Scale,
  CalendarClock, Search, Gavel, Info, CheckCircle2,
} from 'lucide-react'
import TrademarkStatusBadge from '@/components/TrademarkStatusBadge'
import { useTheme } from '@/context/theme-context'

interface TmEvent { code: string; type: string; description: string; date: string | null; number: number | null }
interface TmClass { internationalCodes: string[]; usCodes: string[]; firstUseAnywhereDate: string | null; firstUseInCommerceDate: string | null }
interface TmParty { partyType: string | null; name: string; address: string[]; city: string | null; state: string | null; country: string | null; postcode: string | null }
interface TmRecord {
  header: Record<string, string>
  flags: Record<string, boolean>
  goodsServices: { classCode: string; text: string; kind: string }[]
  otherStatements: { kind: string; typeCode: string; text: string }[]
  events: TmEvent[]
  classifications: TmClass[]
  owners: TmParty[]
  correspondent: string[]
}
interface Deadline { key: string; label: string; windowOpens: string; dueDate: string; graceEnds: string; state: string }
interface Proceeding {
  documentIdentifier: string; petitionNumber: string | null; proceedingTypeCategory: string | null
  documentTypeDescriptionText: string | null; decisionActionDate: string | null; petitionerName: string | null; documentURI: string | null
}
interface Trademark {
  id: string; serialNumber: string; registrationNumber: string | null; markText: string | null
  status: string; statusCode: string | null; statusDescription: string | null; statusDate: string | null; liveDead: string
  filingDate: string | null; publicationDate: string | null; registrationDate: string | null; renewalDate: string | null
  abandonmentDate: string | null; cancellationDate: string | null
  owner: string | null; attorney: string | null; docketNumber: string | null; internationalClasses: string[]
  source: string; notes: string | null; dataAsOf: string | null; lastCheckedAt: string | null
  rawJsonData: TmRecord | null; proceedings: Proceeding[] | null; deadlines: Deadline[]
}

type Tab = 'overview' | 'goods' | 'timeline' | 'documents' | 'proceedings'
const TAB_LABELS: Record<Tab, string> = {
  overview: 'Overview', goods: 'Goods & Services', timeline: 'Timeline', documents: 'Documents', proceedings: 'Proceedings',
}

const tsdr = (serial: string, kind: 'statusSearch' | 'documentSearch') =>
  `https://tsdr.uspto.gov/#caseNumber=${serial}&caseSearchType=US_APPLICATION&caseType=DEFAULT&searchType=${kind}`

const fmt = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)

// Event type codes from the bulk data: I = incoming (applicant → USPTO), O = outgoing (USPTO → applicant), E = e-mailed.
const EVENT_TYPE: Record<string, { label: string; color: string }> = {
  I: { label: 'Incoming', color: '#4ade80' },
  O: { label: 'Outgoing', color: '#60a5fa' },
  E: { label: 'E-mailed', color: '#60a5fa' },
  P: { label: 'Petition', color: '#facc15' },
}

const DEADLINE_STYLE: Record<string, { label: string; color: string }> = {
  filed:    { label: 'Filed',          color: '#4ade80' },
  upcoming: { label: 'Upcoming',       color: 'var(--patent-muted)' },
  open:     { label: 'Window open',    color: '#facc15' },
  grace:    { label: 'Grace period',   color: '#f87171' },
  missed:   { label: 'Missed',         color: '#f87171' },
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

function NotesCard({ tm, onSaved }: { tm: Trademark; onSaved: (notes: string | null) => void }) {
  const [value, setValue] = useState(tm.notes ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = value !== (tm.notes ?? '')
  async function save() {
    setSaving(true)
    const res = await fetch(`/api/trademarks/${tm.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes: value || null }),
    })
    setSaving(false)
    if (res.ok) { onSaved(value || null); toast.success('Notes saved') } else toast.error('Failed to save notes')
  }
  return (
    <div className="card p-5">
      <h3 className="section-title mb-3">Notes</h3>
      <textarea value={value} onChange={e => setValue(e.target.value)} rows={4} className="input w-full text-sm" placeholder="Internal notes…" />
      {dirty && (
        <button onClick={save} disabled={saving} className="btn-primary text-sm mt-2 flex items-center gap-2">
          {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
        </button>
      )}
    </div>
  )
}

export default function TrademarkDetailPage({ params }: { params: { id: string } }) {
  const { id } = params
  const router = useRouter()
  const { theme } = useTheme()
  const light = theme === 'light'
  const [tm, setTm] = useState<Trademark | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Tab>('overview')
  const [showDelete, setShowDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showRaw, setShowRaw] = useState(false)
  const [imageOk, setImageOk] = useState(true)
  const [eventQuery, setEventQuery] = useState('')
  const [eventYear, setEventYear] = useState('ALL')

  useEffect(() => {
    fetch(`/api/trademarks/${id}`)
      .then(async r => { if (!r.ok) throw new Error((await r.json()).error || 'Failed to load'); return r.json() })
      .then(setTm)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  const rec = tm?.rawJsonData ?? null
  const events = useMemo(() => rec?.events ?? [], [rec])
  const years = useMemo(() => Array.from(new Set(events.map(e => e.date?.slice(0, 4)).filter(Boolean))) as string[], [events])
  const filteredEvents = useMemo(() => events.filter(e =>
    (eventYear === 'ALL' || e.date?.startsWith(eventYear)) &&
    (!eventQuery || `${e.code} ${e.description}`.toLowerCase().includes(eventQuery.toLowerCase()))
  ), [events, eventYear, eventQuery])
  const eventsByYear = useMemo(() => {
    const m = new Map<string, TmEvent[]>()
    for (const e of filteredEvents) {
      const y = e.date?.slice(0, 4) ?? 'Undated'
      m.set(y, [...(m.get(y) ?? []), e])
    }
    return Array.from(m.entries())
  }, [filteredEvents])

  async function handleDelete() {
    setDeleting(true)
    const res = await fetch(`/api/trademarks/${id}`, { method: 'DELETE' })
    if (res.ok) { toast.success('Trademark removed'); router.push('/trademarks') }
    else { toast.error('Failed to remove trademark'); setDeleting(false) }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-patent-muted" /></div>
  if (error || !tm) return (
    <div className="p-8"><div className="flex items-center gap-2 text-red-400"><AlertCircle className="w-4 h-4" /> {error || 'Not found'}</div></div>
  )

  const proceedings = tm.proceedings ?? []
  const goodsByClass = new Map<string, { text: string; kind: string }[]>()
  for (const g of rec?.goodsServices ?? []) goodsByClass.set(g.classCode, [...(goodsByClass.get(g.classCode) ?? []), g])
  const classInfo = (code: string) => rec?.classifications.find(c => c.internationalCodes.includes(code) || c.usCodes.includes(code))

  const milestones = [
    { label: 'Filed', date: tm.filingDate, color: '#60a5fa' },
    { label: 'Published', date: tm.publicationDate, color: '#a78bfa' },
    { label: 'Registered', date: tm.registrationDate, color: '#4ade80' },
    { label: 'Renewed', date: tm.renewalDate, color: '#4ade80' },
    { label: 'Abandoned', date: tm.abandonmentDate, color: '#f87171' },
    { label: 'Cancelled', date: tm.cancellationDate, color: '#f87171' },
  ].filter(m => m.date)

  const flagLabels: [string, string][] = [
    ['opposition-pending-in', 'Opposition pending'], ['cancellation-pending-in', 'Cancellation pending'],
    ['interference-pending-in', 'Interference pending'], ['concurrent-use-proceeding-in', 'Concurrent use proceeding'],
    ['section-15-acknowledged-in', 'Section 15 (incontestable) acknowledged'], ['section-15-filed-in', 'Section 15 filed'],
    ['section-8-accepted-in', 'Section 8 accepted'], ['renewal-filed-in', 'Renewal filed'],
    ['section-2f-in', 'Section 2(f) claim'], ['supplemental-register-in', 'Supplemental Register'],
    ['standard-characters-claimed-in', 'Standard characters'], ['color-drawing-current-in', 'Color drawing'],
  ]
  const activeFlags = flagLabels.filter(([k]) => rec?.flags?.[k])
  const basis = rec ? [
    rec.flags['use-application-currently-in'] && '1(a) Use in commerce',
    rec.flags['intent-to-use-current-in'] && '1(b) Intent to use',
    rec.flags['filing-basis-current-44d-in'] && '44(d)',
    rec.flags['filing-basis-current-44e-in'] && '44(e)',
    rec.flags['filing-basis-current-66a-in'] && '66(a) Madrid',
  ].filter(Boolean).join(', ') : null

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      {showRaw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="card w-full max-w-4xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
              <h2 className="font-semibold text-white">Raw USPTO Record</h2>
              <button onClick={() => setShowRaw(false)} className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
            </div>
            <pre className="overflow-auto flex-1 p-4 text-xs leading-relaxed font-mono"
              style={{ color: 'rgba(148,214,255,0.85)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(rec, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="card p-6 max-w-md w-full" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
            <div className="flex items-start justify-between mb-4">
              <h2 className="font-semibold text-white">Remove Trademark</h2>
              <button onClick={() => setShowDelete(false)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-patent-muted mb-3">Stop tracking this trademark? Its stored USPTO data and notes will be deleted.</p>
            <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(255,255,255,0.05)' }}>
              <p className="font-mono text-xs" style={{ color: 'var(--patent-sky)' }}>{tm.serialNumber}</p>
              <p className="text-sm text-white mt-0.5">{tm.markText || '(design mark)'}</p>
            </div>
            <p className="text-xs text-patent-muted mb-5">If it&apos;s owned by Plasmology4, the daily update will add it back when it next has USPTO activity.</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDelete(false)} className="btn-secondary text-sm" disabled={deleting}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="btn-ghost text-sm flex items-center gap-2"
                style={{ color: '#f87171', borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)' }}>
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6">
        <Link href="/trademarks" className="flex items-center gap-1.5 text-sm text-patent-muted hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Trademarks
        </Link>
      </div>

      {/* Header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-5 flex-1 min-w-0">
            {imageOk && (
              <div className="w-24 h-24 rounded-lg flex-shrink-0 flex items-center justify-center overflow-hidden" style={{ background: 'white' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`https://tsdr.uspto.gov/img/${tm.serialNumber}/large`} alt={tm.markText ?? 'Mark drawing'}
                  className="max-w-full max-h-full object-contain" onError={() => setImageOk(false)} />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="font-mono font-semibold" style={{ color: 'var(--patent-sky)' }}>SN {tm.serialNumber}</span>
                {tm.registrationNumber && <span className="font-mono text-sm text-patent-muted">Reg. {tm.registrationNumber}</span>}
                <TrademarkStatusBadge status={tm.status} />
                {tm.internationalClasses.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--patent-muted)' }}>
                    Class {tm.internationalClasses.map(c => c.replace(/^0+/, '')).join(', ')}
                  </span>
                )}
                {proceedings.length > 0 && (
                  <button onClick={() => setTab('proceedings')} className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                    <Gavel className="w-3 h-3" /> {proceedings.length} proceeding{proceedings.length === 1 ? '' : 's'}
                  </button>
                )}
              </div>
              <h1 className="font-display text-2xl font-bold text-white leading-tight">{tm.markText || '(design mark)'}</h1>
              <div className="flex items-center gap-4 mt-2 text-xs text-patent-muted flex-wrap">
                {tm.owner && <span className="flex items-center gap-1"><Building2 className="w-3 h-3" /> {tm.owner}</span>}
                {tm.attorney && <span className="flex items-center gap-1"><Scale className="w-3 h-3" /> {tm.attorney}</span>}
              </div>
              {tm.statusDescription && (
                <p className="text-xs text-patent-muted mt-2">{tm.liveDead} · {tm.statusDescription}{tm.statusDate ? ` (${fmt(tm.statusDate)})` : ''}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a href={tsdr(tm.serialNumber, 'statusSearch')} target="_blank" rel="noopener noreferrer" className="btn-ghost flex items-center gap-1.5 text-xs">
              <ExternalLink className="w-3.5 h-3.5" /> TSDR
            </a>
            {rec && (
              <button onClick={() => setShowRaw(true)} className="btn-ghost flex items-center gap-1.5 text-xs">
                <FileText className="w-3.5 h-3.5" /> Raw Data
              </button>
            )}
            <button onClick={() => setShowDelete(true)} className="btn-ghost flex items-center gap-1.5 text-sm" style={{ color: 'rgba(239,68,68,0.7)' }}>
              <Trash2 className="w-4 h-4" /> Remove
            </button>
          </div>
        </div>

        {milestones.length > 1 && (
          <div className="mt-6 pt-5" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="relative">
              <div className="absolute top-2 left-0 right-0 h-px" style={{ background: 'rgba(255,255,255,0.1)' }} />
              <div className="flex justify-between relative">
                {milestones.map(m => (
                  <div key={m.label} className="flex flex-col items-center gap-2">
                    <div className="w-4 h-4 rounded-full border-2 z-10" style={{ background: m.color, borderColor: 'var(--patent-navy)' }} />
                    <div className="text-center">
                      <div className="text-xs font-medium text-white">{fmt(m.date)}</div>
                      <div className="text-[10px] text-patent-muted mt-0.5">{m.label}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {!rec && (
        <div className="card p-4 mb-6 flex gap-3 text-sm" style={{ borderColor: 'rgba(234,179,8,0.3)' }}>
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#facc15' }} />
          <p className="text-patent-muted">
            No USPTO data yet. It fills in automatically the next time this mark appears in USPTO&apos;s daily file,
            or run the backfill import for serial <span className="font-mono">{tm.serialNumber}</span> (see Add Trademark for the command).
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-5 p-1 rounded-lg" style={{ background: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} className="text-sm px-4 py-1.5 rounded-md transition-colors"
            style={tab === t ? { background: 'var(--p4-blue)', color: '#ffffff' } : { color: light ? 'rgba(0,0,0,0.45)' : 'var(--patent-muted)' }}>
            {TAB_LABELS[t]}
            {t === 'timeline' && events.length > 0 && <span className="ml-1.5 text-xs opacity-60">{events.length}</span>}
            {t === 'proceedings' && proceedings.length > 0 && <span className="ml-1.5 text-xs opacity-60">{proceedings.length}</span>}
          </button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            <div className="card p-5">
              <h3 className="section-title mb-2">Registration Data</h3>
              <InfoRow label="Mark" value={tm.markText} />
              <InfoRow label="Serial Number" value={tm.serialNumber} mono />
              <InfoRow label="Registration Number" value={tm.registrationNumber} mono />
              <InfoRow label="Status" value={tm.statusDescription && `${tm.statusDescription} (${tm.statusCode})`} />
              <InfoRow label="Status Date" value={fmt(tm.statusDate)} />
              <InfoRow label="Filing Date" value={fmt(tm.filingDate)} />
              <InfoRow label="Published for Opposition" value={fmt(tm.publicationDate)} />
              <InfoRow label="Registration Date" value={fmt(tm.registrationDate)} />
              <InfoRow label="Last Renewal" value={fmt(tm.renewalDate)} />
              <InfoRow label="Abandoned" value={fmt(tm.abandonmentDate)} />
              <InfoRow label="Cancelled" value={fmt(tm.cancellationDate)} />
              <InfoRow label="Filing Basis" value={basis} />
              <InfoRow label="Attorney" value={tm.attorney} />
              <InfoRow label="Attorney Docket" value={tm.docketNumber} mono />
              <InfoRow label="Correspondent" value={rec?.correspondent?.length ? rec.correspondent.join(', ') : null} />
            </div>

            {rec && rec.owners.length > 0 && (
              <div className="card p-5">
                <h3 className="section-title mb-2">Owners</h3>
                {rec.owners.map((o, i) => (
                  <div key={i} className="py-2.5 last:border-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="text-sm text-white">{o.name}</div>
                    <div className="text-xs text-patent-muted">
                      {[...o.address, [o.city, o.state, o.postcode].filter(Boolean).join(' '), o.country].filter(Boolean).join(', ')}
                      {o.partyType && <span className="ml-2 opacity-60">party type {o.partyType}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {rec && rec.otherStatements.length > 0 && (
              <div className="card p-5">
                <h3 className="section-title mb-2">Statements</h3>
                {rec.otherStatements.map((s, i) => (
                  <InfoRow key={i} label={s.kind} value={s.text} />
                ))}
              </div>
            )}

            <NotesCard tm={tm} onSaved={notes => setTm({ ...tm, notes })} />
          </div>

          <div className="space-y-5">
            <div className="card p-5">
              <h3 className="section-title mb-3 flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Maintenance Deadlines</h3>
              {tm.deadlines.length === 0 ? (
                <p className="text-sm text-patent-muted">
                  {tm.status === 'REGISTERED' ? 'No registration date on record.' : 'Deadlines apply once the mark is registered.'}
                </p>
              ) : tm.deadlines.map(d => {
                const st = DEADLINE_STYLE[d.state] ?? DEADLINE_STYLE.upcoming
                return (
                  <div key={d.key} className="py-2.5 last:border-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-white">{d.label}</span>
                      <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: st.color }}>{st.label}</span>
                    </div>
                    <div className="text-xs text-patent-muted mt-0.5">
                      Window {d.windowOpens} → <span className="text-white">{d.dueDate}</span> · grace to {d.graceEnds}
                    </div>
                  </div>
                )
              })}
              <p className="text-[10px] text-patent-muted mt-3">
                Calculated from the registration date. Confirm with counsel before relying on these dates.
              </p>
            </div>

            {activeFlags.length > 0 && (
              <div className="card p-5">
                <h3 className="section-title mb-3">Indicators</h3>
                <div className="flex flex-wrap gap-1.5">
                  {activeFlags.map(([k, label]) => (
                    <span key={k} className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1"
                      style={/pending/i.test(label) ? { background: 'rgba(239,68,68,0.15)', color: '#f87171' } : { background: 'rgba(255,255,255,0.06)', color: 'var(--patent-muted)' }}>
                      <CheckCircle2 className="w-3 h-3" /> {label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="card p-5 text-xs text-patent-muted space-y-1">
              <div>Source: {tm.source === 'AUTO' ? 'Auto-discovered (daily file)' : tm.source === 'IMPORTED' ? 'Backfill import' : 'Added manually'}</div>
              <div>USPTO data as of: {fmt(tm.dataAsOf) ?? '—'}</div>
              <div>Last checked: {tm.lastCheckedAt ? new Date(tm.lastCheckedAt).toLocaleString() : '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Goods & Services */}
      {tab === 'goods' && (
        <div className="space-y-4">
          {goodsByClass.size === 0 ? (
            <div className="card p-8 text-center text-sm text-patent-muted">No goods/services on record.</div>
          ) : Array.from(goodsByClass.entries()).map(([code, items]) => {
            const ci = classInfo(code)
            return (
              <div key={code} className="card p-5">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <h3 className="section-title">Class {code.replace(/^0+/, '')}</h3>
                  {ci && (
                    <div className="text-xs text-patent-muted flex gap-4">
                      {ci.usCodes.length > 0 && <span>US classes {ci.usCodes.map(c => c.replace(/^0+/, '')).join(', ')}</span>}
                      {ci.firstUseAnywhereDate && <span>First use {ci.firstUseAnywhereDate}</span>}
                      {ci.firstUseInCommerceDate && <span>In commerce {ci.firstUseInCommerceDate}</span>}
                    </div>
                  )}
                </div>
                {items.map((g, i) => (
                  <p key={i} className="text-sm leading-relaxed" style={{ color: light ? '#374151' : 'rgba(255,255,255,0.8)' }}>
                    {g.kind === 'less-goods' && <span className="text-xs text-patent-muted mr-1">[deleted goods]</span>}
                    {g.text}
                  </p>
                ))}
              </div>
            )
          })}
          <p className="text-xs text-patent-muted">
            USPTO notation: ((double parentheses)) = goods deleted after registration · *asterisks* = added wording · [brackets] = deleted goods.
          </p>
        </div>
      )}

      {/* Timeline */}
      {tab === 'timeline' && (
        <div>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-patent-muted" />
              <input value={eventQuery} onChange={e => setEventQuery(e.target.value)} placeholder="Filter events…" className="input w-full pl-9 text-sm" />
            </div>
            <select value={eventYear} onChange={e => setEventYear(e.target.value)} className="input text-sm">
              <option value="ALL">All years</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span className="text-xs text-patent-muted">{filteredEvents.length} of {events.length} events</span>
          </div>
          {eventsByYear.length === 0 ? (
            <div className="card p-8 text-center text-sm text-patent-muted">No events{events.length ? ' match your filters' : ' on record'}.</div>
          ) : eventsByYear.map(([year, list]) => (
            <div key={year} className="mb-5">
              <div className="label mb-2">{year}</div>
              <div className="card divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                {list.map((e, i) => {
                  const t = EVENT_TYPE[e.type]
                  return (
                    <div key={`${e.number}-${i}`} className="flex items-start gap-4 px-4 py-2.5" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      <span className="text-xs text-patent-muted font-mono w-20 flex-shrink-0 pt-0.5">{e.date?.slice(5) ?? '—'}</span>
                      <span className="text-xs font-mono w-12 flex-shrink-0 pt-0.5" style={{ color: 'var(--patent-sky)' }}>{e.code}</span>
                      <span className="text-sm text-white flex-1">{e.description}</span>
                      {t && <span className="text-[10px] flex-shrink-0 pt-1" style={{ color: t.color }}>{t.label}</span>}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Documents */}
      {tab === 'documents' && (
        <div className="card p-8 text-center">
          <FileText className="w-10 h-10 text-patent-muted mx-auto mb-4" />
          <p className="text-white/80 font-medium mb-1">Documents are on USPTO TSDR</p>
          <p className="text-sm text-patent-muted mb-5 max-w-md mx-auto">
            USPTO&apos;s bulk data doesn&apos;t include the file-wrapper documents (office actions, specimens, certificates).
            Open them directly on TSDR.
          </p>
          <a href={tsdr(tm.serialNumber, 'documentSearch')} target="_blank" rel="noopener noreferrer" className="btn-primary inline-flex items-center gap-2 text-sm">
            <ExternalLink className="w-4 h-4" /> Open documents on TSDR
          </a>
        </div>
      )}

      {/* Proceedings */}
      {tab === 'proceedings' && (
        proceedings.length === 0 ? (
          <div className="card p-8 text-center">
            <Gavel className="w-10 h-10 text-patent-muted mx-auto mb-4" />
            <p className="text-white/80 font-medium mb-1">No proceedings</p>
            <p className="text-sm text-patent-muted max-w-md mx-auto">
              No expungement, reexamination or TTAB records for this mark in USPTO&apos;s Trademark Decisions &amp; Proceedings data.
              Checked daily.
            </p>
          </div>
        ) : (
          <div className="card divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
            {proceedings.map(p => (
              <div key={p.documentIdentifier} className="px-5 py-4 flex items-start gap-4" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                <Gavel className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: '#f87171' }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white">{p.documentTypeDescriptionText ?? p.proceedingTypeCategory}</div>
                  <div className="text-xs text-patent-muted mt-0.5">
                    {[p.proceedingTypeCategory, p.petitionNumber && `Petition ${p.petitionNumber}`, p.petitionerName && `Petitioner: ${p.petitionerName}`, p.decisionActionDate]
                      .filter(Boolean).join(' · ')}
                  </div>
                </div>
                {p.documentURI && (
                  <a href={p.documentURI} target="_blank" rel="noopener noreferrer" className="btn-ghost text-xs flex items-center gap-1">
                    <ExternalLink className="w-3.5 h-3.5" /> View
                  </a>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
