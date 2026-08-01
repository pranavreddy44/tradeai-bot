import ZAI from 'z-ai-web-dev-sdk';
import type { SearchFunctionResultItem } from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';

// Singleton ZAI instance
let zaiInstance: ZAI | null = null;

export async function getZAI(): Promise<ZAI> {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create();
  }
  return zaiInstance;
}

// ─── Per-Service Rate Limit Tracker ─────────────────────────────────────────
// Track last 429 timestamp — INFORMATIONAL ONLY.
// These functions are used for UI display only and should NEVER block API calls.
// Each AI function handles 429s internally with multi-model retry + fallbacks.

let lastLLM429At = 0;
let lastSearch429At = 0;
let consecutiveLLM429s = 0;

/**
 * INFORMATIONAL ONLY — do NOT use this to skip/blocked API calls.
 * Each AI function has multi-model retry + rule-based fallback built in.
 * Used by UI to show rate limit status.
 */
export function isRateLimited(): boolean {
  return Date.now() - lastLLM429At < 2_000;
}

/**
 * INFORMATIONAL ONLY — do NOT use this to skip/blocked API calls.
 * Used by UI to show rate limit status.
 */
export function isSearchRateLimited(): boolean {
  return Date.now() - lastSearch429At < 5_000;
}

export function getRateLimitRemainingMs(): number {
  const remaining = (lastLLM429At + 2_000) - Date.now();
  return remaining > 0 ? remaining : 0;
}

export function resetRateLimit(): void {
  lastLLM429At = 0;
  lastSearch429At = 0;
  consecutiveLLM429s = 0;
  console.log('[AI Engine] Rate limits reset');
}

function markLLMRateLimited() {
  lastLLM429At = Date.now();
  consecutiveLLM429s++;
  console.log(`[AI Engine] LLM 429 detected (consecutive: ${consecutiveLLM429s})`);
}

function markLLMSuccess() {
  consecutiveLLM429s = 0;
}

function markSearchRateLimited() {
  lastSearch429At = Date.now();
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface AISignalOutput {
  symbol: string;
  action: 'BUY' | 'SELL';
  confidence: number;
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  reasoning: string;
}

export interface AIAnalysisResult {
  signals: AISignalOutput[];
  marketSentiment: 'bullish' | 'bearish' | 'neutral';
  summary: string;
  modelName?: string;
}

export interface TelegramParseResult {
  isValid: boolean;
  signal?: {
    symbol: string;
    action: 'BUY' | 'SELL';
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
    confidence: number;
  };
  signals?: Array<{
    symbol: string;
    action: 'BUY' | 'SELL';
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
    confidence: number;
  }>;
  reasoning?: string;
  source?: 'text' | 'image' | 'rule';
  modelName?: string;
}

export interface SentimentResult {
  sentiment: 'positive' | 'negative' | 'neutral';
  sentimentScore: number;
  relatedSymbols: string[];
  summary: string;
}

interface SignalQualityContext {
  watchlist?: string[];
  newsText?: string;
  telegramText?: string;
  source?: string;
  minConfidence?: number;
  minRewardRisk?: number;
  isDynamicallyResolved?: boolean;
}

interface SignalQualityMetrics {
  reward: number;
  risk: number;
  rewardRisk: number;
  rewardPct: number;
  riskPct: number;
}

function calculateSignalMetrics(signal: Pick<AISignalOutput, 'action' | 'entryPrice' | 'targetPrice' | 'stopLoss'>): SignalQualityMetrics | null {
  const entry = Number(signal.entryPrice);
  const target = Number(signal.targetPrice);
  const stop = Number(signal.stopLoss);

  if (![entry, target, stop].every((value) => Number.isFinite(value) && value > 0)) return null;

  const reward = signal.action === 'BUY' ? target - entry : entry - target;
  const risk = signal.action === 'BUY' ? entry - stop : stop - entry;
  if (reward <= 0 || risk <= 0) return null;

  return {
    reward,
    risk,
    rewardRisk: reward / risk,
    rewardPct: (reward / entry) * 100,
    riskPct: (risk / entry) * 100,
  };
}

function supportLabel(signal: Pick<AISignalOutput, 'symbol'>, context: SignalQualityContext): string {
  const symbol = signal.symbol.toUpperCase().split(/\s+/)[0];
  const inNews = context.newsText ? containsSymbol(context.newsText.toUpperCase(), symbol) : false;
  const inTelegram = context.telegramText ? containsSymbol(context.telegramText.toUpperCase(), symbol) : false;
  if (inNews && inTelegram) return 'news+telegram';
  if (inNews) return 'news';
  if (inTelegram) return 'telegram';
  return context.source || 'model';
}

function enrichSignalQuality(signal: AISignalOutput, context: SignalQualityContext = {}): AISignalOutput | null {
  const metrics = calculateSignalMetrics(signal);
  if (!metrics) return null;

  const minConfidence = context.minConfidence ?? 62;
  const minRewardRisk = context.minRewardRisk ?? 1.8;
  const symbolRoot = signal.symbol.toUpperCase().split(/\s+/)[0];
  const isWatchlisted = context.watchlist?.some((item) => item.toUpperCase() === symbolRoot) ?? true;
  const support = supportLabel(signal, context);

  if (!isWatchlisted && !NSE_SYMBOLS.has(symbolRoot) && !context.isDynamicallyResolved) return null;
  if (signal.confidence < minConfidence) return null;
  if (metrics.rewardRisk < minRewardRisk) return null;
  if (metrics.riskPct > 8) return null;
  if (metrics.rewardPct < 1) return null;

  let qualityScore = signal.confidence;
  qualityScore += Math.min(12, Math.max(0, metrics.rewardRisk - minRewardRisk) * 8);
  if (support === 'news+telegram') qualityScore += 8;
  else if (support === 'news' || support === 'telegram') qualityScore += 3;
  if (/breakout|volume|result|earnings|order|upgrade|guidance|sector|momentum/i.test(signal.reasoning)) qualityScore += 4;
  if (/rumou?r|operator|jackpot|sure shot|guaranteed|upper circuit|multibagger/i.test(signal.reasoning)) qualityScore -= 12;

  const roundedQuality = Math.max(0, Math.min(95, Math.round(qualityScore)));
  const roundedRR = Math.round(metrics.rewardRisk * 100) / 100;
  const roundedRisk = Math.round(metrics.riskPct * 10) / 10;
  const roundedReward = Math.round(metrics.rewardPct * 10) / 10;

  return {
    ...signal,
    symbol: signal.symbol.toUpperCase(),
    confidence: roundedQuality,
    reasoning: `${signal.reasoning} | Quality ${roundedQuality}/100, R:R ${roundedRR}, risk ${roundedRisk}%, reward ${roundedReward}%, support ${support}. Manual approval recommended.`,
  };
}

function filterAndRankSignals(signals: AISignalOutput[], context: SignalQualityContext = {}): AISignalOutput[] {
  const bestByKey = new Map<string, AISignalOutput>();

  for (const signal of signals) {
    const enriched = enrichSignalQuality(signal, context);
    if (!enriched) continue;
    const key = `${enriched.symbol}:${enriched.action}`;
    const existing = bestByKey.get(key);
    if (!existing || enriched.confidence > existing.confidence) {
      bestByKey.set(key, enriched);
    }
  }

  return [...bestByKey.values()]
    .sort((a, b) => {
      const metricsA = calculateSignalMetrics(a);
      const metricsB = calculateSignalMetrics(b);
      const rrA = metricsA?.rewardRisk || 0;
      const rrB = metricsB?.rewardRisk || 0;
      return (b.confidence + rrB * 4) - (a.confidence + rrA * 4);
    })
    .slice(0, 5);
}

// ─── Batch Telegram Parse Result ────────────────────────────────────────────

export interface BatchTelegramParseResult {
  results: Array<{
    messageIndex: number;
    isValid: boolean;
    signal?: {
      symbol: string;
      action: 'BUY' | 'SELL';
      entryPrice: number;
      targetPrice: number;
      stopLoss: number;
      confidence: number;
    };
    signals?: Array<{
      symbol: string;
      action: 'BUY' | 'SELL';
      entryPrice: number;
      targetPrice: number;
      stopLoss: number;
      confidence: number;
    }>;
    reasoning?: string;
    modelName?: string;
  }>;
}

// ─── Market News Analysis ────────────────────────────────────────────────────

const NEWS_ANALYSIS_SYSTEM_PROMPT = `You are an expert Indian stock market analyst. Analyze the following market news AND Telegram trading signals to provide consolidated trading signals.

You will receive BOTH news articles AND Telegram signal recommendations. Cross-reference them:
- If a Telegram signal aligns with positive news sentiment, INCREASE confidence
- If news contradicts a Telegram signal, DECREASE confidence and note the divergence
- If news reveals opportunities not covered by Telegram, ADD new signals
- Combine both sources for the most accurate market view

Respond ONLY with valid JSON in this exact format:
{
  "signals": [
    {
      "symbol": "RELIANCE",
      "action": "BUY",
      "confidence": 75,
      "entryPrice": 2900,
      "targetPrice": 3100,
      "stopLoss": 2800,
      "reasoning": "Detailed analysis combining news + telegram signals"
    }
  ],
  "marketSentiment": "bullish",
  "summary": "Brief market overview combining news and signal data"
}

Rules:
- Only recommend NSE/BSE listed stocks
- Be conservative with confidence scores (rarely above 85)
- Always provide entry, target, and stop loss prices in INR
- Only produce a signal when entry, target, and stop-loss are explicit and directionally valid
- Minimum reward-to-risk must be 1.8:1; reject setups with poor risk/reward
- Prefer signals confirmed by both Telegram flow and current market news; downgrade unsupported Telegram-only tips
- Reject rumor, jackpot, guaranteed profit, operator, pump, or upper-circuit style messages
- Consider current market conditions
- Focus on Indian market (NIFTY, SENSEX stocks)
- Limit signals to at most 3-5 most actionable ones; quality is more important than quantity
- If no clear signals exist, return empty signals array
- In reasoning, mention which source(s) support the signal (news/telegram/both)`;

export const OMNIROUTE_TEXT_MODELS = [
  {
    id: 'auto',
    name: 'OmniRoute Auto',
    description: 'Smart routing — OmniRoute picks the best available provider/model with auto-fallback.',
  },
  {
    id: 'auto/coding',
    name: 'Coding Combo',
    description: 'Priority + fill-first routing optimized for coding and agentic workloads.',
  },
  {
    id: 'auto/cheap',
    name: 'Cheap Combo',
    description: 'Cost-optimized routing — drains free tiers before paid APIs.',
  },
  {
    id: 'auto/fast',
    name: 'Fast Combo',
    description: 'Lowest-latency routing across providers.',
  },
] as const;

export const DEFAULT_OMNIROUTE_MODEL = OMNIROUTE_TEXT_MODELS[0].id;

export const DEFAULT_OMNIROUTE_BASE_URL = 'http://localhost:20128/v1/chat/completions';

export const GROQ_TEXT_MODELS = [
  {
    id: 'llama-3.3-70b-versatile',
    name: 'Llama 3.3 70B Versatile (Groq)',
    description: 'Fast, high-quality general-purpose 70B instruction model on Groq.',
  },
  {
    id: 'meta-llama/llama-4-scout-17b-16e-instruct',
    name: 'Llama 4 Scout 17B (Groq)',
    description: 'Latest generation Llama 4 Scout model. Optimized for highly accurate instruction-following and coding/reasoning.',
  },
  {
    id: 'qwen/qwen3-32b',
    name: 'Qwen 3 32B (Groq)',
    description: 'State-of-the-art open-source 32B model, highly accurate for logical and structural parsing.',
  },
] as const;

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  jsonMode?: boolean;
}

export interface ConfiguredAIProvider {
  provider: 'omniroute' | 'groq';
  model: string;
  hasToken: boolean;
  tokenSource: 'env' | 'settings' | 'none';
}

async function getBotSetting(key: string): Promise<string | null> {
  try {
    const setting = await db.botSetting.findUnique({ where: { key } });
    return setting?.value || null;
  } catch {
    return null;
  }
}

export async function getConfiguredAIProvider(): Promise<ConfiguredAIProvider> {
  const provider = ((await getBotSetting('aiProvider')) || 'omniroute') as 'omniroute' | 'groq';

  if (provider === 'groq') {
    const envToken = process.env.GROQ_API_KEY || '';
    const settingsToken = await getBotSetting('groqApiKey');
    const configuredModel = process.env.GROQ_MODEL || await getBotSetting('groqModel') || 'llama-3.3-70b-versatile';
    const token = envToken || settingsToken || '';
    return {
      provider: 'groq',
      model: configuredModel,
      hasToken: Boolean(token),
      tokenSource: envToken ? 'env' : settingsToken ? 'settings' : 'none',
    };
  } else {
    // omniroute (also migrates any legacy huggingface/gemini aiProvider value)
    const envToken = process.env.OMNIROUTE_KEY || '';
    const settingsToken = await getBotSetting('omniRouteKey');
    const configuredModel = process.env.OMNIROUTE_MODEL || await getBotSetting('omniRouteModel') || DEFAULT_OMNIROUTE_MODEL;
    const token = envToken || settingsToken || '';
    return {
      provider: 'omniroute',
      model: configuredModel,
      // OmniRoute works zero-config (no key) out of the box, so it is always usable.
      hasToken: true,
      tokenSource: envToken ? 'env' : settingsToken ? 'settings' : 'none',
    };
  }
}

function stripThinkingBlocks(content: string): string {
  return content.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function isRateLimitError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err || '');
  return message.includes('429') || message.toLowerCase().includes('too many requests') || message.toLowerCase().includes('rate limit');
}

