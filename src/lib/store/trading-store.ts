import { create } from 'zustand'
import type { TradeSignal, Position, NewsItem, Settings, TabType, TelegramChannel } from '@/lib/types/trading'

interface TradingStore {
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
  selectedSymbol: string
  setSelectedSymbol: (symbol: string) => void
  signals: TradeSignal[]
  setSignals: (signals: TradeSignal[]) => void
  addSignal: (signal: TradeSignal) => void
  positions: Position[]
  setPositions: (positions: Position[]) => void
  news: NewsItem[]
  setNews: (news: NewsItem[]) => void
  isLoading: boolean
  setIsLoading: (loading: boolean) => void
  settings: Settings
  updateSettings: (settings: Partial<Settings>) => void
  addTelegramChannel: (channel: TelegramChannel) => void
  removeTelegramChannel: (id: string) => void
  addWatchlistSymbol: (symbol: string) => void
  removeWatchlistSymbol: (symbol: string) => void
  marketOpen: boolean
}

const defaultSettings: Settings = {
  aiModel: 'auto',
  newsAnalysisEnabled: true,
  telegramSignalEnabled: true,
  aiWeight: 70,
  telegramWeight: 30,
  maxPositionSize: 100000,
  maxDailyTrades: 10,
  stopLossDefault: 2,
  riskPerTrade: 2,
  telegramChannels: [
    { id: '1', name: 'StockPro India', channelId: '@stockproindia', active: true },
    { id: '2', name: 'Nifty Trader', channelId: '@niftytrader', active: true },
  ],
  watchlist: [
    'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
    'SBIN', 'WIPRO', 'ITC', 'BHARTIARTL', 'MARUTI',
  ],
  autoPauseOnMacroEvents: false,
}


export const useTradingStore = create<TradingStore>((set) => ({
  activeTab: 'dashboard',
  setActiveTab: (tab) => set({ activeTab: tab }),
  selectedSymbol: 'RELIANCE',
  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),
  signals: [],
  setSignals: (signals) => set({ signals }),
  addSignal: (signal) => set((state) => ({ signals: [signal, ...state.signals] })),
  positions: [],
  setPositions: (positions) => set({ positions }),
  news: [],
  setNews: (news) => set({ news }),
  isLoading: false,
  setIsLoading: (loading) => set({ isLoading: loading }),
  settings: defaultSettings,
  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings },
    })),
  addTelegramChannel: (channel) =>
    set((state) => ({
      settings: {
        ...state.settings,
        telegramChannels: [...state.settings.telegramChannels, channel],
      },
    })),
  removeTelegramChannel: (id) =>
    set((state) => ({
      settings: {
        ...state.settings,
        telegramChannels: state.settings.telegramChannels.filter((c) => c.id !== id),
      },
    })),
  addWatchlistSymbol: (symbol) =>
    set((state) => ({
      settings: {
        ...state.settings,
        watchlist: [...state.settings.watchlist, symbol],
      },
    })),
  removeWatchlistSymbol: (symbol) =>
    set((state) => ({
      settings: {
        ...state.settings,
        watchlist: state.settings.watchlist.filter((s) => s !== symbol),
      },
    })),
  marketOpen: true,
}))
