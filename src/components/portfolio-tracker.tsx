'use client'

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useTradingStore } from '@/lib/store/trading-store'
import { mockPositions } from '@/lib/mock-data'
import type { Position } from '@/lib/types/trading'
import { TrendingUp, TrendingDown, X, Wallet, IndianRupee, BarChart3, Percent, ArrowUpRight, Sparkles, Shield, PieChart as PieChartIcon, Activity, History, ArrowUpDown, Trophy, AlertTriangle, ToggleLeft, ToggleRight, Download } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, AreaChart, Area } from 'recharts'
import { motion } from 'framer-motion'
import { quickExportCSV } from '@/components/export-dialog'
import { toast } from 'sonner'
import { LineChart, Line } from 'recharts'

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

// Sector mapping for symbols
const SECTOR_MAP: Record<string, string> = {
  RELIANCE: 'Energy',
  TCS: 'IT',
  INFY: 'IT',
  WIPRO: 'IT',
  HCLTECH: 'IT',
  TECHM: 'IT',
  HDFCBANK: 'Banking',
  ICICIBANK: 'Banking',
  SBIN: 'Banking',
  KOTAKBANK: 'Banking',
  AXISBANK: 'Banking',
  INDUSINDBK: 'Banking',
  ITC: 'FMCG',
  HINDUNILVR: 'FMCG',
  BRITANNIA: 'FMCG',
  NESTLEIND: 'FMCG',
  TATAMOTORS: 'Auto',
  MARUTI: 'Auto',
  'M&M': 'Auto',
  HEROMOTOCO: 'Auto',
  EICHERMOT: 'Auto',
  BAJFINANCE: 'Banking',
  BAJAJFINSV: 'Banking',
  SUNPHARMA: 'Pharma',
  DRREDDY: 'Pharma',
  CIPLA: 'Pharma',
  DIVISLAB: 'Pharma',
  TATASTEEL: 'Metals',
  HINDALCO: 'Metals',
  JSWSTEEL: 'Metals',
  ADANIENT: 'Energy',
  ADANIPORTS: 'Energy',
  NTPC: 'Energy',
  POWERGRID: 'Energy',
  ONGC: 'Energy',
  COALINDIA: 'Energy',
  BHARTIARTL: 'IT',
  ASIANPAINT: 'FMCG',
  LT: 'IT',
  TITAN: 'FMCG',
  ULTRACEMCO: 'Metals',
  BPCL: 'Energy',
  IOC: 'Energy',
  GRASIM: 'Metals',
  TATACONSUM: 'FMCG',
  SBILIFE: 'Banking',
  HDFCLIFE: 'Banking',
  APOLLOHOSP: 'Pharma',
}

const SECTOR_COLORS: Record<string, string> = {
  IT: '#3b82f6',
  Banking: '#f59e0b',
  Energy: '#ef4444',
  Auto: '#8b5cf6',
  Pharma: '#ec4899',
  FMCG: '#10b981',
  Metals: '#06b6d4',
}

// Time period type
type TimePeriod = '1W' | '1M' | '3M' | '6M' | '1Y'
type PortfolioPoint = { day: string; value: number; nifty?: number }
type NiftyPoint = { day: string; nifty: number }
type SparkPoint = { v: number }

const PERIOD_CONFIG: Record<TimePeriod, { days: number; label: string; interval: number }> = {
  '1W': { days: 7, label: '1 Week', interval: 1 },
  '1M': { days: 30, label: '1 Month', interval: 6 },
  '3M': { days: 90, label: '3 Months', interval: 14 },
  '6M': { days: 180, label: '6 Months', interval: 29 },
  '1Y': { days: 365, label: '1 Year', interval: 30 },
}

// Generate portfolio data based on time period
function generatePortfolioData(period: TimePeriod): PortfolioPoint[] {
  const config = PERIOD_CONFIG[period]
  const data: PortfolioPoint[] = []
  let val = 95000
  const volatility = period === '1W' ? 1500 : period === '1M' ? 2000 : period === '3M' ? 2500 : period === '6M' ? 3000 : 3500
  const trendBias = period === '1Y' ? -0.3 : -0.4
  for (let i = 0; i < config.days; i++) {
    const change = (Math.random() + trendBias) * volatility
    val = Math.max(75000, Math.min(140000, val + change))
    const date = new Date()
    date.setDate(date.getDate() - (config.days - 1 - i))
    data.push({
      day: period === '1Y'
        ? date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
        : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      value: Math.round(val),
    })
  }
  return data
}

// Generate NIFTY 50 benchmark data starting at the same value
function generateNiftyData(portfolioData: { day: string; value: number }[]): NiftyPoint[] {
  const startValue = portfolioData[0]?.value || 95000
  // NIFTY value scaled to start at same portfolio value for comparison
  const niftyBase = 22000 // Current NIFTY 50 approximate
  const scaleFactor = startValue / niftyBase

  const data: NiftyPoint[] = []
  let niftyVal = niftyBase
  for (let i = 0; i < portfolioData.length; i++) {
    const change = (Math.random() - 0.42) * (niftyBase * 0.015)
    niftyVal = Math.max(niftyBase * 0.85, Math.min(niftyBase * 1.15, niftyVal + change))
    data.push({
      day: portfolioData[i].day,
      nifty: Math.round(niftyVal * scaleFactor),
    })
  }
  return data
}

