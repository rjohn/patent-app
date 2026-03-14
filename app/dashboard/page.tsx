'use client'

import { useEffect, useState } from 'react'
import {
  FileText, GitBranch, CalendarClock, AlertTriangle,
  TrendingUp, Clock, CheckCircle2, XCircle, Loader2
} from 'lucide-react'
import Link from 'next/link'

interface DashboardData {
  stats: {
    totalPatents: number
    granted: number
    pending: number
    abandoned: number
    families: number
    upcomingDeadlines: number
    overdueDeadlines: number
    expiringYear: number
  }
  recentDeadlines: {
    id: string
    patentNumber: string
    title: string
    dueDate: string
    feeType: string
    daysUntil: number
  }[]
  recentPatents: {
    id: string
    patentNumber: string | null
    applicationNumber: string | null
    title: string
    status: string
    filingDate: string | null
    family: { id: string; name: string } | null
  }[]
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    GRANTED: 'status-granted', PENDING: 'status-pending',
    ABANDONED: 'status-abandoned', EXPIRED: 'status-expired', PUBLISHED: 'status-published',
  }
  return <span className={styles[status] || 'status-badge'}>{status}</span>
}

function DeadlineUrgency({ days }: { days: number }) {
  if (days < 0)   return <span className="deadline-critical font-semibold">OVERDUE</span>
  if (days <= 14) return <span className="deadline-critical font-semibold">{days}d</span>
  if (days <= 30) return <span className="deadline-urgent font-semibold">{days}d</span>
  if (days <= 60) return <span className="deadline-upcoming">{days}d</span>
  return <span className="deadline-ok">{days}d</span>
}

function feeLabel(feeType: string) {
  return feeType.replace('MAINTENANCE_', '').replace('_', '.') + 'yr Maintenance'
}

