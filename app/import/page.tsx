'use client'

import { useState, useCallback } from 'react'
import { Upload, FileJson, FileCode, CheckCircle2, AlertCircle, Loader2, X, FileText, Banknote } from 'lucide-react'
import { useRouter } from 'next/navigation'

type UploadStep = 'idle' | 'uploading' | 'parsing' | 'importing' | 'done' | 'error'

interface UploadResult {
  total: number
  imported: number
  failed: number
  errors: string[]
}

// ── Invoice upload section ────────────────────────────────────────────────────

type FileStatus = 'pending' | 'processing' | 'done' | 'error'

interface InvoiceFile {
  file: File
  status: FileStatus
  invoiceId?: string
  error?: string
}

function InvoiceUploadSection() {
  const router = useRouter()
  const [files, setFiles] = useState<InvoiceFile[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [running, setRunning] = useState(false)

  const addFiles = (incoming: FileList | File[]) => {
    const pdfs = Array.from(incoming).filter(
      f => f.name.toLowerCase().endsWith('.pdf') || f.type === 'application/pdf'
    )
    setFiles(prev => {
      const existing = new Set(prev.map(f => f.file.name + f.file.size))
      const newOnes = pdfs.filter(f => !existing.has(f.name + f.size)).map(f => ({ file: f, status: 'pending' as FileStatus }))
      return [...prev, ...newOnes]
    })
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    addFiles(e.dataTransfer.files)
  }, [])

  const removeFile = (name: string) => {
    setFiles(prev => prev.filter(f => f.file.name !== name))
  }

  const handleUploadAll = async () => {
    const pending = files.filter(f => f.status === 'pending')
    if (!pending.length) return
    setRunning(true)

    for (const item of pending) {
      setFiles(prev => prev.map(f => f.file.name === item.file.name ? { ...f, status: 'processing' } : f))
      try {
        const formData = new FormData()
        formData.append('file', item.file)
        const res = await fetch('/api/legal-invoices', { method: 'POST', body: formData })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Upload failed')
        setFiles(prev => prev.map(f => f.file.name === item.file.name ? { ...f, status: 'done', invoiceId: data.invoice.id } : f))
      } catch (e) {
        setFiles(prev => prev.map(f => f.file.name === item.file.name ? { ...f, status: 'error', error: e instanceof Error ? e.message : 'Failed' } : f))
      }
    }
    setRunning(false)
  }

  const reset = () => setFiles([])
  const pendingCount = files.filter(f => f.status === 'pending').length
  const doneCount = files.filter(f => f.status === 'done').length

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Banknote className="w-4 h-4 text-patent-sky" />
        <h2 className="section-title">Upload Legal Invoices (PDF)</h2>
      </div>
      <p className="text-xs text-patent-muted mb-4">
        Upload one or more PDF invoices from your law firm. Claude AI will extract line items and match them to your portfolio using docket numbers.
      </p>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-all duration-200 mb-4 ${
          dragOver ? 'border-patent-sky/70 bg-patent-sky/5' : 'border-white/20 hover:border-white/30 hover:bg-white/5'
        }`}
      >
        <FileText className={`w-7 h-7 mx-auto mb-2 ${dragOver ? 'text-patent-sky' : 'text-patent-muted'}`} />
        <p className="text-white/80 font-medium text-sm mb-1">Drop PDF invoices here</p>
        <p className="text-patent-muted text-xs mb-3">Multiple files supported</p>
        <label className="btn-secondary cursor-pointer text-xs">
          Browse PDFs
          <input
            type="file"
            accept=".pdf,application/pdf"
            multiple
            onChange={(e) => { if (e.target.files) addFiles(e.target.files) }}
            className="hidden"
          />
        </label>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2 mb-4">
          {files.map(item => (
            <div key={item.file.name} className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-lg border border-white/10">
              <FileText className="w-5 h-5 text-red-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white truncate">{item.file.name}</p>
                <p className="text-xs text-patent-muted">{(item.file.size / 1024).toFixed(1)} KB</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {item.status === 'pending' && (
                  <span className="text-xs text-patent-muted">Pending</span>
                )}
                {item.status === 'processing' && (
                  <span className="text-xs text-patent-sky flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> Parsing...
                  </span>
                )}
                {item.status === 'done' && (
                  <span className="text-xs text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Done
                  </span>
                )}
                {item.status === 'error' && (
                  <span className="text-xs text-red-400 flex items-center gap-1" title={item.error}>
                    <AlertCircle className="w-3 h-3" /> Failed
                  </span>
                )}
                {item.status === 'pending' && (
                  <button onClick={() => removeFile(item.file.name)} className="btn-ghost p-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                {item.status === 'done' && item.invoiceId && (
                  <button onClick={() => router.push(`/legal-fees/${item.invoiceId}`)} className="text-xs text-patent-sky hover:underline">
                    View
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {pendingCount > 0 && (
          <button onClick={handleUploadAll} disabled={running} className="btn-primary text-sm flex items-center gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Banknote className="w-4 h-4" />}
            Parse {pendingCount} Invoice{pendingCount !== 1 ? 's' : ''}
          </button>
        )}
        {files.length > 0 && !running && (
          <button onClick={reset} className="btn-secondary text-sm">Clear All</button>
        )}
        {doneCount > 0 && !running && (
          <button onClick={() => router.push('/legal-fees')} className="btn-ghost text-sm text-patent-sky">
            View Legal Fees →
          </button>
        )}
      </div>
    </div>
  )
}

// ── Patent import section ─────────────────────────────────────────────────────

export default function ImportPage() {
  const [step, setStep] = useState<UploadStep>('idle')
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [result, setResult] = useState<UploadResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = e.dataTransfer.files[0]
    if (dropped) validateAndSetFile(dropped)
  }, [])

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) validateAndSetFile(selected)
  }

  const validateAndSetFile = (f: File) => {
    const valid = f.name.endsWith('.xml') || f.name.endsWith('.json')
    if (!valid) {
      setError('Please upload a USPTO XML or JSON file')
      return
    }
    setFile(f)
    setError(null)
    setStep('idle')
    setResult(null)
  }

  const handleImport = async () => {
    if (!file) return
    setStep('uploading')
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      setStep('parsing')
      const response = await fetch('/api/patents/import', {
        method: 'POST',
        body: formData,
      })

      setStep('importing')
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Import failed')
      }

      const data = await response.json()
      setResult(data)
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
      setStep('error')
    }
  }

  const reset = () => {
    setFile(null)
    setStep('idle')
    setResult(null)
    setError(null)
  }

  return (
    <div className="p-8 max-w-3xl animate-fade-in">
      <div className="mb-8">
        <h1 className="page-title">Import Patent Data</h1>
        <p className="text-muted mt-1">Upload USPTO XML or JSON files to import your patent portfolio</p>
      </div>

      {/* Upload area */}
      <div className="card p-6 mb-6">
        <h2 className="section-title mb-4">Upload File</h2>

        {!file ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ${
              dragOver 
                ? 'border-patent-sky/70 bg-patent-sky/5' 
                : 'border-white/20 hover:border-white/30 hover:bg-white/5'
            }`}
          >
            <Upload className={`w-10 h-10 mx-auto mb-4 ${dragOver ? 'text-patent-sky' : 'text-patent-muted'}`} />
            <p className="text-white/80 font-medium mb-1">Drop your USPTO file here</p>
            <p className="text-patent-muted text-sm mb-4">Supports XML and JSON formats</p>
            <label className="btn-primary cursor-pointer text-sm">
              Browse Files
              <input type="file" accept=".xml,.json" onChange={handleFileInput} className="hidden" />
            </label>
          </div>
        ) : (
          <div className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
            {file.name.endsWith('.xml') 
              ? <FileCode className="w-10 h-10 text-patent-sky flex-shrink-0" />
              : <FileJson className="w-10 h-10 text-patent-gold flex-shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className="text-white font-medium truncate">{file.name}</p>
              <p className="text-patent-muted text-sm">{(file.size / 1024).toFixed(1)} KB · {file.name.split('.').pop()?.toUpperCase()}</p>
            </div>
            {step === 'idle' && (
              <button onClick={reset} className="btn-ghost p-1.5">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      {/* Invoice upload */}
      <InvoiceUploadSection />

      {/* Supported formats */}
      <div className="card p-6 mb-6">
        <h2 className="section-title mb-4">Supported Formats</h2>
        <div className="grid grid-cols-2 gap-4">
          <FormatCard
            icon={<FileCode className="w-5 h-5 text-patent-sky" />}
            title="USPTO XML"
            description="Patent grant XML files from USPTO bulk data downloads"
            formats={['us-patent-grant-*.xml', 'Patent Application XML']}
          />
          <FormatCard
            icon={<FileJson className="w-5 h-5 text-patent-gold" />}
            title="PatentsView JSON"
            description="JSON responses from the USPTO PatentsView API"
            formats={['PatentsView API export', 'Custom JSON with patent array']}
          />
        </div>
      </div>

      {/* Import progress */}
      {step !== 'idle' && (
        <div className="card p-6 mb-6">
          <h2 className="section-title mb-4">Import Progress</h2>
          <div className="space-y-3">
            <ProgressStep label="Uploading file" status={getStepStatus(step, 'uploading')} />
            <ProgressStep label="Parsing patent data" status={getStepStatus(step, 'parsing')} />
            <ProgressStep label="Importing to database" status={getStepStatus(step, 'importing')} />
            <ProgressStep label="Complete" status={getStepStatus(step, 'done')} />
          </div>
        </div>
      )}

      {/* Results */}
      {result && step === 'done' && (
        <div className="card p-6 mb-6 border-green-500/20">
          <div className="flex items-center gap-3 mb-4">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <h2 className="section-title">Import Complete</h2>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <ResultStat label="Total Found" value={result.total} color="sky" />
            <ResultStat label="Imported" value={result.imported} color="green" />
            <ResultStat label="Failed" value={result.failed} color="red" />
          </div>
          {result.errors.length > 0 && (
            <div className="mt-4 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
              <p className="text-sm font-medium text-red-400 mb-2">Errors ({result.errors.length})</p>
              <ul className="text-xs text-red-300/70 space-y-1">
                {result.errors.slice(0, 5).map((err, i) => <li key={i}>• {err}</li>)}
                {result.errors.length > 5 && <li>...and {result.errors.length - 5} more</li>}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {file && step === 'idle' && (
          <button onClick={handleImport} className="btn-primary">
            Import Patents
          </button>
        )}
        {(step === 'done' || step === 'error') && (
          <button onClick={reset} className="btn-secondary">
            Import Another File
          </button>
        )}
        {['uploading', 'parsing', 'importing'].includes(step) && (
          <button disabled className="btn-primary flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Processing...
          </button>
        )}
      </div>
    </div>
  )
}

function FormatCard({ icon, title, description, formats }: {
  icon: React.ReactNode
  title: string
  description: string
  formats: string[]
}) {
  return (
    <div className="p-4 bg-white/5 rounded-lg border border-white/8">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="font-medium text-sm text-white">{title}</span>
      </div>
      <p className="text-xs text-patent-muted mb-3">{description}</p>
      <ul className="space-y-1">
        {formats.map(f => (
          <li key={f} className="text-xs font-mono text-patent-sky/70 bg-patent-sky/5 px-2 py-0.5 rounded">
            {f}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProgressStep({ label, status }: { label: string; status: 'pending' | 'active' | 'done' | 'error' }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
        status === 'done'    ? 'bg-green-500' :
        status === 'active'  ? 'bg-patent-sky animate-pulse' :
        status === 'error'   ? 'bg-red-500' :
        'bg-white/10'
      }`}>
        {status === 'done'   && <CheckCircle2 className="w-3 h-3 text-white" />}
        {status === 'active' && <Loader2 className="w-3 h-3 text-white animate-spin" />}
        {status === 'error'  && <X className="w-3 h-3 text-white" />}
      </div>
      <span className={`text-sm ${
        status === 'done'   ? 'text-green-400' :
        status === 'active' ? 'text-white' :
        status === 'error'  ? 'text-red-400' :
        'text-patent-muted'
      }`}>{label}</span>
    </div>
  )
}

function ResultStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-3 bg-white/5 rounded-lg">
      <div className={`text-2xl font-bold font-display text-${color}-400`}>{value}</div>
      <div className="text-xs text-patent-muted mt-0.5">{label}</div>
    </div>
  )
}

type StepOrder = typeof STEP_ORDER[number]
const STEP_ORDER = ['uploading', 'parsing', 'importing', 'done'] as const

function getStepStatus(current: UploadStep, step: string): 'pending' | 'active' | 'done' | 'error' {
  if (current === 'error') return step === current ? 'error' : 'pending'
  const currentIdx = STEP_ORDER.indexOf(current as StepOrder)
  const stepIdx = STEP_ORDER.indexOf(step as StepOrder)
  if (stepIdx < currentIdx) return 'done'
  if (stepIdx === currentIdx) return 'active'
  return 'pending'
}