// Generate sparkline data for position rows
function generatePositionSparkline(pnl: number): SparkPoint[] {
  const data: SparkPoint[] = []
  let val = 50
  const trend = pnl >= 0 ? 1 : -1
  for (let i = 0; i < 7; i++) {
    val = val + trend * (Math.random() * 6 + 1) + (Math.random() - 0.5) * 8
    val = Math.max(10, Math.min(90, val))
    data.push({ v: Math.round(val * 10) / 10 })
  }
  return data
}

// P&L performance mock data (last 7 days)
const pnlPerformanceData = [
  { day: 'Mon', pnl: 1200 },
  { day: 'Tue', pnl: -450 },
  { day: 'Wed', pnl: 2300 },
  { day: 'Thu', pnl: 800 },
  { day: 'Fri', pnl: -200 },
  { day: 'Sat', pnl: 0 },
  { day: 'Sun', pnl: 1500 },
]

// Transaction Log mock data
interface Transaction {
  id: string
  date: string
  symbol: string
  action: 'BUY' | 'SELL'
  quantity: number
  price: number
  totalValue: number
  pnl?: number
}

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 'tx1', date: '2025-03-05', symbol: 'RELIANCE', action: 'BUY', quantity: 25, price: 2845.50, totalValue: 71137.50 },
  { id: 'tx2', date: '2025-03-04', symbol: 'TCS', action: 'BUY', quantity: 15, price: 3920.00, totalValue: 58800.00 },
  { id: 'tx3', date: '2025-03-04', symbol: 'HDFCBANK', action: 'SELL', quantity: 20, price: 1685.30, totalValue: 33706.00, pnl: 4200.00 },
  { id: 'tx4', date: '2025-03-03', symbol: 'INFY', action: 'BUY', quantity: 30, price: 1856.75, totalValue: 55702.50 },
  { id: 'tx5', date: '2025-03-03', symbol: 'ITC', action: 'SELL', quantity: 50, price: 465.20, totalValue: 23260.00, pnl: -850.00 },
  { id: 'tx6', date: '2025-03-02', symbol: 'TATAMOTORS', action: 'BUY', quantity: 40, price: 978.45, totalValue: 39138.00 },
  { id: 'tx7', date: '2025-03-01', symbol: 'SBIN', action: 'SELL', quantity: 35, price: 812.60, totalValue: 28441.00, pnl: 3150.00 },
  { id: 'tx8', date: '2025-02-28', symbol: 'ICICIBANK', action: 'BUY', quantity: 20, price: 1245.80, totalValue: 24916.00 },
  { id: 'tx9', date: '2025-02-27', symbol: 'WIPRO', action: 'SELL', quantity: 45, price: 542.30, totalValue: 24403.50, pnl: -1200.00 },
  { id: 'tx10', date: '2025-02-26', symbol: 'SUNPHARMA', action: 'BUY', quantity: 18, price: 1820.00, totalValue: 32760.00 },
]

// Indian number formatting helper
function formatINR(num: number): string {
  const prefix = num >= 0 ? '' : '-'
  const absNum = Math.abs(num)
  const str = absNum.toLocaleString('en-IN')
  return `${prefix}₹${str}`
}

function formatINRWithSign(num: number): string {
  if (num >= 0) return `+₹${num.toLocaleString('en-IN')}`
  return `-₹${Math.abs(num).toLocaleString('en-IN')}`
}

// Gradient divider component
function GradientDivider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
}

