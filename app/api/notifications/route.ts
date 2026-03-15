import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET /api/notifications?supabaseId=xxx  — notifications where user is a recipient
export async function GET(req: NextRequest) {
  try {
    const supabaseId = req.nextUrl.searchParams.get('supabaseId')
    if (!supabaseId) return NextResponse.json({ notifications: [], unread: 0 })

    const user = await prisma.user.findFirst({ where: { supabaseId } })
    if (!user) return NextResponse.json({ notifications: [], unread: 0 })

    const recipients = await prisma.notificationRecipient.findMany({
      where: { userId: user.id },
      include: {
        notification: {
          include: {
            patent: { select: { id: true, patentNumber: true, applicationNumber: true, title: true } },
            createdBy: { select: { id: true, name: true, email: true } },
            recipients: { include: { user: { select: { id: true, name: true, email: true } } } },
          },
        },
      },
      orderBy: { notification: { createdAt: 'desc' } },
    })

    const notifications = recipients.map(r => ({
      ...r.notification,
      recipientRecord: { id: r.id, read: r.read, readAt: r.readAt, todoCompleted: r.todoCompleted, todoCompletedAt: r.todoCompletedAt },
    }))

    const unread = recipients.filter(r => !r.read).length
    return NextResponse.json({ notifications, unread })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to load notifications' }, { status: 500 })
  }
}

// POST /api/notifications — create notification
export async function POST(req: NextRequest) {
  try {
    const { title, message, recipientIds, patentId, todoText, todoDueDate, createdBySupabaseId } = await req.json()
    if (!title || !message || !recipientIds?.length) {
      return NextResponse.json({ error: 'title, message, and at least one recipient are required' }, { status: 400 })
    }

    let createdById: string | undefined
    if (createdBySupabaseId) {
      const sender = await prisma.user.findFirst({ where: { supabaseId: createdBySupabaseId } })
      if (sender) createdById = sender.id
    }

    const notification = await prisma.notification.create({
      data: {
        title,
        message,
        patentId: patentId || null,
        todoText: todoText || null,
        todoDueDate: todoDueDate ? new Date(todoDueDate) : null,
        createdById,
        recipients: {
          create: recipientIds.map((userId: string) => ({ userId })),
        },
      },
      include: {
        patent: { select: { id: true, patentNumber: true, title: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        recipients: { include: { user: { select: { id: true, name: true, email: true } } } },
      },
    })

    return NextResponse.json(notification, { status: 201 })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to create notification' }, { status: 500 })
  }
}
