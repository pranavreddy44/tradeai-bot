/**
 * Signal Fusion Engine
 *
 * Detects "Convergence Signals" — when a Telegram signal and a News item
 * both reference the same stock within a 4-hour window. These signals get
 * a confidence boost and a special "convergence" badge in the UI.
 */

import { db } from '@/lib/db';

const FUSION_WINDOW_MS = 4 * 60 * 60 * 1000; // 4 hours
const FUSION_CONFIDENCE_BOOST = 15;

export interface FusionResult {
  isFusion: boolean;
  fusionSources: string;
  boostedConfidence: number;
  matchedSignalId?: string;
}

/**
 * Check if a newly created signal converges with an existing signal
 * from a complementary source (telegram <-> news) within 4 hours.
 *
 * Call this AFTER inserting the signal into the DB.
 */
export async function checkFusionOpportunity(
  signalId: string,
  symbol: string,
  action: 'BUY' | 'SELL',
  source: string,
  currentConfidence: number,
  currentReasoning: string | null = null
): Promise<FusionResult> {
  const noFusion: FusionResult = {
    isFusion: false,
    fusionSources: source,
    boostedConfidence: currentConfidence,
  };

  // Only fuse telegram <-> news
  const isTelegram = source.startsWith('telegram');
  const isNews = source.startsWith('ai-news') || source === 'news';
  if (!isTelegram && !isNews) return noFusion;

  const windowStart = new Date(Date.now() - FUSION_WINDOW_MS);

  // Find a matching signal from the complementary source for same symbol+action
  const matchingSignal = await db.tradeSignal.findFirst({
    where: {
      symbol: symbol.toUpperCase(),
      action,
      ...(isTelegram
        ? { source: { in: ['ai-news', 'news'] } }
        : { source: { startsWith: 'telegram' } }),
      createdAt: { gte: windowStart },
      id: { not: signalId },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!matchingSignal) return noFusion;

  // Fusion detected! Compute boosted confidence (capped at 95)
  const fusionSources = [source, matchingSignal.source]
    .map(s => s.replace('ai-', '').replace('telegram-chart-image', 'telegram').replace('telegram-image', 'telegram'))
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(',');

  const boostedConfidence = Math.min(95, currentConfidence + FUSION_CONFIDENCE_BOOST);

  // Update the current signal
  const fusionNote = `[⚡ CONVERGENCE: ${fusionSources.toUpperCase()} AGREEMENT]`;
  const updatedReasoning = currentReasoning ? `${fusionNote}\n\n${currentReasoning}` : fusionNote;

  await db.tradeSignal.update({
    where: { id: signalId },
    data: {
      fusionSources,
      confidence: boostedConfidence,
      reasoning: updatedReasoning,
    },
  });

  // Also mark the matched signal as a fusion if it wasn't already
  if (!matchingSignal.fusionSources) {
    const matchedFusionSources = [matchingSignal.source, source]
      .map(s => s.replace('ai-', '').replace('telegram-chart-image', 'telegram').replace('telegram-image', 'telegram'))
      .filter((v, i, a) => a.indexOf(v) === i)
      .join(',');

    await db.tradeSignal.update({
      where: { id: matchingSignal.id },
      data: {
        fusionSources: matchedFusionSources,
        confidence: Math.min(95, matchingSignal.confidence + FUSION_CONFIDENCE_BOOST),
      },
    });
  }

  console.log(`[Fusion Engine] ⚡ Convergence detected: ${symbol} ${action} — ${fusionSources}`);

  return {
    isFusion: true,
    fusionSources,
    boostedConfidence,
    matchedSignalId: matchingSignal.id,
  };
}

/**
 * Update a signal with fusion data after the fact.
 * Used when the matched signal arrives after the first.
 */
export async function applyFusionToSignal(
  signalId: string,
  fusionSources: string,
  boostedConfidence: number
): Promise<void> {
  await db.tradeSignal.update({
    where: { id: signalId },
    data: { fusionSources, confidence: boostedConfidence },
  });
}
