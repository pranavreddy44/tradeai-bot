export type TradeType =
  | 'INTRADAY'
  | 'F&O'
  | 'SCALP'
  | 'BTST'
  | 'SWING'
  | 'POSITIONAL'
  | 'DELIVERY'
  | 'MANUAL';

type InferTradeTypeInput = {
  symbol?: string | null;
  source?: string | null;
  text?: string | null;
};

export function inferTradeType(input: InferTradeTypeInput): TradeType {
  const symbol = (input.symbol || '').toUpperCase();
  const source = (input.source || '').toLowerCase();
  const text = `${input.text || ''} ${symbol}`.toUpperCase();

  if (/\b(CE|PE|CALL|PUT|OPTION|OPTIONS|FUT|FUTURE|FUTURES|EXPIRY)\b/.test(text)) return 'F&O';
  if (/\b(NIFTY|BANKNIFTY|FINNIFTY|MIDCPNIFTY)\b/.test(symbol) && /\b(BUY|SELL|CE|PE|CALL|PUT|FUT)\b/.test(text)) return 'F&O';
  if (/\b(SCALP|SCALPING|QUICK TRADE|1M|3M|5M|15M)\b/.test(text)) return 'SCALP';
  if (/\b(BTST|BUY TODAY SELL TOMORROW)\b/.test(text)) return 'BTST';
  if (/\b(INTRADAY|INTRA DAY|DAY TRADE|DAYTRADING|MIS|30M|1H|1HR|1 HOUR|HOURLY|TODAY)\b/.test(text)) return 'INTRADAY';
  if (/\b(POSITIONAL|POSITION TRADE|HOLD FOR|1W|WEEKLY|MONTHLY|1MO|1 MONTH|LONG TERM|LONG-TERM)\b/.test(text)) return 'POSITIONAL';
  if (/\b(SWING|BREAKOUT|RETEST|1D|DAILY|4H|4HR|4 HOUR|DAILY CHART|TECHNICAL)\b/.test(text)) return 'SWING';
  if (/\b(DELIVERY|CNC|INVEST|INVESTMENT|PORTFOLIO)\b/.test(text)) return 'DELIVERY';

  if (source === 'ai-news') return 'SWING';
  // Chart images are typically swing/positional setups, so default them to SWING
  // instead of INTRADAY when no explicit timeframe/style keyword was found.
  if (source.includes('chart')) return 'SWING';
  if (source.includes('telegram')) return 'INTRADAY';
  return 'MANUAL';
}

export function parseSourceTimestamp(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/<!\[CDATA\[|\]\]>/g, '').trim();
    const date = new Date(cleaned);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
