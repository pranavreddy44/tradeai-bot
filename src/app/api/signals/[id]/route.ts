import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parseSourceTimestamp } from '@/lib/trade-classification';

// GET /api/signals/[id] - Get a single signal
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const signal = await db.tradeSignal.findUnique({
      where: { id },
      include: { positions: true },
    });

    if (!signal) {
      return NextResponse.json(
        { error: 'Signal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ signal });
  } catch (error) {
    console.error('Error fetching signal:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signal' },
      { status: 500 }
    );
  }
}

// PATCH /api/signals/[id] - Update a signal (change status, close with P&L)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existingSignal = await db.tradeSignal.findUnique({
      where: { id },
      include: { positions: true },
    });

    if (!existingSignal) {
      return NextResponse.json(
        { error: 'Signal not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    // Handle status changes
    if (body.status) {
      if (!['pending', 'executed', 'closed', 'expired'].includes(body.status)) {
        return NextResponse.json(
          { error: 'Invalid status. Must be: pending, executed, closed, expired' },
          { status: 400 }
        );
      }
      updateData.status = body.status;

      // When closing a signal, calculate P&L
      if (body.status === 'closed') {
        if (body.closePrice !== undefined) {
          const closePrice = body.closePrice;
          if (existingSignal.action === 'BUY') {
            updateData.pnl =
              (closePrice - existingSignal.entryPrice) * existingSignal.quantity;
          } else {
            updateData.pnl =
              (existingSignal.entryPrice - closePrice) * existingSignal.quantity;
          }
        } else if (body.pnl !== undefined) {
          updateData.pnl = body.pnl;
        }

        // Also close any linked open positions
        if (existingSignal.positions.length > 0) {
          const openPositions = existingSignal.positions.filter(
            (p) => p.status === 'open'
          );

          for (const position of openPositions) {
            const closeP = body.closePrice ?? position.currentPrice ?? position.entryPrice;
            const pnl =
              position.action === 'BUY'
                ? (closeP - position.entryPrice) * position.quantity
                : (position.entryPrice - closeP) * position.quantity;
            const pnlPercent =
              position.action === 'BUY'
                ? ((closeP - position.entryPrice) / position.entryPrice) * 100
                : ((position.entryPrice - closeP) / position.entryPrice) * 100;

            await db.position.update({
              where: { id: position.id },
              data: {
                status: 'closed',
                currentPrice: closeP,
                pnl,
                pnlPercent,
                closedAt: new Date(),
              },
            });
          }
        }
      }
    }

    // Allow updating other fields
    if (body.confidence !== undefined) updateData.confidence = body.confidence;
    if (body.targetPrice !== undefined) updateData.targetPrice = body.targetPrice;
    if (body.stopLoss !== undefined) updateData.stopLoss = body.stopLoss;
    if (body.reasoning !== undefined) updateData.reasoning = body.reasoning;
    if (body.pnl !== undefined && body.status !== 'closed') updateData.pnl = body.pnl;
    if (body.tradeType !== undefined) updateData.tradeType = body.tradeType;
    if (body.sourceTimestamp !== undefined) updateData.sourceTimestamp = parseSourceTimestamp(body.sourceTimestamp);

    const signal = await db.tradeSignal.update({
      where: { id },
      data: updateData,
      include: { positions: true },
    });

    return NextResponse.json({ signal });
  } catch (error) {
    console.error('Error updating signal:', error);
    return NextResponse.json(
      { error: 'Failed to update signal' },
      { status: 500 }
    );
  }
}

// DELETE /api/signals/[id] - Delete a signal
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existingSignal = await db.tradeSignal.findUnique({
      where: { id },
    });

    if (!existingSignal) {
      return NextResponse.json(
        { error: 'Signal not found' },
        { status: 404 }
      );
    }

    // Delete linked positions first
    await db.position.deleteMany({ where: { signalId: id } });

    await db.tradeSignal.delete({ where: { id } });

    return NextResponse.json({ message: 'Signal deleted successfully' });
  } catch (error) {
    console.error('Error deleting signal:', error);
    return NextResponse.json(
      { error: 'Failed to delete signal' },
      { status: 500 }
    );
  }
}
