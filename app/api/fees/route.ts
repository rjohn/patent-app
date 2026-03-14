import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const fees = await prisma.maintenanceFee.findMany({
      orderBy: { dueDate: 'asc' },
    })
    return NextResponse.json({ fees })
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch fees' }, { status: 500 })
  }
}
