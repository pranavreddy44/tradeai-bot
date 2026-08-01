import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  searchMarketNews,
  searchNewsViaOmniRoute,
  analyzeNewsSentiment,
  searchNewsViaPageReader,
  searchNewsViaRSS,
  getConfiguredAIProvider,
  type AISignalOutput,
  type SentimentResult,
} from '@/lib/ai-engine';
import { normalizeSignalWithLivePrice, getLivePrice } from '@/lib/broker/live-prices';
import { inferTradeType, parseSourceTimestamp } from '@/lib/trade-classification';
import type { SearchFunctionResultItem } from 'z-ai-web-dev-sdk';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScanResult {
  totalScanned: number;
  newItemsSaved: number;
  duplicatesSkipped: number;
  errors: number;
  signalsCreated: number;
  news: ScanNewsItem[];
  queryResults: Record<string, number>;
  sourceMode: 'rss-first' | 'combined' | 'existing-db';
  warning?: string;
}

interface ScanNewsItem {
  id: string;
  title: string;
  content: string | null;
  source: string;
  sentiment: string | null;
  sentimentScore: number | null;
  relatedSymbols: string | null;
  analyzed: boolean;
  aiSummary: string | null;
  publishedAt: string | null;
  createdAt: string;
}

type SourceBatch = {
  source: string;
  items: SearchFunctionResultItem[];
  error?: string | null;
};

// ─── Search and Ranking Configuration ────────────────────────────────────────

const DEFAULT_QUERIES = [
  'India NSE stock earnings results order wins brokerage target today',
  'Indian stock market block deals bulk deals promoter pledge dividend bonus split today',
  'Nifty Bank Nifty sector rotation FII DII stocks in news today',
  'NSE stocks breakout upgrade downgrade results guidance contract win today',
];

const HIGH_VALUE_CATALYSTS = [
  'brokerage', 'target price', 'upgrade', 'downgrade', 'initiates coverage',
  'q1', 'q2', 'q3', 'q4', 'quarterly results', 'earnings', 'profit',
  'revenue', 'margin', 'guidance', 'order win', 'contract', 'tender',
  'merger', 'acquisition', 'stake sale', 'fundraise', 'capex', 'approval',
  'rbi approval', 'sebi approval', 'usfda', 'block deal', 'bulk deal',
  'promoter', 'pledge', 'dividend', 'bonus', 'split', 'buyback',
  'rights issue', 'listing', 'ipo', 'upper circuit', 'lower circuit',
  'breakout', 'support', 'resistance', 'volume', '52-week high',
];

const TRADING_NEWS_KEYWORDS = [
  'nse', 'bse', 'nifty', 'bank nifty', 'sensex', 'stock', 'stocks', 'share',
  'shares', 'market', 'brokerage', 'target price', 'rating', 'upgrade',
  'downgrade', 'buy', 'sell', 'hold', 'earnings', 'results', 'quarter',
  'profit', 'revenue', 'margin', 'order win', 'dividend', 'bonus', 'split',
  'block deal', 'bulk deal', 'fii', 'dii', 'ipo', 'listing', 'breakout',
  'support', 'resistance', 'sector', 'banking', 'auto', 'pharma', 'it',
  'metal', 'energy', 'psu', 'realty', 'cement', ...HIGH_VALUE_CATALYSTS,
];

const LOW_VALUE_NEWS_KEYWORDS = [
  'celebrity', 'bollywood', 'cricket', 'recipe', 'astrology', 'lifestyle',
  'education', 'jobs', 'viral', 'photo', 'video', 'explained: how to watch',
  'crypto', 'bitcoin', 'ethereum', 'spacex', 'nasdaq', 'dow jones',
  'quote of the day', 'benjamin graham', 'warren buffett quote',
];

const GENERIC_MARKET_WRAP_PATTERNS = [
  /sensex (?:opens|ends|closes)/i,
  /nifty (?:opens|ends|closes)/i,
  /market (?:opens|ends|closes) (?:flat|higher|lower)/i,
  /asian markets|wall street|global markets/i,
  /gold price|crude oil|rupee (?:opens|closes|falls|rises)/i,
];

