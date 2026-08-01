import { create } from 'zustand'

// ─── Types ─────────────────────────────────────────────────

export interface TradeSignal {
  id: string
  symbol: string
  exchange: string
  action: 'BUY' | 'SELL'
  source: string
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
  orderId?: string

}

export interface AIDecision {
  id: string
  model: string
  inputType: string
  inputData: string
  output: string
  symbol?: string
  action?: string
  confidence?: number
  createdAt: string
}

export interface TelegramChannel {
  id: string
  name: string
  channelId: string
  isActive: boolean
  lastMessageId?: string
  createdAt: string
  updatedAt: string
}


export interface LivePosition {
  symbol: string
  quantity: number
  entryPrice: number
  currentPrice: number
  pnl: number
  pnlPercent: number
  action: 'BUY' | 'SELL'
}

export type RiskLevel = 'conservative' | 'moderate' | 'aggressive'
export type BotStatus = 'running' | 'stopped' | 'scanning'

export interface BotConfig {
  autoTrade: boolean
  maxPerTrade: number
  dailyLimit: number
  totalBudget: number
  scanInterval: number // minutes
  riskLevel: RiskLevel
  confidenceThreshold: number // 0-100, default 70
  autoPauseOnMacroEvents: boolean // pause scanning 15m around macro events
}

export interface NewsItem {
  id: string
  title: string
  content: string | null
  source: string
  sentiment: string | null
  sentimentScore: number | null
  relatedSymbols: string | null
  analyzed: boolean
  aiSummary: string | null
  publishedAt: string | null
  createdAt: string
}

export interface ActivityItem {
  id: string
  message: string
  type: 'trade' | 'scan' | 'signal' | 'order' | 'system' | 'news'
  timestamp: string
}

// ─── Store Interface ───────────────────────────────────────

interface AutoTradeStore {
  // Bot state
  botStatus: BotStatus
  setBotStatus: (status: BotStatus) => void

  // Config
  config: BotConfig
  updateConfig: (config: Partial<BotConfig>) => void

  // Signals
  signals: TradeSignal[]
  setSignals: (signals: TradeSignal[]) => void
  signalFilter: 'all' | 'BUY' | 'SELL'
  setSignalFilter: (filter: 'all' | 'BUY' | 'SELL') => void

  // AI Engine
  aiDecisions: AIDecision[]
  setAiDecisions: (decisions: AIDecision[]) => void
  sentiment: 'bullish' | 'bearish' | 'neutral'
  setSentiment: (sentiment: 'bullish' | 'bearish' | 'neutral') => void
  lastScanTime: string | null
  setLastScanTime: (time: string | null) => void
  nextScanTime: string | null
  setNextScanTime: (time: string | null) => void
  isScanning: boolean
  setIsScanning: (scanning: boolean) => void

  // Trades
  positions: LivePosition[]
  setPositions: (positions: LivePosition[]) => void
  todayPnl: number
  setTodayPnl: (pnl: number) => void
  totalTrades: number
  setTotalTrades: (count: number) => void
  winRate: number
  setWinRate: (rate: number) => void

  // Telegram
  telegramChannels: TelegramChannel[]
  setTelegramChannels: (channels: TelegramChannel[]) => void


  // News
  newsItems: NewsItem[]
  setNewsItems: (items: NewsItem[]) => void
  newsLoading: boolean
  setNewsLoading: (loading: boolean) => void
  newsScanning: boolean
  setNewsScanning: (scanning: boolean) => void

  // Activity feed
  activityFeed: ActivityItem[]
  addActivity: (item: Omit<ActivityItem, 'id' | 'timestamp'>) => void
  clearActivityFeed: () => void

  // Loading states
  loadingSignals: boolean
  setLoadingSignals: (loading: boolean) => void
  loadingTrades: boolean
  setLoadingTrades: (loading: boolean) => void
  loadingSetup: boolean
  setLoadingSetup: (loading: boolean) => void
}

// ─── Default Config ────────────────────────────────────────

const defaultConfig: BotConfig = {
  autoTrade: false,
  maxPerTrade: 10000,
  dailyLimit: 50000,
  totalBudget: 100000,
  scanInterval: 30,
  riskLevel: 'moderate',
  confidenceThreshold: 78,
  autoPauseOnMacroEvents: false,
}

// ─── Store ─────────────────────────────────────────────────

export const useAutoTradeStore = create<AutoTradeStore>((set) => ({
  botStatus: 'stopped',
  setBotStatus: (botStatus) => set({ botStatus }),

  config: defaultConfig,
  updateConfig: (partial) => set((state) => ({ config: { ...state.config, ...partial } })),

  signals: [],
  setSignals: (signals) => set({ signals }),
  signalFilter: 'all',
  setSignalFilter: (signalFilter) => set({ signalFilter }),

  aiDecisions: [],
  setAiDecisions: (aiDecisions) => set({ aiDecisions }),
  sentiment: 'neutral',
  setSentiment: (sentiment) => set({ sentiment }),
  lastScanTime: null,
  setLastScanTime: (lastScanTime) => set({ lastScanTime }),
  nextScanTime: null,
  setNextScanTime: (nextScanTime) => set({ nextScanTime }),
  isScanning: false,
  setIsScanning: (isScanning) => set({ isScanning }),

  positions: [],
  setPositions: (positions) => set({ positions }),
  todayPnl: 0,
  setTodayPnl: (todayPnl) => set({ todayPnl }),
  totalTrades: 0,
  setTotalTrades: (totalTrades) => set({ totalTrades }),
  winRate: 0,
  setWinRate: (winRate) => set({ winRate }),

  telegramChannels: [],
  setTelegramChannels: (telegramChannels) => set({ telegramChannels }),


  newsItems: [],
  setNewsItems: (newsItems) => set({ newsItems }),
  newsLoading: false,
  setNewsLoading: (newsLoading) => set({ newsLoading }),
  newsScanning: false,
  setNewsScanning: (newsScanning) => set({ newsScanning }),

  activityFeed: [],
  addActivity: (item) => set((state) => ({
    activityFeed: [
      { ...item, id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, timestamp: new Date().toISOString() },
      ...state.activityFeed,
    ].slice(0, 50),
  })),
  clearActivityFeed: () => set({ activityFeed: [] }),

  loadingSignals: false,
  setLoadingSignals: (loadingSignals) => set({ loadingSignals }),
  loadingTrades: false,
  setLoadingTrades: (loadingTrades) => set({ loadingTrades }),
  loadingSetup: false,
  setLoadingSetup: (loadingSetup) => set({ loadingSetup }),
}))
