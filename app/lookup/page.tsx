'use client'

import { useState, useRef, KeyboardEvent } from 'react'
import { Search, Plus, CheckCircle2, AlertCircle, Loader2, X, ChevronDown, ChevronUp, Tag, Users, Building2, Calendar, FileText, GitBranch } from 'lucide-react'

interface PatentPreview {
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
  number: string
  preview: PatentPreview | null
  lookupStatus: LookupStatus
  saveStatus: SaveStatus
  error: string | null
  expanded: boolean
}

export default function LookupPage() {
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

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') lookup(input)
  }

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const numbers = e.clipboardData.getData('text').split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
    if (numbers.length > 1) { e.preventDefault(); numbers.forEach(lookup) }
  }

  const savedCount   = queue.filter(q => q.saveStatus === 'saved').length
  const pendingCount = queue.filter(q => q.lookupStatus === 'found' && q.saveStatus === 'idle').length

  return (
    <div className="p-8 animate-fade-in max-w-4xl">
      <div className="mb-8">
        <h1 className="page-title">Add Patents by Number</h1>
        <p className="text-muted mt-1">Fetch patent data live from the USPTO Open Data Portal and add to your portfolio</p>
      </div>

      {/* Search bar */}
      <div className="card p-5 mb-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patent-muted pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="e.g. 11234567 or US10,987,654 B2 — press Enter"
              className="input pl-9"
              style={{ width: '100%' }}
              autoFocus
            />
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
            <p>💡 Data sourced from <span style={{ color: 'var(--patent-sky)' }}>api.uspto.gov</span> Patent File Wrapper API</p>
          </div>
        </div>
      </div>

      {/* Summary bar */}
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

      {/* Queue */}
      <div className="space-y-3">
        {queue.map(item => (
          <PatentCard key={item.number} item={item}
            onSave={() => save(item)}
            onRemove={() => setQueue(q => q.filter(i => i.number !== item.number))}
            onToggle={() => updateItem(item.number, { expanded: !item.expanded })}
          />
        ))}
      </div>

      {/* Empty state */}
      {queue.length === 0 && (
        <div className="text-center py-20">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(45,90,158,0.2)', border: '1px solid rgba(74,144,217,0.2)' }}>
            <Search className="w-7 h-7" style={{ color: 'rgba(74,144,217,0.5)' }} />
          </div>
          <p style={{ color: 'rgba(255,255,255,0.6)' }} className="font-medium mb-1">Enter a patent number above</p>
          <p className="text-muted">Data is fetched live from the USPTO Open Data Portal</p>
        </div>
      )}
    </div>
  )
}

function PatentCard({ item, onSave, onRemove, onToggle }: {
  item: QueueItem; onSave: () => void; onRemove: () => void; onToggle: () => void
}) {
  const { number, preview, lookupStatus, saveStatus, error, expanded } = item

  const borderStyle =
    saveStatus === 'saved'       ? { borderColor: 'rgba(34,197,94,0.3)' } :
    saveStatus === 'duplicate'   ? { borderColor: 'rgba(234,179,8,0.3)' } :
    saveStatus === 'error'       ? { borderColor: 'rgba(239,68,68,0.3)' } :
    lookupStatus === 'not_found' ? { borderColor: 'rgba(239,68,68,0.2)' } :
    lookupStatus === 'found'     ? { borderColor: 'rgba(74,144,217,0.2)' } :
    {}

  return (
    <div className="card overflow-hidden" style={borderStyle}>
      {/* Header */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="flex-shrink-0">
          {lookupStatus === 'loading'                            && <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--patent-sky)' }} />}
          {lookupStatus === 'found' && saveStatus === 'idle'    && <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: 'var(--patent-sky)', background: 'rgba(74,144,217,0.2)' }} />}
          {lookupStatus === 'found' && saveStatus === 'saving'  && <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--patent-gold)' }} />}
          {lookupStatus === 'found' && saveStatus === 'saved'   && <CheckCircle2 className="w-5 h-5" style={{ color: '#4ade80' }} />}
          {lookupStatus === 'found' && saveStatus === 'duplicate' && <AlertCircle className="w-5 h-5" style={{ color: '#facc15' }} />}
          {lookupStatus === 'found' && saveStatus === 'error'   && <AlertCircle className="w-5 h-5" style={{ color: '#f87171' }} />}
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
            {saveStatus === 'saved'     && <span className="status-granted">Saved</span>}
            {saveStatus === 'duplicate' && <span className="status-pending">Already in portfolio</span>}
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

      {/* Expanded detail */}
      {preview && expanded && (
        <div className="px-5 py-4 animate-slide-up" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="grid grid-cols-2 gap-3 text-xs mb-4">
            {preview.inventors.length > 0 && (
              <MetaItem icon={<Users className="w-3.5 h-3.5" />} label="Inventors" value={preview.inventors.join(', ')} />
            )}
            {preview.assignee && (
              <MetaItem icon={<Building2 className="w-3.5 h-3.5" />} label="Assignee" value={preview.assignee} />
            )}
            {preview.filing_date && (
              <MetaItem icon={<Calendar className="w-3.5 h-3.5" />} label="Filed" value={preview.filing_date} />
            )}
            {preview.grant_date && (
              <MetaItem icon={<Calendar className="w-3.5 h-3.5" />} label="Granted" value={preview.grant_date} />
            )}
            {preview.expiration_date && (
              <MetaItem icon={<Calendar className="w-3.5 h-3.5" />} label="Expires" value={preview.expiration_date} />
            )}
            {preview.examiner && (
              <MetaItem icon={<FileText className="w-3.5 h-3.5" />} label="Examiner" value={preview.examiner} />
            )}
            {preview.art_unit && (
              <MetaItem icon={<Tag className="w-3.5 h-3.5" />} label="Art Unit" value={preview.art_unit} />
            )}
            {preview.entity_status && (
              <MetaItem icon={<Building2 className="w-3.5 h-3.5" />} label="Entity Status" value={preview.entity_status} />
            )}
            <MetaItem icon={<Tag className="w-3.5 h-3.5" />} label="Type" value={preview.type} />
            {preview.status && (
              <MetaItem icon={<CheckCircle2 className="w-3.5 h-3.5" />} label="Status" value={preview.status} />
            )}
            {preview.continuation_type && (
              <MetaItem icon={<GitBranch className="w-3.5 h-3.5" />} label="Continuation" value={preview.continuation_type.replace(/_/g, ' ')} />
            )}
            {preview.parent_app_number && (
              <MetaItem icon={<GitBranch className="w-3.5 h-3.5" />} label="Parent App" value={preview.parent_app_number} />
            )}
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
