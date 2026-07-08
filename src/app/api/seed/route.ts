import { NextResponse } from 'next/server';
import type { BotSetting, NewsItem, Position, TelegramChannel, TradeSignal, WatchlistItem } from '@prisma/client';
import { db } from '@/lib/db';

// POST /api/seed - Seed the database with realistic Indian market sample data
export async function POST() {
  try {
    // Clean existing data (order matters due to relations)
    await db.position.deleteMany();
    await db.tradeSignal.deleteMany();
    await db.aIDecision.deleteMany();
    await db.newsItem.deleteMany();
    await db.botSetting.deleteMany();
    await db.telegramChannel.deleteMany();
    await db.watchlistItem.deleteMany();

    // ─── 1. Watchlist Items (Top NIFTY50 stocks) ────────────────────────────
    const watchlistData = [
      { symbol: 'RELIANCE', exchange: 'NSE', name: 'Reliance Industries Ltd' },
      { symbol: 'TCS', exchange: 'NSE', name: 'Tata Consultancy Services Ltd' },
      { symbol: 'INFY', exchange: 'NSE', name: 'Infosys Ltd' },
      { symbol: 'HDFCBANK', exchange: 'NSE', name: 'HDFC Bank Ltd' },
      { symbol: 'ICICIBANK', exchange: 'NSE', name: 'ICICI Bank Ltd' },
      { symbol: 'HINDUNILVR', exchange: 'NSE', name: 'Hindustan Unilever Ltd' },
      { symbol: 'SBIN', exchange: 'NSE', name: 'State Bank of India' },
      { symbol: 'BHARTIARTL', exchange: 'NSE', name: 'Bharti Airtel Ltd' },
      { symbol: 'ITC', exchange: 'NSE', name: 'ITC Ltd' },
      { symbol: 'KOTAKBANK', exchange: 'NSE', name: 'Kotak Mahindra Bank Ltd' },
    ];

    const watchlistItems: WatchlistItem[] = [];
    for (const item of watchlistData) {
      watchlistItems.push(
        await db.watchlistItem.create({ data: item })
      );
    }

    // ─── 2. Trade Signals (6 sample signals) ────────────────────────────────
    const signalsData = [
      {
        symbol: 'RELIANCE',
        exchange: 'NSE',
        action: 'BUY',
        source: 'ai-news',
        confidence: 82,
        entryPrice: 2890,
        targetPrice: 3100,
        stopLoss: 2780,
        quantity: 10,
        reasoning: 'Strong momentum in Jio Platforms and retail business. Positive catalysts from new partnerships and expansion plans. Technical breakout above 2880 resistance level.',
        status: 'executed',
        modelName: 'zai-llm',
      },
      {
        symbol: 'TCS',
        exchange: 'NSE',
        action: 'BUY',
        source: 'ai-news',
        confidence: 75,
        entryPrice: 3820,
        targetPrice: 4050,
        stopLoss: 3700,
        quantity: 5,
        reasoning: 'Q4 results exceeded expectations with strong deal pipeline. Digital transformation spending accelerating across key markets.',
        status: 'executed',
        modelName: 'zai-llm',
      },
      {
        symbol: 'INFY',
        exchange: 'NSE',
        action: 'BUY',
        source: 'telegram',
        confidence: 68,
        entryPrice: 1520,
        targetPrice: 1620,
        stopLoss: 1470,
        quantity: 15,
        reasoning: 'Bullish chart pattern with increasing volumes. IT sector rotation expected. Support at 1480 levels.',
        status: 'executed',
        channelId: 'channel-1',
      },
      {
        symbol: 'HDFCBANK',
        exchange: 'NSE',
        action: 'BUY',
        source: 'ai-news',
        confidence: 78,
        entryPrice: 1620,
        targetPrice: 1780,
        stopLoss: 1550,
        quantity: 12,
        reasoning: 'Post-merger integration progressing well. NIM expected to improve. Strong retail loan growth trajectory. RBI rate cuts positive for banking sector.',
        status: 'pending',
        modelName: 'zai-llm',
      },
      {
        symbol: 'ICICIBANK',
        exchange: 'NSE',
        action: 'SELL',
        source: 'ai-technical',
        confidence: 62,
        entryPrice: 1240,
        targetPrice: 1150,
        stopLoss: 1290,
        quantity: 20,
        reasoning: 'Overbought on RSI with bearish divergence. Banking sector facing headwinds from rising NPAs. Resistance at 1260.',
        status: 'expired',
        modelName: 'zai-llm',
      },
      {
        symbol: 'SBIN',
        exchange: 'NSE',
        action: 'BUY',
        source: 'telegram',
        confidence: 71,
        entryPrice: 780,
        targetPrice: 850,
        stopLoss: 740,
        quantity: 25,
        reasoning: 'PSU bank rally continuation. Strong government push on capex. Improved asset quality trending. Breakout from consolidation.',
        status: 'closed',
        pnl: 1750,
        channelId: 'channel-2',
      },
    ];

    const signals: TradeSignal[] = [];
    for (const data of signalsData) {
      signals.push(
        await db.tradeSignal.create({ data })
      );
    }

    // ─── 3. Open Positions (4 realistic positions) ──────────────────────────
    const positionsData = [
      {
        symbol: 'RELIANCE',
        exchange: 'NSE',
        action: 'BUY',
        quantity: 10,
        entryPrice: 2890,
        currentPrice: 2925,
        pnl: 350,
        pnlPercent: 1.21,
        status: 'open',
        signalId: signals[0].id,
      },
      {
        symbol: 'TCS',
        exchange: 'NSE',
        action: 'BUY',
        quantity: 5,
        entryPrice: 3820,
        currentPrice: 3780,
        pnl: -200,
        pnlPercent: -1.05,
        status: 'open',
        signalId: signals[1].id,
      },
      {
        symbol: 'INFY',
        exchange: 'NSE',
        action: 'BUY',
        quantity: 15,
        entryPrice: 1520,
        currentPrice: 1555,
        pnl: 525,
        pnlPercent: 2.3,
        status: 'open',
        signalId: signals[2].id,
      },
      {
        symbol: 'HDFCBANK',
        exchange: 'NSE',
        action: 'BUY',
        quantity: 12,
        entryPrice: 1620,
        currentPrice: 1595,
        pnl: -300,
        pnlPercent: -1.54,
        status: 'open',
        signalId: null,
      },
    ];

    const positions: Position[] = [];
    for (const data of positionsData) {
      positions.push(
        await db.position.create({ data })
      );
    }

    // ─── 4. News Items (5 Indian market news) ──────────────────────────────
    const newsData = [
      {
        title: 'RBI Maintains Repo Rate at 6.5%, Signals Easing Bias Ahead',
        content: 'The Reserve Bank of India kept the benchmark repo rate unchanged at 6.5% for the eighth consecutive meeting but indicated a shift towards a more accommodative stance as inflation moderates. Governor Shaktikanta Das highlighted that food inflation is expected to ease in coming months, potentially opening room for rate cuts.',
        source: 'https://economictimes.indiatimes.com',
        sentiment: 'positive',
        sentimentScore: 0.6,
        relatedSymbols: 'HDFCBANK,ICICIBANK,SBIN,KOTAKBANK',
        analyzed: true,
        aiSummary: 'RBI rate hold with easing bias is positive for banking stocks and rate-sensitive sectors. Expect buying interest in banking and real estate.',
        publishedAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
      {
        title: 'Reliance Jio Reports 25% Jump in ARPU, Net Adds 8.5M Subscribers',
        content: 'Reliance Jio reported a strong quarter with Average Revenue Per User jumping 25% to ₹195.8, driven by tariff hikes implemented in July. The telecom arm added 8.5 million new subscribers, strengthening its market leadership. JioBharat phone launch expected to drive next wave of subscriber growth in rural markets.',
        source: 'https://www.livemint.com',
        sentiment: 'positive',
        sentimentScore: 0.75,
        relatedSymbols: 'RELIANCE,BHARTIARTL',
        analyzed: true,
        aiSummary: 'Jio strong ARPU growth and subscriber additions very positive for Reliance. Tariff hike benefits materializing faster than expected.',
        publishedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      },
      {
        title: 'IT Sector Faces Headwinds as US Tech Spending Slowdown Deepens',
        content: 'Indian IT companies are facing growing headwinds as US enterprise technology spending continues to decelerate. Multiple large deals are being renegotiated or delayed, impacting revenue visibility for TCS, Infosys, and Wipro. However, AI and cloud transformation spending remains a bright spot.',
        source: 'https://www.thehindubusinessline.com',
        sentiment: 'negative',
        sentimentScore: -0.45,
        relatedSymbols: 'TCS,INFY,WIPRO,HCLTECH',
        analyzed: true,
        aiSummary: 'Mixed outlook for IT sector. Traditional deal pipeline weakening but AI/cloud opportunities growing. Selective approach recommended.',
        publishedAt: new Date(Date.now() - 6 * 60 * 60 * 1000),
      },
      {
        title: 'NIFTY 50 Hits All-Time High of 24,800 on FII Buying Spree',
        content: 'The NIFTY 50 index surged to a record high of 24,800 driven by massive foreign institutional investor (FII) inflows of ₹8,500 crore in a single session. Banking, auto, and capital goods sectors led the rally. Market breadth remained strong with 1,450 advances versus 550 declines on the NSE.',
        source: 'https://www.moneycontrol.com',
        sentiment: 'positive',
        sentimentScore: 0.85,
        relatedSymbols: 'RELIANCE,HDFCBANK,ICICIBANK,SBIN,MARUTI,L&T',
        analyzed: true,
        aiSummary: 'Strong bullish momentum with broad market participation. FII flows very positive. Expect continuation with potential minor pullbacks.',
        publishedAt: new Date(Date.now() - 8 * 60 * 60 * 1000),
      },
      {
        title: 'Crude Oil Prices Surge 5% on OPEC+ Production Cut Extension',
        content: 'Brent crude oil prices surged past $85 per barrel after OPEC+ agreed to extend production cuts through Q2 2024. This is negative for oil-importing India, increasing the current account deficit risk and putting pressure on the rupee. FMCG and paint companies may face margin pressures from higher input costs.',
        source: 'https://www.businesstoday.in',
        sentiment: 'negative',
        sentimentScore: -0.55,
        relatedSymbols: 'HINDUNILVR,ITC,BPCL,IOC',
        analyzed: true,
        aiSummary: 'Rising crude oil negative for Indian economy. Expect pressure on oil marketing companies and input cost-sensitive sectors. OMCs may see subsidy concerns.',
        publishedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
      },
    ];

    const newsItems: NewsItem[] = [];
    for (const data of newsData) {
      newsItems.push(
        await db.newsItem.create({ data })
      );
    }

    // ─── 5. Bot Settings (Defaults) ────────────────────────────────────────
    const settingsData = [
      { key: 'botName', value: 'AI Trading Bot' },
      { key: 'defaultExchange', value: 'NSE' },
      { key: 'riskPerTrade', value: '2' },
      { key: 'maxOpenPositions', value: '10' },
      { key: 'confidenceThreshold', value: '60' },
      { key: 'autoExecuteSignals', value: 'false' },
      { key: 'newsScanInterval', value: '30' },
      { key: 'telegramMonitorEnabled', value: 'true' },
      { key: 'stopLossDefault', value: '3' },
      { key: 'targetDefault', value: '5' },
    ];

    const settings: BotSetting[] = [];
    for (const data of settingsData) {
      settings.push(
        await db.botSetting.create({ data })
      );
    }

    // ─── 6. Telegram Channels ──────────────────────────────────────────────
    const channelsData = [
      {
        name: 'Nifty Traders Hub',
        channelId: '@niftytradershub',
        isActive: true,
      },
      {
        name: 'Stock Market Signals India',
        channelId: '@stocksignalsindia',
        isActive: true,
      },
    ];

    const channels: TelegramChannel[] = [];
    for (const data of channelsData) {
      channels.push(
        await db.telegramChannel.create({ data })
      );
    }

    return NextResponse.json({
      message: 'Database seeded successfully',
      data: {
        watchlist: watchlistItems.length,
        signals: signals.length,
        positions: positions.length,
        news: newsItems.length,
        settings: settings.length,
        channels: channels.length,
      },
    });
  } catch (error) {
    console.error('Error seeding database:', error);
    return NextResponse.json(
      { error: 'Failed to seed database', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
