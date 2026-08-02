import type { AISignalOutput } from '@/lib/ai-engine';

function isCashStockSymbol(symbol: string): boolean {
  return /^[A-Z0-9&-]+$/.test(symbol.toUpperCase());
}

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

// Prices can be fetched many times for the same symbol within a single scan
// (per-signal normalization + quality gate). A short TTL collapses those
// repeated Yahoo calls while keeping quotes fresh enough for live trading.
const LIVE_PRICE_TTL_MS = 10_000;
const livePriceCache = new Map<string, { value: number | null; expiresAt: number }>();

export function invalidateLivePriceCache(): void {
  livePriceCache.clear();
}

export async function fetchYahooLivePrice(symbol: string): Promise<number | null> {
  try {
    const cleanSymbol = symbol.toUpperCase().trim();
    const yahooSymbol = cleanSymbol === 'NIFTY' ? '^NSEI' : cleanSymbol === 'SENSEX' ? '^BSESN' : `${cleanSymbol}.NS`;

    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) return null;
    const payload = await res.json();
    const livePrice = Number(payload?.chart?.result?.[0]?.meta?.regularMarketPrice);
    return Number.isFinite(livePrice) && livePrice > 0 ? livePrice : null;
  } catch (err) {
    console.warn(`[LivePrice] Yahoo Finance fallback failed for ${symbol}:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function getLivePrice(symbol: string): Promise<number | null> {
  if (!isCashStockSymbol(symbol)) return null;

  const now = Date.now();
  const cached = livePriceCache.get(symbol.toUpperCase());
  if (cached && cached.expiresAt > now) return cached.value;

  const value = await fetchYahooLivePrice(symbol);
  livePriceCache.set(symbol.toUpperCase(), { value, expiresAt: now + LIVE_PRICE_TTL_MS });
  return value;
}

export async function normalizeSignalWithLivePrice(signal: AISignalOutput): Promise<AISignalOutput> {
  const livePrice = await getLivePrice(signal.symbol);

  if (!livePrice) {
    // If no live price but target/SL are missing, we still estimate them using entryPrice if entryPrice > 0
    const entry = Number(signal.entryPrice);
    if (entry > 0 && (!signal.targetPrice || !signal.stopLoss)) {
      const targetPrice = signal.targetPrice || (signal.action === 'BUY' ? roundPrice(entry * 1.04) : roundPrice(entry * 0.96));
      const stopLoss = signal.stopLoss || (signal.action === 'BUY' ? roundPrice(entry * 0.98) : roundPrice(entry * 1.02));
      return {
        ...signal,
        targetPrice,
        stopLoss,
        reasoning: `${signal.reasoning || ''} | Missing target/SL estimated from entry price ₹${entry}.`,
      };
    }
    return signal;
  }

  const oldEntry = Number(signal.entryPrice);
  const deviationPct = oldEntry > 0 ? Math.abs(livePrice - oldEntry) / oldEntry * 100 : 100;

  // Replace if deviation is large, or if target or stopLoss is missing
  const isMissingLevels = !signal.targetPrice || !signal.stopLoss;
  const shouldReplace = deviationPct >= 3 || isMissingLevels;

  if (!shouldReplace) return signal;

  const entryPrice = oldEntry > 0 && deviationPct < 3 ? oldEntry : roundPrice(livePrice);
  const targetPrice = signal.targetPrice || (signal.action === 'BUY'
    ? roundPrice(entryPrice * 1.04)
    : roundPrice(entryPrice * 0.96));
  const stopLoss = signal.stopLoss || (signal.action === 'BUY'
    ? roundPrice(entryPrice * 0.98)
    : roundPrice(entryPrice * 1.02));

  return {
    ...signal,
    entryPrice,
    targetPrice,
    stopLoss,
    reasoning: isMissingLevels
      ? `${signal.reasoning || ''} | Missing target/SL estimated from live price ₹${entryPrice}.`
      : `${signal.reasoning || ''} | Price corrected using live quote: old entry ₹${roundPrice(oldEntry)}, live ₹${entryPrice}. Target/SL recalculated to 4%/2% for manual review.`,
  };
}
