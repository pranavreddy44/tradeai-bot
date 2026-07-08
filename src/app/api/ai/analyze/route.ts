import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  analyzeNewsForSignals,
  searchMarketNews,
  type AIAnalysisResult,
} from '@/lib/ai-engine';
import { normalizeSignalWithLivePrice } from '@/lib/broker/live-prices';
import { inferTradeType, parseSourceTimestamp } from '@/lib/trade-classification';

// POST /api/ai/analyze - Trigger AI analysis of market news
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const customQuery = body.query || 'Indian stock market NSE BSE news today';

    // Step 1: Search for Indian market news
    const newsResults = await searchMarketNews(customQuery);

    if (!newsResults || newsResults.length === 0) {
      return NextResponse.json(
        { error: 'No news results found', signals: [], summary: 'No market news available' },
        { status: 200 }
      );
    }

    // Step 2: Get watchlist from DB
    const watchlist = await db.watchlistItem.findMany();
    const watchlistSymbols = watchlist.map((w) => w.symbol);

    // If no watchlist, use default NIFTY50 symbols
    const symbols =
      watchlistSymbols.length > 0
        ? watchlistSymbols
        : [
            'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
            'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK',
          ];

    // Step 3: Prepare news text for AI analysis
    const newsText = newsResults
      .map((n, i) => `${i + 1}. ${n.name}: ${n.snippet}`)
      .join('\n\n');

    // Step 4: Analyze with LLM
    const analysis: AIAnalysisResult = await analyzeNewsForSignals(symbols, newsText);
    const thresholdSetting = await db.botSetting.findUnique({ where: { key: 'confidenceThreshold' } }).catch(() => null);
    const configuredThreshold = Number.parseInt(thresholdSetting?.value || '', 10);
    const minimumSignalConfidence = Math.max(75, Number.isFinite(configuredThreshold) ? configuredThreshold : 78);
    const rawSignalCount = analysis.signals.length;
    analysis.signals = analysis.signals.filter((signal) => signal.confidence >= minimumSignalConfidence);
    if (rawSignalCount > analysis.signals.length) {
      analysis.summary += ` Saved only signals with confidence >= ${minimumSignalConfidence}%.`;
    }

    const method = analysis.modelName || 'huggingface-qwen3';

    // Step 5: Save AI decision
    const aiDecision = await db.aIDecision.create({
      data: {
        model: method,
        inputType: 'news',
        inputData: newsText.substring(0, 5000), // Limit stored input size
        output: JSON.stringify(analysis),
        action: analysis.marketSentiment === 'bullish' ? 'BUY' : analysis.marketSentiment === 'bearish' ? 'SELL' : 'HOLD',
        confidence: analysis.signals.length > 0 ? Math.max(...analysis.signals.map((s) => s.confidence)) : 0,
      },
    });

    // Step 6: Create trade signals for each generated signal
    const createdSignals: unknown[] = [];
    for (const rawSig of analysis.signals) {
      try {
        const sig = await normalizeSignalWithLivePrice(rawSig);
        const sourceTimestamp = parseSourceTimestamp(newsResults[0]?.date);
        const signal = await db.tradeSignal.create({
          data: {
            symbol: sig.symbol.toUpperCase(),
            exchange: 'NSE',
            action: sig.action,
            source: 'ai-news',
            confidence: sig.confidence,
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
            sourceTimestamp,
          },
        });

        // Update AI decision with signal reference
        await db.aIDecision.update({
          where: { id: aiDecision.id },
          data: { signalId: signal.id, symbol: sig.symbol },
        });

        createdSignals.push(signal);
      } catch (err) {
        console.error(`Failed to create signal for ${rawSig.symbol}:`, err);
      }
    }

    // Step 7: Save news items to DB
    for (const newsItem of newsResults.slice(0, 10)) {
      try {
        await db.newsItem.upsert({
          where: { id: `news-${Buffer.from(newsItem.url).toString('base64').substring(0, 20)}` },
          create: {
            id: `news-${Buffer.from(newsItem.url).toString('base64').substring(0, 20)}`,
            title: newsItem.name,
            content: newsItem.snippet,
            source: newsItem.url,
            analyzed: true,
            aiSummary: analysis.summary,
            publishedAt: newsItem.date ? new Date(newsItem.date) : new Date(),
          },
          update: {
            analyzed: true,
            aiSummary: analysis.summary,
          },
        });
      } catch (err) {
        console.error('Failed to save news item:', err);
      }
    }

    return NextResponse.json({
      analysis: {
        marketSentiment: analysis.marketSentiment,
        summary: analysis.summary,
        signalsGenerated: createdSignals.length,
      },
      signals: createdSignals,
      aiDecisionId: aiDecision.id,
      newsScanned: newsResults.length,
    });
  } catch (error) {
    console.error('Error in AI analysis:', error);
    return NextResponse.json(
      { error: 'AI analysis failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
