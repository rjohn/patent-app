import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './prisma'

const SUMMARY_KEY = 'portfolio_summary'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function getCachedSummary(): Promise<{ text: string; updatedAt: string } | null> {
  const row = await prisma.setting.findUnique({ where: { key: SUMMARY_KEY } })
  if (!row) return null
  return { text: row.value, updatedAt: row.updatedAt.toISOString() }
}

export async function generateAndCacheSummary(): Promise<{ text: string; updatedAt: string }> {
  const now = new Date()
  const yearEnd = new Date(now.getFullYear(), 11, 31)
  const ninety  = new Date(now); ninety.setDate(ninety.getDate() + 90)

  const [
    total, granted, pending, abandoned, published,
    grantedUS, grantedEP, families,
    upcomingDeadlines, overdueDeadlines,
    expiringYear,
    recentPatents,
    techAreas,
    assignees,
  ] = await Promise.all([
    prisma.patent.count(),
    prisma.patent.count({ where: { status: 'GRANTED' } }),
    prisma.patent.count({ where: { status: 'PENDING' } }),
    prisma.patent.count({ where: { status: 'ABANDONED' } }),
    prisma.patent.count({ where: { status: 'PUBLISHED' } }),
    prisma.patent.count({ where: { status: 'GRANTED', jurisdiction: 'US' } }),
    prisma.patent.count({ where: { status: 'GRANTED', jurisdiction: 'EP' } }),
    prisma.patentFamily.count(),
    prisma.maintenanceFee.count({ where: { status: { in: ['UPCOMING', 'DUE'] }, dueDate: { lte: ninety } } }),
    prisma.maintenanceFee.count({ where: { status: 'OVERDUE' } }),
    prisma.patent.count({ where: { expirationDate: { gte: now, lte: yearEnd } } }),
    prisma.patent.findMany({
      select: { title: true, status: true, type: true, filingDate: true, grantDate: true, abstract: true },
      orderBy: { createdAt: 'desc' },
      take: 30,
    }),
    prisma.patentFamily.findMany({
      select: { name: true, technologyArea: true },
    }),
    prisma.patent.findMany({
      select: { assignee: true },
      where: { assignee: { not: null } },
      distinct: ['assignee'],
    }),
  ])

  if (total === 0) {
    const text = 'No patents have been added to the portfolio yet.'
    await prisma.setting.upsert({
      where: { key: SUMMARY_KEY },
      create: { key: SUMMARY_KEY, value: text },
      update: { value: text },
    })
    return { text, updatedAt: new Date().toISOString() }
  }

  const grantRate = total > 0 ? Math.round((granted / total) * 100) : 0
  const uniqueAssignees = Array.from(new Set(assignees.map(a => a.assignee).filter(Boolean))).slice(0, 10)
  const techAreaList = techAreas
    .map(f => f.technologyArea || f.name)
    .filter(Boolean)
    .join(', ')

  const titlesSnippet = recentPatents
    .slice(0, 15)
    .map(p => `- "${p.title}" (${p.status}${p.grantDate ? ', granted ' + p.grantDate.toISOString().slice(0, 7) : ''})`)
    .join('\n')

  const prompt = `You are a patent portfolio analyst. Write a concise executive summary (2–3 paragraphs, ~150 words) of the following patent portfolio. Focus on portfolio size, composition, strengths, and any notable risks (overdue deadlines, expiring patents). Write in professional but plain English. Do not use bullet points or headers — flowing prose only.

Portfolio data:
- Total patents/applications: ${total}
- Granted: ${granted} (${grantRate}% grant rate)  |  US: ${grantedUS}  |  EP: ${grantedEP}
- Pending/Published: ${pending + published}  |  Abandoned: ${abandoned}
- Patent families: ${families}
- Expiring this calendar year: ${expiringYear}
- Upcoming maintenance deadlines (90 days): ${upcomingDeadlines}${overdueDeadlines > 0 ? `  |  OVERDUE: ${overdueDeadlines}` : ''}
${uniqueAssignees.length ? `- Assignees: ${uniqueAssignees.join(', ')}` : ''}
${techAreaList ? `- Technology areas: ${techAreaList}` : ''}

Recent portfolio titles:
${titlesSnippet}

Write the summary now:`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = (message.content[0] as { type: string; text: string }).text.trim()

  const row = await prisma.setting.upsert({
    where:  { key: SUMMARY_KEY },
    create: { key: SUMMARY_KEY, value: text },
    update: { value: text },
  })

  return { text, updatedAt: row.updatedAt.toISOString() }
}
