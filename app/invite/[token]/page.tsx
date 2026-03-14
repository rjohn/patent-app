'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { Loader2, CheckCircle2, AlertCircle, ArrowRight, Mail } from 'lucide-react'

type State = 'loading' | 'valid' | 'invalid' | 'submitting' | 'success' | 'error'

interface InviteInfo {
  email: string
  name: string | null
  role: string
}

export default function InvitePage({ params }: { params: { token: string } }) {
  const { token }  = params
  const supabase   = createClientComponentClient()

  const [state,    setState]    = useState<State>('loading')
  const [invite,   setInvite]   = useState<InviteInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [name,     setName]     = useState('')

  useEffect(() => {
    fetch(`/api/team/invite/accept?token=${token}`)
      .then(async res => {
        const data = await res.json()
        if (!res.ok) { setErrorMsg(data.error || 'Invalid invite'); setState('invalid'); return }
        setInvite(data)
        setName(data.name || '')
        setState('valid')
      })
      .catch(() => { setErrorMsg('Could not load invite'); setState('invalid') })
  }, [token])

  const handleSubmit = async () => {
    setErrorMsg('')
    setState('submitting')

    // Create the account
    const res  = await fetch('/api/team/invite/accept', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, name }),
    })
    const data = await res.json()
    if (!res.ok) { setErrorMsg(data.error || 'Failed to create account'); setState('valid'); return }

    // Send magic link so they can sign in immediately
    await supabase.auth.signInWithOtp({
      email:   invite!.email,
      options: { emailRedirectTo: `${window.location.origin}/api/auth/callback` },
    })

    setState('success')
  }

  const roleColor: Record<string, string> = {
    ADMIN: '#c084fc', EDITOR: 'var(--patent-sky)', VIEWER: 'var(--patent-muted)',
  }

  return (
    <div className="min-h-screen bg-patent-navy flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <Image src="/p4-icon.png" alt="Plaz4 IP" width={40} height={40}
            className="rounded-xl" style={{ background: 'white' }} />
          <div>
            <div className="text-xl font-semibold text-white tracking-tight"
              style={{ fontFamily: 'var(--font-display)' }}>
              Plaz4 <span style={{ color: 'var(--patent-sky)' }}>IP</span>
            </div>
            <div className="text-[10px] text-patent-muted tracking-widest uppercase">Portfolio Manager</div>
          </div>
        </div>

        <div className="card p-8" style={{ borderColor: 'rgba(74,144,217,0.2)' }}>

          {/* Loading */}
          {state === 'loading' && (
            <div className="flex flex-col items-center py-8 gap-3">
              <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--patent-sky)' }} />
              <p className="text-patent-muted text-sm">Validating invite…</p>
            </div>
          )}

          {/* Invalid / expired */}
          {state === 'invalid' && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(239,68,68,0.1)' }}>
                <AlertCircle className="w-7 h-7 text-red-400" />
              </div>
              <h1 className="text-xl font-semibold text-white mb-2">Invite unavailable</h1>
              <p className="text-patent-muted text-sm mb-6">{errorMsg}</p>
              <p className="text-xs text-patent-muted">Contact your administrator to request a new invite link.</p>
            </div>
          )}

          {/* Success */}
          {state === 'success' && invite && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(74,197,100,0.1)' }}>
                <Mail className="w-7 h-7 text-green-400" />
              </div>
              <h1 className="text-xl font-semibold text-white mb-2">Account created!</h1>
              <p className="text-patent-muted text-sm">
                We sent a sign-in link to <span className="text-white">{invite.email}</span>.<br />
                Click it to access your portfolio.
              </p>
            </div>
          )}

          {/* Valid — show form */}
          {(state === 'valid' || state === 'submitting') && invite && (
            <>
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(99,51,174,0.2)', border: '1px solid rgba(99,51,174,0.3)' }}>
                  <span className="text-2xl font-bold" style={{ color: '#c084fc' }}>
                    {invite.email[0].toUpperCase()}
                  </span>
                </div>
                <h1 className="text-xl font-semibold text-white mb-1">You're invited!</h1>
                <p className="text-patent-muted text-sm">
                  Join <span className="text-white font-medium">Plaz4 IP</span> as
                </p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <span className="text-sm font-mono" style={{ color: 'var(--patent-sky)' }}>{invite.email}</span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase"
                    style={{ background: 'rgba(99,51,174,0.25)', color: roleColor[invite.role] || 'var(--patent-muted)' }}>
                    {invite.role}
                  </span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="label mb-1.5 block">Your name</label>
                  <input
                    type="text"
                    placeholder="Jane Smith"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="input w-full"
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  />
                </div>

                {errorMsg && (
                  <div className="flex items-center gap-2 text-xs p-3 rounded-lg"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {errorMsg}
                  </div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={state === 'submitting'}
                  className="btn-primary w-full justify-center text-sm flex items-center gap-2 mt-2"
                >
                  {state === 'submitting'
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating account…</>
                    : <><ArrowRight className="w-4 h-4" /> Accept invite</>}
                </button>
              </div>
            </>
          )}

        </div>

        <p className="text-center text-xs text-patent-muted mt-6">
          Already have an account?{' '}
          <a href="/login" className="text-patent-sky hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  )
}
