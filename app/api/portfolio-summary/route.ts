import { NextResponse } from 'next/server'
import { getCachedSummary, generateAndCacheSummary } from '@/lib/portfolio-summary'

export async function GET() {
  try {
    const summary = await getCachedSummary()
    if (!summary) return NextResponse.json({ text: null, updatedAt: null })
    return NextResponse.json(summary)
  } catch (e) {
    console.error('portfolio-summary GET:', e)
    return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const summary = await generateAndCacheSummary()
    return NextResponse.json(summary)
  } catch (e) {
    console.error('portfolio-summary POST:', e)
    return NextResponse.json({ error: 'Failed to generate summary' }, { status: 500 })
  }
}
