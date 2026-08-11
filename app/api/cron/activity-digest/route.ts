import { NextRequest, NextResponse } from 'next/server'
import { addWeeks, addMonths } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { buildActivitySummary, buildEmailHtml } from '@/lib/activity'
import { sendEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const subs = await prisma.activitySubscription.findMany({
    where: { enabled: true },
    include: { user: { select: { email: true, name: true } } },
  })

  const now = new Date()
  let sent = 0
  let skipped = 0

  for (const sub of subs) {
    try {
      const windowStart = sub.lastSentAt ?? sub.createdAt
      const dueAt = sub.frequency === 'WEEKLY' ? addWeeks(windowStart, 1) : addMonths(windowStart, 1)
      if (now < dueAt) { skipped++; continue }

      const summary = await buildActivitySummary(windowStart, now)
      const hasActivity = summary.events.length + summary.fees.length + summary.changes.length > 0

      if (hasActivity || !sub.onlyIfActivity) {
        const label = sub.frequency === 'WEEKLY' ? 'Weekly' : 'Monthly'
        await sendEmail({
          to: sub.user.email,
          subject: `Plaz4 IP — ${label} Portfolio Activity`,
          html: buildEmailHtml(summary),
        })
        sent++
      } else {
        skipped++
      }

      await prisma.activitySubscription.update({
        where: { id: sub.id },
        data: { lastSentAt: now },
      })
    } catch (e) {
      console.error(`activity-digest failed for subscription ${sub.id}:`, e)
    }
  }

  return NextResponse.json({ checked: subs.length, sent, skipped })
}
