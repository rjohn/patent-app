'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Search, SlidersHorizontal, ChevronDown, FileText, ExternalLink, Loader2, AlertCircle, Trash2, X } from 'lucide-react'

interface Patent {
  id: string
  patentNumber: string | null
  epNumber: string | null
  publicationNumber: string | null
  jurisdiction: string | null
  applicationNumber: string | null
  title: string
  status: string
  type: string
  filingDate: string | null
  grantDate: string | null
  inventors: string[]
  assignee: string | null
  cpcCodes: string[]
  family: { id: string; name: string } | null
}

interface ApiResponse {
  patents: Patent[]
  total: number
  page: number
  pageSize: number
}


// Flag emojis for common patent jurisdictions
const JURISDICTION_FLAGS: Record<string, { flag: string; label: string }> = {
  US: { flag: '🇺🇸', label: 'United States' },
  EP: { flag: '🇪🇺', label: 'European Patent' },
  GB: { flag: '🇬🇧', label: 'United Kingdom' },
  DE: { flag: '🇩🇪', label: 'Germany' },
  FR: { flag: '🇫🇷', label: 'France' },
  JP: { flag: '🇯🇵', label: 'Japan' },
  CN: { flag: '🇨🇳', label: 'China' },
  KR: { flag: '🇰🇷', label: 'South Korea' },
  CA: { flag: '🇨🇦', label: 'Canada' },
  AU: { flag: '🇦🇺', label: 'Australia' },
  IN: { flag: '🇮🇳', label: 'India' },
}

function JurisdictionBadge({ jurisdiction }: { jurisdiction: string | null }) {
  const j = (jurisdiction || 'US').toUpperCase()
  const info = JURISDICTION_FLAGS[j] || { flag: '🌐', label: j }
  return (
    <span title={info.label} className="flex items-center gap-1.5 text-xs whitespace-nowrap"
      style={{ color: 'var(--patent-muted)' }}>
      <span className="text-base leading-none">{info.flag}</span>
      <span>{j}</span>
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    GRANTED: 'status-granted', PENDING: 'status-pending',
    ABANDONED: 'status-abandoned', EXPIRED: 'status-expired', PUBLISHED: 'status-published',
  }
  return <span className={map[status] || 'status-badge'}>{status}</span>
}

function DeleteModal({ patent, onConfirm, onCancel, deleting }: {
  patent: Patent; onConfirm: () => void; onCancel: () => void; deleting: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="card p-6 max-w-md w-full" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
        <div className="flex items-start justify-between mb-4">
          <h2 className="font-semibold text-white">Remove Patent</h2>
          <button onClick={onCancel} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-patent-muted mb-2">
          Are you sure you want to remove this patent from your portfolio?
        </p>
        <div className="rounded-lg p-3 mb-5" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <p className="font-mono text-xs" style={{ color: 'var(--patent-sky)' }}>
            {patent.patentNumber || patent.applicationNumber || '—'}
          </p>
          <p className="text-sm text-white mt-0.5">{patent.title}</p>
        </div>
        <p className="text-xs text-patent-muted mb-5">
          This will also delete all associated maintenance fees and notes. This action cannot be undone.
        </p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="btn-secondary text-sm" disabled={deleting}>Cancel</button>
          <button onClick={onConfirm} disabled={deleting}
            className="btn-ghost text-sm flex items-center gap-2"
            style={{ color: '#f87171', borderColor: 'rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)' }}>
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? 'Removing…' : 'Remove Patent'}
          </button>
        </div>
      </div>
    </div>
  )
}

const STATUS_OPTIONS = ['ALL', 'GRANTED', 'PENDING', 'ABANDONED', 'EXPIRED', 'PUBLISHED']
const TYPE_OPTIONS   = ['ALL', 'UTILITY', 'DESIGN', 'PLANT', 'PROVISIONAL', 'PCT']

