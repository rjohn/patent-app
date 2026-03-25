'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, AlertCircle, Building2, Calendar, DollarSign, Link2, Link2Off, Trash2, FileText, ChevronDown, ChevronUp, Search, X } from 'lucide-react'

interface PatentRef {
  id: string
  applicationNumber: string | null
  patentNumber: string | null
  epNumber: string | null
  publicationNumber: string | null
  jurisdiction: string | null
  title: string
}

interface FeeRef {
  id: string
  feeType: string
  dueDate: string
  status: string
}

interface LineItem {
  id: string
  docketNumber: string | null
  description: string | null
  serviceDate: string | null
  hours: number | null
  rate: number | null
  amount: number | null
  matchConfidence: string | null
  patentId: string | null
  patent: PatentRef | null
  maintenanceFeeId: string | null
  maintenanceFee: FeeRef | null
}

interface Invoice {
  id: string
  lawFirm: string
  invoiceNumber: string | null
  invoiceDate: string | null
  totalAmount: number | null
  currency: string
  parseStatus: string
  notes: string | null
  pdfName: string | null
  createdAt: string
  lineItems: LineItem[]
}

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch(`/api/legal-invoices/${params.id}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setInvoice(d.invoice)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load invoice'); setLoading(false) })
  }, [params.id])

  const handleDelete = async () => {
    if (!confirm('Delete this invoice and all its line items?')) return
    setDeleting(true)
    const res = await fetch(`/api/legal-invoices/${params.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/legal-fees')
    else { setError('Delete failed'); setDeleting(false) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 className="w-6 h-6 animate-spin text-patent-muted" />
    </div>
  )

  if (error || !invoice) return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-red-400">
        <AlertCircle className="w-4 h-4" /> {error ?? 'Not found'}
      </div>
    </div>
  )

  const matched = invoice.lineItems.filter(l => l.patentId).length
  const unmatched = invoice.lineItems.length - matched
  const lineTotal = invoice.lineItems.reduce((s, l) => s + (l.amount ?? 0), 0)

  return (
    <div className="p-8 max-w-5xl animate-fade-in">
      {/* Header */}
      <button onClick={() => router.push('/legal-fees')} className="flex items-center gap-2 text-sm text-patent-muted hover:text-patent-sky mb-6 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to Legal Fees
      </button>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="page-title">{invoice.invoiceNumber ? `Invoice #${invoice.invoiceNumber}` : 'Invoice'}</h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-patent-muted">
            <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4" />{invoice.lawFirm}</span>
            {invoice.invoiceDate && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {new Date(invoice.invoiceDate).toLocaleDateString()}
              </span>
            )}
            {invoice.totalAmount != null && (
              <span className="flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                ${invoice.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {invoice.currency}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="btn-ghost flex items-center gap-2 text-sm text-red-400 hover:text-red-300"
        >
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
          Delete
        </button>
      </div>

      {/* Match summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-white">{invoice.lineItems.length}</p>
          <p className="text-xs text-patent-muted mt-1">Line Items</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{matched}</p>
          <p className="text-xs text-patent-muted mt-1">Matched to Patent</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-yellow-400">{unmatched}</p>
          <p className="text-xs text-patent-muted mt-1">Unmatched</p>
        </div>
      </div>

      {/* PDF viewer */}
      {invoice.pdfName && <PdfViewer invoiceId={invoice.id} pdfName={invoice.pdfName} />}

      {/* Line items table */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="section-title">Line Items</h2>
          {lineTotal > 0 && (
            <span className="text-sm text-patent-muted">
              Total: <span className="text-white font-medium">${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </span>
          )}
        </div>

        <div className="divide-y divide-white/5">
          {invoice.lineItems.map(item => (
            <LineItemRow
              key={item.id}
              item={item}
              invoiceId={invoice.id}
              onUpdated={(updated) => {
                setInvoice(prev => prev ? {
                  ...prev,
                  lineItems: prev.lineItems.map(l => l.id === updated.id ? { ...l, ...updated } : l),
                } : prev)
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function PdfViewer({ invoiceId, pdfName }: { invoiceId: string; pdfName: string }) {
  const [open, setOpen] = useState(false)
  const url = `/api/legal-invoices/${invoiceId}/pdf`

  return (
    <div className="card overflow-hidden mb-6">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileText className="w-4 h-4 text-patent-sky" />
          <span className="text-sm font-medium text-white">{pdfName}</span>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={url}
            download={pdfName}
            onClick={e => e.stopPropagation()}
            className="text-xs text-patent-sky hover:underline"
          >
            Download
          </a>
          {open ? <ChevronUp className="w-4 h-4 text-patent-muted" /> : <ChevronDown className="w-4 h-4 text-patent-muted" />}
        </div>
      </button>
      {open && (
        <div className="border-t border-white/10" style={{ height: '780px' }}>
          <iframe
            src={`${url}#toolbar=1&navpanes=0`}
            className="w-full h-full"
            title={pdfName}
          />
        </div>
      )}
    </div>
  )
}

function LineItemRow({
  item,
  invoiceId,
  onUpdated,
}: {
  item: LineItem
  invoiceId: string
  onUpdated: (updated: Partial<LineItem> & { id: string }) => void
}) {
  const router = useRouter()
  const [searching, setSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<PatentRef[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const confidence = item.matchConfidence
  const badgeColor =
    confidence === 'EXACT' || confidence === 'MANUAL' ? 'text-green-400 bg-green-500/15' :
    confidence === 'PARTIAL' ? 'text-yellow-400 bg-yellow-500/15' :
    'text-patent-muted bg-white/5'

  const unlinkPatent = async () => {
    const res = await fetch(`/api/legal-invoices/${invoiceId}/line-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patentId: null, matchConfidence: 'NONE' }),
    })
    if (res.ok) onUpdated({ id: item.id, patentId: null, patent: null, maintenanceFeeId: null, maintenanceFee: null, matchConfidence: 'NONE' })
  }

  const runSearch = async (q: string) => {
    if (!q.trim()) { setSearchResults([]); return }
    setSearchLoading(true)
    const res = await fetch(`/api/patents?q=${encodeURIComponent(q)}&pageSize=8`)
    const d = await res.json()
    setSearchResults(d.patents ?? [])
    setSearchLoading(false)
  }

  const assignPatent = async (p: PatentRef) => {
    setSaving(true)
    const res = await fetch(`/api/legal-invoices/${invoiceId}/line-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patentId: p.id, matchConfidence: 'MANUAL' }),
    })
    if (res.ok) {
      onUpdated({ id: item.id, patentId: p.id, patent: p, matchConfidence: 'MANUAL' })
      setSearching(false)
      setSearchQuery('')
      setSearchResults([])
    }
    setSaving(false)
  }

  return (
    <div className="px-6 py-4">
      <div className="flex items-start gap-4">
        {/* Main info */}
        <div className="flex-1 min-w-0">
          {item.description && (
            <p className="text-sm text-white/85 leading-relaxed mb-1">{item.description}</p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            {item.docketNumber && (
              <span className="text-xs font-mono text-patent-sky bg-patent-sky/10 px-1.5 py-0.5 rounded">
                {item.docketNumber}
              </span>
            )}
            {item.serviceDate && (
              <span className="text-xs text-patent-muted">
                {new Date(item.serviceDate).toLocaleDateString()}
              </span>
            )}
            {item.hours != null && item.rate != null && (
              <span className="text-xs text-patent-muted">
                {item.hours}h × ${item.rate}/hr
              </span>
            )}
          </div>
        </div>

        {/* Match status */}
        <div className="flex items-center gap-3 shrink-0">
          {item.patent ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push(`/patents/${item.patent!.id}`)}
                className="text-xs text-patent-sky hover:underline max-w-[180px] truncate"
              >
                {item.patent.title || item.patent.patentNumber || item.patent.applicationNumber}
              </button>
              <span className={`text-xs px-1.5 py-0.5 rounded ${badgeColor}`}>
                {confidence === 'MANUAL' ? 'Manual' : confidence === 'EXACT' ? 'Exact' : 'Partial'}
              </span>
              <button onClick={unlinkPatent} className="text-patent-muted hover:text-red-400 transition-colors" title="Unlink">
                <Link2Off className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <span className="text-xs text-patent-muted">No match</span>
          )}

          {/* Manual match button */}
          <button
            onClick={() => setSearching(s => !s)}
            className="text-xs text-patent-muted hover:text-patent-sky transition-colors flex items-center gap-1"
            title="Manually assign patent"
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>

          {/* Amount */}
          {item.amount != null && (
            <span className="text-sm font-medium text-white/80 w-24 text-right">
              ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )}
        </div>
      </div>

      {/* Inline search panel */}
      {searching && (
        <div className="mt-3 ml-0 p-3 rounded-lg border border-patent-sky/30 bg-patent-sky/5">
          <div className="flex items-center gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-patent-muted pointer-events-none" />
              <input
                autoFocus
                type="text"
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); runSearch(e.target.value) }}
                placeholder="Patent #, app #, docket, or title…"
                className="w-full pl-8 pr-3 py-1.5 text-sm rounded-md border border-white/15 bg-white/5 text-white placeholder:text-patent-muted focus:outline-none focus:border-patent-sky/50"
              />
            </div>
            <button onClick={() => { setSearching(false); setSearchQuery(''); setSearchResults([]) }} className="text-patent-muted hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>

          {searchLoading && <p className="text-xs text-patent-muted px-1">Searching…</p>}

          {searchResults.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {searchResults.map(p => (
                <button
                  key={p.id}
                  onClick={() => assignPatent(p)}
                  disabled={saving}
                  className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-white/10 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{p.title}</p>
                    <p className="text-xs text-patent-muted font-mono">
                      {p.jurisdiction === 'EP'
                        ? (p.epNumber ? `EP${p.epNumber}` : p.publicationNumber)
                        : (p.patentNumber || p.applicationNumber)}
                    </p>
                  </div>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin text-patent-muted" /> : <Link2 className="w-3.5 h-3.5 text-patent-sky shrink-0" />}
                </button>
              ))}
            </div>
          )}

          {!searchLoading && searchQuery && searchResults.length === 0 && (
            <p className="text-xs text-patent-muted px-1">No patents found</p>
          )}
        </div>
      )}
    </div>
  )
}
