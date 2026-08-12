'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import {
  FileText, GitBranch, CalendarClock, AlertTriangle,
  TrendingUp, Clock, CheckCircle2, Loader2, RefreshCw, Sparkles, Search, ChevronDown, Users
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/auth-context'
import { useTheme } from '@/context/theme-context'

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
    grantedUS: number
    grantedEP: number
    openApplications: number
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
  growthByYear: {
    ALL: { year: number; total: number }[]
    US:  { year: number; total: number }[]
    EP:  { year: number; total: number }[]
  }
  topInventors: { name: string; count: number }[]
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

type JurisdictionFilter = 'ALL' | 'US' | 'EP'

const JURISDICTION_LABELS: Record<JurisdictionFilter, string> = {
  ALL: 'All', US: 'US', EP: 'Euro',
}

function PortfolioGrowthChart({ growthByYear }: { growthByYear: DashboardData['growthByYear'] }) {
  const { theme } = useTheme()
  const light = theme === 'light'
  const divider = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.12)'
  const svgRef = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [jurisdiction, setJurisdiction] = useState<JurisdictionFilter>('ALL')

  const data = growthByYear[jurisdiction]

  const W = 600, H = 200
  const pad = { top: 16, right: 12, bottom: 24, left: 34 }
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom

  const header = (
    <div className="flex items-center justify-between mb-3">
      <h3 className="section-title">Total Patents Granted</h3>
      <div className="relative">
        <select value={jurisdiction} onChange={e => { setJurisdiction(e.target.value as JurisdictionFilter); setHover(null) }}
          className="input text-xs py-1 pl-2 pr-6 appearance-none cursor-pointer">
          {(['ALL', 'US', 'EP'] as JurisdictionFilter[]).map(j => (
            <option key={j} value={j}>{JURISDICTION_LABELS[j]}</option>
          ))}
        </select>
        <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-patent-muted" />
      </div>
    </div>
  )

  if (data.length === 0) {
    return (
      <>
        {header}
        <div className="flex items-center justify-center h-40 text-sm text-patent-muted">
          No {jurisdiction === 'ALL' ? '' : `${JURISDICTION_LABELS[jurisdiction]} `}granted patents yet
        </div>
      </>
    )
  }

  const maxTotal = Math.max(1, ...data.map(d => d.total))
  const yMax = Math.ceil(maxTotal * 1.15)
  const xAt = (i: number) => data.length > 1 ? pad.left + (i / (data.length - 1)) * innerW : pad.left + innerW / 2
  const yAt = (v: number) => pad.top + innerH - (v / yMax) * innerH

  const linePoints = data.map((d, i) => `${xAt(i)},${yAt(d.total)}`).join(' ')
  const areaPoints = `${xAt(0)},${yAt(0)} ${linePoints} ${xAt(data.length - 1)},${yAt(0)}`

  // Show at most ~6 year labels to avoid crowding
  const labelEvery = Math.max(1, Math.ceil(data.length / 6))

  const handleMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const fracX = (e.clientX - rect.left) / rect.width
    const svgX = fracX * W
    let nearest = 0
    let best = Infinity
    data.forEach((_, i) => {
      const d = Math.abs(xAt(i) - svgX)
      if (d < best) { best = d; nearest = i }
    })
    setHover(nearest)
  }

  const current = data[data.length - 1]
  const hovered = hover !== null ? data[hover] : null

  return (
    <div>
      {header}
      <div className="flex items-baseline gap-2 mb-1 px-1">
        <span className="text-2xl font-display font-bold" style={{ color: light ? '#0F172A' : 'white' }}>
          {(hovered ?? current).total}
        </span>
        <span className="text-xs text-patent-muted">granted as of {(hovered ?? current).year}</span>
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        style={{ display: 'block' }}
        role="img"
        aria-label={`Cumulative granted patents by year, reaching ${current.total} in ${current.year}`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Gridlines */}
        {[0, 0.5, 1].map(f => (
          <line key={f} x1={pad.left} x2={W - pad.right} y1={pad.top + innerH * (1 - f)} y2={pad.top + innerH * (1 - f)}
            stroke={divider} strokeWidth={1} />
        ))}
        <text x={pad.left - 6} y={pad.top + 4} textAnchor="end" fontSize="10" fill="var(--patent-muted)">{yMax}</text>
        <text x={pad.left - 6} y={pad.top + innerH + 4} textAnchor="end" fontSize="10" fill="var(--patent-muted)">0</text>

        {/* Area + line */}
        <polygon points={areaPoints} fill="var(--patent-sky)" opacity={0.12} />
        <polyline points={linePoints} fill="none" stroke="var(--patent-sky)" strokeWidth={2}
          strokeLinejoin="round" strokeLinecap="round" />

        {/* Year labels */}
        {data.map((d, i) => (i % labelEvery === 0 || i === data.length - 1) ? (
          <text key={d.year} x={xAt(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--patent-muted)">
            {d.year}
          </text>
        ) : null)}

        {/* Current-value marker */}
        <circle cx={xAt(data.length - 1)} cy={yAt(current.total)} r={4} fill="var(--patent-sky)" />

        {/* Hover crosshair */}
        {hovered && (
          <>
            <line x1={xAt(hover!)} x2={xAt(hover!)} y1={pad.top} y2={pad.top + innerH} stroke={divider} strokeWidth={1} />
            <circle cx={xAt(hover!)} cy={yAt(hovered.total)} r={4} fill="var(--patent-sky)" stroke={light ? 'white' : '#0A1628'} strokeWidth={2} />
          </>
        )}
      </svg>
    </div>
  )
}

