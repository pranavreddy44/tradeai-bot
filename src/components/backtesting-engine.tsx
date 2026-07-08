'use client'

import { useState, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  FlaskConical,
  Play,
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { toast } from 'sonner'
import { NIFTY50_SYMBOLS } from '@/lib/types/trading'

// ─── Types ───────────────────────────────────────────────────────────────────

interface BacktestConfig {
  symbol: string
  startDate: string
  endDate: string
  initialCapital: number
  positionSizePct: number
  strategyType: 'sma-crossover' | 'rsi' | 'macd' | 'bollinger'
}

interface BacktestTrade {
  id: number
  symbol: string
  action: 'BUY' | 'SELL'
  entryDate: string
  exitDate: string
  entryPrice: number
  exitPrice: number
  pnl: number
  pnlPct: number
  holdDays: number
}

interface BacktestResult {
  totalReturn: number
  totalReturnPct: number
  maxDrawdown: number
  sharpeRatio: number
  totalTrades: number
  winRate: number
  equityCurve: { date: string; portfolio: number; benchmark: number }[]
  trades: BacktestTrade[]
  monthlyReturns: { month: string; returnPct: number }[]
}

type StrategyType = BacktestConfig['strategyType']

// ─── Strategy Labels ─────────────────────────────────────────────────────────

const STRATEGY_OPTIONS: { value: StrategyType; label: string }[] = [
  { value: 'sma-crossover', label: 'SMA Crossover' },
  { value: 'rsi', label: 'RSI Oversold/Overbought' },
  { value: 'macd', label: 'MACD Signal' },
  { value: 'bollinger', label: 'Bollinger Band Bounce' },
]

// ─── Seeded Random Number Generator ──────────────────────────────────────────

function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff
    return (s >>> 0) / 0xffffffff
  }
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash)
}

// ─── Mock Data Generation ────────────────────────────────────────────────────

// Base prices for NIFTY50 stocks (approximate real values)
const BASE_PRICES: Record<string, number> = {
  RELIANCE: 2450, TCS: 3580, INFY: 1520, HDFCBANK: 1640, ICICIBANK: 1080,
  SBIN: 620, WIPRO: 440, ITC: 435, BHARTIARTL: 1380, MARUTI: 11200,
  HINDUNILVR: 2480, BAJFINANCE: 6800, ASIANPAINT: 2850, KOTAKBANK: 1750,
  LT: 3250, HCLTECH: 1380, AXISBANK: 1090, TITAN: 3180, SUNPHARMA: 1180,
  TATAMOTORS: 680, TATASTEEL: 138, ADANIENT: 2680, ADANIPORTS: 1180,
  NTPC: 345, POWERGRID: 278, ONGC: 248, COALINDIA: 420,
  BAJAJFINSV: 1580, ULTRACEMCO: 10200, NESTLEIND: 2350,
  TECHM: 1420, DRREDDY: 5480, CIPLA: 1380, DIVISLAB: 4850,
  BPCL: 548, IOC: 138, HEROMOTOCO: 4580, EICHERMOT: 4200,
  'M&M': 2480, HINDALCO: 580, JSWSTEEL: 820, TATACONSUM: 980,
  GRASIM: 2280, INDUSINDBK: 1420, SBILIFE: 1380, HDFCLIFE: 620,
  BRITANNIA: 5280, APOLLOHOSP: 5800,
}

function generateMockPriceData(
  symbol: string,
  startDate: Date,
  endDate: Date
): { date: string; price: number }[] {
  const seed = hashString(symbol + startDate.toISOString() + endDate.toISOString())
  const rng = seededRandom(seed)
  const basePrice = BASE_PRICES[symbol] || 1000

  const data: { date: string; price: number }[] = []
  const current = new Date(startDate)
  let price = basePrice

  while (current <= endDate) {
    // Skip weekends
    const day = current.getDay()
    if (day !== 0 && day !== 6) {
      // Realistic daily move: mean ~0.03%, std ~1.5%
      const dailyReturn = (rng() - 0.48) * 0.03
      price = price * (1 + dailyReturn)
      data.push({
        date: current.toISOString().split('T')[0],
        price: Math.round(price * 100) / 100,
      })
    }
    current.setDate(current.getDate() + 1)
  }

  return data
}

