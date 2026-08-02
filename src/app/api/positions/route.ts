import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/positions - List positions with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (symbol) where.symbol = { contains: symbol.toUpperCase() };

    const [positions, total] = await Promise.all([
      db.position.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { signal: true },
      }),
      db.position.count({ where }),
    ]);

    return NextResponse.json({ positions, total, limit, offset });
  } catch (error) {
    console.error('Error fetching positions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}

// POST /api/positions - Open a new position
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.symbol || !body.action || !body.entryPrice || !body.quantity) {
      return NextResponse.json(
        { error: 'symbol, action, entryPrice, and quantity are required' },
        { status: 400 }
      );
    }

    if (!['BUY', 'SELL'].includes(body.action)) {
      return NextResponse.json(
        { error: 'action must be BUY or SELL' },
        { status: 400 }
      );
    }

    // If a signalId is provided, update the signal status to 'executed'
    if (body.signalId) {
      const signal = await db.tradeSignal.findUnique({
        where: { id: body.signalId },
      });
      if (!signal) {
        return NextResponse.json(
          { error: 'Referenced signal not found' },
          { status: 404 }
        );
      }

      // Update signal status to executed if it was pending
      if (signal.status === 'pending') {
        await db.tradeSignal.update({
          where: { id: body.signalId },
          data: { status: 'executed' },
        });
      }
    }

    const position = await db.position.create({
      data: {
        symbol: body.symbol.toUpperCase(),
        exchange: body.exchange || 'NSE',
        action: body.action,
        quantity: body.quantity,
        entryPrice: body.entryPrice,
        currentPrice: body.currentPrice ?? body.entryPrice,
        status: 'open',
        signalId: body.signalId ?? null,
      },
      include: { signal: true },
    });

    return NextResponse.json({ position }, { status: 201 });
  } catch (error) {
    console.error('Error creating position:', error);
    return NextResponse.json(
      { error: 'Failed to create position' },
      { status: 500 }
    );
  }
}
