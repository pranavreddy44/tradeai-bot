import { NextResponse } from 'next/server';
import type { NewsItem } from '@prisma/client';
import { db } from '@/lib/db';
import { searchMarketNews, analyzeNewsSentiment } from '@/lib/ai-engine';
import { inferTradeType, parseSourceTimestamp } from '@/lib/trade-classification';
import { getGrowwLivePrice } from '@/lib/broker/live-prices';
import { evaluateTradeQuality, formatTradeQualityReason } from '@/lib/trade-quality';

// POST /api/news/auto-scan - Automated news scan for AI trading engine
// Called periodically during market hours to fetch fresh news and generate signals
// OPTIMIZED: Single search + batch processing with multi-model fallback
export async function POST() {
  try {
    // Don't pre-block on rate limits — each function has multi-model retry + fallbacks
    const now = new Date();
    const istHour = (now.getUTCHours() + 5) % 24;
    const isMarketHours = istHour >= 9 && istHour < 16;

    // Use a SINGLE search query instead of 4 to reduce API calls
    const query = isMarketHours
      ? 'Indian stock market NSE BSE breaking news today'
      : 'Indian stock market news after hours analysis';

    let totalNew = 0;
    let totalSignals = 0;
    const newItems: NewsItem[] = [];

    try {
      const searchResults = await searchMarketNews(query);

      if (!searchResults || searchResults.length === 0) {
        return NextResponse.json({
          success: true,
          timestamp: now.toISOString(),
          isMarketHours,
          totalNew: 0,
          totalSignals: 0,
          newItems: [],
        });
      }

      // Process at most 5 items — sentiment analysis has multi-model fallback
      for (const item of searchResults.slice(0, 5)) {

        try {
          // Skip if we already have this news
          const existing = await db.newsItem.findFirst({
            where: { source: item.url },
          });

          if (existing) continue;

          // Analyze sentiment (single AI call per item)
          const sentimentResult = await analyzeNewsSentiment(
            item.name,
            item.snippet
          );

          const newsItem = await db.newsItem.create({
            data: {
              title: item.name,
              content: item.snippet,
              source: item.url,
              sentiment: sentimentResult.sentiment,
              sentimentScore: sentimentResult.sentimentScore,
              relatedSymbols: sentimentResult.relatedSymbols.join(','),
              analyzed: true,
              aiSummary: sentimentResult.summary,
              publishedAt: parseSourceTimestamp(item.date) || new Date(),
            },
          });

          newItems.push(newsItem);
          totalNew++;

          // ── Momentum Event Detection ──────────────────────────────────────
          const { detectMomentumEvent, extractSymbolsFromNewsText } = await import('@/lib/news/momentum-filter');
          const { getSourceConfidenceMultiplier } = await import('@/lib/signals/source-performance');

          const momentumEvent = detectMomentumEvent(item.name, item.snippet);

          if (momentumEvent && sentimentResult.relatedSymbols.length > 0) {
            const allSymbols = extractSymbolsFromNewsText(
              `${item.name} ${item.snippet}`,
              sentimentResult.relatedSymbols
            );

            for (const symbol of allSymbols.slice(0, 2)) {
              try {
                const livePrice = await getGrowwLivePrice(symbol);
                if (!livePrice || livePrice <= 0) {
                  console.log(`[NewsAutoScan] Skipped ${symbol}: no verified live Groww price available`);
                  continue;
                }

                const entryPrice = Math.round(livePrice * 100) / 100;
                const targetPrice = momentumEvent.action === 'BUY'
                  ? Math.round(entryPrice * 1.05 * 100) / 100
                  : Math.round(entryPrice * 0.95 * 100) / 100;
                const stopLoss = momentumEvent.action === 'BUY'
                  ? Math.round(entryPrice * 0.97 * 100) / 100
                  : Math.round(entryPrice * 1.03 * 100) / 100;

                const sourceMultiplier = await getSourceConfidenceMultiplier('ai-news');
                const baseConfidence = 55 + momentumEvent.confidenceBoost;
                const confidence = Math.min(90, Math.round(baseConfidence * sourceMultiplier));

                const tradeType = 'SWING';
                const sourceTimestamp = parseSourceTimestamp(item.date) || new Date();

                // Check for duplicate pending signal
                const existingSignal = await db.tradeSignal.findFirst({
                  where: {
                    symbol: symbol.toUpperCase(),
                    action: momentumEvent.action,
                    status: 'pending',
                    createdAt: {
                      gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    },
                  },
                });

                const reasoning = `[${momentumEvent.type.replace(/-/g, ' ').toUpperCase()}] ${item.name}. ${sentimentResult.summary || ''} Entry near CMP ₹${livePrice.toFixed(2)}.`;

                if (existingSignal) {
                  if (confidence > existingSignal.confidence) {
                    await db.tradeSignal.update({
                      where: { id: existingSignal.id },
                      data: {
                        confidence,
                        entryPrice,
                        targetPrice,
                        stopLoss,
                        reasoning,
                        source: 'ai-news',
                        tradeType,
                        sourceTimestamp,
                        updatedAt: new Date(),
                      },
                    });
                  }
                  continue;
                }

                await db.tradeSignal.create({
                  data: {
                    symbol: symbol.toUpperCase(),
                    exchange: 'NSE',
                    action: momentumEvent.action,
                    source: 'ai-news',
                    confidence,
                    entryPrice,
                    targetPrice,
                    stopLoss,
                    quantity: 1,
                    reasoning,
                    status: 'pending',
                    modelName: 'momentum-event-filter',
                    tradeType,
                    sourceTimestamp,
                    postUrl: item.url,
                  },
                });
                totalSignals++;
              } catch (signalErr) {
                console.error('Failed to create signal from news:', signalErr);
              }
            }
          }
        } catch (itemErr) {
          console.error('Failed to process news item:', itemErr);
        }
      }
    } catch (queryErr) {
      console.error('Failed search query:', queryErr);
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      isMarketHours,
      totalNew,
      totalSignals,
      newItems: newItems.slice(0, 5),
    });
  } catch (error) {
    console.error('Auto-scan error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
