import { BollingerBands, EMA, MACD, RSI, SMA } from 'technicalindicators';
import type { AISignalOutput, VLMImageParseResult } from '@/lib/ai-engine';

type Candle = {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ChartAnalysis = NonNullable<VLMImageParseResult['chartAnalysis']>;

function roundPrice(value: number): number {
  return Math.round(value * 100) / 100;
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractCandles(response: unknown): Candle[] {
  const result = response && typeof response === 'object'
    ? (response as Record<string, any>).chart?.result?.[0]
    : null;
  if (!result) return [];

  const timestamps: number[] = Array.isArray(result.timestamp) ? result.timestamp : [];
  const quote = result?.indicators?.quote?.[0];
  if (!quote) return [];

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const time = timestamps[i];
    const o = asNumber(quote.open?.[i]);
    const h = asNumber(quote.high?.[i]);
    const l = asNumber(quote.low?.[i]);
    const c = asNumber(quote.close?.[i]);
    if (!o || !h || !l || !c) continue;
    candles.push({
      time: new Date(time * 1000).toISOString(),
      open: o,
      high: h,
      low: l,
      close: c,
      volume: Number(quote.volume?.[i]) || 0,
    });
  }
  return candles;
}

async function fetchDailyCandles(symbol: string): Promise<Candle[]> {
  const cleanSymbol = symbol.toUpperCase().trim();
  const yahooSymbol = cleanSymbol === 'NIFTY' ? '^NSEI' : cleanSymbol === 'SENSEX' ? '^BSESN' : `${cleanSymbol}.NS`;

  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=2y&interval=1d`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    }
  );
  if (!res.ok) return [];
  return extractCandles(await res.json());
}

function nearestAbove(levels: number[] | undefined, price: number): number | null {
  const candidates = (levels || []).filter((level) => level > price * 1.005).sort((a, b) => a - b);
  return candidates[0] ?? null;
}

function nearestBelow(levels: number[] | undefined, price: number): number | null {
  const candidates = (levels || []).filter((level) => level < price * 0.995).sort((a, b) => b - a);
  return candidates[0] ?? null;
}

export async function validateChartSignalWithIndicators(
  signal: AISignalOutput,
  chartAnalysis: ChartAnalysis | null | undefined
): Promise<AISignalOutput> {
  if (!chartAnalysis?.symbol && !signal.symbol) return signal;
  const chart = chartAnalysis || null;

  try {
    const symbol = (signal.symbol || chart?.symbol || '').toUpperCase();
    const candles = await fetchDailyCandles(symbol);
    if (candles.length < 30) {
      return {
        ...signal,
        confidence: Math.max(45, Math.min(signal.confidence, 68)),
        reasoning: `${signal.reasoning} | Chart library validation skipped: not enough historical candles available.`,
      };
    }

    const closes = candles.map((c) => c.close);
    const volumes = candles.map((c) => c.volume);
    const latest = candles[candles.length - 1];
    const recent = candles.slice(-30);

    const ema20 = EMA.calculate({ period: 20, values: closes }).at(-1);
    const ema50 = EMA.calculate({ period: 50, values: closes }).at(-1);
    const sma20 = SMA.calculate({ period: 20, values: closes }).at(-1);
    const rsi14 = RSI.calculate({ period: 14, values: closes }).at(-1);
    const macd = MACD.calculate({
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    }).at(-1);
    const bands = BollingerBands.calculate({ period: 20, values: closes, stdDev: 2 }).at(-1);

    const recentResistance = Math.max(...recent.slice(0, -1).map((c) => c.high));
    const recentSupport = Math.min(...recent.slice(0, -1).map((c) => c.low));
    const avgVolume20 = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / Math.max(1, volumes.slice(-20).length);
    const volumeRatio = latest.volume && avgVolume20 ? latest.volume / avgVolume20 : 0;

    const checks: string[] = [];
    let score = 0;

    if (signal.action === 'BUY') {
      if (ema20 && latest.close > ema20) { score += 12; checks.push('close above EMA20'); }
      if (ema20 && ema50 && ema20 >= ema50 * 0.99) { score += 10; checks.push('EMA20 near/above EMA50'); }
      if (rsi14 && rsi14 >= 45 && rsi14 <= 72) { score += 10; checks.push(`RSI healthy ${roundPrice(rsi14)}`); }
      if (macd?.histogram !== undefined && macd.histogram >= 0) { score += 8; checks.push('MACD histogram positive'); }
      if (latest.close >= recentResistance * 0.97) { score += 10; checks.push('price near recent resistance/breakout zone'); }
      if (volumeRatio >= 1.2) { score += 6; checks.push(`volume ${roundPrice(volumeRatio)}x avg`); }
      if (bands && latest.close > bands.middle) { score += 4; checks.push('above Bollinger midline'); }
      if (sma20 && latest.close > sma20) { score += 2; checks.push('above SMA20'); }
    } else {
      if (ema20 && latest.close < ema20) { score += 12; checks.push('close below EMA20'); }
      if (ema20 && ema50 && ema20 <= ema50 * 1.01) { score += 10; checks.push('EMA20 near/below EMA50'); }
      if (rsi14 && rsi14 <= 55) { score += 10; checks.push(`RSI weak ${roundPrice(rsi14)}`); }
      if (macd?.histogram !== undefined && macd.histogram <= 0) { score += 8; checks.push('MACD histogram negative'); }
      if (latest.close <= recentSupport * 1.03) { score += 10; checks.push('price near support/breakdown zone'); }
      if (volumeRatio >= 1.2) { score += 6; checks.push(`volume ${roundPrice(volumeRatio)}x avg`); }
      if (bands && latest.close < bands.middle) { score += 4; checks.push('below Bollinger midline'); }
      if (sma20 && latest.close < sma20) { score += 2; checks.push('below SMA20'); }
    }

    const libraryConfidence = Math.min(88, Math.max(50, 48 + score));
    const confidence = Math.round((signal.confidence * 0.55) + (libraryConfidence * 0.45));
    const entryPrice = roundPrice(latest.close);
    const chartResistance = nearestAbove(chart?.resistanceLevels, entryPrice);
    const chartSupport = nearestBelow(chart?.supportLevels, entryPrice);
    const targetPrice = signal.action === 'BUY'
      ? roundPrice(chartResistance || recentResistance || signal.targetPrice)
      : roundPrice(chartSupport || recentSupport || signal.targetPrice);
    const stopLoss = signal.action === 'BUY'
      ? roundPrice(chartSupport || recentSupport || signal.stopLoss)
      : roundPrice(chartResistance || recentResistance || signal.stopLoss);

    return {
      ...signal,
      entryPrice,
      targetPrice,
      stopLoss,
      confidence,
      reasoning: `${signal.reasoning} | Verified with technicalindicators on daily candles: ${checks.join(', ') || 'mixed signal'}. Latest close ₹${entryPrice}, recent support ₹${roundPrice(recentSupport)}, recent resistance ₹${roundPrice(recentResistance)}.`,
    };
  } catch (error) {
    return {
      ...signal,
      confidence: Math.max(45, Math.min(signal.confidence, 70)),
      reasoning: `${signal.reasoning} | Chart library validation failed: ${error instanceof Error ? error.message : String(error)}.`,
    };
  }
}
