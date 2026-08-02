'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useTradingStore } from '@/lib/store/trading-store'
import { mockSignals, mockPositions, mockNews, watchlistData } from '@/lib/mock-data'
import { TradingViewChart } from '@/components/tradingview-chart'
import { CandlestickChart } from '@/components/candlestick-chart'
import { AISignalCard } from '@/components/ai-signal-card'
import { SignalList } from '@/components/signal-list'
import { SourceLeaderboard } from '@/components/source-leaderboard'
import { PortfolioTracker } from '@/components/portfolio-tracker'
import { NewsFeed } from '@/components/news-feed'
import { MacroEventsWidget } from '@/components/macro-events'
import { SettingsPanel } from '@/components/settings-panel'
import { MarketTicker } from '@/components/market-ticker'
import { SignalDetailDrawer } from '@/components/signal-detail-drawer'
import { TradeHistory } from '@/components/trade-history'
import { PerformanceAnalytics } from '@/components/performance-analytics'
import { MultiModelConsensus } from '@/components/multi-model-consensus'
import { NotificationCenter } from '@/components/notification-center'
import { AutoScanTimer } from '@/components/auto-scan-timer'
import { NewsAutoRefresh } from '@/components/news-auto-refresh'
import { MarketHeatmap } from '@/components/market-heatmap'
import { MarketDepth } from '@/components/market-depth'
import { QuickTradeDialog, QuickTradeFAB } from '@/components/quick-trade-dialog'
import { RiskCalculator } from '@/components/risk-calculator'
import { StrategyBuilder } from '@/components/strategy-builder'
import { TradeJournal } from '@/components/trade-journal'
import { StockScreener } from '@/components/stock-screener'
import { AIChatAssistant } from '@/components/ai-chat-assistant'
import { TelegramSetupGuide } from '@/components/telegram-setup-guide'
import { PriceAlerts } from '@/components/price-alerts'
import { MarketOverview } from '@/components/market-overview'
import { ExportDialog } from '@/components/export-dialog'
import { BacktestingEngine } from '@/components/backtesting-engine'
import {
  Activity,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Newspaper,
  Settings,
  Wifi,
  WifiOff,
  RefreshCw,
  Moon,
  Sun,
  Loader2,
  Wallet,
  IndianRupee,
  Percent,
  Zap,
  Brain,
  Radio,
  Clock,
  Send,
  Sparkles,
  ChevronRight,
  Keyboard,
  Shield,
  Info,
  Timer,
  FlaskConical,
  Cpu,
  LayoutGrid,
  Filter,
  Download,
  BellRing,
  MessageCircle,
  ArrowUpRight,
  ArrowDownRight,
  Trophy,
} from 'lucide-react'
import { motion, AnimatePresence, type Variants } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts'
import type { TabType, TradeSignal } from '@/lib/types/trading'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import Image from 'next/image'

// P&L chart mock data (last 14 days)
const pnlChartData = Array.from({ length: 14 }, (_, i) => {
  const date = new Date()
  date.setDate(date.getDate() - (13 - i))
  return {
    day: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    pnl: Math.round((Math.sin(i * 0.7) * 800 + Math.random() * 600 - 200) * 100) / 100,
  }
})

// Recent activity data
function getRecentActivity(signals: TradeSignal[]) {
  return signals.slice(0, 4).map((s) => ({
    id: s.id,
    symbol: s.symbol,
    action: s.action,
    source: s.source,
    status: s.status,
    time: s.createdAt,
  }))
}

// CountUp animation hook with value flash
function useCountUp(target: number, duration = 800) {
  const [value, setValue] = useState(0)
  const [flashClass, setFlashClass] = useState('')
  const prevTarget = useRef(0)
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track previous target for flash detection
  const prevTargetForFlash = useRef(target)

  // Determine flash class reactively
  useEffect(() => {
    if (prevTargetForFlash.current !== target) {
      const diff = target - prevTargetForFlash.current
      if (prevTargetForFlash.current !== 0 || target !== 0) {
        const newFlash = diff > 0 ? 'value-flash-green' : diff < 0 ? 'value-flash-red' : ''
        // Use microtask to avoid synchronous setState in effect
        queueMicrotask(() => {
          setFlashClass(newFlash)
          if (flashTimer.current) clearTimeout(flashTimer.current)
          flashTimer.current = setTimeout(() => setFlashClass(''), 500)
        })
      }
      prevTargetForFlash.current = target
    }
  }, [target])

  useEffect(() => {
    if (prevTarget.current === target) return
    const start = prevTarget.current
    const diff = target - start
    const startTime = Date.now()

    const animate = () => {
      const elapsed = Date.now() - startTime
      const progress = Math.min(elapsed / duration, 1)
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(Math.round(start + diff * eased))
      if (progress < 1) requestAnimationFrame(animate)
      else prevTarget.current = target
    }
    requestAnimationFrame(animate)
  }, [target, duration])

  return { value, flashClass }
}

// Dashboard Loading Skeleton
function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <div className="lg:col-span-3 space-y-5">
        <Skeleton className="h-[420px] lg:h-[calc(100vh-460px)] rounded-xl skeleton-shimmer" />
        <Skeleton className="h-48 rounded-xl skeleton-shimmer" />
      </div>
      <div className="lg:col-span-2 space-y-5">
        <Skeleton className="h-72 rounded-xl skeleton-shimmer" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-lg skeleton-shimmer" />
          <Skeleton className="h-20 rounded-lg skeleton-shimmer" />
          <Skeleton className="h-20 rounded-lg skeleton-shimmer" />
        </div>
        <Skeleton className="h-32 rounded-xl skeleton-shimmer" />
        <Skeleton className="h-28 rounded-xl skeleton-shimmer" />
        <Skeleton className="h-48 rounded-xl skeleton-shimmer" />
        <Skeleton className="h-40 rounded-xl skeleton-shimmer" />
        <Skeleton className="h-36 rounded-xl skeleton-shimmer" />
      </div>
    </div>
  )
}

// Section divider component
function SectionDivider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-border/60 to-transparent my-3" />
}

