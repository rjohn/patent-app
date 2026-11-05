import { prisma } from './prisma'

// Builds the Prisma `where.OR` for a free-text patent search. Shared by
// GET /api/patents and the MCP search_patents tool so both match identically.
export async function patentSearchConditions(q: string): Promise<any[]> {
  // inventors / cpcCodes are String[] — Prisma can only exact-match array elements,
  // so find substring matches with raw SQL and fold them in by id.
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`
  const arrayMatches = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM patents
    WHERE EXISTS (SELECT 1 FROM unnest(inventors) AS i WHERE i ILIKE ${pattern})
       OR EXISTS (SELECT 1 FROM unnest("cpcCodes") AS c WHERE c ILIKE ${pattern})
  `
  return [
    ...(arrayMatches.length ? [{ id: { in: arrayMatches.map(r => r.id) } }] : []),
    { claimsText:        { contains: q, mode: 'insensitive' } },
    { title:             { contains: q, mode: 'insensitive' } },
    { patentNumber:      { contains: q, mode: 'insensitive' } },
    { applicationNumber: { contains: q, mode: 'insensitive' } },
    { epNumber:          { contains: q.replace(/^EP/i, ''), mode: 'insensitive' } },
    { publicationNumber: { contains: q, mode: 'insensitive' } },
    { assignee:          { contains: q, mode: 'insensitive' } },
    { docketNumber:      { contains: q, mode: 'insensitive' } },
    { abstract:          { contains: q, mode: 'insensitive' } },
  ]
}
