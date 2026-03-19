'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Plus, Trash2, Pencil, Loader2, ChevronRight, X } from 'lucide-react'
import { useTheme } from '@/context/theme-context'

interface Watchlist {
  id: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  _count: { entries: number }
}

export default function WatchlistsPage() {
  const router = useRouter()
  const { theme } = useTheme()
  const light = theme === 'light'

  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/watchlists')
      const d = await r.json()
      setWatchlists(d.watchlists || [])
    } finally {
      setLoading(false)
    }
  }

  async function create() {
    if (!createName.trim()) return
    setCreating(true)
    try {
      const r = await fetch('/api/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: createName, description: createDesc }),
      })
      const d = await r.json()
      if (r.ok) {
        setShowCreate(false)
        setCreateName('')
        setCreateDesc('')
        router.push(`/watchlists/${d.watchlist.id}`)
      }
    } finally {
      setCreating(false)
    }
  }

  async function deleteWatchlist(id: string) {
    setDeleteId(id)
    try {
      await fetch(`/api/watchlists/${id}`, { method: 'DELETE' })
      setWatchlists(w => w.filter(x => x.id !== id))
    } finally {
      setDeleteId(null)
    }
  }

  async function saveEdit() {
    if (!editId || !editName.trim()) return
    setSaving(true)
    try {
      const r = await fetch(`/api/watchlists/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDesc }),
      })
      const d = await r.json()
      if (r.ok) {
        setWatchlists(w => w.map(x => x.id === editId ? { ...x, name: d.watchlist.name, description: d.watchlist.description } : x))
        setEditId(null)
      }
    } finally {
      setSaving(false)
    }
  }

  const muted = light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)'

  return (
    <div className="p-8 animate-fade-in max-w-4xl">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="page-title">Watchlists</h1>
          <p className="text-muted mt-1">Track competitor portfolios and monitor patents of interest</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          New Watchlist
        </button>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card p-6 w-full max-w-md mx-4" style={{ background: light ? '#fff' : 'var(--patent-navy)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-lg" style={{ color: light ? '#0F172A' : 'white' }}>New Watchlist</h2>
              <button onClick={() => setShowCreate(false)} className="btn-ghost p-1">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label mb-1.5 block">Name</label>
                <input
                  autoFocus
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && create()}
                  placeholder="e.g. Competitor A Portfolio"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="label mb-1.5 block">Description <span className="text-patent-muted">(optional)</span></label>
                <input
                  value={createDesc}
                  onChange={e => setCreateDesc(e.target.value)}
                  placeholder="What are you tracking?"
                  className="input w-full"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={create} disabled={!createName.trim() || creating} className="btn-primary flex items-center gap-2 flex-1 justify-center">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="card p-6 w-full max-w-md mx-4" style={{ background: light ? '#fff' : 'var(--patent-navy)' }}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-lg" style={{ color: light ? '#0F172A' : 'white' }}>Edit Watchlist</h2>
              <button onClick={() => setEditId(null)} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="label mb-1.5 block">Name</label>
                <input autoFocus value={editName} onChange={e => setEditName(e.target.value)} className="input w-full" />
              </div>
              <div>
                <label className="label mb-1.5 block">Description</label>
                <input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="input w-full" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={saveEdit} disabled={!editName.trim() || saving} className="btn-primary flex items-center gap-2 flex-1 justify-center">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save
              </button>
              <button onClick={() => setEditId(null)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--patent-sky)' }} />
        </div>
      ) : watchlists.length === 0 ? (
        <div className="card p-12 text-center">
          <Eye className="w-12 h-12 mx-auto mb-4 opacity-20" style={{ color: 'var(--patent-sky)' }} />
          <p className="font-medium" style={{ color: light ? '#0F172A' : 'white' }}>No watchlists yet</p>
          <p className="text-sm text-patent-muted mt-1">Create a watchlist to track competitor patents and portfolios</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-5 inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create your first watchlist
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {watchlists.map(wl => (
            <div
              key={wl.id}
              className="card p-5 flex items-center gap-4 cursor-pointer transition-colors"
              style={{ borderColor: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)' }}
              onClick={() => router.push(`/watchlists/${wl.id}`)}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--patent-sky)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)')}
            >
              <div className="p-2.5 rounded-lg flex-shrink-0" style={{ background: muted }}>
                <Eye className="w-5 h-5" style={{ color: 'var(--patent-sky)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold" style={{ color: light ? '#0F172A' : 'white' }}>{wl.name}</div>
                {wl.description && (
                  <p className="text-sm text-patent-muted mt-0.5 truncate">{wl.description}</p>
                )}
                <p className="text-xs text-patent-muted mt-1">
                  {wl._count.entries} patent{wl._count.entries !== 1 ? 's' : ''} · Updated {new Date(wl.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button
                  onClick={() => { setEditId(wl.id); setEditName(wl.name); setEditDesc(wl.description || '') }}
                  className="btn-ghost p-1.5 text-patent-muted hover:text-white"
                  title="Rename"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => deleteWatchlist(wl.id)}
                  disabled={deleteId === wl.id}
                  className="btn-ghost p-1.5 text-patent-muted hover:text-red-400"
                  title="Delete"
                >
                  {deleteId === wl.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                </button>
                <ChevronRight className="w-4 h-4 text-patent-muted" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
