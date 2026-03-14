'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  Bell, X, CheckCircle2, Circle, Send, Loader2, Trash2,
  FileText, Plus, ChevronDown, AlertCircle, Clock,
} from 'lucide-react'
import { useAuth } from '@/context/auth-context'
import { useTheme } from '@/context/theme-context'

interface NotifPatent { id: string; patentNumber: string | null; applicationNumber: string | null; title: string }
interface NotifUser   { id: string; name: string | null; email: string }
interface RecipientRecord { id: string; read: boolean; readAt: string | null; todoCompleted: boolean; todoCompletedAt: string | null }

interface Notification {
  id: string
  title: string
  message: string
  patent: NotifPatent | null
  todoText: string | null
  todoDueDate: string | null
  createdBy: NotifUser | null
  createdAt: string
  recipients: { user: NotifUser }[]
  recipientRecord: RecipientRecord
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function ComposeModal({
  onClose, onSent, supabaseId,
}: {
  onClose: () => void
  onSent: () => void
  supabaseId: string
}) {
  const { theme } = useTheme()
  const light = theme === 'light'

  const [title, setTitle]             = useState('')
  const [message, setMessage]         = useState('')
  const [recipientIds, setRecipients] = useState<string[]>([])
  const [patentSearch, setPatentSearch] = useState('')
  const [selectedPatent, setSelectedPatent] = useState<NotifPatent | null>(null)
  const [todoText, setTodoText]       = useState('')
  const [todoDueDate, setTodoDueDate] = useState('')
  const [showTodo, setShowTodo]       = useState(false)
  const [showPatent, setShowPatent]   = useState(false)
  const [members, setMembers]         = useState<NotifUser[]>([])
  const [patents, setPatents]         = useState<NotifPatent[]>([])
  const [sending, setSending]         = useState(false)
  const [error, setError]             = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/team').then(r => r.json()).then(d => setMembers(d.members || []))
    fetch('/api/patents?pageSize=100').then(r => r.json()).then(d => setPatents(d.patents || []))
  }, [])

  const filteredPatents = patentSearch.trim()
    ? patents.filter(p => p.title.toLowerCase().includes(patentSearch.toLowerCase()) ||
        (p.patentNumber || '').includes(patentSearch) ||
        (p.applicationNumber || '').includes(patentSearch))
    : patents.slice(0, 8)

  const toggleRecipient = (id: string) =>
    setRecipients(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const send = async () => {
    if (!title.trim() || !message.trim() || !recipientIds.length) {
      setError('Title, message, and at least one recipient are required.')
      return
    }
    setSending(true); setError(null)
    try {
      const res = await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          message: message.trim(),
          recipientIds,
          patentId: selectedPatent?.id || null,
          todoText: showTodo && todoText.trim() ? todoText.trim() : null,
          todoDueDate: showTodo && todoDueDate ? todoDueDate : null,
          createdBySupabaseId: supabaseId,
        }),
      })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      onSent()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send')
      setSending(false)
    }
  }

  const surfaceBg = light ? '#FFFFFF' : 'rgba(255,255,255,0.05)'
  const surfaceBorder = light ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'
  const textPrimary = light ? '#0F172A' : 'white'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold flex items-center gap-2" style={{ color: textPrimary }}>
            <Bell className="w-4 h-4" style={{ color: 'var(--patent-sky)' }} /> New Notification
          </h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label mb-1.5 block">Title <span style={{ color: '#f87171' }}>*</span></label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Action required: Office action response"
              className="input w-full" autoFocus />
          </div>

          <div>
            <label className="label mb-1.5 block">Message <span style={{ color: '#f87171' }}>*</span></label>
            <textarea value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Write your message here…"
              className="input w-full" rows={3} style={{ resize: 'vertical' }} />
          </div>

          <div>
            <label className="label mb-1.5 block">Recipients <span style={{ color: '#f87171' }}>*</span></label>
            {members.length === 0 ? (
              <p className="text-xs text-patent-muted">No team members found.</p>
            ) : (
              <div className="space-y-1.5">
                {members.map(m => (
                  <label key={m.id} className="flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors"
                    style={{
                      background: recipientIds.includes(m.id) ? (light ? 'rgba(26,91,197,0.08)' : 'rgba(74,144,217,0.1)') : surfaceBg,
                      border: `1px solid ${recipientIds.includes(m.id) ? 'rgba(74,144,217,0.3)' : surfaceBorder}`,
                    }}>
                    <input type="checkbox" checked={recipientIds.includes(m.id)}
                      onChange={() => toggleRecipient(m.id)} className="w-3.5 h-3.5 accent-blue-500" />
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                      style={{ background: 'rgba(45,90,158,0.3)', color: 'var(--patent-sky)' }}>
                      {(m.name || m.email)[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: textPrimary }}>{m.name || m.email}</div>
                      {m.name && <div className="text-[10px] text-patent-muted truncate">{m.email}</div>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div>
            <button type="button" onClick={() => { setShowPatent(v => !v); setSelectedPatent(null); setPatentSearch('') }}
              className="flex items-center gap-1.5 text-xs text-patent-muted hover:text-patent-sky transition-colors">
              <FileText className="w-3.5 h-3.5" />
              {showPatent ? 'Remove patent link' : 'Link to a patent (optional)'}
              <ChevronDown className={`w-3 h-3 transition-transform ${showPatent ? 'rotate-180' : ''}`} />
            </button>
            {showPatent && (
              <div className="mt-2 space-y-2">
                {selectedPatent ? (
                  <div className="flex items-center gap-2 p-2 rounded-lg"
                    style={{ background: light ? 'rgba(26,91,197,0.08)' : 'rgba(74,144,217,0.1)', border: '1px solid rgba(74,144,217,0.2)' }}>
                    <span className="font-mono text-xs" style={{ color: 'var(--patent-sky)' }}>
                      {selectedPatent.patentNumber || selectedPatent.applicationNumber}
                    </span>
                    <span className="text-xs flex-1 truncate" style={{ color: textPrimary }}>{selectedPatent.title}</span>
                    <button onClick={() => setSelectedPatent(null)} className="btn-ghost p-0.5">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input type="text" value={patentSearch} onChange={e => setPatentSearch(e.target.value)}
                      placeholder="Search by title or patent number…" className="input w-full text-xs" />
                    <div className="max-h-36 overflow-y-auto space-y-1">
                      {filteredPatents.map(p => (
                        <button key={p.id} type="button" onClick={() => setSelectedPatent(p)}
                          className="w-full text-left flex items-center gap-2 p-2 rounded-lg transition-colors"
                          style={{ background: surfaceBg, border: `1px solid ${surfaceBorder}` }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(74,144,217,0.3)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = surfaceBorder)}>
                          <span className="font-mono text-[11px] flex-shrink-0" style={{ color: 'var(--patent-sky)' }}>
                            {p.patentNumber || p.applicationNumber || '—'}
                          </span>
                          <span className="text-xs truncate" style={{ color: textPrimary }}>{p.title}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div>
            <button type="button" onClick={() => { setShowTodo(v => !v); setTodoText(''); setTodoDueDate('') }}
              className="flex items-center gap-1.5 text-xs text-patent-muted hover:text-patent-sky transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {showTodo ? 'Remove to-do action' : 'Add a to-do action (optional)'}
              <ChevronDown className={`w-3 h-3 transition-transform ${showTodo ? 'rotate-180' : ''}`} />
            </button>
            {showTodo && (
              <div className="mt-2 space-y-2">
                <input type="text" value={todoText} onChange={e => setTodoText(e.target.value)}
                  placeholder="e.g. File response by deadline" className="input w-full text-xs" />
                <div>
                  <label className="label mb-1 block text-[10px]">Due date (optional)</label>
                  <input type="date" value={todoDueDate} onChange={e => setTodoDueDate(e.target.value)}
                    className="input text-xs" />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs p-2.5 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end mt-5">
          <button onClick={onClose} className="btn-secondary text-sm" disabled={sending}>Cancel</button>
          <button onClick={send} disabled={sending || !title.trim() || !message.trim() || !recipientIds.length}
            className="btn-primary text-sm flex items-center gap-2">
            {sending ? <><Loader2 className="w-4 h-4 animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send</>}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function NotificationPanel() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const light = theme === 'light'

  const [open, setOpen]                   = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unread, setUnread]               = useState(0)
  const [loading, setLoading]             = useState(false)
  const [showCompose, setShowCompose]     = useState(false)
  const [deletingId, setDeletingId]       = useState<string | null>(null)

  const supabaseId = user?.id

  const fetchNotifications = useCallback(async () => {
    if (!supabaseId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/notifications?supabaseId=${supabaseId}`)
      const data = await res.json()
      setNotifications(data.notifications || [])
      setUnread(data.unread || 0)
    } finally {
      setLoading(false)
    }
  }, [supabaseId])

  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  useEffect(() => {
    const t = setInterval(fetchNotifications, 30000)
    return () => clearInterval(t)
  }, [fetchNotifications])

  const markRead = async (notifId: string) => {
    if (!supabaseId) return
    await fetch(`/api/notifications/${notifId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseId, action: 'read' }),
    })
    setNotifications(prev => prev.map(n =>
      n.id === notifId ? { ...n, recipientRecord: { ...n.recipientRecord, read: true } } : n
    ))
    setUnread(u => Math.max(0, u - 1))
  }

  const completeTodo = async (notifId: string) => {
    if (!supabaseId) return
    await fetch(`/api/notifications/${notifId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supabaseId, action: 'complete_todo' }),
    })
    setNotifications(prev => prev.map(n =>
      n.id === notifId
        ? { ...n, recipientRecord: { ...n.recipientRecord, todoCompleted: true, read: true } }
        : n
    ))
    setUnread(u => {
      const notif = notifications.find(n => n.id === notifId)
      return notif && !notif.recipientRecord.read ? Math.max(0, u - 1) : u
    })
  }

  const deleteNotif = async (notifId: string) => {
    setDeletingId(notifId)
    await fetch(`/api/notifications/${notifId}`, { method: 'DELETE' })
    setNotifications(prev => {
      const removed = prev.find(n => n.id === notifId)
      if (removed && !removed.recipientRecord.read) setUnread(u => Math.max(0, u - 1))
      return prev.filter(n => n.id !== notifId)
    })
    setDeletingId(null)
  }

  const markAllRead = async () => {
    if (!supabaseId) return
    const unreadNotifs = notifications.filter(n => !n.recipientRecord.read)
    await Promise.all(unreadNotifs.map(n =>
      fetch(`/api/notifications/${n.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabaseId, action: 'read' }),
      })
    ))
    setNotifications(prev => prev.map(n => ({ ...n, recipientRecord: { ...n.recipientRecord, read: true } })))
    setUnread(0)
  }

  const panelBg    = light ? '#FFFFFF' : '#0E1A2E'
  const borderCol  = light ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'
  const textPrimary = light ? '#0F172A' : 'white'

  return (
    <>
      <button
        onClick={() => { setOpen(true) }}
        title="Notifications"
        className="relative transition-colors flex-shrink-0 text-patent-muted"
        onMouseEnter={e => (e.currentTarget.style.color = light ? '#0F172A' : 'white')}
        onMouseLeave={e => (e.currentTarget.style.color = '')}
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ background: '#ef4444', minWidth: '16px' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {showCompose && supabaseId && (
        <ComposeModal
          supabaseId={supabaseId}
          onClose={() => setShowCompose(false)}
          onSent={() => { setShowCompose(false); fetchNotifications() }}
        />
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 cursor-pointer" onClick={() => setOpen(false)} />

          <div className="w-96 h-full flex flex-col shadow-2xl overflow-hidden"
            style={{ background: panelBg, borderLeft: `1px solid ${borderCol}` }}>

            <div className="px-4 py-4 flex items-center justify-between flex-shrink-0"
              style={{ borderBottom: `1px solid ${borderCol}` }}>
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4" style={{ color: 'var(--patent-sky)' }} />
                <span className="font-semibold text-sm" style={{ color: textPrimary }}>Notifications</span>
                {unread > 0 && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                    style={{ background: '#ef4444' }}>{unread} unread</span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {unread > 0 && (
                  <button onClick={markAllRead} className="text-xs text-patent-muted hover:text-patent-sky transition-colors px-2 py-1">
                    Mark all read
                  </button>
                )}
                <button onClick={() => { setShowCompose(true) }}
                  className="btn-primary text-xs flex items-center gap-1 px-2.5 py-1.5">
                  <Plus className="w-3 h-3" /> New
                </button>
                <button onClick={() => setOpen(false)} className="btn-ghost p-1.5">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loading && notifications.length === 0 ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-5 h-5 animate-spin text-patent-muted" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-16 px-6">
                  <Bell className="w-8 h-8 mx-auto mb-3 text-patent-muted opacity-30" />
                  <p className="text-sm text-patent-muted">No notifications yet</p>
                  <button onClick={() => setShowCompose(true)} className="btn-ghost text-xs mt-3">
                    Send one to your team →
                  </button>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: borderCol }}>
                  {notifications.map(n => {
                    const isUnread = !n.recipientRecord.read
                    const todoComplete = n.recipientRecord.todoCompleted
                    return (
                      <div key={n.id} className="px-4 py-3.5 relative transition-colors"
                        style={{
                          background: isUnread ? (light ? 'rgba(26,91,197,0.04)' : 'rgba(74,144,217,0.05)') : 'transparent',
                          borderLeft: `3px solid ${isUnread ? 'var(--patent-sky)' : 'transparent'}`,
                        }}>
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-sm font-medium leading-snug" style={{ color: textPrimary }}>
                            {n.title}
                          </span>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {isUnread && (
                              <button onClick={() => markRead(n.id)}
                                title="Mark as read"
                                className="text-patent-muted hover:text-patent-sky transition-colors p-0.5">
                                <Circle className="w-3 h-3 fill-current" style={{ color: 'var(--patent-sky)' }} />
                              </button>
                            )}
                            <button onClick={() => deleteNotif(n.id)} disabled={deletingId === n.id}
                              title="Delete" className="text-patent-muted transition-colors p-0.5"
                              onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                              onMouseLeave={e => (e.currentTarget.style.color = '')}>
                              {deletingId === n.id
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <Trash2 className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>

                        <p className="text-xs leading-relaxed mb-2" style={{ color: light ? '#475569' : 'rgba(255,255,255,0.7)' }}>
                          {n.message}
                        </p>

                        {n.patent && (
                          <Link href={`/patents/${n.patent.id}`} onClick={() => setOpen(false)}
                            className="inline-flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded mb-2 transition-opacity hover:opacity-80"
                            style={{ background: light ? 'rgba(26,91,197,0.08)' : 'rgba(74,144,217,0.12)', color: 'var(--patent-sky)' }}>
                            <FileText className="w-3 h-3" />
                            {n.patent.patentNumber || n.patent.applicationNumber || n.patent.title}
                          </Link>
                        )}

                        {n.todoText && (
                          <div className="flex items-center gap-2 mt-1 mb-2">
                            <button
                              onClick={() => !todoComplete && completeTodo(n.id)}
                              disabled={todoComplete}
                              className="flex items-center gap-1.5 text-xs transition-colors"
                              style={{ color: todoComplete ? '#4ade80' : 'var(--patent-muted)' }}>
                              {todoComplete
                                ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                                : <Circle className="w-3.5 h-3.5 flex-shrink-0" />}
                              <span style={{ textDecoration: todoComplete ? 'line-through' : 'none' }}>
                                {n.todoText}
                              </span>
                            </button>
                            {n.todoDueDate && !todoComplete && (
                              <span className="text-[10px] flex items-center gap-0.5" style={{ color: 'var(--patent-muted)' }}>
                                <Clock className="w-2.5 h-2.5" />
                                {new Date(n.todoDueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-patent-muted">
                            {n.createdBy ? `${n.createdBy.name || n.createdBy.email}` : 'System'}
                          </span>
                          <span className="text-[10px] text-patent-muted">·</span>
                          <span className="text-[10px] text-patent-muted">{timeAgo(n.createdAt)}</span>
                          {n.recipients.length > 1 && (
                            <>
                              <span className="text-[10px] text-patent-muted">·</span>
                              <span className="text-[10px] text-patent-muted">{n.recipients.length} recipients</span>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
