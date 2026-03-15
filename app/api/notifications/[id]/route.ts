import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// PATCH — mark read or complete todo
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { supabaseId, action } = await req.json()

    const user = await prisma.user.findFirst({ where: { supabaseId } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const recipient = await prisma.notificationRecipient.findFirst({
      where: { notificationId: id, userId: user.id },
    })
    if (!recipient) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const now = new Date()
    if (action === 'read') {
      await prisma.notificationRecipient.update({
        where: { id: recipient.id },
        data: { read: true, readAt: now },
      })
    } else if (action === 'complete_todo') {
      await prisma.notificationRecipient.update({
        where: { id: recipient.id },
        data: { todoCompleted: true, todoCompletedAt: now, read: true, readAt: recipient.readAt ?? now },
      })
    } else if (action === 'unread') {
      await prisma.notificationRecipient.update({
        where: { id: recipient.id },
        data: { read: false, readAt: null },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

// DELETE — sender deletes notification entirely
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await prisma.notification.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
