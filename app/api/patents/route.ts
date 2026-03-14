import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { generateAndCacheSummary } from '@/lib/portfolio-summary'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q        = searchParams.get('q') || searchParams.get('search') || ''
    const status   = searchParams.get('status') || ''
    const type     = searchParams.get('type') || ''
    const familyId = searchParams.get('familyId') || ''
    const excludeFamilyId = searchParams.get('excludeFamilyId') || ''
    const source = searchParams.get('source') || ''
    const page     = Math.max(1, parseInt(searchParams.get('page') || '1'))
    const pageSize = Math.min(200, parseInt(searchParams.get('pageSize') || '25'))
    const sortBy   = searchParams.get('sortBy') || 'filingDate'
    const sortDir  = searchParams.get('sortDir') === 'asc' ? 'asc' : 'desc'

    const allowedSortFields: Record<string, string> = {
      patentNumber: 'patentNumber',
      title:        'title',
      filingDate:   'filingDate',
      grantDate:    'grantDate',
    }
    const orderField = allowedSortFields[sortBy] || 'filingDate'

    const where: any = {}
    if (q) {
      where.OR = [
        { title:             { contains: q, mode: 'insensitive' } },
        { patentNumber:      { contains: q, mode: 'insensitive' } },
        { applicationNumber: { contains: q, mode: 'insensitive' } },
        { assignee:          { contains: q, mode: 'insensitive' } },
        { abstract:          { contains: q, mode: 'insensitive' } },
      ]
    }
    if (status)       where.status       = status
    if (type)         where.type         = type
    if (familyId)     where.familyId     = familyId
    if (excludeFamilyId) where.NOT = { familyId: excludeFamilyId }
    if (source)       where.source       = source
    const jurisdiction = searchParams.get('jurisdiction') || ''
    if (jurisdiction) where.jurisdiction = jurisdiction

    const [patents, total] = await Promise.all([
      prisma.patent.findMany({
        where,
        select: {
          id: true, patentNumber: true, applicationNumber: true,
          title: true, status: true, type: true,
          filingDate: true, grantDate: true,
          inventors: true, assignee: true, cpcCodes: true,
          jurisdiction: true, epNumber: true, publicationNumber: true, source: true,
          parentPatentId: true, continuationType: true,
          parentPatent: { select: { id: true, patentNumber: true, title: true } },
          family: { select: { id: true, name: true } },
        },
        orderBy: { [orderField]: sortDir },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.patent.count({ where }),
    ])

    return NextResponse.json({ patents, total, page, pageSize })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to fetch patents' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const patent = await prisma.patent.create({ data: body })
    generateAndCacheSummary().catch(() => {}) // fire-and-forget
    return NextResponse.json(patent, { status: 201 })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to create patent' }, { status: 500 })
  }
}
