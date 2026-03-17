'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import {
  Search, Plus, CheckCircle2, AlertCircle, Loader2, X,
  ChevronDown, ChevronUp, Tag, Users, Building2, Calendar,
  FileText, GitBranch, ExternalLink,
} from 'lucide-react'

// ── Shared ────────────────────────────────────────────────────────────────────

type Mode = 'US' | 'EP'

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

// ── Combined page ─────────────────────────────────────────────────────────────

export default function AddPatentPage() {
  const [mode, setMode] = useState<Mode>('US')

  return (
    <div className="p-8 animate-fade-in max-w-4xl">
      <div className="mb-8">
        <h1 className="page-title">Add Patent</h1>
        <p className="text-muted mt-1">
          {mode === 'US'
            ? 'Fetch patent data live from the USPTO Open Data Portal and add to your portfolio'
            : 'Look up an EP patent by number and add it to your portfolio'}
        </p>
      </div>

      {/* US / EP toggle */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {(['US', 'EP'] as Mode[]).map(m => (
          <button key={m} onClick={() => setMode(m)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background:  mode === m ? 'linear-gradient(135deg, #1E64D4, #6333AE)' : 'transparent',
              color:       mode === m ? 'white' : 'var(--patent-muted)',
              boxShadow:   mode === m ? '0 2px 8px rgba(26,91,197,0.3)' : 'none',
            }}>
            <span>{m === 'US' ? '🇺🇸' : '🇪🇺'}</span>
            {m === 'US' ? 'United States' : 'European Patent'}
          </button>
        ))}
      </div>

      {mode === 'US' ? <USLookup /> : <EPLookup />}
    </div>
  )
}
