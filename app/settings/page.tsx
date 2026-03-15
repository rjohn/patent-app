'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Settings, Users, Key, Bell, Shield, Save, CheckCircle2, Building2,
  UserPlus, Mail, Trash2, RefreshCw, Copy, Check, X,
  Loader2, AlertCircle, Clock, ChevronDown, Eye, EyeOff, KeyRound, Moon, Sun,
} from 'lucide-react'
import { useTheme } from '@/context/theme-context'

type Role = 'ADMIN' | 'EDITOR' | 'VIEWER'

interface Member {
  id: string
  email: string
  name: string | null
  role: Role
  createdAt: string
}

interface Invite {
  id: string
  email: string
  name: string | null
  role: Role
  token: string
  status: string
  createdAt: string
  expiresAt: string
}

const ROLE_COLORS: Record<Role, string> = {
  ADMIN:  'rgba(99,51,174,0.35)',
  EDITOR: 'rgba(45,90,158,0.35)',
  VIEWER: 'rgba(255,255,255,0.08)',
}
const ROLE_TEXT: Record<Role, string> = {
  ADMIN:  '#c084fc',
  EDITOR: 'var(--patent-sky)',
  VIEWER: 'var(--patent-muted)',
}

function RoleBadge({ role }: { role: Role }) {
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
      style={{ background: ROLE_COLORS[role], color: ROLE_TEXT[role] }}>
      {role}
    </span>
  )
}

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="relative">
      <select value={value} onChange={e => onChange(e.target.value as Role)}
        className="input text-xs py-1 pl-2 pr-6 appearance-none cursor-pointer">
        <option value="ADMIN">Admin</option>
        <option value="EDITOR">Editor</option>
        <option value="VIEWER">Viewer</option>
      </select>
      <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-patent-muted" />
    </div>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <button onClick={copy} title="Copy invite link"
      className="btn-ghost p-1.5 flex items-center gap-1 text-xs"
      style={{ color: copied ? '#4ade80' : 'var(--patent-muted)' }}>
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>
  )
}

function InviteModal({ onClose, onSent }: { onClose: () => void; onSent: (url: string, email: string) => void }) {
  const [email, setEmail]     = useState('')
  const [name, setName]       = useState('')
  const [role, setRole]       = useState<Role>('VIEWER')
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const send = async () => {
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, role }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Failed to send invite'); return }
      onSent(data.inviteUrl, email)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="card p-6 w-full max-w-md" style={{ borderColor: 'rgba(99,51,174,0.3)' }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-semibold text-white flex items-center gap-2">
            <UserPlus className="w-4 h-4" style={{ color: '#c084fc' }} /> Invite Team Member
          </h2>
          <button onClick={onClose} className="btn-ghost p-1"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label mb-1.5 block">Email address <span style={{ color: '#f87171' }}>*</span></label>
            <input type="email" placeholder="colleague@company.com"
              value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              className="input w-full" autoFocus />
          </div>
          <div>
            <label className="label mb-1.5 block">Name <span className="text-patent-muted">(optional)</span></label>
            <input type="text" placeholder="Jane Smith"
              value={name} onChange={e => setName(e.target.value)}
              className="input w-full" />
          </div>
          <div>
            <label className="label mb-1.5 block">Role</label>
            <div className="grid grid-cols-3 gap-2">
              {(['ADMIN', 'EDITOR', 'VIEWER'] as Role[]).map(r => (
                <button key={r} onClick={() => setRole(r)}
                  className="py-2 px-3 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: role === r ? ROLE_COLORS[r] : 'rgba(255,255,255,0.05)',
                    color:      role === r ? ROLE_TEXT[r]   : 'var(--patent-muted)',
                    border:     `1px solid ${role === r ? 'rgba(255,255,255,0.15)' : 'transparent'}`,
                  }}>
                  {r}
                </button>
              ))}
            </div>
            <div className="mt-2 text-xs text-patent-muted">
              {role === 'ADMIN'  && <p>Full access — can manage team, settings, and all patents.</p>}
              {role === 'EDITOR' && <p>Can add, edit, and delete patents and families.</p>}
              {role === 'VIEWER' && <p>Read-only access to the portfolio.</p>}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs p-3 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
            </div>
          )}
        </div>

        <div className="flex gap-3 justify-end mt-6">
          <button onClick={onClose} className="btn-secondary text-sm" disabled={loading}>Cancel</button>
          <button onClick={send} disabled={!email || loading} className="btn-primary text-sm flex items-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            {loading ? 'Sending…' : 'Send Invite'}
          </button>
        </div>
      </div>
    </div>
  )
}

