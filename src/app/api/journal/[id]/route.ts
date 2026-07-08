import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// PATCH /api/journal/[id] - Update a journal entry
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await db.tradeJournal.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 }
      );
    }

    const updateData: Record<string, unknown> = {};

    if (body.symbol !== undefined) updateData.symbol = body.symbol.trim().toUpperCase();
    if (body.exchange !== undefined) updateData.exchange = body.exchange;
    if (body.action !== undefined) {
      if (!['BUY', 'SELL'].includes(body.action)) {
        return NextResponse.json(
          { error: 'Action must be BUY or SELL' },
          { status: 400 }
        );
      }
      updateData.action = body.action;
    }
    if (body.entryPrice !== undefined) updateData.entryPrice = parseFloat(body.entryPrice);
    if (body.exitPrice !== undefined) updateData.exitPrice = body.exitPrice !== null ? parseFloat(body.exitPrice) : null;
    if (body.quantity !== undefined) updateData.quantity = parseInt(body.quantity);
    if (body.entryDate !== undefined) updateData.entryDate = new Date(body.entryDate);
    if (body.exitDate !== undefined) updateData.exitDate = body.exitDate ? new Date(body.exitDate) : null;
    if (body.emotion !== undefined) updateData.emotion = body.emotion || null;
    if (body.strategy !== undefined) updateData.strategy = body.strategy?.trim() || null;
    if (body.notes !== undefined) updateData.notes = body.notes?.trim() || null;
    if (body.lessons !== undefined) updateData.lessons = body.lessons?.trim() || null;
    if (body.rating !== undefined) updateData.rating = body.rating;
    if (body.tags !== undefined) updateData.tags = body.tags?.trim() || null;

    // Recalculate P&L if relevant fields changed
    const finalEntryPrice = updateData.entryPrice !== undefined ? Number(updateData.entryPrice) : existing.entryPrice;
    const finalExitPrice = updateData.exitPrice !== undefined ? (updateData.exitPrice !== null ? Number(updateData.exitPrice) : null) : existing.exitPrice;
    const finalQuantity = updateData.quantity !== undefined ? Number(updateData.quantity) : existing.quantity;
    const finalAction = updateData.action !== undefined ? String(updateData.action) : existing.action;

    if (finalExitPrice !== null && finalExitPrice !== undefined) {
      if (finalAction === 'BUY') {
        updateData.pnl = (finalExitPrice - finalEntryPrice) * finalQuantity;
      } else {
        updateData.pnl = (finalEntryPrice - finalExitPrice) * finalQuantity;
      }
    } else {
      updateData.pnl = null;
    }

    const entry = await db.tradeJournal.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ entry });
  } catch (error) {
    console.error('Error updating journal entry:', error);
    return NextResponse.json(
      { error: 'Failed to update journal entry' },
      { status: 500 }
    );
  }
}

// DELETE /api/journal/[id] - Delete a journal entry
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.tradeJournal.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 }
      );
    }

    await db.tradeJournal.delete({ where: { id } });

    return NextResponse.json({ message: 'Journal entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting journal entry:', error);
    return NextResponse.json(
      { error: 'Failed to delete journal entry' },
      { status: 500 }
    );
  }
}
