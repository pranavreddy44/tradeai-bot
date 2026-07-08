import { NextRequest, NextResponse } from 'next/server';

// GET /api/signals/source-performance — leaderboard of sources by win rate
export async function GET(_req: NextRequest) {
  try {
    const { getSourcePerformance } = await import('@/lib/signals/source-performance');
    const stats = await getSourcePerformance();
    return NextResponse.json({ stats });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
