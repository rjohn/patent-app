'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Activity, FileText, DollarSign, GitBranch, Loader2, AlertCircle, ChevronRight, Calendar } from 'lucide-react'
import type { ActivitySummary, ActivityEvent, ActivityFee, ActivityChange } from '@/app/api/activity/route'

type Period = 'week' | 'month' | 'lastmonth'

const PERIOD_LABELS: Record<Period, string> = {
  week:      'This Week',
  month:     'This Month',
  lastmonth: 'Last Month',
}

const EVENT_CATEGORY_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  filing:       { label: 'Filing',        bg: 'rgba(148,163,184,0.15)',  text: '#94a3b8' },
  office_action:{ label: 'Office Action', bg: 'rgba(239,68,68,0.15)',    text: '#f87171' },
  response:     { label: 'Response',      bg: 'rgba(59,130,246,0.15)',   text: '#60a5fa' },
  allowance:    { label: 'Allowance',     bg: 'rgba(234,179,8,0.15)',    text: '#fbbf24' },
  grant:        { label: 'Grant',         bg: 'rgba(34,197,94,0.15)',    text: '#4ade80' },
  fee:          { label: 'Fee',           bg: 'rgba(168,85,247,0.15)',   text: '#c084fc' },
  assignment:   { label: 'Assignment',    bg: 'rgba(20,184,166,0.15)',   text: '#2dd4bf' },
  publication:  { label: 'Publication',   bg: 'rgba(99,102,241,0.15)',   text: '#818cf8' },
  status:       { label: 'Status',        bg: 'rgba(249,115,22,0.15)',   text: '#fb923c' },
  other:        { label: 'Other',         bg: 'rgba(255,255,255,0.05)',  text: '#64748b' },
}

const FEE_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  PAID:     { bg: 'rgba(34,197,94,0.15)',  text: '#4ade80' },
  DUE:      { bg: 'rgba(234,179,8,0.15)', text: '#fbbf24' },
  OVERDUE:  { bg: 'rgba(239,68,68,0.15)', text: '#f87171' },
  UPCOMING: { bg: 'rgba(74,144,217,0.1)', text: '#60a5fa' },
}

const CHANGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  granted:      { bg: 'rgba(34,197,94,0.15)',   text: '#4ade80', label: 'Granted'  },
  added:        { bg: 'rgba(74,144,217,0.15)',   text: '#60a5fa', label: 'Added'    },
  abandoned:    { bg: 'rgba(239,68,68,0.15)',    text: '#f87171', label: 'Abandoned'},
  status_change:{ bg: 'rgba(168,85,247,0.15)',   text: '#c084fc', label: 'Changed'  },
}

function feeLabel(feeType: string): string {
  if (feeType === 'MAINTENANCE_3_5')  return '3.5-yr Maintenance Fee'
  if (feeType === 'MAINTENANCE_7_5')  return '7.5-yr Maintenance Fee'
  if (feeType === 'MAINTENANCE_11_5') return '11.5-yr Maintenance Fee'
  if (feeType === 'ANNUITY')          return 'EP Annual Renewal'
  return feeType.replace(/_/g, ' ')
}

