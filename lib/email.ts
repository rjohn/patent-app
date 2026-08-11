import { Resend } from 'resend'

let _resend: Resend | null = null

function client(): Resend {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set')
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  return client().emails.send({
    from: process.env.EMAIL_FROM || 'Plaz4 IP <onboarding@resend.dev>',
    to,
    subject,
    html,
  })
}
