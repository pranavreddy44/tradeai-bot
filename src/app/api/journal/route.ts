import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/journal - List all journal entries (sorted by entryDate desc)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const emotion = searchParams.get('emotion');
    const action = searchParams.get('action');
    const sortBy = searchParams.get('sortBy') || 'entryDate';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    const where: Record<string, unknown> = {};
    if (emotion) where.emotion = emotion;
    if (action) where.action = action;

    const entries = await db.tradeJournal.findMany({
      where,
      orderBy: {
        [sortBy]: sortOrder === 'asc' ? 'asc' : 'desc',
      },
    });

    return NextResponse.json({ entries });
  } catch (error) {
    console.error('Error fetching journal entries:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal entries' },
      { status: 500 }
    );
  }
}

// POST /api/journal - Create a new journal entry
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.symbol) {
      return NextResponse.json(
        { error: 'Symbol is required' },
        { status: 400 }
      );
    }

    if (!body.action || !['BUY', 'SELL'].includes(body.action)) {
      return NextResponse.json(
        { error: 'Action must be BUY or SELL' },
        { status: 400 }
      );
    }

    if (body.entryPrice === undefined || body.entryPrice === null) {
      return NextResponse.json(
        { error: 'Entry price is required' },
        { status: 400 }
      );
    }

    if (!body.quantity || body.quantity <= 0) {
      return NextResponse.json(
        { error: 'Quantity must be a positive number' },
        { status: 400 }
      );
    }

    if (!body.entryDate) {
      return NextResponse.json(
        { error: 'Entry date is required' },
        { status: 400 }
      );
    }

    // Calculate P&L if exit price is provided
    let pnl: number | null = null;
    if (body.exitPrice !== undefined && body.exitPrice !== null) {
      if (body.action === 'BUY') {
        pnl = (body.exitPrice - body.entryPrice) * body.quantity;
      } else {
        pnl = (body.entryPrice - body.exitPrice) * body.quantity;
      }
    }

    const entry = await db.tradeJournal.create({
      data: {
        symbol: body.symbol.trim().toUpperCase(),
        exchange: body.exchange || 'NSE',
        action: body.action,
        entryPrice: parseFloat(body.entryPrice),
        exitPrice: body.exitPrice !== undefined && body.exitPrice !== null ? parseFloat(body.exitPrice) : null,
        quantity: parseInt(body.quantity),
        entryDate: new Date(body.entryDate),
        exitDate: body.exitDate ? new Date(body.exitDate) : null,
        pnl,
        emotion: body.emotion || null,
        strategy: body.strategy?.trim() || null,
        notes: body.notes?.trim() || null,
        lessons: body.lessons?.trim() || null,
        rating: body.rating ?? 3,
        tags: body.tags?.trim() || null,
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error('Error creating journal entry:', error);
    return NextResponse.json(
      { error: 'Failed to create journal entry' },
      { status: 500 }
    );
  }
}
