import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { nextDeadline } from '@/lib/trademarks'
import { fetchProceedings } from '@/lib/trademark-refresh'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams.get('q')?.trim()
    const status = req.nextUrl.searchParams.get('status')
    const trademarks = await prisma.trademark.findMany({
      where: {
        ...(status && status !== 'ALL' ? { status: status as any } : {}),
        ...(q ? {
          OR: [
            { markText: { contains: q, mode: 'insensitive' } },
            { serialNumber: { contains: q.replace(/\D/g, '') || q } },
            { registrationNumber: { contains: q.replace(/\D/g, '') || q } },
            { owner: { contains: q, mode: 'insensitive' } },
          ],
        } : {}),
      },
      orderBy: [{ markText: 'asc' }, { filingDate: 'desc' }],
      select: {
        id: true, serialNumber: true, registrationNumber: true, markText: true, status: true,
        statusDescription: true, filingDate: true, registrationDate: true, renewalDate: true,
        owner: true, internationalClasses: true, source: true, dataAsOf: true, proceedings: true,
        rawJsonData: true,
      },
    })
    // Compute next deadline server-side and drop the bulky raw record from the list payload.
    return NextResponse.json(trademarks.map(({ rawJsonData, proceedings, ...t }) => ({
      ...t,
      proceedingsCount: Array.isArray(proceedings) ? proceedings.length : 0,
      nextDeadline: nextDeadline({ ...t, rawJsonData }),
    })))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch trademarks' }, { status: 500 })
  }
}

const CreateSchema = z.object({
  serialNumber: z.string().transform(s => s.replace(/\D/g, '')).pipe(z.string().regex(/^\d{8}$/, 'Serial number must be 8 digits')),
  markText: z.string().trim().max(500).optional().nullable(),
  registrationNumber: z.string().transform(s => s.replace(/\D/g, '').replace(/^0+/, '')).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
})

export async function POST(req: NextRequest) {
  const parsed = CreateSchema.safeParse(await req.json().catch(() => ({})))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }
  const { serialNumber, markText, registrationNumber, notes } = parsed.data
  const existing = await prisma.trademark.findUnique({ where: { serialNumber }, select: { id: true } })
  if (existing) return NextResponse.json({ error: 'That serial number is already tracked', id: existing.id }, { status: 409 })

  const tm = await prisma.trademark.create({
    data: { serialNumber, markText: markText || null, registrationNumber: registrationNumber || null, notes: notes || null, source: 'MANUAL' },
  })
  // Proceedings search is a quick live call, so fill it in right away.
  try {
    const proceedings = await fetchProceedings(serialNumber)
    await prisma.trademark.update({ where: { id: tm.id }, data: { proceedings: proceedings as unknown as object } })
  } catch { /* the daily job will retry */ }
  return NextResponse.json(tm, { status: 201 })
}