const TRUSTED_MARKET_HOSTS =
  /moneycontrol|economictimes|business-standard|thehindubusinessline|livemint|businesstoday|business today|cnbctv18|ndtvprofit|nseindia|bseindia|scanx\.trade/i;

const INDIAN_MARKET_CONTEXT =
  /\b(india|indian|nse|bse|nifty|bank nifty|sensex|sebi|rbi|fii|dii|rupee|dalal street|mumbai|fy\d{2}|q[1-4]fy\d{2}|lakh|crore)\b|₹/i;

const FOREIGN_MARKET_CONTEXT =
  /\b(us stocks?|u\.s\. stocks?|us-stocks|nasdaq|nyse|dow jones|s&p 500|wall street|american stock|hlse:|tsx:|lse:|asx:|otc:|ipo in us|us ipo)\b/i;

const COMPANY_ALIASES: Record<string, string> = {
  'hdfc bank': 'HDFCBANK',
  hdfc: 'HDFCBANK',
  'icici bank': 'ICICIBANK',
  'state bank of india': 'SBIN',
  sbi: 'SBIN',
  'itc': 'ITC',
  'reliance industries': 'RELIANCE',
  reliance: 'RELIANCE',
  'tata consultancy services': 'TCS',
  infosys: 'INFY',
  'interglobe aviation': 'INDIGO',
  indigo: 'INDIGO',
  'premier explosives': 'PREMEXPLN',
  'premier explosives limited': 'PREMEXPLN',
  'ltimindtree': 'LTIM',
  'larsen & toubro': 'LT',
  'larsen and toubro': 'LT',
  'elecon engineering': 'ELECON',
  'jtl industries': 'JTLIND',
  'ncc': 'NCC',
  'nlc india': 'NLCINDIA',
  'titagarh': 'TITAGARH',
  'hcc': 'HCC',
  'thomas cook': 'THOMASCOOK',
  'nr b bearing': 'NRBBEARING',
  'paisalo': 'PAISALO',
  'gandhar oil': 'GANDHAR',
};

