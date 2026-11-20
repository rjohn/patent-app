import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { trademarkDeadlines, describeStatus } from '@/lib/trademarks'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const tm = await prisma.trademark.findUnique({ where: { id } })
  if (!tm) return NextResponse.json({ error: 'Trademark not found' }, { status: 404 })
  return NextResponse.json({
    ...tm,
    liveDead: describeStatus(tm.statusCode).liveDead,
    deadlines: trademarkDeadlines(tm),
  })
}

const PatchSchema = z.object({
  notes: z.string().max(5000).nullable().optional(),
  docketNumber: z.string().max(200).nullable().optional(),
  markText: z.string().max(500).nullable().optional(),
}).strict()

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const parsed = PatchSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 })
  try {
    const tm = await prisma.trademark.update({ where: { id }, data: parsed.data })
    return NextResponse.json(tm)
  } catch {
    return NextResponse.json({ error: 'Failed to update trademark' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    await prisma.trademark.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to delete trademark' }, { status: 500 })
  }
}
