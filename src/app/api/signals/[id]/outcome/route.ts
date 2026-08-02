import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { invalidateSourceStatsCache } from '@/lib/signals/source-performance';

// PATCH /api/signals/:id/outcome — record user feedback on a signal
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { outcome, notes } = body;

    if (!['profit', 'loss', 'missed'].includes(outcome)) {
      return NextResponse.json(
        { error: 'outcome must be one of: profit, loss, missed' },
        { status: 400 }
      );
    }

    const signal = await db.tradeSignal.findUnique({ where: { id } });
    if (!signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }

    const updated = await db.tradeSignal.update({
      where: { id },
      data: {
        userOutcome: outcome,
        outcomeNotes: notes || null,
        status: outcome === 'missed' ? signal.status : 'closed',
      },
    });

    // Outcomes feed the source confidence multipliers — drop the cached stats.
    invalidateSourceStatsCache();

    return NextResponse.json({ success: true, signal: updated });
  } catch (err: any) {
    console.error('[Outcome API] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to update outcome' }, { status: 500 });
  }
}

// GET /api/signals/:id/outcome — retrieve outcome for a signal
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const signal = await db.tradeSignal.findUnique({
    where: { id },
    select: { userOutcome: true, outcomeNotes: true, status: true },
  });

  if (!signal) {
    return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
  }

  return NextResponse.json(signal);
}
