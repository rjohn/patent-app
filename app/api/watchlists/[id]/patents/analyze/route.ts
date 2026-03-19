import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// POST /api/watchlists/[id]/patents/analyze
// Body: { entryId }
// Generates (and caches) an AI analysis of how a watched patent relates to the portfolio
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: watchlistId } = await params
    const { entryId } = await req.json()
    if (!entryId) return NextResponse.json({ error: 'entryId required' }, { status: 400 })

    const entry = await prisma.watchlistEntry.findUnique({
      where: { id: entryId, watchlistId },
    })
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

    // Fetch portfolio: granted/active patents + tracked applications
    const portfolioPatents = await prisma.patent.findMany({
      where: { status: { in: ['GRANTED', 'PENDING', 'PUBLISHED'] } },
      select: {
        title: true,
        abstract: true,
        cpcCodes: true,
        status: true,
        jurisdiction: true,
        patentNumber: true,
        assignee: true,
        source: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    if (portfolioPatents.length === 0) {
      const text = 'No patents in the portfolio yet — add patents to get a relevance analysis.'
      await prisma.watchlistEntry.update({
        where: { id: entryId },
        data: { aiSummary: text, aiSummaryAt: new Date() },
      })
      return NextResponse.json({ summary: text })
    }

    const portfolioLines = portfolioPatents.map(p => {
      const group = p.source === 'CONTINUATION' ? 'Tracked Application' : 'Portfolio Patent'
      const id = p.patentNumber ? `US ${p.patentNumber}` : 'Application'
      const cpc = p.cpcCodes.length ? ` | CPC: ${p.cpcCodes.slice(0, 3).join(', ')}` : ''
      const abs = p.abstract ? ` — ${p.abstract.slice(0, 120)}…` : ''
      return `• [${group}] ${id}: "${p.title}"${cpc}${abs}`
    }).join('\n')

    const competitorCpc = entry.cpcCodes.length
      ? `CPC Codes: ${entry.cpcCodes.join(', ')}\n`
      : ''

    const prompt = `You are a patent intelligence analyst. Assess how a competitor patent relates to a company's own portfolio.

COMPETITOR PATENT:
Title: ${entry.title || 'Unknown'}
Patent Number: ${entry.patentNumber ? `US ${entry.patentNumber}` : 'N/A'} (App: ${entry.appNumber || 'N/A'})
Assignee: ${entry.assignee || 'Unknown'}
Status: ${entry.status || 'Unknown'}
${competitorCpc}Abstract: ${entry.abstract || 'Not available'}

OUR PORTFOLIO (${portfolioPatents.length} active patents/applications):
${portfolioLines}

Write a concise 2–3 paragraph analysis covering:
1. Technology overlap — which portfolio patents are in the closest technical space (cite titles specifically)
2. Competitive risk — potential freedom-to-operate concerns, blocking risk, or claim overlap
3. Strategic relevance — whether this is a direct threat, adjacent technology, or largely unrelated

Be specific and analytical. Professional plain English, no bullet points or headers.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    })

    const summary = (message.content[0] as { type: string; text: string }).text.trim()

    await prisma.watchlistEntry.update({
      where: { id: entryId },
      data: { aiSummary: summary, aiSummaryAt: new Date() },
    })

    return NextResponse.json({ summary })
  } catch (e: any) {
    console.error('analyze error:', e)
    return NextResponse.json({ error: e?.message || 'Analysis failed' }, { status: 500 })
  }
}
