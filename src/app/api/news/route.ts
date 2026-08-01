import { NextRequest, NextResponse } from 'next/server';
import type { NewsItem } from '@prisma/client';
import { db } from '@/lib/db';
import { searchMarketNews, analyzeNewsSentiment } from '@/lib/ai-engine';
import { parseSourceTimestamp } from '@/lib/trade-classification';

// GET /api/news - List news items with sentiment
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sentiment = searchParams.get('sentiment');
    const analyzed = searchParams.get('analyzed');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = {};
    if (sentiment) where.sentiment = sentiment;
    if (analyzed !== null) where.analyzed = analyzed === 'true';

    const [news, total] = await Promise.all([
      db.newsItem.findMany({
        where,
        orderBy: { publishedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      db.newsItem.count({ where }),
    ]);

    return NextResponse.json({ news, total, limit, offset });
  } catch (error) {
    console.error('Error fetching news:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news' },
      { status: 500 }
    );
  }
}

// DELETE /api/news - Delete news items
// ?clearAll=true  → delete ALL news items
// ?id=xxx         → delete a single news item by ID
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const clearAll = searchParams.get('clearAll');
    const id = searchParams.get('id');

    if (clearAll === 'true') {
      const result = await db.newsItem.deleteMany({});
      return NextResponse.json({ success: true, deleted: result.count });
    }

    if (id) {
      const existing = await db.newsItem.findUnique({ where: { id } });
      if (!existing) {
        return NextResponse.json(
          { error: 'News item not found' },
          { status: 404 }
        );
      }
      await db.newsItem.delete({ where: { id } });
      return NextResponse.json({ success: true, deleted: 1 });
    }

    return NextResponse.json(
      { error: 'Provide ?clearAll=true or ?id=xxx' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error deleting news:', error);
    return NextResponse.json(
      { error: 'Failed to delete news' },
      { status: 500 }
    );
  }
}

// POST /api/news - Scan for new news using web search, analyze with AI, save to DB
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = body.query || 'Indian stock market NSE BSE earnings results order win breakout today';

    // Step 1: Search for news
    const searchResults = await searchMarketNews(query);

    if (!searchResults || searchResults.length === 0) {
      return NextResponse.json(
        { message: 'No news found', itemsSaved: 0, signalsCreated: 0 },
        { status: 200 }
      );
    }

    // Import momentum filter and source confidence weighting
    const { detectMomentumEvent, extractSymbolsFromNewsText } = await import('@/lib/news/momentum-filter');
    const { getSourceConfidenceMultiplier } = await import('@/lib/signals/source-performance');
    const { getLivePrice } = await import('@/lib/broker/live-prices');

    // Step 2: Analyze and save each news item
    const savedItems: NewsItem[] = [];
    let signalsCreated = 0;

    for (const item of searchResults.slice(0, 10)) {
      try {
        // Check if we already have this news (by URL)
        const existing = await db.newsItem.findFirst({
          where: { source: item.url },
        });

        if (existing) {
          savedItems.push(existing);
          continue;
        }

        // Analyze sentiment with AI
        const sentimentResult = await analyzeNewsSentiment(
          item.name,
          item.snippet
        );

        // ── Momentum Event Detection ──────────────────────────────────────
        const momentumEvent = detectMomentumEvent(item.name, item.snippet);

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

        savedItems.push(newsItem);

        // ── Create Trade Signal if momentum event detected ────────────────
        if (momentumEvent) {
          const allSymbols = extractSymbolsFromNewsText(
            `${item.name} ${item.snippet}`,
            sentimentResult.relatedSymbols
          );

          for (const symbol of allSymbols.slice(0, 3)) {
            try {
              // Get live price for entry
              const livePrice = await getLivePrice(symbol);
              if (!livePrice || livePrice <= 0) continue;

              // Compute confidence: base 55 + momentum boost + source multiplier
              const sourceMultiplier = await getSourceConfidenceMultiplier('ai-news');
              const baseConfidence = 55 + momentumEvent.confidenceBoost;
              const confidence = Math.min(90, Math.round(baseConfidence * sourceMultiplier));

              // Only create if not already exists in last 6 hours
              const recentSignal = await db.tradeSignal.findFirst({
                where: {
                  symbol: symbol.toUpperCase(),
                  action: momentumEvent.action,
                  source: { startsWith: 'ai-news' },
                  createdAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
                },
              });

              if (!recentSignal) {
                const target = momentumEvent.action === 'BUY'
                  ? livePrice * 1.05
                  : livePrice * 0.95;
                const sl = momentumEvent.action === 'BUY'
                  ? livePrice * 0.97
                  : livePrice * 1.03;

                const reasoning = `[${momentumEvent.type.replace(/-/g, ' ').toUpperCase()}] ${item.name}. ${sentimentResult.summary || ''} Entry near CMP ₹${livePrice.toFixed(2)}.`;

                await db.tradeSignal.create({
                  data: {
                    symbol: symbol.toUpperCase(),
                    exchange: 'NSE',
                    action: momentumEvent.action,
                    source: 'ai-news',
                    confidence,
                    entryPrice: livePrice,
                    targetPrice: parseFloat(target.toFixed(2)),
                    stopLoss: parseFloat(sl.toFixed(2)),
                    quantity: 1,
                    reasoning,
                    status: 'pending',
                    tradeType: 'SWING',
                    sourceTimestamp: newsItem.publishedAt ?? new Date(),
                    postUrl: item.url,
                  },
                });

                signalsCreated++;
                console.log(`[News] Created ${momentumEvent.action} signal for ${symbol} (${momentumEvent.type}) conf=${confidence}`);
              }
            } catch (err) {
              console.error(`[News] Failed to create signal for ${symbol}:`, err);
            }
          }
        }
      } catch (err) {
        console.error(`Failed to process news item "${item.name}":`, err);
      }
    }

    return NextResponse.json({
      message: 'News scan completed',
      itemsSaved: savedItems.length,
      signalsCreated,
      news: savedItems,
    });
  } catch (error) {
    console.error('Error scanning news:', error);
    return NextResponse.json(
      { error: 'News scan failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

