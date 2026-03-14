import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Recursively walk up to find root ancestor
async function findRoot(id: string, visited = new Set<string>()): Promise<string> {
  if (visited.has(id)) return id
  visited.add(id)
  const p = await prisma.patent.findUnique({
    where: { id },
    select: { parentPatentId: true }
  })
  if (p?.parentPatentId) return findRoot(p.parentPatentId, visited)
  return id
}

// Recursively build tree downward from a node
async function buildNode(id: string, visited = new Set<string>()): Promise<any> {
  if (visited.has(id)) return null
  visited.add(id)

  const p = await prisma.patent.findUnique({
    where: { id },
    select: {
      id: true,
      patentNumber: true,
      applicationNumber: true,
      title: true,
      status: true,
      type: true,
      continuationType: true,
      filingDate: true,
      grantDate: true,
      childPatents: { select: { id: true } }
    }
  }) as any

  if (!p) return null

  // Try to get source separately — may not exist if db:push hasn't been run
  let source = 'PORTFOLIO'
  try {
    const s = await (prisma.patent as any).findUnique({ where: { id }, select: { source: true } })
    if (s?.source) source = s.source
  } catch { /* column not yet migrated — default to PORTFOLIO */ }

  const children = await Promise.all(
    p.childPatents.map((c: any) => buildNode(c.id, visited))
  )

  return {
    id:               p.id,
    number:           p.patentNumber || p.applicationNumber || p.id.slice(0, 8),
    title:            p.title,
    status:           p.status,
    type:             p.type,
    source,
    continuationType: p.continuationType || undefined,
    filedDate:        p.filingDate ? p.filingDate.toISOString().slice(0, 10) : undefined,
    grantDate:        p.grantDate  ? p.grantDate.toISOString().slice(0, 10)  : undefined,
    children:         children.filter(Boolean),
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rootId  = await findRoot(id)
    const tree    = await buildNode(rootId)

    if (!tree) return NextResponse.json({ error: 'Patent not found' }, { status: 404 })

    return NextResponse.json({ tree, currentId: id })
  } catch (e: any) {
    console.error('tree error:', e)
    return NextResponse.json({ error: e?.message || 'Failed to build tree' }, { status: 500 })
  }
}
