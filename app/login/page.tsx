'use client'

import { useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import Image from 'next/image'
import { Loader2, Mail, CheckCircle2, ArrowLeft } from 'lucide-react'

type Mode = 'signin' | 'forgot' | 'sent'

export default function LoginPage() {
  const supabase = createClientComponentClient()

  const [mode,    setMode]    = useState<Mode>('signin')
  const [email,   setEmail]   = useState('')
  const [error,   setError]   = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })

    setLoading(false)
    if (error) setError(error.message)
    else       setMode('sent')
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password`,
    })

    setLoading(false)
    if (error) setError(error.message)
    else       setMode('sent')
  }

  function reset() {
    setMode('signin')
    setError(null)
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

          {/* Sent state (magic link or password reset) */}
          {mode === 'sent' ? (
            <div className="text-center py-2">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-4" style={{ color: '#4ade80' }} />
              <h2 className="text-base font-semibold text-white mb-2">Check your email</h2>
              <p className="text-sm text-patent-muted mb-4">
                We sent a link to <span className="text-white">{email}</span>
              </p>
              <button onClick={reset} className="btn-ghost text-xs">Use a different email</button>
            </div>
          ) : mode === 'forgot' ? (
            <>
              <button onClick={reset} className="flex items-center gap-1.5 text-xs text-patent-muted hover:text-white transition-colors mb-5">
                <ArrowLeft className="w-3.5 h-3.5" /> Back to sign in
              </button>
              <h1 className="text-lg font-semibold text-white mb-1">Reset password</h1>
              <p className="text-sm text-patent-muted mb-6">Enter your email and we'll send a reset link</p>

              <form onSubmit={handleForgot} className="space-y-4">
                <div>
                  <label className="label block mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="input w-full" placeholder="you@company.com" required autoFocus />
                </div>
                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
                )}
                <button type="submit" disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-lg font-semibold text-white mb-1">Sign in</h1>
              <p className="text-sm text-patent-muted mb-6">Enter your email and we'll send you a sign-in link</p>

              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="label block mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                    className="input w-full" placeholder="you@company.com" required autoFocus />
                </div>
                {error && (
                  <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>
                )}
                <button type="submit" disabled={loading}
                  className="btn-primary w-full flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {loading ? 'Sending…' : 'Send sign-in link'}
                </button>
              </form>

              <button onClick={() => { setMode('forgot'); setError(null) }}
                className="mt-4 w-full text-center text-xs text-patent-muted hover:text-white transition-colors">
                Forgot / set password?
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
