import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/channels/[id] - Update a Telegram channel (e.g. lastMessageId, isActive)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.telegramChannel.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      );
    }

    const data: { lastMessageId?: string; isActive?: boolean; name?: string; channelId?: string } = {};
    if (body.lastMessageId !== undefined) data.lastMessageId = String(body.lastMessageId);
    if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body.name !== undefined) data.name = String(body.name);
    if (body.channelId !== undefined) data.channelId = String(body.channelId);

    const channel = await db.telegramChannel.update({
      where: { id },
      data,
    });

    return NextResponse.json({ channel });
  } catch (error) {
    console.error('Error updating channel:', error);
    return NextResponse.json(
      { error: 'Failed to update channel' },
      { status: 500 }
    );
  }
}

// DELETE /api/channels/[id] - Delete a Telegram channel
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.telegramChannel.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Channel not found' },
        { status: 404 }
      );
    }

    await db.telegramChannel.delete({ where: { id } });

    return NextResponse.json({ message: 'Channel deleted successfully' });
  } catch (error) {
    console.error('Error deleting channel:', error);
    return NextResponse.json(
      { error: 'Failed to delete channel' },
      { status: 500 }
    );
  }
}
