/**
 * Source Performance Tracker
 *
 * Computes win-rates per source/channel from user outcome feedback.
 * Used to weight new signal confidence and display leaderboards.
 */

import { db } from '@/lib/db';

export interface SourceStats {
  source: string;          // e.g. "telegram:@stockgainerss", "ai-news"
  displayName: string;     // human-readable
  totalSignals: number;
  totalFeedback: number;   // signals with user outcome set
  wins: number;
  losses: number;
  missed: number;
  winRate: number;         // 0–1, wins / totalFeedback (if feedback > 0)
  feedbackRate: number;    // totalFeedback / totalSignals
  avgConfidence: number;
  confidenceMultiplier: number; // 0.7–1.3 applied to new signals from this source
}

/**
 * Compute per-source stats from all signals that have userOutcome set.
 */
export async function getSourcePerformance(): Promise<SourceStats[]> {
  // Fetch all signals that have outcome data
  const signals = await db.tradeSignal.findMany({
    select: {
      source: true,
      channelId: true,
      userOutcome: true,
      confidence: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 500, // last 500 signals for recency
  });

  // Group by source key
  const groups = new Map<string, {
    source: string;
    channelId: string | null;
    total: number;
    wins: number;
    losses: number;
    missed: number;
    feedbackCount: number;
    totalConfidence: number;
  }>();

  for (const sig of signals) {
    // Build source key: normalize telegram sources by channel
    let key = sig.source;
    if (sig.source.startsWith('telegram') && sig.channelId) {
      key = `telegram:${sig.channelId}`;
    } else if (sig.source.startsWith('ai-news') || sig.source === 'news') {
      key = 'ai-news';
    }

    if (!groups.has(key)) {
      groups.set(key, {
        source: sig.source,
        channelId: sig.channelId,
        total: 0,
        wins: 0,
        losses: 0,
        missed: 0,
        feedbackCount: 0,
        totalConfidence: 0,
      });
    }

    const g = groups.get(key)!;
    g.total++;
    g.totalConfidence += sig.confidence;

    if (sig.userOutcome) {
      g.feedbackCount++;
      if (sig.userOutcome === 'profit') g.wins++;
      else if (sig.userOutcome === 'loss') g.losses++;
      else if (sig.userOutcome === 'missed') g.missed++;
    }
  }

  const results: SourceStats[] = [];

  for (const [key, g] of groups.entries()) {
    const winRate = g.feedbackCount > 0 ? g.wins / g.feedbackCount : 0.5; // default 50% if no data
    const feedbackRate = g.total > 0 ? g.feedbackCount / g.total : 0;

    // Confidence multiplier: good sources get up to 1.3x, bad ones 0.7x
    // Only apply if we have enough feedback (≥ 5 outcomes)
    let confidenceMultiplier = 1.0;
    if (g.feedbackCount >= 5) {
      // Linear scale: 0% winRate → 0.7x, 50% → 1.0x, 100% → 1.3x
      confidenceMultiplier = 0.7 + winRate * 0.6;
    }

    // Build display name
    let displayName = key;
    if (key.startsWith('telegram:')) {
      displayName = key.replace('telegram:', '');
    } else if (key === 'ai-news') {
      displayName = '📰 AI News';
    } else if (key === 'manual') {
      displayName = '✏️ Manual';
    }

    results.push({
      source: key,
      displayName,
      totalSignals: g.total,
      totalFeedback: g.feedbackCount,
      wins: g.wins,
      losses: g.losses,
      missed: g.missed,
      winRate,
      feedbackRate,
      avgConfidence: g.total > 0 ? Math.round(g.totalConfidence / g.total) : 50,
      confidenceMultiplier,
    });
  }

  // Sort by win rate desc (sources with enough feedback first)
  return results.sort((a, b) => {
    const aHasData = a.totalFeedback >= 3;
    const bHasData = b.totalFeedback >= 3;
    if (aHasData && !bHasData) return -1;
    if (!aHasData && bHasData) return 1;
    return b.winRate - a.winRate;
  });
}

/**
 * Get the confidence multiplier for a specific source (used when creating new signals).
 */
export async function getSourceConfidenceMultiplier(
  source: string,
  channelId?: string | null
): Promise<number> {
  const key = (source.startsWith('telegram') && channelId)
    ? `telegram:${channelId}`
    : source.startsWith('ai-news') ? 'ai-news' : source;

  const allStats = await getSourcePerformance();
  const stat = allStats.find(s => s.source === key);
  return stat?.confidenceMultiplier ?? 1.0;
}
