import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/positions/[id] - Close a position
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existingPosition = await db.position.findUnique({
      where: { id },
      include: { signal: true },
    });

    if (!existingPosition) {
      return NextResponse.json(
        { error: 'Position not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    // Handle closing a position
    if (body.status === 'closed' && existingPosition.status === 'open') {
      const closePrice = body.closePrice ?? body.currentPrice ?? existingPosition.currentPrice ?? existingPosition.entryPrice;

      const pnl =
        existingPosition.action === 'BUY'
          ? (closePrice - existingPosition.entryPrice) * existingPosition.quantity
          : (existingPosition.entryPrice - closePrice) * existingPosition.quantity;

      const pnlPercent =
        existingPosition.action === 'BUY'
          ? ((closePrice - existingPosition.entryPrice) / existingPosition.entryPrice) * 100
          : ((existingPosition.entryPrice - closePrice) / existingPosition.entryPrice) * 100;

      updateData.status = 'closed';
      updateData.currentPrice = closePrice;
      updateData.pnl = pnl;
      updateData.pnlPercent = pnlPercent;
      updateData.closedAt = new Date();

      // If this position is linked to a signal, check if all positions for that signal are closed
      if (existingPosition.signalId) {
        const otherOpenPositions = await db.position.count({
          where: {
            signalId: existingPosition.signalId,
            status: 'open',
            id: { not: id },
          },
        });

        // If no more open positions for this signal, close the signal too
        if (otherOpenPositions === 0) {
          await db.tradeSignal.update({
            where: { id: existingPosition.signalId },
            data: {
              status: 'closed',
              pnl,
            },
          });
        }
      }
    } else if (body.status === 'closed' && existingPosition.status === 'closed') {
      return NextResponse.json(
        { error: 'Position is already closed' },
        { status: 400 }
      );
    }

    // Allow updating currentPrice without closing
    if (body.currentPrice !== undefined && body.status !== 'closed') {
      updateData.currentPrice = body.currentPrice;

      // Recalculate unrealized P&L
      const price = body.currentPrice;
      const pnl =
        existingPosition.action === 'BUY'
          ? (price - existingPosition.entryPrice) * existingPosition.quantity
          : (existingPosition.entryPrice - price) * existingPosition.quantity;
      const pnlPercent =
        existingPosition.action === 'BUY'
          ? ((price - existingPosition.entryPrice) / existingPosition.entryPrice) * 100
          : ((existingPosition.entryPrice - price) / existingPosition.entryPrice) * 100;

      updateData.pnl = pnl;
      updateData.pnlPercent = pnlPercent;
    }

    const position = await db.position.update({
      where: { id },
      data: updateData,
      include: { signal: true },
    });

    return NextResponse.json({ position });
  } catch (error) {
    console.error('Error updating position:', error);
    return NextResponse.json(
      { error: 'Failed to update position' },
      { status: 500 }
    );
  }
}