export default function PatentsPage() {
  const [patents, setPatents]       = useState<Patent[]>([])
  const [total, setTotal]           = useState(0)
  const [page, setPage]             = useState(1)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  const [search, setSearch]         = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatus]   = useState('ALL')
  const [typeFilter, setType]       = useState('ALL')
  const [showFilters, setShowFilters] = useState(false)
  const [sortBy, setSortBy]         = useState('filingDate')
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('desc')

  const [deleteTarget, setDeleteTarget] = useState<Patent | null>(null)
  const [deleting, setDeleting]         = useState(false)

  const PAGE_SIZE = 25

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1) }, 350)
    return () => clearTimeout(t)
  }, [search])

  const fetchPatents = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({
        page: String(page), pageSize: String(PAGE_SIZE), sortBy, sortDir,
        ...(debouncedSearch        && { q:      debouncedSearch }),
        ...(statusFilter !== 'ALL' && { status: statusFilter }),
        ...(typeFilter   !== 'ALL' && { type:   typeFilter }),
      })
      const res  = await fetch(`/api/patents?${params}`)
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data: ApiResponse = await res.json()
      setPatents(data.patents)
      setTotal(data.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load patents')
    } finally {
      setLoading(false)
    }
  }, [page, debouncedSearch, statusFilter, typeFilter, sortBy, sortDir])

  useEffect(() => { fetchPatents() }, [fetchPatents])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/patents/${deleteTarget.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Delete failed')
      setDeleteTarget(null)
      fetchPatents()
    } catch {
      alert('Failed to remove patent. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  const toggleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortBy(col); setSortDir('desc') }
    setPage(1)
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)
  const hasFilters = statusFilter !== 'ALL' || typeFilter !== 'ALL' || debouncedSearch

  return (
    <div className="p-8 animate-fade-in">
      {deleteTarget && (
        <DeleteModal
          patent={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
          deleting={deleting}
        />
      )}

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="page-title">Patents</h1>
          <p className="text-muted mt-1">
            {loading ? 'Loading…' : `${total} patent${total !== 1 ? 's' : ''} in portfolio`}
          </p>
        </div>
        <Link href="/lookup" className="btn-primary text-sm">+ Add Patent</Link>
      </div>

      {/* Search & Filter */}
      <div className="card p-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patent-muted pointer-events-none" />
            <input type="text" placeholder="Search by title, patent number, inventor, CPC code…"
              value={search} onChange={e => setSearch(e.target.value)} className="input w-full pl-9" />
          </div>
          <button onClick={() => setShowFilters(v => !v)}
            className={`btn-secondary flex items-center gap-2 text-sm ${showFilters ? 'border-patent-sky/50' : ''}`}>
            <SlidersHorizontal className="w-4 h-4" /> Filters
            {(statusFilter !== 'ALL' || typeFilter !== 'ALL') && (
              <span className="w-2 h-2 rounded-full" style={{ background: 'var(--patent-sky)' }} />
            )}
          </button>
        </div>
        {showFilters && (
          <div className="grid grid-cols-2 gap-4 mt-4 pt-4 animate-slide-up" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div>
              <label className="label mb-1.5 block">Status</label>
              <select value={statusFilter} onChange={e => { setStatus(e.target.value); setPage(1) }} className="input w-full">
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="label mb-1.5 block">Type</label>
              <select value={typeFilter} onChange={e => { setType(e.target.value); setPage(1) }} className="input w-full">
                {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Sort bar */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-muted text-sm">
          {loading
            ? <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…</span>
            : <>{total} result{total !== 1 ? 's' : ''}{hasFilters ? ' (filtered)' : ''}</>}
        </p>
        <div className="flex items-center gap-2 text-xs text-patent-muted">
          Sort by:
          {([['patentNumber','Number'],['title','Title'],['filingDate','Filed'],['grantDate','Granted']] as const).map(([col, label]) => (
            <button key={col} onClick={() => toggleSort(col)}
              className={`flex items-center gap-0.5 hover:text-white transition-colors ${sortBy === col ? 'text-patent-sky' : ''}`}>
              {label}
              {sortBy === col && <ChevronDown className={`w-3 h-3 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="card p-4 mb-4 flex items-center gap-3" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
          <button onClick={fetchPatents} className="btn-ghost text-sm ml-auto">Retry</button>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading && patents.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--patent-sky)' }} />
          </div>
        ) : patents.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 mx-auto mb-3 text-patent-muted opacity-40" />
            {hasFilters ? (
              <>
                <p className="text-patent-muted mb-2">No patents match your search</p>
                <button onClick={() => { setSearch(''); setStatus('ALL'); setType('ALL') }} className="btn-ghost text-sm">Clear filters</button>
              </>
            ) : (
              <>
                <p className="text-patent-muted mb-2">No patents in your portfolio yet</p>
                <Link href="/lookup" className="btn-primary text-sm inline-flex">Add your first patent</Link>
              </>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Patent / App No.</th><th>Title</th><th>Country</th><th>Family</th>
                <th>Inventors</th><th>Filed</th><th>Granted</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {patents.map(p => (
                <tr key={p.id} className="group cursor-pointer" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
                  <td>
                    <div className="mono text-xs leading-tight">
                      {p.jurisdiction === 'EP'
                        ? (p.epNumber ? `EP${p.epNumber}` : p.publicationNumber || '—')
                        : (p.patentNumber || p.applicationNumber || '—')}
                    </div>
                    {p.jurisdiction !== 'EP' && p.patentNumber && p.applicationNumber && (
                      <div className="text-[10px] mt-0.5" style={{ color: 'var(--patent-muted)' }}>{p.applicationNumber}</div>
                    )}
                  </td>
                  <td>
                    <JurisdictionBadge jurisdiction={p.jurisdiction} />
                  </td>
                  <td className="max-w-xs">
                    <Link href={`/patents/${p.id}`} className="text-white hover:text-patent-sky transition-colors font-medium line-clamp-2 text-sm">
                      {p.title}
                    </Link>
                    {p.cpcCodes.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {p.cpcCodes.slice(0, 2).map(c => (
                          <span key={c} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                            style={{ background: 'rgba(45,90,158,0.2)', color: 'rgba(74,144,217,0.7)' }}>{c}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td>
                    {p.family
                      ? <Link href={`/families/${p.family.id}`} className="text-xs px-2 py-1 rounded transition-colors"
                          style={{ background: 'rgba(45,90,158,0.2)', color: 'var(--patent-sky)' }}>{p.family.name}</Link>
                      : <span className="text-xs" style={{ color: 'var(--patent-muted)' }}>—</span>}
                  </td>
                  <td className="text-xs max-w-[140px]" style={{ color: 'var(--patent-muted)' }}>
                    {p.inventors.slice(0, 2).join(', ')}{p.inventors.length > 2 ? ` +${p.inventors.length - 2}` : ''}
                  </td>
                  <td className="text-xs whitespace-nowrap" style={{ color: 'var(--patent-muted)' }}>
                    {p.filingDate ? p.filingDate.slice(0, 10) : '—'}
                  </td>
                  <td className="text-xs whitespace-nowrap" style={{ color: 'var(--patent-muted)' }}>
                    {p.grantDate ? p.grantDate.slice(0, 10) : '—'}
                  </td>
                  <td><StatusBadge status={p.status} /></td>
                  <td>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link href={`/patents/${p.id}`} className="btn-ghost p-1.5">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                      <button onClick={() => setDeleteTarget(p)} className="btn-ghost p-1.5"
                        style={{ color: 'rgba(239,68,68,0.6)' }}
                        title="Remove from portfolio">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-patent-muted">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="btn-ghost text-sm" style={{ opacity: page === 1 ? 0.4 : 1 }}>← Prev</button>
            <span className="text-xs text-patent-muted">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= totalPages} className="btn-ghost text-sm" style={{ opacity: page >= totalPages ? 0.4 : 1 }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  )
}
