'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js'
import { Loader2, ShieldCheck, AlertTriangle } from 'lucide-react'

// OAuth consent screen for Supabase's OAuth 2.1 server (Authentication → OAuth Server →
// authorization path = /oauth/consent). Reached when an MCP client such as claude.ai adds the
// Plaz4 IP connector. Middleware has already ensured the user is signed in.

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'consent'; details: OAuthAuthorizationDetails; isMember: boolean }
  | { kind: 'redirecting' }

export default function OAuthConsentPage() {
  const supabase = createClientComponentClient()
  const [state, setState]   = useState<State>({ kind: 'loading' })
  const [busy, setBusy]     = useState(false)

  useEffect(() => {
    const authorizationId = new URLSearchParams(window.location.search).get('authorization_id')
    if (!authorizationId) {
      setState({ kind: 'error', message: 'Missing authorization request. Start again from Claude.' })
      return
    }
    ;(async () => {
      const { data, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
      if (error || !data) {
        setState({ kind: 'error', message: error?.message ?? 'Authorization request not found or expired.' })
        return
      }
      if (!('authorization_id' in data)) {
        // Already consented earlier — go straight back to the client
        setState({ kind: 'redirecting' })
        window.location.href = data.redirect_url
        return
      }
      const me = await fetch('/api/me').then(r => (r.ok ? r.json() : null)).catch(() => null)
      setState({ kind: 'consent', details: data, isMember: !!me?.role })
    })()
  }, [supabase])

  async function decide(approve: boolean) {
    if (state.kind !== 'consent') return
    setBusy(true)
    const id = state.details.authorization_id
    const { data, error } = approve
      ? await supabase.auth.oauth.approveAuthorization(id, { skipBrowserRedirect: true })
      : await supabase.auth.oauth.denyAuthorization(id, { skipBrowserRedirect: true })
    if (error || !data) {
      setBusy(false)
      setState({ kind: 'error', message: error?.message ?? 'Could not complete the request.' })
      return
    }
    setState({ kind: 'redirecting' })
    window.location.href = data.redirect_url
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-8">
          <Image src="/p4-icon.png" alt="Plaz4 IP" width={40} height={40}
            className="rounded-lg" style={{ background: 'white' }} />
          <div style={{ fontFamily: 'var(--font-display), sans-serif', fontWeight: 400, fontSize: '1.2rem', color: 'white' }}>
            Plaz4 <span style={{ color: 'var(--patent-sky)' }}>IP</span>
          </div>
        </div>

        <div className="card p-8">
          {state.kind === 'loading' || state.kind === 'redirecting' ? (
            <div className="flex flex-col items-center gap-3 py-6 text-sm text-patent-muted">
              <Loader2 className="w-6 h-6 animate-spin" />
              {state.kind === 'loading' ? 'Loading request…' : 'Returning to the app…'}
            </div>
          ) : state.kind === 'error' ? (
            <div className="text-center py-2">
              <AlertTriangle className="w-10 h-10 mx-auto mb-4 text-red-400" />
              <h1 className="text-base font-semibold text-white mb-2">Authorization failed</h1>
              <p className="text-sm text-patent-muted">{state.message}</p>
            </div>
          ) : (
            <>
              <ShieldCheck className="w-10 h-10 mb-4" style={{ color: 'var(--patent-sky)' }} />
              <h1 className="text-lg font-semibold text-white mb-1">
                {state.details.client.name || 'An application'} wants to access Plaz4 IP
              </h1>
              <p className="text-sm text-patent-muted mb-6">
                Signed in as <span className="text-white">{state.details.user.email}</span>
              </p>

              <div className="text-sm text-patent-muted mb-6 space-y-2">
                <p>It will be able to <span className="text-white">read</span> the patent portfolio: patents,
                  claims, families, prosecution history, fees, activity and watchlists.</p>
                <p>It cannot change any data. You can revoke access at any time from the connector settings.</p>
                {state.details.client.uri && (
                  <p className="text-xs break-all">Client: {state.details.client.uri}</p>
                )}
                <p className="text-xs break-all">Redirects to: {state.details.redirect_uri}</p>
              </div>

              {!state.isMember && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 mb-4">
                  This account isn&apos;t a member of the Plaz4 IP team, so the connection would be refused.
                  Ask an admin for an invite.
                </p>
              )}

              <div className="flex gap-3">
                <button onClick={() => decide(false)} disabled={busy} className="btn-secondary flex-1">
                  Deny
                </button>
                <button onClick={() => decide(true)} disabled={busy || !state.isMember}
                  className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                  Approve
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
