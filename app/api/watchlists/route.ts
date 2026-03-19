import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/watchlists — list all watchlists with entry counts
export async function GET() {
  try {
    const watchlists = await prisma.watchlist.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { _count: { select: { entries: true } } },
    })
    return NextResponse.json({ watchlists })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load watchlists' }, { status: 500 })
  }
}

// POST /api/watchlists — create a new watchlist
export async function POST(req: NextRequest) {
  try {
    const { name, description } = await req.json()
    if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })

    const watchlist = await prisma.watchlist.create({
      data: { name: name.trim(), description: description?.trim() || null },
    })
    return NextResponse.json({ watchlist }, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create watchlist' }, { status: 500 })
  }
}