const MIN_SIGNAL_SENTIMENT = 0.55;

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function sourceKey(item: SearchFunctionResultItem): string {
  const url = item.url?.trim();
  if (url) return url.replace(/[?#].*$/, '');
  return `${item.name || ''}::${item.snippet || ''}`.toLowerCase();
}

function addDeduped(
  target: SearchFunctionResultItem[],
  seen: Set<string>,
  items: SearchFunctionResultItem[],
  sourceLabel: string
) {
  for (const item of items) {
    const key = sourceKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    target.push({
      ...item,
      host_name: item.host_name || sourceLabel,
    });
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T, label: string): Promise<T> {
  const safePromise = promise.catch((e) => {
    console.error(`[News Scan] Error in ${label}:`, e);
    return fallback;
  });
  return Promise.race([
    safePromise,
    new Promise<T>((resolve) =>
      setTimeout(() => {
        console.warn(`[News Scan] ${label} timed out after ${ms / 1000}s`);
        resolve(fallback);
      }, ms)
    ),
  ]);
}

function hasCompanyOrSymbol(text: string): boolean {
  return /\b(reliance|tcs|infosys|hdfc|icici|sbi|itc|maruti|tata|vedanta|adani|bajaj|axis|kotak|bharti|elecon|jtl|ncc|hcc|titagarh|suzlon|data patterns|ifb industries|sakar healthcare)\b/i.test(text);
}

function hasActionableCatalyst(item: SearchFunctionResultItem): boolean {
  const text = normalizeText(`${item.name || ''} ${item.snippet || ''}`);
  return HIGH_VALUE_CATALYSTS.some((keyword) => text.includes(keyword));
}

function hasIndianMarketFocus(item: SearchFunctionResultItem): boolean {
  const text = `${item.name || ''} ${item.snippet || ''} ${item.host_name || ''}`;
  const hasIndianContext = INDIAN_MARKET_CONTEXT.test(text) || TRUSTED_MARKET_HOSTS.test(text);
  const hasForeignContext = FOREIGN_MARKET_CONTEXT.test(text);
  return hasIndianContext && (!hasForeignContext || INDIAN_MARKET_CONTEXT.test(text));
}

function extractAliasSymbols(title: string, content: string): string[] {
  const text = normalizeText(`${title} ${content}`);
  const symbols = new Set<string>();
  for (const [alias, symbol] of Object.entries(COMPANY_ALIASES)) {
    const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text)) {
      symbols.add(symbol);
    }
  }
  return [...symbols];
}

function mergeSymbols(sentiment: SentimentResult, title: string, content: string): string[] {
  const symbols = new Set<string>();
  for (const symbol of sentiment.relatedSymbols || []) {
    const clean = symbol.trim().toUpperCase();
    if (clean) symbols.add(clean);
  }
  for (const symbol of extractAliasSymbols(title, content)) {
    symbols.add(symbol);
  }
  return [...symbols].slice(0, 5);
}

function scoreNewsItem(item: SearchFunctionResultItem): number {
  const text = `${item.name || ''} ${item.snippet || ''} ${item.host_name || ''}`.toLowerCase();
  const bodyText = `${item.name || ''} ${item.snippet || ''}`.toLowerCase();
  let score = 0;

  for (const keyword of TRADING_NEWS_KEYWORDS) {
    if (bodyText.includes(keyword)) score += keyword.includes(' ') ? 8 : 5;
  }
  for (const keyword of HIGH_VALUE_CATALYSTS) {
    if (bodyText.includes(keyword)) score += 10;
  }
  for (const keyword of LOW_VALUE_NEWS_KEYWORDS) {
    if (bodyText.includes(keyword)) score -= 35;
  }
  for (const pattern of GENERIC_MARKET_WRAP_PATTERNS) {
    if (pattern.test(bodyText) && !hasActionableCatalyst(item) && !hasCompanyOrSymbol(bodyText)) {
      score -= 18;
    }
  }

  if (!hasIndianMarketFocus(item)) score -= 45;
  if (FOREIGN_MARKET_CONTEXT.test(bodyText) && !INDIAN_MARKET_CONTEXT.test(bodyText)) score -= 60;
  if (TRUSTED_MARKET_HOSTS.test(text)) score += 12;
  if (hasCompanyOrSymbol(`${item.name || ''} ${item.snippet || ''}`)) score += 8;

  if (item.date) {
    const parsedDate = parseSourceTimestamp(item.date);
    const ageMs = parsedDate ? Date.now() - parsedDate.getTime() : NaN;
    if (!Number.isNaN(ageMs)) {
      if (ageMs <= 3 * 60 * 60 * 1000) score += 16;
      else if (ageMs <= 12 * 60 * 60 * 1000) score += 12;
      else if (ageMs <= 24 * 60 * 60 * 1000) score += 8;
      else if (ageMs <= 3 * 24 * 60 * 60 * 1000) score += 4;
    }
  }

  return score;
}

function hasStrongTradingContext(item: SearchFunctionResultItem): boolean {
  const bodyText = `${item.name || ''} ${item.snippet || ''}`.toLowerCase();
  return /\b(nse|bse|nifty|bank nifty|sensex|stock|stocks|share|shares|brokerage|target price|upgrade|downgrade|earnings|results|profit|revenue|margin|order win|contract|block deal|bulk deal|fii|dii|ipo|listing|dividend|bonus|split|buyback|breakout|support|resistance)\b/.test(bodyText);
}

function rankMarketNews(items: SearchFunctionResultItem[]): SearchFunctionResultItem[] {
  return items
    .map(item => ({ item, score: scoreNewsItem(item) }))
    .filter(({ item, score }) => score >= 18 && hasStrongTradingContext(item) && hasIndianMarketFocus(item))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.item.rank || 999) - (b.item.rank || 999);
    })
    .map(({ item }) => item);
}

