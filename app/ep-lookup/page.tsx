'use client'

import { useState } from 'react'
import { Search, Plus, CheckCircle2, AlertCircle, Loader2, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'

interface PatentData {
  ep_number: string
  publication_number: string | null
  title: string
  status: string
  type: string
  jurisdiction: string
  filing_date: string | null
  publication_date: string | null
  grant_date: string | null
  expiration_date: string | null
  inventors: string[]
  assignee: string | null
  cpc_codes: string[]
  abstract: string | null
  claims: string[]
}

function fmt(d: string | null) { return d ? d.slice(0, 10) : '—' }

const STATUS_COLORS: Record<string, string> = {
  GRANTED: '#4ade80', PENDING: '#facc15', PUBLISHED: '#60a5fa', ABANDONED: '#f87171',
}

export default function EpLookupPage() {
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [patent, setPatent]     = useState<PatentData | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [saved, setSaved]       = useState(false)
  const [showClaims, setShowClaims] = useState(false)

  const lookup = async () => {
    if (!input.trim()) return
    setLoading(true); setError(null); setPatent(null); setSaved(false)
    try {
      const res = await fetch(`/api/patents/ep-lookup?number=${encodeURIComponent(input.trim())}`)
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
      const res = await fetch('/api/patents/ep-lookup', {
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
    <div className="p-8 animate-fade-in max-w-3xl">
      <div className="mb-6">
        <h1 className="page-title">Add European Patent</h1>
        <p className="text-muted mt-1">Look up an EP patent by number and add it to your portfolio</p>
      </div>

      {/* EPO key warning */}
      {needsEpoKey && (
        <div className="card p-4 mb-5 flex gap-3" style={{ borderColor: 'rgba(250,204,21,0.3)', background: 'rgba(250,204,21,0.05)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#facc15' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: '#facc15' }}>EPO API credentials required</p>
            <p className="text-xs text-patent-muted mt-1">
              Register free at{' '}
              <a href="https://developers.epo.org" target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
                developers.epo.org
              </a>
              {' '}then add <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.1)' }}>EPO_OPS_KEY</code> and{' '}
              <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.1)' }}>EPO_OPS_SECRET</code> to your .env.local
            </p>
          </div>
        </div>
      )}

      {/* Search bar */}
      <div className="card p-5 mb-5">
        <label className="block text-sm font-medium text-white mb-2">EP Patent Number</label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patent-muted" />
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && lookup()}
              placeholder="e.g. EP1234567 or 1234567"
              className="input pl-9 w-full"
            />
          </div>
          <button onClick={lookup} disabled={loading || !input.trim()} className="btn-primary flex items-center gap-2 px-5">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            {loading ? 'Searching…' : 'Look Up'}
          </button>
        </div>
        <p className="text-xs text-patent-muted mt-2">
          Accepts: EP1234567 · EP 1234567 · 1234567 · EP1234567B1
        </p>
      </div>

      {/* Error */}
      {error && !needsEpoKey && (
        <div className="card p-4 mb-5 flex items-center gap-3" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
        </div>
      )}

      {/* Result */}
      {patent && (
        <div className="card overflow-hidden">
          {/* Header */}
          <div className="p-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="font-mono text-sm font-bold" style={{ color: 'var(--patent-sky)' }}>
                    EP{patent.ep_number}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold"
                    style={{ background: 'rgba(74,144,217,0.15)', color: 'var(--patent-sky)' }}>
                    European Patent
                  </span>
                  <span className="text-xs font-semibold" style={{ color: STATUS_COLORS[patent.status] || 'white' }}>
                    {patent.status}
                  </span>
                </div>
                <h2 className="text-base font-semibold text-white leading-snug">{patent.title}</h2>
                {patent.assignee && (
                  <p className="text-sm text-patent-muted mt-1">{patent.assignee}</p>
                )}
              </div>
              <a href={`https://patents.google.com/patent/EP${patent.ep_number}`}
                target="_blank" rel="noopener noreferrer"
                className="btn-ghost flex items-center gap-1.5 text-xs flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5" /> Google Patents
              </a>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-3 gap-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            {[
              { label: 'Filed',       value: fmt(patent.filing_date) },
              { label: 'Published',   value: fmt(patent.publication_date) },
              { label: 'Granted',     value: fmt(patent.grant_date) },
              { label: 'Expires',     value: fmt(patent.expiration_date) },
              { label: 'Jurisdiction', value: 'European Patent Office' },
              { label: 'Type',        value: patent.type },
            ].map((f, i) => (
              <div key={i} className="px-5 py-3" style={{ borderRight: i % 3 !== 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                <p className="text-xs text-patent-muted mb-0.5">{f.label}</p>
                <p className="text-sm text-white">{f.value}</p>
              </div>
            ))}
          </div>

          {/* Inventors + CPC */}
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
                        style={{ background: 'rgba(74,144,217,0.12)', color: 'var(--patent-sky)' }}>
                        {c.trim()}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Abstract */}
          {patent.abstract && (
            <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-xs text-patent-muted mb-2">Abstract</p>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{patent.abstract}</p>
            </div>
          )}

          {/* Claims toggle */}
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
                      <span className="font-mono text-xs font-bold mr-2" style={{ color: 'var(--patent-sky)' }}>
                        {i + 1}.
                      </span>
                      {c.replace(/^\d+\.\s*/, '')}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Add button */}
          <div className="px-5 py-4 flex items-center justify-between">
            <p className="text-xs text-patent-muted">
              Abstract and claims will be saved with this patent
            </p>
            {saved ? (
              <div className="flex items-center gap-2 text-sm" style={{ color: '#4ade80' }}>
                <CheckCircle2 className="w-4 h-4" /> Added to portfolio
              </div>
            ) : (
              <button onClick={save} disabled={saving}
                className="btn-primary flex items-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {saving ? 'Adding…' : 'Add to Portfolio'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
