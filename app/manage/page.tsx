'use client'

import React, { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, Loader2, AlertCircle, CheckCircle2, Pencil, X, Save,
  DollarSign, RefreshCw, Check, ChevronDown, ChevronUp,
  AlertTriangle, Wifi, WifiOff, RotateCcw, Zap, ArrowLeft,
  GitBranch, ChevronRight, ExternalLink
} from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────
interface Fee {
  id: string; feeType: string; dueDate: string
  gracePeriodEnd: string | null; status: string; amount: number | null; paidDate: string | null
}

interface Patent {
  id: string
  patentNumber: string | null
  applicationNumber: string | null
  title: string
  status: string
  type: string
  assignee: string | null
  expirationDate: string | null
  familyId: string | null
  family: { id: string; name: string } | null
  jurisdiction: string | null
  epNumber: string | null
  publicationNumber: string | null
  maintenanceFees: Fee[]
  updatedAt?: string
}

interface Family { id: string; name: string }

interface RefreshResult {
  id: string; patentNumber: string | null; title: string
  status: 'updated' | 'unchanged' | 'error' | 'skipped'
  message?: string; changes?: string[]
}

const PATENT_STATUSES = ['PENDING','PUBLISHED','GRANTED','ABANDONED','EXPIRED','LICENSED','SOLD']
const PATENT_TYPES    = ['UTILITY','DESIGN','PLANT','PROVISIONAL','PCT']
const FEE_STATUSES    = ['UPCOMING','DUE','OVERDUE','PAID','WAIVED']

function feeLabel(t: string) { return t.replace('MAINTENANCE_','').replace('_','.') + 'yr' }
function fmt(d: string | null | undefined) { return d ? d.slice(0,10) : '—' }