function toScanNewsItem(newsItem: {
  id: string;
  title: string;
  content: string | null;
  source: string;
  sentiment: string | null;
  sentimentScore: number | null;
  relatedSymbols: string | null;
  analyzed: boolean;
  aiSummary: string | null;
  publishedAt: Date | null;
  createdAt: Date;
}): ScanNewsItem {
  return {
    id: newsItem.id,
    title: newsItem.title,
    content: newsItem.content,
    source: newsItem.source,
    sentiment: newsItem.sentiment,
    sentimentScore: newsItem.sentimentScore,
    relatedSymbols: newsItem.relatedSymbols,
    analyzed: newsItem.analyzed,
    aiSummary: newsItem.aiSummary,
    publishedAt: newsItem.publishedAt?.toISOString() ?? null,
    createdAt: newsItem.createdAt.toISOString(),
  };
}

async function maybeCreateSignalFromNews(
  item: SearchFunctionResultItem,
  sentiment: SentimentResult,
  symbols: string[]
): Promise<boolean> {
  const { detectMomentumEvent } = await import('@/lib/news/momentum-filter');
  const { getSourceConfidenceMultiplier } = await import('@/lib/signals/source-performance');

  const momentumEvent = detectMomentumEvent(item.name || '', item.snippet || '');
  if (!momentumEvent) return false;

  const rawSymbol = symbols.find((value) => !/NIFTY|SENSEX|BANKNIFTY|FINNIFTY|MIDCPNIFTY/.test(value));
  if (!rawSymbol) return false;

  const { resolveInstrumentFromText } = await import('@/lib/market/instrument-resolver');
  let symbol = rawSymbol;

  // Attempt to resolve ticker or company name using the instrument resolver database
  const resolvedInstrument = await resolveInstrumentFromText(`${rawSymbol} ${item.name || ''}`).catch(() => null);
  if (resolvedInstrument?.symbol) {
    symbol = resolvedInstrument.symbol;
  } else {
    const fallbackInstrument = await resolveInstrumentFromText(rawSymbol).catch(() => null);
    if (fallbackInstrument?.symbol) {
      symbol = fallbackInstrument.symbol;
    }
  }

  const recentDuplicate = await db.tradeSignal.findFirst({
    where: {
      symbol: symbol.toUpperCase(),
      source: 'ai-news',
      action: momentumEvent.action,
      status: 'pending',
      createdAt: { gte: new Date(Date.now() - 12 * 60 * 60 * 1000) },
    },
  });
  if (recentDuplicate) return false;

  const livePrice = await getLivePrice(symbol);
  if (!livePrice || livePrice <= 0) {
    console.warn(`[News Scan] Skipping ${symbol} (resolved from ${rawSymbol}) signal because live price was unavailable`);
    return false;
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
  const reasoning = `[${momentumEvent.type.replace(/-/g, ' ').toUpperCase()}] ${item.name || ''}. ${sentiment.summary || ''} Entry near CMP ₹${livePrice.toFixed(2)}.`;

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
      sourceTimestamp: parseSourceTimestamp(item.date) || new Date(),
      postUrl: item.url || null,
    },
  });

  return true;
}

async function processNewsItems(items: SearchFunctionResultItem[]) {
  const savedItems: ScanNewsItem[] = [];
  let duplicatesSkipped = 0;
  let errors = 0;
  let signalsCreated = 0;

  const providerConfig = await getConfiguredAIProvider().catch(() => null);
  const isGroq = providerConfig?.provider === 'groq';

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const sourceUrl = sourceKey(item) || `unknown-${Date.now()}`;
      const existing = await db.newsItem.findFirst({ where: { source: sourceUrl } });
      if (existing) {
        duplicatesSkipped++;
        continue;
      }

      // Add a rate limit buffer delay if using Groq provider to stay under the 6,000 TPM limit
      if (isGroq && i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }

      const title = item.name || 'Untitled';
      const content = item.snippet || '';
      const sentimentResult = await analyzeNewsSentiment(title, content);
      const relatedSymbols = mergeSymbols(sentimentResult, title, content);

      const newsItem = await db.newsItem.create({
        data: {
          title,
          content: content || null,
          source: sourceUrl,
          sentiment: sentimentResult.sentiment,
          sentimentScore: sentimentResult.sentimentScore,
          relatedSymbols: relatedSymbols.join(','),
          analyzed: true,
          aiSummary: sentimentResult.summary,
          publishedAt: parseSourceTimestamp(item.date) || new Date(),
        },
      });

      savedItems.push(toScanNewsItem(newsItem));

      try {
        const createdSignal = await maybeCreateSignalFromNews(item, sentimentResult, relatedSymbols);
        if (createdSignal) signalsCreated++;
      } catch (signalErr) {
        console.error(`Failed to create news signal for "${title}":`, signalErr);
      }
    } catch (err) {
      console.error(`Failed to process news item "${item.name}":`, err);
      errors++;
    }
  }

  return { savedItems, duplicatesSkipped, errors, signalsCreated };
}

