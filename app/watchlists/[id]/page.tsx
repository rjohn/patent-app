'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Search, Plus, Trash2, Loader2, ChevronDown, ChevronUp,
  ExternalLink, StickyNote, CheckCircle2, AlertCircle, Building2, Hash,
  Sparkles, RefreshCw,
} from 'lucide-react'
import { useTheme } from '@/context/theme-context'

interface WatchlistEntry {
  id: string
  patentNumber: string | null
  appNumber: string | null
  title: string | null
  assignee: string | null
  inventors: string[]
  filingDate: string | null
  grantDate: string | null
  expirationDate: string | null
  status: string | null
  abstract: string | null
  cpcCodes: string[]
  jurisdiction: string
  notes: string | null
  aiSummary: string | null
  aiSummaryAt: string | null
  addedAt: string
}

interface Watchlist {
  id: string
  name: string
  description: string | null
  entries: WatchlistEntry[]
}

interface SearchResult {
  applicationNumber: string
  patentNumber: string | null
  title: string
  status: string
  assignee: string | null
  inventors: string[]
  filingDate: string | null
  grantDate: string | null
}

type SearchMode = 'company' | 'number'
type AddStatus = 'idle' | 'adding' | 'added' | 'duplicate' | 'error'

function statusColor(status: string | null) {
  switch (status?.toUpperCase()) {
    case 'GRANTED':   return '#4ade80'
    case 'PENDING':   return '#fbbf24'
    case 'PUBLISHED': return '#60a5fa'
    case 'ABANDONED': return '#f87171'
    case 'EXPIRED':   return '#94a3b8'
    default:          return '#94a3b8'
  }
}

const PAGE_SIZE = 25