function InviteLinkModal({ url, email, onClose }: { url: string; email: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)' }}>
      <div className="card p-6 w-full max-w-md" style={{ borderColor: 'rgba(74,197,100,0.3)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(74,197,100,0.15)' }}>
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h2 className="font-semibold text-white">Invite created!</h2>
            <p className="text-xs text-patent-muted">Share this link with <span className="text-white">{email}</span></p>
          </div>
        </div>

        <div className="rounded-lg p-3 mb-3 break-all"
          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <p className="text-xs text-patent-muted font-mono">{url}</p>
        </div>

        <div className="text-xs text-patent-muted mb-5 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 flex-shrink-0" /> Expires in 7 days
        </div>

        <div className="flex gap-3">
          <button onClick={copy} className="flex-1 btn-primary text-sm flex items-center justify-center gap-2">
            {copied ? <><Check className="w-4 h-4" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Link</>}
          </button>
          <button onClick={onClose} className="btn-secondary text-sm">Done</button>
        </div>
      </div>
    </div>
  )
}

function ChangePasswordSection() {
  const [email,     setEmail]     = useState('')
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [success,   setSuccess]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email)               { setError('Email is required'); return }
    if (password.length < 8)  { setError('Password must be at least 8 characters'); return }
    if (password !== confirm)  { setError('Passwords do not match'); return }
    setError(null)
    setLoading(true)

    const res = await fetch('/api/auth/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error || 'Failed to update password')
    } else {
      setSuccess(true)
      setEmail('')
      setPassword('')
      setConfirm('')
      setTimeout(() => setSuccess(false), 3000)
    }
  }

  return (
    <div className="card p-6">
      <h2 className="section-title flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-red-400" /> Security
      </h2>
      <p className="text-sm text-patent-muted mb-5">
        Set or update your password. You can always sign in via magic link too.
      </p>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-sm">
        <div>
          <label className="label block mb-1.5">Your email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="input w-full"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label className="label block mb-1.5">New password</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="input w-full pr-10"
              placeholder="Min. 8 characters"
            />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-patent-muted hover:text-white transition-colors">
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="label block mb-1.5">Confirm password</label>
          <input
            type={showPw ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            className="input w-full"
            placeholder="Re-enter password"
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs p-3 rounded-lg"
            style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {error}
          </div>
        )}

        <button type="submit" disabled={loading || !password || !confirm}
          className="btn-primary text-sm flex items-center gap-2">
          {loading   ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
           : success ? <><CheckCircle2 className="w-4 h-4" /> Password updated!</>
           :           <><KeyRound className="w-4 h-4" /> Update password</>}
        </button>
      </form>
    </div>
  )
}

