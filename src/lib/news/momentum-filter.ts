/**
 * Momentum Event Filter for News Signals
 * Only generates trade signals from high-impact news events —
 * not generic market commentary or opinion pieces.
 */

export interface MomentumEvent {
  type: string;
  action: 'BUY' | 'SELL';
  confidenceBoost: number; // added to base confidence
  reason: string;
}

// Keywords that indicate high-momentum, actionable events
const MOMENTUM_PATTERNS: Array<{
  type: string;
  action: 'BUY' | 'SELL';
  boost: number;
  patterns: RegExp[];
}> = [
  {
    type: 'earnings-beat',
    action: 'BUY',
    boost: 18,
    patterns: [
      /(?:q[1-4]\s*(?:fy)?\d*\s*)?(?:profit|earnings?|net\s*income|pat|ebitda)\s*(?:up|surge[ds]?|jump[s]?|beat|rise[s]?|grew?|grows?|soar[s]?)\s*(?:by\s*)?\d+%/i,
      /(?:revenue|sales|turnover)\s*(?:up|surges?|jumps?)\s*(?:by\s*)?\d+%/i,
      /(?:beats?\s*(?:estimates?|expectations?|consensus|street))/i,
      /(?:margin|margins?)\s*(?:expan[ds]?|improv[esd]?|widen[s]?)/i,
    ],
  },
  {
    type: 'earnings-miss',
    action: 'SELL',
    boost: 15,
    patterns: [
      /(?:q[1-4]\s*(?:fy)?\d*\s*)?(?:profit|earnings?|pat)\s*(?:fell?|drops?|declined?|plunges?|miss[es]*)\s*(?:by\s*)?\d+%/i,
      /(?:misses?\s*(?:estimates?|expectations?|consensus|street))/i,
      /(?:below\s*estimates?|below\s*expectations?)/i,
      /(?:margin|margins?)\s*(?:contract[s]?|compress[es]?|squeeze[ds]?)/i,
    ],
  },
  {
    type: 'order-win',
    action: 'BUY',
    boost: 20,
    patterns: [
      /(?:bags?|wins?|secures?|receives?|bags?)\s+(?:rs\.?\s*[\d,.]+\s*(?:crore|cr|lakh|lac)?|[\d,.]+\s*(?:crore|cr|lakh|lac)\s*(?:rs\.?)?)\s*(?:order|contract|deal)/i,
      /(?:order\s*(?:win|book|inflow|intake))\s*(?:of\s*rs\.?\s*[\d,.]+|[\d,.]+\s*(?:crore|cr))/i,
      /(?:large|mega|major|significant|big)\s*(?:order|contract|deal)\s*(?:win|secured|received|bags?)/i,
      /(?:l1\s*bidder|lowest\s*bidder|won\s*(?:the\s*)?(?:bid|tender))/i,
    ],
  },
  {
    type: 'capex-expansion',
    action: 'BUY',
    boost: 14,
    patterns: [
      /(?:capex|capital\s*expenditure)\s*(?:of|worth|at|plan[s]?)\s*(?:rs\.?\s*[\d,.]+|[\d,.]+\s*(?:crore|cr))/i,
      /(?:expansion|capacity\s*addition|new\s*plant|greenfield|brownfield)/i,
      /(?:joint\s*venture|jv|merger|acquisition|takeover)\s*(?:with|of|between)/i,
    ],
  },
  {
    type: 'regulatory-approval',
    action: 'BUY',
    boost: 22,
    patterns: [
      /(?:sebi|rbi|nclt|nclat|cci|drhp|ipo\s*approval|stock\s*split|bonus\s*shares?|dividend)/i,
      /(?:fda|drug\s*(?:approval|application|nda|anda)|clinical\s*trial\s*(?:success|positive))/i,
      /(?:patent\s*(?:grant|approved?|received?)|trademark\s*(?:grant|approved?))/i,
    ],
  },
  {
    type: 'promoter-buy',
    action: 'BUY',
    boost: 16,
    patterns: [
      /(?:promoter|promoters?|management|director|insider)\s*(?:buys?|purchased?|acquired?|increases?\s*stake)/i,
      /(?:block\s*deal|bulk\s*deal)\s*(?:buy|purchase|acquisition)/i,
      /(?:buyback|share\s*repurchase|open\s*offer)/i,
    ],
  },
  {
    type: 'promoter-sell',
    action: 'SELL',
    boost: 12,
    patterns: [
      /(?:promoter|promoters?|management|director|insider)\s*(?:sells?|sold|offloads?|reduces?\s*stake|pledges?)/i,
      /(?:promoter\s*pledge|pledge\s*(?:increased?|rises?|goes?\s*up))/i,
    ],
  },
  {
    type: 'technical-breakout',
    action: 'BUY',
    boost: 12,
    patterns: [
      /(?:52[\s-]*week\s*(?:high|new\s*high)|\ball[\s-]*time\s*(?:high|ath))/i,
      /(?:breakout|breaks?\s*out|breaks?\s*above|breaks?\s*resistance)/i,
      /(?:golden\s*cross|death\s*cross\s*avoided|above\s*(?:200|50)\s*(?:day\s*)?(?:dma|ema|sma))/i,
    ],
  },
  {
    type: 'technical-breakdown',
    action: 'SELL',
    boost: 12,
    patterns: [
      /(?:52[\s-]*week\s*low|new\s*(?:52[\s-]*week\s*)?low)/i,
      /(?:breakdown|breaks?\s*down|breaks?\s*below\s*support)/i,
      /(?:death\s*cross|below\s*(?:200|50)\s*(?:day\s*)?(?:dma|ema|sma))/i,
    ],
  },
  {
    type: 'analyst-upgrade',
    action: 'BUY',
    boost: 10,
    patterns: [
      /(?:upgrade[ds]?|raises?\s*(?:target|rating|price\s*target)|initiates?\s*(?:coverage|buy))\s*(?:with\s*)?(?:buy|outperform|overweight|strong\s*buy)/i,
      /(?:target\s*price\s*(?:raised?|hiked?|increased?)\s*to\s*rs\.?\s*[\d,.]+)/i,
    ],
  },
  {
    type: 'analyst-downgrade',
    action: 'SELL',
    boost: 10,
    patterns: [
      /(?:downgrade[ds]?|cuts?\s*(?:target|rating|price\s*target)|initiates?\s*(?:sell|underperform|underweight))/i,
      /(?:target\s*price\s*(?:cut|reduced?|lowered?)\s*to\s*rs\.?\s*[\d,.]+)/i,
    ],
  },
  {
    type: 'business-update',
    action: 'BUY',
    boost: 12,
    patterns: [
      /(?:business\s*update|deposits?|advances?|sales?|production|volumes?)[^%]*?\b(?:growth|up|surged?|jumped?|grew?|grows?|rallied?|rises?)\b[\s\S]*?\b\d+(?:\.\d+)?\s*(?:%|percent|per\s*cent)/i,
      /shares\s*(?:jump|rallied|rises?)\s*\d+(?:\.\d+)?\s*(?:%|percent|per\s*cent)[\s\S]*?business\s*update/i,
    ],
  },
  {
    type: 'business-update-negative',
    action: 'SELL',
    boost: 12,
    patterns: [
      /(?:business\s*update|deposits?|advances?|sales?|production|volumes?)[^%]*?\b(?:fall|drop|declined?|down|contracted?)\b[\s\S]*?\b\d+(?:\.\d+)?\s*(?:%|percent|per\s*cent)/i,
    ],
  },
];