async function getExistingUnanalyzedNews() {
  const savedItems: ScanNewsItem[] = [];
  let errors = 0;

  const existingUnanalyzed = await db.newsItem.findMany({
    where: { analyzed: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });

  for (const item of existingUnanalyzed) {
    try {
      const sentimentResult = await analyzeNewsSentiment(item.title, item.content || '');
      const relatedSymbols = mergeSymbols(sentimentResult, item.title, item.content || '');
      const updated = await db.newsItem.update({
        where: { id: item.id },
        data: {
          sentiment: sentimentResult.sentiment,
          sentimentScore: sentimentResult.sentimentScore,
          relatedSymbols: relatedSymbols.join(','),
          analyzed: true,
          aiSummary: sentimentResult.summary,
        },
      });
      savedItems.push(toScanNewsItem(updated));
    } catch (err) {
      console.error(`Failed to analyze existing news item "${item.title}":`, err);
      errors++;
    }
  }

  return { savedItems, errors };
}

// ─── POST /api/news/scan ────────────────────────────────────────────────────

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const customQuery = body.query as string | undefined;
    const maxResults = Math.min(Math.max(body.maxResults || 10, 1), 20);
    const queries = customQuery ? [customQuery] : DEFAULT_QUERIES;
    const queryResults: Record<string, number> = {};

    const rssPromise = withTimeout(searchNewsViaRSS(), 10_000, [] as SearchFunctionResultItem[], 'RSS direct feeds')
      .then((items): SourceBatch => ({ source: 'rss', items }))
      .catch((err): SourceBatch => ({ source: 'rss', items: [], error: String(err) }));

    // OmniRoute /v1/search is the default web search source.
    const webPromises: Promise<SourceBatch>[] = [];
    for (let i = 0; i < queries.length; i += 2) {
      const chunk = queries.slice(i, i + 2);
      const chunkPromises = chunk.map((query) =>
        withTimeout(searchNewsViaOmniRoute(query, 8), 10_000, [] as SearchFunctionResultItem[], `omniroute search: ${query.slice(0, 45)}`)
          .then((items): SourceBatch => ({ source: `omniroute:${query}`, items }))
          .catch((err): SourceBatch => ({ source: `omniroute:${query}`, items: [], error: String(err) }))
      );
      webPromises.push(...chunkPromises);
      if (i + 2 < queries.length) {
        await new Promise((resolve) => setTimeout(resolve, 800)); // Delay between chunks to avoid 429
      }
    }

    const webBatches = await Promise.all(webPromises);
    for (const batch of webBatches) {
      queryResults[batch.source] = batch.items.length;
      if (batch.error) queryResults[`${batch.source}_error`] = 1;
    }

    // Fallback: if OmniRoute returned nothing for a query, use the ZAI SDK web search.
    const fallbackWebPromises: Promise<SourceBatch>[] = [];
    const emptyQueries = queries.filter(
      (query) => !webBatches.some((b) => b.source === `omniroute:${query}` && b.items.length > 0)
    );
    for (let i = 0; i < emptyQueries.length; i += 2) {
      const chunk = emptyQueries.slice(i, i + 2);
      const chunkPromises = chunk.map((query) =>
        withTimeout(searchMarketNews(query, 0), 8_000, [] as SearchFunctionResultItem[], `web search fallback: ${query.slice(0, 45)}`)
          .then((items): SourceBatch => ({ source: query, items }))
          .catch((err): SourceBatch => ({ source: query, items: [], error: String(err) }))
      );
      fallbackWebPromises.push(...chunkPromises);
      if (i + 2 < emptyQueries.length) {
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    const fallbackBatches = await Promise.all(fallbackWebPromises);
    for (const batch of fallbackBatches) {
      queryResults[batch.source] = batch.items.length;
      if (batch.error) queryResults[`${batch.source}_error`] = 1;
    }

    const batches = await Promise.all([rssPromise, ...webBatches, ...fallbackBatches]);
    for (const batch of batches) {
      queryResults[batch.source] = batch.items.length;
      if (batch.error) queryResults[`${batch.source}_error`] = 1;
    }

    const seen = new Set<string>();
    const deduplicatedItems: SearchFunctionResultItem[] = [];
    for (const batch of batches) {
      addDeduped(deduplicatedItems, seen, batch.items, batch.source);
    }

    let rankedItems = rankMarketNews(deduplicatedItems);
    queryResults.rawDeduped = deduplicatedItems.length;
    queryResults.rankedMarketRelevant = rankedItems.length;

    if (rankedItems.length < Math.min(maxResults, 8)) {
      const pageItems = await withTimeout(searchNewsViaPageReader(), 10_000, [] as SearchFunctionResultItem[], 'page_reader');
      queryResults.page_reader_raw = pageItems.length;
      addDeduped(deduplicatedItems, seen, pageItems, 'page_reader');
      rankedItems = rankMarketNews(deduplicatedItems);
      queryResults.page_reader_ranked = rankedItems.length;
    }

    // Filter out items that are already in the DB to avoid wasting LLM rate limits on duplicates
    const newItemsToProcess: SearchFunctionResultItem[] = [];
    let duplicatesSkippedCount = 0;

    for (const item of rankedItems) {
      const sourceUrl = sourceKey(item);
      const existing = await db.newsItem.findFirst({ where: { source: sourceUrl } });
      if (existing) {
        duplicatesSkippedCount++;
      } else {
        newItemsToProcess.push(item);
      }
    }

    // Only process up to maxResults new items (default 10)
    const itemsToProcess = newItemsToProcess.slice(0, maxResults);
    const hasAnyExternalSource = deduplicatedItems.length > 0;

    if (itemsToProcess.length === 0) {
      const existing = await getExistingUnanalyzedNews();
      const result: ScanResult = {
        totalScanned: 0,
        newItemsSaved: existing.savedItems.length,
        duplicatesSkipped: duplicatesSkippedCount,
        errors: existing.errors,
        signalsCreated: 0,
        news: existing.savedItems,
        queryResults,
        sourceMode: 'existing-db',
        warning: hasAnyExternalSource
          ? 'News sources responded, but no high-quality trading articles passed the catalyst filter.'
          : 'All external news sources failed or timed out. Analyzed existing saved articles if available.',
      };
      return NextResponse.json(result);
    }

    const processed = await processNewsItems(itemsToProcess);
    const hasWebOrPageSource = queries.some(
      (query) => (queryResults[query] || 0) > 0 || (queryResults[`omniroute:${query}`] || 0) > 0
    ) || (queryResults.page_reader_raw || 0) > 0;

    const result: ScanResult = {
      totalScanned: itemsToProcess.length,
      newItemsSaved: processed.savedItems.length,
      duplicatesSkipped: processed.duplicatesSkipped + duplicatesSkippedCount,
      errors: processed.errors,
      signalsCreated: processed.signalsCreated,
      news: processed.savedItems,
      queryResults,
      sourceMode: queryResults.rss > 0 && hasWebOrPageSource ? 'combined' : 'rss-first',
    };

    if (processed.savedItems.length === 0 && (processed.duplicatesSkipped + duplicatesSkippedCount) > 0) {
      result.warning = 'All high-quality trading articles were already saved earlier. No new items were added.';
    }

    try {
      await db.botSetting.upsert({
        where: { key: 'newsScheduleLastRun' },
        create: { key: 'newsScheduleLastRun', value: new Date().toISOString() },
        update: { value: new Date().toISOString() },
      });
    } catch {
      // Non-critical: don't fail the scan if this update fails.
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in news scan:', error);
    return NextResponse.json(
      {
        error: 'News scan failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
