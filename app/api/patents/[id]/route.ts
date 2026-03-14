import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const patent = await prisma.patent.findUnique({
      where: { id },
      include: {
        family: true,
        maintenanceFees: { orderBy: { dueDate: 'asc' } },
        notes: { include: { author: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } },
        documents: true,
        priorityClaims: true,
        childPatents: { select: { id: true, patentNumber: true, title: true, status: true, continuationType: true } },
        parentPatent: { select: { id: true, patentNumber: true, title: true, status: true } },
      },
    })
    if (!patent) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })
    return NextResponse.json(patent)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch patent' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    const patent = await prisma.patent.update({ where: { id }, data: body })
    return NextResponse.json(patent)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to update patent' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.patent.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to delete patent' }, { status: 500 })
  }
}