const STATUS_COLORS: Record<string,string> = {
  GRANTED:'#4ade80', PENDING:'#facc15', ABANDONED:'#f87171',
  EXPIRED:'#f87171', PUBLISHED:'#60a5fa', LICENSED:'#a78bfa', SOLD:'#fb923c',
}
const FEE_COLORS: Record<string,string> = {
  PAID:'#4ade80', OVERDUE:'#f87171', DUE:'#fb923c', UPCOMING:'#60a5fa', WAIVED:'#9ca3af',
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function Sel({ value, options, onChange, colorMap = {} }: {
  value: string; options: string[]; onChange:(v:string)=>void; colorMap?: Record<string,string>
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="input text-xs py-0.5 px-2 h-7" style={{ minWidth: 110, color: colorMap[value] }}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function SaveBtn({ saving, saved, dirty, onClick }: { saving:boolean; saved:boolean; dirty:boolean; onClick:()=>void }) {
  if (!dirty && !saved) return <span className="text-xs text-patent-muted px-2">—</span>
  return (
    <button onClick={onClick} disabled={saving || saved}
      className="btn-primary flex items-center gap-1 text-xs py-1 px-2.5"
      style={saved ? { background:'rgba(34,197,94,0.15)', borderColor:'rgba(34,197,94,0.3)', color:'#4ade80' } : {}}>
      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3"/> : <Save className="w-3 h-3"/>}
      {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
    </button>
  )
}

// ── Patent row ─────────────────────────────────────────────────────────────── 
function PatentRow({ patent, families, refreshState, onPatentSaved, onFeesSaved }: {
  patent: Patent; families: Family[]
  refreshState: { status: 'idle'|'running'|'updated'|'unchanged'|'error'|'skipped'; changes?: string[]; message?: string }
  onPatentSaved: (id: string, changes: Partial<Patent>) => void
  onFeesSaved: () => void
}) {
  const [editing, setEditing]   = useState(false)
  const [draft, setDraft]       = useState({ status: patent.status, type: patent.type, assignee: patent.assignee || '', expirationDate: patent.expirationDate?.slice(0,10) || '', familyId: patent.familyId || '' })
  const [saving, setSaving]     = useState(false)
  const [saved, setSaved]       = useState(false)
  const [expandFees, setExpandFees] = useState(false)

  // Per-fee state: { [feeId]: { status, saving, saved } }
  const [feeStates, setFeeStates] = useState<Record<string,{ status:string; saving:boolean; saved:boolean }>>(() =>
    Object.fromEntries(patent.maintenanceFees.map(f => [f.id, { status: f.status, saving: false, saved: false }]))
  )

  const set = (k: keyof typeof draft, v: string) => setDraft(d => ({ ...d, [k]: v }))
  const isDirty = draft.status !== patent.status || draft.type !== patent.type ||
    (draft.assignee || '') !== (patent.assignee || '') ||
    (draft.expirationDate || '') !== (patent.expirationDate?.slice(0,10) || '') ||
    (draft.familyId || '') !== (patent.familyId || '')

  const savePatent = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/patents/${patent.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: draft.status, type: draft.type,
          assignee: draft.assignee || null,
          expirationDate: draft.expirationDate ? new Date(draft.expirationDate).toISOString() : null,
          familyId: draft.familyId || null,
        }),
      })
      if (!res.ok) throw new Error()
      setSaved(true); setEditing(false)
      onPatentSaved(patent.id, { status: draft.status as any, type: draft.type as any, assignee: draft.assignee || null })
      setTimeout(() => setSaved(false), 2500)
    } catch { alert('Failed to save') }
    finally { setSaving(false) }
  }

  const saveFee = async (feeId: string) => {
    const fs = feeStates[feeId]
    if (!fs) return
    setFeeStates(s => ({ ...s, [feeId]: { ...s[feeId], saving: true } }))
    try {
      const res = await fetch(`/api/fees/${feeId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: fs.status, paidDate: fs.status === 'PAID' ? new Date().toISOString() : null }),
      })
      if (!res.ok) throw new Error()
      setFeeStates(s => ({ ...s, [feeId]: { ...s[feeId], saving: false, saved: true } }))
      setTimeout(() => setFeeStates(s => ({ ...s, [feeId]: { ...s[feeId], saved: false } })), 2500)
      onFeesSaved()
    } catch {
      alert('Failed to save fee')
      setFeeStates(s => ({ ...s, [feeId]: { ...s[feeId], saving: false } }))
    }
  }

  const rs = refreshState
  const refreshIcon = rs.status === 'running'   ? <Loader2 className="w-3 h-3 animate-spin text-patent-sky" />
                    : rs.status === 'updated'    ? <Check className="w-3 h-3" style={{color:'#4ade80'}}/>
                    : rs.status === 'unchanged'  ? <Check className="w-3 h-3 text-patent-muted"/>
                    : rs.status === 'error'      ? <AlertCircle className="w-3 h-3" style={{color:'#f87171'}}/>
                    : rs.status === 'skipped'    ? <AlertTriangle className="w-3 h-3 text-patent-muted"/>
                    : null

  return (
    <>
      <tr className="hover:bg-white/[0.02] transition-colors group border-b border-white/5">
        {/* Refresh indicator */}
        <td className="pl-4 pr-2 py-3 w-8">
          <div title={rs.changes?.join(', ') || rs.message || ''}>{refreshIcon}</div>
        </td>

        {/* Country */}
        <td className="px-3 py-3 w-16">
          <span className="text-sm" title={(patent.jurisdiction || 'US') === 'EP' ? 'European Patent' : 'United States'}>
            {(patent.jurisdiction === 'EP' || patent.epNumber) ? '🇪🇺' : '🇺🇸'}
          </span>
        </td>

        {/* Patent number */}
        <td className="px-3 py-3 w-32">
          <Link href={`/patents/${patent.id}`} className="font-mono text-xs hover:underline" style={{color:'var(--patent-sky)'}}>
            {patent.jurisdiction === 'EP' || patent.epNumber
              ? `EP${patent.epNumber || ''}`
              : (patent.patentNumber || patent.applicationNumber || '—')}
          </Link>
        </td>

        {/* Title */}
        <td className="px-3 py-3">
          <p className="text-sm text-white truncate max-w-xs" title={patent.title}>{patent.title}</p>
        </td>

        {/* Status */}
        <td className="px-3 py-3 w-36">
          {editing
            ? <Sel value={draft.status} options={PATENT_STATUSES} onChange={v=>set('status',v)} colorMap={STATUS_COLORS}/>
            : <span className="text-xs font-semibold" style={{color: STATUS_COLORS[patent.status]||'white'}}>{patent.status}</span>
          }
        </td>

        {/* Type */}
        <td className="px-3 py-3 w-28">
          {editing
            ? <Sel value={draft.type} options={PATENT_TYPES} onChange={v=>set('type',v)}/>
            : <span className="text-xs text-patent-muted">{patent.type}</span>
          }
        </td>

        {/* Assignee */}
        <td className="px-3 py-3 w-40">
          {editing
            ? <input type="text" value={draft.assignee} onChange={e=>set('assignee',e.target.value)} placeholder="Assignee" className="input text-xs py-0.5 px-2 h-7 w-full"/>
            : <span className="text-xs text-patent-muted truncate block">{patent.assignee||'—'}</span>
          }
        </td>

        {/* Family */}
        <td className="px-3 py-3 w-32">
          {editing
            ? <select value={draft.familyId} onChange={e=>set('familyId',e.target.value)} className="input text-xs py-0.5 px-2 h-7" style={{minWidth:110}}>
                <option value="">No family</option>
                {families.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            : <span className="text-xs text-patent-muted">{patent.family?.name||'—'}</span>
          }
        </td>

        {/* Expiry */}
        <td className="px-3 py-3 w-28">
          {editing
            ? <input type="date" value={draft.expirationDate} onChange={e=>set('expirationDate',e.target.value)} className="input text-xs py-0.5 px-2 h-7"/>
            : <span className="text-xs text-patent-muted">{fmt(patent.expirationDate)}</span>
          }
        </td>

        {/* Actions */}
        <td className="px-3 py-3 w-40">
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <SaveBtn saving={saving} saved={saved} dirty={isDirty} onClick={savePatent}/>
                <button onClick={()=>{setEditing(false);setDraft({status:patent.status,type:patent.type,assignee:patent.assignee||'',expirationDate:patent.expirationDate?.slice(0,10)||'',familyId:patent.familyId||''})}} className="btn-ghost p-1"><X className="w-3 h-3"/></button>
              </>
            ) : (
              <>
                <button onClick={()=>setEditing(true)} className="btn-ghost flex items-center gap-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity py-1">
                  <Pencil className="w-3 h-3"/> Edit
                </button>
                {patent.maintenanceFees.length > 0 && (
                  <button onClick={()=>setExpandFees(e=>!e)} className="btn-ghost p-1 text-xs text-patent-muted" title="Edit fees">
                    <DollarSign className="w-3.5 h-3.5"/>
                    {expandFees ? <ChevronUp className="w-3 h-3 inline-block"/> : <ChevronDown className="w-3 h-3 inline-block"/>}
                  </button>
                )}
              </>
            )}
          </div>
        </td>
      </tr>

      {/* Expanded fee rows */}
      {expandFees && patent.maintenanceFees.map(fee => {
        const fs = feeStates[fee.id] || { status: fee.status, saving: false, saved: false }
        const feeDirty = fs.status !== fee.status
        return (
          <tr key={fee.id} style={{background:'rgba(74,144,217,0.04)'}} className="border-b border-white/5">
            <td colSpan={2} className="pl-10 py-2">
              <span className="text-xs text-patent-muted font-mono">↳ {feeLabel(fee.feeType)}</span>
            </td>
            <td className="py-2 text-xs text-patent-muted">{fmt(fee.dueDate)}</td>
            <td className="py-2">
              <Sel value={fs.status} options={FEE_STATUSES}
                onChange={v=>setFeeStates(s=>({...s,[fee.id]:{...s[fee.id],status:v}}))}
                colorMap={FEE_COLORS}/>
            </td>
            <td className="py-2 text-xs text-patent-muted">{fee.amount?`$${fee.amount.toLocaleString()}`:'—'}</td>
            <td className="py-2 text-xs text-patent-muted">Grace: {fmt(fee.gracePeriodEnd)}</td>
            <td colSpan={2}/>
            <td className="py-2 pr-4">
              <SaveBtn saving={fs.saving} saved={fs.saved} dirty={feeDirty} onClick={()=>saveFee(fee.id)}/>
            </td>
          </tr>
        )
      })}
    </>
  )
}

// ── Refresh panel ─────────────────────────────────────────────────────────────
function RefreshPanel({ patents, onComplete }: { patents: Patent[]; onComplete: () => void }) {
  const [phase, setPhase]     = useState<'idle'|'confirming'|'running'|'done'>('idle')
  const [current, setCurrent] = useState(0)
  const [results, setResults] = useState<RefreshResult[]>([])
  const [perPatent, setPerPatent] = useState<Record<string, RefreshResult>>({})
  const abortRef = React.useRef(false)

  const start = async () => {
    setPhase('running'); abortRef.current = false
    setCurrent(0); setResults([]); setPerPatent({})

    for (let i = 0; i < patents.length; i++) {
      if (abortRef.current) break
      const p = patents[i]
      setCurrent(i + 1)
      try {
        const res = await fetch(`/api/patents/refresh?id=${p.id}`)
        const result: RefreshResult = await res.json()
        setResults(prev => [...prev, result])
        setPerPatent(prev => ({ ...prev, [p.id]: result }))
      } catch {
        const errResult: RefreshResult = { id: p.id, patentNumber: p.patentNumber, title: p.title, status: 'error', message: 'Network error' }
        setResults(prev => [...prev, errResult])
        setPerPatent(prev => ({ ...prev, [p.id]: errResult }))
      }
      // Small delay between requests to respect ODP rate limits
      if (i < patents.length - 1) await new Promise(r => setTimeout(r, 350))
    }

    setPhase('done')
    onComplete()
  }

  const stop = () => { abortRef.current = true }

  const updated   = results.filter(r => r.status === 'updated').length
  const unchanged = results.filter(r => r.status === 'unchanged').length
  const failed    = results.filter(r => r.status === 'error' || r.status === 'skipped').length
  const progress  = patents.length > 0 ? Math.round((current / patents.length) * 100) : 0

  return { perPatent, ui: (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{background:'rgba(74,144,217,0.15)', border:'1px solid rgba(74,144,217,0.2)'}}>
            <RefreshCw className="w-4 h-4" style={{color:'var(--patent-sky)'}}/>
          </div>
          <div>
            <h2 className="font-semibold text-white text-sm">Refresh from USPTO</h2>
            <p className="text-xs text-patent-muted">Re-fetch live data for all {patents.length} patents from the USPTO Open Data Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {phase === 'idle' && (
            <button onClick={start} disabled={patents.length === 0}
              className="btn-primary flex items-center gap-2 text-sm">
              <Zap className="w-4 h-4"/> Refresh All ({patents.length})
            </button>
          )}
          {phase === 'running' && (
            <button onClick={stop} className="btn-secondary flex items-center gap-2 text-sm">
              <X className="w-4 h-4"/> Stop
            </button>
          )}
          {phase === 'done' && (
            <button onClick={()=>setPhase('idle')} className="btn-secondary flex items-center gap-2 text-sm">
              <RotateCcw className="w-3.5 h-3.5"/> Refresh Again
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {(phase === 'running' || phase === 'done') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-patent-muted">
            <span>{phase === 'done' ? 'Complete' : `Processing ${current} / ${patents.length}…`}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.08)'}}>
            <div className="h-full rounded-full transition-all duration-300"
              style={{width:`${progress}%`, background: phase === 'done' ? '#4ade80' : 'var(--patent-sky)'}}/>
          </div>

          {/* Summary chips */}
          {results.length > 0 && (
            <div className="flex items-center gap-3 pt-1">
              <span className="flex items-center gap-1.5 text-xs" style={{color:'#4ade80'}}>
                <CheckCircle2 className="w-3.5 h-3.5"/> {updated} updated
              </span>
              <span className="flex items-center gap-1.5 text-xs text-patent-muted">
                <Check className="w-3.5 h-3.5"/> {unchanged} unchanged
              </span>
              {failed > 0 && (
                <span className="flex items-center gap-1.5 text-xs" style={{color:'#f87171'}}>
                  <AlertCircle className="w-3.5 h-3.5"/> {failed} failed
                </span>
              )}
            </div>
          )}

          {/* Per-patent change list (only updated/errored) */}
          {results.filter(r => r.status === 'updated' || r.status === 'error').length > 0 && (
            <div className="mt-2 rounded-lg overflow-hidden text-xs divide-y"
              style={{border:'1px solid rgba(255,255,255,0.08)', maxHeight:200, overflowY:'auto'}}>
              {results.filter(r => r.status === 'updated' || r.status === 'error').map(r => (
                <div key={r.id} className="px-3 py-2 flex items-start gap-2">
                  {r.status === 'updated'
                    ? <Check className="w-3 h-3 mt-0.5 flex-shrink-0" style={{color:'#4ade80'}}/>
                    : <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" style={{color:'#f87171'}}/>}
                  <div>
                    <span className="font-mono" style={{color:'var(--patent-sky)'}}>{r.patentNumber || r.id.slice(-8)}</span>
                    {' · '}
                    <span className="text-patent-muted">{r.title.slice(0,50)}</span>
                    {r.changes?.length ? (
                      <div className="text-patent-muted mt-0.5 opacity-70">{r.changes.join(' · ')}</div>
                    ) : r.message ? (
                      <div style={{color:'#f87171'}} className="mt-0.5">{r.message}</div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )}
}

// ── Continuity Tree ───────────────────────────────────────────────────────────

interface TreePatent {
  id: string
  patentNumber: string | null
  applicationNumber: string | null
  title: string
  status: string
  type: string
  jurisdiction: string | null
  filingDate: string | null
  grantDate: string | null
  continuationType: string | null
  parentPatentId: string | null
  family: { id: string; name: string } | null
  children?: TreePatent[]
}

const CONT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  CONTINUATION:        { label: 'CON',  color: '#60a5fa' },
  CONTINUATION_IN_PART:{ label: 'CIP',  color: '#a78bfa' },
  DIVISIONAL:          { label: 'DIV',  color: '#34d399' },
  REISSUE:             { label: 'REI',  color: '#fbbf24' },
  REEXAMINATION:       { label: 'REX',  color: '#fb923c' },
}

function buildTrees(patents: TreePatent[]): TreePatent[] {
  const byId = new Map(patents.map(p => [p.id, { ...p, children: [] as TreePatent[] }]))
  const roots: TreePatent[] = []
  for (const p of Array.from(byId.values())) {
    if (p.parentPatentId && byId.has(p.parentPatentId)) {
      byId.get(p.parentPatentId)!.children!.push(p)
    } else {
      roots.push(p)
    }
  }
  // Sort children by filing date
  const sortChildren = (node: TreePatent) => {
    node.children?.sort((a, b) => (a.filingDate || '').localeCompare(b.filingDate || ''))
    node.children?.forEach(sortChildren)
  }
  roots.forEach(sortChildren)
  // Only return roots that have at least one child (or any patent with no parent that has continuations)
  return roots.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
}

function TreeNode({ node, depth = 0, isLast = false }: { node: TreePatent; depth?: number; isLast?: boolean }) {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = (node.children?.length ?? 0) > 0
  const ct = node.continuationType ? CONT_TYPE_LABELS[node.continuationType] : null
  const isGranted = node.status === 'GRANTED'
  const isAbandoned = node.status === 'ABANDONED' || node.status === 'EXPIRED'

  const statusColor = isGranted ? '#4ade80' : isAbandoned ? '#f87171' :
    node.status === 'PENDING' ? '#facc15' : node.status === 'PUBLISHED' ? '#60a5fa' : '#94a3b8'

  const displayNum = node.jurisdiction === 'EP'
    ? `EP${node.applicationNumber || ''}`
    : node.patentNumber || node.applicationNumber || '—'

  return (
    <div className="select-none">
      <div className="flex items-start group"
        style={{ paddingLeft: depth * 28 }}>

        {/* Tree connector lines */}
        {depth > 0 && (
          <div className="flex-shrink-0 w-7 flex flex-col items-center relative" style={{ marginLeft: -28 }}>
            <div className="absolute left-3 top-0 w-px"
              style={{ height: isLast ? '50%' : '100%', background: 'rgba(74,144,217,0.2)' }} />
            <div className="absolute left-3 top-1/2 w-3 h-px -translate-y-1/2"
              style={{ background: 'rgba(74,144,217,0.2)' }} />
          </div>
        )}

        {/* Expand/collapse toggle */}
        <div className="flex-shrink-0 w-5 mt-2.5 mr-1">
          {hasChildren ? (
            <button onClick={() => setCollapsed(c => !c)}
              className="w-4 h-4 rounded flex items-center justify-center transition-colors hover:bg-white/10"
              style={{ color: 'var(--patent-sky)' }}>
              <ChevronRight className={`w-3.5 h-3.5 transition-transform ${collapsed ? '' : 'rotate-90'}`} />
            </button>
          ) : (
            <div className="w-4 h-4 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(148,163,184,0.3)' }} />
            </div>
          )}
        </div>

        {/* Node card */}
        <div className="flex-1 flex items-center gap-2.5 py-2 px-3 mb-1 rounded-lg min-w-0 transition-colors group-hover:bg-white/[0.03]"
          style={{ border: '1px solid transparent' }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>

          {/* Continuation type badge */}
          {ct ? (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ background: ct.color + '18', color: ct.color, border: `1px solid ${ct.color}33` }}>
              {ct.label}
            </span>
          ) : depth === 0 ? (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded flex-shrink-0"
              style={{ background: 'rgba(148,163,184,0.1)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.2)' }}>
              ROOT
            </span>
          ) : (
            <span className="w-9 flex-shrink-0" />
          )}

          {/* Patent number */}
          <span className="font-mono text-xs flex-shrink-0 w-24"
            style={{ color: 'var(--patent-sky)' }}>
            {displayNum}
          </span>

          {/* Status dot */}
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: statusColor }} />

          {/* Title */}
          <span className="text-sm truncate flex-1 min-w-0" style={{ color: 'rgba(255,255,255,0.82)' }}
            title={node.title}>
            {node.title}
          </span>

          {/* Type chip */}
          <span className="text-[10px] text-patent-muted flex-shrink-0 hidden group-hover:inline">
            {node.type}
          </span>

          {/* Filing year */}
          <span className="text-xs text-patent-muted flex-shrink-0 w-10 text-right">
            {node.filingDate?.slice(0, 4) || '—'}
          </span>

          {/* Status label */}
          <span className="text-[10px] font-semibold flex-shrink-0 w-20 text-right"
            style={{ color: statusColor }}>
            {node.status}
          </span>

          {/* Link */}
          <Link href={`/patents/${node.id}`}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10"
            style={{ color: 'var(--patent-sky)' }}
            title="Open patent">
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* Children */}
      {!collapsed && hasChildren && (
        <div>
          {node.children!.map((child, i) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={i === node.children!.length - 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function ContinuityTreeTab() {
  const [patents, setPatents]   = useState<TreePatent[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [expandAll, setExpandAll] = useState(false)

  useEffect(() => {
    fetch('/api/patents?pageSize=500&fields=tree')
      .then(r => r.json())
      .then(d => setPatents(d.patents || []))
      .catch(() => setError('Failed to load patents'))
      .finally(() => setLoading(false))
  }, [])

  const trees = buildTrees(patents)

  // Filter trees: show a root if it or any descendant matches search
  const patentMatchesSearch = (p: TreePatent, q: string): boolean => {
    const lq = q.toLowerCase()
    if (p.title.toLowerCase().includes(lq)) return true
    if ((p.patentNumber || '').includes(q)) return true
    if ((p.applicationNumber || '').includes(q)) return true
    return p.children?.some(c => patentMatchesSearch(c, q)) ?? false
  }

  const visibleTrees = search
    ? trees.filter(t => patentMatchesSearch(t, search))
    : trees

  // Stats
  const totalWithRelations = patents.filter(p => p.parentPatentId || (patents.some(q => q.parentPatentId === p.id))).length
  const orphans = patents.filter(p => !p.parentPatentId && !patents.some(q => q.parentPatentId === p.id)).length

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--patent-sky)' }} />
    </div>
  )

  if (error) return (
    <div className="card p-8 text-center">
      <AlertCircle className="w-8 h-8 mx-auto mb-3 opacity-30" style={{ color: '#f87171' }} />
      <p className="text-sm" style={{ color: '#f87171' }}>{error}</p>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2 text-xs text-patent-muted">
          <GitBranch className="w-3.5 h-3.5" />
          <span><span className="text-white font-semibold">{trees.length}</span> root patent{trees.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="text-xs text-patent-muted">
          <span className="text-white font-semibold">{totalWithRelations}</span> patents with continuation links
        </div>
        {orphans > 0 && (
          <div className="text-xs text-patent-muted">
            <span className="text-white font-semibold">{orphans}</span> standalone (no relations)
          </div>
        )}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Legend */}
          {Object.entries(CONT_TYPE_LABELS).map(([, v]) => (
            <span key={v.label} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: v.color + '18', color: v.color, border: `1px solid ${v.color}33` }}>
              {v.label}
            </span>
          ))}
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patent-muted" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Filter by title or number…"
          className="input pl-9 w-full text-sm" />
      </div>

      {/* Trees */}
      {visibleTrees.length === 0 ? (
        <div className="card p-12 text-center">
          <GitBranch className="w-8 h-8 mx-auto mb-3 opacity-20 text-patent-muted" />
          <p className="text-sm text-patent-muted">
            {patents.length === 0 ? 'No patents in portfolio yet' :
             search ? 'No patents match your filter' :
             'No continuation relationships found — refresh patents from USPTO to populate continuity links'}
          </p>
        </div>
      ) : (
        <div className="card p-5">
          {/* Column headers */}
          <div className="flex items-center gap-2.5 px-6 pb-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-patent-muted"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <span className="w-9 flex-shrink-0" />
            <span className="w-24 flex-shrink-0">Number</span>
            <span className="w-2 flex-shrink-0" />
            <span className="flex-1">Title</span>
            <span className="w-10 text-right">Filed</span>
            <span className="w-20 text-right">Status</span>
            <span className="w-8" />
          </div>

          <div className="space-y-0.5">
            {visibleTrees.map(tree => (
              <TreeNode key={tree.id} node={tree} depth={0} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ManagePage() {
  const [tab, setTab] = useState<'patents' | 'tree'>('patents')
  const [patents, setPatents]   = useState<Patent[]>([])
  const [families, setFamilies] = useState<Family[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState<string | null>(null)
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [refreshStates, setRefreshStates] = useState<Record<string, {
    status: 'idle'|'running'|'updated'|'unchanged'|'error'|'skipped'; changes?: string[]; message?: string
  }>>({})

  // Refresh panel state lifted here so row-level indicators update in real-time
  const [refreshPhase, setRefreshPhase]   = useState<'idle'|'running'|'done'>('idle')
  const [refreshCurrent, setRefreshCurrent] = useState(0)
  const [refreshResults, setRefreshResults] = useState<RefreshResult[]>([])
  const abortRef = React.useRef(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const [pRes, fRes] = await Promise.all([
        fetch('/api/patents?pageSize=500'),
        fetch('/api/families'),
      ])
      if (!pRes.ok) throw new Error('Failed to load patents')
      const [pData, fData] = await Promise.all([pRes.json(), fRes.json()])

      // Fetch all fees in one call
      const feesRes = await fetch('/api/fees')
      const feesData = feesRes.ok ? await feesRes.json() : { fees: [] }
      const feesByPatent: Record<string, Fee[]> = {}
      for (const f of feesData.fees || []) {
        if (!feesByPatent[f.patentId]) feesByPatent[f.patentId] = []
        feesByPatent[f.patentId].push(f)
      }

      setPatents((pData.patents || []).map((p: Patent) => ({
        ...p, maintenanceFees: feesByPatent[p.id] || []
      })))
      setFamilies(Array.isArray(fData) ? fData : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const startRefresh = async () => {
    setRefreshPhase('running'); abortRef.current = false
    setRefreshCurrent(0); setRefreshResults([])

    const targets = filteredPatents
    for (let i = 0; i < targets.length; i++) {
      if (abortRef.current) break
      const p = targets[i]
      setRefreshCurrent(i + 1)
      setRefreshStates(s => ({ ...s, [p.id]: { status: 'running' } }))
      try {
        const res = await fetch(`/api/patents/refresh?id=${p.id}`)
        const result: RefreshResult = await res.json()
        setRefreshResults(prev => [...prev, result])
        setRefreshStates(s => ({ ...s, [p.id]: { status: result.status, changes: result.changes, message: result.message } }))
        if (result.status === 'updated') {
          // Update local state immediately so changes show without reload
          setPatents(prev => prev.map(pat => pat.id === p.id
            ? { ...pat, status: result.changes?.find(c=>c.startsWith('status:')) ? (result.changes.find(c=>c.startsWith('status:'))!.split('→')[1]?.trim() as any) ?? pat.status : pat.status }
            : pat
          ))
        }
      } catch {
        const err: RefreshResult = { id: p.id, patentNumber: p.patentNumber, title: p.title, status: 'error', message: 'Network error' }
        setRefreshResults(prev => [...prev, err])
        setRefreshStates(s => ({ ...s, [p.id]: { status: 'error', message: 'Network error' } }))
      }
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 350))
    }
    setRefreshPhase('done')
  }

  const filteredPatents = patents.filter(p => {
    const matchSearch = !search ||
      p.title.toLowerCase().includes(search.toLowerCase()) ||
      (p.patentNumber||'').includes(search) ||
      (p.applicationNumber||'').includes(search) ||
      (p.assignee||'').toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'ALL' || p.status === statusFilter
    return matchSearch && matchStatus
  })

  const updated   = refreshResults.filter(r => r.status === 'updated').length
  const unchanged = refreshResults.filter(r => r.status === 'unchanged').length
  const failed    = refreshResults.filter(r => r.status === 'error' || r.status === 'skipped').length
  const progress  = filteredPatents.length > 0 ? Math.round((refreshCurrent / filteredPatents.length) * 100) : 0

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-start justify-between mb-6">
        <div>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-xs text-patent-muted hover:text-white transition-colors mb-3">
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <h1 className="page-title">Data Management</h1>
          <p className="text-muted mt-1">Edit patent fields, update fee statuses, and refresh data from USPTO</p>
        </div>
      </div>

      {/* ── Tab switcher ─── */}
      <div className="flex items-center gap-1 p-1 rounded-lg w-fit mb-6"
        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <button onClick={() => setTab('patents')}
          className="text-sm px-4 py-1.5 rounded-md transition-all font-medium flex items-center gap-2"
          style={{
            background: tab === 'patents' ? 'rgba(74,144,217,0.2)' : 'transparent',
            color: tab === 'patents' ? 'var(--patent-sky)' : 'var(--patent-muted)',
          }}>
          <Search className="w-3.5 h-3.5" /> Patents
        </button>
        <button onClick={() => setTab('tree')}
          className="text-sm px-4 py-1.5 rounded-md transition-all font-medium flex items-center gap-2"
          style={{
            background: tab === 'tree' ? 'rgba(74,144,217,0.2)' : 'transparent',
            color: tab === 'tree' ? 'var(--patent-sky)' : 'var(--patent-muted)',
          }}>
          <GitBranch className="w-3.5 h-3.5" /> Continuity Tree
        </button>
      </div>

      {tab === 'tree' && <ContinuityTreeTab />}

      {tab === 'patents' && (<>
      <div className="card p-5 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{background:'rgba(74,144,217,0.15)', border:'1px solid rgba(74,144,217,0.2)'}}>
              <Wifi className="w-4 h-4" style={{color:'var(--patent-sky)'}}/>
            </div>
            <div>
              <h2 className="font-semibold text-white text-sm">Refresh from USPTO</h2>
              <p className="text-xs text-patent-muted mt-0.5">
                Re-fetches live data for {search || statusFilter !== 'ALL' ? `${filteredPatents.length} filtered` : `all ${patents.length}`} patents from the USPTO Open Data Portal.
                Updates status, title, assignee, grant dates, CPC codes, and raw JSON.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {refreshPhase === 'idle' && (
              <button onClick={startRefresh} disabled={loading || filteredPatents.length === 0}
                className="btn-primary flex items-center gap-2 text-sm">
                <RefreshCw className="w-4 h-4"/> Refresh {filteredPatents.length > 0 ? `(${filteredPatents.length})` : ''}
              </button>
            )}
            {refreshPhase === 'running' && (
              <button onClick={() => { abortRef.current = true }} className="btn-secondary flex items-center gap-2 text-sm">
                <X className="w-4 h-4"/> Stop
              </button>
            )}
            {refreshPhase === 'done' && (
              <button onClick={() => { setRefreshPhase('idle'); setRefreshResults([]); setRefreshStates({}) }}
                className="btn-secondary flex items-center gap-2 text-sm">
                <RotateCcw className="w-3.5 h-3.5"/> Reset
              </button>
            )}
          </div>
        </div>

        {(refreshPhase === 'running' || refreshPhase === 'done') && (
          <div className="mt-4 space-y-3">
            <div className="flex justify-between text-xs text-patent-muted">
              <span>{refreshPhase === 'done' ? 'Complete' : `${refreshCurrent} / ${filteredPatents.length} processed…`}</span>
              <span>{progress}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.08)'}}>
              <div className="h-full rounded-full transition-all duration-300"
                style={{width:`${progress}%`, background: refreshPhase === 'done' ? '#4ade80' : 'var(--patent-sky)'}}/>
            </div>
            {refreshResults.length > 0 && (
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5 text-xs" style={{color:'#4ade80'}}><CheckCircle2 className="w-3.5 h-3.5"/> {updated} updated</span>
                <span className="flex items-center gap-1.5 text-xs text-patent-muted"><Check className="w-3.5 h-3.5"/> {unchanged} unchanged</span>
                {failed > 0 && <span className="flex items-center gap-1.5 text-xs" style={{color:'#f87171'}}><AlertCircle className="w-3.5 h-3.5"/> {failed} failed</span>}
              </div>
            )}
            {refreshResults.filter(r => r.status === 'updated' || r.status === 'error').length > 0 && (
              <div className="rounded-lg divide-y text-xs" style={{border:'1px solid rgba(255,255,255,0.08)', maxHeight:160, overflowY:'auto'}}>
                {refreshResults.filter(r => r.status === 'updated' || r.status === 'error').map(r => (
                  <div key={r.id} className="px-3 py-2 flex items-start gap-2 hover:bg-white/[0.02]">
                    {r.status === 'updated'
                      ? <Check className="w-3 h-3 mt-0.5 flex-shrink-0" style={{color:'#4ade80'}}/>
                      : <AlertCircle className="w-3 h-3 mt-0.5 flex-shrink-0" style={{color:'#f87171'}}/>}
                    <div className="min-w-0">
                      <span className="font-mono" style={{color:'var(--patent-sky)'}}>{r.patentNumber||'—'}</span>
                      {' · '}
                      <span className="text-patent-muted">{r.title.slice(0,50)}</span>
                      {r.changes?.length
                        ? <div className="text-patent-muted opacity-70 mt-0.5">{r.changes.join(' · ')}</div>
                        : r.message
                        ? <div style={{color:'#f87171'}} className="mt-0.5">{r.message}</div>
                        : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Search + filter ─── */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-patent-muted"/>
          <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Search by title, number, assignee…"
            className="input pl-9 w-full text-sm"/>
        </div>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}
          className="input text-sm py-2 px-3 pr-8">
          <option value="ALL">All statuses</option>
          {PATENT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="text-xs text-patent-muted flex-shrink-0">{filteredPatents.length} patents</span>
      </div>

      {/* ── Table ─── */}
      {error ? (
        <div className="card p-5 flex items-center gap-3" style={{borderColor:'rgba(239,68,68,0.3)'}}>
          <AlertCircle className="w-5 h-5 flex-shrink-0" style={{color:'#f87171'}}/>
          <p className="text-sm" style={{color:'#f87171'}}>{error}</p>
          <button onClick={load} className="btn-ghost text-sm ml-auto">Retry</button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-7 h-7 animate-spin" style={{color:'var(--patent-sky)'}}/>
        </div>
      ) : filteredPatents.length === 0 ? (
        <div className="card p-12 text-center">
          <WifiOff className="w-8 h-8 mx-auto mb-3 opacity-30 text-patent-muted"/>
          <p className="text-patent-muted">{patents.length === 0 ? 'No patents in portfolio yet' : 'No patents match your filters'}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{background:'rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.08)'}}>
                  <th className="pl-4 pr-2 py-3 w-8 text-left"/>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-patent-muted uppercase tracking-wider w-16">Country</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-patent-muted uppercase tracking-wider w-32">Patent No.</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-patent-muted uppercase tracking-wider">Title</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-patent-muted uppercase tracking-wider w-36">Status</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-patent-muted uppercase tracking-wider w-28">Type</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-patent-muted uppercase tracking-wider w-40">Assignee</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-patent-muted uppercase tracking-wider w-32">Family</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-patent-muted uppercase tracking-wider w-28">Expires</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-patent-muted uppercase tracking-wider w-40">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredPatents.map(p => (
                  <PatentRow
                    key={p.id}
                    patent={p}
                    families={families}
                    refreshState={refreshStates[p.id] || { status: 'idle' }}
                    onPatentSaved={(id, changes) => setPatents(prev => prev.map(pat => pat.id === id ? { ...pat, ...changes } : pat))}
                    onFeesSaved={load}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 text-xs text-patent-muted" style={{borderTop:'1px solid rgba(255,255,255,0.06)'}}>
            {filteredPatents.length} of {patents.length} patents · Hover a row to edit · Click $ to expand fees
          </div>
        </div>
      )}
    </>)}
    </div>
  )
}
