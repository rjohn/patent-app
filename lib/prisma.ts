import { PrismaClient } from '@prisma/client'
import { claimsToText } from './claims-text'

// Keeps Patent.claimsText in sync whenever claimsJson is written, so every
// create/update path (refresh, lookup, claims fetch, raw PATCH bodies) stays searchable.
function withClaimsText<T extends Record<string, any> | undefined>(data: T): T {
  if (data && 'claimsJson' in data) {
    return { ...data, claimsText: claimsToText(data.claimsJson) }
  }
  return data
}

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  }).$extends({
    query: {
      patent: {
        create({ args, query }) {
          args.data = withClaimsText(args.data)
          return query(args)
        },
        update({ args, query }) {
          args.data = withClaimsText(args.data)
          return query(args)
        },
        upsert({ args, query }) {
          args.create = withClaimsText(args.create)
          args.update = withClaimsText(args.update)
          return query(args)
        },
      },
    },
  })
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createClient> | undefined
}

export const prisma = globalForPrisma.prisma ?? createClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