export default function SettingsPage() {
  const { theme, setTheme } = useTheme()
  const [saved, setSaved]           = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [companyLoading, setCompanyLoading] = useState(true)
  const [usptoKey, setUsptoKey]     = useState('')
  const [reminderDays, setReminderDays] = useState('30')
  const [emailNotifications, setEmailNotifications] = useState(true)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => { if (d.company_name) setCompanyName(d.company_name) })
      .finally(() => setCompanyLoading(false))
  }, [])

  const [members, setMembers]         = useState<Member[]>([])
  const [invites, setInvites]         = useState<Invite[]>([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [teamError, setTeamError]     = useState<string | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteResult, setInviteResult]       = useState<{ url: string; email: string } | null>(null)
  const [revoking, setRevoking]       = useState<string | null>(null)
  const [updatingRole, setUpdatingRole] = useState<string | null>(null)
  const [removing, setRemoving]       = useState<string | null>(null)

  const fetchTeam = useCallback(async () => {
    setTeamLoading(true); setTeamError(null)
    try {
      const res = await fetch('/api/team')
      if (!res.ok) throw new Error('Failed to load team')
      const data = await res.json()
      setMembers(data.members)
      setInvites(data.invites)
    } catch (e) {
      setTeamError(e instanceof Error ? e.message : 'Failed to load team')
    } finally {
      setTeamLoading(false)
    }
  }, [])

  useEffect(() => { fetchTeam() }, [fetchTeam])

  const handleRoleChange = async (memberId: string, role: Role) => {
    setUpdatingRole(memberId)
    try {
      await fetch(`/api/team/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m))
    } finally {
      setUpdatingRole(null)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm('Remove this team member? They will lose access immediately.')) return
    setRemoving(memberId)
    try {
      await fetch(`/api/team/members/${memberId}`, { method: 'DELETE' })
      setMembers(prev => prev.filter(m => m.id !== memberId))
    } finally {
      setRemoving(null)
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    setRevoking(inviteId)
    try {
      await fetch(`/api/team/invite/${inviteId}`, { method: 'DELETE' })
      setInvites(prev => prev.filter(i => i.id !== inviteId))
    } finally {
      setRevoking(null)
    }
  }

  const handleInviteSent = (url: string, email: string) => {
    setShowInviteModal(false)
    setInviteResult({ url, email })
    fetchTeam()
  }

  return (
    <div className="p-8 max-w-3xl animate-fade-in">
      {showInviteModal && (
        <InviteModal onClose={() => setShowInviteModal(false)} onSent={handleInviteSent} />
      )}
      {inviteResult && (
        <InviteLinkModal url={inviteResult.url} email={inviteResult.email}
          onClose={() => setInviteResult(null)} />
      )}

      <div className="mb-8">
        <h1 className="page-title">Settings</h1>
        <p className="text-muted mt-1">Configure your portfolio manager</p>
      </div>

      <div className="space-y-6">

        {/* Appearance */}
        <div className="card p-6">
          <h2 className="section-title flex items-center gap-2 mb-4">
            {theme === 'dark' ? <Moon className="w-4 h-4 text-patent-sky" /> : <Sun className="w-4 h-4 text-patent-sky" />}
            Appearance
          </h2>
          <p className="text-sm text-patent-muted mb-4">Choose your preferred colour scheme.</p>
          <div className="grid grid-cols-2 gap-3 max-w-xs">
            {([
              { id: 'dark',  label: 'Dark',  icon: Moon,  preview: '#0A1628' },
              { id: 'light', label: 'Light', icon: Sun,   preview: '#EEF2F8' },
            ] as const).map(({ id, label, icon: Icon, preview }) => {
              const active = theme === id
              return (
                <button
                  key={id}
                  onClick={() => setTheme(id)}
                  className="flex flex-col items-center gap-2 p-3 rounded-xl border transition-all"
                  style={{
                    background: active ? 'rgba(26,91,197,0.12)' : 'rgba(255,255,255,0.04)',
                    borderColor: active ? 'rgba(26,91,197,0.5)' : 'rgba(255,255,255,0.1)',
                  }}
                >
                  {/* Mini preview swatch */}
                  <div className="w-full h-10 rounded-lg overflow-hidden flex"
                    style={{ background: preview, border: '1px solid rgba(0,0,0,0.12)' }}>
                    <div className="w-1/3 h-full" style={{ background: id === 'dark' ? '#0A1628' : '#0E1A2E', opacity: 0.9 }} />
                    <div className="flex-1 h-full flex flex-col justify-center gap-1 px-1.5">
                      <div className="h-1 rounded-full" style={{ background: id === 'dark' ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)', width: '80%' }} />
                      <div className="h-1 rounded-full" style={{ background: id === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)', width: '55%' }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Icon className="w-3.5 h-3.5" style={{ color: active ? '#1A5BC5' : 'var(--patent-muted)' }} />
                    <span className="text-xs font-medium" style={{ color: active ? '#1A5BC5' : 'var(--patent-muted)' }}>
                      {label}
                    </span>
                    {active && <CheckCircle2 className="w-3 h-3 text-[#1A5BC5]" />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Company */}
        <div className="card p-6">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-patent-sky" /> Company
          </h2>
          <div>
            <label className="label mb-1.5 block">Company Name</label>
            <input
              type="text"
              placeholder="e.g. Plasmology4 Inc."
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              className="input w-full max-w-sm"
              disabled={companyLoading}
            />
            <p className="text-xs text-patent-muted mt-1.5">
              Appears in the header of all generated PDF reports.
            </p>
          </div>
        </div>

        {/* USPTO API */}
        <div className="card p-6">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <Key className="w-4 h-4 text-patent-gold" /> USPTO API Integration
          </h2>
          <div className="space-y-4">
            <div>
              <label className="label mb-1.5 block">PatentsView API Key</label>
              <input type="password" placeholder="Enter your USPTO PatentsView API key..."
                value={usptoKey} onChange={e => setUsptoKey(e.target.value)} className="input w-full" />
              <p className="text-xs text-patent-muted mt-1.5">
                Get a free API key at <a href="https://patentsview.org" target="_blank" className="text-patent-sky hover:underline">patentsview.org</a>
              </p>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: 'rgba(74,197,100,0.05)', border: '1px solid rgba(74,197,100,0.15)' }}>
              <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
              <span className="text-sm text-green-400">API connection allows real-time patent lookups and automatic data enrichment</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="card p-6">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <Bell className="w-4 h-4 text-patent-sky" /> Deadline Reminders
          </h2>
          <div className="space-y-4">
            <div>
              <label className="label mb-1.5 block">Reminder Lead Time</label>
              <select value={reminderDays} onChange={e => setReminderDays(e.target.value)} className="input">
                <option value="14">14 days before</option>
                <option value="30">30 days before</option>
                <option value="60">60 days before</option>
                <option value="90">90 days before</option>
              </select>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div onClick={() => setEmailNotifications(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors relative ${emailNotifications ? 'bg-patent-sky' : 'bg-white/20'}`}>
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${emailNotifications ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-white">Email notifications for upcoming deadlines</span>
            </label>
          </div>
        </div>

        {/* Team Members */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="section-title flex items-center gap-2">
              <Users className="w-4 h-4" style={{ color: '#c084fc' }} /> Team Members
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={fetchTeam} className="btn-ghost p-1.5" title="Refresh">
                <RefreshCw className={`w-3.5 h-3.5 ${teamLoading ? 'animate-spin' : ''}`} />
              </button>
              <button onClick={() => setShowInviteModal(true)}
                className="btn-primary text-sm flex items-center gap-2">
                <UserPlus className="w-3.5 h-3.5" /> Invite Member
              </button>
            </div>
          </div>

          {teamError && (
            <div className="flex items-center gap-2 text-sm p-3 rounded-lg mb-4"
              style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {teamError}
            </div>
          )}

          {teamLoading && members.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-patent-muted" />
            </div>
          ) : (
            <>
              {/* Active members */}
              {members.length > 0 && (
                <div className="mb-5">
                  <p className="label mb-2">Active ({members.length})</p>
                  <div className="space-y-2">
                    {members.map(m => (
                      <div key={m.id} className="flex items-center gap-3 p-3 rounded-lg"
                        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                          style={{ background: 'rgba(45,90,158,0.4)', color: 'var(--patent-sky)' }}>
                          {(m.name || m.email)[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-white truncate">{m.name || '—'}</div>
                          <div className="text-xs text-patent-muted truncate">{m.email}</div>
                        </div>
                        <RoleBadge role={m.role} />
                        <div className="flex items-center gap-1.5">
                          {updatingRole === m.id
                            ? <Loader2 className="w-4 h-4 animate-spin text-patent-muted" />
                            : <RoleSelect value={m.role} onChange={r => handleRoleChange(m.id, r)} />
                          }
                          <button onClick={() => handleRemoveMember(m.id)} disabled={removing === m.id}
                            className="btn-ghost p-1.5" style={{ color: 'rgba(239,68,68,0.5)' }} title="Remove member">
                            {removing === m.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {members.length === 0 && !teamLoading && (
                <div className="text-center py-6 mb-4">
                  <Users className="w-8 h-8 mx-auto mb-2 text-patent-muted opacity-30" />
                  <p className="text-sm text-patent-muted">No team members yet — invite someone to get started</p>
                </div>
              )}

              {/* Pending invites */}
              {invites.length > 0 && (
                <div>
                  <p className="label mb-2">Pending Invites ({invites.length})</p>
                  <div className="space-y-2">
                    {invites.map(inv => {
                      const daysLeft = Math.ceil((new Date(inv.expiresAt).getTime() - Date.now()) / 86400000)
                      const inviteUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/invite/${inv.token}`
                      return (
                        <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg"
                          style={{ background: 'rgba(99,51,174,0.08)', border: '1px solid rgba(99,51,174,0.2)' }}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: 'rgba(99,51,174,0.25)' }}>
                            <Mail className="w-3.5 h-3.5" style={{ color: '#c084fc' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-white truncate">{inv.name || inv.email}</div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-patent-muted truncate">{inv.email}</span>
                              <span className="text-[10px] flex items-center gap-0.5"
                                style={{ color: daysLeft <= 2 ? '#f87171' : 'var(--patent-muted)' }}>
                                <Clock className="w-2.5 h-2.5" /> {daysLeft}d left
                              </span>
                            </div>
                          </div>
                          <RoleBadge role={inv.role} />
                          <CopyButton text={inviteUrl} />
                          <button onClick={() => handleRevokeInvite(inv.id)} disabled={revoking === inv.id}
                            className="btn-ghost p-1.5" style={{ color: 'rgba(239,68,68,0.5)' }} title="Revoke invite">
                            {revoking === inv.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Role legend */}
          <div className="mt-5 pt-4 grid grid-cols-3 gap-3 text-xs"
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
            {([
              ['ADMIN',  '#c084fc',              'Full access — manage team & settings'],
              ['EDITOR', 'var(--patent-sky)',     'Add, edit, and delete patents'],
              ['VIEWER', 'var(--patent-muted)',   'Read-only portfolio access'],
            ] as const).map(([role, color, desc]) => (
              <div key={role}>
                <span className="font-semibold block mb-0.5" style={{ color }}>{role}</span>
                <span className="text-patent-muted leading-tight">{desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Security */}
        <ChangePasswordSection />

        <div className="flex justify-end">
          <button
            onClick={async () => {
              await fetch('/api/settings', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ company_name: companyName }),
              })
              setSaved(true)
              setTimeout(() => setSaved(false), 2500)
            }}
            className="btn-primary flex items-center gap-2"
          >
            {saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Settings</>}
          </button>
        </div>

      </div>
    </div>
  )
}