// ─── Strategy Simulators ─────────────────────────────────────────────────────

function simulateSMA(
  prices: { date: string; price: number }[],
  positionSizePct: number,
  initialCapital: number,
  symbol: string
): BacktestTrade[] {
  const trades: BacktestTrade[] = []
  let tradeId = 0
  const shortPeriod = 10
  const longPeriod = 30

  for (let i = longPeriod; i < prices.length - 1; i++) {
    const shortMA = prices.slice(i - shortPeriod, i).reduce((s, p) => s + p.price, 0) / shortPeriod
    const longMA = prices.slice(i - longPeriod, i).reduce((s, p) => s + p.price, 0) / longPeriod
    const prevShortMA = prices.slice(i - shortPeriod - 1, i - 1).reduce((s, p) => s + p.price, 0) / shortPeriod
    const prevLongMA = prices.slice(i - longPeriod - 1, i - 1).reduce((s, p) => s + p.price, 0) / longPeriod

    // Golden cross - buy signal
    if (prevShortMA <= prevLongMA && shortMA > longMA && (trades.length === 0 || trades[trades.length - 1].action === 'SELL')) {
      const entryPrice = prices[i].price
      const quantity = Math.floor((initialCapital * positionSizePct / 100) / entryPrice)
      // Find exit point
      for (let j = i + 1; j < prices.length; j++) {
        const exitShortMA = prices.slice(Math.max(0, j - shortPeriod), j).reduce((s, p) => s + p.price, 0) / Math.min(shortPeriod, j)
        const exitLongMA = prices.slice(Math.max(0, j - longPeriod), j).reduce((s, p) => s + p.price, 0) / Math.min(longPeriod, j)
        const prevExitShortMA = prices.slice(Math.max(0, j - shortPeriod - 1), j - 1).reduce((s, p) => s + p.price, 0) / Math.min(shortPeriod, j - 1)
        const prevExitLongMA = prices.slice(Math.max(0, j - longPeriod - 1), j - 1).reduce((s, p) => s + p.price, 0) / Math.min(longPeriod, j - 1)

        if (prevExitShortMA >= prevExitLongMA && exitShortMA < exitLongMA) {
          tradeId++
          trades.push({
            id: tradeId,
            symbol,
            action: 'BUY',
            entryDate: prices[i].date,
            exitDate: prices[j].date,
            entryPrice,
            exitPrice: prices[j].price,
            pnl: Math.round((prices[j].price - entryPrice) * quantity * 100) / 100,
            pnlPct: Math.round((prices[j].price / entryPrice - 1) * 10000) / 100,
            holdDays: Math.round((new Date(prices[j].date).getTime() - new Date(prices[i].date).getTime()) / (1000 * 60 * 60 * 24)),
          })
          i = j
          break
        }
      }
    }
  }
  return trades
}

function simulateRSI(
  prices: { date: string; price: number }[],
  positionSizePct: number,
  initialCapital: number,
  symbol: string
): BacktestTrade[] {
  const trades: BacktestTrade[] = []
  let tradeId = 0
  const period = 14
  const oversold = 30
  const overbought = 70

  // Calculate RSI
  const rsiValues: number[] = []
  for (let i = period; i < prices.length; i++) {
    let gains = 0, losses = 0
    for (let j = i - period + 1; j <= i; j++) {
      const change = prices[j].price - prices[j - 1].price
      if (change > 0) gains += change
      else losses += Math.abs(change)
    }
    const rs = losses === 0 ? 100 : gains / losses
    rsiValues.push(100 - (100 / (1 + rs)))
  }

  let inPosition = false
  let entryIdx = 0

  for (let i = 1; i < rsiValues.length; i++) {
    if (!inPosition && rsiValues[i] < oversold && rsiValues[i - 1] >= oversold) {
      inPosition = true
      entryIdx = i + period
    } else if (inPosition && rsiValues[i] > overbought && rsiValues[i - 1] <= overbought) {
      const entryPrice = prices[entryIdx].price
      const exitPrice = prices[i + period].price
      const quantity = Math.floor((initialCapital * positionSizePct / 100) / entryPrice)
      tradeId++
      trades.push({
        id: tradeId,
        symbol,
        action: 'BUY',
        entryDate: prices[entryIdx].date,
        exitDate: prices[i + period].date,
        entryPrice,
        exitPrice,
        pnl: Math.round((exitPrice - entryPrice) * quantity * 100) / 100,
        pnlPct: Math.round((exitPrice / entryPrice - 1) * 10000) / 100,
        holdDays: Math.round((new Date(prices[i + period].date).getTime() - new Date(prices[entryIdx].date).getTime()) / (1000 * 60 * 60 * 24)),
      })
      inPosition = false
    }
  }

  return trades
}

