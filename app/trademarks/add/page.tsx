'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { ArrowLeft, Loader2, Plus, Info } from 'lucide-react'

export default function AddTrademarkPage() {
  const router = useRouter()
  const [serialNumber, setSerialNumber] = useState('')
  const [markText, setMarkText] = useState('')
  const [registrationNumber, setRegistrationNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const digits = serialNumber.replace(/\D/g, '')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/trademarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serialNumber, markText, registrationNumber, notes }),
      })
      const json = await res.json()
      if (res.status === 409 && json.id) {
        toast('Already tracked — opening it')
        router.push(`/trademarks/${json.id}`)
        return
      }
      if (!res.ok) throw new Error(json.error || 'Failed to add trademark')
      toast.success('Trademark added')
      router.push(`/trademarks/${json.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl animate-fade-in">
      <Link href="/trademarks" className="flex items-center gap-1.5 text-sm text-patent-muted hover:text-white transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Trademarks
      </Link>
      <h1 className="page-title">Add Trademark</h1>
      <p className="text-muted mt-1 mb-6">Track a US trademark by its USPTO serial number</p>

      <div className="card p-4 mb-6 flex gap-3 text-sm" style={{ borderColor: 'rgba(74,144,217,0.3)' }}>
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-patent-sky" />
        <div className="text-patent-muted space-y-1">
          <p>USPTO doesn&apos;t offer a live trademark lookup we can use, so details come from its daily bulk files.
            A mark you add here fills in automatically the next time it has any USPTO activity.</p>
          <p>To fill it in right away, run the backfill import for this serial:
            <code className="block mt-1 text-xs font-mono" style={{ color: 'var(--patent-sky)' }}>
              npx tsx --env-file=.env.local scripts/trademark-scan.ts --daily-only --serial {digits || '<serial>'} --out tm.jsonl
            </code>
            (drop <code className="font-mono">--daily-only</code> for marks without activity this year), then
            <code className="font-mono"> scripts/trademark-import.ts --in tm.jsonl --serial {digits || '<serial>'}</code>.</p>
          <p>New filings in Plasmology4&apos;s name are picked up automatically.</p>
        </div>
      </div>

      <form onSubmit={submit} className="card p-6 space-y-4">
        <div>
          <label className="label block mb-1.5">Serial number *</label>
          <input value={serialNumber} onChange={e => setSerialNumber(e.target.value)} placeholder="e.g. 85943865"
            className="input w-full font-mono" required />
          {serialNumber && digits.length !== 8 && <p className="text-xs text-yellow-400 mt-1">Serial numbers are 8 digits</p>}
        </div>
        <div>
          <label className="label block mb-1.5">Mark (optional — shown until USPTO data arrives)</label>
          <input value={markText} onChange={e => setMarkText(e.target.value)} placeholder="e.g. PLAZ4" className="input w-full" />
        </div>
        <div>
          <label className="label block mb-1.5">Registration number (optional)</label>
          <input value={registrationNumber} onChange={e => setRegistrationNumber(e.target.value)} className="input w-full font-mono" />
        </div>
        <div>
          <label className="label block mb-1.5">Notes (optional)</label>
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} className="input w-full" />
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button type="submit" disabled={saving || digits.length !== 8} className="btn-primary flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add Trademark
        </button>
      </form>
    </div>
  )
}
