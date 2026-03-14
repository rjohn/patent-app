'use client'

import { useState, useEffect, use, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ExternalLink, Users, Building2,
  GitBranch, DollarSign, FileText, Trash2, Loader2, X, AlertCircle, ChevronDown, ChevronUp
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
  continuationType: string | null
  family: { id: string; name: string } | null
  parentPatent: { id: string; patentNumber: string | null; title: string; status: string } | null
  childPatents: { id: string; patentNumber: string | null; title: string; status: string; continuationType: string | null }[]
  maintenanceFees: MaintenanceFee[]
  priorityClaims: { id: string; country: string; applicationNumber: string; filingDate: string | null }[]
  rawJsonData: any
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

function ClaimsTab({ patentId }: { patentId: string }) {
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
          <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{abstract}</p>
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
  const [patent, setPatent]     = useState<Patent | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [tab, setTab]           = useState<'overview' | 'claims' | 'fees' | 'family'>('overview')
  const [showDelete, setShowDelete] = useState(false)
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

  return (
    <div className="p-8 animate-fade-in max-w-5xl">

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
            {p.applicationNumber && (
              <a href={`https://patentcenter.uspto.gov/applications/${p.applicationNumber}`}
                target="_blank" rel="noopener noreferrer"
                className="btn-ghost flex items-center gap-1.5 text-xs">
                <ExternalLink className="w-3.5 h-3.5" /> Patent Center
              </a>
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
      <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {(['overview', 'claims', 'fees', 'family'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`text-sm px-4 py-1.5 rounded-md transition-colors capitalize ${tab === t ? 'bg-patent-navy text-white' : 'text-patent-muted hover:text-white'}`}>
            {t === 'fees' ? 'Maintenance Fees' : t.charAt(0).toUpperCase() + t.slice(1)}
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
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{p.abstract}</p>
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
      {tab === 'fees' && (
        <div className="card overflow-hidden">
          {p.maintenanceFees.length === 0 ? (
            <div className="text-center py-12 text-patent-muted">
              <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No maintenance fees tracked for this patent</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Fee Type</th><th>Due Date</th><th>Grace Period Ends</th><th>Est. Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {p.maintenanceFees.map(f => (
                  <tr key={f.id}>
                    <td className="text-sm">{feeLabel(f.feeType)}</td>
                    <td className="text-sm text-patent-muted">{f.dueDate?.slice(0,10)}</td>
                    <td className="text-sm text-patent-muted">{f.gracePeriodEnd?.slice(0,10)}</td>
                    <td className="text-sm font-semibold text-patent-gold">{feeAmount(f.feeType)}</td>
                    <td><span className={f.status === 'PAID' ? 'status-granted' : f.status === 'OVERDUE' ? 'status-abandoned' : 'status-pending'}>{f.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Family */}
      {tab === 'family' && (
        <div className="space-y-4">
          {p.parentPatent && (
            <div className="card p-5">
              <h3 className="section-title mb-3 flex items-center gap-2"><GitBranch className="w-4 h-4" /> Parent Patent</h3>
              <Link href={`/patents/${p.parentPatent.id}`} className="flex items-center gap-3 hover:bg-white/5 rounded-lg p-2 -m-2 transition-colors">
                <span className="font-mono text-xs" style={{ color: 'var(--patent-sky)' }}>{p.parentPatent.patentNumber || '—'}</span>
                <span className="text-sm flex-1">{p.parentPatent.title}</span>
                <StatusBadge status={p.parentPatent.status} />
              </Link>
            </div>
          )}
          {p.childPatents.length > 0 && (
            <div className="card p-5">
              <h3 className="section-title mb-3 flex items-center gap-2"><GitBranch className="w-4 h-4" /> Child Patents</h3>
              <div className="space-y-2">
                {p.childPatents.map(c => (
                  <Link key={c.id} href={`/patents/${c.id}`} className="flex items-center gap-3 hover:bg-white/5 rounded-lg p-2 -m-2 transition-colors">
                    <span className="font-mono text-xs" style={{ color: 'var(--patent-sky)' }}>{c.patentNumber || '—'}</span>
                    <span className="text-sm flex-1">{c.title}</span>
                    {c.continuationType && <span className="text-xs text-patent-muted">{c.continuationType.replace(/_/g,' ')}</span>}
                    <StatusBadge status={c.status} />
                  </Link>
                ))}
              </div>
            </div>
          )}
          {!p.parentPatent && p.childPatents.length === 0 && (
            <div className="card p-8 text-center">
              <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-30 text-patent-muted" />
              <p className="text-sm text-patent-muted">No family relationships recorded for this patent</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