function simulateMACD(
  prices: { date: string; price: number }[],
  positionSizePct: number,
  initialCapital: number,
  symbol: string
): BacktestTrade[] {
  const trades: BacktestTrade[] = []
  let tradeId = 0

  // Calculate MACD
  const ema = (data: number[], period: number): number[] => {
    const result: number[] = []
    const k = 2 / (period + 1)
    result[0] = data[0]
    for (let i = 1; i < data.length; i++) {
      result[i] = data[i] * k + result[i - 1] * (1 - k)
    }
    return result
  }

  const closePrices = prices.map(p => p.price)
  const ema12 = ema(closePrices, 12)
  const ema26 = ema(closePrices, 26)
  const macdLine = ema12.map((v, i) => v - ema26[i])
  const signalLine = ema(macdLine, 9)

  let inPosition = false
  let entryIdx = 0

  for (let i = 1; i < macdLine.length; i++) {
    if (!inPosition && macdLine[i] > signalLine[i] && macdLine[i - 1] <= signalLine[i - 1]) {
      inPosition = true
      entryIdx = i
    } else if (inPosition && macdLine[i] < signalLine[i] && macdLine[i - 1] >= signalLine[i - 1]) {
      const entryPrice = prices[entryIdx].price
      const exitPrice = prices[i].price
      const quantity = Math.floor((initialCapital * positionSizePct / 100) / entryPrice)
      tradeId++
      trades.push({
        id: tradeId,
        symbol,
        action: 'BUY',
        entryDate: prices[entryIdx].date,
        exitDate: prices[i].date,
        entryPrice,
        exitPrice,
        pnl: Math.round((exitPrice - entryPrice) * quantity * 100) / 100,
        pnlPct: Math.round((exitPrice / entryPrice - 1) * 10000) / 100,
        holdDays: Math.round((new Date(prices[i].date).getTime() - new Date(prices[entryIdx].date).getTime()) / (1000 * 60 * 60 * 24)),
      })
      inPosition = false
    }
  }

  return trades
}

function simulateBollinger(
  prices: { date: string; price: number }[],
  positionSizePct: number,
  initialCapital: number,
  symbol: string
): BacktestTrade[] {
  const trades: BacktestTrade[] = []
  let tradeId = 0
  const period = 20
  const stdDevMultiplier = 2

  let inPosition = false
  let entryIdx = 0

  for (let i = period; i < prices.length; i++) {
    const slice = prices.slice(i - period, i).map(p => p.price)
    const mean = slice.reduce((s, v) => s + v, 0) / period
    const stdDev = Math.sqrt(slice.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / period)
    const upper = mean + stdDevMultiplier * stdDev
    const lower = mean - stdDevMultiplier * stdDev

    if (!inPosition && prices[i].price < lower) {
      inPosition = true
      entryIdx = i
    } else if (inPosition && prices[i].price > upper) {
      const entryPrice = prices[entryIdx].price
      const exitPrice = prices[i].price
      const quantity = Math.floor((initialCapital * positionSizePct / 100) / entryPrice)
      tradeId++
      trades.push({
        id: tradeId,
        symbol,
        action: 'BUY',
        entryDate: prices[entryIdx].date,
        exitDate: prices[i].date,
        entryPrice,
        exitPrice,
        pnl: Math.round((exitPrice - entryPrice) * quantity * 100) / 100,
        pnlPct: Math.round((exitPrice / entryPrice - 1) * 10000) / 100,
        holdDays: Math.round((new Date(prices[i].date).getTime() - new Date(prices[entryIdx].date).getTime()) / (1000 * 60 * 60 * 24)),
      })
      inPosition = false
    }
  }

  return trades
}

// ─── Run Full Backtest ───────────────────────────────────────────────────────

