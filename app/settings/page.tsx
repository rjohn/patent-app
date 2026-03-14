'use client'

import { useState } from 'react'
import { Settings, Users, Key, Bell, Shield, Save, CheckCircle2 } from 'lucide-react'

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const [usptoKey, setUsptoKey] = useState('')
  const [reminderDays, setReminderDays] = useState('30')
  const [emailNotifications, setEmailNotifications] = useState(true)

  const save = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="p-8 max-w-3xl animate-fade-in">
      <div className="mb-8">
        <h1 className="page-title">Settings</h1>
        <p className="text-muted mt-1">Configure your portfolio manager</p>
      </div>

      <div className="space-y-6">
        {/* USPTO API */}
        <div className="card p-6">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <Key className="w-4 h-4 text-patent-gold" /> USPTO API Integration
          </h2>
          <div className="space-y-4">
            <div>
              <label className="label mb-1.5 block">PatentsView API Key</label>
              <input
                type="password"
                placeholder="Enter your USPTO PatentsView API key..."
                value={usptoKey}
                onChange={e => setUsptoKey(e.target.value)}
                className="input w-full"
              />
              <p className="text-xs text-patent-muted mt-1.5">
                Get a free API key at <a href="https://patentsview.org" target="_blank" className="text-patent-sky hover:underline">patentsview.org</a>
              </p>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-500/5 border border-green-500/15 rounded-lg">
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
              <label className="label mb-1.5 block">Reminder Lead Time (days)</label>
              <select value={reminderDays} onChange={e => setReminderDays(e.target.value)} className="input">
                <option value="14">14 days before</option>
                <option value="30">30 days before</option>
                <option value="60">60 days before</option>
                <option value="90">90 days before</option>
              </select>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setEmailNotifications(v => !v)}
                className={`w-10 h-5 rounded-full transition-colors relative ${emailNotifications ? 'bg-patent-sky' : 'bg-white/20'}`}
              >
                <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${emailNotifications ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className="text-sm text-white">Email notifications for upcoming deadlines</span>
            </label>
          </div>
        </div>

        {/* Team */}
        <div className="card p-6">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-purple-400" /> Team Members
          </h2>
          <div className="space-y-3 mb-4">
            {[
              { name: 'Jane Smith', email: 'jane@acme.com', role: 'ADMIN' },
              { name: 'Bob Lee', email: 'bob@acme.com', role: 'EDITOR' },
              { name: 'Carol Wang', email: 'carol@acme.com', role: 'VIEWER' },
            ].map(u => (
              <div key={u.email} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/8">
                <div className="w-8 h-8 rounded-full bg-patent-steel/40 flex items-center justify-center text-xs font-bold text-patent-sky">
                  {u.name[0]}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-white">{u.name}</div>
                  <div className="text-xs text-patent-muted">{u.email}</div>
                </div>
                <select defaultValue={u.role} className="input text-xs py-1 px-2">
                  <option value="ADMIN">Admin</option>
                  <option value="EDITOR">Editor</option>
                  <option value="VIEWER">Viewer</option>
                </select>
              </div>
            ))}
          </div>
          <button className="btn-ghost text-sm">+ Invite Team Member</button>
        </div>

        {/* Security */}
        <div className="card p-6">
          <h2 className="section-title flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-red-400" /> Security
          </h2>
          <div className="text-sm text-patent-muted space-y-2">
            <p>Authentication is managed through Supabase. Team members log in with their email and password.</p>
            <p>All data is encrypted at rest and in transit via Supabase + Vercel.</p>
          </div>
          <button className="btn-secondary text-sm mt-4">Manage Auth Settings in Supabase →</button>
        </div>

        {/* Save */}
        <div className="flex justify-end">
          <button onClick={save} className={`btn-primary flex items-center gap-2 ${saved ? 'border-green-400' : ''}`}>
            {saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Settings</>}
          </button>
        </div>
      </div>
    </div>
  )
}