// Telegram connection status badge
function TelegramStatusBadge() {
  const [status, setStatus] = useState<{
    auth: string
    channels?: number
    messagesReceived?: number
    lastMessageAt?: string | null
    lastMessageFrom?: string | null
    errorMessage?: string | null
  } | null>(null)

  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/telegram/userbot')
        if (res.ok) {
          const data = await res.json()
          setStatus(data)
        }
      } catch {
        // service not running
      }
    }
    poll()
    const interval = setInterval(poll, 10000)
    return () => clearInterval(interval)
  }, [])

  const isRevoked = status?.errorMessage?.includes('revoked')

  if (!status || status.auth === 'idle') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="outline" className="text-[10px] gap-1 px-2 py-0.5 cursor-default">
            <MessageCircle className="w-3 h-3 text-muted-foreground" />
            <span className="text-muted-foreground">Telegram</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Telegram not connected</TooltipContent>
      </Tooltip>
    )
  }

  if (status.auth === 'connected' && !isRevoked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="text-[10px] gap-1 px-2 py-0.5 bg-emerald-500/15 text-emerald-500 border-emerald-500/20 cursor-default">
            <MessageCircle className="w-3 h-3" />
            <span>{status.channels || 0}ch{(status.messagesReceived || 0) > 0 ? ` · ${status.messagesReceived}msg` : ''}</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>Telegram Connected</p>
          <p className="text-xs text-muted-foreground">{status.channels || 0} channels monitored</p>
          {status.messagesReceived ? (
            <p className="text-xs text-muted-foreground">{status.messagesReceived} messages received</p>
          ) : null}
          {status.lastMessageAt && (
            <p className="text-xs text-muted-foreground">Last: {status.lastMessageFrom || 'unknown'}</p>
          )}
        </TooltipContent>
      </Tooltip>
    )
  }

  // Session revoked state
  if (isRevoked) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="text-[10px] gap-1 px-2 py-0.5 bg-red-500/15 text-red-500 border-red-500/20 cursor-default animate-pulse">
            <WifiOff className="w-3 h-3" />
            <span>Session Revoked</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-red-400 font-medium">Telegram Session Revoked</p>
          <p className="text-xs text-muted-foreground">Please disconnect and re-authenticate</p>
        </TooltipContent>
      </Tooltip>
    )
  }

  if (status.auth === 'waiting_code' || status.auth === 'waiting_password') {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge className="text-[10px] gap-1 px-2 py-0.5 bg-blue-500/15 text-blue-500 border-blue-500/20 cursor-default animate-pulse">
            <MessageCircle className="w-3 h-3" />
            <span>Auth...</span>
          </Badge>
        </TooltipTrigger>
        <TooltipContent>Telegram authentication in progress</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="outline" className="text-[10px] gap-1 px-2 py-0.5 cursor-default">
          <MessageCircle className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">{status.auth}</span>
        </Badge>
      </TooltipTrigger>
      <TooltipContent>Telegram status: {status.auth}{status.errorMessage ? ` - ${status.errorMessage}` : ''}</TooltipContent>
    </Tooltip>
  )
}


