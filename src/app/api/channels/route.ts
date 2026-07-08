import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/channels - List configured Telegram channels
export async function GET() {
  try {
    const channels = await db.telegramChannel.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ channels });
  } catch (error) {
    console.error('Error fetching channels:', error);
    return NextResponse.json(
      { error: 'Failed to fetch channels' },
      { status: 500 }
    );
  }
}

// POST /api/channels - Add a new Telegram channel
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name || !body.channelId) {
      return NextResponse.json(
        { error: 'name and channelId are required' },
        { status: 400 }
      );
    }

    // Check for duplicate
    const existing = await db.telegramChannel.findFirst({
      where: { channelId: body.channelId },
    });

    if (existing) {
      return NextResponse.json(
        { error: 'Channel with this channelId already exists' },
        { status: 409 }
      );
    }

    const channel = await db.telegramChannel.create({
      data: {
        name: body.name,
        channelId: body.channelId,
        isActive: body.isActive ?? true,
      },
    });

    return NextResponse.json({ channel }, { status: 201 });
  } catch (error) {
    console.error('Error creating channel:', error);
    return NextResponse.json(
      { error: 'Failed to create channel' },
      { status: 500 }
    );
  }
}
