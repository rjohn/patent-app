'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { GitBranch, ChevronRight, CheckCircle2, Clock, XCircle, Loader2, AlertCircle, Plus, X } from 'lucide-react'
import { useTheme } from '@/context/theme-context'

interface FamilyPatent {
  id: string
  patentNumber: string | null
  applicationNumber: string | null
  title: string
  status: string
}

interface Family {
  id: string
  name: string
  description: string | null
  technologyArea: string | null
  patents: FamilyPatent[]
}

function NewFamilyModal({ onClose, onCreated }: { onClose: () => void; onCreated: (f: Family) => void }) {
  const [name, setName]         = useState('')
  const [description, setDesc]  = useState('')
  const [techArea, setTechArea] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Family name is required'); return }
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/families', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null, technologyArea: techArea.trim() || null }),
      })
      if (!res.ok) throw new Error('Failed to create family')
      const family = await res.json()
      onCreated({ ...family, patents: [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="card p-6 max-w-md w-full">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-white">New Patent Family</h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label mb-1.5 block">Family Name <span style={{ color: '#f87171' }}>*</span></label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Machine Learning, Cryptography…"
              className="input w-full" autoFocus
              onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          <div>
            <label className="label mb-1.5 block">Technology Area</label>
            <input type="text" value={techArea} onChange={e => setTechArea(e.target.value)}
              placeholder="e.g. Artificial Intelligence, Security…"
              className="input w-full" />
          </div>
          <div>
            <label className="label mb-1.5 block">Description</label>
            <textarea value={description} onChange={e => setDesc(e.target.value)}
              placeholder="Brief description of this patent family…"
              className="input w-full" rows={3} style={{ resize: 'none' }} />
          </div>
        </div>

        {error && (
          <p className="text-xs mt-3" style={{ color: '#f87171' }}>{error}</p>
        )}

        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="btn-secondary text-sm" disabled={saving}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !name.trim()} className="btn-primary text-sm">
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</> : <><Plus className="w-3.5 h-3.5" /> Create Family</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function FamiliesPage() {
  const { theme } = useTheme()
  const light = theme === 'light'
  const [families, setFamilies] = useState<Family[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)

  const fetchFamilies = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/families')
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()
      setFamilies(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load families')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchFamilies() }, [fetchFamilies])

  const totalPatents = families.reduce((s, f) => s + f.patents.length, 0)

  return (
    <div className="p-8 animate-fade-in">
      {showModal && (
        <NewFamilyModal
          onClose={() => setShowModal(false)}
          onCreated={f => { setFamilies(prev => [...prev, f].sort((a,b) => a.name.localeCompare(b.name))); setShowModal(false) }}
        />
      )}

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="page-title">Patent Families</h1>
          <p className="text-muted mt-1">
            {loading ? 'Loading…' : `${families.length} famil${families.length !== 1 ? 'ies' : 'y'} · ${totalPatents} patent${totalPatents !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Family
        </button>
      </div>

      {error && (
        <div className="card p-4 mb-6 flex items-center gap-3" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
          <button onClick={fetchFamilies} className="btn-ghost text-sm ml-auto">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--patent-sky)' }} />
        </div>
      ) : families.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(45,90,158,0.2)', border: '1px solid rgba(74,144,217,0.2)' }}>
            <GitBranch className="w-6 h-6" style={{ color: 'rgba(74,144,217,0.5)' }} />
          </div>
          <p className="font-medium mb-1" style={{ color: light ? '#0F172A' : 'white' }}>No patent families yet</p>
          <p className="text-sm text-patent-muted mb-4">Group related patents into families to track continuation chains and technology areas</p>
          <button onClick={() => setShowModal(true)} className="btn-primary text-sm inline-flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create your first family
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {families.map(family => {
            const granted  = family.patents.filter(p => p.status === 'GRANTED').length
            const pending  = family.patents.filter(p => p.status === 'PENDING').length
            const abandoned = family.patents.filter(p => p.status === 'ABANDONED').length

            return (
              <div key={family.id} className="card-hover p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: 'rgba(45,90,158,0.2)', border: '1px solid rgba(74,144,217,0.2)' }}>
                      <GitBranch className="w-4 h-4" style={{ color: 'var(--patent-sky)' }} />
                    </div>
                    <div>
                      <h3 className="font-semibold" style={{ color: light ? '#0F172A' : 'white' }}>{family.name}</h3>
                      {family.technologyArea && (
                        <span className="text-xs px-2 py-0.5 rounded-full border"
                          style={{ background: 'rgba(74,144,217,0.1)', color: 'rgba(74,144,217,0.8)', borderColor: 'rgba(74,144,217,0.2)' }}>
                          {family.technologyArea}
                        </span>
                      )}
                    </div>
                  </div>
                  <Link href={`/families/${family.id}`} className="btn-ghost p-1.5 flex items-center gap-1 text-xs">
                    Tree <ChevronRight className="w-3 h-3" />
                  </Link>
                </div>

                {family.description && (
                  <p className="text-xs text-patent-muted mb-4">{family.description}</p>
                )}

                <div className="flex items-center gap-4 mb-4 text-xs">
                  {granted  > 0 && <span className="flex items-center gap-1.5" style={{ color: '#4ade80' }}><CheckCircle2 className="w-3.5 h-3.5" /> {granted} granted</span>}
                  {pending  > 0 && <span className="flex items-center gap-1.5" style={{ color: '#facc15' }}><Clock className="w-3.5 h-3.5" /> {pending} pending</span>}
                  {abandoned > 0 && <span className="flex items-center gap-1.5" style={{ color: '#f87171' }}><XCircle className="w-3.5 h-3.5" /> {abandoned} abandoned</span>}
                  <span className="text-patent-muted ml-auto">{family.patents.length} total</span>
                </div>

                {family.patents.length === 0 ? (
                  <p className="text-xs text-patent-muted italic">No patents assigned to this family yet</p>
                ) : (
                  <div className="space-y-1.5">
                    {family.patents.slice(0, 4).map(p => (
                      <Link key={p.id} href={`/patents/${p.id}`}
                        className="flex items-center gap-2 p-2 rounded-lg transition-colors group"
                        style={{ ['--hover-bg' as string]: light ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = light ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <span className="font-mono text-[11px] w-32 flex-shrink-0" style={{ color: 'var(--patent-sky)' }}>
                          {p.patentNumber || p.applicationNumber || '—'}
                        </span>
                        <span className="text-xs flex-1 truncate" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.7)' }}>
                          {p.title}
                        </span>
                        <span className="text-[10px] flex-shrink-0" style={{
                          color: p.status === 'GRANTED' ? '#4ade80' : p.status === 'ABANDONED' ? '#f87171' : '#facc15'
                        }}>{p.status}</span>
                      </Link>
                    ))}
                    {family.patents.length > 4 && (
                      <Link href={`/families/${family.id}`} className="text-xs text-patent-muted hover:text-patent-sky transition-colors pl-2">
                        +{family.patents.length - 4} more patents →
                      </Link>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
