'use client'

import { useState, useEffect, use } from 'react'
import Link from 'next/link'
import { ArrowLeft, GitBranch, Loader2, AlertCircle } from 'lucide-react'
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

/** Build a PatentNode tree from a flat list using parentPatentId links */
function buildTree(patents: Patent[]): PatentNode | null {
  if (patents.length === 0) return null

  const nodeMap = new Map<string, PatentNode>()
  patents.forEach(p => nodeMap.set(p.id, {
    id: p.id,
    number: p.patentNumber || p.applicationNumber || '—',
    title: p.title,
    status: p.status,
    type: p.type,
    filedDate: p.filingDate?.slice(0, 10) || null,
    grantDate: p.grantDate?.slice(0, 10) || null,
    continuationType: p.continuationType || undefined,
    children: [],
  }))

  let root: PatentNode | null = null
  patents.forEach(p => {
    const node = nodeMap.get(p.id)!
    if (p.parentPatentId && nodeMap.has(p.parentPatentId)) {
      nodeMap.get(p.parentPatentId)!.children.push(node)
    } else {
      // Oldest filing date wins as root
      if (!root || (p.filingDate && (!root.filedDate || p.filingDate < root.filedDate))) {
        root = node
      }
    }
  })

  return root
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    GRANTED: 'status-granted', PENDING: 'status-pending',
    ABANDONED: 'status-abandoned', EXPIRED: 'status-expired',
  }
  return <span className={map[status] || 'status-badge'}>{status}</span>
}

export default function FamilyDetailPage({ params }: { params: any }) {
  const resolvedParams = params instanceof Promise ? use(params) : params
  const id = resolvedParams.id as string
  const [family, setFamily]   = useState<Family | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const [view, setView]       = useState<'tree' | 'list'>('tree')

  useEffect(() => {
    fetch(`/api/families/${id}`)
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setFamily)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

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

  return (
    <div className="p-8 animate-fade-in">
      <div className="mb-6">
        <Link href="/families" className="flex items-center gap-1.5 text-sm text-patent-muted hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Families
        </Link>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(45,90,158,0.2)', border: '1px solid rgba(74,144,217,0.2)' }}>
            <GitBranch className="w-6 h-6" style={{ color: 'var(--patent-sky)' }} />
          </div>
          <div>
            <h1 className="page-title">{family.name}</h1>
            <p className="text-muted mt-0.5">
              {family.description && <>{family.description} · </>}
              {family.patents.length} patent{family.patents.length !== 1 ? 's' : ''}
              {family.technologyArea && <> · {family.technologyArea}</>}
            </p>
          </div>
        </div>
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

      {view === 'list' && (
        <div className="card overflow-hidden">
          {family.patents.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-patent-muted text-sm">No patents in this family yet</p>
              <Link href="/lookup" className="btn-primary text-sm inline-flex mt-3">Add Patents</Link>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Patent Number</th><th>Title</th><th>Relationship</th>
                  <th>Type</th><th>Filed</th><th>Granted</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {family.patents.map(p => {
                  const isRoot = !p.parentPatentId
                  const rel = isRoot ? 'Parent' : (p.continuationType?.replace(/_/g, ' ') || 'Related')
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/patents/${p.id}`} className="mono hover:text-patent-sky transition-colors text-xs">
                          {p.patentNumber || p.applicationNumber || '—'}
                        </Link>
                      </td>
                      <td className="max-w-xs text-sm" style={{ color: 'rgba(255,255,255,0.8)' }}>{p.title}</td>
                      <td>
                        <span className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            background: isRoot ? 'rgba(74,144,217,0.15)' : 'rgba(168,85,247,0.15)',
                            color: isRoot ? 'var(--patent-sky)' : '#c084fc'
                          }}>
                          {rel}
                        </span>
                      </td>
                      <td className="text-xs text-patent-muted">{p.type}</td>
                      <td className="text-xs text-patent-muted">{p.filingDate?.slice(0,10) || '—'}</td>
                      <td className="text-xs text-patent-muted">{p.grantDate?.slice(0,10) || '—'}</td>
                      <td><StatusBadge status={p.status} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