export function PortfolioTracker() {
  const { positions, setPositions } = useTradingStore()
  const [view, setView] = useState<'open' | 'closed'>('open')
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>('1M')
  const [compareNifty, setCompareNifty] = useState(false)

  const openPositions = positions.filter((p) => p.status === 'open')
  const closedPositions = positions.filter((p) => p.status === 'closed')

  useEffect(() => {
    if (positions.length === 0) {
      setPositions(mockPositions)
    }
  }, [positions.length, setPositions])

  // Generate portfolio data based on selected period
  const portfolioChartData = useMemo(() => {
    const portfolioData = generatePortfolioData(selectedPeriod)
    if (compareNifty) {
      const niftyData = generateNiftyData(portfolioData)
      return portfolioData.map((p, i) => ({
        ...p,
        nifty: niftyData[i]?.nifty || 0,
      }))
    }
    return portfolioData
  }, [selectedPeriod, compareNifty])

  const totalInvested = openPositions.reduce(
    (sum, p) => sum + p.entryPrice * p.quantity,
    0
  )
  const currentValue = openPositions.reduce(
    (sum, p) => sum + (p.currentPrice || p.entryPrice) * p.quantity,
    0
  )
  const totalPnl = openPositions.reduce((sum, p) => sum + (p.pnl || 0), 0)
  const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0
  const wins = openPositions.filter((p) => (p.pnl || 0) >= 0).length
  const winRate = openPositions.length > 0 ? (wins / openPositions.length) * 100 : 0

  const pieData = openPositions.map((p) => ({
    name: p.symbol,
    value: (p.currentPrice || p.entryPrice) * p.quantity,
  }))

  // Sector Allocation Data with stock count
  const sectorData = (() => {
    const sectorMap: Record<string, { value: number; count: number }> = {}
    openPositions.forEach((p) => {
      const sector = SECTOR_MAP[p.symbol] || 'Other'
      const val = (p.currentPrice || p.entryPrice) * p.quantity
      if (!sectorMap[sector]) {
        sectorMap[sector] = { value: 0, count: 0 }
      }
      sectorMap[sector].value += val
      sectorMap[sector].count += 1
    })
    const total = Object.values(sectorMap).reduce((a, b) => a + b.value, 0)
    return Object.entries(sectorMap)
      .map(([name, { value, count }]) => ({
        name,
        value,
        count,
        percentage: total > 0 ? Math.round((value / total) * 100) : 0,
        fill: SECTOR_COLORS[name] || '#6b7280',
      }))
      .sort((a, b) => b.percentage - a.percentage)
  })()

  // Period change calculation
  const chartFirst = portfolioChartData[0]?.value || 0
  const chartLast = portfolioChartData[portfolioChartData.length - 1]?.value || 0
  const chartChangePercent = chartFirst > 0 ? ((chartLast - chartFirst) / chartFirst) * 100 : 0
  const chartIsPositive = chartChangePercent >= 0

  // NIFTY change calculation
  const niftyFirst = compareNifty ? (portfolioChartData[0]?.nifty || 0) : 0
  const niftyLast = compareNifty ? (portfolioChartData[portfolioChartData.length - 1]?.nifty || 0) : 0
  const niftyChangePercent = niftyFirst > 0 ? ((niftyLast - niftyFirst) / niftyFirst) * 100 : 0

  // Risk Distribution Data
  const riskData = (() => {
    const posValues = openPositions.map((p) => ({
      symbol: p.symbol,
      value: (p.currentPrice || p.entryPrice) * p.quantity,
    }))
    const totalVal = posValues.reduce((s, p) => s + p.value, 0)
    let low = 0, medium = 0, high = 0
    posValues.forEach((p) => {
      const pct = totalVal > 0 ? (p.value / totalVal) * 100 : 0
      if (pct <= 15) low += p.value
      else if (pct <= 30) medium += p.value
      else high += p.value
    })
    return [
      { name: 'Low Risk', value: low, fill: '#10b981', pct: totalVal > 0 ? Math.round((low / totalVal) * 100) : 0 },
      { name: 'Medium Risk', value: medium, fill: '#f59e0b', pct: totalVal > 0 ? Math.round((medium / totalVal) * 100) : 0 },
      { name: 'High Risk', value: high, fill: '#ef4444', pct: totalVal > 0 ? Math.round((high / totalVal) * 100) : 0 },
    ].filter(d => d.value > 0)
  })()

  // Top Gainers & Losers
  const topGainers = [...openPositions]
    .filter((p) => (p.pnlPercent || 0) > 0)
    .sort((a, b) => (b.pnlPercent || 0) - (a.pnlPercent || 0))
    .slice(0, 3)

  const topLosers = [...openPositions]
    .filter((p) => (p.pnlPercent || 0) < 0)
    .sort((a, b) => (a.pnlPercent || 0) - (b.pnlPercent || 0))
    .slice(0, 3)

  // Total transaction value
  const totalTransactionValue = MOCK_TRANSACTIONS.reduce((sum, tx) => sum + tx.totalValue, 0)

  const summaryCards = [
    {
      title: 'Total Invested',
      value: formatINR(totalInvested),
      icon: Wallet,
      gradient: 'from-sky-500/15 via-sky-500/5 to-transparent',
      textColor: 'text-sky-400',
      iconColor: 'text-sky-400',
      accentColor: 'sky',
      accentClass: 'card-top-accent card-top-accent-sky',
    },
    {
      title: 'Current Value',
      value: formatINR(currentValue),
      icon: IndianRupee,
      gradient: 'from-emerald-500/15 via-emerald-500/5 to-transparent',
      textColor: 'text-emerald-400',
      iconColor: 'text-emerald-400',
      accentColor: 'emerald',
      accentClass: 'card-top-accent card-top-accent-emerald',
    },
    {
      title: 'Total P&L',
      value: formatINRWithSign(totalPnl),
      icon: totalPnl >= 0 ? TrendingUp : TrendingDown,
      gradient: totalPnl >= 0
        ? 'from-emerald-500/15 via-emerald-500/5 to-transparent'
        : 'from-red-500/15 via-red-500/5 to-transparent',
      textColor: totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
      iconColor: totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
      glowClass: totalPnl >= 0 ? 'glow-emerald' : 'glow-red',
      accentColor: totalPnl >= 0 ? 'emerald' : 'red',
      accentClass: totalPnl >= 0 ? 'card-top-accent card-top-accent-emerald' : 'card-top-accent card-top-accent-red',
    },
    {
      title: 'Win Rate',
      value: `${winRate.toFixed(1)}%`,
      icon: Percent,
      gradient: 'from-amber-500/15 via-amber-500/5 to-transparent',
      textColor: 'text-amber-400',
      iconColor: 'text-amber-400',
      accentColor: 'amber',
      accentClass: 'card-top-accent card-top-accent-amber',
    },
  ]

  // Total Returns
  const totalReturnsPercent = totalInvested > 0 ? ((currentValue - totalInvested) / totalInvested * 100) : 0

  return (
    <div className="space-y-5">
      {/* Professional Header */}
      <motion.div
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold gradient-text tracking-tight">Portfolio Overview</h2>
          <p className="text-xs text-muted-foreground mt-1 tracking-wide">Real-time portfolio tracking & analytics</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] px-2.5 py-1 font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tracking-wide">
            <Activity className="h-3 w-3 mr-1" />
            {openPositions.length} Active
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const data = positions.map((p) => ({
                Symbol: p.symbol,
                Exchange: p.exchange,
                Action: p.action,
                Quantity: p.quantity,
                'Entry Price': p.entryPrice,
                'Current Price': p.currentPrice ?? '',
                'P&L (₹)': p.pnl ?? '',
                'P&L %': p.pnlPercent ?? '',
                Status: p.status,
                'Created At': new Date(p.createdAt).toLocaleString('en-IN'),
              }))
              const headers = ['Symbol', 'Exchange', 'Action', 'Quantity', 'Entry Price', 'Current Price', 'P&L (₹)', 'P&L %', 'Status', 'Created At']
              if (data.length === 0) {
                toast.info('No positions to export')
                return
              }
              quickExportCSV(data as unknown as Record<string, unknown>[], headers, 'tradeai-portfolio')
            }}
            className="gap-1.5 text-xs border-border/50 hover:border-emerald-500/30 hover:text-emerald-400 transition-all h-7"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export</span>
          </Button>
        </div>
      </motion.div>

      {/* Portfolio Performance Chart with Time Period Selector & NIFTY Comparison */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className={`trading-card shadow-sm shadow-black/20 overflow-hidden ${chartIsPositive ? 'glow-emerald' : 'glow-red'}`}>
          <div className={`h-[3px] ${chartIsPositive ? 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400' : 'bg-gradient-to-r from-red-500 via-red-400 to-rose-400'}`} />
          <CardContent className="p-4">
            {/* Chart Header with Period Selector & NIFTY Toggle */}
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className={`p-1.5 rounded-md ${chartIsPositive ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                  <Activity className={`h-4 w-4 ${chartIsPositive ? 'text-emerald-500' : 'text-red-500'}`} />
                </div>
                <div>
                  <span className="text-sm font-bold text-foreground tracking-tight">
                    Portfolio Value ({PERIOD_CONFIG[selectedPeriod].label})
                  </span>
                  <p className="text-[10px] text-muted-foreground tracking-wide">Historical performance trend</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* NIFTY Comparison Toggle */}
                <button
                  onClick={() => setCompareNifty(!compareNifty)}
                  className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1 rounded-md border transition-all duration-200 ${
                    compareNifty
                      ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                      : 'bg-muted/30 text-muted-foreground border-border/30 hover:border-amber-500/30 hover:text-amber-400'
                  }`}
                >
                  {compareNifty ? (
                    <ToggleRight className="h-3.5 w-3.5" />
                  ) : (
                    <ToggleLeft className="h-3.5 w-3.5" />
                  )}
                  Compare NIFTY 50
                </button>
                {/* Period Badge */}
                <Badge
                  variant="secondary"
                  className={`text-xs px-2.5 py-0.5 font-bold ${chartIsPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'}`}
                >
                  {chartIsPositive ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                  {selectedPeriod}: {chartIsPositive ? '+' : ''}{chartChangePercent.toFixed(2)}%
                </Badge>
              </div>
            </div>

            {/* Time Period Selector Buttons */}
            <div className="flex items-center gap-1 mb-3">
              {(['1W', '1M', '3M', '6M', '1Y'] as TimePeriod[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all duration-200 ${
                    selectedPeriod === period
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-sm shadow-emerald-500/10'
                      : 'bg-muted/30 text-muted-foreground border border-transparent hover:bg-muted/50 hover:text-foreground'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>

            {/* Chart */}
            <div className="h-[160px]">
              <ResponsiveContainer width="100%" height="100%">
                {compareNifty ? (
                  <LineChart data={portfolioChartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} opacity={0.3} />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      interval={PERIOD_CONFIG[selectedPeriod].interval}
                    />
                    <YAxis hide />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        `₹${value.toLocaleString('en-IN')}`,
                        name === 'value' ? 'Portfolio' : 'NIFTY 50',
                      ]}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: '10px' }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px' }}
                      formatter={(value: string) => (
                        <span className={value === 'value' ? 'text-emerald-400' : 'text-amber-400'}>
                          {value === 'value' ? 'Portfolio' : 'NIFTY 50'}
                        </span>
                      )}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={chartIsPositive ? '#10b981' : '#ef4444'}
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{
                        r: 4,
                        fill: chartIsPositive ? '#10b981' : '#ef4444',
                        stroke: chartIsPositive ? '#34d399' : '#f87171',
                        strokeWidth: 2,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="nifty"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      activeDot={{
                        r: 4,
                        fill: '#f59e0b',
                        stroke: '#fbbf24',
                        strokeWidth: 2,
                      }}
                    />
                  </LineChart>
                ) : (
                  <AreaChart data={portfolioChartData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                    <defs>
                      <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={chartIsPositive ? '#10b981' : '#ef4444'} stopOpacity={0.35} />
                        <stop offset="50%" stopColor={chartIsPositive ? '#10b981' : '#ef4444'} stopOpacity={0.12} />
                        <stop offset="100%" stopColor={chartIsPositive ? '#10b981' : '#ef4444'} stopOpacity={0.0} />
                      </linearGradient>
                      <linearGradient id="sparkStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={chartIsPositive ? '#059669' : '#dc2626'} />
                        <stop offset="50%" stopColor={chartIsPositive ? '#10b981' : '#ef4444'} />
                        <stop offset="100%" stopColor={chartIsPositive ? '#34d399' : '#f87171'} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                      interval={PERIOD_CONFIG[selectedPeriod].interval}
                    />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="url(#sparkStroke)"
                      strokeWidth={2.5}
                      fill="url(#sparkGradient)"
                      dot={false}
                      activeDot={{
                        r: 5,
                        fill: chartIsPositive ? '#10b981' : '#ef4444',
                        stroke: chartIsPositive ? '#34d399' : '#f87171',
                        strokeWidth: 2,
                      }}
                    />
                    <Tooltip
                      formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Portfolio Value']}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      }}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))', fontSize: '10px' }}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Current value indicator & NIFTY comparison stats */}
            <div className={`flex items-center justify-between mt-2 pt-2 border-t border-border/30 ${compareNifty ? 'flex-wrap gap-2' : ''}`}>
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${chartIsPositive ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
                <span className="text-[10px] text-muted-foreground">Current</span>
              </div>
              <div className="flex items-center gap-3">
                {compareNifty && (
                  <div className="flex items-center gap-1.5">
                    <div className="h-2 w-2 rounded-full bg-amber-400" />
                    <span className="text-[10px] text-muted-foreground">NIFTY 50:</span>
                    <span className={`text-xs font-bold font-mono ${niftyChangePercent >= 0 ? 'text-amber-400' : 'text-red-400'}`}>
                      {niftyChangePercent >= 0 ? '+' : ''}{niftyChangePercent.toFixed(2)}%
                    </span>
                  </div>
                )}
                <span className={`text-sm font-bold font-mono tabular-nums tracking-tight ${chartIsPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                  ₹{chartLast.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Total Returns Display - More Prominent */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="text-center py-3"
      >
        <p className="text-xs text-muted-foreground mb-2 uppercase tracking-wider font-semibold">Total Returns</p>
        <div className="flex items-center justify-center gap-3">
          <span className={`text-5xl font-extrabold font-mono tracking-tight ${
            totalReturnsPercent >= 0
              ? 'bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-400 bg-clip-text text-transparent'
              : 'bg-gradient-to-r from-red-400 via-red-300 to-rose-400 bg-clip-text text-transparent'
          }`}>
            {totalReturnsPercent >= 0 ? '+' : ''}{totalReturnsPercent.toFixed(2)}%
          </span>
        </div>
        <Badge
          variant="secondary"
          className={`text-xs px-3 py-1 font-bold mt-2 ${totalReturnsPercent >= 0 ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}
        >
          {totalReturnsPercent >= 0 ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
          {formatINRWithSign(totalPnl)}
        </Badge>
      </motion.div>

      <GradientDivider />

      {/* Summary Cards with card-top-accent Gradients */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.1 + 0.2 }}
          >
            <Card className={`trading-card card-shine card-top-accent ${card.accentClass} overflow-hidden shadow-sm shadow-black/20 ${card.glowClass || ''}`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient}`} />
              <CardContent className="p-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{card.title}</span>
                  <card.icon className={`h-5 w-5 ${card.iconColor}`} />
                </div>
                <div className={`metric-value-sm font-mono tabular-nums tracking-tight ${card.textColor}`}>{card.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <GradientDivider />

      {/* Sector Allocation Chart with Detail List */}
      {sectorData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="trading-card card-top-accent card-top-accent-amber shadow-sm shadow-black/20 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 font-bold tracking-tight">
                <PieChartIcon className="h-4 w-4 text-amber-500" />
                Sector Allocation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Horizontal Stacked Bar with percentage labels */}
              <div className="flex h-10 rounded-lg overflow-hidden mb-5 ring-1 ring-border/30">
                {sectorData.map((sector, i) => (
                  <div
                    key={sector.name}
                    className="relative group transition-all duration-200 hover:brightness-110"
                    style={{
                      width: `${sector.percentage}%`,
                      backgroundColor: sector.fill,
                    }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center">
                      {sector.percentage >= 8 && (
                        <span className="text-[10px] font-bold text-white drop-shadow-sm">
                          {sector.percentage}%
                        </span>
                      )}
                    </div>
                    {/* Tooltip on hover */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20">
                      <div className="bg-popover text-popover-foreground text-xs px-3 py-1.5 rounded-md shadow-lg border border-border whitespace-nowrap font-mono">
                        <span className="font-semibold">{sector.name}</span>: {sector.percentage}% (₹{sector.value.toLocaleString('en-IN')})
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Enhanced Sector Detail List */}
              <div className="space-y-2">
                {sectorData.map((sector) => (
                  <div
                    key={sector.name}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 bg-muted/20 hover:bg-muted/40 transition-colors group"
                  >
                    <div
                      className="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-white/10"
                      style={{ backgroundColor: sector.fill }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                      <span className="text-xs font-bold tracking-tight">{sector.name}</span>
                        <span className="text-xs font-bold font-mono tabular-nums tracking-tight">{sector.percentage}%</span>
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] text-muted-foreground tracking-wide">{sector.count} stock{sector.count > 1 ? 's' : ''}</span>
                        <span className="text-[10px] text-muted-foreground font-mono tabular-nums tracking-tight">₹{sector.value.toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Chart + Holdings + Risk */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pie Chart with Center Label */}
        <motion.div
          initial={{ opacity: 0, x: -15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
        >
          <Card className="trading-card card-top-accent card-top-accent-emerald shadow-sm shadow-black/20 overflow-hidden h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 font-bold tracking-tight">
                <BarChart3 className="h-4 w-4 text-emerald-500" />
                Holdings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                      dataKey="value"
                      stroke="none"
                      animationBegin={0}
                      animationDuration={800}
                      animationEasing="ease-out"
                    >
                      {pieData.map((_entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'Value']}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: '11px' }}
                      formatter={(value: string) => <span className="text-muted-foreground">{value}</span>}
                    />
                  </PieChart>
                </ResponsiveContainer>
                {/* Center Label - Improved */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Total</p>
                    <p className="text-base font-bold font-mono tabular-nums tracking-tight">₹{currentValue.toLocaleString('en-IN')}</p>
                  </div>
                </div>
              </div>

              {/* P&L Performance Mini Bar Chart */}
              <div className="mt-4 pt-3 border-t border-border/50">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1 font-semibold">
                  <Sparkles className="h-3 w-3 text-emerald-500" />
                  P&L Performance (7d)
                </p>
                <div className="h-[80px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={pnlPerformanceData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                      <YAxis hide />
                      <Bar
                        dataKey="pnl"
                        radius={[3, 3, 0, 0]}
                        shape={(props: unknown) => {
                          const { x, y, width, height, payload } = props as { x: number; y: number; width: number; height: number; payload: { pnl: number } }
                          const fill = payload.pnl >= 0 ? '#10b981' : '#ef4444'
                          return <rect x={x} y={y} width={width} height={height} fill={fill} rx={3} />
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Positions as Mini Cards */}
        <motion.div
          initial={{ opacity: 0, x: 15 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5 }}
          className="lg:col-span-2"
        >
          <Card className="trading-card shadow-sm shadow-black/20 overflow-hidden h-full">
            <div className={`h-[3px] bg-gradient-to-r ${view === 'open' ? 'from-emerald-500 via-emerald-400 to-teal-400' : 'from-amber-500 via-amber-400 to-yellow-400'}`} />
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2 font-bold tracking-tight">
                  {view === 'open' ? (
                    <TrendingUp className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <History className="h-4 w-4 text-amber-500" />
                  )}
                  {view === 'open' ? 'Open Positions' : 'Closed Positions'}
                  <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-bold tabular-nums">
                    {view === 'open' ? openPositions.length : closedPositions.length}
                  </Badge>
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant={view === 'open' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setView('open')}
                    className={`h-7 text-xs ${view === 'open' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                  >
                    Open
                  </Button>
                  <Button
                    variant={view === 'closed' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setView('closed')}
                    className={`h-7 text-xs ${view === 'closed' ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : ''}`}
                  >
                    Closed
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {(view === 'open' ? openPositions : closedPositions).length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <div className="relative inline-block mb-4">
                    <BarChart3 className="h-16 w-16 opacity-10" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Activity className="h-6 w-6 opacity-40" />
                    </div>
                  </div>
                  <p className="text-lg font-semibold mb-1">No {view} positions</p>
                  <p className="text-sm mb-4 max-w-xs mx-auto">
                    {view === 'open'
                      ? 'Execute trading signals to open your first position. Positions will appear here with real-time P&L tracking.'
                      : 'Closed positions will appear here with detailed P&L data and performance analytics.'}
                  </p>
                  {view === 'open' && (
                    <Button variant="outline" size="sm" className="text-xs gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                      <Sparkles className="h-3 w-3" />
                      Browse Signals
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[400px] overflow-y-auto custom-scrollbar pr-1">
                  {(view === 'open' ? openPositions : closedPositions).map((pos, i) => {
                    const sparkData = generatePositionSparkline(pos.pnl || 0)
                    const isProfit = (pos.pnl || 0) >= 0
                    const sector = SECTOR_MAP[pos.symbol] || 'Other'
                    return (
                      <motion.div
                        key={pos.id}
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                      >
                        <Card className={`trading-card card-top-accent ${isProfit ? 'card-top-accent-emerald' : 'card-top-accent-red'} shadow-sm shadow-black/20 overflow-hidden transition-all duration-200 cursor-pointer ${isProfit ? 'hover:glow-emerald' : 'hover:glow-red'}`}>
                          <CardContent className="p-3">
                            {/* Header: Symbol + Action Badge */}
                            <div className="flex items-center justify-between mb-2.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-sm tracking-tight">{pos.symbol}</span>
                                <Badge
                                  variant="secondary"
                                  className={`text-[10px] px-2 py-0.5 font-bold ${
                                    pos.action === 'BUY'
                                      ? 'badge-buy-consistent'
                                      : 'badge-sell-consistent'
                                  }`}
                                >
                                  {pos.action}
                                </Badge>
                              </div>
                              <span className="text-[10px] text-muted-foreground tracking-wide">{sector}</span>
                            </div>

                            {/* Price Info */}
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-2.5">
                              <div>
                                <p className="text-[10px] text-muted-foreground tracking-wide uppercase font-semibold">Qty</p>
                                <p className="text-xs font-mono font-semibold tabular-nums tracking-tight">{pos.quantity}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground tracking-wide uppercase font-semibold">Entry</p>
                                <p className="text-xs font-mono font-semibold tabular-nums tracking-tight">₹{pos.entryPrice.toLocaleString('en-IN')}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground tracking-wide uppercase font-semibold">Current</p>
                                <p className="text-xs font-mono font-semibold tabular-nums tracking-tight">₹{(pos.currentPrice || pos.entryPrice).toLocaleString('en-IN')}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-muted-foreground tracking-wide uppercase font-semibold">P&L</p>
                                <p className={`text-xs font-bold font-mono tabular-nums tracking-tight ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {isProfit ? '+' : ''}{formatINRWithSign(pos.pnl || 0)}
                                </p>
                              </div>
                            </div>

                            {/* Sparkline + P&L% */}
                            <div className="flex items-center justify-between">
                              <div className="w-20 h-6">
                                <ResponsiveContainer width="100%" height="100%">
                                  <LineChart data={sparkData}>
                                    <Line
                                      type="monotone"
                                      dataKey="v"
                                      stroke={isProfit ? '#10b981' : '#ef4444'}
                                      strokeWidth={1.5}
                                      dot={false}
                                    />
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                              <span className={`text-xs font-bold font-mono tabular-nums tracking-tight ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                                {(pos.pnlPercent || 0) >= 0 ? '+' : ''}{(pos.pnlPercent || 0).toFixed(2)}%
                              </span>
                            </div>

                            {/* Close Position Button (only for open) */}
                            {view === 'open' && (
                              <div className="mt-2 pt-2 border-t border-border/30 flex justify-end">
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 text-[10px] text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1 px-2"
                                    >
                                      <X className="h-2.5 w-2.5" />
                                      Close
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Close Position</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to close your {pos.action} position on {pos.symbol}?
                                        Current P&L: {formatINRWithSign(pos.pnl || 0)}
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction className="bg-red-600 hover:bg-red-700 text-white">
                                        Close Position
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Top Gainers / Losers + Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Top Gainers / Losers Mini Section */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
        >
          <Card className="trading-card card-top-accent card-top-accent-emerald shadow-sm shadow-black/20 overflow-hidden h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 font-bold tracking-tight">
                <Trophy className="h-4 w-4 text-amber-500" />
                Top Movers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {/* Top Gainers */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp className="h-3 w-3 text-emerald-400" />
                    <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Gainers</span>
                  </div>
                  <div className="space-y-1.5">
                    {topGainers.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground italic py-4 text-center">No gainers</p>
                    ) : (
                      topGainers.map((pos, i) => (
                        <motion.div
                          key={pos.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.6 + i * 0.05 }}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/10 hover:bg-emerald-500/10 transition-colors"
                        >
                          <span className="text-xs font-bold">{pos.symbol}</span>
                          <span className="text-xs font-bold font-mono text-emerald-400">
                            +{(pos.pnlPercent || 0).toFixed(2)}%
                          </span>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
                {/* Top Losers */}
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingDown className="h-3 w-3 text-red-400" />
                    <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">Losers</span>
                  </div>
                  <div className="space-y-1.5">
                    {topLosers.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground italic py-4 text-center">No losers</p>
                    ) : (
                      topLosers.map((pos, i) => (
                        <motion.div
                          key={pos.id}
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.6 + i * 0.05 }}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-md bg-red-500/5 border border-red-500/10 hover:bg-red-500/10 transition-colors"
                        >
                          <span className="text-xs font-bold">{pos.symbol}</span>
                          <span className="text-xs font-bold font-mono text-red-400">
                            {(pos.pnlPercent || 0).toFixed(2)}%
                          </span>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Recent Transactions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="lg:col-span-2"
        >
          <Card className="trading-card card-top-accent card-top-accent-sky shadow-sm shadow-black/20 overflow-hidden h-full">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 font-bold tracking-tight">
                <ArrowUpDown className="h-4 w-4 text-sky-500" />
                Recent Transactions
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-bold tabular-nums">
                  {MOCK_TRANSACTIONS.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 px-2 text-muted-foreground font-semibold text-[10px] tracking-wide uppercase">Date</th>
                      <th className="text-left py-2 px-2 text-muted-foreground font-semibold text-[10px] tracking-wide uppercase">Symbol</th>
                      <th className="text-center py-2 px-2 text-muted-foreground font-semibold text-[10px] tracking-wide uppercase">Action</th>
                      <th className="text-right py-2 px-2 text-muted-foreground font-semibold text-[10px] tracking-wide uppercase">Qty</th>
                      <th className="text-right py-2 px-2 text-muted-foreground font-semibold text-[10px] tracking-wide uppercase">Price</th>
                      <th className="text-right py-2 px-2 text-muted-foreground font-semibold text-[10px] tracking-wide uppercase">Total</th>
                      <th className="text-right py-2 px-2 text-muted-foreground font-semibold text-[10px] tracking-wide uppercase">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MOCK_TRANSACTIONS.map((tx, i) => (
                      <motion.tr
                        key={tx.id}
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.65 + i * 0.03 }}
                        className={`border-b border-border/20 hover:bg-muted/20 transition-colors ${
                          tx.action === 'BUY'
                            ? 'border-l-2 border-l-emerald-500/60'
                            : 'border-l-2 border-l-red-500/60'
                        }`}
                      >
                        <td className="py-2 px-2 text-muted-foreground whitespace-nowrap">{tx.date}</td>
                        <td className="py-2 px-2 font-bold tracking-tight">{tx.symbol}</td>
                        <td className="py-2 px-2 text-center">
                          <Badge
                            variant="secondary"
                            className={`text-[9px] px-1.5 py-0 font-bold ${
                              tx.action === 'BUY'
                                ? 'badge-buy-consistent'
                                : 'badge-sell-consistent'
                            }`}
                          >
                            {tx.action}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums tracking-tight">{tx.quantity}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums tracking-tight">₹{tx.price.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums tracking-tight">₹{tx.totalValue.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-2 text-right font-mono tabular-nums tracking-tight">
                          {tx.pnl !== undefined ? (
                            <span className={tx.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                              {tx.pnl >= 0 ? '+' : ''}₹{Math.abs(tx.pnl).toLocaleString('en-IN')}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Total Transaction Value */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                <span className="text-xs text-muted-foreground font-semibold tracking-wide">Total Transaction Value</span>
                <span className="text-sm font-bold font-mono tabular-nums tracking-tight">₹{totalTransactionValue.toLocaleString('en-IN')}</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <GradientDivider />

      {/* Risk Distribution + Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Risk Distribution Donut */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <Card className="trading-card card-top-accent card-top-accent-red shadow-sm shadow-black/20 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 font-bold tracking-tight">
                <Shield className="h-4 w-4 text-amber-500" />
                Risk Distribution
              </CardTitle>
            </CardHeader>
            <CardContent>
              {riskData.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <div className="relative inline-block mb-3">
                    <Shield className="h-12 w-12 opacity-10" />
                  </div>
                  <p className="text-sm font-medium">No positions to analyze risk</p>
                  <p className="text-xs text-muted-foreground mt-1">Open positions to see risk distribution analysis</p>
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <div className="h-[160px] w-[160px] flex-shrink-0 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <defs>
                          <linearGradient id="riskGradientLow" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#34d399" />
                            <stop offset="100%" stopColor="#059669" />
                          </linearGradient>
                          <linearGradient id="riskGradientMed" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#fbbf24" />
                            <stop offset="100%" stopColor="#d97706" />
                          </linearGradient>
                          <linearGradient id="riskGradientHigh" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#f87171" />
                            <stop offset="100%" stopColor="#dc2626" />
                          </linearGradient>
                        </defs>
                        <Pie
                          data={riskData}
                          cx="50%"
                          cy="50%"
                          innerRadius={42}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                          stroke="none"
                          animationBegin={0}
                          animationDuration={800}
                          animationEasing="ease-out"
                        >
                          {riskData.map((entry, index) => {
                            const gradientId = entry.name === 'Low Risk' ? 'riskGradientLow' : entry.name === 'Medium Risk' ? 'riskGradientMed' : 'riskGradientHigh'
                            return <Cell key={`risk-cell-${index}`} fill={`url(#${gradientId})`} />
                          })}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [`₹${value.toLocaleString('en-IN')}`, name]}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px',
                            fontSize: '12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Center Label */}
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Risk</p>
                        <p className="text-sm font-bold tracking-tight">Profile</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 space-y-3">
                    {riskData.map((d) => (
                      <div key={d.name} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-sm flex-shrink-0 ring-1 ring-white/10" style={{ backgroundColor: d.fill }} />
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold tracking-tight">{d.name}</span>
                            <span className="text-xs font-bold font-mono tabular-nums tracking-tight">{d.pct}%</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${d.pct}%`, backgroundColor: d.fill }}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Portfolio Summary Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
        >
          <Card className="trading-card card-top-accent card-top-accent-sky shadow-sm shadow-black/20 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 font-bold tracking-tight">
                <BarChart3 className="h-4 w-4 text-sky-500" />
                Portfolio Stats
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/30 rounded-lg p-3 ring-1 ring-border/20">
                  <p className="text-[10px] text-muted-foreground mb-1 tracking-wide uppercase font-semibold">Total Positions</p>
                  <p className="text-lg font-bold font-mono tabular-nums tracking-tight">{openPositions.length}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 ring-1 ring-border/20">
                  <p className="text-[10px] text-muted-foreground mb-1 tracking-wide uppercase font-semibold">Avg Position Size</p>
                  <p className="text-lg font-bold font-mono tabular-nums tracking-tight">
                    ₹{openPositions.length > 0 ? Math.round(totalInvested / openPositions.length).toLocaleString('en-IN') : '0'}
                  </p>
                </div>
                <div className="bg-emerald-500/5 rounded-lg p-3 ring-1 ring-emerald-500/20">
                  <p className="text-[10px] text-muted-foreground mb-1 tracking-wide uppercase font-semibold">Best Performer</p>
                  <p className="text-lg font-bold text-emerald-400 font-mono tabular-nums tracking-tight">
                    {openPositions.length > 0
                      ? openPositions.reduce((best, p) => (p.pnlPercent || 0) > (best.pnlPercent || 0) ? p : best).symbol
                      : '-'}
                  </p>
                </div>
                <div className="bg-red-500/5 rounded-lg p-3 ring-1 ring-red-500/20">
                  <p className="text-[10px] text-muted-foreground mb-1 tracking-wide uppercase font-semibold">Worst Performer</p>
                  <p className="text-lg font-bold text-red-400 font-mono tabular-nums tracking-tight">
                    {openPositions.length > 0
                      ? openPositions.reduce((worst, p) => (p.pnlPercent || 0) < (worst.pnlPercent || 0) ? p : worst).symbol
                      : '-'}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 ring-1 ring-border/20">
                  <p className="text-[10px] text-muted-foreground mb-1 tracking-wide uppercase font-semibold">Max Position</p>
                  <p className="text-lg font-bold font-mono tabular-nums tracking-tight">
                    {openPositions.length > 0
                      ? openPositions.reduce((max, p) => (p.currentPrice || p.entryPrice) * p.quantity > (max.currentPrice || max.entryPrice) * max.quantity ? p : max).symbol
                      : '-'}
                  </p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3 ring-1 ring-border/20">
                  <p className="text-[10px] text-muted-foreground mb-1 tracking-wide uppercase font-semibold">Sector Diversity</p>
                  <p className="text-lg font-bold font-mono tabular-nums tracking-tight">{sectorData.length} sectors</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
