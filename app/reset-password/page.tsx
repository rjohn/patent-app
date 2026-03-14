'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2, CheckCircle2, Eye, EyeOff, KeyRound } from 'lucide-react'

export default function ResetPasswordPage() {
  const supabase = createClientComponentClient()
  const router   = useRouter()

  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [done,      setDone]      = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }
    if (password !== confirm) { setError('Passwords do not match'); return }
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.updateUser({ password })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setDone(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <Image src="/p4-icon.png" alt="Plaz4 IP" width={40} height={40}
            className="rounded-lg" style={{ background: 'white' }} />
          <div>
            <div style={{ fontFamily: 'var(--font-display), sans-serif', fontWeight: 400, fontSize: '1.2rem', color: 'white' }}>
              Plaz4 <span style={{ color: 'var(--patent-sky)' }}>IP</span>
            </div>
            <div className="text-[10px] text-patent-muted tracking-widest uppercase">Portfolio Manager</div>
          </div>
        </div>

        <div className="card p-8">
          {done ? (
            <div className="text-center py-2">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-4" style={{ color: '#4ade80' }} />
              <h2 className="text-base font-semibold text-white mb-2">Password updated!</h2>
              <p className="text-sm text-patent-muted">Redirecting to your dashboard…</p>
            </div>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-white mb-1">Set new password</h1>
              <p className="text-sm text-patent-muted mb-6">Choose a strong password for your account</p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label block mb-1.5">New password</label>
                  <div className="relative">
                    <input
                      type={showPw ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="input w-full pr-10"
                      placeholder="Min. 8 characters"
                      required
                      autoFocus
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
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
                )}

                <button type="submit" disabled={loading || !password || !confirm}
                  className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {loading ? 'Saving…' : 'Set password'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