export async function callConfiguredChatCompletion(
  messages: ChatMessage[],
  options: ChatCompletionOptions = {}
): Promise<{ content: string; model: string }> {
  const providerConfig = await getConfiguredAIProvider();
  
  let token = '';
  let baseUrl = '';
  let model = options.model || providerConfig.model;
  
  if (providerConfig.provider === 'groq') {
    token = process.env.GROQ_API_KEY || await getBotSetting('groqApiKey') || '';
    baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
  } else {
    // omniroute (first priority / default provider)
    token = process.env.OMNIROUTE_KEY || await getBotSetting('omniRouteKey') || '';
    baseUrl = process.env.OMNIROUTE_BASE_URL
      || await getBotSetting('omniRouteBaseUrl')
      || DEFAULT_OMNIROUTE_BASE_URL;
    if (options.jsonMode) {
      // Pin structured-JSON calls to a fixed model verified to honor
      // json_object. Combo routing (auto/best-reasoning) can silently fall
      // back to models that return broken JSON (e.g. felo-chat), so never
      // rely on a combo here. Override via OMNIROUTE_JSON_MODEL env or the
      // omniRouteJsonModel setting.
      model = process.env.OMNIROUTE_JSON_MODEL
        || await getBotSetting('omniRouteJsonModel')
        || 'oc/nemotron-3-ultra-free';
    } else if (!model || ['auto', 'auto/coding', 'auto/cheap', 'auto/fast'].includes(model)) {
      model = DEFAULT_OMNIROUTE_MODEL;
    }
  }

  if (!token && providerConfig.provider !== 'omniroute') {
    throw new Error(`${providerConfig.provider.toUpperCase()} API Key/Token is not configured. Add env variables or save the key in AI Model settings.`);
  }

  const maxRetries = 2;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);

    try {
      console.log(`[AI Engine] Chat completion using ${providerConfig.provider}: ${model} (Attempt ${attempt + 1}/${maxRetries + 1})`);
      
      const requestPayload: any = {
        model,
        messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1200,
        stream: false,
      };

      const isGroqQwen = providerConfig.provider === 'groq' && model.toLowerCase().includes('qwen');
      if (options.jsonMode && !isGroqQwen) {
        requestPayload.response_format = { type: 'json_object' };
      }

      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestPayload),
        signal: controller.signal,
      });

      const responseText = await res.text();
      if (!res.ok) {
        throw new Error(`${providerConfig.provider} ${model} failed (${res.status}): ${responseText.slice(0, 500)}`);
      }

      const payload = JSON.parse(responseText);
      const content = stripThinkingBlocks(payload?.choices?.[0]?.message?.content || '');
      if (!content) {
        throw new Error(`${providerConfig.provider} ${model} returned an empty response`);
      }
      if (options.jsonMode && !extractJsonObject(content)) {
        throw new Error(
          `${providerConfig.provider} ${model} returned no valid JSON in jsonMode (response may be broken): ${content.slice(0, 200)}`
        );
      }

      markLLMSuccess();
      clearTimeout(timeout);
      return { content, model };
    } catch (err: any) {
      clearTimeout(timeout);
      if (isRateLimitError(err) || err.message?.includes('429') || err.message?.includes('503') || err.message?.includes('500')) {
        if (attempt < maxRetries) {
          attempt++;
          const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
          console.warn(`[AI Engine] API failed, retrying in ${Math.round(backoff)}ms...`);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        } else {
          markLLMRateLimited();
        }
      }
      console.error(`[AI Engine] Model ${model} failed permanently after ${attempt + 1} attempts:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }
  
  throw new Error('AI Engine retry loop failed unexpectedly');
}

// ─── Rule-based Telegram Signal Parser (NO AI needed!) ─────────────────────

export const NSE_SYMBOLS = new Set([
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'SBIN', 'ITC', 'BHARTIARTL',
  'WIPRO', 'MARUTI', 'HCLTECH', 'ASIANPAINT', 'KOTAKBANK', 'LT', 'AXISBANK',
  'BAJFINANCE', 'BAJAJFINSV', 'TITAN', 'SUNPHARMA', 'TATAMOTORS', 'TATASTEEL',
  'TATACONSUM', 'POWERGRID', 'NTPC', 'ADANIENT', 'ADANIPORTS', 'ULTRACEMCO',
  'NESTLEIND', 'HINDUNILVR', 'TECHM', 'INDUSINDBK', 'ONGC', 'COALINDIA',
  'BPCL', 'HEROMOTOCO', 'EICHERMOT', 'DRREDDY', 'CIPLA', 'DIVISLAB',
  'APOLLOHOSP', 'MANKIND', 'SIEMENS', 'TRENT', 'PIDILITIND', 'HAVELLS',
  'DABUR', 'GODREJCP', 'BRITANNIA', 'M&M', 'M&MFIN', 'BANKBARODA',
  'PNB', 'CANBK', 'UNIONBANK', 'IDFCFIRSTB', 'YESBANK', 'SAIL',
  'JSWSTEEL', 'HINDALCO', 'VEDL', 'NMDC', 'MOIL', 'BEL', 'BEML',
  'HAL', 'BDL', 'COFORGE', 'PERSISTENT', 'MPHASIS', 'LTTS',
  'ELECON', 'JTLIND', 'JPASSOCIAT', 'HCC', 'TITAGARH', 'THOMASCOOK',
  'NRBBEARING', 'NLCINDIA', 'NCC', 'GRMOVER', 'EVEREADY', 'ALEMBICLTD',
  'RESPONIND', 'PAISALO', 'NIITMTS', 'GANDHAR', 'LTIM', 'IRFC', 'RVNL',
  'INDIGO', 'IGL', 'SUZLON', 'PREMEXPLN', 'APOLLO', 'MMTC', 'PGEL',
  'WALCHANNAG', 'UNIVCABLES', 'KSH', 'AYEFIN', 'EXICOM', 'QUADFUTURE',
  'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY',
]);

export const COMPANY_ALIASES: Record<string, string> = {
  'hdfc bank': 'HDFCBANK',
  hdfc: 'HDFCBANK',
  'icici bank': 'ICICIBANK',
  'state bank of india': 'SBIN',
  sbi: 'SBIN',
  'itc ltd': 'ITC',
  itc: 'ITC',
  'reliance industries': 'RELIANCE',
  reliance: 'RELIANCE',
  'tata consultancy services': 'TCS',
  infosys: 'INFY',
  'interglobe aviation': 'INDIGO',
  indigo: 'INDIGO',
  'premier explosives': 'PREMEXPLN',
  'premier explosives limited': 'PREMEXPLN',
  'larsen & toubro': 'LT',
  'larsen and toubro': 'LT',
  'elecon engineering': 'ELECON',
  'jtl industries': 'JTLIND',
  'suzlon energy': 'SUZLON',
  suzlon: 'SUZLON',
  'apollo micro system': 'APOLLO',
  'apollo micro systems': 'APOLLO',
  'walchandnagar ind': 'WALCHANNAG',
  walchandnagar: 'WALCHANNAG',
  'universal cables': 'UNIVCABLES',
  'aye finance': 'AYEFIN',
  'ksh intl': 'KSH',
  'ksh international': 'KSH',
  mmtc: 'MMTC',
  pgel: 'PGEL',
  exicom: 'EXICOM',
  quadfuture: 'QUADFUTURE',
};

export const TELEGRAM_REFERENCE_PRICES: Record<string, number> = {
  PREMEXPLN: 683.3,
  JTLIND: 76.08,
  MMTC: 76,
  APOLLO: 409,
  KSH: 903,
  AYEFIN: 153,
  PGEL: 520,
  WALCHANNAG: 265,
  UNIVCABLES: 1217,
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function containsSymbol(text: string, symbol: string): boolean {
  return new RegExp(`(^|[^A-Z0-9])${escapeRegex(symbol.toUpperCase())}([^A-Z0-9]|$)`).test(text);
}

export function containsAlias(text: string, alias: string): boolean {
  return new RegExp(`(^|[^A-Z0-9])${escapeRegex(alias.toUpperCase())}([^A-Z0-9]|$)`).test(text);
}

function resolveRelatedSymbols(text: string, aiSymbols: string[] = []): string[] {
  const upper = text.toUpperCase();
  const resolved = new Set<string>();

  for (const [alias, symbol] of Object.entries(COMPANY_ALIASES)) {
    if (containsAlias(upper, alias)) resolved.add(symbol);
  }

  for (const raw of aiSymbols) {
    const symbol = raw.trim().toUpperCase().replace(/[^A-Z0-9&-]/g, '');
    if (!symbol || symbol.length > 15) continue;
    
    // Accept the AI's extracted symbol. If it's hallucinated, the live price check will later fail and drop it safely.
    resolved.add(symbol);
  }

  for (const sym of NSE_SYMBOLS) {
    if (containsSymbol(upper, sym)) resolved.add(sym);
  }

  return [...resolved].slice(0, 5);
}

function extractSymbolFromText(text: string): string | null {
  const upper = text.toUpperCase();

  const xauusdMatch = upper.match(/#?\bXAU\s*USD\b|#?\bXAUUSD\b/);
  if (xauusdMatch) return 'XAUUSD';

  for (const [alias, symbol] of Object.entries(COMPANY_ALIASES)) {
    if (containsAlias(upper, alias)) return symbol;
  }

  // Check for known NSE symbols
  for (const sym of NSE_SYMBOLS) {
    // Match whole word only
    if (containsSymbol(upper, sym)) return sym;
  }

  // Match NIFTY options pattern: NIFTY 24000 CE, BANKNIFTY 52000 PE
  const niftyOptMatch = upper.match(/(NIFTY|BANKNIFTY|FINNIFTY)\s+(\d+)\s+(CE|PE)/);
  if (niftyOptMatch) return `${niftyOptMatch[1]} ${niftyOptMatch[2]} ${niftyOptMatch[3]}`;

  // Match generic symbol pattern: BUY RELIANCE @ 2900
  const buySellMatch = upper.match(/(?:BUY|SELL)\s+([A-Z]{3,})(?:\s+@|\s+AT|\s+ABOVE|\s+BELOW|\s+AROUND|\s+₹|\s+RS|\.|\s|$)/);
  if (buySellMatch && NSE_SYMBOLS.has(buySellMatch[1])) return buySellMatch[1];

  // Match SYMBOL with price: RELIANCE 2900
  const symPriceMatch = upper.match(/\b([A-Z]{3,})\s+(\d{3,})\b/);
  if (symPriceMatch && NSE_SYMBOLS.has(symPriceMatch[1])) return symPriceMatch[1];

  return null;
}

function extractPrice(text: string, patterns: RegExp[]): number | null {
  for (const pat of patterns) {
    const match = text.toUpperCase().match(pat);
    if (match) {
      const price = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(price) && price > 0) return price;
    }
  }
  return null;
}

/**
 * Strip standard Indian Telegram channel disclaimer boilerplate before parsing.
 * Disclaimers like "Above calls are Not Buy or Sell Levels" cause false SELL matches.
 */
function stripDisclaimers(text: string): string {
  return text
    // Remove lines starting with or containing disclaimer phrases
    .replace(/(?:disclaimer|above calls are not buy or sell|for educational purposes|consult your financial advisor|sebi registered|not buy or sell levels)[^\n]*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}


function extractAction(text: string): 'BUY' | 'SELL' | null {
  // Strip disclaimers first so "Not Buy or Sell Levels" doesn't trigger false SELL
  const cleanText = stripDisclaimers(text);
  const upper = cleanText.toUpperCase();
  // Check for SELL keywords first (more specific)
  if (/\b(?:SELL|SHORT|EXIT\s+LONG|CLOSE\s+LONG|BEARISH\s+VIEW|BEARISH\s+BIAS|PUT|PE\b)\b/.test(upper)) return 'SELL';
  if (/\b(?:BUY|LONG|BULLISH|CALL|CE\b|ACCUMULATE|ENTER)\b/.test(upper)) return 'BUY';
  // Indian Telegram channel idioms
  if (/\b(?:HOLDING\s+VIEW|BULLISH\s+VIEW|POSITIVE\s+VIEW|UPSIDE\s+VIEW|ACCUMULATE\s+VIEW)\b/.test(upper)) return 'BUY';
  if (/\b(?:BEARISH\s+VIEW|NEGATIVE\s+VIEW|DOWNSIDE\s+VIEW)\b/.test(upper)) return 'SELL';
  // "CASH <price> SUPPORT <lower> VIEW <higher>" — VIEW higher than CASH = BUY
  const cashMatch = upper.match(/\bCASH\s+(\d{3,7})\b/);
  const viewMatch = upper.match(/\bVIEW\s+(\d{3,7})\b/);
  if (cashMatch && viewMatch) {
    if (parseFloat(viewMatch[1]) > parseFloat(cashMatch[1])) return 'BUY';
    if (parseFloat(viewMatch[1]) < parseFloat(cashMatch[1])) return 'SELL';
  }
  return null;
}


function extractNumericLevels(text: string): number[] {
  const levels: number[] = [];
  for (const match of text.matchAll(/(?:₹|RS\.?\s*)?\b(\d{1,6}(?:\.\d+)?)\b(?!\s*%)/gi)) {
    const value = Number(match[1].replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) continue;
    if (value >= 1900 && value <= 2100) continue;
    levels.push(value);
  }
  return levels;
}

function extractTargetFromRange(text: string, action: 'BUY' | 'SELL', entry: number | null): number | null {
  const matches = [
    ...text.matchAll(/\b(?:TO|FOR)\s+₹?\s*(\d{1,6}(?:\.\d+)?)(?:\s*[-–]\s*(\d{1,6}(?:\.\d+)?))?\+?\b/gi),
    ...text.matchAll(/\b(\d{1,6}(?:\.\d+)?)\s*(?:TO|[-–])\s*(\d{1,6}(?:\.\d+)?)\+?\b/gi),
  ];

  for (const match of matches) {
    const values = match
      .slice(1)
      .filter(Boolean)
      .map((value) => Number(value.replace(/,/g, '')))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (values.length === 0) continue;
    const candidate = action === 'BUY' ? Math.max(...values) : Math.min(...values);
    if (!entry || (action === 'BUY' ? candidate > entry : candidate < entry)) return candidate;
  }

  return null;
}

function inferTelegramAction(text: string, knownSymbol?: string | null): 'BUY' | 'SELL' | null {
  // First: try explicit action extraction (stripping disclaimers first)
  const explicit = extractAction(text);
  if (explicit) return explicit;

  const cleanText = stripDisclaimers(text);
  const upper = cleanText.toUpperCase();

  // --- Sentiment scoring approach (context-aware, not format-specific) ---
  // Score bullish vs bearish signals from the cleaned text
  let bullScore = 0;
  let bearScore = 0;

  // Bullish sentiment indicators
  if (/\b(BREAKOUT|UPSIDE|ACCUMULATE|MOMENTUM|GOOD\s+OPPORTUNITY|WATCHLIST|SETUP|HOLDING|POSITIVE|SUPPORT\s+HOLDING|BOUNCE|RECOVERY)\b/.test(upper)) bullScore += 2;
  if (/\b(BTST|SWING|POSITIONAL|DELIVERY|INTRADAY\s+BUY|GOOD\s+OPENING)\b/.test(upper)) bullScore += 1;
  if (/🔥|🚀|📈|💚|✅/.test(cleanText)) bullScore += 1;

  // Bearish sentiment indicators
  if (/\b(BREAKDOWN|DOWNSIDE|REJECTION|SELL\s+SIDE|SHORT\s+SIDE|BEARISH|AVOID|EXIT|BOOK\s+PROFIT)\b/.test(upper)) bearScore += 2;
  if (/\b(CRACK|FALL|DUMP|RESISTANCE\s+REJECT|BELOW\s+SUPPORT)\b/.test(upper)) bearScore += 1;
  if (/📉|🔴|❌/.test(cleanText)) bearScore += 1;

  // Price relationship check: If we can find a reference price and a "view/target" price,
  // compare them to determine direction — this works for ANY format, not just one specific pattern
  const allPrices: number[] = [];
  for (const m of cleanText.matchAll(/(?:^|[\s:@₹=])((\d{1,4},)?\d{3,7}(?:\.\d{1,2})?)\b/gm)) {
    const val = parseFloat(m[1].replace(/,/g, ''));
    if (Number.isFinite(val) && val > 50 && val < 200000) allPrices.push(val);
  }

  // Find "view", "target", "objective" price and compare to the minimum (likely entry/CMP)
  const viewPriceMatch = cleanText.match(/\b(?:VIEW|TARGET|TGT|TP|OBJECTIVE|UPSIDE|POTENTIAL)(?:[12])?(?:\s+|\s*[:\-]\s*)₹?\s*([\d,]+(?:\.\d+)?)\b/i);
  const supportPriceMatch = cleanText.match(/\b(?:SUPPORT|SL|STOP\s*LOSS)(?:[12])?(?:\s+|\s*[:\-]\s*)₹?\s*([\d,]+(?:\.\d+)?)\b/i);
  const entryPriceMatch = cleanText.match(/\b(?:CASH|CMP|LTP|ENTRY|PRICE|ABOVE|BELOW|@|AROUND)(?:[12])?(?:\s+|\s*[:\-]\s*)₹?\s*([\d,]+(?:\.\d+)?)\b/i);

  const entryPrice = entryPriceMatch ? parseFloat(entryPriceMatch[1].replace(/,/g, '')) : (allPrices.length > 0 ? Math.min(...allPrices) : null);
  const viewPrice = viewPriceMatch ? parseFloat(viewPriceMatch[1].replace(/,/g, '')) : null;
  const supportPrice = supportPriceMatch ? parseFloat(supportPriceMatch[1].replace(/,/g, '')) : null;

  if (entryPrice && viewPrice) {
    if (viewPrice > entryPrice) bullScore += 3;  // Target above entry = bullish
    else if (viewPrice < entryPrice) bearScore += 3;  // Target below entry = bearish
  }
  if (entryPrice && supportPrice) {
    if (supportPrice < entryPrice) bullScore += 1;  // Support below entry = typical BUY setup
    else if (supportPrice > entryPrice) bearScore += 1;  // Support above entry = typical SELL setup
  }

  if (bullScore > bearScore) return 'BUY';
  if (bearScore > bullScore) return 'SELL';

  // Default: if symbol has numeric levels and nothing else, assume BUY (more common in Indian channels)
  if ((knownSymbol || extractSymbolFromText(text)) && allPrices.length > 0) return 'BUY';

  return null;
}

function hasTelegramRecommendationIntent(text: string): boolean {
  if (/\b(BUY|SELL|SHORT|LONG|ACCUMULATE|ENTRY|ABOVE|BELOW|CMP|TARGET|TGT|TP|STOP.?LOSS|SL|SUPPORT|RESISTANCE|BREAKOUT|BREAKDOWN|READY|EXPLODE|SETUP|WATCHLIST|GOOD\s+OPPORTUNITY|VIEW|BTST|INTRADAY|SWING|POSITIONAL|CE\b|PE\b|CALL|PUT)\b|#\s*[A-Z0-9&-]{2,}/i.test(text)) {
    return true;
  }
  return Boolean(extractSymbolFromText(text) && (extractNumericLevels(text).length > 0 || /🔥|🚀|📈/.test(text)));
}

function roundSignalPrice(value: number): number {
  if (value >= 1000) return Math.round(value * 20) / 20;
  return Math.round(value * 100) / 100;
}

export function buildTrustedTelegramCandidate(
  message: string,
  referencePrice?: number | null,
  resolvedSymbol?: string | null
): TelegramParseResult {
  const text = message.trim();
  if (text.length < 4) return { isValid: false, reasoning: 'Trusted Telegram fallback skipped: message too short', source: 'rule' };

  const symbol = resolvedSymbol?.toUpperCase() || extractSymbolFromText(text);
  if (!symbol) return { isValid: false, reasoning: 'Trusted Telegram fallback skipped: no supported symbol found', source: 'rule' };
  if (!hasTelegramRecommendationIntent(text) && !(resolvedSymbol && (extractNumericLevels(text).length > 0 || /🔥|🚀|📈/.test(text)))) {
    return { isValid: false, reasoning: 'Trusted Telegram fallback skipped: no recommendation intent found', source: 'rule' };
  }

  const action = inferTelegramAction(text, symbol);
  if (!action) return { isValid: false, reasoning: 'Trusted Telegram fallback skipped: no trade direction inferred', source: 'rule' };

  // ── Context-aware price extraction ────────────────────────────────────────
  // Instead of matching specific keyword formats, we collect ALL price mentions
  // and assign their roles (entry/target/SL) based on their relationship to each
  // other and the inferred trade direction. This works for any channel format.

  const cleanText = stripDisclaimers(text);

  // Collect candidate prices with their semantic context labels
  const pricesByLabel: Record<string, number | null> = {
    // Entry candidates: current price, where stock is trading now
    entry: extractPrice(cleanText, [
      /\b(?:CASH|CMP|LTP|PRICE|ENTRY|ENTER|BUY\s+AT|SELL\s+AT|ABOVE|BELOW|AROUND|CURRENTLY|TRADING\s+AT|NOW\s+AT)(?:[12])?(?:\s+|\s*[:\-]\s*)₹?\s*([\d,]+(?:\.\d+)?)/i,
      /@\s*₹?\s*([\d,]+(?:\.\d+)?)/,  // BUY RELIANCE @ 2900 format
      /\b(?:CE|PE|CALL|PUT)\b\s*(?:(?:@|ABOVE|BELOW|AT)\s*)?₹?\s*([\d,]+(?:\.\d+)?)/i, // Option strikes: 800 CE 35
    ]),
    // Target/objective candidates: where price is headed
    target: extractPrice(cleanText, [
      /\b(?:TARGET|TGT|TP|VIEW|OBJECTIVE|UPSIDE|POTENTIAL|AIM|EXPECT)(?:[12])?(?:\s+|\s*[:\-]\s*)₹?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
    // Stop candidates: risk level
    stop: extractPrice(cleanText, [
      /\b(?:SL|STOP[\s-]?LOSS|STOP|STOPLOSS)(?:[12])?(?:\s+|\s*[:\-]\s*)(?:ONLY\s+)?₹?\s*([\d,]+(?:\.\d+)?)/i,
      /\b(?:SUPPORT|SUPP)(?:\s+AT|\s*[:\-]\s|\s+)₹?\s*([\d,]+(?:\.\d+)?)/i,
      /\b(?:RESISTANCE|RES)(?:\s+AT|\s*[:\-]\s|\s+)₹?\s*([\d,]+(?:\.\d+)?)/i,
    ]),
  };

  const fallbackReferencePrice = TELEGRAM_REFERENCE_PRICES[symbol] || null;
  const numericLevels = extractNumericLevels(cleanText);

  // Entry price: use labeled entry, then live reference, then smallest numeric price seen
  const explicitEntry = pricesByLabel.entry;
  const entryPrice = roundSignalPrice(
    explicitEntry || referencePrice || numericLevels[0] || fallbackReferencePrice || 0
  );
  if (!entryPrice) {
    return {
      isValid: false,
      reasoning: `Trusted Telegram fallback found ${symbol} ${action}, but no price or live reference price was available`,
      source: 'rule',
    };
  }

  // Target: use labeled target, then range extraction
  // Validate direction: target must be above entry for BUY, below for SELL
  let explicitTarget = pricesByLabel.target;
  if (explicitTarget && (action === 'BUY' ? explicitTarget <= entryPrice : explicitTarget >= entryPrice)) {
    explicitTarget = null; // discard directionally invalid target
  }
  const rangeTarget = extractTargetFromRange(text, action, entryPrice);

  // Stop: use labeled stop
  // Validate direction: SL must be below entry for BUY, above for SELL
  let support = pricesByLabel.stop;
  if (support && (action === 'BUY' ? support >= entryPrice : support <= entryPrice)) {
    support = null; // discard directionally invalid stop
  }

  let targetPrice = explicitTarget || rangeTarget || null;
  let stopLoss = support || null;


  const hasExplicitTarget = Boolean(targetPrice);
  const hasExplicitStop = Boolean(stopLoss);

  if (!targetPrice || (action === 'BUY' ? targetPrice <= entryPrice : targetPrice >= entryPrice)) {
    targetPrice = action === 'BUY' ? entryPrice * 1.04 : entryPrice * 0.96;
  }
  if (!stopLoss || (action === 'BUY' ? stopLoss >= entryPrice : stopLoss <= entryPrice)) {
    stopLoss = action === 'BUY' ? entryPrice * 0.98 : entryPrice * 1.02;
  }

  let confidence = 58;
  if (referencePrice) confidence += 4;
  else if (fallbackReferencePrice) confidence -= 2;
  if (hasExplicitTarget) confidence += 5;
  if (hasExplicitStop) confidence += 5;
  if (/\b(BREAKOUT|SUPPORT|RESISTANCE|ABOVE|BTST|SWING|INTRADAY|POSITIONAL|READY|SETUP)\b/i.test(text)) confidence += 4;
  if (/\b(PROFIT\s+BOOKED|DONE|TRAIL\s+SL|AGAIN\s+\d+%|PAST\s+PERFORMANCE)\b/i.test(text)) confidence -= 8;
  confidence = Math.max(50, Math.min(74, confidence));

  const estimatedParts = [
    !explicitEntry && referencePrice ? 'entry from live price' : '',
    !explicitEntry && !referencePrice && fallbackReferencePrice ? 'entry from last-seen reference price' : '',
    !hasExplicitTarget ? 'target estimated' : '',
    !hasExplicitStop ? 'stop-loss estimated' : '',
  ].filter(Boolean);

  return {
    isValid: true,
    signal: {
      symbol,
      action,
      entryPrice,
      targetPrice: roundSignalPrice(targetPrice),
      stopLoss: roundSignalPrice(stopLoss),
      confidence,
    },
    reasoning: [
      `Trusted Telegram estimate: ${symbol} ${action} inferred from channel message.`,
      estimatedParts.length ? `Missing fields filled for manual review (${estimatedParts.join(', ')}).` : 'Explicit levels were available in the message.',
      'Do not auto-execute this signal without manual approval.',
      `Original: ${text.substring(0, 500)}`,
    ].join(' '),
    source: 'rule',
  };
}

/**
 * Rule-based Telegram signal parser — works WITHOUT any AI model.
 * Used as a fallback when the AI provider is rate-limited or unavailable.
 */
export function ruleBasedParseTelegramSignal(message: string): TelegramParseResult {
  const text = message.trim();

  // Skip obviously non-signal messages
  if (text.length < 15) return { isValid: false, reasoning: 'Message too short' };

  const upper = text.toUpperCase();

  // Check if it looks like a trading signal
  const hasSignalKeywords = /\b(?:BUY|SELL|TARGET|TGT|STOP.?LOSS|SL|ENTRY|BREAKOUT|SUPPORT|RESISTANCE|CE\b|PE\b|CALL|PUT|BULLISH|BEARISH|INTRADAY|POSITIONAL|SWING)\b/i.test(text);
  if (!hasSignalKeywords) return { isValid: false, reasoning: 'No trading signal keywords detected' };

  const symbol = extractSymbolFromText(text);
  if (!symbol) return { isValid: false, reasoning: 'Could not identify NSE/BSE symbol' };

  const action = extractAction(text);
  if (!action) return { isValid: false, reasoning: 'Could not determine BUY/SELL action' };

  // Extract prices
  const entryPrice = extractPrice(text, [
    /(?:ENTRY|ENTER|BUY\s+AT|SELL\s+AT|@|AROUND|ABOVE|BELOW)\s*:?\s*₹?\s*([\d,]+(?:\.\d+)?)/i,
    /₹\s*([\d,]+(?:\.\d+)?)/,
    /RS\.?\s*([\d,]+(?:\.\d+)?)/i,
  ]) || 0;

  const targetPrice = extractPrice(text, [
    /(?:TARGET|TGT|TP)\s*(?:1|:?-?\s*)?₹?\s*([\d,]+(?:\.\d+)?)/i,
  ]);

  const stopLoss = extractPrice(text, [
    /(?:STOP.?LOSS|SL|STOP)\s*(?:1|:?-?\s*)?₹?\s*([\d,]+(?:\.\d+)?)/i,
  ]);

  if (!entryPrice || !targetPrice || !stopLoss) {
    return {
      isValid: false,
      reasoning: 'Rejected: clear entry, target, and stop-loss are required',
    };
  }

  // Calculate confidence based on how many components were found
  let confidence = 55; // Base confidence for complete rule-based parse
  if (/\b(?:VOLUME|BREAKOUT|RESULT|EARNINGS|SUPPORT|RESISTANCE|ABOVE|BELOW)\b/i.test(text)) confidence += 8;
  if (/\b(?:INTRADAY|BTST|SWING|POSITIONAL)\b/i.test(text)) confidence += 4;
  if (/\b(?:SURE|GUARANTEED|JACKPOT|OPERATOR|UPPER\s+CIRCUIT)\b/i.test(text)) confidence -= 18;
  // Cap at 70 for rule-based (AI can go higher)
  confidence = Math.min(confidence, 70);

  const candidate: AISignalOutput = {
    symbol,
    action,
    entryPrice: Math.round(entryPrice * 100) / 100,
    targetPrice: Math.round(targetPrice * 100) / 100,
    stopLoss: Math.round(stopLoss * 100) / 100,
    confidence,
    reasoning: `Rule-based parse: ${symbol} ${action} detected from message keywords`,
  };

  const qualitySignal = enrichSignalQuality(candidate, {
    source: 'telegram',
    telegramText: text,
    minConfidence: 58,
    minRewardRisk: 1.6,
  });
  if (!qualitySignal) {
    return {
      isValid: false,
      reasoning: 'Rejected: signal failed direction, confidence, or reward/risk quality rules',
    };
  }

  return {
    isValid: true,
    signal: {
      symbol: qualitySignal.symbol,
      action: qualitySignal.action,
      entryPrice: qualitySignal.entryPrice,
      targetPrice: qualitySignal.targetPrice,
      stopLoss: qualitySignal.stopLoss,
      confidence: qualitySignal.confidence,
    },
    reasoning: qualitySignal.reasoning,
    source: 'rule',
  };
}

/**
 * Batch rule-based parser for Telegram messages (no AI needed).
 */
export function ruleBasedBatchParseTelegramSignals(messages: string[]): BatchTelegramParseResult {
  return {
    results: messages.map((msg, index) => {
      const parsed = ruleBasedParseTelegramSignal(msg);
      return {
        messageIndex: index,
        isValid: parsed.isValid,
        signal: parsed.signal,
        signals: parsed.signal ? [parsed.signal] : undefined,
        reasoning: parsed.reasoning,
      };
    }),
  };
}

export async function qualityGateTelegramParseResult(result: TelegramParseResult, message: string): Promise<TelegramParseResult> {
  if (!result.isValid) return result;

  const rawSignals = [
    ...(result.signal ? [result.signal] : []),
    ...(result.signals || []),
  ];

  const { resolveInstrumentFromText } = await import('@/lib/market/instrument-resolver');
  const { getLivePrice } = await import('@/lib/broker/live-prices');

  // Pre-resolve the instrument dynamically so we can check if it is dynamically resolved
  const resolved = await resolveInstrumentFromText(message).catch(() => null);
  const resolvedSymbol = resolved?.symbol || null;

  const accepted: AISignalOutput[] = [];
  for (const signal of rawSignals) {
    const isDyn = resolvedSymbol === signal.symbol.toUpperCase() || NSE_SYMBOLS.has(signal.symbol.toUpperCase());
    const enriched = enrichSignalQuality({
      ...signal,
      reasoning: result.reasoning || 'Telegram signal parsed by AI',
    }, {
      source: 'telegram',
      telegramText: message,
      minConfidence: 60,
      minRewardRisk: 1.6,
      isDynamicallyResolved: isDyn,
    });
    if (enriched) {
      accepted.push(enriched);
    }
  }

  if (accepted.length === 0) {
    const symbolFromSignal = rawSignals[0]?.symbol || null;
    const finalSymbol = symbolFromSignal || resolvedSymbol;
    const livePrice = finalSymbol ? await getLivePrice(finalSymbol).catch(() => null) : null;

    const fallback = buildTrustedTelegramCandidate(message, livePrice, finalSymbol);
    if (fallback.isValid) {
      return {
        ...fallback,
        reasoning: `${fallback.reasoning} Recovered after strict quality gate rejected the original parse.`,
      };
    }

    return {
      isValid: false,
      reasoning: `${result.reasoning || 'Telegram signal parsed'} | Rejected by quality gate: missing valid price levels, weak confidence, or poor reward/risk.`,
      source: result.source,
    };
  }

  return {
    ...result,
    isValid: true,
    signal: accepted[0],
    signals: accepted,
    reasoning: accepted[0].reasoning,
  };
}

export async function qualityGateBatchResult(result: BatchTelegramParseResult, messages: string[]): Promise<BatchTelegramParseResult> {
  const results: typeof result.results = [];
  for (const item of result.results) {
    const gated = await qualityGateTelegramParseResult({
      isValid: item.isValid,
      signal: item.signal,
      signals: item.signals,
      reasoning: item.reasoning,
      source: 'text',
      modelName: item.modelName,
    }, messages[item.messageIndex] || '');

    results.push({
      messageIndex: item.messageIndex,
      isValid: gated.isValid,
      signal: gated.signal,
      signals: gated.signals,
      reasoning: gated.reasoning,
      modelName: gated.modelName || item.modelName || 'rule-based',
    });
  }

  return { results };
}

// ─── AI + Fallback News Analysis ─────────────────────────────────────────────

export async function analyzeNewsForSignals(
  watchlist: string[],
  newsText: string,
  telegramText?: string
): Promise<AIAnalysisResult> {
  const userContent = `Watchlist: ${watchlist.join(', ')}

=== MARKET NEWS ===
${newsText}

${telegramText && telegramText !== 'No recent Telegram signals.' ? `=== TELEGRAM SIGNALS ===
${telegramText}` : ''}
`;

  try {
    const completion = await callConfiguredChatCompletion([
      { role: 'system', content: NEWS_ANALYSIS_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ], {
      temperature: 0.2,
      maxTokens: 1800,
      timeoutMs: 60_000,
      jsonMode: true,
    });

    const result = parseAIResponse<AIAnalysisResult>(completion.content, {
      signals: [],
      marketSentiment: 'neutral',
      summary: 'Unable to analyze market news',
    });
    const filteredSignals = filterAndRankSignals(result.signals || [], {
      watchlist,
      newsText,
      telegramText,
      source: 'ai',
      minConfidence: 65,
      minRewardRisk: 1.8,
    });
    const rejectedCount = Math.max(0, (result.signals || []).length - filteredSignals.length);
    result.signals = filteredSignals;
    result.summary = `AI Analysis (${completion.model}): ${result.summary}${rejectedCount > 0 ? ` Filtered ${rejectedCount} weak setup(s) by quality/risk rules.` : ''}`;
    result.modelName = completion.model;
    return result;
  } catch (err: any) {
    if (isRateLimitError(err)) {
      markLLMRateLimited();
    }
    console.error('[AI Engine] Hugging Face news analysis failed:', err?.message);
  }

  // ─── Rule-based Fallback (no AI needed) ──────────────────────────────────
  console.log('[AI Engine] All LLM models failed, using rule-based fallback analysis');
  return ruleBasedAnalysis(watchlist, newsText, telegramText);
}

/**
 * Rule-based market analysis — works without any AI model.
 * Parses news text and telegram signals using pattern matching.
 */
function ruleBasedAnalysis(
  watchlist: string[],
  newsText: string,
  telegramText?: string
): AIAnalysisResult {
  const signals: AISignalOutput[] = [];

  // Parse telegram signals using rules
  if (telegramText && telegramText !== 'No recent signals.' && telegramText !== 'No recent Telegram signals.') {
    const lines = telegramText.split('\n').filter(l => l.trim());
    for (const line of lines) {
      const parsed = ruleBasedParseTelegramSignal(line);
      if (parsed.isValid && parsed.signal) {
        // Check if this symbol is in watchlist or is a known NSE symbol
        const sym = parsed.signal.symbol.split(' ')[0]; // Handle "NIFTY 24000 CE"
        if (watchlist.some(w => w.toUpperCase() === sym.toUpperCase()) || NSE_SYMBOLS.has(sym.toUpperCase())) {
          // Avoid duplicate symbols
          if (!signals.find(s => s.symbol === parsed.signal!.symbol && s.action === parsed.signal!.action)) {
            signals.push({
              symbol: parsed.signal.symbol,
              action: parsed.signal.action,
              confidence: parsed.signal.confidence,
              entryPrice: parsed.signal.entryPrice,
              targetPrice: parsed.signal.targetPrice,
              stopLoss: parsed.signal.stopLoss,
              reasoning: parsed.reasoning || 'Rule-based signal from Telegram',
            });
          }
        }
      }
    }
  }

  // Parse news for bullish/bearish keywords
  const newsUpper = newsText.toUpperCase();
  const bullishKeywords = ['rally', 'surge', 'jump', 'gain', 'rise', 'buy', 'bullish', 'upgrade', 'outperform', 'positive', 'growth', 'profit', 'beat', 'exceed', 'strong', 'high'];
  const bearishKeywords = ['fall', 'drop', 'decline', 'sell', 'bearish', 'downgrade', 'underperform', 'negative', 'loss', 'miss', 'weak', 'low', 'crash', 'slump', 'recession'];

  let bullishCount = 0;
  let bearishCount = 0;
  for (const kw of bullishKeywords) {
    const regex = new RegExp(`\\b${kw}\\b`, 'gi');
    const matches = newsUpper.match(regex);
    if (matches) bullishCount += matches.length;
  }
  for (const kw of bearishKeywords) {
    const regex = new RegExp(`\\b${kw}\\b`, 'gi');
    const matches = newsUpper.match(regex);
    if (matches) bearishCount += matches.length;
  }

  // Extract symbols from news that aren't already in signals
  const newsSignals = new Map<string, AISignalOutput>();
  for (const sym of watchlist) {
    if (signals.find(s => s.symbol === sym)) continue; // Already have a signal
    if (containsSymbol(newsUpper, sym.toUpperCase())) {
      const isBullishContext = bullishCount > bearishCount;
      const action: 'BUY' | 'SELL' = isBullishContext ? 'BUY' : bearishCount > bullishCount ? 'SELL' : 'BUY';
      const confidence = 35 + Math.min(Math.abs(bullishCount - bearishCount) * 3, 25);
      // Default prices for rule-based
      const defaultPrices: Record<string, number> = {
        RELIANCE: 2900, TCS: 3800, INFY: 1500, HDFCBANK: 1650, ICICIBANK: 1250,
        SBIN: 780, ITC: 440, BHARTIARTL: 1550, WIPRO: 450, MARUTI: 12000,
        HCLTECH: 1600, ASIANPAINT: 2800, KOTAKBANK: 1800, LT: 3500, AXISBANK: 1150,
        NIFTY: 22500, BANKNIFTY: 48000,
      };
      const price = defaultPrices[sym.toUpperCase()] || 500;
      newsSignals.set(sym, {
        symbol: sym.toUpperCase(),
        action,
        confidence: Math.min(confidence + 8, 68), // Cap rule-based at 68
        entryPrice: price,
        targetPrice: Math.round((action === 'BUY' ? price * 1.04 : price * 0.96) * 100) / 100,
        stopLoss: Math.round((action === 'BUY' ? price * 0.98 : price * 1.02) * 100) / 100,
        reasoning: `Rule-based: ${sym} mentioned in news with ${isBullishContext ? 'bullish' : 'bearish'} sentiment`,
      });
    }
  }

  for (const sig of newsSignals.values()) {
    signals.push(sig);
  }

  // Determine market sentiment
  let marketSentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (bullishCount > bearishCount + 2) marketSentiment = 'bullish';
  else if (bearishCount > bullishCount + 2) marketSentiment = 'bearish';

  // Keep only high-quality setups and limit to top 5.
  const topSignals = filterAndRankSignals(signals, {
    watchlist,
    newsText,
    telegramText,
    source: 'rule',
    minConfidence: 62,
    minRewardRisk: 1.8,
  });

  const method = signals.length > 0 ? 'Rule-based analysis' : 'No actionable signals found';
  return {
    signals: topSignals,
    marketSentiment,
    summary: `📋 ${method} — Market appears ${marketSentiment}. ${topSignals.length} high-quality signal(s) passed reward/risk and source checks out of ${signals.length} candidate(s). AI provider was unavailable; using pattern-matching fallback.`,
  };
}

// ─── Batch Telegram Signal Parser (AI + fallback) ────────────────────────────

const BATCH_TELEGRAM_PARSE_PROMPT = `You are an expert Indian stock market analyst reading trading messages, news snippets, unstructured chat, and human text.

You will receive MULTIPLE text blocks, each numbered. Parse ALL of them.

Your goal is to understand each message the way a professional trader would — reading the INTENT and CONTEXT, not just keywords.

How to determine trade direction (BUY/SELL):
- Look at the overall sentiment: Is the analyst bullish or bearish on this stock?
- Positive words (holding, accumulate, upside, breakout, support holding, view above current price, bullish, good opportunity) → BUY
- Negative words (breakdown, avoid, exit, downside, bearish, resistance, short, reject) → SELL
- If a "target" or "view" price is HIGHER than the current/entry price → BUY intent
- If a "target" or "view" price is LOWER than the current/entry price → SELL intent
- Treat phrases like "holding view", "positive view", "upside view" as BUY signals
- Treat phrases like "exit", "book profit", "avoid", "downside view" as SELL signals

How to identify prices (use common sense and context):
- The ENTRY price is the current market price OR the price the analyst recommends buying/selling at
- The TARGET is always in the direction of the trade: ABOVE entry for BUY, BELOW entry for SELL
- The STOP LOSS is always opposite: BELOW entry for BUY, ABOVE entry for SELL
- If a "support" level is mentioned and it's BELOW current price → it's the stop-loss for a BUY trade
- If a "resistance" level is mentioned and it's ABOVE current price → it's the stop-loss for a SELL trade
- A "view" price that is higher than the current price is a TARGET for a BUY trade
- A "view" price that is lower than the current price is a TARGET for a SELL trade
- Never use a target/view/resistance price as the entry price

Ignore disclaimer boilerplate:
- Lines like "Above calls are not buy or sell levels", "for educational purposes", "consult your financial advisor" are legal disclaimers — ignore them for direction inference

Estimating missing values:
- If exact entry is missing, use the most prominently mentioned current price
- If target is missing, estimate 4% from entry in the trade direction
- If SL is missing, estimate 2% from entry against the trade direction
- Mark estimated fields in reasoning and set confidence 50-65

Respond ONLY with valid JSON:
{
  "results": [
    {
      "messageIndex": 0,
      "isValid": true,
      "signal": {
        "symbol": "SYMBOL",
        "action": "BUY",
        "entryPrice": 1500,
        "targetPrice": 1600,
        "stopLoss": 1450,
        "confidence": 70
      },
      "reasoning": "Analyst is bullish, stock at 1500, target 1600, support at 1450 acts as SL"
    },
    {
      "messageIndex": 1,
      "isValid": false,
      "reasoning": "Disclaimer/greeting only, no actionable signal"
    }
  ]
}

For messages with multiple signals, use "signals" array instead of "signal".

General rules:
- Symbol must be an NSE/BSE stock symbol or index (NIFTY, BANKNIFTY, etc.)
- For options: format as "NIFTY 24000 CE" or "BANKNIFTY 52000 PE"
- Confidence 0-100: 80+ for explicit levels, 60-79 for clear intent with some estimation, 50-65 for partial signals
- Greetings, P&L updates, ads, links with no tradable symbol → isValid: false
- Follow-up/outcome messages ("Target Done", "SL hit", "Book Profit", "Target achieved") → isValid: false with reasoning "Trade outcome notification, not a new entry signal"
- IMPORTANT: Return results for EVERY message`;


/**
 * Batch-parse multiple Telegram messages — tries AI first, falls back to rules.
 */
export async function batchParseTelegramSignals(
  messages: string[],
  maxBatchSize: number = 15
): Promise<BatchTelegramParseResult> {
  if (messages.length === 0) {
    return { results: [] };
  }

  // Try AI first
  try {
    const allResults: BatchTelegramParseResult['results'] = [];
    let rateLimitHits = 0;
    let successfulBatches = 0;

    for (let i = 0; i < messages.length; i += maxBatchSize) {
      const batch = messages.slice(i, i + maxBatchSize);
      const numberedMessages = batch.map((msg, idx) => `[Message ${i + idx}]\n${msg}`).join('\n\n---\n\n');

      try {
        const completion = await callConfiguredChatCompletion([
          { role: 'system', content: BATCH_TELEGRAM_PARSE_PROMPT },
          { role: 'user', content: `Parse these ${batch.length} Telegram messages:\n\n${numberedMessages}` },
        ], {
          temperature: 0.1,
          maxTokens: 2200,
          timeoutMs: 90_000,
          jsonMode: true,
        });

        const content = completion.content;
        const parsed = parseAIResponse<BatchTelegramParseResult>(content, { results: [] });

        if (parsed.results && parsed.results.length > 0) {
          allResults.push(...parsed.results.map((r) => ({ ...r, modelName: completion.model })));
          successfulBatches++;
        } else {
          for (let j = 0; j < batch.length; j++) {
            allResults.push({ messageIndex: i + j, isValid: false, reasoning: 'Batch parse returned no results', modelName: completion.model });
          }
        }
      } catch (err: any) {
        if (isRateLimitError(err)) {
          markLLMRateLimited();
          rateLimitHits++;
        }
        console.error(`[AI Engine] Batch parse failed for messages ${i}-${i + batch.length - 1}:`, err?.message);
        // Don't push error results yet — we'll use rule-based fallback below
        break; // Stop trying AI — switch to rules for all remaining
      }

      if (i + maxBatchSize < messages.length) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // If we got some AI results, return them (partial success is ok)
    if (successfulBatches > 0) {
      markLLMSuccess();
      // Fill in any missing messages
      for (let i = 0; i < messages.length; i++) {
        if (!allResults.find(r => r.messageIndex === i)) {
          const ruleParsed = ruleBasedParseTelegramSignal(messages[i]);
          allResults.push({
            messageIndex: i,
            isValid: ruleParsed.isValid,
            signal: ruleParsed.signal,
            signals: ruleParsed.signal ? [ruleParsed.signal] : undefined,
            reasoning: ruleParsed.reasoning + ' (rule-based fallback)',
            modelName: 'rule-based',
          });
        }
      }
      return await qualityGateBatchResult(
        { results: allResults.sort((a, b) => a.messageIndex - b.messageIndex) },
        messages
      );
    }

    // All batches failed due to rate limiting — fall through to rules
    if (rateLimitHits > 0 && successfulBatches === 0) {
      console.log('[AI Engine] All AI batches rate-limited, using rule-based fallback for all messages');
    }
  } catch (err: any) {
    console.error('[AI Engine] AI batch parse error, falling back to rules:', err?.message);
  }

  // ─── Rule-based Fallback ──────────────────────────────────────────────
  return await qualityGateBatchResult(ruleBasedBatchParseTelegramSignals(messages), messages);
}

// ─── Single Telegram Signal Parser (AI + fallback) ──────────────────────────

const TELEGRAM_PARSE_SYSTEM_PROMPT = `You are an expert Indian stock market analyst reading trading messages, news snippets, unstructured chat, and human text.

Your goal is to understand each message the way a professional trader would — reading the INTENT and CONTEXT, not just matching keywords.

How to determine trade direction (BUY/SELL):
- Look at the overall sentiment: Is the analyst bullish or bearish on this stock?
- Positive language (holding, accumulate, upside view, breakout, support holding, view above price, bullish, good opportunity) → BUY
- Negative language (breakdown, exit, avoid, downside, bearish, short, resistance reject) → SELL
- If any mentioned "view", "target", or "objective" price is HIGHER than the current price → the analyst is bullish → BUY
- If any mentioned "view", "target", or "objective" price is LOWER than the current price → the analyst is bearish → SELL
- Phrases like "holding view", "positive bias", "bullish view", "upside view" → BUY
- Phrases like "exit", "book profit", "avoid", "negative bias", "downside view" → SELL

How to identify prices (use context and price relationships):
- ENTRY = current market price or the price the analyst references as now / CMP / trading at / option premium after CE/PE
- TARGET = always in trade direction: above entry for BUY, below entry for SELL
- STOP LOSS = always opposite direction: below entry for BUY, above entry for SELL
- A support level that is BELOW entry → stop-loss for BUY trades
- A resistance level that is ABOVE entry → stop-loss for SELL trades
- Never use a target/view/upside/resistance price as the entry price
- If multiple prices are mentioned, use context and price direction to assign roles

Ignore disclaimer boilerplate:
- "Above calls are not buy or sell levels", "for educational purposes only", "consult your financial advisor" — these are legal disclaimers, completely ignore them for signal parsing

Preceding message & follow-up/update messages:
- If a preceding message is provided (under === PRECEDING MESSAGE IN CHANNEL ===), use its symbol, strike, entry to resolve ambiguous references in the current message.
- If the current message updates trade parameters ("SL trailed to X", "Buy more at Y") → output the updated levels using the preceding message's symbol.
- If the current message is purely an outcome/notification ("Target 1 Done", "Target achieved", "SL hit", "Book profit now") → set isValid: false, reasoning: "Trade update / target achieved announcement, not a new entry signal".

Estimating missing values:
- Entry missing: use the most prominent current price reference
- Target missing: estimate 4% in trade direction from entry for equities
- SL missing: estimate 2% against trade direction from entry
- Mark any estimated fields in reasoning, set confidence 50-65

Output ONLY valid JSON:
For one signal:
{"isValid": true, "signal": {"symbol": "RELIANCE", "action": "BUY", "entryPrice": 2900, "targetPrice": 2980, "stopLoss": 2860, "confidence": 75}, "reasoning": "Analyst bullish, holding view, current price 2900, support 2860 as SL, target 2980"}

For multiple signals:
{"isValid": true, "signals": [{"symbol": "SYM1", ...}, {"symbol": "SYM2", ...}], "reasoning": "..."}

Not a signal:
{"isValid": false, "reasoning": "Why"}

Rules:
- Symbol: NSE/BSE stock or index. Options: "NIFTY 24000 CE", "BANKNIFTY 52000 PE"
- Confidence 80+ = explicit levels given. 60-79 = clear intent, some estimation. 50-65 = partial signal
- Greetings, P&L updates, ads, links with no tradable symbol → isValid: false`;


export async function parseTelegramSignal(
  message: string,
  context?: { previousMessage?: string }
): Promise<TelegramParseResult> {
  // Try AI first
  try {
    const userPrompt = context?.previousMessage
      ? `=== PRECEDING MESSAGE IN CHANNEL (FOR CONTEXT) ===\n${context.previousMessage}\n\n=== CURRENT MESSAGE TO PARSE ===\n${message}`
      : message;

    const completion = await callConfiguredChatCompletion([
      { role: 'system', content: TELEGRAM_PARSE_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ], {
      temperature: 0.1,
      maxTokens: 800,
      jsonMode: true,
      timeoutMs: 45_000,
    });

    const content = completion.content;
    if (content.trim()) {
      const result = parseAIResponse<TelegramParseResult>(content, {
        isValid: false,
        reasoning: 'Failed to parse Telegram message',
      });
      result.source = 'text';
      result.modelName = completion.model;
      return await qualityGateTelegramParseResult(result, message);
    }
  } catch (err: any) {
    if (isRateLimitError(err)) {
      markLLMRateLimited();
    }
    console.error('[AI Engine] AI parse failed, using rule-based fallback:', err?.message?.substring(0, 80));
  }

  // Rule-based fallback
  const result = ruleBasedParseTelegramSignal(message);
  result.source = 'rule';
  return await qualityGateTelegramParseResult(result, message);
}

// ─── VLM Image Signal Parser ────────────────────────────────────────────────

const VLM_SIGNAL_EXTRACT_PROMPT = `You are a senior Indian stock market analyst and expert at reading Telegram trading signal screenshots.

You will receive an image which could be:
- A Telegram screenshot containing a stock recommendation text
- A TradingView/broker chart with annotations
- A mix of chart + caption text

=== CRITICAL RULES ===
1. ALWAYS extract every piece of visible text into "extractedText". Do NOT skip this.
2. For EVERY image you see — even with partial data — attempt to generate at least one signal.
3. If explicit entry/target/SL are NOT given but a stock name and direction are clear, ESTIMATE reasonable levels.
4. Indian market context: CMP = Current Market Price = entry. TGT/Target = take profit. SL = Stop Loss. CE = Call Option (BUY). PE = Put Option (SELL).
5. Phrases like "BUY AT CMP", "ADD MORE", "ACCUMULATE", "LONG", "BTST" all mean BUY action.
6. For options: "500CE AT 21" means BUY DELHIVERY 500CE at entry 21. "119 to 187" means entry 119, target 187.
7. "Tgt achieved" on a past signal means it hit target — still log it with hasValidSignals: false but fill extractedText.
8. For chart images: If you can see the stock name and price, ALWAYS create a signal. Use visible support/resistance or apply 4%/2% rule.

=== SIGNAL EXTRACTION EXAMPLES ===
Example A — Text screenshot:
  "SIKA INTERPLANT SYSTEM | CMP 1048 | BUY AT CMP | SL 800 | TGT 1500-1800"
  → symbol: SIKAINTER or SIKAINTERPLANTS, action: BUY, entry: 1048, stopLoss: 800, target: 1500, confidence: 82

Example B — Options screenshot:
  "DELHIVERY 500CE AT 21 | SL 18 | TGT 25"
  → symbol: DELHIVERY500CE, action: BUY, entry: 21, stopLoss: 18, target: 25, confidence: 85

Example C — Chart image:
  ZYDUSLIFE chart showing FLAG PATTERN BREAKOUT at price 1138
  → symbol: ZYDUSLIFE, action: BUY, entry: 1138, target: 1220 (nearest resistance or +7%), stopLoss: 1080 (recent swing low), confidence: 78

Example D — Profit screenshot (target achieved):
  "CUPID | 119 to 187" — this shows a PAST trade that succeeded.
  → hasValidSignals: false, extractedText: "CUPID target achieved 119 to 187", log in chartAnalysis: {symbol: CUPID, companyName: Cupid Ltd}

=== OUTPUT FORMAT ===
Respond ONLY with valid JSON:
{
  "extractedText": "Complete verbatim text visible in the image, including all numbers, symbols, labels",
  "imageType": "text-signal | chart | news | other",
  "chartAnalysis": {
    "symbol": "ZYDUSLIFE",
    "companyName": "Zydus Lifesciences",
    "exchange": "NSE",
    "timeframe": "1D",
    "latestPrice": 1138.60,
    "trend": "bullish",
    "setup": "Flag pattern breakout",
    "supportLevels": [1080, 1040],
    "resistanceLevels": [1220, 1280],
    "volumeContext": "high volume breakout",
    "chartNotes": "Price broke flag pattern with strong volume. Continuation expected.",
    "riskNotes": "SL below flag base at 1080."
  },
  "signals": [
    {
      "symbol": "ZYDUSLIFE",
      "action": "BUY",
      "entryPrice": 1138.60,
      "targetPrice": 1220,
      "stopLoss": 1080,
      "confidence": 78,
      "notes": "Flag pattern breakout on 1D chart. Manual review recommended."
    }
  ],
  "channelName": "Channel name if visible in the image",
  "hasValidSignals": true
}

If truly no actionable signal exists (e.g. it is a meme, news article, completely unrelated image):
{
  "extractedText": "Description of what's in the image",
  "imageType": "other",
  "chartAnalysis": null,
  "signals": [],
  "channelName": null,
  "hasValidSignals": false
}`;


export interface VLMImageParseResult {
  extractedText: string;
  imageType?: 'text-signal' | 'chart' | 'news' | 'other';
  chartAnalysis?: {
    symbol?: string | null;
    companyName?: string | null;
    exchange?: string | null;
    timeframe?: string | null;
    latestPrice?: number | null;
    trend?: 'bullish' | 'bearish' | 'sideways' | 'unclear';
    setup?: string | null;
    supportLevels?: number[];
    resistanceLevels?: number[];
    volumeContext?: string | null;
    chartNotes?: string | null;
    riskNotes?: string | null;
  } | null;
  signals: Array<{
    symbol: string;
    action: 'BUY' | 'SELL';
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
    confidence: number;
    notes?: string;
  }>;
  channelName: string | null;
  hasValidSignals: boolean;
  modelName?: string;
}

const EMPTY_IMAGE_PARSE_RESULT: VLMImageParseResult = {
  extractedText: '',
  imageType: 'other',
  chartAnalysis: null,
  signals: [],
  channelName: null,
  hasValidSignals: false,
};

function normalizeImageParseResult(result: Partial<VLMImageParseResult> | null | undefined): VLMImageParseResult {
  return {
    extractedText: result?.extractedText || '',
    imageType: result?.imageType || 'other',
    chartAnalysis: result?.chartAnalysis || null,
    signals: Array.isArray(result?.signals) ? result.signals : [],
    channelName: result?.channelName || null,
    hasValidSignals: Boolean(result?.hasValidSignals || result?.signals?.length),
  };
}

function hasUsefulImageParse(result: VLMImageParseResult): boolean {
  return Boolean(
    result.hasValidSignals ||
    result.signals.length ||
    result.chartAnalysis?.symbol ||
    result.chartAnalysis?.companyName ||
    result.extractedText.trim().length >= 12
  );
}

async function createEnhancedImageVariants(base64Image: string): Promise<Array<{ label: string; base64: string; mimeType: string }>> {
  try {
    const sharp = (await import('sharp')).default;
    const input = Buffer.from(base64Image, 'base64');
    const image = sharp(input).rotate();
    const metadata = await image.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    const variants: Array<{ label: string; base64: string; mimeType: string }> = [];

    const enhancedFull = await sharp(input)
      .rotate()
      .resize({ width: Math.max(1400, Math.min(2200, width * 2 || 1600)), withoutEnlargement: false })
      .grayscale()
      .normalize()
      .sharpen()
      .png()
      .toBuffer();
    variants.push({ label: 'enhanced-full', base64: enhancedFull.toString('base64'), mimeType: 'image/png' });

    if (width > 0 && height > 0) {
      const topCrop = await sharp(input)
        .rotate()
        .extract({ left: 0, top: 0, width, height: Math.max(1, Math.round(height * 0.35)) })
        .resize({ width: Math.max(1400, Math.min(2200, width * 2)), withoutEnlargement: false })
        .grayscale()
        .normalize()
        .sharpen()
        .png()
        .toBuffer();
      variants.push({ label: 'enhanced-header', base64: topCrop.toString('base64'), mimeType: 'image/png' });
    }

    return variants;
  } catch (error) {
    console.warn('[AI Engine] Image preprocessing skipped:', error instanceof Error ? error.message : error);
    return [];
  }
}

export interface ImageSignalCandidate {
  symbol: string;
  action: 'BUY' | 'SELL';
  entryPrice: number;
  targetPrice: number;
  stopLoss: number;
  confidence: number;
  notes?: string;
}

export const TRUSTED_CHART_ALIASES: Record<string, string> = {
  'PREMIER EXPLOSIVES LIMITED': 'PREMEXPLN',
  'PREMIER EXPLOSIVES': 'PREMEXPLN',
  PREMEXPLN: 'PREMEXPLN',
  'INTERGLOBE AVIATION': 'INDIGO',
  INDIGO: 'INDIGO',
  SUZLON: 'SUZLON',
  'ADF FOODS': 'ADFFOODS',
  'ZEN TECHNOLOGIES': 'ZENTEC',
  'ZENTEC': 'ZENTEC',
};

function normalizeTrustedSymbol(symbol?: string | null, companyName?: string | null): string | null {
  const raw = `${symbol || ''} ${companyName || ''}`.toUpperCase().trim();
  if (!raw) return null;
  if (/\b(XAUUSD|GOLD|BTC|ETH|CRYPTO|FOREX)\b/.test(raw)) return null;
  for (const [alias, mapped] of Object.entries(TRUSTED_CHART_ALIASES)) {
    if (new RegExp(`(^|[^A-Z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^A-Z0-9]|$)`).test(raw)) {
      return mapped;
    }
  }
  const compact = (symbol || '').toUpperCase().replace(/[^A-Z0-9&-]/g, '');
  return compact && compact.length <= 14 ? compact : null;
}

function nearestAbove(levels: number[] | undefined, price: number): number | null {
  return (levels || []).filter((level) => Number.isFinite(level) && level > price * 1.005).sort((a, b) => a - b)[0] ?? null;
}

function nearestBelow(levels: number[] | undefined, price: number): number | null {
  return (levels || []).filter((level) => Number.isFinite(level) && level < price * 0.995).sort((a, b) => b - a)[0] ?? null;
}

export function deriveTrustedChartSignal(imageResult: {
  imageType?: string;
  extractedText?: string;
  chartAnalysis?: {
    symbol?: string | null;
    companyName?: string | null;
    latestPrice?: number | null;
    trend?: string | null;
    setup?: string | null;
    supportLevels?: number[];
    resistanceLevels?: number[];
    chartNotes?: string | null;
    riskNotes?: string | null;
  } | null;
}): ImageSignalCandidate | null {
  const chart = imageResult.chartAnalysis;
  if (imageResult.imageType !== 'chart' || !chart) return null;

  const symbol = normalizeTrustedSymbol(chart.symbol, chart.companyName);
  const entry = Number(chart.latestPrice);
  if (!symbol || !Number.isFinite(entry) || entry <= 0) return null;

  const text = `${chart.setup || ''} ${chart.trend || ''} ${chart.chartNotes || ''} ${imageResult.extractedText || ''}`;
  const bearish = /\b(bearish|breakdown|short|sell|rejection|lower high|downtrend)\b/i.test(text);
  const action: 'BUY' | 'SELL' = bearish ? 'SELL' : 'BUY';

  const support = nearestBelow(chart.supportLevels, entry);
  const resistance = nearestAbove(chart.resistanceLevels, entry);
  const targetPrice = action === 'BUY'
    ? roundSignalPrice(resistance || entry * 1.04)
    : roundSignalPrice(support || entry * 0.96);
  const stopLoss = action === 'BUY'
    ? roundSignalPrice(support || entry * 0.97)
    : roundSignalPrice(resistance || entry * 1.03);

  if (
    (action === 'BUY' && (targetPrice <= entry || stopLoss >= entry)) ||
    (action === 'SELL' && (targetPrice >= entry || stopLoss <= entry))
  ) {
    return null;
  }

  return {
    symbol,
    action,
    entryPrice: roundSignalPrice(entry),
    targetPrice,
    stopLoss,
    confidence: 64,
    notes: `Trusted chart mention fallback. ${chart.companyName || chart.symbol || symbol}. ${chart.setup || ''} ${chart.chartNotes || ''} ${chart.riskNotes || ''}`.trim(),
  };
}

export async function deriveTrustedMentionSignal(text: string): Promise<ImageSignalCandidate | null> {
  const symbol = normalizeTrustedSymbol(null, text);
  if (!symbol) return null;

  const { getLivePrice } = await import('@/lib/broker/live-prices');
  const livePrice = await getLivePrice(symbol);
  if (!livePrice) return null;

  const entryPrice = roundSignalPrice(livePrice);
  return {
    symbol,
    action: 'BUY',
    entryPrice,
    targetPrice: roundSignalPrice(entryPrice * 1.04),
    stopLoss: roundSignalPrice(entryPrice * 0.97),
    confidence: 60,
    notes: `Trusted Telegram mention fallback from caption/text. No explicit target or SL was posted; levels derived from live price for manual review only.`,
  };
}

/**
 * Parse a raw OCR/extracted text string from an image and try to extract a trading signal from it.
 * This is used as a final fallback when the VLM returns extractedText but no structured signals.
 */
export async function deriveTrustedTextSignal(extractedText: string): Promise<ImageSignalCandidate | null> {
  if (!extractedText || extractedText.trim().length < 5) return null;
  const text = extractedText.toUpperCase();

  // --- Determine action ---
  const isBuy = /\b(BUY|LONG|BULLISH|ACCUMULATE|BTST|CMP|ADD MORE|ENTRY|CALL|CE\b)\b/.test(text);
  const isSell = /\b(SELL|SHORT|BEARISH|PUT|PE\b|EXIT|CLOSE)\b/.test(text);
  // Skip if past trade (target achieved notification)
  if (/TGT\s*ACHIEVED|TARGET\s*ACHIEVED|PROFIT\s*BOOKED/i.test(text)) return null;
  if (!isBuy && !isSell) return null;
  const action: 'BUY' | 'SELL' = isSell && !isBuy ? 'SELL' : 'BUY';

  // --- Extract symbol ---
  // Try to find options symbol like DELHIVERY500CE, NIFTY24000CE etc.
  const optionMatch = text.match(/([A-Z0-9&-]{3,14})\s*(\d{3,6})\s*(CE|PE)/);
  // Try to find plain stock symbol: a word in ALL CAPS that looks like a ticker
  const stockLineMatch = text.match(/^([A-Z][A-Z0-9&-]{2,13})\s*$/m);
  // Fallback: first uppercase word that looks like a ticker
  const fallbackSymbolMatch = text.match(/\b([A-Z][A-Z0-9&-]{3,13})\b/);

  let rawSymbol: string | null = null;
  let isOption = false;

  if (optionMatch) {
    rawSymbol = `${optionMatch[1]}${optionMatch[2]}${optionMatch[3]}`;
    isOption = true;
  } else if (stockLineMatch) {
    rawSymbol = stockLineMatch[1];
  } else if (fallbackSymbolMatch) {
    rawSymbol = fallbackSymbolMatch[1];
  }

  // Filter noise words that aren't symbols
  const NOISE = new Set(['BUY', 'SELL', 'CMP', 'TGT', 'SL', 'ADD', 'MORE', 'NEAR', 'INVESTMENT', 'STOCK',
    'PICK', 'SEBI', 'REGISTERED', 'GROUP', 'TRAINING', 'CHANNEL', 'BTST', 'CALL', 'OPTION',
    'MARKET', 'NSE', 'BSE', 'INR', 'PROFIT', 'BOOKED', 'ACHIEVED', 'DELHIVERY']);
  if (!rawSymbol || NOISE.has(rawSymbol)) {
    // Re-attempt: find second candidate
    const allSymbols = [...text.matchAll(/\b([A-Z][A-Z0-9&-]{3,13})\b/g)]
      .map(m => m[1]).filter(s => !NOISE.has(s));
    rawSymbol = allSymbols[0] || null;
  }
  if (!rawSymbol) return null;
  const symbol = rawSymbol.replace(/[^A-Z0-9&-]/g, '').substring(0, 14);
  if (!symbol || symbol.length < 2) return null;

  // --- Extract price levels ---
  // CMP / entry patterns: "CMP 1048", "AT 21", "ENTRY 120", "1048" standalone
  const entryPatterns = [
    /(?:CMP|ENTRY|AT|@)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i,
    /(?:BUY AT CMP|BUY AT)\s+(\d+(?:\.\d+)?)/i,
  ];
  // TGT patterns: "TGT 1500", "TARGET 200", "1500-1800" (take upper), "119 to 187" (to = target)
  const tgtPatterns = [
    /(?:TGT|TARGET|TP)\s*[:\-]?\s*(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)/i, // range
    /(?:TGT|TARGET|TP)\s*[:\-+]?\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s+TO\s+(\d+(?:\.\d+)?)/i, // "119 TO 187"
  ];
  // SL patterns: "SL 800", "STOP LOSS 18"
  const slPatterns = [
    /(?:SL|STOP[- ]LOSS|STOPLOSS)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i,
  ];

  let entryPrice = 0, targetPrice = 0, stopLoss = 0;

  for (const p of entryPatterns) {
    const m = text.match(p);
    if (m) { entryPrice = parseFloat(m[1]); break; }
  }

  for (const p of tgtPatterns) {
    const m = text.match(p);
    if (m) {
      // If range match (two capture groups), take the higher for BUY
      if (m[2]) {
        targetPrice = action === 'BUY' ? Math.max(parseFloat(m[1]), parseFloat(m[2])) : Math.min(parseFloat(m[1]), parseFloat(m[2]));
      } else {
        targetPrice = parseFloat(m[1]);
      }
      break;
    }
  }

  for (const p of slPatterns) {
    const m = text.match(p);
    if (m) { stopLoss = parseFloat(m[1]); break; }
  }

  // --- Fetch live price as fallback entry ---
  const { getLivePrice } = await import('@/lib/broker/live-prices');
  let livePrice: number | null = null;
  if (!entryPrice || !Number.isFinite(entryPrice)) {
    livePrice = await getLivePrice(isOption ? symbol.replace(/\d+(CE|PE)$/, '') : symbol);
    if (livePrice) entryPrice = roundSignalPrice(livePrice);
  }
  if (!entryPrice || !Number.isFinite(entryPrice) || entryPrice <= 0) return null;

  // --- Estimate missing levels ---
  if (!targetPrice || !Number.isFinite(targetPrice) || targetPrice <= 0) {
    targetPrice = action === 'BUY' ? roundSignalPrice(entryPrice * 1.05) : roundSignalPrice(entryPrice * 0.95);
  }
  if (!stopLoss || !Number.isFinite(stopLoss) || stopLoss <= 0) {
    stopLoss = action === 'BUY' ? roundSignalPrice(entryPrice * 0.97) : roundSignalPrice(entryPrice * 1.03);
  }

  // --- Sanity check: direction must make sense ---
  if (action === 'BUY' && (targetPrice <= entryPrice || stopLoss >= entryPrice)) return null;
  if (action === 'SELL' && (targetPrice >= entryPrice || stopLoss <= entryPrice)) return null;

  const confidence = (targetPrice > 0 && stopLoss > 0) ? 72 : 60;

  return {
    symbol,
    action,
    entryPrice: roundSignalPrice(entryPrice),
    targetPrice: roundSignalPrice(targetPrice),
    stopLoss: roundSignalPrice(stopLoss),
    confidence,
    notes: `Parsed from Telegram image OCR text. ${livePrice ? `Live price used as entry: ₹${livePrice}.` : ''} Manual review recommended.`,
  };
}

export async function callConfiguredVisionParser(
  base64Image: string,
  mimeType: string,
  prompt: string
): Promise<{ content: string; model: string }> {
  const groqApiKey = await getBotSetting('groqApiKey') || process.env.GROQ_API_KEY || '';
  const omniRouteToken = await getBotSetting('omniRouteKey') || process.env.OMNIROUTE_KEY || '';
  const omniRouteBaseUrl = process.env.OMNIROUTE_BASE_URL
    || await getBotSetting('omniRouteBaseUrl')
    || DEFAULT_OMNIROUTE_BASE_URL;
  const preferredProvider = await getBotSetting('aiProvider') || 'omniroute';

  let provider: 'omniroute' | 'groq' = 'omniroute';
  let token = '';
  let model = '';
  let baseUrl = '';

  if (preferredProvider === 'omniroute') {
    // OmniRoute first priority (works zero-config, no key required). Use a
    // vision-capable model (combo routing like `auto` can silently land on
    // text-only models that reject images). Override via OMNIROUTE_VISION_MODEL.
    provider = 'omniroute';
    token = omniRouteToken;
    model = process.env.OMNIROUTE_VISION_MODEL
      || await getBotSetting('omniRouteVisionModel')
      || 'oc/mimo-v2.5-free';
    baseUrl = omniRouteBaseUrl;
  } else if (groqApiKey) {
    provider = 'groq';
    token = groqApiKey;
    model = 'meta-llama/llama-4-scout-17b-16e-instruct';
    baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
  } else {
    // Fall back to OmniRoute (zero-config) when Groq is preferred but not configured
    provider = 'omniroute';
    token = omniRouteToken;
    model = process.env.OMNIROUTE_VISION_MODEL
      || await getBotSetting('omniRouteVisionModel')
      || 'oc/mimo-v2.5-free';
    baseUrl = omniRouteBaseUrl;
  }

  console.log(`[AI Engine] Vision completion using ${provider}: ${model}`);

  const maxRetries = 2;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);

    try {
      const res = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: prompt,
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${mimeType};base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          temperature: 0.1,
          max_tokens: 2000,
          stream: false,
        }),
        signal: controller.signal,
      });

      const responseText = await res.text();
      if (!res.ok) {
        throw new Error(`${provider} ${model} vision failed (${res.status}): ${responseText.slice(0, 500)}`);
      }

      const payload = JSON.parse(responseText);
      const content = stripThinkingBlocks(payload?.choices?.[0]?.message?.content || '');
      console.log(`[AI Engine] VLM raw response (${model}):`, content.substring(0, 300));
      if (!content) {
        throw new Error(`${provider} ${model} vision returned an empty response`);
      }

      markLLMSuccess();
      clearTimeout(timeout);
      return { content, model };
    } catch (err: any) {
      clearTimeout(timeout);
      const isTransient = isRateLimitError(err)
        || err.message?.includes('429')
        || err.message?.includes('503')
        || err.message?.includes('500')
        || err.message?.includes('502')
        || err.message?.includes('timed out')
        || err.message?.includes('aborted');
      if (isTransient && attempt < maxRetries) {
        attempt++;
        const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[AI Engine] Vision ${model} failed, retrying in ${Math.round(backoff)}ms...`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      if (isRateLimitError(err)) {
        markLLMRateLimited();
      }
      console.error(`[AI Engine] Vision model ${model} failed permanently after ${attempt + 1} attempts:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }

  throw new Error('AI Engine vision retry loop failed unexpectedly');
}


async function callVisionSignalParser(
  zai: ZAI,
  base64Image: string,
  mimeType: string,
  prompt: string
): Promise<VLMImageParseResult> {
  const response = await zai.chat.completions.createVision({
    model: 'glm-4v-flash',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
    thinking: { type: 'disabled' },
  });

  const content = response.choices?.[0]?.message?.content ?? '';
  return normalizeImageParseResult(parseAIResponse<Partial<VLMImageParseResult>>(content, EMPTY_IMAGE_PARSE_RESULT));
}

export async function parseImageSignal(
  base64Image: string,
  mimeType: string = 'image/png',
  caption?: string
): Promise<VLMImageParseResult> {
  try {
    let result: VLMImageParseResult | null = null;
    const visionPrompt = caption
      ? `${VLM_SIGNAL_EXTRACT_PROMPT}\n\n=== CONTEXT FROM ACCOMPANYING TEXT/CAPTION ===\nThe user posted this image along with this text caption. Use this caption to help identify the symbol, action, entry, target, or stop loss. If the image itself lacks text but is a chart of the symbol mentioned in the caption, use the caption details:\n"${caption}"`
      : VLM_SIGNAL_EXTRACT_PROMPT;

    // 1. Try configured vision parser (OmniRoute / Groq)
    try {
      const { content, model } = await callConfiguredVisionParser(base64Image, mimeType, visionPrompt);
      const parsed = normalizeImageParseResult(parseAIResponse<Partial<VLMImageParseResult>>(content, EMPTY_IMAGE_PARSE_RESULT));
      if (hasUsefulImageParse(parsed)) {
        result = parsed;
        result.modelName = model;
      }
    } catch (visionErr) {
      console.warn('[AI Engine] Configured vision parser failed, trying SDK fallback:', visionErr);
    }

    // 2. SDK Fallback (GLM-4v-flash via ZAI) if no result yet
    if (!result) {
      const zai = await getZAI();
      const firstPass = await callVisionSignalParser(zai, base64Image, mimeType, visionPrompt);

      if (hasUsefulImageParse(firstPass)) {
        result = firstPass;
      } else {
        const retryPrompt = `${visionPrompt}

The first OCR/chart pass may fail on mobile TradingView screenshots. Focus on the top/header text and visible price labels. If you can read only a company name or symbol but not full trade levels, still return extractedText and chartAnalysis with symbol/companyName/latestPrice when visible.`;

        for (const variant of await createEnhancedImageVariants(base64Image)) {
          console.log(`[AI Engine] Retrying image parse with ${variant.label}`);
          try {
            const retry = await callVisionSignalParser(zai, variant.base64, variant.mimeType, retryPrompt);
            if (hasUsefulImageParse(retry)) {
              result = {
                ...retry,
                extractedText: retry.extractedText || firstPass.extractedText,
              };
              break;
            }
          } catch (e) {
            console.warn('[AI Engine] Variant parse failed:', e);
          }
        }

        if (!result) result = firstPass;
      }
    }

    // 3. Final fallback: if VLM returned extracted text but NO signals, try deriving from text
    if (result && result.signals.length === 0 && result.extractedText.trim().length > 10) {
      console.log('[AI Engine] VLM returned no signals. Attempting text-signal fallback parser...');
      try {
        const textSignal = await deriveTrustedTextSignal(result.extractedText);
        if (textSignal) {
          console.log('[AI Engine] Text-signal fallback extracted signal for:', textSignal.symbol);
          return {
            ...result,
            signals: [textSignal],
            hasValidSignals: true,
          };
        }
      } catch (textErr) {
        console.warn('[AI Engine] Text-signal fallback failed:', textErr);
      }

      // Chart fallback: derive from chartAnalysis if imageType is chart
      if (result.imageType === 'chart' && result.chartAnalysis) {
        try {
          const chartSignal = deriveTrustedChartSignal(result);
          if (chartSignal) {
            console.log('[AI Engine] Chart-signal fallback extracted signal for:', chartSignal.symbol);
            return {
              ...result,
              signals: [chartSignal],
              hasValidSignals: true,
            };
          }
        } catch (chartErr) {
          console.warn('[AI Engine] Chart-signal fallback failed:', chartErr);
        }
      }
    }

    return result ?? EMPTY_IMAGE_PARSE_RESULT;
  } catch (err) {
    console.error('[AI Engine] VLM image parsing failed:', err);
    return EMPTY_IMAGE_PARSE_RESULT;
  }
}

// ─── Web Search for Market News ─────────────────────────────────────────────

// Known financial news URLs for page_reader fallback
const FINANCIAL_NEWS_URLS = [
  'https://www.moneycontrol.com/news/markets/',
  'https://economictimes.indiatimes.com/markets',
  'https://www.livemint.com/market',
  'https://www.businesstoday.in/markets',
  'https://www.business-standard.com/markets',
  'https://www.thehindubusinessline.com/markets/',
];

// RSS feed URLs for direct HTTP fallback (no SDK needed)
const NEWS_RSS_URLS = [
  'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',
  'https://www.moneycontrol.com/rss/Moneycontrol_latest.xml',
  'https://www.livemint.com/rss/markets',
  'https://www.business-standard.com/rss/markets-106.rss',
  'https://www.thehindubusinessline.com/markets/feeder/default.rss',
  'https://news.google.com/rss/search?q=NSE%20stock%20market%20Nifty%20Sensex%20when%3A1d&hl=en-IN&gl=IN&ceid=IN%3Aen',
  'https://news.google.com/rss/search?q=Indian%20stocks%20earnings%20results%20brokerage%20target%20when%3A1d&hl=en-IN&gl=IN&ceid=IN%3Aen',
  'https://news.google.com/rss/search?q=NSE%20stocks%20order%20win%20contract%20capex%20approval%20when%3A1d&hl=en-IN&gl=IN&ceid=IN%3Aen',
  'https://news.google.com/rss/search?q=India%20stock%20brokerage%20upgrade%20downgrade%20target%20price%20when%3A1d&hl=en-IN&gl=IN&ceid=IN%3Aen',
  'https://news.google.com/rss/search?q=NSE%20bulk%20deal%20block%20deal%20promoter%20pledge%20dividend%20bonus%20split%20when%3A1d&hl=en-IN&gl=IN&ceid=IN%3Aen',
  'https://news.google.com/rss/search?q=Indian%20company%20quarterly%20results%20profit%20margin%20guidance%20stock%20when%3A1d&hl=en-IN&gl=IN&ceid=IN%3Aen',
];

/**
 * Fallback: use page_reader to scrape financial news sites directly.
 * Returns results in SearchFunctionResultItem format.
 */
export async function searchNewsViaPageReader(): Promise<SearchFunctionResultItem[]> {
  const zai = await getZAI();
  const allResults: SearchFunctionResultItem[] = [];

  // Process up to 2 sites to avoid excessive API calls
  const urlsToTry = FINANCIAL_NEWS_URLS.slice(0, 2);

  for (const url of urlsToTry) {
    try {
      console.log(`[AI Engine] Trying page_reader fallback for: ${url}`);
      const result = await Promise.race([
        zai.functions.invoke('page_reader', { url }),
        new Promise<null>((resolve) =>
          setTimeout(() => {
            console.log(`[AI Engine] page_reader timed out for ${url}`);
            resolve(null);
          }, 12_000)
        ),
      ]) as { data?: { title?: string; html?: string; url?: string; publishedTime?: string } } | null;

      if (!result?.data?.html) {
        console.log(`[AI Engine] page_reader returned no HTML for ${url}`);
        continue;
      }

      const html = result.data.html;
      const pageUrl = result.data.url || url;
      let hostname = '';
      try {
        hostname = new URL(pageUrl).hostname;
      } catch {
        hostname = pageUrl;
      }

      // Parse article links and titles from HTML
      // Common patterns: <a href="..." ...>Title</a> inside article/list containers
      const articleRegex = /<a[^>]+href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;
      let rank = allResults.length + 1;

      while ((match = articleRegex.exec(html)) !== null && allResults.length < 20) {
        const articleUrl = match[1];
        const rawTitle = match[2]
          .replace(/<[^>]+>/g, '')  // Strip HTML tags
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .trim();

        // Filter: only include links that look like news articles
        // Must have a reasonable title length and be an internal link
        if (
          !rawTitle ||
          rawTitle.length < 15 ||
          rawTitle.length > 200 ||
          articleUrl.startsWith('#') ||
          articleUrl.startsWith('javascript')
        ) {
          continue;
        }

        // Skip navigation/header links - must contain market-related keywords
        const lowerTitle = rawTitle.toLowerCase();
        const marketKeywords = [
          'stock', 'market', 'nifty', 'sensex', 'share', 'profit', 'loss',
          'rally', 'surge', 'fall', 'gain', 'trade', 'investor', 'ipo',
          'buy', 'sell', 'price', 'index', 'sector', 'bank', 'tata',
          'reliance', 'hdfc', 'icici', 'infosys', 'itc', 'sbi',
          'earnings', 'revenue', 'growth', 'decline', 'quarter', 'result',
          'bond', 'rupee', 'rupee', 'fii', 'dii', 'mutual fund',
          'nse', 'bse', 'sebi', 'broker', 'dividend', 'portfolio',
        ];
        const hasMarketKeyword = marketKeywords.some(kw => lowerTitle.includes(kw));
        if (!hasMarketKeyword) {
          continue;
        }

        // Resolve relative URLs
        let fullUrl = articleUrl;
        if (articleUrl.startsWith('/')) {
          try {
            const baseUrl = new URL(url);
            fullUrl = `${baseUrl.protocol}//${baseUrl.host}${articleUrl}`;
          } catch {
            fullUrl = articleUrl;
          }
        }

        allResults.push({
          url: fullUrl,
          name: rawTitle,
          snippet: rawTitle, // page_reader doesn't give snippets; use title
          host_name: hostname,
          rank,
          date: result.data.publishedTime || new Date().toISOString(),
          favicon: `https://${hostname}/favicon.ico`,
        });
        rank++;
      }

      console.log(`[AI Engine] page_reader extracted ${allResults.length} articles from ${hostname}`);
    } catch (err: any) {
      console.error(`[AI Engine] page_reader failed for ${url}:`, err?.message?.substring(0, 100));
    }
  }

  return allResults;
}