export default function WatchlistDetailPage() {
  const params = useParams()
  const id = params.id as string
  const router = useRouter()
  const { theme } = useTheme()
  const light = theme === 'light'

  const [watchlist, setWatchlist] = useState<Watchlist | null>(null)
  const [loading, setLoading] = useState(true)

  // Search state
  const [searchMode, setSearchMode] = useState<SearchMode>('company')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchTotal, setSearchTotal] = useState(0)
  const [searchPage, setSearchPage] = useState(0)
  const [addStatus, setAddStatus] = useState<Record<string, AddStatus>>({})

  // Entry UI state
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/watchlists/${id}`)
      if (!r.ok) { router.push('/watchlists'); return }
      const d = await r.json()
      setWatchlist(d.watchlist)
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { load() }, [load])

  async function search(page = 0) {
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    setSearchPage(page)
    try {
      let url: string
      if (searchMode === 'company') {
        url = `/api/patents/company-search?company=${encodeURIComponent(query)}&exact=false&start=${page * PAGE_SIZE}&limit=${PAGE_SIZE}`
      } else {
        url = `/api/patents/lookup?q=${encodeURIComponent(query)}`
      }
      const r = await fetch(url)
      const d = await r.json()
      if (!r.ok) { setSearchError(d.error || 'Search failed'); return }

      if (searchMode === 'company') {
        setSearchResults(d.patents || [])
        setSearchTotal(d.total || 0)
      } else {
        if (d.patent) {
          const p = d.patent
          setSearchResults([{
            applicationNumber: p.applicationNumber || '',
            patentNumber: p.patentNumber || null,
            title: p.title || 'Untitled',
            status: p.status || 'PENDING',
            assignee: p.assignee || null,
            inventors: p.inventors || [],
            filingDate: p.filingDate || null,
            grantDate: p.grantDate || null,
          }])
          setSearchTotal(1)
        } else {
          setSearchResults([])
          setSearchTotal(0)
        }
      }
    } catch {
      setSearchError('Search failed')
    } finally {
      setSearching(false)
    }
  }

  async function addToWatchlist(p: SearchResult) {
    const key = p.applicationNumber || p.patentNumber || ''
    setAddStatus(s => ({ ...s, [key]: 'adding' }))
    try {
      const r = await fetch(`/api/watchlists/${id}/patents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patentNumber: p.patentNumber,
          appNumber:    p.applicationNumber,
          title:        p.title,
          assignee:     p.assignee,
          inventors:    p.inventors,
          filingDate:   p.filingDate,
          grantDate:    p.grantDate,
          status:       p.status,
          jurisdiction: 'US',
        }),
      })
      if (r.status === 409) {
        setAddStatus(s => ({ ...s, [key]: 'duplicate' }))
      } else if (!r.ok) {
        setAddStatus(s => ({ ...s, [key]: 'error' }))
      } else {
        setAddStatus(s => ({ ...s, [key]: 'added' }))
        const d = await (await fetch(`/api/watchlists/${id}`)).json()
        setWatchlist(d.watchlist)
      }
      setTimeout(() => setAddStatus(s => ({ ...s, [key]: 'idle' })), 3000)
    } catch {
      setAddStatus(s => ({ ...s, [key]: 'error' }))
      setTimeout(() => setAddStatus(s => ({ ...s, [key]: 'idle' })), 3000)
    }
  }

  async function removeEntry(entryId: string) {
    setRemovingId(entryId)
    try {
      await fetch(`/api/watchlists/${id}/patents?entryId=${entryId}`, { method: 'DELETE' })
      setWatchlist(w => w ? { ...w, entries: w.entries.filter(e => e.id !== entryId) } : w)
    } finally {
      setRemovingId(null)
    }
  }

  async function saveNotes(entryId: string) {
    setSavingNotes(true)
    try {
      await fetch(`/api/watchlists/${id}/patents`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId, notes: notesDraft }),
      })
      setWatchlist(w => w ? {
        ...w,
        entries: w.entries.map(e => e.id === entryId ? { ...e, notes: notesDraft } : e)
      } : w)
      setEditingNotesId(null)
    } finally {
      setSavingNotes(false)
    }
  }

  async function analyzeEntry(entryId: string) {
    setAnalyzingId(entryId)
    try {
      const r = await fetch(`/api/watchlists/${id}/patents/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryId }),
      })
      const d = await r.json()
      if (r.ok) {
        setWatchlist(w => w ? {
          ...w,
          entries: w.entries.map(e => e.id === entryId
            ? { ...e, aiSummary: d.summary, aiSummaryAt: new Date().toISOString() }
            : e
          ),
        } : w)
      }
    } finally {
      setAnalyzingId(null)
    }
  }

  const toggleExpand = (entryId: string) => {
    setExpanded(s => {
      const n = new Set(s)
      n.has(entryId) ? n.delete(entryId) : n.add(entryId)
      return n
    })
  }

  const muted  = light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'
  const border = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-40">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--patent-sky)' }} />
      </div>
    )
  }
  if (!watchlist) return null

  const alreadyInWatchlist = new Set([
    ...watchlist.entries.map(e => e.appNumber).filter(Boolean),
    ...watchlist.entries.map(e => e.patentNumber).filter(Boolean),
  ])

  return (
    <div className="p-8 animate-fade-in max-w-5xl">

      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <button onClick={() => router.push('/watchlists')} className="btn-ghost p-1.5 mt-0.5 flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <h1 className="page-title">{watchlist.name}</h1>
          {watchlist.description && <p className="text-muted mt-1">{watchlist.description}</p>}
          <p className="text-xs text-patent-muted mt-1">
            {watchlist.entries.length} patent{watchlist.entries.length !== 1 ? 's' : ''} tracked
          </p>
        </div>
      </div>

      {/* Search panel */}
      <div className="card p-5 mb-6">
        <h2 className="section-title mb-4">Search & Add Patents</h2>

        <div className="flex gap-1 mb-4 p-1 rounded-lg w-fit" style={{ background: muted }}>
          {([['company', 'By Assignee', Building2], ['number', 'By Patent Number', Hash]] as const).map(([mode, label, Icon]) => (
            <button key={mode}
              onClick={() => { setSearchMode(mode); setSearchResults([]); setSearchError(null) }}
              className="text-sm px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5"
              style={{
                background: searchMode === mode ? (light ? '#fff' : 'var(--patent-navy)') : 'transparent',
                color: searchMode === mode ? (light ? '#0F172A' : 'white') : 'var(--patent-muted)',
                boxShadow: searchMode === mode && light ? '0 1px 3px rgba(0,0,0,0.1)' : undefined,
              }}
            >
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input value={query} onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search(0)}
            placeholder={searchMode === 'company' ? 'e.g. Acme Corporation' : 'e.g. US11234567 or 18/336,362'}
            className="input flex-1" />
          <button onClick={() => search(0)} disabled={!query.trim() || searching}
            className="btn-primary flex items-center gap-2 px-5">
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </div>

        {searchError && (
          <div className="mt-4 flex items-center gap-2 text-sm text-red-400">
            <AlertCircle className="w-4 h-4" />{searchError}
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-patent-muted">
                Showing {searchResults.length} of {searchTotal.toLocaleString()} results
              </p>
              {searchMode === 'company' && searchTotal > PAGE_SIZE && (
                <div className="flex gap-1">
                  <button disabled={searchPage === 0 || searching} onClick={() => search(searchPage - 1)}
                    className="btn-ghost text-xs px-2 py-1">← Prev</button>
                  <span className="text-xs text-patent-muted px-2 py-1">Page {searchPage + 1}</span>
                  <button disabled={(searchPage + 1) * PAGE_SIZE >= searchTotal || searching}
                    onClick={() => search(searchPage + 1)}
                    className="btn-ghost text-xs px-2 py-1">Next →</button>
                </div>
              )}
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${border}` }}>
              {searchResults.map((p, i) => {
                const key = p.applicationNumber || p.patentNumber || String(i)
                const st = addStatus[key] || 'idle'
                const inList = alreadyInWatchlist.has(p.applicationNumber) ||
                  (!!p.patentNumber && alreadyInWatchlist.has(p.patentNumber))
                return (
                  <div key={key} className="px-4 py-3 flex items-center gap-3"
                    style={{ borderBottom: i < searchResults.length - 1 ? `1px solid ${border}` : undefined,
                      background: i % 2 === 0 ? 'transparent' : muted }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="mono text-xs" style={{ color: 'var(--patent-sky)' }}>
                          {p.patentNumber ? `US ${p.patentNumber}` : p.applicationNumber}
                        </span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: `${statusColor(p.status)}20`, color: statusColor(p.status) }}>
                          {p.status}
                        </span>
                        {p.patentNumber && (
                          <a href={`https://patents.google.com/patent/US${p.patentNumber}`}
                            target="_blank" rel="noopener noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="text-patent-muted hover:text-patent-sky transition-colors" title="Google Patents">
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      <p className="text-sm mt-0.5 truncate" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.85)' }}>
                        {p.title}
                      </p>
                      {p.assignee && <p className="text-xs text-patent-muted mt-0.5">{p.assignee}</p>}
                    </div>
                    <div className="text-right text-xs text-patent-muted flex-shrink-0 w-20 hidden sm:block">
                      {p.filingDate?.slice(0, 10) || '—'}
                    </div>
                    <button onClick={() => addToWatchlist(p)}
                      disabled={st === 'adding' || inList || st === 'added'}
                      className={`btn-secondary text-xs flex items-center gap-1.5 flex-shrink-0 ${
                        st === 'added' || inList ? 'border-green-500/40 text-green-400' :
                        st === 'error'           ? 'border-red-500/40 text-red-400' :
                        st === 'duplicate'       ? 'border-yellow-500/40 text-yellow-400' : ''
                      }`}>
                      {st === 'adding'            ? <Loader2 className="w-3 h-3 animate-spin" /> :
                       (st === 'added' || inList)  ? <CheckCircle2 className="w-3 h-3" /> :
                                                     <Plus className="w-3 h-3" />}
                      {(st === 'added' || inList) ? 'Added' : st === 'duplicate' ? 'Exists' : 'Add'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {!searching && searchResults.length === 0 && query && !searchError && (
          <p className="mt-4 text-sm text-patent-muted">No results found.</p>
        )}
      </div>

      {/* Tracked entries */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: `1px solid ${border}` }}>
          <h2 className="section-title">Tracked Patents</h2>
        </div>

        {watchlist.entries.length === 0 ? (
          <div className="text-center py-16">
            <Search className="w-10 h-10 mx-auto mb-3 opacity-20" style={{ color: 'var(--patent-sky)' }} />
            <p className="text-patent-muted">No patents in this watchlist yet</p>
            <p className="text-xs text-patent-muted mt-1">Search above and add patents to start tracking</p>
          </div>
        ) : (
          <div>
            {watchlist.entries.map((entry, i) => {
              const isExpanded    = expanded.has(entry.id)
              const isEditingNotes = editingNotesId === entry.id
              const isAnalyzing   = analyzingId === entry.id

              return (
                <div key={entry.id}
                  style={{ borderBottom: i < watchlist.entries.length - 1 ? `1px solid ${border}` : undefined }}>

                  {/* ── Header row ── */}
                  <div className="px-5 pt-4 pb-3">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {/* Identifiers + badges */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="mono text-xs font-medium" style={{ color: 'var(--patent-sky)' }}>
                            {entry.patentNumber ? `US ${entry.patentNumber}` : entry.appNumber || '—'}
                          </span>
                          {entry.status && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                              style={{ background: `${statusColor(entry.status)}20`, color: statusColor(entry.status) }}>
                              {entry.status}
                            </span>
                          )}
                          {entry.patentNumber && (
                            <a href={`https://patents.google.com/patent/US${entry.patentNumber}`}
                              target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1 text-xs transition-colors"
                              style={{ color: 'var(--patent-sky)' }}
                              title="Open on Google Patents">
                              <ExternalLink className="w-3 h-3" />
                              Google Patents
                            </a>
                          )}
                        </div>

                        {/* Title */}
                        <p className="font-medium mt-1 leading-snug"
                          style={{ color: light ? '#1e293b' : 'rgba(255,255,255,0.95)' }}>
                          {entry.title || 'Untitled'}
                        </p>

                        {/* Meta row */}
                        <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-patent-muted">
                          {entry.assignee && <span>{entry.assignee}</span>}
                          {entry.filingDate && <span>Filed: {entry.filingDate.slice(0, 10)}</span>}
                          {entry.grantDate  && <span>Granted: {entry.grantDate.slice(0, 10)}</span>}
                        </div>

                        {/* Abstract — always visible */}
                        {entry.abstract && (
                          <p className="text-sm mt-2 leading-relaxed"
                            style={{
                              color: light ? '#374151' : 'rgba(255,255,255,0.72)',
                              display: '-webkit-box',
                              WebkitBoxOrient: 'vertical',
                              WebkitLineClamp: isExpanded ? undefined : 4,
                              overflow: isExpanded ? undefined : 'hidden',
                            }}>
                            {entry.abstract}
                          </p>
                        )}
                      </div>

                      {/* Actions column */}
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0 ml-2">
                        <button onClick={() => removeEntry(entry.id)} disabled={removingId === entry.id}
                          className="btn-ghost p-1 text-patent-muted hover:text-red-400 transition-colors" title="Remove">
                          {removingId === entry.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => toggleExpand(entry.id)}
                          className="btn-ghost p-1 text-patent-muted" title={isExpanded ? 'Collapse' : 'Expand'}>
                          {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>

                    {/* AI Analysis section — always shown below abstract */}
                    <div className="mt-3">
                      {entry.aiSummary ? (
                        <div className="rounded-lg p-3" style={{ background: muted, border: `1px solid ${border}` }}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-1.5 text-xs font-medium"
                              style={{ color: 'var(--patent-sky)' }}>
                              <Sparkles className="w-3.5 h-3.5" />
                              Portfolio Relevance Analysis
                            </div>
                            <button onClick={() => analyzeEntry(entry.id)} disabled={isAnalyzing}
                              className="btn-ghost p-1 text-patent-muted hover:text-patent-sky transition-colors"
                              title="Regenerate analysis">
                              {isAnalyzing
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <RefreshCw className="w-3 h-3" />}
                            </button>
                          </div>
                          <p className="text-sm leading-relaxed"
                            style={{ color: light ? '#374151' : 'rgba(255,255,255,0.75)' }}>
                            {entry.aiSummary}
                          </p>
                          {entry.aiSummaryAt && (
                            <p className="text-xs text-patent-muted mt-2">
                              Generated {new Date(entry.aiSummaryAt).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                      ) : (
                        <button onClick={() => analyzeEntry(entry.id)} disabled={isAnalyzing}
                          className="btn-secondary text-xs flex items-center gap-1.5"
                          style={{ color: 'var(--patent-sky)', borderColor: 'var(--patent-sky)' }}>
                          {isAnalyzing
                            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Analyzing…</>
                            : <><Sparkles className="w-3.5 h-3.5" />Analyze vs Portfolio</>}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Expanded detail ── */}
                  {isExpanded && (
                    <div className="px-5 pb-4 pt-1" style={{ background: muted }}>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {entry.inventors.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-patent-muted mb-1">Inventors</p>
                            <p className="text-sm" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.8)' }}>
                              {entry.inventors.join(', ')}
                            </p>
                          </div>
                        )}
                        {entry.cpcCodes.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-patent-muted mb-1">CPC Codes</p>
                            <p className="text-sm mono" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.8)' }}>
                              {entry.cpcCodes.slice(0, 6).join(', ')}
                              {entry.cpcCodes.length > 6 && ` +${entry.cpcCodes.length - 6} more`}
                            </p>
                          </div>
                        )}
                        {entry.expirationDate && (
                          <div>
                            <p className="text-xs font-medium text-patent-muted mb-1">Expires</p>
                            <p className="text-sm" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.8)' }}>
                              {entry.expirationDate.slice(0, 10)}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Notes */}
                      <div>
                        <p className="text-xs font-medium text-patent-muted mb-1 flex items-center gap-1">
                          <StickyNote className="w-3 h-3" /> Notes
                        </p>
                        {isEditingNotes ? (
                          <div>
                            <textarea autoFocus value={notesDraft}
                              onChange={e => setNotesDraft(e.target.value)}
                              rows={3} className="input w-full text-sm resize-none"
                              placeholder="Add your notes…" />
                            <div className="flex gap-2 mt-2">
                              <button onClick={() => saveNotes(entry.id)} disabled={savingNotes}
                                className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5">
                                {savingNotes && <Loader2 className="w-3 h-3 animate-spin" />}
                                Save
                              </button>
                              <button onClick={() => setEditingNotesId(null)}
                                className="btn-ghost text-xs px-3 py-1.5">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div onClick={() => { setEditingNotesId(entry.id); setNotesDraft(entry.notes || '') }}
                            className="cursor-text rounded-md px-3 py-2 transition-colors min-h-[36px]"
                            style={{ border: `1px dashed ${border}` }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--patent-sky)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = border)}>
                            {entry.notes
                              ? <p className="text-sm whitespace-pre-wrap"
                                  style={{ color: light ? '#374151' : 'rgba(255,255,255,0.75)' }}>{entry.notes}</p>
                              : <p className="text-xs text-patent-muted">Click to add notes…</p>}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
