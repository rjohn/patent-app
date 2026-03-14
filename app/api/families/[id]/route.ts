import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const family = await prisma.patentFamily.findUnique({
      where: { id },
      include: {
        patents: {
          select: {
            id: true, patentNumber: true, applicationNumber: true,
            title: true, status: true, type: true,
            filingDate: true, grantDate: true,
            continuationType: true, parentPatentId: true,
          },
          orderBy: { filingDate: 'asc' },
        },
      },
    })
    if (!family) return NextResponse.json({ error: 'Family not found' }, { status: 404 })
    return NextResponse.json(family)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch family' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const family = await prisma.patentFamily.update({ where: { id }, data: body })
    return NextResponse.json(family)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to update family' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.patentFamily.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to delete family' }, { status: 500 })
  }
}
