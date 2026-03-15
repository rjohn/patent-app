'use client'

import { useState, useEffect, use, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, GitBranch, Loader2, AlertCircle, Plus, Trash2,
  Pencil, Check, X, Search, ExternalLink
} from 'lucide-react'
import dynamic from 'next/dynamic'
import type { PatentNode } from '@/components/FamilyTree'

const FamilyTree = dynamic(() => import('@/components/FamilyTree'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96 text-patent-muted">
      <Loader2 className="w-6 h-6 animate-spin mr-3" style={{ color: 'var(--patent-sky)' }} /> Loading tree…
    </div>
  ),
})

interface Patent {
  id: string
  patentNumber: string | null
  applicationNumber: string | null
  epNumber: string | null
  jurisdiction: string | null
  title: string
  status: string
  type: string
  filingDate: string | null
  grantDate: string | null
  continuationType: string | null
  parentPatentId: string | null
}

interface Family {
  id: string
  name: string
  description: string | null
  technologyArea: string | null
  patents: Patent[]
}

function buildTree(patents: Patent[]): PatentNode | null {
  if (patents.length === 0) return null
  const nodeMap = new Map<string, PatentNode>()
  patents.forEach(p => nodeMap.set(p.id, {
    id: p.id,
    number: p.patentNumber || p.applicationNumber || (p.epNumber ? `EP${p.epNumber}` : '—'),
    title: p.title,
    status: p.status,
    type: p.type,
    filedDate: p.filingDate?.slice(0, 10) || undefined,
    grantDate: p.grantDate?.slice(0, 10) || undefined,
    continuationType: p.continuationType || undefined,
    children: [],
  }))
  let root: PatentNode | null = null
  patents.forEach(p => {
    const node = nodeMap.get(p.id)!
    if (p.parentPatentId && nodeMap.has(p.parentPatentId)) {
      nodeMap.get(p.parentPatentId)!.children!.push(node)
    } else {
      if (!root || (p.filingDate && (!root.filedDate || p.filingDate < root.filedDate))) root = node
    }
  })
  return root
}

function patentLabel(p: Patent) {
  const num = p.jurisdiction === 'EP' || p.epNumber
    ? `EP${p.epNumber || ''}`
    : (p.patentNumber || p.applicationNumber || '—')
  return `${num} — ${p.title}`
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    GRANTED: 'status-granted', PENDING: 'status-pending',
    ABANDONED: 'status-abandoned', EXPIRED: 'status-expired',
  }
  return <span className={map[status] || 'status-badge'}>{status}</span>
}

const CONTINUATION_TYPES = [
  { value: '', label: 'None / Parent' },
  { value: 'CONTINUATION', label: 'Continuation (CON)' },
  { value: 'CONTINUATION_IN_PART', label: 'Continuation-in-Part (CIP)' },
  { value: 'DIVISIONAL', label: 'Divisional (DIV)' },
  { value: 'REISSUE', label: 'Reissue' },
]

