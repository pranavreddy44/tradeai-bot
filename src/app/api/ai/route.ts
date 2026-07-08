// ============================================================
// AI Analysis API
// POST /api/ai with action: analyze-signals
// Combines Telegram signals + News sentiment → trade decisions
// Now with rule-based fallback when AI provider is unavailable
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { analyzeNewsForSignals, searchMarketNews, isRateLimited, getRateLimitRemainingMs, resetRateLimit, type AIAnalysisResult } from '@/lib/ai-engine';
import { normalizeSignalWithLivePrice } from '@/lib/broker/live-prices';
import { inferTradeType, parseSourceTimestamp } from '@/lib/trade-classification';
import { getSourceConfidenceMultiplier } from '@/lib/signals/source-performance';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ─── Analyze Signals ─────────────────────────────────
      case 'analyze-signals': {
        const query = body.query || 'Indian stock market NSE BSE news today trading signals';

        // Step 1: Try live search (non-blocking, won't fail entire analysis)
        let newsResults: any[] = [];
        let searchFailed = false;
        try {
          newsResults = await Promise.race([
            searchMarketNews(query, 0),
            new Promise<any[]>((resolve) =>
              setTimeout(() => {
                console.warn('[AI API] News search exceeded 15s limit, proceeding with DB data only');
                resolve([]);
              }, 15_000)
            ),
          ]);
        } catch (err: any) {
          console.error('[AI API] News search failed:', err?.message);
          searchFailed = true;
        }

        // Step 1b: Also get recently saved news from DB for richer context
        const savedNews = await db.newsItem.findMany({
          where: { analyzed: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });

        // Step 2: Get recent telegram signals from DB
        const allPendingSignals = await db.tradeSignal.findMany({
          where: {
            status: 'pending',
            createdAt: {
              gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
        });

        // Step 3: Get watchlist symbols
        const watchlist = await db.watchlistItem.findMany();
        const symbols = watchlist.length > 0
          ? watchlist.map(w => w.symbol)
          : ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC', 'BHARTIARTL', 'WIPRO', 'MARUTI'];

        // Step 4: Prepare combined input for AI
        const liveNewsText = newsResults.length > 0
          ? newsResults.map((n, i) => `${i + 1}. ${n.name}: ${n.snippet}`).join('\n\n')
          : '';

        const savedNewsText = savedNews.length > 0
          ? savedNews.map((n, i) => `${i + 1}. [${n.sentiment || 'neutral'}] ${n.title}: ${n.aiSummary || n.content || ''} (Symbols: ${n.relatedSymbols || 'none'})`).join('\n\n')
          : '';

        const newsText = [liveNewsText, savedNewsText].filter(Boolean).join('\n\n---\n\n') || 'No recent market news available.';
        const latestNewsTimestamp = parseSourceTimestamp(newsResults[0]?.date) ?? savedNews[0]?.publishedAt ?? null;

        const telegramText = allPendingSignals.length > 0
          ? allPendingSignals.map((s, i) => `${i + 1}. [${s.source}] ${s.symbol} ${s.action} @ ₹${s.entryPrice} (Confidence: ${s.confidence}%) - ${s.reasoning || 'No reasoning'}`).join('\n')
          : 'No recent signals.';

        // Step 5: Run AI analysis (with rule-based fallback built-in)
        let analysis: AIAnalysisResult;
        let usedFallback = false;
        try {
          analysis = await analyzeNewsForSignals(symbols, newsText, telegramText);
          // Check if fallback was used (summary contains rule-based marker)
          usedFallback = analysis.summary.includes('Rule-based') || analysis.summary.includes('fallback');
        } catch (aiErr: any) {
          console.error('[AI API] All analysis methods failed:', aiErr?.message);
          return NextResponse.json(
            { error: 'Analysis failed', details: aiErr?.message || 'Unknown error' },
            { status: 500 }
          );
        }

        const thresholdSetting = await db.botSetting.findUnique({ where: { key: 'confidenceThreshold' } }).catch(() => null);
        const configuredThreshold = Number.parseInt(thresholdSetting?.value || '', 10);
        const minimumSignalConfidence = Math.max(75, Number.isFinite(configuredThreshold) ? configuredThreshold : 78);
        const rawSignalCount = analysis.signals.length;
        analysis.signals = analysis.signals.filter((signal) => signal.confidence >= minimumSignalConfidence);
        if (rawSignalCount > analysis.signals.length) {
          analysis.summary += ` Saved only signals with confidence >= ${minimumSignalConfidence}%.`;
        }

        // Step 6: Save AI decision
        const method = usedFallback ? 'rule-based' : (analysis.modelName || 'huggingface-qwen3');
        const aiDecision = await db.aIDecision.create({
          data: {
            model: method,
            inputType: 'combined',
            inputData: JSON.stringify({ newsCount: newsResults.length, telegramCount: allPendingSignals.length, savedNewsCount: savedNews.length, searchFailed, usedFallback }).substring(0, 5000),
            output: JSON.stringify(analysis),
            action: analysis.marketSentiment === 'bullish' ? 'BUY' : analysis.marketSentiment === 'bearish' ? 'SELL' : 'HOLD',
            confidence: analysis.signals.length > 0 ? Math.max(...analysis.signals.map(s => s.confidence)) : 0,
          },
        });

        // Step 7: Create/update trade signals (with dedup)
        const createdSignals: unknown[] = [];
        for (const rawSig of analysis.signals) {
          try {
            const sig = await normalizeSignalWithLivePrice(rawSig);
            // Check if signal for this symbol already exists (dedup across ALL sources)
            const existing = await db.tradeSignal.findFirst({
              where: {
                symbol: sig.symbol.toUpperCase(),
                action: sig.action,
                status: 'pending',
                createdAt: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                },
              },
            });

            const sourceMultiplier = await getSourceConfidenceMultiplier('ai-news');
            const weightedConfidence = Math.min(90, Math.round(sig.confidence * sourceMultiplier));

            if (existing) {
              // Update existing signal with latest data instead of creating duplicate
              const updated = await db.tradeSignal.update({
                where: { id: existing.id },
                data: {
                  confidence: Math.max(existing.confidence, weightedConfidence),
                  entryPrice: sig.entryPrice,
                  targetPrice: sig.targetPrice ?? existing.targetPrice,
                  stopLoss: sig.stopLoss ?? existing.stopLoss,
                  reasoning: sig.reasoning || existing.reasoning,
                  source: 'ai-news',
                  modelName: method,
                  tradeType: existing.tradeType ?? inferTradeType({
                    symbol: sig.symbol,
                    source: 'ai-news',
                    text: sig.reasoning || newsText,
                  }),
                  sourceTimestamp: existing.sourceTimestamp ?? latestNewsTimestamp,
                  updatedAt: new Date(),
                },
              });
              console.log(`[AI API] Updated existing signal for ${sig.symbol} ${sig.action} (confidence: ${updated.confidence}%)`);
              createdSignals.push(updated);
              continue;
            }

            const signal = await db.tradeSignal.create({
              data: {
                symbol: sig.symbol.toUpperCase(),
                exchange: 'NSE',
                action: sig.action,
                source: 'ai-news',
                confidence: weightedConfidence,
                entryPrice: sig.entryPrice,
                targetPrice: sig.targetPrice,
                stopLoss: sig.stopLoss,
                quantity: 1,
                reasoning: sig.reasoning,
                status: 'pending',
                modelName: method,
                tradeType: inferTradeType({
                  symbol: sig.symbol,
                  source: 'ai-news',
                  text: sig.reasoning || newsText,
                }),
                sourceTimestamp: latestNewsTimestamp,
              },
            });

            await db.aIDecision.update({
              where: { id: aiDecision.id },
              data: { signalId: signal.id, symbol: sig.symbol },
            });

            createdSignals.push(signal);
          } catch (err) {
            console.error(`[AI API] Signal creation failed for ${rawSig.symbol}:`, err);
          }
        }

        // Step 7b: Auto-dedup — remove any remaining duplicate pending signals
        try {
          const pendingSignals = await db.tradeSignal.findMany({
            where: { status: 'pending' },
            orderBy: { createdAt: 'desc' },
          });
          const seen = new Map<string, string>();
          const idsToDelete: string[] = [];
          for (const s of pendingSignals) {
            const key = `${s.symbol}:${s.action}`;
            if (seen.has(key)) {
              idsToDelete.push(s.id);
            } else {
              seen.set(key, s.id);
            }
          }
          if (idsToDelete.length > 0) {
            await db.tradeSignal.deleteMany({ where: { id: { in: idsToDelete } } });
            console.log(`[AI API] Auto-dedup removed ${idsToDelete.length} duplicate signals`);
          }
        } catch (dedupErr) {
          console.error('[AI API] Auto-dedup failed:', dedupErr);
        }

        // Step 8: Save news items (only from live search results)
        for (const newsItem of newsResults.slice(0, 10)) {
          try {
            await db.newsItem.upsert({
              where: { id: `news-${Buffer.from(newsItem.url || Date.now().toString()).toString('base64').substring(0, 20)}` },
              create: {
                id: `news-${Buffer.from(newsItem.url || Date.now().toString()).toString('base64').substring(0, 20)}`,
                title: newsItem.name || 'Untitled',
                content: newsItem.snippet || '',
                source: newsItem.url || '',
                analyzed: true,
                aiSummary: analysis.summary,
                publishedAt: newsItem.date ? new Date(newsItem.date) : new Date(),
              },
              update: { analyzed: true, aiSummary: analysis.summary },
            });
          } catch {}
        }

        return NextResponse.json({
          success: true,
          sentiment: analysis.marketSentiment,
          summary: analysis.summary,
          signalsGenerated: createdSignals.length,
          signals: createdSignals,
          newsScanned: newsResults.length,
          savedNewsUsed: savedNews.length,
          telegramSignalsConsidered: allPendingSignals.length,
          searchFailed,
          usedFallback,
          aiDecisionId: aiDecision.id,
        });
      }

      // ─── Get Decisions Log ───────────────────────────────
      case 'decisions': {
        const limit = parseInt(body.limit || '20');
        const decisions = await db.aIDecision.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
        });
        return NextResponse.json({ decisions });
      }

      // ─── Check Rate Limit Status ─────────────────────────
      case 'rate-limit-status': {
        const limited = isRateLimited();
        const remaining = getRateLimitRemainingMs();
        return NextResponse.json({
          isRateLimited: limited,
          retryAfterSeconds: limited ? Math.ceil(remaining / 1000) : 0,
        });
      }

      // ─── Reset Rate Limit ──────────────────────────────
      case 'reset-rate-limit': {
        resetRateLimit();
        return NextResponse.json({ success: true, message: 'Rate limits cleared' });
      }

      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}. Valid: analyze-signals, decisions, rate-limit-status, reset-rate-limit` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[AI API] Error:', error);
    return NextResponse.json(
      { error: 'AI analysis failed', details: error.message },
      { status: 500 }
    );
  }
}

// GET /api/ai?action=decisions or rate-limit-status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (action === 'decisions') {
      const decisions = await db.aIDecision.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      return NextResponse.json({ decisions });
    }

    if (action === 'rate-limit-status') {
      const limited = isRateLimited();
      const remaining = getRateLimitRemainingMs();
      return NextResponse.json({
        isRateLimited: limited,
        retryAfterSeconds: limited ? Math.ceil(remaining / 1000) : 0,
      });
    }

    if (action === 'reset-rate-limit') {
      resetRateLimit();
      return NextResponse.json({ success: true, message: 'Rate limits cleared' });
    }

    return NextResponse.json({ error: 'Invalid action. Use: decisions, rate-limit-status, reset-rate-limit' }, { status: 400 });
  } catch (error: any) {
    console.error('[AI API] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
