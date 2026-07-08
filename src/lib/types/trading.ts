export interface TradeSignal {
  id: string
  symbol: string
  exchange: string
  action: 'BUY' | 'SELL'
  source: 'ai-news' | 'ai-technical' | 'telegram' | 'telegram-image' | 'telegram-chart-image' | 'manual'

  confidence: number
  entryPrice: number
  targetPrice?: number
  stopLoss?: number
  quantity: number
  reasoning?: string
  status: 'pending' | 'executed' | 'closed' | 'expired'
  pnl?: number
  modelName?: string
  channelId?: string
  tradeType?: string
  postUrl?: string
  sourceTimestamp?: string
  createdAt: string

  updatedAt: string
}

export interface Position {
  id: string
  symbol: string
  exchange: string
  action: 'BUY' | 'SELL'
  quantity: number
  entryPrice: number
  currentPrice?: number
  pnl?: number
  pnlPercent?: number
  status: 'open' | 'closed'
  signalId?: string
  closedAt?: string
  createdAt: string
  updatedAt: string
}

export interface NewsItem {
  id: string
  title: string
  content?: string
  source: string
  sentiment?: 'positive' | 'negative' | 'neutral'
  sentimentScore?: number
  relatedSymbols?: string[]
  analyzed: boolean
  aiSummary?: string
  publishedAt?: string
  createdAt: string
}

export interface Settings {
  aiModel: string
  newsAnalysisEnabled: boolean
  telegramSignalEnabled: boolean
  aiWeight: number
  telegramWeight: number
  maxPositionSize: number
  maxDailyTrades: number
  stopLossDefault: number
  riskPerTrade: number
  broker: 'groww'
  telegramChannels: TelegramChannel[]
  watchlist: string[]
  autoPauseOnMacroEvents: boolean

}

export interface TelegramChannel {
  id: string
  name: string
  channelId: string
  active: boolean
}

export type TabType = 'dashboard' | 'signals' | 'portfolio' | 'history' | 'news' | 'risk' | 'screener' | 'backtest' | 'settings'

export const NSE_SYMBOLS = [
  'RELIANCE',
  'TCS',
  'INFY',
  'HDFCBANK',
  'ICICIBANK',
  'SBIN',
  'WIPRO',
  'ITC',
  'BHARTIARTL',
  'MARUTI',
] as const

export const NIFTY50_SYMBOLS = [
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'SBIN', 'WIPRO', 'ITC', 'BHARTIARTL', 'MARUTI',
  'HINDUNILVR', 'BAJFINANCE', 'ASIANPAINT', 'KOTAKBANK',
  'LT', 'HCLTECH', 'AXISBANK', 'TITAN', 'SUNPHARMA',
  'TATAMOTORS', 'TATASTEEL', 'ADANIENT', 'ADANIPORTS',
  'NTPC', 'POWERGRID', 'ONGC', 'COALINDIA',
  'BAJAJFINSV', 'ULTRACEMCO', 'NESTLEIND',
  'TECHM', 'DRREDDY', 'CIPLA', 'DIVISLAB',
  'BPCL', 'IOC', 'HEROMOTOCO', 'EICHERMOT',
  'M&M', 'HINDALCO', 'JSWSTEEL', 'TATACONSUM',
  'WIPRO', 'GRASIM', 'INDUSINDBK', 'SBILIFE',
  'HDFCLIFE', 'BRITANNIA', 'APOLLOHOSP',
] as const
