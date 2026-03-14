import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const families = await prisma.patentFamily.findMany({
      include: {
        patents: {
          select: {
            id: true,
            patentNumber: true,
            applicationNumber: true,
            title: true,
            status: true,
            type: true,
            filingDate: true,
            grantDate: true,
            continuationType: true,
            parentPatentId: true,
          },
          orderBy: { filingDate: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    })
    return NextResponse.json(families)
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch families' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const family = await prisma.patentFamily.create({ data: body })
    return NextResponse.json(family, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to create family' }, { status: 500 })
  }
}