function StatCard({ icon, label, count, color }: { icon: React.ReactNode; label: string; count: number; color: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}20` }}>
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <p className="text-2xl font-bold text-white leading-none">{count}</p>
        <p className="text-xs text-patent-muted mt-0.5">{label}</p>
      </div>
    </div>
  )
}

function EventsSection({ events }: { events: ActivityEvent[] }) {
  if (!events.length) return (
    <div className="card p-6 text-center text-patent-muted text-sm">No prosecution events in this period</div>
  )
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Date</th>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Category</th>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Patent / Application</th>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Event</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e, i) => {
            const style = EVENT_CATEGORY_STYLES[e.category] || EVENT_CATEGORY_STYLES.other
            return (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="px-4 py-3 font-mono text-xs text-patent-muted whitespace-nowrap">{e.eventDate}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: style.bg, color: style.text }}>
                    {style.label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/patents/${e.patentId}`}
                    className="text-xs font-mono hover:text-patent-sky transition-colors"
                    style={{ color: 'var(--patent-sky)' }}>
                    {e.patentNumber || e.appNumber || '—'}
                  </Link>
                  <p className="text-xs text-white mt-0.5 max-w-xs truncate">{e.title}</p>
                </td>
                <td className="px-4 py-3 text-xs text-patent-muted max-w-xs">
                  <span className="line-clamp-2">{e.description}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FeesSection({ fees }: { fees: ActivityFee[] }) {
  if (!fees.length) return (
    <div className="card p-6 text-center text-patent-muted text-sm">No fee activity in this period</div>
  )
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Due Date</th>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Status</th>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Patent</th>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Fee Type</th>
            <th className="text-right px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Amount</th>
          </tr>
        </thead>
        <tbody>
          {fees.map((f, i) => {
            const s = FEE_STATUS_STYLES[f.status] || FEE_STATUS_STYLES.UPCOMING
            return (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="px-4 py-3 font-mono text-xs text-patent-muted whitespace-nowrap">
                  {f.dueDate}
                  {f.paidDate && <span className="block text-[10px]" style={{ color: '#4ade80' }}>paid {f.paidDate}</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.text }}>{f.status}</span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/patents/${f.patentId}`}
                    className="text-xs font-mono hover:text-patent-sky transition-colors"
                    style={{ color: 'var(--patent-sky)' }}>
                    {f.patentNumber || f.appNumber || '—'}
                  </Link>
                  <p className="text-xs text-white mt-0.5 max-w-xs truncate">{f.title}</p>
                </td>
                <td className="px-4 py-3 text-xs text-patent-muted">{feeLabel(f.feeType)}</td>
                <td className="px-4 py-3 text-xs text-right font-mono" style={{ color: 'var(--patent-text)' }}>
                  {f.amount ? `${f.currency} ${f.amount.toLocaleString()}` : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function ChangesSection({ changes }: { changes: ActivityChange[] }) {
  if (!changes.length) return (
    <div className="card p-6 text-center text-patent-muted text-sm">No portfolio changes in this period</div>
  )
  return (
    <div className="card overflow-hidden">
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Date</th>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Change</th>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Patent / Application</th>
            <th className="text-left px-4 py-3 text-xs text-patent-muted font-medium uppercase tracking-wider">Detail</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c, i) => {
            const s = CHANGE_STYLES[c.changeType] || CHANGE_STYLES.status_change
            return (
              <tr key={i} className="hover:bg-white/[0.02] transition-colors"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td className="px-4 py-3 font-mono text-xs text-patent-muted whitespace-nowrap">{c.date}</td>
                <td className="px-4 py-3">
                  <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: s.bg, color: s.text }}>{s.label}</span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/patents/${c.patentId}`}
                    className="text-xs font-mono hover:text-patent-sky transition-colors"
                    style={{ color: 'var(--patent-sky)' }}>
                    {c.patentNumber || c.appNumber || '—'}
                  </Link>
                  <p className="text-xs text-white mt-0.5 max-w-xs truncate">{c.title}</p>
                </td>
                <td className="px-4 py-3 text-xs text-patent-muted">{c.detail}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export default function ActivityPage() {
  const [period, setPeriod]     = useState<Period>('month')
  const [data, setData]         = useState<ActivitySummary | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)

  const load = useCallback(async (p: Period) => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch(`/api/activity?period=${p}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load activity')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [period, load])

  const total = data ? data.events.length + data.fees.length + data.changes.length : 0

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-patent-muted hover:text-white transition-colors mb-3">
            ← Dashboard
          </Link>
          <h1 className="page-title">Portfolio Activity</h1>
          <p className="text-muted mt-1">
            {data ? `${data.period.from} — ${data.period.to}` : 'Loading…'}
          </p>
        </div>
        <a href={`/api/activity?period=${period}&format=html`} target="_blank" rel="noopener noreferrer"
          className="btn-ghost text-sm flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Email Preview
        </a>
      </div>

      {/* Period selector */}
      <div className="flex gap-1 p-1 rounded-xl w-fit mb-6" style={{ background: 'rgba(255,255,255,0.05)' }}>
        {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
          <button key={p} onClick={() => setPeriod(p)}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: period === p ? 'linear-gradient(135deg, #1E64D4, #6333AE)' : 'transparent',
              color:      period === p ? 'white' : 'var(--patent-muted)',
              boxShadow:  period === p ? '0 2px 8px rgba(26,91,197,0.3)' : 'none',
            }}>
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {error && (
        <div className="card p-4 mb-6 flex items-center gap-3" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#f87171' }} />
          <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--patent-sky)' }} />
        </div>
      ) : data ? (
        <>
          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <StatCard icon={<FileText className="w-4 h-4" />} label="Prosecution Events" count={data.events.length} color="#60a5fa" />
            <StatCard icon={<DollarSign className="w-4 h-4" />} label="Fee Items" count={data.fees.length} color="#c084fc" />
            <StatCard icon={<GitBranch className="w-4 h-4" />} label="Portfolio Changes" count={data.changes.length} color="#4ade80" />
          </div>

          {total === 0 && (
            <div className="card p-10 text-center">
              <Activity className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p className="text-patent-muted">No activity found for this period</p>
              <p className="text-xs text-patent-muted mt-1">Try refreshing patents from USPTO to pull in recent events</p>
            </div>
          )}

          {data.events.length > 0 && (
            <section className="mb-8">
              <h2 className="section-title mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4" style={{ color: '#60a5fa' }} />
                USPTO Prosecution Events
                <span className="text-xs px-2 py-0.5 rounded-full ml-1"
                  style={{ background: 'rgba(96,165,250,0.15)', color: '#60a5fa' }}>
                  {data.events.length}
                </span>
              </h2>
              <EventsSection events={data.events} />
            </section>
          )}

          {data.fees.length > 0 && (
            <section className="mb-8">
              <h2 className="section-title mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4" style={{ color: '#c084fc' }} />
                Maintenance &amp; Renewal Fees
                <span className="text-xs px-2 py-0.5 rounded-full ml-1"
                  style={{ background: 'rgba(192,132,252,0.15)', color: '#c084fc' }}>
                  {data.fees.length}
                </span>
              </h2>
              <FeesSection fees={data.fees} />
            </section>
          )}

          {data.changes.length > 0 && (
            <section className="mb-8">
              <h2 className="section-title mb-3 flex items-center gap-2">
                <GitBranch className="w-4 h-4" style={{ color: '#4ade80' }} />
                Portfolio Changes
                <span className="text-xs px-2 py-0.5 rounded-full ml-1"
                  style={{ background: 'rgba(74,222,128,0.15)', color: '#4ade80' }}>
                  {data.changes.length}
                </span>
              </h2>
              <ChangesSection changes={data.changes} />
            </section>
          )}
        </>
      ) : null}
    </div>
  )
}