// Words that indicate this is NOT an actionable signal (noise filter)
const NOISE_PATTERNS = [
  /(?:opinion|view|says?|think[s]?|believes?|expects?|(?:fund|portfolio)\s*manager)/i,
  /(?:market\s*(?:cap|wrap|roundup|summary|pulse)|weekly\s*(?:roundup|recap))/i,
  /(?:interview|expert\s*(?:speak|opinion|view)|analyst\s*(?:talk|interview))/i,
  /(?:nifty|sensex|index)\s*(?:up|down|falls?|rises?)\s*(?:\d+\s*(?:pts?|points?))/i, // generic index moves
];

/**
 * Detect if a news headline/snippet describes a momentum event worth trading.
 * Returns the detected event or null if it's just noise.
 */
export function detectMomentumEvent(
  headline: string,
  snippet?: string
): MomentumEvent | null {
  const fullText = `${headline} ${snippet || ''}`;

  // First check if it's noise
  for (const noisePattern of NOISE_PATTERNS) {
    if (noisePattern.test(fullText)) return null;
  }

  // Check each momentum pattern
  for (const { type, action, boost, patterns } of MOMENTUM_PATTERNS) {
    for (const pattern of patterns) {
      if (pattern.test(fullText)) {
        return {
          type,
          action,
          confidenceBoost: boost,
          reason: `Momentum event detected: ${type.replace(/-/g, ' ')}`,
        };
      }
    }
  }

  return null;
}

