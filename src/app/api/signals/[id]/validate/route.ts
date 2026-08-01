import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/signals/:id/validate — on-demand signal validity check
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const signal = await db.tradeSignal.findUnique({ where: { id } });
    if (!signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }

    const { validateChartSignalWithIndicators } = await import('@/lib/chart/technical-analysis');
    const { getLivePrice } = await import('@/lib/broker/live-prices');

    const [livePrice, technicalResult] = await Promise.all([
      getLivePrice(signal.symbol),
      validateChartSignalWithIndicators(
        {
          symbol: signal.symbol,
          action: signal.action as 'BUY' | 'SELL',
          entryPrice: signal.entryPrice,
          targetPrice: signal.targetPrice ?? signal.entryPrice * 1.05,
          stopLoss: signal.stopLoss ?? signal.entryPrice * 0.97,
          confidence: signal.confidence,
          reasoning: signal.reasoning ?? '',
        },
        null // No chart analysis — purely technical
      ),
    ]);

    const cmp = livePrice ?? technicalResult.entryPrice;
    const entry = signal.entryPrice;
    const target = signal.targetPrice ?? entry * 1.05;
    const sl = signal.stopLoss ?? entry * 0.97;
    const isBuy = signal.action === 'BUY';

    const reasons: string[] = [];
    let score = 0;

    // ── Check 1: Price proximity to entry (max 25 pts) ──────────────────
    const deviation = Math.abs(cmp - entry) / entry;
    if (deviation <= 0.01) {
      score += 25;
      reasons.push(`✅ Price ₹${cmp.toFixed(2)} is very close to entry ₹${entry.toFixed(2)} (<1%)`);
    } else if (deviation <= 0.03) {
      score += 15;
      reasons.push(`✅ Price ₹${cmp.toFixed(2)} is near entry ₹${entry.toFixed(2)} (${(deviation * 100).toFixed(1)}%)`);
    } else if (deviation <= 0.07) {
      score += 5;
      reasons.push(`⚠️ Price ₹${cmp.toFixed(2)} has moved ${(deviation * 100).toFixed(1)}% from entry ₹${entry.toFixed(2)}`);
    } else {
      score += 0;
      reasons.push(`❌ Price ₹${cmp.toFixed(2)} has moved significantly (${(deviation * 100).toFixed(1)}%) from entry ₹${entry.toFixed(2)}`);
    }

    // ── Check 2: Stop-loss not triggered (max 25 pts) ───────────────────
    const slHit = isBuy ? cmp <= sl : cmp >= sl;
    if (slHit) {
      score += 0;
      reasons.push(`❌ Stop-loss level ₹${sl.toFixed(2)} has been triggered (CMP ₹${cmp.toFixed(2)})`);
    } else {
      const slBuffer = Math.abs(cmp - sl) / entry;
      if (slBuffer >= 0.03) {
        score += 25;
        reasons.push(`✅ Stop-loss ₹${sl.toFixed(2)} is safe — ${(slBuffer * 100).toFixed(1)}% buffer`);
      } else {
        score += 12;
        reasons.push(`⚠️ Stop-loss ₹${sl.toFixed(2)} is close — only ${(slBuffer * 100).toFixed(1)}% buffer`);
      }
    }

    // ── Check 3: Target not already hit (max 10 pts, bonus) ─────────────
    const targetHit = isBuy ? cmp >= target : cmp <= target;
    if (targetHit) {
      score += 0;
      reasons.push(`⚠️ Target ₹${target.toFixed(2)} already reached — consider if re-entry makes sense`);
    } else {
      score += 10;
      const toTarget = Math.abs(target - cmp) / cmp;
      reasons.push(`✅ Target ₹${target.toFixed(2)} not yet hit — ${(toTarget * 100).toFixed(1)}% upside remaining`);
    }

    // ── Check 4: Technical score from indicators (max 40 pts) ───────────
    const techScore = Math.max(0, Math.min(100, technicalResult.confidence));
    const techContribution = Math.round((techScore / 100) * 40);
    score += techContribution;

    // Parse reasoning for indicator hints
    const reasoning = technicalResult.reasoning ?? '';
    if (/EMA.*bullish|price.*above.*EMA|bullish.*EMA/i.test(reasoning)) {
      reasons.push(`✅ Price is above key EMAs (bullish trend)`);
    } else if (/EMA.*bearish|price.*below.*EMA|bearish.*EMA/i.test(reasoning)) {
      reasons.push(isBuy ? `⚠️ Price is below EMAs (against BUY direction)` : `✅ Price is below EMAs (confirms SELL)`);
    }
    if (/RSI.*overbought|RSI.*above\s*70/i.test(reasoning)) {
      reasons.push(`⚠️ RSI overbought — momentum may slow for BUY`);
    } else if (/RSI.*oversold|RSI.*below\s*30/i.test(reasoning)) {
      reasons.push(`⚠️ RSI oversold — potential reversal zone`);
    } else if (/RSI/i.test(reasoning)) {
      reasons.push(`✅ RSI in healthy range`);
    }
    if (/volume.*high|high.*volume|above.*average.*volume/i.test(reasoning)) {
      reasons.push(`✅ Above-average volume confirms momentum`);
    } else if (/volume/i.test(reasoning)) {
      reasons.push(`⚠️ Volume below average — watch for confirmation`);
    }
    if (/MACD.*bullish|bullish.*MACD/i.test(reasoning)) {
      reasons.push(`✅ MACD histogram is bullish`);
    } else if (/MACD.*bearish|bearish.*MACD/i.test(reasoning)) {
      reasons.push(isBuy ? `⚠️ MACD is bearish (conflicting with BUY)` : `✅ MACD confirms bearish direction`);
    }

    const finalScore = Math.min(100, score);

    // ── Verdict ─────────────────────────────────────────────────────────
    let verdict: 'valid' | 'stale' | 'invalidated';
    let verdictLabel: string;
    if (slHit) {
      verdict = 'invalidated';
      verdictLabel = '❌ Invalidated — Stop-loss hit';
    } else if (finalScore >= 65) {
      verdict = 'valid';
      verdictLabel = '✅ Signal still valid';
    } else if (finalScore >= 35) {
      verdict = 'stale';
      verdictLabel = '⚠️ Partially stale — review before acting';
    } else {
      verdict = 'invalidated';
      verdictLabel = '❌ Signal invalidated — conditions changed';
    }

    // ── Persist validity score ───────────────────────────────────────────
    await db.tradeSignal.update({
      where: { id },
      data: { validityScore: finalScore },
    });

    return NextResponse.json({
      score: finalScore,
      verdict,
      verdictLabel,
      reasons,
      livePrice: cmp,
      entryPrice: entry,
      targetPrice: target,
      stopLoss: sl,
      technicalConfidence: techScore,
    });
  } catch (err: any) {
    console.error('[Validity Check] Error:', err);
    return NextResponse.json({ error: err.message || 'Validation failed' }, { status: 500 });
  }
}