interface ActivityItem { date: string; label: string; detail: string; kind: 'event' | 'fee' | 'change' }
interface ActivitySummaryLite {
  events: { eventDate: string; title: string; description: string }[]
  fees: { dueDate: string; title: string; feeType: string; status: string }[]
  changes: { date: string; title: string; detail: string }[]
}

function ActivityWidget() {
  const { theme } = useTheme()
  const light = theme === 'light'
  const divider = light ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)'
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [data, setData]     = useState<ActivitySummaryLite | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const qs = period === 'week' ? '?period=week' : ''
    fetch(`/api/activity${qs}`)
      .then(r => r.ok ? r.json() : null)
      .then(setData)
      .finally(() => setLoading(false))
  }, [period])

  const items: ActivityItem[] = data ? [
    ...data.events.map(e => ({ date: e.eventDate, label: e.title, detail: e.description, kind: 'event' as const })),
    ...data.fees.map(f => ({ date: f.dueDate, label: f.title, detail: `${f.feeType.replace(/_/g, ' ')} · ${f.status}`, kind: 'fee' as const })),
    ...data.changes.map(c => ({ date: c.date, label: c.title, detail: c.detail, kind: 'change' as const })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5) : []

  const kindColor: Record<ActivityItem['kind'], string> = {
    event: 'var(--patent-sky)', fee: '#e6b84a', change: '#4ade80',
  }

  return (
    <div className="card h-full flex flex-col">
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: divider }}>
        <h2 className="section-title">Activity</h2>
        <div className="relative">
          <select value={period} onChange={e => setPeriod(e.target.value as 'week' | 'month')}
            className="input text-xs py-1 pl-2 pr-6 appearance-none cursor-pointer">
            <option value="week">This Week</option>
            <option value="month">This Month</option>
          </select>
          <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-patent-muted" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 flex-1">
          <Loader2 className="w-5 h-5 animate-spin text-patent-muted" />
        </div>
      ) : !data || items.length === 0 ? (
        <div className="px-6 py-10 text-center text-patent-muted text-sm flex-1">No activity this {period}</div>
      ) : (
        <>
          <div className="px-6 py-3 flex items-center gap-4 text-xs text-patent-muted" style={{ borderBottom: divider }}>
            <span>{data.events.length} events</span>
            <span>{data.fees.length} fees</span>
            <span>{data.changes.length} changes</span>
          </div>
          <div className="flex-1">
            {items.map((it, i) => (
              <div key={i} className="px-6 py-3 flex items-center gap-3" style={{ borderBottom: divider }}>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: kindColor[it.kind] }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.85)' }}>{it.label}</p>
                  <p className="text-xs text-patent-muted truncate">{it.detail}</p>
                </div>
                <div className="text-xs text-patent-muted whitespace-nowrap">{it.date.slice(5)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="px-6 py-3 mt-auto" style={{ borderTop: divider }}>
        <Link href="/activity" className="btn-ghost text-xs">View full activity →</Link>
      </div>
    </div>
  )
}

function InventorScorecard({ inventors }: { inventors: { name: string; count: number }[] }) {
  const { theme } = useTheme()
  const light = theme === 'light'
  const divider = light ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)'

  if (inventors.length === 0) {
    return (
      <div className="card">
        <div className="px-6 py-4" style={{ borderBottom: divider }}>
          <h2 className="section-title">Inventor Leaderboard</h2>
        </div>
        <div className="px-6 py-10 text-center text-patent-muted text-sm">No named inventors on file yet</div>
      </div>
    )
  }

  const maxCount = inventors[0].count

  return (
    <div className="card">
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: divider }}>
        <h2 className="section-title flex items-center gap-2">
          <Users className="w-4 h-4" style={{ color: '#c084fc' }} /> Inventor Leaderboard
        </h2>
        <span className="text-xs text-patent-muted">By patents named on</span>
      </div>
      <table className="data-table">
        <thead>
          <tr><th>Rank</th><th>Inventor</th><th>Patents</th></tr>
        </thead>
        <tbody>
          {inventors.map((inv, i) => (
            <tr key={inv.name}>
              <td className="text-patent-muted text-xs w-10">{i + 1}</td>
              <td className="text-sm" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.85)' }}>{inv.name}</td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 rounded-full flex-1 max-w-[120px] overflow-hidden"
                    style={{ background: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }}>
                    <div className="h-full rounded-full" style={{ width: `${(inv.count / maxCount) * 100}%`, background: '#c084fc' }} />
                  </div>
                  <span className="mono text-xs" style={{ color: 'var(--patent-sky)' }}>{inv.count}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function useGreeting(name: string) {
  const h = new Date().getHours()
  const time = h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  return `Good ${time}, ${name}`
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [data, setData]         = useState<DashboardData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [firstName, setFirstName] = useState('')

  const greeting = useGreeting(firstName || 'there')

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => { if (!r.ok) throw new Error(`${r.status}`); return r.json() })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))

    fetch('/api/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        const name = d.name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''
        setFirstName(name.split(' ')[0])
      })
      .catch(() => {})
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

  const { theme } = useTheme()
  const light = theme === 'light'
  const divider = light ? '1px solid rgba(0,0,0,0.08)' : '1px solid rgba(255,255,255,0.1)'

  const { stats, recentDeadlines, recentPatents, growthByYear, topInventors } = data

  return (
    <div className="p-8 space-y-8 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="page-title">{greeting}</h1>
          <p className="text-muted mt-1">Here's your Plaz4 IP portfolio overview</p>
        </div>
        <div className="flex items-center gap-2">
          <PatentSearch />
          <Link href="/import" className="btn-secondary flex items-center gap-2 text-sm">Import Data</Link>
          <Link href="/lookup" className="btn-primary flex items-center gap-2 text-sm">+ Add Patent</Link>
        </div>
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Total Granted" value={stats.granted}
          sub={`${stats.totalPatents > 0 ? Math.round((stats.granted / stats.totalPatents) * 100) : 0}% grant rate`} color="green" />
        <StatCard icon={<span className="text-xl leading-none">🇺🇸</span>} label="Granted US" value={stats.grantedUS}
          sub={stats.granted > 0 ? `${Math.round((stats.grantedUS / stats.granted) * 100)}% of granted` : 'US patents'} color="sky" />
        <StatCard icon={<span className="text-xl leading-none">🇪🇺</span>} label="Granted EP" value={stats.grantedEP}
          sub={stats.granted > 0 ? `${Math.round((stats.grantedEP / stats.granted) * 100)}% of granted` : 'EP patents'} color="steel" />
        <StatCard icon={<Clock className="w-5 h-5" />} label="Open Applications" value={stats.openApplications}
          sub="Pending · Published" color="amber" />
      </div>

      {/* Secondary row — mini */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MiniStat icon={<FileText className="w-4 h-4" style={{ color: 'var(--patent-sky)' }} />}
          label="Total Portfolio" value={stats.totalPatents} color="sky" />
        <MiniStat icon={<GitBranch className="w-4 h-4" style={{ color: 'var(--patent-sky)' }} />}
          label="Patent Families" value={stats.families} color="sky" />
        <MiniStat icon={<CalendarClock className="w-4 h-4" style={{ color: stats.overdueDeadlines > 0 ? '#f87171' : '#e6b84a' }} />}
          label={stats.overdueDeadlines > 0 ? `Deadlines (${stats.overdueDeadlines} overdue)` : 'Upcoming Deadlines'}
          value={stats.upcomingDeadlines} color={stats.overdueDeadlines > 0 ? 'red' : 'yellow'} />
        <MiniStat icon={<TrendingUp className="w-4 h-4" style={{ color: '#e6b84a' }} />}
          label="Expiring This Year" value={stats.expiringYear} color="yellow" />
      </div>

      {/* Portfolio Summary + Inventor Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <PortfolioSummary />
        <InventorScorecard inventors={topInventors} />
      </div>

      {/* Growth chart + Activity widget */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <PortfolioGrowthChart growthByYear={growthByYear} />
        </div>
        <ActivityWidget />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upcoming Deadlines */}
        <div className="lg:col-span-2 card">
          <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: divider }}>
            <h2 className="section-title flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-patent-amber" /> Upcoming Deadlines
            </h2>
            <Link href="/deadlines" className="btn-ghost text-xs">View all</Link>
          </div>
          {recentDeadlines.length === 0 ? (
            <div className="px-6 py-10 text-center text-patent-muted text-sm">No upcoming deadlines</div>
          ) : (
            <div style={{ borderTop: 'none' }}>
              {recentDeadlines.map(d => (
                <div key={d.id} className="px-6 py-4 flex items-center gap-4 transition-colors"
                  style={{ borderBottom: divider }}
                  onMouseEnter={e => (e.currentTarget.style.background = light ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.05)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <div className="w-14 text-right"><DeadlineUrgency days={d.daysUntil} /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs">{d.patentNumber || '—'}</span>
                      <span className="text-xs text-patent-muted px-2 py-0.5 rounded-full"
                        style={{ background: light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)' }}>{feeLabel(d.feeType)}</span>
                    </div>
                    <p className="text-sm mt-0.5 truncate" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.8)' }}>{d.title}</p>
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
                <div className="mt-4 pt-4 space-y-2" style={{ borderTop: divider }}>
                  <div className="flex justify-between text-xs">
                    <span className="text-patent-muted">🇺🇸 US Granted</span>
                    <span className="font-mono" style={{ color: light ? '#0F172A' : 'white' }}>{stats.grantedUS}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-patent-muted">🇪🇺 EP Granted</span>
                    <span className="font-mono" style={{ color: light ? '#0F172A' : 'white' }}>{stats.grantedEP}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-patent-muted">📋 Open Applications</span>
                    <span className="font-mono" style={{ color: light ? '#0F172A' : 'white' }}>{stats.openApplications}</span>
                  </div>
                </div>
                <div className="mt-4 pt-4 text-center" style={{ borderTop: divider }}>
                  <div className="text-2xl font-display font-bold" style={{ color: light ? '#0F172A' : 'white' }}>
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
              <Link href="/families" className="flex items-center gap-2 text-sm text-patent-muted transition-colors py-1 hover:text-patent-sky">
                <GitBranch className="w-3.5 h-3.5" /> View Family Trees
              </Link>
              <Link href="/reports" className="flex items-center gap-2 text-sm text-patent-muted transition-colors py-1 hover:text-patent-sky">
                <FileText className="w-3.5 h-3.5" /> Generate Report
              </Link>
              <Link href="/import" className="flex items-center gap-2 text-sm text-patent-muted transition-colors py-1 hover:text-patent-sky">
                <TrendingUp className="w-3.5 h-3.5" /> Import USPTO Data
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Patents */}
      <div className="card">
        <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: divider }}>
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

function PortfolioSummary() {
  const { theme } = useTheme()
  const light = theme === 'light'
  const [text, setText]           = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  const [generating, setGenerating] = useState(false)

  async function load() {
    try {
      const r = await fetch('/api/portfolio-summary')
      if (!r.ok) return
      const d = await r.json()
      setText(d.text)
      setUpdatedAt(d.updatedAt)
    } finally {
      setLoading(false)
    }
  }

  async function regenerate() {
    setGenerating(true)
    try {
      const r = await fetch('/api/portfolio-summary', { method: 'POST' })
      if (!r.ok) return
      const d = await r.json()
      setText(d.text)
      setUpdatedAt(d.updatedAt)
    } finally {
      setGenerating(false)
    }
  }

  useEffect(() => { load() }, [])

  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="card p-6" style={{ background: 'linear-gradient(135deg, rgba(26,91,197,0.08) 0%, rgba(91,45,158,0.08) 100%)', borderColor: 'rgba(91,45,158,0.25)' }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: 'var(--p4-blue, #1A5BC5)' }} />
          <span className="section-title">Portfolio Summary</span>
          {formattedDate && !generating && (
            <span className="text-xs text-patent-muted ml-1">· updated {formattedDate}</span>
          )}
        </div>
        <button
          onClick={regenerate}
          disabled={generating}
          className="btn-ghost text-xs flex items-center gap-1.5"
          title="Regenerate summary"
        >
          <RefreshCw className={`w-3 h-3 ${generating ? 'animate-spin' : ''}`} />
          {generating ? 'Generating…' : 'Regenerate'}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-2">
          <Loader2 className="w-4 h-4 animate-spin text-patent-muted" />
          <span className="text-sm text-patent-muted">Loading summary…</span>
        </div>
      ) : generating ? (
        <div className="space-y-2 animate-pulse">
          <div className="h-3.5 rounded-full bg-white/10 w-full" />
          <div className="h-3.5 rounded-full bg-white/10 w-5/6" />
          <div className="h-3.5 rounded-full bg-white/10 w-4/5 mt-3" />
          <div className="h-3.5 rounded-full bg-white/10 w-full" />
          <div className="h-3.5 rounded-full bg-white/10 w-3/4" />
        </div>
      ) : text ? (
        <p className="text-sm leading-relaxed" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.82)' }}>{text}</p>
      ) : (
        <div className="flex items-center justify-between py-1">
          <span className="text-sm text-patent-muted">No summary yet.</span>
          <button onClick={regenerate} className="btn-primary text-xs">Generate Now</button>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, sub, color, alert }: {
  icon: React.ReactNode; label: string; value: number; sub: string; color: string; alert?: boolean
}) {
  const { theme } = useTheme()
  const light = theme === 'light'
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
      <div className="text-3xl font-display font-bold" style={{ color: light ? '#0F172A' : 'white' }}>{value}</div>
      <div className="text-sm font-medium mt-0.5" style={{ color: light ? '#334155' : 'rgba(255,255,255,0.8)' }}>{label}</div>
      <div className="text-xs text-patent-muted mt-1">{sub}</div>
    </div>
  )
}

