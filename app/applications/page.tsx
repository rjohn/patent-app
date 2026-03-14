'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { FileText, Loader2, AlertCircle, ExternalLink, RefreshCw, GitBranch } from 'lucide-react'

interface Application {
  id: string
  applicationNumber: string | null
  patentNumber: string | null
  title: string
  status: string
  filingDate: string | null
  grantDate: string | null
  assignee: string | null
  continuationType: string | null
  parentPatent: { id: string; patentNumber: string | null; title: string } | null
  family: { id: string; name: string } | null
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    GRANTED: 'status-granted', PENDING: 'status-pending',
    ABANDONED: 'status-abandoned', EXPIRED: 'status-expired', PUBLISHED: 'status-published',
  }
  return <span className={map[status] || 'status-badge'}>{status}</span>
}

export default function ApplicationsPage() {
  const [apps, setApps]     = useState<Application[]>([])
  const [total, setTotal]   = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/patents?source=CONTINUATION&pageSize=100&sortBy=filingDate&sortDir=desc')
      .then(r => r.json())
      .then(d => { setApps(d.patents || []); setTotal(d.total || 0) })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  const refresh = async (id: string) => {
    setRefreshing(id)
    await fetch(`/api/patents/refresh?id=${id}`)
    setRefreshing(null)
    load()
  }

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-patent-muted hover:text-white transition-colors mb-3">
            ← Dashboard
          </Link>
          <h1 className="page-title">Tracked Applications</h1>
          <p className="text-muted mt-1">Patent applications imported from continuity references</p>
        </div>
        <button onClick={load} className="btn-ghost text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error && (
        <div className="card p-4 mb-4 flex items-center gap-3" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
        </div>
      )}

      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--patent-sky)' }} />
          </div>
        ) : apps.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 mx-auto mb-3 text-patent-muted opacity-40" />
            <p className="text-patent-muted mb-2">No tracked applications yet</p>
            <p className="text-xs text-patent-muted">Open any patent, go to the Continuity tab, and click "Add to Portfolio" on related applications.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Application No.</th>
                <th>Title</th>
                <th>Relationship</th>
                <th>Parent Patent</th>
                <th>Filed</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {apps.map(app => (
                <tr key={app.id} className="group">
                  <td>
                    <Link href={`/patents/${app.id}`} className="font-mono text-xs hover:text-patent-sky transition-colors"
                      style={{ color: 'var(--patent-sky)' }}>
                      {app.patentNumber || app.applicationNumber || '—'}
                    </Link>
                  </td>
                  <td className="max-w-xs">
                    <Link href={`/patents/${app.id}`} className="text-sm text-white hover:text-patent-sky transition-colors line-clamp-2">
                      {app.title}
                    </Link>
                    {app.family && (
                      <Link href={`/families/${app.family.id}`} className="text-xs mt-0.5 inline-block px-1.5 py-0.5 rounded"
                        style={{ background: 'rgba(45,90,158,0.2)', color: 'var(--patent-sky)' }}>
                        {app.family.name}
                      </Link>
                    )}
                  </td>
                  <td>
                    {app.continuationType ? (
                      <span className="text-xs px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(168,85,247,0.15)', color: '#c084fc' }}>
                        {app.continuationType.replace(/_/g, ' ')}
                      </span>
                    ) : <span className="text-patent-muted text-xs">—</span>}
                  </td>
                  <td>
                    {app.parentPatent ? (
                      <Link href={`/patents/${app.parentPatent.id}`}
                        className="flex items-center gap-1.5 text-xs hover:text-patent-sky transition-colors"
                        style={{ color: 'var(--patent-sky)' }}>
                        <GitBranch className="w-3 h-3" />
                        {app.parentPatent.patentNumber || '—'}
                      </Link>
                    ) : <span className="text-patent-muted text-xs">—</span>}
                  </td>
                  <td className="text-xs text-patent-muted whitespace-nowrap">
                    {app.filingDate ? app.filingDate.slice(0, 10) : '—'}
                  </td>
                  <td><StatusBadge status={app.status} /></td>
                  <td>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => refresh(app.id)} disabled={refreshing === app.id}
                        className="btn-ghost p-1.5" title="Refresh from USPTO">
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing === app.id ? 'animate-spin' : ''}`} />
                      </button>
                      <Link href={`/patents/${app.id}`} className="btn-ghost p-1.5">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {total > 0 && <p className="text-xs text-patent-muted mt-3">{total} tracked application{total !== 1 ? 's' : ''}</p>}
    </div>
  )
}
