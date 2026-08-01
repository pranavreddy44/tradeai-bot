export type ResolvedInstrument = {
  symbol: string;
  name: string;
  exchange: string;
  segment: string;
  matchType: 'symbol' | 'name' | 'alias';
};

type InstrumentRow = {
  exchange: string;
  trading_symbol: string;
  name: string;
  segment: string;
};

let instrumentCache: InstrumentRow[] | null = null;
let cacheLoadedAt = 0;

const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const SHORTHAND_ALIASES: Record<string, string> = {
  'KSH INTL': 'KSHINTL',
  'KSH INTERNATIONAL': 'KSHINTL',
  'AYE FINANCE': 'AYEFIN',
  'WALCHANDNAGAR IND': 'WALCHANNAG',
  WALCHANDNAGAR: 'WALCHANNAG',
  'UNIVERSAL CABLES': 'UNIVCABLES',
  'APOLLO MICRO SYSTEM': 'APOLLO',
  'APOLLO MICRO SYSTEMS': 'APOLLO',
  'PREMIER EXPLOSIVES LIMITED': 'PREMEXPLN',
  'PREMIER EXPLOSIVES': 'PREMEXPLN',
  'PREMEXPLN': 'PREMEXPLN',
  'INTERGLOBE AVIATION': 'INDIGO',
  'INDIGO': 'INDIGO',
  'SUZLON': 'SUZLON',
  'ADF FOODS': 'ADFFOODS',
  'ZEN TECHNOLOGIES': 'ZENTEC',
  'ZENTEC': 'ZENTEC',
};

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\b(LTD|LIMITED|INDIA|CO|COMPANY|THE|PVT|PRIVATE)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

const INSTRUMENT_CSV_URL = 'https://archives.nseindia.com/content/equities/EQUITY_L.csv';

async function loadInstruments(): Promise<InstrumentRow[]> {
  const now = Date.now();
  if (instrumentCache && now - cacheLoadedAt < CACHE_TTL_MS) return instrumentCache;

  const response = await fetch(INSTRUMENT_CSV_URL, {
    headers: { Accept: 'text/csv,*/*', 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`NSE instrument CSV failed: HTTP ${response.status}`);

  const csv = await response.text();
  const lines = csv.split(/\r?\n/).filter(Boolean);

  // NSE EQUITY_L.csv layout: Symbol, Name of Company, Series, Date of Listing, Paid Up Value, Market Lot, ISIN Number, Face Value
  instrumentCache = lines.slice(1)
    .map((line) => {
      const cols = parseCsvLine(line);
      return {
        exchange: 'NSE',
        trading_symbol: (cols[0] || '').trim().toUpperCase(),
        name: (cols[1] || '').trim(),
        segment: (cols[2] || '').trim().toUpperCase() === 'EQ' ? 'CASH' : '',
      };
    })
    .filter((row) =>
      row.exchange === 'NSE'
      && row.segment === 'CASH'
      && Boolean(row.trading_symbol)
      && Boolean(row.name)
    );
  cacheLoadedAt = now;
  return instrumentCache;
}

function extractSymbolLikeTokens(text: string): string[] {
  const tokens = new Set<string>();

  for (const match of text.matchAll(/#\s*([A-Za-z0-9&-]{2,20})/g)) {
    tokens.add(match[1].toUpperCase());
  }
  for (const match of text.matchAll(/\b([A-Z][A-Z0-9&-]{2,20})\b/g)) {
    const token = match[1];
    if (token === token.toUpperCase()) tokens.add(token);
  }

  return [...tokens];
}

export async function resolveInstrumentFromText(text: string): Promise<ResolvedInstrument | null> {
  const normalizedText = normalize(text);

  for (const [alias, symbol] of Object.entries(SHORTHAND_ALIASES)) {
    if (normalizedText.includes(normalize(alias))) {
      return {
        symbol,
        name: alias,
        exchange: 'NSE',
        segment: 'CASH',
        matchType: 'alias',
      };
    }
  }

  const instruments = await loadInstruments();
  const symbolTokens = extractSymbolLikeTokens(text);
  for (const token of symbolTokens) {
    const exact = instruments.find((row) => row.trading_symbol === token);
    if (exact) {
      return {
        symbol: exact.trading_symbol,
        name: exact.name,
        exchange: exact.exchange,
        segment: exact.segment,
        matchType: 'symbol',
      };
    }
  }

  const textWords = new Set(normalizedText.split(' ').filter((word) => word.length >= 3));
  let best: { row: InstrumentRow; score: number } | null = null;

  for (const row of instruments) {
    const normalizedName = normalize(row.name);
    if (!normalizedName) continue;
    const nameWords = normalizedName.split(' ').filter((word) => word.length >= 3);
    if (nameWords.length >= 2 && normalizedText.includes(normalizedName)) {
      return {
        symbol: row.trading_symbol,
        name: row.name,
        exchange: row.exchange,
        segment: row.segment,
        matchType: 'name',
      };
    }

    if (nameWords.length === 0) continue;
    const hits = nameWords.filter((word) => textWords.has(word)).length;
    const score = hits / nameWords.length;
    if (hits >= 2 && score >= 0.66 && (!best || score > best.score)) {
      best = { row, score };
    }
  }

  if (best) {
    return {
      symbol: best.row.trading_symbol,
      name: best.row.name,
      exchange: best.row.exchange,
      segment: best.row.segment,
      matchType: 'name',
    };
  }

  return null;
}
