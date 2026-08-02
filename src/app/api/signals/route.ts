import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { inferTradeType, parseSourceTimestamp } from '@/lib/trade-classification';
import { checkFusionOpportunity } from '@/lib/signals/fusion-engine';

// DELETE /api/signals - Delete signals by filter or by ID
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const olderThan = searchParams.get('olderThan'); // hours
    const clearAll = searchParams.get('clearAll') === 'true';

    if (id) {
      // Delete a single signal by ID
      await db.tradeSignal.delete({ where: { id } });
      return NextResponse.json({ success: true, deleted: 1 });
    }

    // Build filter for bulk delete
    const where: Record<string, unknown> = {};

    if (clearAll) {
      // Delete all signals that are NOT currently executed with open positions
      where.status = { in: ['pending', 'expired', 'closed'] };
    } else if (status) {
      where.status = status;
    }

    if (olderThan) {
      const hours = parseInt(olderThan);
      where.createdAt = { lt: new Date(Date.now() - hours * 60 * 60 * 1000) };
    }

    // If no specific filter, require at least a status or olderThan
    if (!status && !olderThan && !clearAll) {
      return NextResponse.json(
        { error: 'Provide id, status, olderThan (hours), or clearAll=true' },
        { status: 400 }
      );
    }

    const result = await db.tradeSignal.deleteMany({ where });
    return NextResponse.json({ success: true, deleted: result.count });
  } catch (error: any) {
    console.error('Error deleting signals:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete signals' },
      { status: 500 }
    );
  }
}

// GET /api/signals - List all signals with optional filters
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const source = searchParams.get('source');
    const status = searchParams.get('status');
    const symbol = searchParams.get('symbol');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};
    if (source) where.source = source;
    if (status) where.status = status;
    if (symbol) where.symbol = { contains: symbol.toUpperCase() };

    const [signals, total] = await Promise.all([
      db.tradeSignal.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        include: { positions: true },
      }),
      db.tradeSignal.count({ where }),
    ]);

    return NextResponse.json({ signals, total, limit, offset });
  } catch (error) {
    console.error('Error fetching signals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch signals' },
      { status: 500 }
    );
  }
}

// POST /api/signals - Create a new trade signal or dedup
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // ─── Dedup action: merge duplicate signals ──────────
    if (body.action === 'dedup') {
      // Find all pending signals grouped by symbol+action
      const pendingSignals = await db.tradeSignal.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
      });

      const seen = new Map<string, string>(); // key: "SYMBOL:ACTION", value: signal id to keep
      const idsToDelete: string[] = [];

      for (const signal of pendingSignals) {
        const key = `${signal.symbol}:${signal.action}`;
        if (seen.has(key)) {
          // This is a duplicate — mark for deletion
          const keepId = seen.get(key)!;
          const keepSignal = pendingSignals.find(s => s.id === keepId);
          if (keepSignal) {
            // Update the kept signal with the best confidence
            const bestConfidence = Math.max(keepSignal.confidence, signal.confidence);
            keepSignal.confidence = bestConfidence; // Update in-memory to preserve max across loop
            await db.tradeSignal.update({
              where: { id: keepId },
              data: { confidence: bestConfidence },
            });
          }
          idsToDelete.push(signal.id);
        } else {
          seen.set(key, signal.id);
        }
      }

      // Delete duplicates
      if (idsToDelete.length > 0) {
        await db.tradeSignal.deleteMany({
          where: { id: { in: idsToDelete } },
        });
      }

      return NextResponse.json({
        success: true,
        duplicatesRemoved: idsToDelete.length,
        signalsRemaining: seen.size,
      });
    }

    // Validate required fields
    if (!body.symbol || !body.action || !body.entryPrice) {
      return NextResponse.json(
        { error: 'symbol, action, and entryPrice are required' },
        { status: 400 }
      );
    }

    if (!['BUY', 'SELL'].includes(body.action)) {
      return NextResponse.json(
        { error: 'action must be BUY or SELL' },
        { status: 400 }
      );
    }

    // Check for existing pending signal with same symbol+action (dedup)
    const existing = await db.tradeSignal.findFirst({
      where: {
        symbol: body.symbol.toUpperCase(),
        action: body.action,
        status: 'pending',
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
    });

    if (existing) {
      // Update existing instead of creating duplicate
      // We do NOT overwrite entryPrice/target/stop to prevent invalidating the original Risk/Reward checks.
      const updated = await db.tradeSignal.update({
        where: { id: existing.id },
        data: {
          confidence: Math.max(existing.confidence, body.confidence ?? 50),
          reasoning: body.reasoning ? `${existing.reasoning || ''}\n\n[DEDUP] ${body.reasoning}` : existing.reasoning,
          source: body.source || existing.source,
          modelName: body.modelName ?? existing.modelName,
          tradeType: body.tradeType ?? existing.tradeType ?? inferTradeType({
            symbol: body.symbol,
            source: body.source || existing.source,
            text: body.reasoning ?? existing.reasoning,
          }),
          sourceTimestamp: parseSourceTimestamp(body.sourceTimestamp) ?? existing.sourceTimestamp,
          updatedAt: new Date(),
        },
        include: { positions: true },
      });

      // Trigger fusion check for the updated dedup signal just in case the new source triggers it
      checkFusionOpportunity(
        updated.id,
        updated.symbol,
        updated.action as 'BUY' | 'SELL',
        updated.source,
        updated.confidence,
        updated.reasoning
      ).catch(err => console.error('[Fusion Engine] Error on dedup:', err));

      return NextResponse.json({ signal: updated, updated: true });
    }

    const signal = await db.tradeSignal.create({
      data: {
        symbol: body.symbol.toUpperCase(),
        exchange: body.exchange || 'NSE',
        action: body.action,
        source: body.source || 'manual',
        confidence: body.confidence ?? 50,
        entryPrice: body.entryPrice,
        targetPrice: body.targetPrice ?? null,
        stopLoss: body.stopLoss ?? null,
        quantity: body.quantity ?? 1,
        reasoning: body.reasoning ?? null,
        status: body.status || 'pending',
        modelName: body.modelName ?? null,
        channelId: body.channelId ?? null,
        tradeType: body.tradeType ?? inferTradeType({
          symbol: body.symbol,
          source: body.source || 'manual',
          text: body.reasoning,
        }),
        sourceTimestamp: parseSourceTimestamp(body.sourceTimestamp),
      },
      include: { positions: true },
    });

    // ── Fusion Engine: run async after signal creation ──────────────
    // Don't await — let it run in the background so we don't slow the response
    checkFusionOpportunity(
      signal.id,
      signal.symbol,
      signal.action as 'BUY' | 'SELL',
      signal.source,
      signal.confidence,
      signal.reasoning
    ).catch(err => console.error('[Fusion Engine] Error:', err));

    return NextResponse.json({ signal }, { status: 201 });
  } catch (error) {
    console.error('Error creating signal:', error);
    return NextResponse.json(
      { error: 'Failed to create signal' },
      { status: 500 }
    );
  }
}
