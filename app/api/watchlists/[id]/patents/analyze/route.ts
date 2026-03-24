import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Extract first independent claim (heuristic: doesn't start with "The ... of claim N")
function firstIndependentClaim(claimsJson: unknown): string | null {
  if (!Array.isArray(claimsJson) || claimsJson.length === 0) return null
  const claims = claimsJson as any[]
  const independent = claims.find(c => {
    const text: string = typeof c === 'string' ? c : (c.claim_text ?? '')
    return !/^\s*the\s+\w+\s+of\s+claim\s+\d/i.test(text)
  }) ?? claims[0]
  const text: string = typeof independent === 'string' ? independent : (independent.claim_text ?? '')
  return text.slice(0, 600) || null
}

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

    const entry = await prisma.watchlistEntry.findFirst({
      where: { id: entryId, watchlistId },
    })
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })

    // Fetch portfolio: granted/active patents + tracked applications
    const portfolioPatents = await prisma.patent.findMany({
      where: { status: { in: ['GRANTED', 'PENDING', 'PUBLISHED'] } },
      select: {
        title: true,
        abstract: true,
        claimsJson: true,
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

    const entryClaim = firstIndependentClaim(entry.claimsJson)

    const portfolioLines = portfolioPatents.map(p => {
      const group = p.source === 'CONTINUATION' ? 'Tracked Application' : 'Portfolio Patent'
      const id = p.patentNumber ? `US ${p.patentNumber}` : 'Application'
      const cpc = p.cpcCodes.length ? ` | CPC: ${p.cpcCodes.slice(0, 3).join(', ')}` : ''
      const abs = p.abstract ? ` — ${p.abstract.slice(0, 100)}…` : ''
      const claim = firstIndependentClaim(p.claimsJson)
      const claimLine = claim ? `\n    Claim 1: ${claim}…` : ''
      return `• [${group}] ${id}: "${p.title}"${cpc}${abs}${claimLine}`
    }).join('\n')

    const competitorCpc = entry.cpcCodes.length
      ? `CPC Codes: ${entry.cpcCodes.join(', ')}\n`
      : ''
    const competitorClaim = entryClaim
      ? `Claim 1 (first independent): ${entryClaim}…\n`
      : ''

    const prompt = `You are a patent intelligence analyst. Assess how a competitor patent relates to a company's own portfolio.

COMPETITOR PATENT:
Title: ${entry.title || 'Unknown'}
Patent Number: ${entry.patentNumber ? `US ${entry.patentNumber}` : 'N/A'} (App: ${entry.appNumber || 'N/A'})
Assignee: ${entry.assignee || 'Unknown'}
Status: ${entry.status || 'Unknown'}
${competitorCpc}${competitorClaim}Abstract: ${entry.abstract || 'Not available'}

OUR PORTFOLIO (${portfolioPatents.length} active patents/applications):
${portfolioLines}

Write a concise 2–3 paragraph analysis covering:
1. Technology overlap — which portfolio patents are in the closest technical space (cite titles specifically); where claim language overlaps, call it out
2. Competitive risk — potential freedom-to-operate concerns, blocking risk, or claim scope overlap based on the claim language above
3. Strategic relevance — whether this is a direct threat, adjacent technology, or largely unrelated

Be specific and analytical. If claim text is available, use it to assess actual claim scope — not just the title. Professional plain English, no bullet points or headers.`

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 700,
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