/**
 * Ultimate fallback: Direct HTTP fetch of RSS feeds — NO SDK needed.
 * This works even when the entire z-ai-web-dev-sdk is rate-limited.
 * Parses RSS/XML to extract news articles.
 */
function decodeXmlEntities(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function cleanRssText(value: string): string {
  return decodeXmlEntities(value)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function searchNewsViaRSS(): Promise<SearchFunctionResultItem[]> {
  const perFeedResults = await Promise.all(NEWS_RSS_URLS.map(async (feedUrl) => {
    const feedResults: SearchFunctionResultItem[] = [];
    try {
      console.log(`[AI Engine] Trying RSS feed: ${feedUrl}`);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8_000);

      const response = await fetch(feedUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AutoTradeBot/1.0)',
          'Accept': 'application/rss+xml, application/xml, text/xml, */*',
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        console.log(`[AI Engine] RSS fetch failed for ${feedUrl}: ${response.status}`);
        return feedResults;
      }

      const xml = await response.text();
      let hostname = '';
      try {
        hostname = new URL(feedUrl).hostname;
      } catch {
        hostname = feedUrl;
      }

      // Parse RSS <item> elements
      // RSS format: <item><title>...</title><link>...</link><description>...</description><pubDate>...</pubDate></item>
      const itemRegex = /<item[\s\S]*?>([\s\S]*?)<\/item>/gi;
      let itemMatch: RegExpExecArray | null;
      let rank = 1;

      while ((itemMatch = itemRegex.exec(xml)) !== null && feedResults.length < 12) {
        const itemXml = itemMatch[1];

        // Extract title
        const titleMatch = itemXml.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>|<title>([\s\S]*?)<\/title>/i);
        const rawTitle = (titleMatch?.[1] || titleMatch?.[2] || '').trim();

        // Extract link
        const linkMatch = itemXml.match(/<link><!\[CDATA\[([\s\S]*?)\]\]><\/link>|<link>([\s\S]*?)<\/link>/i);
        const rawLink = (linkMatch?.[1] || linkMatch?.[2] || '').trim();

        // Extract description/snippet
        const descMatch = itemXml.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>|<description>([\s\S]*?)<\/description>/i);
        const rawDesc = (descMatch?.[1] || descMatch?.[2] || '').trim();

        const title = cleanRssText(rawTitle);
        const link = decodeXmlEntities(rawLink).trim();
        const description = cleanRssText(rawDesc);

        // Extract date
        const dateMatch = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>|<published>([\s\S]*?)<\/published>/i);
        const date = cleanRssText(dateMatch?.[1] || dateMatch?.[2] || '').trim() || new Date().toISOString();

        if (!title || title.length < 10) continue;

        feedResults.push({
          url: link || feedUrl,
          name: title,
          snippet: description || title,
          host_name: hostname,
          rank,
          date: date,
          favicon: `https://${hostname}/favicon.ico`,
        });
        rank++;
      }

      console.log(`[AI Engine] RSS extracted ${feedResults.length} articles from ${hostname}`);
    } catch (err: any) {
      console.error(`[AI Engine] RSS fetch failed for ${feedUrl}:`, err?.message?.substring(0, 100));
    }
    return feedResults;
  }));

  const seen = new Set<string>();
  const allResults: SearchFunctionResultItem[] = [];
  for (const feedResults of perFeedResults) {
    for (const item of feedResults) {
      const key = item.url || `${item.name}::${item.snippet}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      allResults.push({ ...item, rank: allResults.length + 1 });
    }
  }

  return allResults.slice(0, 80);
}

export async function searchMarketNews(
  query: string,
  retries: number = 0
): Promise<SearchFunctionResultItem[]> {
  const SEARCH_TIMEOUT_MS = 15_000;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const zai = await getZAI();
      const results = await Promise.race([
        zai.functions.invoke('web_search', {
          query,
          num: 10,
          recency_days: 3, // Only get recent results (last 3 days)
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Search timed out')), SEARCH_TIMEOUT_MS)
        ),
      ]);
      markSearchSuccess();
      return results;
    } catch (err: any) {
      const is429 = err?.message?.includes('429') || err?.message?.includes('Too many requests') || err?.message?.includes('rate limit');
      if (is429) {
        markSearchRateLimited();
        console.error('[AI Engine] Web search rate limited (429), trying CLI fallback');

        // Try CLI fallback on 429
        try {
          const cliResults = await searchViaCLI(query);
          if (cliResults.length > 0) {
            console.log(`[AI Engine] CLI fallback returned ${cliResults.length} results`);
            return cliResults;
          }
        } catch (cliErr) {
          console.error('[AI Engine] CLI fallback also failed:', cliErr);
        }

        // Try page_reader fallback when both web_search and CLI are rate-limited
        console.log('[AI Engine] Trying page_reader fallback for news...');
        try {
          const pageResults = await searchNewsViaPageReader();
          if (pageResults.length > 0) {
            console.log(`[AI Engine] page_reader fallback returned ${pageResults.length} articles`);
            return pageResults;
          }
        } catch (pageErr) {
          console.error('[AI Engine] page_reader fallback also failed:', pageErr);
        }

        // Try RSS direct HTTP fallback (no SDK needed)
        console.log('[AI Engine] Trying RSS direct HTTP fallback for news...');
        try {
          const rssResults = await searchNewsViaRSS();
          if (rssResults.length > 0) {
            console.log(`[AI Engine] RSS fallback returned ${rssResults.length} articles`);
            return rssResults;
          }
        } catch (rssErr) {
          console.error('[AI Engine] RSS fallback also failed:', rssErr);
        }

        console.log('[AI Engine] All search methods failed, returning empty results');
        return [];
      }
      console.error(`[AI Engine] Search attempt ${attempt + 1} failed for "${query}":`, err.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 2000)); // 2s backoff between retries
      } else {
        // On last retry failure, try page_reader then RSS before giving up
        console.log('[AI Engine] All retries exhausted, trying page_reader fallback...');
        try {
          const pageResults = await searchNewsViaPageReader();
          if (pageResults.length > 0) {
            console.log(`[AI Engine] page_reader fallback returned ${pageResults.length} articles`);
            return pageResults;
          }
        } catch (pageErr) {
          console.error('[AI Engine] page_reader fallback failed:', pageErr);
        }

        // Try RSS direct HTTP fallback
        console.log('[AI Engine] Trying RSS direct HTTP fallback...');
        try {
          const rssResults = await searchNewsViaRSS();
          if (rssResults.length > 0) {
            console.log(`[AI Engine] RSS fallback returned ${rssResults.length} articles`);
            return rssResults;
          }
        } catch (rssErr) {
          console.error('[AI Engine] RSS fallback also failed:', rssErr);
        }

        return [];
      }
    }
  }
  return [];
}

export async function searchNewsViaOmniRoute(
  query: string,
  maxResults: number = 8
): Promise<SearchFunctionResultItem[]> {
  const SEARCH_TIMEOUT_MS = 10_000;
  try {
    const baseUrl = process.env.OMNIROUTE_BASE_URL
      || await getBotSetting('omniRouteBaseUrl')
      || DEFAULT_OMNIROUTE_BASE_URL;
    const searchUrl = baseUrl.replace(/\/chat\/completions$/, '/search');
    const token = process.env.OMNIROUTE_KEY || await getBotSetting('omniRouteKey') || '';

    console.log(`[AI Engine] OmniRoute search: "${query.slice(0, 45)}" → ${searchUrl}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
    try {
      const res = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          max_results: maxResults,
          search_type: 'web',
        }),
        signal: controller.signal,
      });
      const responseText = await res.text();
      if (!res.ok) {
        console.error(`[AI Engine] OmniRoute search failed (${res.status}): ${responseText.slice(0, 300)}`);
        return [];
      }
      const data = JSON.parse(responseText);
      if (data?.errors?.length) {
        console.error('[AI Engine] OmniRoute search provider errors:', data.errors);
      }
      const results: Array<{
        title?: string;
        url?: string;
        display_url?: string | null;
        snippet?: string | null;
        position?: number;
        published_at?: string | null;
        favicon_url?: string | null;
      }> = data?.results || [];
      const items: SearchFunctionResultItem[] = results
        .filter((r) => r.title && r.url)
        .map((r, index) => {
          let host = '';
          try { host = new URL(r.url!).hostname.replace(/^www\./, ''); } catch { host = ''; }
          return {
            url: r.url!,
            name: r.title!,
            snippet: r.snippet || r.title!,
            host_name: host || r.display_url || 'unknown',
            rank: r.position || index + 1,
            date: r.published_at || new Date().toISOString(),
            favicon: r.favicon_url || (host ? `https://${host}/favicon.ico` : ''),
          };
        });
      console.log(`[AI Engine] OmniRoute search returned ${items.length} results for "${query.slice(0, 45)}"`);
      return items;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (err: any) {
    console.error(`[AI Engine] OmniRoute search failed for "${query.slice(0, 45)}":`, err?.message?.substring(0, 200));
    return [];
  }
}