function MiniStat({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    green: '#4ade80', yellow: '#facc15', red: '#f87171',
    sky: 'var(--patent-sky)', amber: '#e6b84a',
  }
  return (
    <div className="card px-4 py-3 flex items-center gap-3">
      {icon}
      <span className="text-sm text-patent-muted truncate">{label}</span>
      <span className="ml-auto font-bold tabular-nums" style={{ color: colorMap[color] || colorMap.sky }}>{value}</span>
    </div>
  )
}

function PatentSearch() {
  const router = useRouter()
  const { theme } = useTheme()
  const light = theme === 'light'
  const [query, setQuery]       = useState('')
  const [results, setResults]   = useState<{ id: string; patentNumber: string | null; applicationNumber: string | null; epNumber: string | null; jurisdiction: string | null; title: string }[]>([])
  const [loading, setLoading]   = useState(false)
  const [open, setOpen]         = useState(false)
  const [active, setActive]     = useState(-1)
  const inputRef  = useRef<HTMLInputElement>(null)
  const wrapRef   = useRef<HTMLDivElement>(null)

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/patents?q=${encodeURIComponent(q)}&pageSize=8`)
      if (!res.ok) return
      const data = await res.json()
      setResults(data.patents || [])
      setOpen(true)
      setActive(-1)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => search(query), 250)
    return () => clearTimeout(t)
  }, [query, search])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  function navigate(id: string) {
    router.push(`/patents/${id}`)
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && active >= 0) { navigate(results[active].id) }
    else if (e.key === 'Escape') { setOpen(false); inputRef.current?.blur() }
  }

  function displayNum(p: typeof results[0]) {
    if (p.jurisdiction === 'EP') return p.epNumber ? `EP${p.epNumber}` : (p.applicationNumber || '—')
    return p.patentNumber || p.applicationNumber || '—'
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm"
        style={{
          background: light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.07)',
          border: `1px solid ${light ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'}`,
          width: 220,
        }}>
        {loading
          ? <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin" style={{ color: 'var(--patent-muted)' }} />
          : <Search className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--patent-muted)' }} />}
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search patents…"
          className="bg-transparent outline-none w-full text-sm"
          style={{ color: light ? '#0F172A' : 'white' }}
        />
      </div>

      {open && results.length > 0 && (
        <div className="absolute right-0 mt-1.5 rounded-xl overflow-hidden z-50 shadow-2xl"
          style={{
            width: 380,
            background: light ? '#fff' : '#1a1f2e',
            border: `1px solid ${light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
          }}>
          {results.map((p, i) => (
            <button key={p.id} onMouseDown={() => navigate(p.id)}
              onMouseEnter={() => setActive(i)}
              className="w-full text-left px-4 py-2.5 flex items-start gap-3 transition-colors"
              style={{ background: i === active ? (light ? 'rgba(26,91,197,0.07)' : 'rgba(74,144,217,0.12)') : 'transparent' }}>
              <span className="font-mono text-xs mt-0.5 w-24 flex-shrink-0 truncate"
                style={{ color: 'var(--patent-sky)' }}>
                {displayNum(p)}
              </span>
              <span className="text-sm leading-snug line-clamp-2"
                style={{ color: light ? '#334155' : 'rgba(255,255,255,0.85)' }}>
                {p.title}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function HealthBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const { theme } = useTheme()
  const light = theme === 'light'
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  const colorMap: Record<string, string> = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-patent-muted">{label}</span>
        <span style={{ color: light ? '#334155' : 'rgba(255,255,255,0.7)' }}>{value} ({pct}%)</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: colorMap[color] }} />
      </div>
    </div>
  )
}
