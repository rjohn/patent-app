'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import TrademarkStatusBadge from '@/components/TrademarkStatusBadge'
import { Stamp, Loader2, AlertCircle, Plus, Search, RefreshCw, CalendarClock, Gavel } from 'lucide-react'

interface Deadline { label: string; dueDate: string; state: string }
interface TrademarkRow {
  id: string
  serialNumber: string
  registrationNumber: string | null
  markText: string | null
  status: string
  statusDescription: string | null
  filingDate: string | null
  registrationDate: string | null
  owner: string | null
  internationalClasses: string[]
  source: string
  dataAsOf: string | null
  proceedingsCount: number
  nextDeadline: Deadline | null
}

const STATUSES = ['ALL', 'REGISTERED', 'PENDING', 'ABANDONED', 'CANCELLED', 'EXPIRED', 'UNKNOWN']

function DeadlineCell({ d }: { d: Deadline | null }) {
  if (!d) return <span className="text-patent-muted">—</span>
  const urgent = d.state === 'open' || d.state === 'grace'
  return (
    <span className="flex flex-col">
      <span className="text-xs" style={{ color: d.state === 'grace' ? '#f87171' : urgent ? '#facc15' : 'var(--patent-muted)' }}>
        {d.dueDate}{d.state === 'grace' ? ' (grace)' : ''}
      </span>
      <span className="text-[10px] text-patent-muted truncate">{d.label.replace(/ \(.*\)$/, '')}</span>
    </span>
  )
}

export default function TrademarksPage() {
  const router = useRouter()
  const [rows, setRows] = useState<TrademarkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (q.trim()) params.set('q', q.trim())
      if (status !== 'ALL') params.set('status', status)
      const res = await fetch(`/api/trademarks?${params}`)
      if (!res.ok) throw new Error('Failed to load trademarks')
      setRows(await res.json())
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [q, status])

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
  }, [load])

  async function checkNow() {
    setRefreshing(true)
    const id = toast.loading('Checking USPTO daily files… this can take a couple of minutes')
    try {
      const res = await fetch('/api/trademarks/refresh', { method: 'POST' })
      const s = await res.json()
      if (!res.ok) throw new Error(s.error || 'Refresh failed')
      const parts = [
        `${s.filesProcessed.length} new daily file${s.filesProcessed.length === 1 ? '' : 's'}`,
        `${s.updated.length} updated`,
        `${s.created.length} new mark${s.created.length === 1 ? '' : 's'}`,
      ]
      if (s.newProceedings.length) parts.push(`${s.newProceedings.length} new proceeding(s)`)
      toast.success(parts.join(' · '), { id })
      if (s.errors.length) toast.error(s.errors[0])
      load()
    } catch (e) {
      toast.error((e as Error).message, { id })
    } finally {
      setRefreshing(false)
    }
  }

  const registered = rows.filter(r => r.status === 'REGISTERED').length
  const pending = rows.filter(r => r.status === 'PENDING').length
  const dueSoon = rows.filter(r => r.nextDeadline && (r.nextDeadline.state === 'open' || r.nextDeadline.state === 'grace')).length

  return (
    <div className="p-8 max-w-6xl animate-fade-in">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="page-title">Trademarks</h1>
          <p className="text-muted mt-1">US trademark registrations and applications, updated daily from USPTO bulk data</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={checkNow} disabled={refreshing} className="btn-secondary flex items-center gap-2 text-sm">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Check USPTO now
          </button>
          <Link href="/trademarks/add" className="btn-primary flex items-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Add Trademark
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Registered', value: registered, icon: <Stamp className="w-5 h-5" /> },
          { label: 'Pending', value: pending, icon: <Loader2 className="w-5 h-5" /> },
          { label: 'Deadlines open now', value: dueSoon, icon: <CalendarClock className="w-5 h-5" /> },
        ].map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className="text-patent-sky">{s.icon}</div>
            <div>
              <div className="text-2xl font-semibold text-white">{s.value}</div>
              <div className="text-xs text-patent-muted">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-patent-muted" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search mark, serial, registration, owner…"
            className="input w-full pl-9 text-sm" />
        </div>
        <select value={status} onChange={e => setStatus(e.target.value)} className="input text-sm">
          {STATUSES.map(s => <option key={s} value={s}>{s === 'ALL' ? 'All statuses' : s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
        </select>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 mb-4"><AlertCircle className="w-4 h-4" /> {error}</div>
      )}

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center h-48"><Loader2 className="w-6 h-6 animate-spin text-patent-muted" /></div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center">
          <Stamp className="w-10 h-10 text-patent-muted mx-auto mb-4" />
          <p className="text-white/70 font-medium mb-1">No trademarks{q || status !== 'ALL' ? ' match your filters' : ' yet'}</p>
          <p className="text-sm text-patent-muted">Add one by serial number, or run the backfill import to pull in your existing marks.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-patent-muted" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th className="px-4 py-3 font-medium">Mark</th>
                <th className="px-4 py-3 font-medium">Serial / Reg.</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Classes</th>
                <th className="px-4 py-3 font-medium">Filed</th>
                <th className="px-4 py-3 font-medium">Registered</th>
                <th className="px-4 py-3 font-medium">Next deadline</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} onClick={() => router.push(`/trademarks/${r.id}`)}
                  className="cursor-pointer hover:bg-white/5 transition-colors"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <td className="px-4 py-3">
                    <div className="text-white font-medium flex items-center gap-2">
                      {r.markText || <span className="italic text-patent-muted">(design mark)</span>}
                      {r.proceedingsCount > 0 && (
                        <span title={`${r.proceedingsCount} proceeding(s)`} className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                          style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                          <Gavel className="w-3 h-3" /> {r.proceedingsCount}
                        </span>
                      )}
                    </div>
                    {r.owner && <div className="text-xs text-patent-muted truncate max-w-xs">{r.owner}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <div style={{ color: 'var(--patent-sky)' }}>{r.serialNumber}</div>
                    <div className="text-patent-muted">{r.registrationNumber ? `Reg. ${r.registrationNumber}` : '—'}</div>
                  </td>
                  <td className="px-4 py-3"><TrademarkStatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 text-xs text-patent-muted">{r.internationalClasses.map(c => c.replace(/^0+/, '')).join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-xs text-patent-muted">{r.filingDate?.slice(0, 10) ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-patent-muted">{r.registrationDate?.slice(0, 10) ?? '—'}</td>
                  <td className="px-4 py-3"><DeadlineCell d={r.nextDeadline} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