// Track search success to reset rate limit state
let lastSearchSuccessAt = 0;
function markSearchSuccess() {
  lastSearchSuccessAt = Date.now();
}

// CLI-based fallback for web search when SDK is rate-limited
async function searchViaCLI(query: string): Promise<SearchFunctionResultItem[]> {
  const { execFile } = await import('child_process');
  const args = [
    'function',
    '-n', 'web_search',
    '-a', JSON.stringify({ query, num: 5, recency_days: 3 }),
  ];

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('CLI search timed out'));
    }, 15_000);

    execFile('z-ai', args, { timeout: 15_000 }, (error, stdout, stderr) => {
      clearTimeout(timeout);
      if (error) {
        reject(error);
        return;
      }
      try {
        // Parse the CLI output - it may contain emoji prefixes
        const jsonMatch = stdout.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const results = JSON.parse(jsonMatch[0]);
          resolve(Array.isArray(results) ? results : []);
        } else {
          resolve([]);
        }
      } catch {
        resolve([]);
      }
    });
  });
}

// ─── News Sentiment Analysis ────────────────────────────────────────────────

const SENTIMENT_SYSTEM_PROMPT = `You are a financial sentiment analyzer for Indian stock markets and short-term trading.

Analyze the following news and respond ONLY with valid JSON:
{
  "sentiment": "positive",
  "sentimentScore": 0.7,
  "relatedSymbols": ["RELIANCE", "TCS"],
  "summary": "Brief catalyst, likely trade direction, timeframe, and main risk"
}

Rules:
- sentiment must be "positive", "negative", or "neutral"
- sentimentScore must be between -1 (very negative) and 1 (very positive)
- relatedSymbols should list any NSE/BSE stock symbols mentioned; convert company names to symbols when obvious, for example HDFC Bank -> HDFCBANK and ITC Ltd -> ITC
- Prefer high scores only for actionable catalysts such as results, brokerage target changes, order wins, contracts, approvals, block/bulk deals, promoter pledge, dividend/bonus/split/buyback, major guidance, or sector policy impact
- Generic index wrap news should usually be neutral unless it clearly affects a sector or named stock
- Keep summary concise (1-2 sentences), but include catalyst + trade relevance`;

