'use client'

import { useState, useEffect } from 'react'
import { FileText, Download, BarChart3, Calendar, GitBranch, Loader2, CheckCircle2 } from 'lucide-react'
import { useTheme } from '@/context/theme-context'

const REPORT_TYPES = [
  {
    id: 'portfolio-summary',
    icon: <BarChart3 className="w-5 h-5" />,
    title: 'Granted Patent Portfolio',
    description: 'Granted patents only — patent number, title, filing date, grant date, expiry, and family',
    formats: ['PDF', 'Excel'],
    color: 'patent-sky',
  },
  {
    id: 'pending-applications',
    icon: <FileText className="w-5 h-5" />,
    title: 'Pending Applications',
    description: 'Open applications with PENDING or PUBLISHED status — application number, type, filing date',
    formats: ['PDF', 'Excel'],
    color: 'patent-amber',
  },
  {
    id: 'deadlines',
    icon: <Calendar className="w-5 h-5" />,
    title: 'Deadline & Fee Report',
    description: 'All upcoming maintenance fees and deadlines with amounts due',
    formats: ['PDF', 'Excel'],
    color: 'red-400',
  },
  {
    id: 'family-tree',
    icon: <GitBranch className="w-5 h-5" />,
    title: 'Family Tree Report',
    description: 'Patent family relationships, continuation chains, and filing history',
    formats: ['PDF'],
    color: 'purple-400',
  },
]

type ReportStatus = 'idle' | 'generating' | 'done' | 'error'

interface PortfolioStats {
  totalPatents: number
  granted: number
  pending: number
  families: number
}

export default function ReportsPage() {
  const { theme } = useTheme()
  const light = theme === 'light'
  const [generating, setGenerating] = useState<Record<string, ReportStatus>>({})
  const [dateRange, setDateRange] = useState({ from: '', to: '' })
  const [stats, setStats] = useState<PortfolioStats | null>(null)

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.stats) setStats({ totalPatents: d.stats.totalPatents, granted: d.stats.granted, pending: d.stats.pending, families: d.stats.families }) })
      .catch(() => {})
  }, [])

  const generate = async (reportId: string, format: string) => {
    const key = `${reportId}-${format}`
    setGenerating(g => ({ ...g, [key]: 'generating' }))

    try {
      const resp = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, format, dateRange }),
      })

      if (!resp.ok) throw new Error('Generation failed')

      // Trigger download
      const blob = await resp.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const ext = format === 'Excel' ? 'xlsx' : format.toLowerCase()
      a.download = `patent-${reportId}-${new Date().toISOString().split('T')[0]}.${ext}`
      a.click()
      window.URL.revokeObjectURL(url)

      setGenerating(g => ({ ...g, [key]: 'done' }))
      setTimeout(() => setGenerating(g => ({ ...g, [key]: 'idle' })), 3000)
    } catch {
      setGenerating(g => ({ ...g, [key]: 'error' }))
      setTimeout(() => setGenerating(g => ({ ...g, [key]: 'idle' })), 3000)
    }
  }

  return (
    <div className="p-8 animate-fade-in max-w-4xl">
      <div className="mb-8">
        <h1 className="page-title">Reports & Exports</h1>
        <p className="text-muted mt-1">Generate PDF reports and Excel exports from your portfolio data</p>
      </div>

      {/* Report options */}
      <div className="card p-5 mb-8">
        <h2 className="section-title mb-4">Report Options</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label mb-1.5 block">Date Range From</label>
            <input type="date" value={dateRange.from} onChange={e => setDateRange(r => ({ ...r, from: e.target.value }))}
              className="input w-full" />
          </div>
          <div>
            <label className="label mb-1.5 block">Date Range To</label>
            <input type="date" value={dateRange.to} onChange={e => setDateRange(r => ({ ...r, to: e.target.value }))}
              className="input w-full" />
          </div>
        </div>
      </div>

      {/* Report cards */}
      <div className="space-y-4">
        {REPORT_TYPES.map(report => (
          <div key={report.id} className="card p-5">
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl flex-shrink-0"
                style={{
                  background: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
                  color: `var(--${report.color.includes('-') ? report.color.replace('-', '-') : 'patent-sky'})`,
                }}>
                {report.icon}
              </div>
              <div className="flex-1">
                <h3 className="font-semibold" style={{ color: light ? '#0F172A' : 'white' }}>{report.title}</h3>
                <p className="text-sm text-patent-muted mt-0.5">{report.description}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {report.formats.map(fmt => {
                  const key = `${report.id}-${fmt}`
                  const status = generating[key] || 'idle'
                  return (
                    <button
                      key={fmt}
                      onClick={() => generate(report.id, fmt)}
                      disabled={status === 'generating'}
                      className={`btn-secondary flex items-center gap-1.5 text-sm ${
                        status === 'done' ? 'border-green-500/40 text-green-400' :
                        status === 'error' ? 'border-red-500/40 text-red-400' : ''
                      }`}
                    >
                      {status === 'generating' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : status === 'done' ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      {fmt}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick stats preview */}
      <div className="card p-5 mt-8">
        <h2 className="section-title mb-4">Portfolio Snapshot</h2>
        <div className="grid grid-cols-4 gap-4 mb-4">
          {[
            { label: 'Total Patents', value: stats?.totalPatents },
            { label: 'Granted',       value: stats?.granted },
            { label: 'Pending',       value: stats?.pending },
            { label: 'Families',      value: stats?.families },
          ].map(s => (
            <div key={s.label} className="text-center p-3 rounded-lg"
              style={{ background: light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)' }}>
              <div className="text-2xl font-display font-bold" style={{ color: light ? '#0F172A' : 'white' }}>
                {s.value ?? '—'}
              </div>
              <div className="text-xs text-patent-muted mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-patent-muted">
          Reports are generated using live portfolio data.
        </p>
      </div>
    </div>
  )
}
