'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import {
  Search, Plus, CheckCircle2, AlertCircle, Loader2, X,
  ChevronDown, ChevronUp, Tag, Users, Building2, Calendar,
  FileText, GitBranch, ExternalLink, ChevronLeft, ChevronRight,
} from 'lucide-react'

// ── Shared ────────────────────────────────────────────────────────────────────

type Mode = 'US' | 'EP' | 'COMPANY'

function MetaItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="flex-shrink-0 mt-0.5" style={{ color: 'var(--patent-muted)' }}>{icon}</span>
      <div className="min-w-0">
        <div className="uppercase tracking-wider" style={{ fontSize: '10px', color: 'var(--patent-muted)' }}>{label}</div>
        <div className="mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>{value}</div>
      </div>
    </div>
  )
}

// ── US lookup ─────────────────────────────────────────────────────────────────

interface USPatentPreview {
  patent_number:      string | null
  application_number: string
  publication_number: string | null
  title:              string
  status:             string
  type:               string
  filing_date:        string | null
  grant_date:         string | null
  expiration_date:    string | null
  inventors:          string[]
  assignee:           string | null
  examiner:           string | null
  art_unit:           string | null
  entity_status:      string | null
  cpc_codes:          string[]
  continuation_type:  string | null
  parent_app_number:  string | null
  child_count:        number
}

type LookupStatus = 'idle' | 'loading' | 'found' | 'not_found' | 'error'
type SaveStatus   = 'idle' | 'saving' | 'saved' | 'duplicate' | 'error'

interface QueueItem {
  number:       string
  preview:      USPatentPreview | null
  lookupStatus: LookupStatus
  saveStatus:   SaveStatus
  error:        string | null
  expanded:     boolean
}

