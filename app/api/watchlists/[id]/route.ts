import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/watchlists/[id] — get watchlist with all entries
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const watchlist = await prisma.watchlist.findUnique({
      where: { id },
      include: { entries: { orderBy: { addedAt: 'desc' } } },
    })
    if (!watchlist) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ watchlist })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

// PATCH /api/watchlists/[id] — update name/description
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { name, description } = await req.json()
    const watchlist = await prisma.watchlist.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
      },
    })
    return NextResponse.json({ watchlist })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

// DELETE /api/watchlists/[id] — delete watchlist and all entries
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.watchlist.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
