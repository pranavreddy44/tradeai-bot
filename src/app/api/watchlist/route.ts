import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/watchlist - List watchlist items
export async function GET() {
  try {
    const watchlist = await db.watchlistItem.findMany({
      orderBy: { addedAt: 'desc' },
    });
    return NextResponse.json({ watchlist });
  } catch (error) {
    console.error('Error fetching watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to fetch watchlist' },
      { status: 500 }
    );
  }
}

// POST /api/watchlist - Add symbol to watchlist
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.symbol) {
      return NextResponse.json(
        { error: 'symbol is required' },
        { status: 400 }
      );
    }

    const symbol = body.symbol.toUpperCase();

    // Check for duplicate
    const existing = await db.watchlistItem.findFirst({
      where: { symbol },
    });

    if (existing) {
      return NextResponse.json(
        { error: `${symbol} is already in the watchlist` },
        { status: 409 }
      );
    }

    const item = await db.watchlistItem.create({
      data: {
        symbol,
        exchange: body.exchange || 'NSE',
        name: body.name || null,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error('Error adding to watchlist:', error);
    return NextResponse.json(
      { error: 'Failed to add to watchlist' },
      { status: 500 }
    );
  }
}