// ── Add Patents Modal ─────────────────────────────────────────────────────────
function AddPatentsModal({
  familyId, existingIds, onClose, onAdded,
}: { familyId: string; existingIds: Set<string>; onClose: () => void; onAdded: () => void }) {
  const [search, setSearch]     = useState('')
  const [results, setResults]   = useState<Patent[]>([])
  const [loading, setLoading]   = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ q: search, pageSize: '50' })
        const res = await fetch(`/api/patents?${params}`)
        const data = await res.json()
        // Filter out patents already in this family client-side as safety net
        setResults((data.patents || []).filter((p: Patent) => !existingIds.has(p.id)))
      } finally { setLoading(false) }
    }, 300)
    return () => clearTimeout(t)
  }, [search, existingIds])

  const toggle = (id: string) => setSelected(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const save = async () => {
    if (!selected.size) return
    setSaving(true)
    setError(null)
    try {
      await Promise.all(Array.from(selected).map(patentId =>
        fetch(`/api/patents/${patentId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ familyId }),
        })
      ))
      onAdded()
    } catch { setError('Failed to add patents') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="card w-full max-w-xl flex flex-col" style={{ maxHeight: '80vh' }}>
        <div className="flex items-center justify-between p-5 pb-0">
          <h2 className="font-semibold text-white">Add Patents to Family</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-5 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patent-muted" />
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by number or title…"
              className="input w-full pl-9 text-sm" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-3 space-y-1">
          {loading && <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-patent-muted" /></div>}
          {!loading && results.length === 0 && (
            <p className="text-center text-patent-muted text-sm py-6">
              {search ? 'No unassigned patents match' : 'No unassigned patents found'}
            </p>
          )}
          {results.map(p => (
            <button key={p.id} onClick={() => toggle(p.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors"
              style={{
                background: selected.has(p.id) ? 'rgba(74,144,217,0.15)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selected.has(p.id) ? 'rgba(74,144,217,0.4)' : 'rgba(255,255,255,0.06)'}`,
              }}>
              <div className="w-4 h-4 rounded flex-shrink-0 flex items-center justify-center"
                style={{ background: selected.has(p.id) ? 'var(--patent-sky)' : 'rgba(255,255,255,0.1)' }}>
                {selected.has(p.id) && <Check className="w-3 h-3 text-white" />}
              </div>
              <div className="min-w-0">
                <div className="font-mono text-xs" style={{ color: 'var(--patent-sky)' }}>
                  {patentLabel(p).split(' — ')[0]}
                </div>
                <div className="text-sm text-white truncate">{p.title}</div>
              </div>
              <StatusBadge status={p.status} />
            </button>
          ))}
        </div>

        {error && <p className="px-5 text-sm" style={{ color: '#f87171' }}>{error}</p>}

        <div className="p-5 pt-3 flex items-center justify-between gap-3"
          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="text-sm text-patent-muted">{selected.size} selected</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-ghost text-sm">Cancel</button>
            <button onClick={save} disabled={!selected.size || saving} className="btn-primary text-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : `Add ${selected.size || ''} Patent${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function FamilyDetailPage({ params }: { params: any }) {
  const resolvedParams = params instanceof Promise ? use(params) : params
  const id = resolvedParams.id as string

  const [family, setFamily]         = useState<Family | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [view, setView]             = useState<'tree' | 'list'>('tree')

  // Edit family metadata
  const [editingMeta, setEditingMeta]   = useState(false)
  const [metaName, setMetaName]         = useState('')
  const [metaDesc, setMetaDesc]         = useState('')
  const [metaArea, setMetaArea]         = useState('')
  const [savingMeta, setSavingMeta]     = useState(false)

  // Add patents modal
  const [showAddModal, setShowAddModal] = useState(false)

  // Remove patent
  const [removingId, setRemovingId]     = useState<string | null>(null)

  // Edit continuation type inline
  const [editingCon, setEditingCon]     = useState<string | null>(null)  // patent id

  const load = useCallback(() => {
    setLoading(true)
    fetch(`/api/families/${id}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(f => { setFamily(f); setMetaName(f.name); setMetaDesc(f.description || ''); setMetaArea(f.technologyArea || '') })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  useEffect(() => { load() }, [load])

  const saveMeta = async () => {
    if (!family) return
    setSavingMeta(true)
    await fetch(`/api/families/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: metaName, description: metaDesc || null, technologyArea: metaArea || null }),
    })
    setSavingMeta(false)
    setEditingMeta(false)
    load()
  }

  const removePatent = async (patentId: string) => {
    setRemovingId(patentId)
    await fetch(`/api/patents/${patentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familyId: null }),
    })
    setRemovingId(null)
    load()
  }

  const saveContinuation = async (patentId: string, continuationType: string, parentPatentId: string) => {
    await fetch(`/api/patents/${patentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        continuationType: continuationType || null,
        parentPatentId: parentPatentId || null,
      }),
    })
    setEditingCon(null)
    load()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--patent-sky)' }} />
    </div>
  )

  if (error || !family) return (
    <div className="p-8">
      <Link href="/families" className="flex items-center gap-1.5 text-sm text-patent-muted hover:text-white mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Families
      </Link>
      <div className="card p-6 text-center" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
        <AlertCircle className="w-8 h-8 mx-auto mb-3" style={{ color: '#f87171' }} />
        <p style={{ color: '#f87171' }}>{error === '404' ? 'Family not found' : 'Failed to load family'}</p>
      </div>
    </div>
  )

  const tree = buildTree(family.patents)
  const existingIds = new Set(family.patents.map(p => p.id))

  return (
    <div className="p-8 animate-fade-in">
      <div className="mb-6">
        <Link href="/families" className="flex items-center gap-1.5 text-sm text-patent-muted hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Families
        </Link>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        {editingMeta ? (
          <div className="flex-1 space-y-2 max-w-lg">
            <input value={metaName} onChange={e => setMetaName(e.target.value)}
              className="input w-full text-lg font-semibold" placeholder="Family name" />
            <input value={metaDesc} onChange={e => setMetaDesc(e.target.value)}
              className="input w-full text-sm" placeholder="Description (optional)" />
            <input value={metaArea} onChange={e => setMetaArea(e.target.value)}
              className="input w-full text-sm" placeholder="Technology area (optional)" />
            <div className="flex gap-2">
              <button onClick={saveMeta} disabled={savingMeta} className="btn-primary text-sm">
                {savingMeta ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Check className="w-4 h-4" /> Save</>}
              </button>
              <button onClick={() => setEditingMeta(false)} className="btn-ghost text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(45,90,158,0.2)', border: '1px solid rgba(74,144,217,0.2)' }}>
              <GitBranch className="w-6 h-6" style={{ color: 'var(--patent-sky)' }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="page-title">{family.name}</h1>
                <button onClick={() => setEditingMeta(true)} className="btn-ghost p-1.5" title="Edit family">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-muted mt-0.5">
                {family.description && <>{family.description} · </>}
                {family.patents.length} patent{family.patents.length !== 1 ? 's' : ''}
                {family.technologyArea && <> · {family.technologyArea}</>}
              </p>
            </div>
          </div>
        )}

        <button onClick={() => setShowAddModal(true)} className="btn-primary text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Add Patents
        </button>
      </div>

      {/* View toggle */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg w-fit" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {(['tree', 'list'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize ${view === v ? 'bg-patent-navy text-white' : 'text-patent-muted hover:text-white'}`}>
            {v === 'tree' ? 'Family Tree' : 'List View'}
          </button>
        ))}
      </div>

      {/* Tree view */}
      {view === 'tree' && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="section-title">Continuation Chain</h2>
            <div className="flex items-center gap-3 text-xs text-patent-muted">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> CON</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400 inline-block" /> CIP</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> DIV</span>
            </div>
          </div>
          {tree ? (
            <FamilyTree root={tree} height={480} />
          ) : (
            <div className="text-center py-16 text-patent-muted text-sm">
              No continuation relationships to display
            </div>
          )}
        </div>
      )}

      {/* List view */}
      {view === 'list' && (
        <div className="card overflow-hidden">
          {family.patents.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-patent-muted text-sm">No patents in this family yet</p>
              <button onClick={() => setShowAddModal(true)} className="btn-primary text-sm inline-flex mt-3 items-center gap-2">
                <Plus className="w-4 h-4" /> Add Patents
              </button>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patent</th><th>Title</th><th>Relationship</th>
                  <th>Filed</th><th>Granted</th><th>Status</th><th></th>
                </tr>
              </thead>
              <tbody>
                {family.patents.map(p => {
                  const isRoot = !p.parentPatentId
                  const isEditingThis = editingCon === p.id
                  const num = (p.jurisdiction === 'EP' || p.epNumber)
                    ? `EP${p.epNumber || ''}`
                    : (p.patentNumber || p.applicationNumber || '—')

                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/patents/${p.id}`} className="mono hover:text-patent-sky transition-colors text-xs flex items-center gap-1">
                          {num} <ExternalLink className="w-3 h-3 opacity-50" />
                        </Link>
                      </td>
                      <td className="max-w-xs text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>{p.title}</td>
                      <td>
                        {isEditingThis ? (
                          <ConEditor patent={p} allPatents={family.patents} onSave={saveContinuation} onCancel={() => setEditingCon(null)} />
                        ) : (
                          <button onClick={() => setEditingCon(p.id)}
                            className="flex items-center gap-1.5 group"
                            title="Click to edit relationship">
                            <span className="text-xs px-2 py-0.5 rounded-full"
                              style={{
                                background: isRoot ? 'rgba(74,144,217,0.15)' : 'rgba(168,85,247,0.15)',
                                color: isRoot ? 'var(--patent-sky)' : '#c084fc',
                              }}>
                              {isRoot ? 'Parent' : (p.continuationType?.replace(/_/g, ' ') || 'Related')}
                            </span>
                            <Pencil className="w-3 h-3 text-patent-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </td>
                      <td className="text-xs text-patent-muted">{p.filingDate?.slice(0,10) || '—'}</td>
                      <td className="text-xs text-patent-muted">{p.grantDate?.slice(0,10) || '—'}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>
                        <button onClick={() => removePatent(p.id)} disabled={removingId === p.id}
                          className="btn-ghost p-1.5 opacity-0 group-hover:opacity-100"
                          style={{ color: 'rgba(239,68,68,0.6)' }} title="Remove from family">
                          {removingId === p.id
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showAddModal && (
        <AddPatentsModal
          familyId={id}
          existingIds={existingIds}
          onClose={() => setShowAddModal(false)}
          onAdded={() => { setShowAddModal(false); load() }}
        />
      )}
    </div>
  )
}

// ── Inline continuation editor ────────────────────────────────────────────────
function ConEditor({ patent, allPatents, onSave, onCancel }: {
  patent: Patent
  allPatents: Patent[]
  onSave: (id: string, type: string, parentId: string) => void
  onCancel: () => void
}) {
  const [type, setType]     = useState(patent.continuationType || '')
  const [parent, setParent] = useState(patent.parentPatentId || '')

  return (
    <div className="flex flex-col gap-1.5 py-1">
      <select value={type} onChange={e => setType(e.target.value)} className="input text-xs py-1">
        {CONTINUATION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
      </select>
      {type && (
        <select value={parent} onChange={e => setParent(e.target.value)} className="input text-xs py-1">
          <option value="">— Select parent —</option>
          {allPatents.filter(p => p.id !== patent.id).map(p => (
            <option key={p.id} value={p.id}>
              {(p.jurisdiction === 'EP' || p.epNumber) ? `EP${p.epNumber}` : (p.patentNumber || p.applicationNumber || '—')}
            </option>
          ))}
        </select>
      )}
      <div className="flex gap-1">
        <button onClick={() => onSave(patent.id, type, parent)} className="btn-primary text-xs py-1 px-2">
          <Check className="w-3 h-3" />
        </button>
        <button onClick={onCancel} className="btn-ghost text-xs py-1 px-2">
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