export default function DashboardPage() {
  const [data, setData]     = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full py-32">
      <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--patent-sky)' }} />
    </div>
  )

  if (error || !data) return (
    <div className="p-8">
      <div className="card p-6 text-center" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
        <p style={{ color: '#f87171' }} className="mb-3">Failed to load dashboard data</p>
        <button onClick={() => window.location.reload()} className="btn-ghost text-sm">Retry</button>
      </div>
    </div>
  )

  const { stats, recentDeadlines, recentPatents } = data

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">Portfolio Dashboard</h1>
          <p className="text-muted mt-1">Overview of your USPTO patent portfolio</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/import" className="btn-secondary flex items-center gap-2 text-sm">Import Data</Link>
          <Link href="/lookup" className="btn-primary flex items-center gap-2 text-sm">+ Add Patent</Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<FileText className="w-5 h-5" />} label="Total Patents" value={stats.totalPatents}
          sub={`${stats.granted} granted · ${stats.pending} pending`} color="sky" />
        <StatCard icon={<GitBranch className="w-5 h-5" />} label="Patent Families" value={stats.families}
          sub="Across all technology areas" color="steel" />
        <StatCard icon={<CalendarClock className="w-5 h-5" />} label="Upcoming Deadlines" value={stats.upcomingDeadlines}
          sub="Next 90 days" color="amber" alert={stats.overdueDeadlines > 0} />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Expiring This Year" value={stats.expiringYear}
          sub="Maintenance decisions needed" color="gold" />
      </div>

      {/* Status breakdown */}
      <div className="grid grid-cols-3 gap-3">
        <MiniStat icon={<CheckCircle2 className="w-4 h-4 text-green-400" />} label="Granted"   value={stats.granted}   color="green" />
        <MiniStat icon={<Clock        className="w-4 h-4 text-yellow-400"/>} label="Pending"   value={stats.pending}   color="yellow" />
        <MiniStat icon={<XCircle      className="w-4 h-4 text-red-400"  />} label="Abandoned" value={stats.abandoned} color="red" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Deadlines */}
        <div className="lg:col-span-2 card">
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <h2 className="section-title flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-patent-amber" /> Upcoming Deadlines
            </h2>
            <Link href="/deadlines" className="btn-ghost text-xs">View all</Link>
          </div>
          {recentDeadlines.length === 0 ? (
            <div className="px-6 py-10 text-center text-patent-muted text-sm">No upcoming deadlines</div>
          ) : (
            <div className="divide-y divide-white/5">
              {recentDeadlines.map(d => (
                <div key={d.id} className="px-6 py-4 flex items-center gap-4 hover:bg-white/5 transition-colors">
                  <div className="w-14 text-right"><DeadlineUrgency days={d.daysUntil} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs">{d.patentNumber || '—'}</span>
                      <span className="text-xs text-patent-muted bg-white/5 px-2 py-0.5 rounded-full">{feeLabel(d.feeType)}</span>
                    </div>
                    <p className="text-sm mt-0.5 truncate" style={{ color: 'rgba(255,255,255,0.8)' }}>{d.title}</p>
                  </div>
                  <div className="text-xs text-patent-muted whitespace-nowrap">{d.dueDate?.slice(0, 10)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="section-title mb-4">Portfolio Health</h3>
            {stats.totalPatents > 0 ? (
              <>
                <div className="space-y-3">
                  <HealthBar label="Granted"   value={stats.granted}   total={stats.totalPatents} color="green" />
                  <HealthBar label="Pending"   value={stats.pending}   total={stats.totalPatents} color="yellow" />
                  <HealthBar label="Abandoned" value={stats.abandoned} total={stats.totalPatents} color="red" />
                </div>
                <div className="mt-4 pt-4 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <div className="text-2xl font-display font-bold text-white">
                    {Math.round((stats.granted / stats.totalPatents) * 100)}%
                  </div>
                  <div className="text-xs text-patent-muted">Grant Success Rate</div>
                </div>
              </>
            ) : (
              <p className="text-sm text-patent-muted text-center py-4">No patents yet</p>
            )}
          </div>
          <div className="card p-5">
            <h3 className="section-title mb-3">Quick Links</h3>
            <div className="space-y-2">
              <Link href="/families" className="flex items-center gap-2 text-sm text-patent-muted hover:text-white transition-colors py-1">
                <GitBranch className="w-3.5 h-3.5" /> View Family Trees
              </Link>
              <Link href="/reports" className="flex items-center gap-2 text-sm text-patent-muted hover:text-white transition-colors py-1">
                <FileText className="w-3.5 h-3.5" /> Generate Report
              </Link>
              <Link href="/import" className="flex items-center gap-2 text-sm text-patent-muted hover:text-white transition-colors py-1">
                <TrendingUp className="w-3.5 h-3.5" /> Import USPTO Data
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Patents */}
      <div className="card">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h2 className="section-title">Recent Patents</h2>
          <Link href="/patents" className="btn-ghost text-xs">View all {stats.totalPatents}</Link>
        </div>
        {recentPatents.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-patent-muted text-sm mb-3">No patents in your portfolio yet</p>
            <Link href="/lookup" className="btn-primary text-sm inline-flex">Add your first patent</Link>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Patent Number</th><th>Title</th><th>Family</th><th>Filed</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentPatents.map(p => (
                <tr key={p.id} className="cursor-pointer">
                  <td>
                    <Link href={`/patents/${p.id}`} className="mono hover:text-patent-sky transition-colors text-xs">
                      {p.patentNumber || p.applicationNumber || '—'}
                    </Link>
                  </td>
                  <td className="max-w-xs truncate text-sm">{p.title}</td>
                  <td>
                    {p.family
                      ? <Link href={`/families/${p.family.id}`} className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(45,90,158,0.2)', color: 'var(--patent-sky)' }}>{p.family.name}</Link>
                      : <span className="text-xs text-patent-muted">—</span>}
                  </td>
                  <td className="text-patent-muted text-xs">{p.filingDate?.slice(0, 10) || '—'}</td>
                  <td><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color, alert }: {
  icon: React.ReactNode; label: string; value: number; sub: string; color: string; alert?: boolean
}) {
  const colorMap: Record<string, string> = {
    sky:   'rgba(74,144,217,0.1)',
    steel: 'rgba(100,130,180,0.1)',
    amber: 'rgba(217,160,74,0.1)',
    gold:  'rgba(212,175,55,0.1)',
  }
  return (
    <div className={`card p-5 ${alert ? 'border-red-500/30' : ''}`}>
      <div className="inline-flex p-2 rounded-lg border mb-3" style={{ background: colorMap[color] }}>
        {icon}
      </div>
      <div className="text-3xl font-display font-bold text-white">{value}</div>
      <div className="text-sm font-medium mt-0.5" style={{ color: 'rgba(255,255,255,0.8)' }}>{label}</div>
      <div className="text-xs text-patent-muted mt-1">{sub}</div>
    </div>
  )
}

function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = { green: '#4ade80', yellow: '#facc15', red: '#f87171' }
  return (
    <div className="card px-4 py-3 flex items-center gap-3">
      {icon}
      <span className="text-sm text-patent-muted">{label}</span>
      <span className="ml-auto font-bold" style={{ color: colorMap[color] }}>{value}</span>
    </div>
  )
}

function HealthBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  const colorMap: Record<string, string> = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-patent-muted">{label}</span>
        <span style={{ color: 'rgba(255,255,255,0.7)' }}>{value} ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colorMap[color] }} />
      </div>
    </div>
  )
}