function runBacktest(config: BacktestConfig): BacktestResult {
  const startDate = new Date(config.startDate)
  const endDate = new Date(config.endDate)
  const priceData = generateMockPriceData(config.symbol, startDate, endDate)

  if (priceData.length < 30) {
    return {
      totalReturn: 0,
      totalReturnPct: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      totalTrades: 0,
      winRate: 0,
      equityCurve: [],
      trades: [],
      monthlyReturns: [],
    }
  }

  let trades: BacktestTrade[]

  switch (config.strategyType) {
    case 'sma-crossover':
      trades = simulateSMA(priceData, config.positionSizePct, config.initialCapital, config.symbol)
      break
    case 'rsi':
      trades = simulateRSI(priceData, config.positionSizePct, config.initialCapital, config.symbol)
      break
    case 'macd':
      trades = simulateMACD(priceData, config.positionSizePct, config.initialCapital, config.symbol)
      break
    case 'bollinger':
      trades = simulateBollinger(priceData, config.positionSizePct, config.initialCapital, config.symbol)
      break
    default:
      trades = simulateSMA(priceData, config.positionSizePct, config.initialCapital, config.symbol)
  }

  // Calculate equity curve
  let portfolioValue = config.initialCapital
  const equityMap = new Map<string, number>()

  // Start with initial capital on each date
  priceData.forEach(p => equityMap.set(p.date, config.initialCapital))

  // Apply trades to equity curve
  trades.forEach(trade => {
    portfolioValue += trade.pnl
    // Update all dates from exit date onwards
    priceData.forEach(p => {
      if (p.date >= trade.exitDate) {
        const currentVal = equityMap.get(p.date) || config.initialCapital
        equityMap.set(p.date, currentVal + trade.pnl / trades.length)
      }
    })
  })

  // Build proper equity curve
  let runningValue = config.initialCapital
  const tradeExits = new Map(trades.map(t => [t.exitDate, t.pnl]))

  const equityCurve = priceData.map(p => {
    if (tradeExits.has(p.date)) {
      runningValue += tradeExits.get(p.date)!
    }
    const benchmarkVal = config.initialCapital * (p.price / priceData[0].price)
    return {
      date: p.date,
      portfolio: Math.round(runningValue),
      benchmark: Math.round(benchmarkVal),
    }
  })

  // Calculate metrics
  const totalReturn = runningValue - config.initialCapital
  const totalReturnPct = (totalReturn / config.initialCapital) * 100

  // Max drawdown
  let maxDrawdown = 0
  let peak = runningValue
  const values = equityCurve.map(e => e.portfolio)
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] > peak) peak = values[i]
    const dd = ((peak - values[i]) / peak) * 100
    if (dd > maxDrawdown) maxDrawdown = dd
  }

  // Sharpe ratio (simplified, annualized)
  const dailyReturns = equityCurve.slice(1).map((e, i) =>
    (e.portfolio - equityCurve[i].portfolio) / equityCurve[i].portfolio
  )
  const avgReturn = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length
  const stdReturns = Math.sqrt(
    dailyReturns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / dailyReturns.length
  )
  const sharpeRatio = stdReturns === 0 ? 0 : (avgReturn / stdReturns) * Math.sqrt(252)

  const winRate = trades.length > 0
    ? (trades.filter(t => t.pnl > 0).length / trades.length) * 100
    : 0

  // Monthly returns
  const monthlyReturns: { month: string; returnPct: number }[] = []
  const months = new Map<string, { start: number; end: number }>()

  equityCurve.forEach(e => {
    const monthKey = e.date.substring(0, 7)
    if (!months.has(monthKey)) {
      months.set(monthKey, { start: e.portfolio, end: e.portfolio })
    } else {
      months.get(monthKey)!.end = e.portfolio
    }
  })

  let prevEnd = config.initialCapital
  months.forEach((val, key) => {
    monthlyReturns.push({
      month: key,
      returnPct: Math.round(((val.end - prevEnd) / prevEnd) * 10000) / 100,
    })
    prevEnd = val.end
  })

  return {
    totalReturn: Math.round(totalReturn),
    totalReturnPct: Math.round(totalReturnPct * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    totalTrades: trades.length,
    winRate: Math.round(winRate),
    equityCurve,
    trades,
    monthlyReturns,
  }
}