function USPatentCard({ item, onSave, onRemove, onToggle }: {
  item: QueueItem; onSave: () => void; onRemove: () => void; onToggle: () => void
}) {
  const { number, preview, lookupStatus, saveStatus, error, expanded } = item

  const borderStyle =
    saveStatus === 'saved'       ? { borderColor: 'rgba(34,197,94,0.3)' } :
    saveStatus === 'duplicate'   ? { borderColor: 'rgba(234,179,8,0.3)' } :
    saveStatus === 'error'       ? { borderColor: 'rgba(239,68,68,0.3)' } :
    lookupStatus === 'not_found' ? { borderColor: 'rgba(239,68,68,0.2)' } :
    lookupStatus === 'found'     ? { borderColor: 'rgba(74,144,217,0.2)' } : {}

  return (
    <div className="card overflow-hidden" style={borderStyle}>
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="flex-shrink-0">
          {lookupStatus === 'loading'                             && <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--patent-sky)' }} />}
          {lookupStatus === 'found' && saveStatus === 'idle'     && <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: 'var(--patent-sky)', background: 'rgba(74,144,217,0.2)' }} />}
          {lookupStatus === 'found' && saveStatus === 'saving'   && <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--patent-gold)' }} />}
          {lookupStatus === 'found' && saveStatus === 'saved'    && <CheckCircle2 className="w-5 h-5" style={{ color: '#4ade80' }} />}
          {lookupStatus === 'found' && saveStatus === 'duplicate' && <AlertCircle className="w-5 h-5" style={{ color: '#facc15' }} />}
          {lookupStatus === 'found' && saveStatus === 'error'    && <AlertCircle className="w-5 h-5" style={{ color: '#f87171' }} />}
          {(lookupStatus === 'not_found' || lookupStatus === 'error') && <AlertCircle className="w-5 h-5" style={{ color: '#f87171' }} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-sm font-semibold" style={{ color: 'var(--patent-sky)' }}>
              {preview?.patent_number || `US ${number}`}
            </span>
            {preview?.application_number && preview.application_number !== number && (
              <span className="font-mono text-xs" style={{ color: 'rgba(168,181,204,0.7)' }}>
                App: {preview.application_number}
              </span>
            )}
            {saveStatus === 'saved'       && <span className="status-granted">Saved</span>}
            {saveStatus === 'duplicate'   && <span className="status-pending">Already in portfolio</span>}
            {lookupStatus === 'not_found' && <span className="status-abandoned">Not found</span>}
          </div>
          {preview && <p className="text-sm mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>{preview.title}</p>}
          {(lookupStatus === 'error' || saveStatus === 'error') && error && (
            <p className="text-xs mt-0.5" style={{ color: '#f87171' }}>{error}</p>
          )}
          {lookupStatus === 'not_found' && (
            <p className="text-xs mt-0.5 text-muted">Not found in USPTO Open Data Portal</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {lookupStatus === 'found' && saveStatus === 'idle' && (
            <button onClick={onSave} className="btn-primary text-sm" style={{ padding: '0.375rem 0.75rem' }}>
              <Plus className="w-3.5 h-3.5" /> Add to Portfolio
            </button>
          )}
          {preview && (
            <button onClick={onToggle} className="btn-ghost" style={{ padding: '0.375rem' }}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
          <button onClick={onRemove} className="btn-ghost" style={{ padding: '0.375rem', color: 'var(--patent-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {preview && expanded && (
        <div className="px-5 py-4 animate-slide-up" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="grid grid-cols-2 gap-3 text-xs mb-4">
            {preview.inventors.length > 0 && <MetaItem icon={<Users className="w-3.5 h-3.5" />}    label="Inventors"   value={preview.inventors.join(', ')} />}
            {preview.assignee             && <MetaItem icon={<Building2 className="w-3.5 h-3.5" />} label="Assignee"   value={preview.assignee} />}
            {preview.filing_date          && <MetaItem icon={<Calendar className="w-3.5 h-3.5" />}  label="Filed"      value={preview.filing_date} />}
            {preview.grant_date           && <MetaItem icon={<Calendar className="w-3.5 h-3.5" />}  label="Granted"    value={preview.grant_date} />}
            {preview.expiration_date      && <MetaItem icon={<Calendar className="w-3.5 h-3.5" />}  label="Expires"    value={preview.expiration_date} />}
            {preview.examiner             && <MetaItem icon={<FileText className="w-3.5 h-3.5" />}  label="Examiner"   value={preview.examiner} />}
            {preview.art_unit             && <MetaItem icon={<Tag className="w-3.5 h-3.5" />}       label="Art Unit"   value={preview.art_unit} />}
            {preview.entity_status        && <MetaItem icon={<Building2 className="w-3.5 h-3.5" />} label="Entity"     value={preview.entity_status} />}
            <MetaItem icon={<Tag className="w-3.5 h-3.5" />}         label="Type"   value={preview.type} />
            {preview.status               && <MetaItem icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Status" value={preview.status} />}
            {preview.continuation_type    && <MetaItem icon={<GitBranch className="w-3.5 h-3.5" />} label="Continuation" value={preview.continuation_type.replace(/_/g, ' ')} />}
            {preview.parent_app_number    && <MetaItem icon={<GitBranch className="w-3.5 h-3.5" />} label="Parent App"   value={preview.parent_app_number} />}
          </div>
          {preview.cpc_codes.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {preview.cpc_codes.slice(0, 8).map(code => (
                <span key={code} className="font-mono text-xs px-2 py-0.5 rounded"
                  style={{ background: 'rgba(45,90,158,0.2)', color: 'rgba(74,144,217,0.8)' }}>
                  {code}
                </span>
              ))}
              {preview.cpc_codes.length > 8 && (
                <span className="text-xs px-2 py-0.5 text-muted">+{preview.cpc_codes.length - 8} more</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function USLookup() {
  const [input, setInput]     = useState('')
  const [queue, setQueue]     = useState<QueueItem[]>([])
  const [familyId, setFamilyId] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const updateItem = (number: string, patch: Partial<QueueItem>) =>
    setQueue(q => q.map(item => item.number === number ? { ...item, ...patch } : item))

  const lookup = async (rawNumber: string) => {
    const number = rawNumber.trim().toUpperCase()
    if (!number) return
    if (queue.find(q => q.number === number)) return
    setQueue(q => [{ number, preview: null, lookupStatus: 'loading', saveStatus: 'idle', error: null, expanded: true }, ...q])
    setInput('')
    try {
      const res  = await fetch(`/api/patents/lookup?number=${encodeURIComponent(number)}`)
      const data = await res.json()
      if (!res.ok) {
        updateItem(number, { lookupStatus: res.status === 404 ? 'not_found' : 'error', error: data.error || 'Lookup failed' })
        return
      }
      updateItem(number, { lookupStatus: 'found', preview: data.patent })
    } catch {
      updateItem(number, { lookupStatus: 'error', error: 'Network error — check your connection' })
    }
  }

  const save = async (item: QueueItem) => {
    if (!item.preview) return
    updateItem(item.number, { saveStatus: 'saving' })
    try {
      const res  = await fetch('/api/patents/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patent: item.preview, familyId: familyId || undefined }),
      })
      const data = await res.json()
      if (res.status === 409) { updateItem(item.number, { saveStatus: 'duplicate', error: 'Already in portfolio' }); return }
      if (!res.ok)            { updateItem(item.number, { saveStatus: 'error',     error: data.error || 'Save failed' }); return }
      updateItem(item.number, { saveStatus: 'saved' })
    } catch {
      updateItem(item.number, { saveStatus: 'error', error: 'Network error' })
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') lookup(input) }
  const handlePaste   = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const numbers = e.clipboardData.getData('text').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    if (numbers.length > 1) { e.preventDefault(); numbers.forEach(lookup) }
  }

  const savedCount   = queue.filter(q => q.saveStatus === 'saved').length
  const pendingCount = queue.filter(q => q.lookupStatus === 'found' && q.saveStatus === 'idle').length

  return (
    <>
      <div className="card p-5 mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patent-muted pointer-events-none" />
            <input ref={inputRef} type="text" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown} onPaste={handlePaste}
              placeholder="e.g. 11234567 or US10,987,654 B2 — press Enter"
              className="input pl-9 w-full" autoFocus />
          </div>
          <button onClick={() => lookup(input)} disabled={!input.trim()} className="btn-primary">
            <Search className="w-4 h-4" /> Lookup
          </button>
        </div>
        <div className="flex items-start gap-6 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div>
            <label className="label mb-1.5 block">Assign to Family (optional)</label>
            <input type="text" value={familyId} onChange={e => setFamilyId(e.target.value)}
              placeholder="Family ID" className="input" style={{ width: '220px' }} />
          </div>
          <div className="text-xs text-patent-muted space-y-1 pt-5">
            <p>💡 Paste multiple numbers at once — comma or newline separated</p>
            <p>💡 Grant numbers, application numbers, and publication numbers all work</p>
            <p>💡 Data sourced from <span style={{ color: 'var(--patent-sky)' }}>api.uspto.gov</span></p>
          </div>
        </div>
      </div>

      {queue.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-patent-muted">{queue.length} looked up</span>
            {savedCount   > 0 && <span style={{ color: '#4ade80' }} className="flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> {savedCount} saved</span>}
            {pendingCount > 0 && <span style={{ color: 'var(--patent-gold)' }}>{pendingCount} ready to add</span>}
          </div>
          {pendingCount > 0 && (
            <button onClick={() => queue.filter(q => q.lookupStatus === 'found' && q.saveStatus === 'idle').forEach(save)} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> Add All ({pendingCount})
            </button>
          )}
        </div>
      )}

      <div className="space-y-3">
        {queue.map(item => (
          <USPatentCard key={item.number} item={item}
            onSave={() => save(item)}
            onRemove={() => setQueue(q => q.filter(i => i.number !== item.number))}
            onToggle={() => updateItem(item.number, { expanded: !item.expanded })}
          />
        ))}
      </div>

      {queue.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(45,90,158,0.2)', border: '1px solid rgba(74,144,217,0.2)' }}>
            <Search className="w-7 h-7" style={{ color: 'rgba(74,144,217,0.5)' }} />
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)' }} className="font-medium mb-1">Enter a US patent number above</p>
          <p className="text-muted">Grant numbers, application numbers, and publication numbers all work</p>
        </div>
      )}
    </>
  )
}

// ── EP lookup ─────────────────────────────────────────────────────────────────

interface EPPatentData {
  ep_number:        string
  publication_number: string | null
  title:            string
  status:           string
  type:             string
  jurisdiction:     string
  filing_date:      string | null
  publication_date: string | null
  grant_date:       string | null
  expiration_date:  string | null
  inventors:        string[]
  assignee:         string | null
  cpc_codes:        string[]
  abstract:         string | null
  claims:           string[]
}

const STATUS_COLORS: Record<string, string> = {
  GRANTED: '#4ade80', PENDING: '#facc15', PUBLISHED: '#60a5fa', ABANDONED: '#f87171',
}

function fmt(d: string | null) { return d ? d.slice(0, 10) : '—' }

function EPLookup() {
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [patent, setPatent]     = useState<EPPatentData | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [saved, setSaved]       = useState(false)
  const [showClaims, setShowClaims] = useState(false)

  const lookup = async () => {
    if (!input.trim()) return
    setLoading(true); setError(null); setPatent(null); setSaved(false)
    try {
      const res  = await fetch(`/api/patents/ep-lookup?number=${encodeURIComponent(input.trim())}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      setPatent(data.patent)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed')
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    if (!patent) return
    setSaving(true); setError(null)
    try {
      const res  = await fetch('/api/patents/ep-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patent }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSaved(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const needsEpoKey = error?.includes('EPO_OPS_KEY')

  return (
    <>
      {needsEpoKey && (
        <div className="card p-4 mb-5 flex gap-3" style={{ borderColor: 'rgba(250,204,21,0.3)', background: 'rgba(250,204,21,0.05)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#facc15' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: '#facc15' }}>EPO API credentials required</p>
            <p className="text-xs text-patent-muted mt-1">
              Register free at{' '}
              <a href="https://developers.epo.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">developers.epo.org</a>
              {' '}then add <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.1)' }}>EPO_OPS_KEY</code> and{' '}
              <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.1)' }}>EPO_OPS_SECRET</code> to your .env.local
            </p>
          </div>
        </div>
      )}

      <div className="card p-5 mb-5">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patent-muted" />
            <input type="text" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookup()}
              placeholder="e.g. EP1234567 or 1234567"
              className="input pl-9 w-full" autoFocus />
          </div>
          <button onClick={lookup} disabled={loading || !input.trim()} className="btn-primary flex items-center gap-2 px-5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Searching…' : 'Look Up'}
          </button>
        </div>
        <p className="text-xs text-patent-muted mt-2">
          Accepts: EP1234567 · EP 1234567 · 1234567 · EP1234567B1 · Data sourced from <span style={{ color: 'var(--patent-sky)' }}>ops.epo.org</span>
        </p>
      </div>

      {error && !needsEpoKey && (
        <div className="card p-4 mb-5 flex items-center gap-3" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
        </div>
      )}

      {patent ? (
        <div className="card overflow-hidden">
          <div className="p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-mono text-sm font-bold" style={{ color: 'var(--patent-sky)' }}>EP{patent.ep_number}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(74,144,217,0.15)', color: 'var(--patent-sky)' }}>European Patent</span>
                  <span className="text-xs font-semibold" style={{ color: STATUS_COLORS[patent.status] || 'white' }}>{patent.status}</span>
                </div>
                <h2 className="text-base font-semibold text-white leading-snug">{patent.title}</h2>
                {patent.assignee && <p className="text-sm text-patent-muted mt-1">{patent.assignee}</p>}
              </div>
              <a href={`https://patents.google.com/patent/EP${patent.ep_number}`}
                target="_blank" rel="noopener noreferrer"
                className="btn-ghost flex items-center gap-1.5 text-xs flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5" /> Google Patents
              </a>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {[
              { label: 'Filed',        value: fmt(patent.filing_date) },
              { label: 'Published',    value: fmt(patent.publication_date) },
              { label: 'Granted',      value: fmt(patent.grant_date) },
              { label: 'Expires',      value: fmt(patent.expiration_date) },
              { label: 'Jurisdiction', value: 'European Patent Office' },
              { label: 'Type',         value: patent.type },
            ].map((f, i) => (
              <div key={i} className="px-5 py-3"
                style={{
                  borderRight: i % 3 !== 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                  borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                }}>
                <p className="text-xs text-patent-muted mb-0.5">{f.label}</p>
                <p className="text-sm text-white">{f.value}</p>
              </div>
            ))}
          </div>

          {(patent.inventors.length > 0 || patent.cpc_codes.length > 0) && (
            <div className="px-5 py-4 space-y-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              {patent.inventors.length > 0 && (
                <div>
                  <p className="text-xs text-patent-muted mb-1">Inventors</p>
                  <p className="text-sm text-white">{patent.inventors.join(' · ')}</p>
                </div>
              )}
              {patent.cpc_codes.length > 0 && (
                <div>
                  <p className="text-xs text-patent-muted mb-1.5">Classifications</p>
                  <div className="flex flex-wrap gap-1.5">
                    {patent.cpc_codes.slice(0, 6).map((c, i) => (
                      <span key={i} className="text-xs font-mono px-2 py-0.5 rounded"
                        style={{ background: 'rgba(74,144,217,0.12)', color: 'var(--patent-sky)' }}>{c.trim()}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {patent.abstract && (
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-xs text-patent-muted mb-2">Abstract</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{patent.abstract}</p>
            </div>
          )}

          {patent.claims.length > 0 && (
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <button onClick={() => setShowClaims(c => !c)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-white/[0.02] transition-colors">
                <span className="text-xs text-patent-muted">{patent.claims.length} claims</span>
                {showClaims ? <ChevronUp className="w-4 h-4 text-patent-muted" /> : <ChevronDown className="w-4 h-4 text-patent-muted" />}
              </button>
              {showClaims && (
                <div className="px-5 pb-4 space-y-3">
                  {patent.claims.map((c, i) => (
                    <div key={i} className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
                      <span className="font-mono text-xs font-bold mr-2" style={{ color: 'var(--patent-sky)' }}>{i + 1}.</span>
                      {c.replace(/^\d+\.\s*/, '')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="px-5 py-4 flex items-center justify-between">
            <p className="text-xs text-patent-muted">Abstract and claims will be saved with this patent</p>
            {saved ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: '#4ade80' }}>
                <CheckCircle2 className="w-4 h-4" /> Added to portfolio
              </div>
            ) : (
              <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Adding…' : 'Add to Portfolio'}
              </button>
            )}
          </div>
        </div>
      ) : !loading && !error && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(45,90,158,0.2)', border: '1px solid rgba(74,144,217,0.2)' }}>
            <Search className="w-7 h-7" style={{ color: 'rgba(74,144,217,0.5)' }} />
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)' }} className="font-medium mb-1">Enter an EP patent number above</p>
          <p className="text-muted">Data sourced live from the EPO Open Patent Services API</p>
        </div>
      )}
    </>
  )
}

// ── Company search ────────────────────────────────────────────────────────────

interface CompanyPatent {
  applicationNumber: string
  patentNumber:      string | null
  title:             string
  status:            string
  type:              string
  filingDate:        string | null
  grantDate:         string | null
  assignee:          string | null
  inventors:         string[]
  inPortfolio:       boolean
}

const STATUS_BADGE: Record<string, string> = {
  GRANTED: 'status-granted', PENDING: 'status-pending',
  ABANDONED: 'status-abandoned', EXPIRED: 'status-expired', PUBLISHED: 'status-published',
}

const PAGE_SIZE = 25

function CompanySearch() {
  const [query, setQuery]         = useState('')
  const [results, setResults]     = useState<CompanyPatent[]>([])
  const [total, setTotal]         = useState(0)
  const [page, setPage]           = useState(0)
  const [searched, setSearched]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [selected, setSelected]   = useState<Set<string>>(new Set())
  const [saving, setSaving]       = useState(false)
  const [saveResults, setSaveResults] = useState<Record<string, 'saved' | 'duplicate' | 'error'>>({})

  const search = async (start = 0) => {
    if (!query.trim()) return
    setLoading(true); setError(null); setSelected(new Set()); setSaveResults({})
    try {
      const res  = await fetch(`/api/patents/company-search?company=${encodeURIComponent(query.trim())}&start=${start}&limit=${PAGE_SIZE}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Search failed')
      setResults(data.patents)
      setTotal(data.total)
      setPage(start / PAGE_SIZE)
      setSearched(query.trim())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  const toggleSelect = (appNum: string) =>
    setSelected(prev => { const next = new Set(prev); next.has(appNum) ? next.delete(appNum) : next.add(appNum); return next })

  const toggleAll = () =>
    setSelected(selected.size === results.length ? new Set() : new Set(results.map(p => p.applicationNumber)))

  const saveSelected = async () => {
    const toSave = results.filter(p => selected.has(p.applicationNumber) && !p.inPortfolio)
    if (!toSave.length) return
    setSaving(true)
    for (const p of toSave) {
      try {
        const res = await fetch('/api/patents/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            patent: {
              patent_number:      p.patentNumber,
              application_number: p.applicationNumber,
              title:              p.title,
              status:             p.status,
              type:               p.type,
              filing_date:        p.filingDate,
              grant_date:         p.grantDate,
              inventors:          p.inventors,
              assignee:           p.assignee,
              cpc_codes:          [],
            }
          }),
        })
        setSaveResults(prev => ({ ...prev, [p.applicationNumber]: res.status === 409 ? 'duplicate' : res.ok ? 'saved' : 'error' }))
      } catch {
        setSaveResults(prev => ({ ...prev, [p.applicationNumber]: 'error' }))
      }
    }
    setSaving(false)
    setSelected(new Set())
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <>
      <div className="card p-5 mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patent-muted pointer-events-none" />
            <input type="text" value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search(0)}
              placeholder="e.g. Acme Corp, Apple Inc, Plasmology4"
              className="input pl-9 w-full" autoFocus />
          </div>
          <button onClick={() => search(0)} disabled={loading || !query.trim()} className="btn-primary flex items-center gap-2 px-5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Searching…' : 'Search'}
          </button>
        </div>
        <p className="text-xs text-patent-muted mt-2">
          Searches USPTO applicant name — partial matches supported · Data from <span style={{ color: 'var(--patent-sky)' }}>api.uspto.gov</span>
        </p>
      </div>

      {error && (
        <div className="card p-4 mb-5 flex items-center gap-3" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
        </div>
      )}

      {results.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-patent-muted">
              <span className="text-white font-medium">{total.toLocaleString()}</span> results for &ldquo;{searched}&rdquo;
              {totalPages > 1 && <span> · page {page + 1} of {totalPages}</span>}
            </div>
            <div className="flex items-center gap-3">
              {selected.size > 0 && (
                <button onClick={saveSelected} disabled={saving}
                  className="btn-primary text-sm flex items-center gap-2">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  {saving ? 'Adding…' : `Add Selected (${selected.size})`}
                </button>
              )}
            </div>
          </div>

          <div className="card overflow-hidden mb-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox"
                      checked={selected.size === results.length && results.length > 0}
                      onChange={toggleAll}
                      className="cursor-pointer" />
                  </th>
                  <th>Patent / App No.</th>
                  <th>Title</th>
                  <th>Assignee</th>
                  <th>Filed</th>
                  <th>Granted</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {results.map(p => {
                  const result    = saveResults[p.applicationNumber]
                  const managed   = p.inPortfolio || result === 'saved'
                  const isDisabled = managed || !!result
                  return (
                    <tr key={p.applicationNumber}
                      className={!isDisabled ? 'cursor-pointer' : ''}
                      style={{ opacity: managed ? 0.55 : 1 }}
                      onClick={() => !isDisabled && toggleSelect(p.applicationNumber)}>
                      <td onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={selected.has(p.applicationNumber)}
                          disabled={isDisabled}
                          onChange={() => toggleSelect(p.applicationNumber)}
                          className="cursor-pointer" />
                      </td>
                      <td>
                        <div className="font-mono text-xs" style={{ color: 'var(--patent-sky)' }}>
                          {p.patentNumber || p.applicationNumber}
                        </div>
                        {p.patentNumber && (
                          <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--patent-muted)' }}>{p.applicationNumber}</div>
                        )}
                      </td>
                      <td className="max-w-xs">
                        <p className="text-sm text-white line-clamp-2">{p.title}</p>
                      </td>
                      <td className="text-xs text-patent-muted max-w-[140px] truncate">{p.assignee || '—'}</td>
                      <td className="text-xs font-mono text-patent-muted whitespace-nowrap">{p.filingDate?.slice(0,10) || '—'}</td>
                      <td className="text-xs font-mono text-patent-muted whitespace-nowrap">{p.grantDate?.slice(0,10) || '—'}</td>
                      <td><span className={STATUS_BADGE[p.status] || 'status-badge'}>{p.status}</span></td>
                      <td className="whitespace-nowrap">
                        {(p.inPortfolio || result === 'saved') && (
                          <span className="flex items-center gap-1 text-xs" style={{ color: '#4ade80' }}>
                            <CheckCircle2 className="w-3.5 h-3.5" /> In portfolio
                          </span>
                        )}
                        {result === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-patent-muted">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-2">
                <button onClick={() => search(Math.max(0, page - 1) * PAGE_SIZE)} disabled={page === 0 || loading}
                  className="btn-ghost text-sm flex items-center gap-1" style={{ opacity: page === 0 ? 0.4 : 1 }}>
                  <ChevronLeft className="w-4 h-4" /> Prev
                </button>
                <span className="text-xs text-patent-muted">Page {page + 1} of {totalPages}</span>
                <button onClick={() => search((page + 1) * PAGE_SIZE)} disabled={page >= totalPages - 1 || loading}
                  className="btn-ghost text-sm flex items-center gap-1" style={{ opacity: page >= totalPages - 1 ? 0.4 : 1 }}>
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {!loading && !error && results.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(45,90,158,0.2)', border: '1px solid rgba(74,144,217,0.2)' }}>
            <Building2 className="w-7 h-7" style={{ color: 'rgba(74,144,217,0.5)' }} />
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)' }} className="font-medium mb-1">Search by company or assignee name</p>
          <p className="text-muted">Returns all USPTO patents filed by that company</p>
        </div>
      )}
    </>
  )
}

// ── Combined page ─────────────────────────────────────────────────────────────

const MODE_CONFIG: { mode: Mode; flag: string; label: string }[] = [
  { mode: 'US',      flag: '🇺🇸', label: 'United States' },
  { mode: 'EP',      flag: '🇪🇺', label: 'European Patent' },
  { mode: 'COMPANY', flag: '🔍', label: 'Research' },
]

export default function AddPatentPage() {
  const [mode, setMode] = useState<Mode>('US')

  const subtitle = {
    US:      'Fetch patent data live from the USPTO Open Data Portal and add to your portfolio',
    EP:      'Look up an EP patent by number and add it to your portfolio',
    COMPANY: 'Search USPTO by company or assignee name and bulk-add patents to your portfolio',
  }[mode]

  return (
    <div className={`p-8 animate-fade-in ${mode === 'COMPANY' ? '' : 'max-w-4xl'}`}>
      <div className="mb-8">
        <h1 className="page-title">Add Patent</h1>
        <p className="text-muted mt-1">{subtitle}</p>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {MODE_CONFIG.map(({ mode: m, flag, label }) => (
          <button key={m} onClick={() => setMode(m)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: mode === m ? 'linear-gradient(135deg, #1E64D4, #6333AE)' : 'transparent',
              color:      mode === m ? 'white' : 'var(--patent-muted)',
              boxShadow:  mode === m ? '0 2px 8px rgba(26,91,197,0.3)' : 'none',
            }}>
            <span>{flag}</span>{label}
          </button>
        ))}
      </div>

      {mode === 'US'      && <USLookup />}
      {mode === 'EP'      && <EPLookup />}
      {mode === 'COMPANY' && <CompanySearch />}
    </div>
  )
}
