import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST /api/watchlists/[id]/patents — add a patent to the watchlist
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: watchlistId } = await params
    const body = await req.json()

    const {
      patentNumber, appNumber, title, assignee, inventors,
      filingDate, grantDate, expirationDate, status,
      abstract, cpcCodes, jurisdiction, rawData,
    } = body

    // Check watchlist exists
    const wl = await prisma.watchlist.findUnique({ where: { id: watchlistId } })
    if (!wl) return NextResponse.json({ error: 'Watchlist not found' }, { status: 404 })

    // Deduplicate by appNumber or patentNumber within same watchlist
    if (appNumber) {
      const dup = await prisma.watchlistEntry.findFirst({
        where: { watchlistId, appNumber },
      })
      if (dup) return NextResponse.json({ error: 'Already in watchlist', entryId: dup.id }, { status: 409 })
    } else if (patentNumber) {
      const dup = await prisma.watchlistEntry.findFirst({
        where: { watchlistId, patentNumber },
      })
      if (dup) return NextResponse.json({ error: 'Already in watchlist', entryId: dup.id }, { status: 409 })
    }

    const entry = await prisma.watchlistEntry.create({
      data: {
        watchlistId,
        patentNumber:   patentNumber || null,
        appNumber:      appNumber || null,
        title:          title || null,
        assignee:       assignee || null,
        inventors:      inventors || [],
        filingDate:     filingDate || null,
        grantDate:      grantDate || null,
        expirationDate: expirationDate || null,
        status:         status || null,
        abstract:       abstract || null,
        cpcCodes:       cpcCodes || [],
        jurisdiction:   jurisdiction || 'US',
        rawData:        rawData || undefined,
      },
    })

    // Touch watchlist updatedAt
    await prisma.watchlist.update({ where: { id: watchlistId }, data: {} })

    return NextResponse.json({ entry }, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to add patent' }, { status: 500 })
  }
}

// DELETE /api/watchlists/[id]/patents?entryId=xxx — remove an entry
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: watchlistId } = await params
    const entryId = new URL(req.url).searchParams.get('entryId')
    if (!entryId) return NextResponse.json({ error: 'entryId required' }, { status: 400 })

    await prisma.watchlistEntry.delete({
      where: { id: entryId, watchlistId },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to remove patent' }, { status: 500 })
  }
}

// PATCH /api/watchlists/[id]/patents — update entry notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: watchlistId } = await params
    const { entryId, notes } = await req.json()
    if (!entryId) return NextResponse.json({ error: 'entryId required' }, { status: 400 })

    const entry = await prisma.watchlistEntry.update({
      where: { id: entryId, watchlistId },
      data: { notes: notes ?? null },
    })
    return NextResponse.json({ entry })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update notes' }, { status: 500 })
  }
}
