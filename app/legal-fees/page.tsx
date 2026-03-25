'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Banknote, ChevronRight, AlertCircle, Loader2, Building2, Calendar,
  DollarSign, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, CheckSquare, Square, Search, X,
} from 'lucide-react'

interface LineItemSummary {
  id: string
  docketNumber: string | null
  patentId: string | null
  patent: { applicationNumber: string | null; patentNumber: string | null } | null
}

interface Invoice {
  id: string
  lawFirm: string
  invoiceNumber: string | null
  invoiceDate: string | null
  totalAmount: number | null
  currency: string
  parseStatus: string
  createdAt: string
  lineItems: LineItemSummary[]
}

type SortField = 'date' | 'invoiceNumber' | 'lawFirm' | 'amount'
type SortDir = 'asc' | 'desc'
type MatchFilter = 'all' | 'matched' | 'unmatched' | 'partial'

function invoiceMatchStatus(inv: Invoice): 'matched' | 'unmatched' | 'partial' {
  const total = inv.lineItems.length
  const matched = inv.lineItems.filter(l => l.patentId).length
  if (total === 0 || matched === 0) return 'unmatched'
  if (matched === total) return 'matched'
  return 'partial'
}

export default function LegalFeesPage() {
  const router = useRouter()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  const [sortField, setSortField] = useState<SortField>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rematching, setRematching] = useState(false)
  const [rematchResult, setRematchResult] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/legal-invoices')
      .then(r => r.json())
      .then(d => { setInvoices(d.invoices ?? []); setLoading(false) })
      .catch(() => { setError('Failed to load invoices'); setLoading(false) })
  }, [])

  const reload = () =>
    fetch('/api/legal-invoices').then(r => r.json()).then(d => setInvoices(d.invoices ?? []))

  // Sort + filter
  const visible = useMemo(() => {
    let list = [...invoices]

    if (query.trim()) {
      const q = query.trim().toLowerCase()
      list = list.filter(inv =>
        inv.invoiceNumber?.toLowerCase().includes(q) ||
        inv.lawFirm.toLowerCase().includes(q) ||
        inv.lineItems.some(l =>
          l.docketNumber?.toLowerCase().includes(q) ||
          l.patent?.patentNumber?.toLowerCase().includes(q) ||
          l.patent?.applicationNumber?.toLowerCase().includes(q)
        )
      )
    }

    if (matchFilter !== 'all') {
      list = list.filter(inv => invoiceMatchStatus(inv) === matchFilter)
    }

    list.sort((a, b) => {
      let cmp = 0
      if (sortField === 'date') {
        cmp = (a.invoiceDate ?? a.createdAt).localeCompare(b.invoiceDate ?? b.createdAt)
      } else if (sortField === 'invoiceNumber') {
        cmp = (a.invoiceNumber ?? '').localeCompare(b.invoiceNumber ?? '')
      } else if (sortField === 'lawFirm') {
        cmp = a.lawFirm.localeCompare(b.lawFirm)
      } else if (sortField === 'amount') {
        cmp = (a.totalAmount ?? 0) - (b.totalAmount ?? 0)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return list
  }, [invoices, query, sortField, sortDir, matchFilter])

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const allVisibleSelected = visible.length > 0 && visible.every(i => selected.has(i.id))
  const toggleSelectAll = () => {
    if (allVisibleSelected) setSelected(new Set())
    else setSelected(new Set(visible.map(i => i.id)))
  }

  const runRematch = async () => {
    setRematching(true)
    setRematchResult(null)
    const invoiceIds = selected.size > 0 ? Array.from(selected) : undefined
    const res = await fetch('/api/legal-invoices/rematch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceIds, force: true }),
    })
    const d = await res.json()
    setRematching(false)
    if (res.ok) {
      setRematchResult(`Matched ${d.matched} of ${d.checked} items${invoiceIds ? ` (${invoiceIds.length} invoice${invoiceIds.length !== 1 ? 's' : ''})` : ''}`)
      setSelected(new Set())
      reload()
    } else {
      setRematchResult(`Error: ${d.error}`)
    }
  }

  const totalSpend = invoices.reduce((s, i) => s + (i.totalAmount ?? 0), 0)
  const allItems = invoices.flatMap(i => i.lineItems)
  const matchedCount = allItems.filter(l => l.patentId).length

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-patent-muted" />
    </div>
  )

  return (
    <div className="p-8 max-w-5xl animate-fade-in">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="page-title">Legal Fees</h1>
          <p className="text-muted mt-1">Invoices from law firms, matched to your patent portfolio</p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 mb-6">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <StatCard label="Total Invoices" value={invoices.length.toString()} icon={<Banknote className="w-5 h-5" />} />
        <StatCard label="Total Spend" value={`$${totalSpend.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} icon={<DollarSign className="w-5 h-5" />} />
        <StatCard label="Matched Line Items" value={`${matchedCount} / ${allItems.length}`} icon={<Building2 className="w-5 h-5" />} />
      </div>

      {invoices.length === 0 ? (
        <div className="card p-12 text-center">
          <Banknote className="w-10 h-10 text-patent-muted mx-auto mb-4" />
          <p className="text-white/70 font-medium mb-1">No invoices yet</p>
          <p className="text-patent-muted text-sm mb-4">Upload PDF invoices on the Import page to get started</p>
          <button onClick={() => router.push('/import')} className="btn-primary text-sm">Go to Import</button>
        </div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-patent-muted pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Invoice #, docket, patent #…"
                className="pl-8 pr-7 py-1.5 text-sm rounded-lg border border-white/15 bg-white/5 text-white placeholder:text-patent-muted focus:outline-none focus:border-patent-sky/50 w-56"
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-patent-muted hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Match filter */}
            <div className="flex rounded-lg overflow-hidden border border-white/10 text-xs">
              {(['all', 'matched', 'partial', 'unmatched'] as MatchFilter[]).map(f => (
                <button
                  key={f}
                  onClick={() => setMatchFilter(f)}
                  className={`px-3 py-1.5 capitalize transition-colors ${
                    matchFilter === f ? 'bg-patent-sky text-white' : 'text-patent-muted hover:text-white hover:bg-white/5'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>

            {/* Sort buttons */}
            <div className="flex items-center gap-1 text-xs">
              <span className="text-patent-muted mr-1">Sort:</span>
              {([['date', 'Date'], ['invoiceNumber', 'Invoice #'], ['lawFirm', 'Firm'], ['amount', 'Amount']] as [SortField, string][]).map(([f, label]) => (
                <button
                  key={f}
                  onClick={() => toggleSort(f)}
                  className={`flex items-center gap-0.5 px-2 py-1 rounded transition-colors ${
                    sortField === f ? 'text-patent-sky bg-patent-sky/10' : 'text-patent-muted hover:text-white'
                  }`}
                >
                  {label}
                  {sortField === f
                    ? sortDir === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    : <ArrowUpDown className="w-3 h-3 opacity-40" />
                  }
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Rematch controls */}
            {rematchResult && <span className="text-xs text-patent-muted">{rematchResult}</span>}
            {selected.size > 0 && (
              <span className="text-xs text-patent-sky">{selected.size} selected</span>
            )}
            <button
              onClick={runRematch}
              disabled={rematching}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              {rematching ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {selected.size > 0 ? `Re-match ${selected.size} Selected` : 'Re-match All'}
            </button>
          </div>

          {/* Table */}
          <div className="card overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 text-xs text-patent-muted">
              <button onClick={toggleSelectAll} className="shrink-0">
                {allVisibleSelected
                  ? <CheckSquare className="w-4 h-4 text-patent-sky" />
                  : <Square className="w-4 h-4" />
                }
              </button>
              <span className="w-32 shrink-0">Law Firm</span>
              <span className="w-28 shrink-0">Invoice #</span>
              <span className="w-24 shrink-0">Date</span>
              <span className="flex-1">Match Status</span>
              <span className="w-24 text-right shrink-0">Amount</span>
              <span className="w-4 shrink-0" />
            </div>

            <div className="divide-y divide-white/5">
              {visible.map(inv => {
                const matchedItems = inv.lineItems.filter(l => l.patentId).length
                const total = inv.lineItems.length
                const status = invoiceMatchStatus(inv)
                const isSelected = selected.has(inv.id)

                return (
                  <div
                    key={inv.id}
                    className={`flex items-center gap-3 px-4 py-3 transition-colors ${isSelected ? 'bg-patent-sky/5' : 'hover:bg-white/5'}`}
                  >
                    <button onClick={() => toggleSelect(inv.id)} className="shrink-0">
                      {isSelected
                        ? <CheckSquare className="w-4 h-4 text-patent-sky" />
                        : <Square className="w-4 h-4 text-patent-muted" />
                      }
                    </button>
                    <button
                      onClick={() => router.push(`/legal-fees/${inv.id}`)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left"
                    >
                      <span className="w-32 shrink-0 text-sm text-white truncate">{inv.lawFirm}</span>
                      <span className="w-28 shrink-0 text-sm text-patent-muted font-mono truncate">
                        {inv.invoiceNumber ?? '—'}
                      </span>
                      <span className="w-24 shrink-0 text-xs text-patent-muted">
                        {inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString() : '—'}
                      </span>
                      <span className="flex-1 flex items-center gap-2">
                        <MatchBadge status={status} />
                        <span className="text-xs text-patent-muted">
                          {matchedItems}/{total} items
                        </span>
                        <ParseBadge status={inv.parseStatus} />
                      </span>
                      <span className="w-24 text-right shrink-0 text-sm text-white/80">
                        {inv.totalAmount != null
                          ? `$${inv.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
                      </span>
                      <ChevronRight className="w-4 h-4 text-patent-muted shrink-0" />
                    </button>
                  </div>
                )
              })}

              {visible.length === 0 && (
                <div className="px-6 py-8 text-center text-patent-muted text-sm">
                  No invoices match the current filter
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className="p-2 rounded-lg bg-patent-sky/10 text-patent-sky">{icon}</div>
      <div>
        <p className="text-xs text-patent-muted mb-0.5">{label}</p>
        <p className="text-xl font-semibold text-white">{value}</p>
      </div>
    </div>
  )
}

function MatchBadge({ status }: { status: 'matched' | 'unmatched' | 'partial' }) {
  if (status === 'matched') return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/15 text-green-400">Matched</span>
  if (status === 'partial') return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">Partial</span>
  return <span className="text-xs px-1.5 py-0.5 rounded bg-white/10 text-patent-muted">Unmatched</span>
}

function ParseBadge({ status }: { status: string }) {
  if (status === 'PARSED') return null
  if (status === 'PARTIAL') return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400">Partial parse</span>
  return <span className="text-xs px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Parse failed</span>
}