export function TradingDashboard() {
  const {
    activeTab,
    setActiveTab,
    signals,
    setSignals,
    positions,
    setPositions,
    news,
    setNews,
    selectedSymbol,
    updateSettings,
  } = useTradingStore()

  const [isDark, setIsDark] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)
  const [autoScan, setAutoScan] = useState(true)
  const [telegramInput, setTelegramInput] = useState('')
  const [isParsingTelegram, setIsParsingTelegram] = useState(false)
  const [isParsingImage, setIsParsingImage] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [selectedSignal, setSelectedSignal] = useState<TradeSignal | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [quickTradeOpen, setQuickTradeOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [signalsSubTab, setSignalsSubTab] = useState<'list' | 'leaderboard'>('list')
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('all')

  // Animated stats
  const openPositions = positions.filter((p) => p.status === 'open')
  const totalPnl = openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0)
  const wins = openPositions.filter((p) => (p.pnl || 0) >= 0).length
  const winRate = openPositions.length > 0 ? Math.round((wins / openPositions.length) * 100) : 0
  const animatedPnl = useCountUp(Math.abs(totalPnl))
  const animatedWinRate = useCountUp(winRate)
  const animatedActive = useCountUp(openPositions.length)

  // Load initial data from APIs on mount
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [signalsRes, positionsRes, newsRes, settingsRes] = await Promise.all([
          fetch('/api/signals'),
          fetch('/api/positions'),
          fetch('/api/news'),
          fetch('/api/settings'),
        ])

        const signalsData = await signalsRes.json()
        const positionsData = await positionsRes.json()
        const newsData = await newsRes.json()
        const settingsData = await settingsRes.json()

        if (settingsData.settings) {
          const parsedSettings: any = {}
          if (settingsData.settings.autoPauseOnMacroEvents !== undefined) {
            parsedSettings.autoPauseOnMacroEvents = settingsData.settings.autoPauseOnMacroEvents === 'true'
          }
          if (settingsData.settings.newsAnalysisEnabled !== undefined) {
            parsedSettings.newsAnalysisEnabled = settingsData.settings.newsAnalysisEnabled === 'true'
          }
          if (settingsData.settings.telegramSignalEnabled !== undefined) {
            parsedSettings.telegramSignalEnabled = settingsData.settings.telegramSignalEnabled === 'true'
          }
          if (settingsData.settings.aiModel) {
            parsedSettings.aiModel = settingsData.settings.aiModel
          }
          if (settingsData.settings.aiWeight) {
            parsedSettings.aiWeight = Number(settingsData.settings.aiWeight)
          }
          if (settingsData.settings.telegramWeight) {
            parsedSettings.telegramWeight = Number(settingsData.settings.telegramWeight)
          }
          if (settingsData.settings.maxPositionSize) {
            parsedSettings.maxPositionSize = Number(settingsData.settings.maxPositionSize)
          }
          if (settingsData.settings.maxDailyTrades) {
            parsedSettings.maxDailyTrades = Number(settingsData.settings.maxDailyTrades)
          }
          if (settingsData.settings.stopLossDefault) {
            parsedSettings.stopLossDefault = Number(settingsData.settings.stopLossDefault)
          }
          if (settingsData.settings.riskPerTrade) {
            parsedSettings.riskPerTrade = Number(settingsData.settings.riskPerTrade)
          }
          updateSettings(parsedSettings)
        }

        if (signalsData.signals?.length) {
          setSignals(
            signalsData.signals.map((s: Record<string, unknown>) => ({
              ...s,
              createdAt: new Date(s.createdAt as string).toISOString(),
              updatedAt: new Date(s.updatedAt as string).toISOString(),
              sourceTimestamp: s.sourceTimestamp ? new Date(s.sourceTimestamp as string).toISOString() : undefined,
            }))
          )
        } else {
          setSignals(mockSignals)
        }

        if (positionsData.positions?.length) {
          setPositions(
            positionsData.positions.map((p: Record<string, unknown>) => ({
              ...p,
              createdAt: new Date(p.createdAt as string).toISOString(),
              updatedAt: new Date(p.updatedAt as string).toISOString(),
              closedAt: p.closedAt ? new Date(p.closedAt as string).toISOString() : undefined,
            }))
          )
        } else {
          setPositions(mockPositions)
        }

        if (newsData.news?.length) {
          setNews(
            newsData.news.map((n: Record<string, unknown>) => ({
              ...n,
              relatedSymbols: typeof n.relatedSymbols === 'string'
                ? (n.relatedSymbols as string).split(',').filter(Boolean)
                : n.relatedSymbols || [],
              publishedAt: n.publishedAt ? new Date(n.publishedAt as string).toISOString() : undefined,
              createdAt: new Date(n.createdAt as string).toISOString(),
            }))
          )
        } else {
          setNews(mockNews)
        }

        if (!signalsData.signals?.length && !positionsData.positions?.length && !newsData.news?.length) {
          try { await fetch('/api/seed?confirm=true', { method: 'POST' }) } catch { /* ignore */ }
        }
      } catch {
        if (signals.length === 0) setSignals(mockSignals)
        if (positions.length === 0) setPositions(mockPositions)
        if (news.length === 0) setNews(mockNews)
      } finally {
        setInitialLoad(false)
        setLastUpdated(new Date())
      }
    }
    loadInitialData()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const [signalsRes, positionsRes, newsRes] = await Promise.all([
        fetch('/api/signals'),
        fetch('/api/positions'),
        fetch('/api/news'),
      ])
      const signalsData = await signalsRes.json()
      const positionsData = await positionsRes.json()
      const newsData = await newsRes.json()

      if (signalsData.signals?.length) {
        setSignals(signalsData.signals.map((s: Record<string, unknown>) => ({
          ...s, createdAt: new Date(s.createdAt as string).toISOString(), updatedAt: new Date(s.updatedAt as string).toISOString(),
          sourceTimestamp: s.sourceTimestamp ? new Date(s.sourceTimestamp as string).toISOString() : undefined,
        })))
      }
      if (positionsData.positions?.length) {
        setPositions(positionsData.positions.map((p: Record<string, unknown>) => ({
          ...p, createdAt: new Date(p.createdAt as string).toISOString(), updatedAt: new Date(p.updatedAt as string).toISOString(),
          closedAt: p.closedAt ? new Date(p.closedAt as string).toISOString() : undefined,
        })))
      }
      if (newsData.news?.length) {
        setNews(newsData.news.map((n: Record<string, unknown>) => ({
          ...n, relatedSymbols: typeof n.relatedSymbols === 'string' ? (n.relatedSymbols as string).split(',').filter(Boolean) : n.relatedSymbols || [],
          publishedAt: n.publishedAt ? new Date(n.publishedAt as string).toISOString() : undefined,
          createdAt: new Date(n.createdAt as string).toISOString(),
        })))
      }
      setLastUpdated(new Date())
      toast.success('Data Refreshed')
    } catch {
      toast.error('Refresh Failed')
    } finally {
      setIsRefreshing(false)
    }
  }, [setSignals, setPositions, setNews, signals.length, positions.length, news.length])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const tabMap: Record<string, TabType> = {
          '1': 'dashboard',
          '2': 'signals',
          '3': 'portfolio',
          '4': 'history',
          '5': 'news',
          '6': 'risk',
          '7': 'screener',
          '8': 'backtest',
          '9': 'settings',
        }
        if (tabMap[e.key]) {
          e.preventDefault()
          setActiveTab(tabMap[e.key])
          return
        }
        if (e.key === 't' || e.key === 'T') {
          e.preventDefault()
          setQuickTradeOpen(true)
          return
        }
        if (e.key === 'r' || e.key === 'R') {
          e.preventDefault()
          handleRefresh()
          return
        }
        if (e.key === 'e' || e.key === 'E') {
          e.preventDefault()
          setExportOpen(true)
          return
        }
      }

      if (e.key === 'Escape') {
        if (quickTradeOpen) {
          setQuickTradeOpen(false)
        } else if (shortcutsOpen) {
          setShortcutsOpen(false)
        } else if (drawerOpen) {
          setDrawerOpen(false)
        }
        return
      }

      if (e.key === '?' && !isInput && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault()
        setShortcutsOpen(true)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setActiveTab, quickTradeOpen, shortcutsOpen, drawerOpen, handleRefresh])

  // Telegram signal parser
  const handleParseTelegram = async () => {
    if (!telegramInput.trim()) return
    setIsParsingTelegram(true)
    try {
      const res = await fetch('/api/ai/telegram-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: telegramInput }),
      })
      const data = await res.json()
      if (data.isValid && data.signal) {
        toast.success(`Signal Detected: ${data.signal.action} ${data.signal.symbol} @ ₹${data.signal.entryPrice}`, {
          description: data.reasoning?.substring(0, 100),
        })
        setTelegramInput('')
        handleRefresh()
      } else {
        toast.info('No valid trading signal found in this message', {
          description: data.reasoning || 'Try pasting a message with BUY/SELL, stock symbol, and price levels.',
        })
      }
    } catch {
      toast.error('Failed to parse Telegram signal')
    } finally {
      setIsParsingTelegram(false)
    }
  }

  // Image signal parser - handles image upload and VLM processing
  const handleImageParse = async (file: File) => {
    setIsParsingImage(true)
    setImagePreview(URL.createObjectURL(file))
    try {
      // Convert file to base64
      const reader = new FileReader()
      const base64Promise = new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string
          // Remove data URL prefix (e.g., "data:image/png;base64,")
          const base64 = result.split(',')[1]
          resolve(base64)
        }
        reader.readAsDataURL(file)
      })
      const base64Image = await base64Promise

      const res = await fetch('/api/telegram/userbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-image-signal',
          base64Image,
          mimeType: file.type || 'image/png',
          channelId: 'manual-image-upload',
          createSignals: true,
        }),
      })
      const data = await res.json()

      if (data.hasValidSignals && data.signals && data.signals.length > 0) {
        const sigCount = data.signals.length
        const firstSig = data.signals[0]
        toast.success(`${sigCount} Signal${sigCount > 1 ? 's' : ''} Detected from Image!`, {
          description: `${firstSig.action} ${firstSig.symbol} @ ₹${firstSig.entryPrice}${sigCount > 1 ? ` +${sigCount - 1} more` : ''}`,
          duration: 6000,
        })
        handleRefresh()
      } else {
        toast.info('No trading signals found in this image', {
          description: data.extractedText?.substring(0, 100) || 'The image does not appear to contain trading signals.',
          duration: 5000,
        })
      }
    } catch {
      toast.error('Failed to analyze image')
    } finally {
      setIsParsingImage(false)
      setImagePreview(null)
    }
  }

  // Latest signal for AI Signal card
  const latestSignal = signals.length > 0
    ? signals.reduce((latest, s) => new Date(s.createdAt) > new Date(latest.createdAt) ? s : latest)
    : null

  // Market status state for countdown timer
  const [countdown, setCountdown] = useState('')

  const isMarketOpen = () => {
    const now = new Date()
    const istOffset = 5.5 * 60 * 60 * 1000
    const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60000)
    const day = ist.getDay()
    const timeInMins = ist.getHours() * 60 + ist.getMinutes()
    if (day === 0 || day === 6) return false
    return timeInMins >= 555 && timeInMins <= 930
  }
  const marketOpen = isMarketOpen()

  const getISTTime = () => {
    const now = new Date()
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000 + now.getTimezoneOffset() * 60000)
    return ist.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })
  }

  // Market countdown timer
  const getMarketCountdown = useCallback(() => {
    const now = new Date()
    const istOffset = 5.5 * 60 * 60 * 1000
    const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60000)
    const day = ist.getDay()
    const timeInMins = ist.getHours() * 60 + ist.getMinutes() + ist.getSeconds() / 60

    if (day === 0 || day === 6) {
      // Weekend - find next Monday 9:15 AM IST
      const daysUntilMonday = day === 0 ? 1 : 2
      const targetIST = new Date(ist)
      targetIST.setDate(targetIST.getDate() + daysUntilMonday)
      targetIST.setHours(9, 15, 0, 0)
      const diffMs = targetIST.getTime() - ist.getTime()
      const totalMins = Math.floor(diffMs / 60000)
      const hrs = Math.floor(totalMins / 60)
      const mins = totalMins % 60
      return `Opens in ${hrs}h ${mins}m`
    }

    if (marketOpen) {
      // Market is open - countdown to close (3:30 PM = 930 mins)
      const closeMins = 930
      const remainingMins = closeMins - timeInMins
      const hrs = Math.floor(remainingMins / 60)
      const mins = Math.floor(remainingMins % 60)
      return `Closes in ${hrs}h ${mins}m`
    } else {
      // Market is closed - countdown to next open
      if (timeInMins < 555) {
        // Before market open today
        const remainingMins = 555 - timeInMins
        const hrs = Math.floor(remainingMins / 60)
        const mins = Math.floor(remainingMins % 60)
        return `Opens in ${hrs}h ${mins}m`
      } else {
        // After market close - next day 9:15 AM
        const tomorrowIST = new Date(ist)
        tomorrowIST.setDate(tomorrowIST.getDate() + (day === 5 ? 3 : 1)) // Skip weekend
        tomorrowIST.setHours(9, 15, 0, 0)
        const diffMs = tomorrowIST.getTime() - ist.getTime()
        const totalMins = Math.floor(diffMs / 60000)
        const hrs = Math.floor(totalMins / 60)
        const mins = totalMins % 60
        return `Opens in ${hrs}h ${mins}m`
      }
    }
  }, [marketOpen])

  // Update countdown every second
  useEffect(() => {
    setCountdown(getMarketCountdown())
    const interval = setInterval(() => {
      setCountdown(getMarketCountdown())
    }, 10000) // Update every 10 seconds
    return () => clearInterval(interval)
  }, [getMarketCountdown])

  const recentActivity = getRecentActivity(signals)

  const handleSignalClick = useCallback((signal: TradeSignal) => {
    setSelectedSignal(signal)
    setDrawerOpen(true)
  }, [])

  const getSourceIcon = (source: string) => {
    if (source.startsWith('ai')) return <Brain className="h-3 w-3" />
    if (source === 'telegram-image' || source === 'telegram-chart-image') return (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    )
    if (source === 'telegram') return <Radio className="h-3 w-3" />
    return <Zap className="h-3 w-3" />
  }

  const getSourceLabel = (source: string) => {
    if (source === 'telegram-chart-image') return '📈 Chart'
    if (source === 'telegram-image') return '📷 Image'
    if (source === 'telegram') return '📡 Text'
    if (source.startsWith('ai')) return '🤖 AI'
    return source
  }

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    return `${Math.floor(mins / 60)}h ago`
  }

  if (initialLoad) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
          <div className="flex items-center justify-between px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-5 w-28" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-24 rounded-md" />
              <Skeleton className="h-7 w-7 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-8 w-full" />
        </header>
        <main className="flex-1 p-4">
          <Skeleton className="h-10 w-full mb-4 rounded-lg" />
          <DashboardSkeleton />
        </main>
      </div>
    )
  }

  // Tab content fade-in animation variants with blur effect
  const tabContentVariants: Variants = {
    hidden: { opacity: 0, y: 8, filter: 'blur(2px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.3, ease: 'easeOut' } },
    exit: { opacity: 0, y: -8, filter: 'blur(2px)', transition: { duration: 0.15 } },
  }

  return (
    <TooltipProvider delayDuration={300}>
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between px-5 py-3 gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg overflow-hidden bg-emerald-600/20 flex items-center justify-center relative ring-1 ring-emerald-500/20">
                <Image src="/logo.png" alt="TradeAI" width={30} height={30} className="rounded-md object-cover" />
                <span className={`absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${marketOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight leading-none">
                  Trade<span className="gradient-text">AI</span> Bot
                </h1>
                <span className="text-[10px] text-muted-readable tracking-wide">Intelligent Trading Terminal</span>
              </div>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg cursor-default ${marketOpen ? 'market-open-banner text-emerald-400' : 'market-closed-banner text-red-400'}`}>
                  {marketOpen ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                  <span>{marketOpen ? 'Market Open' : 'Market Closed'}</span>
                  <span className="flex items-center gap-1 text-[10px] opacity-70 font-mono">
                    <Timer className="h-2.5 w-2.5" />
                    {countdown}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-card-foreground border-border">
                <p>NSE/BSE trading hours: 9:15 AM - 3:30 PM IST (Mon-Fri)</p>
              </TooltipContent>
            </Tooltip>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <NewsAutoRefresh
                    defaultActive={autoScan}
                    onScanComplete={() => handleRefresh()}
                    defaultInterval={5}
                    compact
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-card-foreground border-border">
                <p>Auto-scan Indian market news during market hours</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <TelegramStatusBadge />
                </div>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-card-foreground border-border">
                <p>Telegram Userbot connection status</p>
              </TooltipContent>
            </Tooltip>
            <div className="w-px h-5 bg-border" />
            <NotificationCenter />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isRefreshing} className="gap-1.5 text-muted-foreground hover:text-foreground transition-colors refresh-hover">
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">Refresh</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-card-foreground border-border">
                <p>Refresh all market data (Ctrl+R)</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5 text-muted-foreground hover:text-foreground transition-colors">
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline">Export</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-card-foreground border-border">
                <p>Export Data (Ctrl+E)</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={() => setIsDark(!isDark)} className="text-muted-foreground hover:text-foreground transition-colors theme-toggle-hover">
                  {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-card text-card-foreground border-border">
                <p>Switch between dark and light mode</p>
              </TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Market Ticker */}
        <MarketTicker />

        {/* Account Summary Bar */}
        <div className="bg-card/50 border-y border-border/30 px-5 py-2 overflow-x-auto hide-scrollbar">
          <div className="flex items-center gap-0 text-xs min-w-max">
            <div className="flex items-center gap-1.5 pr-4">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Portfolio</span>
              <span className="font-mono font-bold tabular-nums text-foreground">₹1,25,000</span>
            </div>
            <div className="w-px h-3.5 bg-border/50" />
            <div className="flex items-center gap-1.5 px-4">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Today's P&L</span>
              <span className="font-mono font-bold tabular-nums text-emerald-400">+₹2,340</span>
              <span className="text-emerald-400/80 text-[10px] font-mono tabular-nums">(+1.87%)</span>
            </div>
            <div className="w-px h-3.5 bg-border/50 hidden sm:block" />
            <div className="items-center gap-1.5 px-4 hidden sm:flex">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Margin</span>
              <span className="font-mono font-bold tabular-nums text-foreground">₹45,000</span>
            </div>
            <div className="w-px h-3.5 bg-border/50 hidden md:block" />
            <div className="items-center gap-1.5 px-4 hidden md:flex">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Invested</span>
              <span className="font-mono font-bold tabular-nums text-foreground">₹80,000</span>
            </div>
          </div>
        </div>

        {/* Gradient border line */}
        <div className="header-gradient-border" />
      </header>

      {/* Main Content */}
      <main className="flex-1 p-5 bg-grid-pattern">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)}>
          <TabsList className="flex w-full overflow-x-auto hide-scrollbar mb-5 bg-card border border-border/50 justify-start xl:justify-center">
            <TabsTrigger value="dashboard" className="shrink-0 gap-1.5 text-xs sm:text-sm tab-indicator data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/5 transition-colors">
              <BarChart3 className="h-4 w-4 hidden sm:block" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="signals" className="shrink-0 gap-1.5 text-xs sm:text-sm tab-indicator data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/5 transition-colors">
              <Activity className="h-4 w-4 hidden sm:block" />
              Signals
            </TabsTrigger>
            <TabsTrigger value="portfolio" className="shrink-0 gap-1.5 text-xs sm:text-sm tab-indicator data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/5 transition-colors">
              <TrendingUp className="h-4 w-4 hidden sm:block" />
              Portfolio
            </TabsTrigger>
            <TabsTrigger value="history" className="shrink-0 gap-1.5 text-xs sm:text-sm tab-indicator data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/5 transition-colors">
              <Clock className="h-4 w-4 hidden sm:block" />
              History
            </TabsTrigger>
            <TabsTrigger value="news" className="shrink-0 gap-1.5 text-xs sm:text-sm tab-indicator data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/5 transition-colors">
              <Newspaper className="h-4 w-4 hidden sm:block" />
              News
            </TabsTrigger>
            <TabsTrigger value="risk" className="shrink-0 gap-1.5 text-xs sm:text-sm tab-indicator data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/5 transition-colors">
              <Shield className="h-4 w-4 hidden sm:block" />
              Risk
            </TabsTrigger>
            <TabsTrigger value="screener" className="shrink-0 gap-1.5 text-xs sm:text-sm tab-indicator data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/5 transition-colors">
              <Filter className="h-4 w-4 hidden sm:block" />
              Screener
            </TabsTrigger>
            <TabsTrigger value="backtest" className="shrink-0 gap-1.5 text-xs sm:text-sm tab-indicator data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/5 transition-colors">
              <FlaskConical className="h-4 w-4 hidden sm:block" />
              Backtest
            </TabsTrigger>
            <TabsTrigger value="settings" className="shrink-0 gap-1.5 text-xs sm:text-sm tab-indicator data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/5 transition-colors">
              <Settings className="h-4 w-4 hidden sm:block" />
              Settings
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div
                key="dashboard-content"
                variants={tabContentVariants}
                initial="hidden"
                animate="visible"
                exit="exit"
              >
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                  {/* Chart + Heatmap - 60% */}
                  <div className="lg:col-span-3 space-y-5">
                    <div className="h-[420px] lg:h-[calc(100vh-460px)]">
                      <TradingViewChart />
                    </div>
                    <MarketDepth />
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <LayoutGrid className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Market Heatmap</span>
                      </div>
                      <MarketHeatmap />
                    </div>
                    <CandlestickChart />
                  </div>

                  {/* Right Panel - 40% */}
                  <div className="lg:col-span-2 space-y-5 lg:max-h-[calc(100vh-180px)] lg:overflow-y-auto custom-scrollbar lg:pr-1">
                    {/* Market Overview */}
                    <MarketOverview />

                    <SectionDivider />

                    {/* AI Signal Card */}
                    {latestSignal && <AISignalCard signal={latestSignal} onExecute={() => handleRefresh()} onSignalClick={handleSignalClick} />}

                    <SectionDivider />

                    {/* Gradient Quick Stats */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                            whileHover={{ y: -2, transition: { duration: 0.15 } }}
                            className="group"
                          >
                            <Card className={`card-shine card-top-accent card-top-accent-${totalPnl >= 0 ? 'emerald' : 'red'} overflow-hidden transition-shadow duration-200 group-hover:shadow-lg min-h-[80px] ${totalPnl >= 0 ? 'group-hover:shadow-emerald-500/10' : 'group-hover:shadow-red-500/10'}`}>
                              <CardContent className="p-4 text-center relative">
                                <div className="relative">
                                  <div className="flex items-center justify-center gap-1 mb-1.5">
                                    <Wallet className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Total P&L</span>
                                  </div>
                                  <div className={`metric-value-sm ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'} ${animatedPnl.flashClass} rounded px-1 -mx-1`}>
                                    {totalPnl >= 0 ? '+' : '-'}₹{animatedPnl.value.toLocaleString('en-IN')}
                                  </div>
                                  {/* Mini sparkline */}
                                  <div className="sparkline-mini justify-center mt-1.5">
                                    {[40, 55, 35, 65, 50, 70, 85].map((h, i) => (
                                      <div key={i} className={`spark-dot ${totalPnl >= 0 ? 'bg-emerald-500/60' : 'bg-red-500/60'}`} style={{ height: `${h}%` }} />
                                    ))}
                                  </div>
                                  <span className="text-[9px] text-emerald-400/70 mt-0.5 block">+12% vs yesterday</span>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-card text-card-foreground border-border">
                          <p>Total unrealized profit/loss across all open positions</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 }}
                            whileHover={{ y: -2, transition: { duration: 0.15 } }}
                            className="group"
                          >
                            <Card className="card-shine card-top-accent card-top-accent-amber overflow-hidden transition-shadow duration-200 group-hover:shadow-lg group-hover:shadow-amber-500/10 min-h-[80px]">
                              <CardContent className="p-4 text-center relative">
                                <div className="relative">
                                  <div className="flex items-center justify-center gap-1 mb-1.5">
                                    <Percent className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Win Rate</span>
                                  </div>
                                  <div className={`metric-value-sm text-amber-400 ${animatedWinRate.flashClass} rounded px-1 -mx-1`}>{animatedWinRate.value}%</div>
                                  {/* Mini sparkline */}
                                  <div className="sparkline-mini justify-center mt-1.5">
                                    {[60, 50, 70, 55, 75, 65, 72].map((h, i) => (
                                      <div key={i} className="spark-dot bg-amber-500/60" style={{ height: `${h}%` }} />
                                    ))}
                                  </div>
                                  <span className="text-[9px] text-amber-400/70 mt-0.5 block">+5% vs yesterday</span>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-card text-card-foreground border-border">
                          <p>Percentage of profitable trades out of total closed trades</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            whileHover={{ y: -2, transition: { duration: 0.15 } }}
                            className="group"
                          >
                            <Card className="card-shine card-top-accent card-top-accent-sky overflow-hidden transition-shadow duration-200 group-hover:shadow-lg group-hover:shadow-sky-500/10 min-h-[80px]">
                              <CardContent className="p-4 text-center relative">
                                <div className="relative">
                                  <div className="flex items-center justify-center gap-1 mb-1.5">
                                    <IndianRupee className="h-3 w-3 text-muted-foreground" />
                                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Positions</span>
                                  </div>
                                  <div className={`metric-value-sm text-sky-400 ${animatedActive.flashClass} rounded px-1 -mx-1`}>{animatedActive.value}</div>
                                  {/* Mini sparkline */}
                                  <div className="sparkline-mini justify-center mt-1.5">
                                    {[30, 45, 35, 50, 40, 55, 42].map((h, i) => (
                                      <div key={i} className="spark-dot bg-sky-500/60" style={{ height: `${h}%` }} />
                                    ))}
                                  </div>
                                  <span className="text-[9px] text-sky-400/70 mt-0.5 block">+2 vs yesterday</span>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-card text-card-foreground border-border">
                          <p>Number of currently open positions</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <SectionDivider />

                    {/* P&L Performance Mini Chart */}
                    <Card className="card-top-accent card-top-accent-emerald overflow-hidden rounded-xl shadow-sm shadow-black/10">
                      <CardHeader className="pb-2 px-4 pt-3 border-l-4 border-emerald-500/40">
                        <CardTitle className="section-header">
                          <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                          P&L Performance (14 Days)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-2 pb-2">
                        <div className="h-[80px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={pnlChartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                              <defs>
                                <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <Area type="monotone" dataKey="pnl" stroke="#10b981" strokeWidth={1.5} fill="url(#pnlGradient)" dot={false} />
                              <RechartsTooltip
                                contentStyle={{ backgroundColor: '#1a1a2e', border: '1px solid #2a2a3e', borderRadius: '6px', fontSize: '11px' }}
                                formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'P&L']}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </CardContent>
                    </Card>

                    <SectionDivider />

                    {/* Telegram Integration Section */}
                    <TelegramSetupGuide />


                    <SectionDivider />

                    {/* Manual Telegram Signal Parser */}
                    <Card className="border-blue-500/20 overflow-hidden rounded-xl shadow-sm shadow-black/10">
                      <CardHeader className="pb-2 px-4 pt-3">
                        <CardTitle className="text-xs flex items-center gap-2">
                          <Radio className="h-3.5 w-3.5 text-blue-500" />
                          Signal Parser
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-blue-500/15 text-blue-400 ml-1">AI</Badge>
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-purple-500/15 text-purple-400 ml-0.5">VLM</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3 space-y-2">
                        <p className="text-[10px] text-muted-foreground">Paste text or upload an image from Telegram channels</p>
                        <div className="flex gap-2">
                          <Input
                            placeholder='e.g. "🚀 BUY RELIANCE @ ₹2,890 | Target: ₹2,980 | SL: ₹2,850"'
                            value={telegramInput}
                            onChange={(e) => setTelegramInput(e.target.value)}
                            className="h-8 text-xs flex-1"
                            onKeyDown={(e) => e.key === 'Enter' && handleParseTelegram()}
                          />
                          <Button
                            size="sm"
                            className="h-8 gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white shrink-0 transition-colors"
                            onClick={handleParseTelegram}
                            disabled={isParsingTelegram || !telegramInput.trim()}
                          >
                            {isParsingTelegram ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                            Parse
                          </Button>
                        </div>
                        {/* Image upload area */}
                        <div className="relative">
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            className="hidden"
                            id="image-signal-upload"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) handleImageParse(file)
                              e.target.value = ''
                            }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="w-full h-8 gap-2 text-xs border-dashed border-purple-500/30 hover:border-purple-500/50 hover:bg-purple-500/5 transition-colors"
                            onClick={() => document.getElementById('image-signal-upload')?.click()}
                            disabled={isParsingImage}
                          >
                            {isParsingImage ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Analyzing image with VLM...
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                                  <circle cx="8.5" cy="8.5" r="1.5" />
                                  <polyline points="21 15 16 10 5 21" />
                                </svg>
                                Upload Signal Screenshot
                              </>
                            )}
                          </Button>
                          {imagePreview && isParsingImage && (
                            <div className="mt-2 relative rounded-lg overflow-hidden border border-purple-500/20">
                              <img src={imagePreview} alt="Analyzing..." className="w-full h-24 object-cover opacity-60" />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <div className="bg-black/60 rounded-full p-2">
                                  <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <SectionDivider />

                    {/* Multi-Model Consensus */}
                    <MultiModelConsensus />

                    <SectionDivider />

                    {/* Mini Watchlist */}
                    <Card className="overflow-hidden rounded-xl shadow-sm shadow-black/10">
                      <CardHeader className="pb-2 px-4 pt-3">
                        <CardTitle className="section-header text-muted-foreground">
                          <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                          Watchlist
                          <span className="text-[10px] text-muted-foreground font-normal ml-1">{watchlistData.length} items</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-0">
                        <div className="max-h-[200px] overflow-y-auto custom-scrollbar py-1">
                          {watchlistData.map((item, i) => (
                            <motion.div
                              key={item.symbol}
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: i * 0.03 }}
                              className={`data-row flex items-center justify-between cursor-pointer transition-all duration-150 hover:bg-muted/40 hover:scale-[1.005] ${
                                selectedSymbol === item.symbol ? 'bg-emerald-500/5 border-l-2 border-emerald-500' : 'border-l-2 border-transparent'
                              }`}
                              onClick={() => useTradingStore.getState().setSelectedSymbol(item.symbol)}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="font-medium text-sm">{item.symbol}</span>
                                <Badge variant="outline" className="text-[9px] px-1 py-0 border-border/50 text-muted-foreground">NSE</Badge>
                              </div>
                              <div className="flex items-center gap-2.5">
                                <span className="text-sm font-mono font-semibold tabular-nums">₹{item.price.toLocaleString('en-IN')}</span>
                                <span
                                  className={`text-xs font-medium flex items-center gap-0.5 px-1.5 py-0.5 rounded-full ${
                                    item.change >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'
                                  }`}
                                >
                                  {item.change >= 0 ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
                                  {item.changePercent >= 0 ? '+' : ''}{item.changePercent.toFixed(2)}%
                                </span>
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    <SectionDivider />

                    {/* Recent Activity */}
                    <Card className="overflow-hidden rounded-xl shadow-sm shadow-black/10">
                      <CardHeader className="pb-2 px-4 pt-3">
                        <CardTitle className="section-header text-muted-foreground">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          Recent Activity
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        <div className="space-y-1">
                          <AnimatePresence>
                            {recentActivity.map((activity, i) => (
                              <motion.div
                                key={activity.id}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="activity-item flex items-center gap-2 text-xs cursor-pointer"
                              >
                                <span className={`flex items-center justify-center h-5 w-5 rounded-full shrink-0 ${
                                  activity.action === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                                }`}>
                                  {getSourceIcon(activity.source)}
                                </span>
                                <span className="font-medium">{activity.symbol}</span>
                                <Badge variant="secondary" className={`text-[9px] px-1 py-0 ${
                                  activity.action === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                                }`}>
                                  {activity.action}
                                </Badge>
                                <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 ${
                                  activity.source === 'telegram-chart-image' ? 'bg-cyan-500/15 text-cyan-400' :
                                  activity.source === 'telegram-image' ? 'bg-purple-500/15 text-purple-400' :
                                  activity.source === 'telegram' ? 'bg-blue-500/15 text-blue-400' :
                                  activity.source.startsWith('ai') ? 'bg-amber-500/15 text-amber-400' :
                                  'bg-muted text-muted-foreground'
                                }`}>
                                  {getSourceLabel(activity.source)}
                                </Badge>
                                <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 capitalize ${
                                  activity.status === 'pending' ? 'bg-amber-500/15 text-amber-400' :
                                  activity.status === 'executed' ? 'bg-sky-500/15 text-sky-400' :
                                  'bg-muted text-muted-foreground'
                                }`}>
                                  {activity.status}
                                </Badge>
                                <span className="ml-auto text-muted-foreground shrink-0">{formatTimeAgo(activity.time)}</span>
                                <ChevronRight className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                              </motion.div>
                            ))}
                          </AnimatePresence>
                          {recentActivity.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-2">No recent activity</p>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <SectionDivider />

                    {/* Strategy Builder */}
                    <StrategyBuilder />

                    <SectionDivider />

                    {/* Trade Journal */}
                    <TradeJournal />

                    <SectionDivider />

                    {/* Price Alerts */}
                    <PriceAlerts />
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Signals Tab */}
          <TabsContent value="signals" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="signals" variants={tabContentVariants} initial="hidden" animate="visible" exit="exit" className="space-y-4">
                {/* Sub-tab view selection header */}
                <div className="flex items-center justify-between bg-card/30 backdrop-blur-md border border-border/40 p-1.5 rounded-lg">
                  <div className="flex items-center gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-8 text-xs font-semibold px-4 rounded-md transition-all ${
                        signalsSubTab === 'list'
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setSignalsSubTab('list')}
                    >
                      <Activity className="mr-1.5 h-3.5 w-3.5" />
                      Signals Feed
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={`h-8 text-xs font-semibold px-4 rounded-md transition-all ${
                        signalsSubTab === 'leaderboard'
                          ? 'bg-primary/10 text-primary border border-primary/20'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                      onClick={() => setSignalsSubTab('leaderboard')}
                    >
                      <Trophy className="mr-1.5 h-3.5 w-3.5" />
                      Source Leaderboard
                    </Button>
                  </div>

                  {signalsSubTab === 'list' && selectedSourceFilter !== 'all' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[11px] text-muted-foreground hover:text-primary gap-1"
                      onClick={() => setSelectedSourceFilter('all')}
                    >
                      Clear filter: <code className="font-mono">{selectedSourceFilter}</code>
                    </Button>
                  )}
                </div>

                {signalsSubTab === 'list' ? (
                  <SignalList
                    onSignalClick={handleSignalClick}
                    sourceFilter={selectedSourceFilter}
                    onSourceFilterChange={setSelectedSourceFilter}
                  />
                ) : (
                  <SourceLeaderboard
                    onViewSourceSignals={(sourceId) => {
                      setSelectedSourceFilter(sourceId)
                      setSignalsSubTab('list')
                    }}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Portfolio Tab */}
          <TabsContent value="portfolio" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="portfolio" variants={tabContentVariants} initial="hidden" animate="visible" exit="exit">
                <PortfolioTracker />
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* History Tab */}
          <TabsContent value="history" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="history" variants={tabContentVariants} initial="hidden" animate="visible" exit="exit">
                <PerformanceAnalytics />
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* News Tab */}
          <TabsContent value="news" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="news" variants={tabContentVariants} initial="hidden" animate="visible" exit="exit" className="space-y-4">
                <NewsAutoRefresh
                  defaultActive={autoScan}
                  onScanComplete={() => handleRefresh()}
                  defaultInterval={5}
                />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="lg:col-span-2">
                    <NewsFeed />
                  </div>
                  <div className="lg:col-span-1">
                    <MacroEventsWidget />
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Risk Calculator Tab */}
          <TabsContent value="risk" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="risk" variants={tabContentVariants} initial="hidden" animate="visible" exit="exit">
                <RiskCalculator />
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Stock Screener Tab */}
          <TabsContent value="screener" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="screener" variants={tabContentVariants} initial="hidden" animate="visible" exit="exit">
                <StockScreener />
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Backtest Tab */}
          <TabsContent value="backtest" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="backtest" variants={tabContentVariants} initial="hidden" animate="visible" exit="exit">
                <BacktestingEngine />
              </motion.div>
            </AnimatePresence>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="mt-0">
            <AnimatePresence mode="wait">
              <motion.div key="settings" variants={tabContentVariants} initial="hidden" animate="visible" exit="exit">
                <SettingsPanel />
              </motion.div>
            </AnimatePresence>
          </TabsContent>
        </Tabs>
      </main>

      {/* Enhanced Footer */}
      <footer className="border-t border-border bg-background/80 backdrop-blur-md mt-auto">
        <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
        <div className="flex items-center justify-between px-5 py-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <Badge
              variant="secondary"
              className={`gap-1 text-[10px] ${marketOpen ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${marketOpen ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
              {marketOpen ? 'NSE Live' : 'NSE Closed'}
            </Badge>
            <Badge variant="secondary" className="gap-1 text-[10px] bg-amber-500/15 text-amber-400">
              <FlaskConical className="h-2.5 w-2.5" />
              Paper Trading
            </Badge>
            <Badge variant="secondary" className="gap-1 text-[10px] bg-sky-500/15 text-sky-400">
              <Cpu className="h-2.5 w-2.5" />
              AI: Qwen3 32B
            </Badge>
            <span className="hidden sm:inline font-mono tabular-nums">NIFTY 50: 22,456.80 <span className="text-emerald-400">+0.46%</span></span>
            <span className="hidden md:inline font-mono tabular-nums">SENSEX: 73,842.50 <span className="text-emerald-400">+0.43%</span></span>
            <span className="hidden lg:inline font-mono tabular-nums">BANK NIFTY: 48,235.60 <span className="text-red-400">-0.27%</span></span>
            <span className="hidden xl:inline font-mono tabular-nums">INDIA VIX: 13.42 <span className="text-red-400">-5.96%</span></span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:flex items-center gap-1">
              <Sparkles className="h-3 w-3 text-emerald-500" />
              {signals.filter((s) => s.status === 'pending').length} pending
            </span>
            <span className="flex items-center gap-1 font-mono tabular-nums">
              <Clock className="h-3 w-3" />
              IST {getISTTime()}
            </span>
            <button
              onClick={() => setShortcutsOpen(true)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
              title="Keyboard shortcuts"
            >
              <Keyboard className="h-3 w-3" />
              <span className="text-muted-foreground">?</span>
            </button>
          </div>
        </div>
      </footer>

      {/* Signal Detail Drawer */}
      <SignalDetailDrawer
        signal={selectedSignal}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onExecute={() => {
          setDrawerOpen(false)
          handleRefresh()
        }}
      />

      {/* Quick Trade Dialog */}
      <QuickTradeDialog open={quickTradeOpen} onOpenChange={setQuickTradeOpen} />

      {/* Quick Trade FAB */}
      <QuickTradeFAB
        onClick={() => setQuickTradeOpen(true)}
        pendingCount={signals.filter((s) => s.status === 'pending').length}
      />

      {/* AI Chat Assistant */}
      <AIChatAssistant />

      {/* Keyboard Shortcuts Help Dialog */}
      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="h-5 w-5 text-emerald-500" />
              Keyboard Shortcuts
            </DialogTitle>
            <DialogDescription>
              Use these shortcuts to navigate and interact with the trading dashboard faster.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {[
              { keys: ['Ctrl', '1-8'], desc: 'Switch between tabs' },
              { keys: ['Ctrl', 'T'], desc: 'Open Quick Trade dialog' },
              { keys: ['Ctrl', 'R'], desc: 'Refresh data' },
              { keys: ['Ctrl', 'E'], desc: 'Export data' },
              { keys: ['Esc'], desc: 'Close dialog/drawer' },
              { keys: ['?'], desc: 'Show this shortcuts help' },
            ].map((shortcut) => (
              <div key={shortcut.desc} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{shortcut.desc}</span>
                <div className="flex items-center gap-1">
                  {shortcut.keys.map((key, i) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
                      <kbd className="px-2 py-1 rounded-md bg-muted/50 border border-border/50 text-xs font-mono font-medium">
                        {key}
                      </kbd>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShortcutsOpen(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export Dialog */}
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} />
    </div>
    </TooltipProvider>
  )
}