// ─── Format Helpers ──────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatPercent(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
}

// ─── Custom Tooltip for Chart ────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { value: number; name: string; color: string }[]
  label?: string
}) {
  if (!active || !payload) return null
  return (
    <div className="bg-card border border-border/50 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-muted-foreground mb-2">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="text-xs font-mono" style={{ color: p.color }}>
          {p.name}: {formatCurrency(p.value)}
        </p>
      ))}
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

export function BacktestingEngine() {
  // Default dates: last 90 days
  const today = new Date()
  const ninetyDaysAgo = new Date(today)
  ninetyDaysAgo.setDate(today.getDate() - 90)

  const [config, setConfig] = useState<BacktestConfig>({
    symbol: 'RELIANCE',
    startDate: ninetyDaysAgo.toISOString().split('T')[0],
    endDate: today.toISOString().split('T')[0],
    initialCapital: 1000000,
    positionSizePct: 10,
    strategyType: 'sma-crossover',
  })

  const [result, setResult] = useState<BacktestResult | null>(null)
  const [isRunning, setIsRunning] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const tradesPerPage = 10

  const handleRunBacktest = useCallback(() => {
    setIsRunning(true)
    setResult(null)

    // Simulate computation delay
    setTimeout(() => {
      const backtestResult = runBacktest(config)
      setResult(backtestResult)
      setIsRunning(false)
      setCurrentPage(1)
      toast.success('Backtest completed!', {
        description: `${backtestResult.totalTrades} trades • ${formatPercent(backtestResult.totalReturnPct)} return`,
        duration: 3000,
      })
    }, 1500)
  }, [config])

  const paginatedTrades = useMemo(() => {
    if (!result) return []
    const start = (currentPage - 1) * tradesPerPage
    return result.trades.slice(start, start + tradesPerPage)
  }, [result, currentPage])

  const totalPages = result ? Math.ceil(result.trades.length / tradesPerPage) : 0

  // Monthly returns heatmap color
  const getHeatmapColor = (value: number) => {
    if (value > 5) return 'bg-emerald-500/80 text-white'
    if (value > 2) return 'bg-emerald-500/50 text-white'
    if (value > 0) return 'bg-emerald-500/25 text-emerald-400'
    if (value > -2) return 'bg-red-500/25 text-red-400'
    if (value > -5) return 'bg-red-500/50 text-white'
    return 'bg-red-500/80 text-white'
  }

  return (
    <div className="space-y-6">
      {/* Strategy Configuration Panel */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FlaskConical className="h-5 w-5 text-emerald-400" />
              Strategy Configuration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Symbol */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Symbol</Label>
                <Select
                  value={config.symbol}
                  onValueChange={(v) => setConfig(prev => ({ ...prev, symbol: v }))}
                >
                  <SelectTrigger className="bg-background/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border/50 max-h-64">
                    {NIFTY50_SYMBOLS.map(sym => (
                      <SelectItem key={sym} value={sym} className="font-mono">
                        {sym}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Strategy Type */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Strategy</Label>
                <Select
                  value={config.strategyType}
                  onValueChange={(v) => setConfig(prev => ({ ...prev, strategyType: v as StrategyType }))}
                >
                  <SelectTrigger className="bg-background/50 border-border/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-border/50">
                    {STRATEGY_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Initial Capital */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Initial Capital (₹)</Label>
                <Input
                  type="number"
                  value={config.initialCapital}
                  onChange={(e) => setConfig(prev => ({ ...prev, initialCapital: Number(e.target.value) || 1000000 }))}
                  className="bg-background/50 border-border/50 font-mono"
                  min={100000}
                  step={100000}
                />
              </div>

              {/* Start Date */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Start Date</Label>
                <Input
                  type="date"
                  value={config.startDate}
                  onChange={(e) => setConfig(prev => ({ ...prev, startDate: e.target.value }))}
                  className="bg-background/50 border-border/50 font-mono"
                />
              </div>

              {/* End Date */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">End Date</Label>
                <Input
                  type="date"
                  value={config.endDate}
                  onChange={(e) => setConfig(prev => ({ ...prev, endDate: e.target.value }))}
                  className="bg-background/50 border-border/50 font-mono"
                />
              </div>

              {/* Position Size */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Position Size (%)</Label>
                <Input
                  type="number"
                  value={config.positionSizePct}
                  onChange={(e) => setConfig(prev => ({ ...prev, positionSizePct: Number(e.target.value) || 10 }))}
                  className="bg-background/50 border-border/50 font-mono"
                  min={1}
                  max={100}
                  step={1}
                />
              </div>
            </div>

            {/* Run Backtest Button */}
            <div className="mt-5 flex items-center gap-3">
              <Button
                onClick={handleRunBacktest}
                disabled={isRunning}
                className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 gap-2"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running Backtest...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Run Backtest
                  </>
                )}
              </Button>
              {result && (
                <Badge variant="secondary" className="text-xs bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                  {result.totalTrades} trades • {formatPercent(result.totalReturnPct)}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Results Dashboard */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="space-y-6"
          >
            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Return */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
              >
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${
                        result.totalReturn >= 0
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-red-500/15 text-red-400'
                      }`}>
                        {result.totalReturn >= 0
                          ? <TrendingUp className="h-4 w-4" />
                          : <TrendingDown className="h-4 w-4" />
                        }
                      </div>
                      <span className="text-xs text-muted-foreground">Total Return</span>
                    </div>
                    <p className={`text-xl font-bold font-mono ${
                      result.totalReturn >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {formatCurrency(result.totalReturn)}
                    </p>
                    <p className={`text-sm font-mono ${
                      result.totalReturnPct >= 0 ? 'text-emerald-400/70' : 'text-red-400/70'
                    }`}>
                      {formatPercent(result.totalReturnPct)}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Max Drawdown */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.15 }}
              >
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-red-500/15 text-red-400 flex items-center justify-center">
                        <ArrowDownRight className="h-4 w-4" />
                      </div>
                      <span className="text-xs text-muted-foreground">Max Drawdown</span>
                    </div>
                    <p className="text-xl font-bold font-mono text-red-400">
                      -{result.maxDrawdown.toFixed(2)}%
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Peak-to-trough decline
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Sharpe Ratio */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
                        <Activity className="h-4 w-4" />
                      </div>
                      <span className="text-xs text-muted-foreground">Sharpe Ratio</span>
                    </div>
                    <p className="text-xl font-bold font-mono text-foreground">
                      {result.sharpeRatio.toFixed(2)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Risk-adjusted return
                    </p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Total Trades */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.25 }}
              >
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="h-8 w-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                        <BarChart3 className="h-4 w-4" />
                      </div>
                      <span className="text-xs text-muted-foreground">Total Trades</span>
                    </div>
                    <p className="text-xl font-bold font-mono text-foreground">
                      {result.totalTrades}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Win rate: <span className={result.winRate >= 50 ? 'text-emerald-400' : 'text-red-400'}>
                        {result.winRate.toFixed(0)}%
                      </span>
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>

            {/* Equity Curve Chart */}
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    Equity Curve
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={result.equityCurve}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(v) => v.substring(5)}
                          interval="preserveStartEnd"
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                          tickFormatter={(v) => `₹${(v / 100000).toFixed(1)}L`}
                        />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Legend
                          wrapperStyle={{ fontSize: '11px' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="portfolio"
                          name="Strategy"
                          stroke="#10b981"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: '#10b981' }}
                        />
                        <Line
                          type="monotone"
                          dataKey="benchmark"
                          name="Buy & Hold"
                          stroke="#6b7280"
                          strokeWidth={1.5}
                          strokeDasharray="5 5"
                          dot={false}
                          activeDot={{ r: 3, fill: '#6b7280' }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Monthly Returns Heatmap & Trade List */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Monthly Returns Heatmap */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="lg:col-span-1"
              >
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm h-full">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="h-4 w-4 text-amber-400" />
                      Monthly Returns
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-2">
                      {result.monthlyReturns.map((mr) => (
                        <div
                          key={mr.month}
                          className={`rounded-lg p-2.5 text-center ${getHeatmapColor(mr.returnPct)} transition-colors`}
                        >
                          <p className="text-[10px] font-medium opacity-70">
                            {mr.month.substring(5)}
                          </p>
                          <p className="text-xs font-bold font-mono">
                            {mr.returnPct > 0 ? '+' : ''}{mr.returnPct.toFixed(1)}%
                          </p>
                        </div>
                      ))}
                      {result.monthlyReturns.length === 0 && (
                        <p className="col-span-3 text-sm text-muted-foreground text-center py-8">
                          No monthly data available
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Trade List Table */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="lg:col-span-2"
              >
                <Card className="border-border/50 bg-card/80 backdrop-blur-sm h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="h-4 w-4 text-emerald-400" />
                        Trade List
                      </CardTitle>
                      {result.trades.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {result.trades.filter(t => t.pnl > 0).length}W / {result.trades.filter(t => t.pnl <= 0).length}L
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {result.trades.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Activity className="h-10 w-10 mb-2 opacity-30" />
                        <p className="text-sm">No trades generated for this strategy</p>
                        <p className="text-xs mt-1">Try adjusting the date range or strategy type</p>
                      </div>
                    ) : (
                      <>
                        <div className="max-h-96 overflow-y-auto scrollbar-thin">
                          <Table>
                            <TableHeader>
                              <TableRow className="border-border/30 hover:bg-transparent">
                                <TableHead className="text-xs">#</TableHead>
                                <TableHead className="text-xs">Action</TableHead>
                                <TableHead className="text-xs">Entry Date</TableHead>
                                <TableHead className="text-xs">Exit Date</TableHead>
                                <TableHead className="text-xs text-right">Entry ₹</TableHead>
                                <TableHead className="text-xs text-right">Exit ₹</TableHead>
                                <TableHead className="text-xs text-right">P&L</TableHead>
                                <TableHead className="text-xs text-right">P&L %</TableHead>
                                <TableHead className="text-xs text-right">Days</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {paginatedTrades.map((trade) => (
                                <TableRow key={trade.id} className="border-border/20">
                                  <TableCell className="text-xs font-mono">{trade.id}</TableCell>
                                  <TableCell>
                                    <Badge
                                      className={`text-[10px] px-1.5 py-0 ${
                                        trade.action === 'BUY'
                                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20'
                                          : 'bg-red-500/15 text-red-400 border-red-500/20'
                                      }`}
                                    >
                                      {trade.action}
                                    </Badge>
                                  </TableCell>
                                  <TableCell className="text-xs font-mono">{trade.entryDate}</TableCell>
                                  <TableCell className="text-xs font-mono">{trade.exitDate}</TableCell>
                                  <TableCell className="text-xs font-mono text-right">
                                    {trade.entryPrice.toLocaleString('en-IN')}
                                  </TableCell>
                                  <TableCell className="text-xs font-mono text-right">
                                    {trade.exitPrice.toLocaleString('en-IN')}
                                  </TableCell>
                                  <TableCell className={`text-xs font-mono text-right font-semibold ${
                                    trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'
                                  }`}>
                                    {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toLocaleString('en-IN')}
                                  </TableCell>
                                  <TableCell className={`text-xs font-mono text-right font-semibold ${
                                    trade.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'
                                  }`}>
                                    {trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(2)}%
                                  </TableCell>
                                  <TableCell className="text-xs font-mono text-right">{trade.holdDays}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                            <p className="text-xs text-muted-foreground">
                              Showing {(currentPage - 1) * tradesPerPage + 1}-{Math.min(currentPage * tradesPerPage, result.trades.length)} of {result.trades.length}
                            </p>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={currentPage === 1}
                                onClick={() => setCurrentPage(prev => prev - 1)}
                              >
                                <ChevronLeft className="h-4 w-4" />
                              </Button>
                              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                const page = i + 1
                                return (
                                  <Button
                                    key={page}
                                    variant={currentPage === page ? 'default' : 'ghost'}
                                    size="icon"
                                    className={`h-7 w-7 text-xs ${
                                      currentPage === page ? 'bg-emerald-600 hover:bg-emerald-700' : ''
                                    }`}
                                    onClick={() => setCurrentPage(page)}
                                  >
                                    {page}
                                  </Button>
                                )
                              })}
                              {totalPages > 5 && <span className="text-xs text-muted-foreground px-1">...</span>}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                disabled={currentPage === totalPages}
                                onClick={() => setCurrentPage(prev => prev + 1)}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