export async function analyzeNewsSentiment(
  title: string,
  content: string
): Promise<SentimentResult> {
  try {
    const completion = await callConfiguredChatCompletion([
      { role: 'system', content: SENTIMENT_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Title: ${title}\n\nContent: ${content}`,
      },
    ], {
      temperature: 0.1,
      maxTokens: 700,
      timeoutMs: 45_000,
      jsonMode: true,
    });

    const parsed = parseAIResponse<SentimentResult>(completion.content, {
      sentiment: 'neutral',
      sentimentScore: 0,
      relatedSymbols: [],
      summary: 'Unable to analyze sentiment',
    });
    const relatedSymbols = resolveRelatedSymbols(`${title} ${content}`, parsed.relatedSymbols);
    return {
      ...parsed,
      relatedSymbols,
      summary: relatedSymbols.length > 0
        ? parsed.summary
        : `${parsed.summary} No verified NSE symbol found in article text.`,
    };
  } catch (err: any) {
    if (isRateLimitError(err)) {
      markLLMRateLimited();
    }
    console.error('[AI Engine] Hugging Face sentiment failed:', err?.message?.substring(0, 120));
  }

  // Rule-based sentiment fallback
  const upper = (title + ' ' + content).toUpperCase();
  const bullishWords = [
    'rally', 'surge', 'gain', 'rise', 'bullish', 'upgrade', 'positive',
    'growth', 'profit', 'beat', 'strong', 'order win', 'contract win',
    'target price raised', 'buy rating', 'margin expansion', 'approval',
    'dividend', 'bonus', 'split', 'buyback', 'block deal',
  ];
  const bearishWords = [
    'fall', 'drop', 'decline', 'bearish', 'downgrade', 'negative', 'loss',
    'miss', 'weak', 'crash', 'target price cut', 'sell rating',
    'margin pressure', 'pledge', 'penalty', 'probe', 'default',
  ];

  let posCount = 0, negCount = 0;
  for (const w of bullishWords) if (upper.includes(w.toUpperCase())) posCount++;
  for (const w of bearishWords) if (upper.includes(w.toUpperCase())) negCount++;

  const relatedSymbols = resolveRelatedSymbols(`${title} ${content}`);

  const sentiment: 'positive' | 'negative' | 'neutral' = posCount > negCount + 1 ? 'positive' : negCount > posCount + 1 ? 'negative' : 'neutral';
  const sentimentScore = sentiment === 'positive' ? Math.min(posCount * 0.15, 0.8) : sentiment === 'negative' ? -Math.min(negCount * 0.15, 0.8) : 0;

  return {
    sentiment,
    sentimentScore,
    relatedSymbols: relatedSymbols.slice(0, 5),
    summary: `Rule-based: ${sentiment} sentiment detected (${posCount} positive, ${negCount} negative keywords)`,
  };
}

// ─── Utility ────────────────────────────────────────────────────────────────

function extractJsonObject(content: string): unknown {
  try {
    let jsonStr = content.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

function parseAIResponse<T>(content: string, fallback: T): T {
  const parsed = extractJsonObject(content);
  if (parsed === null) {
    console.error('Failed to parse AI response:', content?.substring(0, 200));
    return fallback;
  }
  return parsed as T;
}
