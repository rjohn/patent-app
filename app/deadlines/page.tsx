'use client'

import { useState, useEffect, useCallback } from 'react'
import { AlertTriangle, CheckCircle2, Clock, DollarSign, Loader2, AlertCircle } from 'lucide-react'

interface DeadlineItem {
  id: string
  patentId: string
  patentNumber: string | null
  title: string
  feeType: string
  dueDate: string
  gracePeriodEnd: string
  status: string
  daysUntil: number
  amount: number | null
}

type FilterType = 'ALL' | 'OVERDUE' | 'DUE' | 'UPCOMING' | 'PAID'

function feeLabel(feeType: string) {
  return feeType.replace('MAINTENANCE_', '').replace('_', '.') + 'yr Maintenance'
}

function urgencyConfig(daysUntil: number, status: string) {
  if (status === 'PAID')    return { label: 'PAID',     className: 'text-green-400 bg-green-500/10 border-green-500/20' }
  if (daysUntil < 0)        return { label: 'OVERDUE',  className: 'text-red-400 bg-red-500/10 border-red-500/20' }
  if (daysUntil <= 14)      return { label: 'CRITICAL', className: 'text-red-400 bg-red-500/10 border-red-500/20' }
  if (daysUntil <= 30)      return { label: 'URGENT',   className: 'text-orange-400 bg-orange-500/10 border-orange-500/20' }
  if (daysUntil <= 60)      return { label: 'UPCOMING', className: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20' }
  return                           { label: 'OK',       className: 'text-green-400 bg-green-500/10 border-green-500/20' }
}

export default function DeadlinesPage() {
  const [deadlines, setDeadlines] = useState<DeadlineItem[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [filter, setFilter]       = useState<FilterType>('ALL')
  const [markingPaid, setMarkingPaid] = useState<string | null>(null)

  const fetchDeadlines = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/deadlines')
      if (!res.ok) throw new Error(`API error ${res.status}`)
      const data = await res.json()
      setDeadlines(data.deadlines || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deadlines')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchDeadlines() }, [fetchDeadlines])

  const markAsPaid = async (id: string) => {
    setMarkingPaid(id)
    try {
      const res = await fetch(`/api/deadlines`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: 'PAID', paidDate: new Date().toISOString() }),
      })
      if (!res.ok) throw new Error('Failed to update')
      setDeadlines(d => d.map(item => item.id === id ? { ...item, status: 'PAID' } : item))
    } catch (e) {
      alert('Failed to mark as paid')
    } finally {
      setMarkingPaid(null)
    }
  }

  const filtered = deadlines.filter(d => {
    if (filter === 'OVERDUE')  return d.daysUntil < 0 && d.status !== 'PAID'
    if (filter === 'DUE')      return d.daysUntil >= 0 && d.daysUntil <= 30 && d.status !== 'PAID'
    if (filter === 'UPCOMING') return d.daysUntil > 30 && d.status !== 'PAID'
    if (filter === 'PAID')     return d.status === 'PAID'
    return true
  })

  const overdue  = deadlines.filter(d => d.daysUntil < 0  && d.status !== 'PAID').length
  const due      = deadlines.filter(d => d.daysUntil >= 0 && d.daysUntil <= 30 && d.status !== 'PAID').length
  const total90  = deadlines.filter(d => d.daysUntil <= 90 && d.status !== 'PAID').reduce((s, d) => s + (d.amount || 0), 0)

  const tabs: { key: FilterType; label: string; count?: number }[] = [
    { key: 'ALL',      label: 'All',      count: deadlines.filter(d => d.status !== 'PAID').length },
    { key: 'OVERDUE',  label: 'Overdue',  count: overdue },
    { key: 'DUE',      label: 'Due Soon', count: due },
    { key: 'UPCOMING', label: 'Upcoming' },
    { key: 'PAID',     label: 'Paid' },
  ]

  return (
    <div className="p-8 animate-fade-in">
      <div className="mb-8">
        <h1 className="page-title">Deadlines & Maintenance Fees</h1>
        <p className="text-muted mt-1">Track USPTO maintenance fees and patent deadlines</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="card p-4 flex items-center gap-3" style={{ borderColor: overdue > 0 ? 'rgba(239,68,68,0.3)' : undefined }}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: overdue > 0 ? '#f87171' : 'var(--patent-muted)' }} />
          <div>
            <div className="text-2xl font-bold" style={{ color: overdue > 0 ? '#f87171' : 'white' }}>{overdue}</div>
            <div className="text-xs text-patent-muted">Overdue</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 flex-shrink-0 text-patent-amber" />
          <div>
            <div className="text-2xl font-bold text-white">{due}</div>
            <div className="text-xs text-patent-muted">Due in 30 days</div>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <DollarSign className="w-5 h-5 flex-shrink-0 text-patent-gold" />
          <div>
            <div className="text-2xl font-bold text-white">${total90.toLocaleString()}</div>
            <div className="text-xs text-patent-muted">Due in 90 days</div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 mb-5 p-1 rounded-lg w-fit" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`text-sm px-3 py-1.5 rounded-md transition-colors flex items-center gap-1.5 ${filter === t.key ? 'bg-patent-navy text-white' : 'text-patent-muted hover:text-white'}`}>
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full" style={{
                background: t.key === 'OVERDUE' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.1)',
                color: t.key === 'OVERDUE' ? '#f87171' : 'inherit'
              }}>{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="card p-4 mb-4 flex items-center gap-3" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle className="w-5 h-5" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
          <button onClick={fetchDeadlines} className="btn-ghost text-sm ml-auto">Retry</button>
        </div>
      )}

      {/* List */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin" style={{ color: 'var(--patent-sky)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 opacity-30" style={{ color: '#4ade80' }} />
            <p className="text-patent-muted">
              {deadlines.length === 0 ? 'No maintenance fees tracked yet — add patents to generate fees' : 'No deadlines in this category'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map(d => {
              const urg = urgencyConfig(d.daysUntil, d.status)
              const isPaid = d.status === 'PAID'
              return (
                <div key={d.id} className="px-6 py-4 flex items-center gap-5 hover:bg-white/5 transition-colors"
                  style={{ opacity: isPaid ? 0.6 : 1 }}>
                  {/* Urgency badge */}
                  <div className={`text-xs font-semibold px-2.5 py-1 rounded-full border flex-shrink-0 w-20 text-center ${urg.className}`}>
                    {isPaid ? 'PAID' : d.daysUntil < 0 ? 'OVERDUE' : `${d.daysUntil}d`}
                  </div>

                  {/* Patent info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="mono text-xs" style={{ color: 'var(--patent-sky)' }}>{d.patentNumber || '—'}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--patent-muted)' }}>
                        {feeLabel(d.feeType)}
                      </span>
                    </div>
                    <p className="text-sm mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>{d.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--patent-muted)' }}>
                      Due: {d.dueDate?.slice(0, 10)} · Grace period ends: {d.gracePeriodEnd?.slice(0, 10)}
                    </p>
                  </div>

                  {/* Amount + action */}
                  <div className="text-right flex-shrink-0">
                    {d.amount && (
                      <div className="text-sm font-semibold text-patent-gold">${d.amount.toLocaleString()}</div>
                    )}
                    {!isPaid ? (
                      <button onClick={() => markAsPaid(d.id)} disabled={markingPaid === d.id}
                        className="mt-1 text-xs btn-ghost flex items-center gap-1 ml-auto"
                        style={{ color: 'var(--patent-muted)' }}>
                        {markingPaid === d.id
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : <CheckCircle2 className="w-3 h-3" />}
                        Mark paid
                      </button>
                    ) : (
                      <div className="text-xs mt-1" style={{ color: '#4ade80' }}>✓ Paid</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