/**
 * Extract one or more potential NSE/BSE stock symbols from news text.
 * Looks for company names and maps to tickers where possible.
 */
export function extractSymbolsFromNewsText(
  text: string,
  relatedSymbolsFromAI: string[]
): string[] {
  // Start with AI-extracted symbols (most reliable)
  const symbols = new Set<string>(relatedSymbolsFromAI.filter(Boolean));

  // Common Indian company → ticker mappings for direct extraction
  const COMPANY_TICKER: Record<string, string> = {
    'RELIANCE': 'RELIANCE', 'TATA CONSULTANCY': 'TCS', 'TCS': 'TCS',
    'INFOSYS': 'INFY', 'HDFC BANK': 'HDFCBANK', 'ICICI BANK': 'ICICIBANK',
    'WIPRO': 'WIPRO', 'HCL TECHNOLOGIES': 'HCLTECH', 'HCL TECH': 'HCLTECH',
    'BAJAJ FINANCE': 'BAJFINANCE', 'BAJAJ FINSERV': 'BAJAJFINSV',
    'MARUTI': 'MARUTI', 'MARUTI SUZUKI': 'MARUTI',
    'LARSEN': 'LT', 'L&T': 'LT',
    'STATE BANK': 'SBIN', 'SBI': 'SBIN',
    'POWER GRID': 'POWERGRID', 'NTPC': 'NTPC', 'ONGC': 'ONGC',
    'ITC': 'ITC', 'HINDUSTAN UNILEVER': 'HINDUNILVR', 'HUL': 'HINDUNILVR',
    'AXIS BANK': 'AXISBANK', 'KOTAK': 'KOTAKBANK',
    'BHARTI AIRTEL': 'BHARTIARTL', 'AIRTEL': 'BHARTIARTL',
    'ADANI PORTS': 'ADANIPORTS', 'ADANI GREEN': 'ADANIGREEN',
    'TATA STEEL': 'TATASTEEL', 'TATA MOTORS': 'TATAMOTORS',
    'ASIAN PAINTS': 'ASIANPAINT', 'NESTLE': 'NESTLEIND',
    'DIVIS LAB': 'DIVISLAB', 'DR REDDY': 'DRREDDY', 'SUN PHARMA': 'SUNPHARMA',
    'CIPLA': 'CIPLA', 'DELHIVERY': 'DELHIVERY', 'ZOMATO': 'ZOMATO',
    'PAYTM': 'PAYTM', 'NYKAA': 'NYKAA',
    'ZYDUS': 'ZYDUSLIFE', 'ZYDUS LIFE': 'ZYDUSLIFE',
  };

  const upperText = text.toUpperCase();
  for (const [name, ticker] of Object.entries(COMPANY_TICKER)) {
    if (upperText.includes(name)) {
      symbols.add(ticker);
    }
  }

  return [...symbols].filter(s => s && s.length >= 2 && s.length <= 14);
}
