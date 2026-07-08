import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/strategies/[id] - Update a strategy
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existingStrategy = await db.strategy.findUnique({
      where: { id },
    });

    if (!existingStrategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name.trim();
    if (body.description !== undefined) updateData.description = body.description?.trim() ?? null;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.symbol !== undefined) updateData.symbol = body.symbol ?? null;
    if (body.confidence !== undefined) updateData.confidence = body.confidence;
    if (body.action !== undefined) {
      if (!['BUY', 'SELL'].includes(body.action)) {
        return NextResponse.json(
          { error: 'action must be BUY or SELL' },
          { status: 400 }
        );
      }
      updateData.action = body.action;
    }
    if (body.rules !== undefined) {
      if (!Array.isArray(body.rules) || body.rules.length === 0) {
        return NextResponse.json(
          { error: 'At least one rule is required' },
          { status: 400 }
        );
      }
      updateData.rules = JSON.stringify(body.rules);
    }

    const strategy = await db.strategy.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ strategy });
  } catch (error) {
    console.error('Error updating strategy:', error);
    return NextResponse.json(
      { error: 'Failed to update strategy' },
      { status: 500 }
    );
  }
}

// DELETE /api/strategies/[id] - Delete a strategy
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existingStrategy = await db.strategy.findUnique({
      where: { id },
    });

    if (!existingStrategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    await db.strategy.delete({ where: { id } });

    return NextResponse.json({ message: 'Strategy deleted successfully' });
  } catch (error) {
    console.error('Error deleting strategy:', error);
    return NextResponse.json(
      { error: 'Failed to delete strategy' },
      { status: 500 }
    );
  }
}
