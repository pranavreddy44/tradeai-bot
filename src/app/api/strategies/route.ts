import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/strategies - List all strategies
export async function GET() {
  try {
    const strategies = await db.strategy.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ strategies });
  } catch (error) {
    console.error('Error fetching strategies:', error);
    return NextResponse.json(
      { error: 'Failed to fetch strategies' },
      { status: 500 }
    );
  }
}

// POST /api/strategies - Create a new strategy
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate required fields
    if (!body.name) {
      return NextResponse.json(
        { error: 'Strategy name is required' },
        { status: 400 }
      );
    }

    if (!body.rules || !Array.isArray(body.rules) || body.rules.length === 0) {
      return NextResponse.json(
        { error: 'At least one rule is required' },
        { status: 400 }
      );
    }

    if (body.action && !['BUY', 'SELL'].includes(body.action)) {
      return NextResponse.json(
        { error: 'action must be BUY or SELL' },
        { status: 400 }
      );
    }

    const strategy = await db.strategy.create({
      data: {
        name: body.name.trim(),
        description: body.description?.trim() ?? null,
        rules: JSON.stringify(body.rules),
        isActive: body.isActive ?? false,
        symbol: body.symbol ?? null,
        action: body.action || 'BUY',
        confidence: body.confidence ?? 70,
      },
    });

    return NextResponse.json({ strategy }, { status: 201 });
  } catch (error) {
    console.error('Error creating strategy:', error);
    return NextResponse.json(
      { error: 'Failed to create strategy' },
      { status: 500 }
    );
  }
}
