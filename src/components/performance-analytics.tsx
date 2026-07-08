'use client'

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  Target,
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  Calendar,
  PieChart,
  Shield,
  Zap,
  Trophy,
  Timer,
  IndianRupee,
  Flame,
  Sigma as Alpha,
  Baseline as BetaIcon,
  ChevronDown,
  ChevronUp,
  Gauge,
} from 'lucide-react'
import { motion } from 'framer-motion'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────
type TimePeriod = '1W' | '1M' | '3M' | '6M' | '1Y' | 'ALL'

interface EquityDataPoint {
  date: string
  portfolio: number
  nifty: number
}

interface DrawdownDataPoint {
  date: string
  drawdown: number
}

interface MonthlyReturn {
  month: string
  year: number
  returnPct: number
}

interface TradeStats {
  totalTrades: number
  winningTrades: number
  losingTrades: number
  winRate: number
  avgWin: number
  avgLoss: number
  largestWin: number
  largestLoss: number
  avgHoldingHours: number
  profitFactor: number
}

interface DayWinRate {
  day: string
  winRate: number
  trades: number
}

interface TradeBreakdown {
  id: string
  symbol: string
  action: 'BUY' | 'SELL'
  entry: number
  exit: number
  pnl: number
  pnlPct: number
  entryTime: string
  exitTime: string
  durationHours: number
}

// ─── Helpers ──────────────────────────────────────────────────────
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

function formatPct(pct: number): string {
  const sign = pct >= 0 ? '+' : ''
  return `${sign}${pct.toFixed(2)}%`
}

// ─── Seed-based deterministic random for consistent data ──────────
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ─── Mock Data Generation ─────────────────────────────────────────
function generateEquityData(period: TimePeriod): EquityDataPoint[] {
  const daysMap: Record<TimePeriod, number> = {
    '1W': 7,
    '1M': 30,
    '3M': 90,
    '6M': 180,
    '1Y': 365,
    'ALL': 730,
  }
  const days = daysMap[period]
  const data: EquityDataPoint[] = []
  const rng = seededRandom(42)

  // Portfolio: starts at ₹1,00,000, trends up with realistic pullbacks
  let portfolioValue = 100000
  // NIFTY: starts at 22,000 equivalent scaled to ₹1,00,000
  let niftyValue = 100000

  for (let i = 0; i < days; i++) {
    const date = new Date()
    date.setDate(date.getDate() - (days - 1 - i))
    const dateStr = date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
    })

    // Skip weekends for realism
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    if (isWeekend && days <= 30) {
      // For short periods, still add the point but with same value
      data.push({
        date: dateStr,
        portfolio: Math.round(portfolioValue),
        nifty: Math.round(niftyValue),
      })
      continue
    }

    // Portfolio: slight upward bias with volatility
    const portfolioDailyReturn = (rng() - 0.42) * 0.025 // Slight positive bias
    portfolioValue *= 1 + portfolioDailyReturn

    // NIFTY: slightly lower returns than portfolio
    const niftyDailyReturn = (rng() - 0.44) * 0.018 // Lower bias, lower vol
    niftyValue *= 1 + niftyDailyReturn

    data.push({
      date: dateStr,
      portfolio: Math.round(portfolioValue),
      nifty: Math.round(niftyValue),
    })
  }

  return data
}

function generateDrawdownData(equityData: EquityDataPoint[]): DrawdownDataPoint[] {
  let peak = 0
  return equityData.map((d) => {
    if (d.portfolio > peak) peak = d.portfolio
    const drawdown = ((d.portfolio - peak) / peak) * 100
    return {
      date: d.date,
      drawdown: Math.round(drawdown * 100) / 100,
    }
  })
}

function generateMonthlyReturns(): MonthlyReturn[] {
  const rng = seededRandom(99)
  const months = [
    'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar',
  ]
  return months.map((month, i) => ({
    month,
    year: i < 3 ? 2025 : 2026,
    returnPct: Math.round(((rng() - 0.3) * 12) * 100) / 100, // -3.6% to +8.4%
  }))
}

function generateDayWinRates(): DayWinRate[] {
  return [
    { day: 'Mon', winRate: 62, trades: 28 },
    { day: 'Tue', winRate: 58, trades: 31 },
    { day: 'Wed', winRate: 71, trades: 25 },
    { day: 'Thu', winRate: 55, trades: 33 },
    { day: 'Fri', winRate: 48, trades: 30 },
  ]
}

function generateTradeBreakdown(): TradeBreakdown[] {
  return [
    {
      id: 't1',
      symbol: 'RELIANCE',
      action: 'BUY',
      entry: 2890,
      exit: 2965,
      pnl: 3750,
      pnlPct: 2.59,
      entryTime: '04 Mar 09:45',
      exitTime: '04 Mar 14:20',
      durationHours: 4.58,
    },
    {
      id: 't2',
      symbol: 'HDFCBANK',
      action: 'SELL',
      entry: 1685,
      exit: 1642,
      pnl: 2150,
      pnlPct: 2.55,
      entryTime: '03 Mar 10:15',
      exitTime: '03 Mar 15:10',
      durationHours: 4.92,
    },
    {
      id: 't3',
      symbol: 'TCS',
      action: 'BUY',
      entry: 3920,
      exit: 3865,
      pnl: -2750,
      pnlPct: -1.40,
      entryTime: '02 Mar 11:00',
      exitTime: '02 Mar 14:30',
      durationHours: 3.5,
    },
    {
      id: 't4',
      symbol: 'INFY',
      action: 'BUY',
      entry: 1580,
      exit: 1635,
      pnl: 5500,
      pnlPct: 3.48,
      entryTime: '28 Feb 09:30',
      exitTime: '28 Feb 13:45',
      durationHours: 4.25,
    },
    {
      id: 't5',
      symbol: 'BAJFINANCE',
      action: 'SELL',
      entry: 7250,
      exit: 7380,
      pnl: -6500,
      pnlPct: -1.79,
      entryTime: '27 Feb 10:00',
      exitTime: '27 Feb 15:00',
      durationHours: 5.0,
    },
  ]
}

function generateTradeStats(): TradeStats {
  const totalTrades = 147
  const winningTrades = 89
  const losingTrades = totalTrades - winningTrades
  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate: Math.round((winningTrades / totalTrades) * 10000) / 100,
    avgWin: 4230,
    avgLoss: -2890,
    largestWin: 18750,
    largestLoss: -8320,
    avgHoldingHours: 6.5,
    profitFactor: 1.87,
  }
}

function computePerformanceMetrics(
  equityData: EquityDataPoint[]
) {
  const portfolioValues = equityData.map((d) => d.portfolio)
  const niftyValues = equityData.map((d) => d.nifty)

  // Total Return
  const totalReturn =
    ((portfolioValues[portfolioValues.length - 1] - portfolioValues[0]) /
      portfolioValues[0]) *
    100

  // Benchmark Return
  const benchmarkReturn =
    ((niftyValues[niftyValues.length - 1] - niftyValues[0]) /
      niftyValues[0]) *
    100

  // Daily returns for Sharpe/Sortino
  const dailyReturns: number[] = []
  for (let i = 1; i < portfolioValues.length; i++) {
    dailyReturns.push(
      (portfolioValues[i] - portfolioValues[i - 1]) / portfolioValues[i - 1]
    )
  }

  // NIFTY daily returns for Beta calculation
  const niftyDailyReturns: number[] = []
  for (let i = 1; i < niftyValues.length; i++) {
    niftyDailyReturns.push(
      (niftyValues[i] - niftyValues[i - 1]) / niftyValues[i - 1]
    )
  }

  const avgReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
  const stdDev = Math.sqrt(
    dailyReturns.reduce((sum, r) => sum + (r - avgReturn) ** 2, 0) /
      dailyReturns.length
  )
  const sharpeRatio = stdDev > 0 ? (avgReturn / stdDev) * Math.sqrt(252) : 0

  // Sortino: only downside deviation
  const negativeReturns = dailyReturns.filter((r) => r < 0)
  const downsideStdDev =
    negativeReturns.length > 0
      ? Math.sqrt(
          negativeReturns.reduce((sum, r) => sum + r ** 2, 0) /
            negativeReturns.length
        )
      : 0
  const sortinoRatio =
    downsideStdDev > 0
      ? (avgReturn / downsideStdDev) * Math.sqrt(252)
      : 0

  // Max Drawdown
  let peak = 0
  let maxDrawdown = 0
  for (const val of portfolioValues) {
    if (val > peak) peak = val
    const dd = (val - peak) / peak
    if (dd < maxDrawdown) maxDrawdown = dd
  }

  // Alpha: excess return over benchmark
  const alpha = totalReturn - benchmarkReturn

  // Beta: portfolio volatility relative to NIFTY
  // Beta = Cov(Portfolio, NIFTY) / Var(NIFTY)
  const niftyAvgReturn = niftyDailyReturns.reduce((a, b) => a + b, 0) / niftyDailyReturns.length
  const niftyStdDev = Math.sqrt(
    niftyDailyReturns.reduce((sum, r) => sum + (r - niftyAvgReturn) ** 2, 0) /
      niftyDailyReturns.length
  )
  let beta = 1.0
  if (niftyStdDev > 0 && dailyReturns.length > 0 && niftyDailyReturns.length > 0) {
    const minLen = Math.min(dailyReturns.length, niftyDailyReturns.length)
    let covariance = 0
    let niftyVariance = 0
    for (let i = 0; i < minLen; i++) {
      covariance += (dailyReturns[i] - avgReturn) * (niftyDailyReturns[i] - niftyAvgReturn)
      niftyVariance += (niftyDailyReturns[i] - niftyAvgReturn) ** 2
    }
    covariance /= minLen
    niftyVariance /= minLen
    beta = niftyVariance > 0 ? covariance / niftyVariance : 1.0
  }

  // Calmar Ratio: Annualized Return / |Max Drawdown|
  const tradingDays = equityData.length
  const annualizedReturn = tradingDays > 0
    ? (Math.pow(portfolioValues[portfolioValues.length - 1] / portfolioValues[0], 252 / tradingDays) - 1) * 100
    : 0
  const calmarRatio = Math.abs(maxDrawdown) > 0
    ? annualizedReturn / (Math.abs(maxDrawdown) * 100)
    : 0

  return {
    totalReturn: Math.round(totalReturn * 100) / 100,
    sharpeRatio: Math.round(sharpeRatio * 100) / 100,
    sortinoRatio: Math.round(sortinoRatio * 100) / 100,
    maxDrawdown: Math.round(maxDrawdown * 10000) / 100, // as percentage
    benchmarkReturn: Math.round(benchmarkReturn * 100) / 100,
    alpha: Math.round(alpha * 100) / 100,
    beta: Math.round(beta * 100) / 100,
    calmarRatio: Math.round(calmarRatio * 100) / 100,
  }
}

// ─── Sub-Components ───────────────────────────────────────────────

// Performance Summary Card
function MetricCard({
  icon: Icon,
  label,
  value,
  subValue,
  positive,
  delay = 0,
}: {
  icon: React.ElementType
  label: string
  value: string
  subValue?: string
  positive?: boolean
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: 'easeOut' }}
    >
      <Card className="bg-zinc-900/80 border-zinc-800 hover:border-zinc-700 transition-colors">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div
                className={`p-1.5 rounded-md ${
                  positive === true
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : positive === false
                    ? 'bg-red-500/10 text-red-400'
                    : 'bg-zinc-700/50 text-zinc-400'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
                {label}
              </span>
            </div>
            {positive !== undefined && (
              <Badge
                variant="outline"
                className={`text-[10px] px-1.5 py-0 h-5 font-mono ${
                  positive
                    ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5'
                    : 'border-red-500/30 text-red-400 bg-red-500/5'
                }`}
              >
                {positive ? (
                  <ArrowUpRight className="h-2.5 w-2.5 mr-0.5" />
                ) : (
                  <ArrowDownRight className="h-2.5 w-2.5 mr-0.5" />
                )}
                {positive ? 'Profit' : 'Loss'}
              </Badge>
            )}
          </div>
          <div
            className={`text-xl font-bold font-mono tracking-tight ${
              positive === true
                ? 'text-emerald-400'
                : positive === false
                ? 'text-red-400'
                : 'text-zinc-100'
            }`}
          >
            {value}
          </div>
          {subValue && (
            <div className="text-[11px] text-zinc-500 mt-1 font-mono">
              {subValue}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}

// Time Period Selector
function PeriodSelector({
  active,
  onChange,
}: {
  active: TimePeriod
  onChange: (p: TimePeriod) => void
}) {
  const periods: TimePeriod[] = ['1W', '1M', '3M', '6M', '1Y', 'ALL']
  return (
    <div className="flex gap-1.5">
      {periods.map((p) => (
        <Button
          key={p}
          variant="ghost"
          size="sm"
          onClick={() => onChange(p)}
          className={`h-7 px-3 text-xs font-mono font-medium rounded-md transition-all ${
            active === p
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 hover:text-emerald-400'
              : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 border border-transparent'
          }`}
        >
          {p}
        </Button>
      ))}
    </div>
  )
}

// Custom Tooltip for Equity Curve
function EquityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number; color: string; name: string }>
  label?: string
}) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-zinc-400 mb-2 font-mono">{label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-zinc-400 text-xs">{entry.name}:</span>
          <span className="font-mono font-semibold text-zinc-100">
            {formatINR(entry.value)}
          </span>
        </div>
      ))}
    </div>
  )
}

// Custom Tooltip for Drawdown
function DrawdownTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: Array<{ value: number }>
  label?: string
}) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 shadow-xl">
      <p className="text-xs text-zinc-400 mb-1 font-mono">{label}</p>
      <p className="font-mono font-semibold text-red-400 text-sm">
        {formatPct(payload[0].value)}
      </p>
    </div>
  )
}

// Monthly Returns Heatmap Cell
function HeatmapCell({ month, returnPct }: { month: string; returnPct: number }) {
  const isPositive = returnPct >= 0
  const intensity = Math.min(Math.abs(returnPct) / 8, 1) // Max at 8%+
  const bg = isPositive
    ? `rgba(16, 185, 129, ${0.1 + intensity * 0.5})`
    : `rgba(239, 68, 68, ${0.1 + intensity * 0.5})`
  const border = isPositive
    ? `rgba(16, 185, 129, ${0.15 + intensity * 0.3})`
    : `rgba(239, 68, 68, ${0.15 + intensity * 0.3})`

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center rounded-lg p-3 min-w-[80px]"
      style={{ backgroundColor: bg, border: `1px solid ${border}` }}
    >
      <span className="text-[11px] text-zinc-400 font-medium">{month}</span>
      <span
        className={`text-sm font-bold font-mono mt-0.5 ${
          isPositive ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {formatPct(returnPct)}
      </span>
    </motion.div>
  )
}

// ─── Main Component ───────────────────────────────────────────────
export function PerformanceAnalytics() {
  const [activePeriod, setActivePeriod] = useState<TimePeriod>('1M')
  const [tradesExpanded, setTradesExpanded] = useState(false)

  // Generate data based on selected period
  const equityData = useMemo(() => generateEquityData(activePeriod), [activePeriod])
  const drawdownData = useMemo(() => generateDrawdownData(equityData), [equityData])
  const monthlyReturns = useMemo(() => generateMonthlyReturns(), [])
  const tradeStats = useMemo(() => generateTradeStats(), [])
  const metrics = useMemo(() => computePerformanceMetrics(equityData), [equityData])
  const dayWinRates = useMemo(() => generateDayWinRates(), [])
  const tradeBreakdown = useMemo(() => generateTradeBreakdown(), [])

  // Determine how many X-axis ticks to show based on period
  const tickInterval = useMemo(() => {
    const len = equityData.length
    if (len <= 10) return 1
    if (len <= 35) return 5
    if (len <= 100) return 14
    return 30
  }, [equityData.length])

  return (
    <div className="space-y-4">
      {/* Header with Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-400" />
            Performance Analytics
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Portfolio performance vs NIFTY 50 benchmark
          </p>
        </div>
        <PeriodSelector active={activePeriod} onChange={setActivePeriod} />
      </div>

      {/* A. Performance Summary Cards - Row 1 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={TrendingUp}
          label="Total Return"
          value={formatPct(metrics.totalReturn)}
          subValue={`NIFTY 50: ${formatPct(metrics.benchmarkReturn)}`}
          positive={metrics.totalReturn >= 0}
          delay={0}
        />
        <MetricCard
          icon={Target}
          label="Sharpe Ratio"
          value={metrics.sharpeRatio.toFixed(2)}
          subValue="Risk-adjusted return"
          positive={metrics.sharpeRatio > 1}
          delay={0.05}
        />
        <MetricCard
          icon={ArrowDownRight}
          label="Max Drawdown"
          value={formatPct(metrics.maxDrawdown)}
          subValue="Peak-to-trough decline"
          positive={false}
          delay={0.1}
        />
        <MetricCard
          icon={Shield}
          label="Sortino Ratio"
          value={metrics.sortinoRatio.toFixed(2)}
          subValue="Downside risk-adjusted"
          positive={metrics.sortinoRatio > 1}
          delay={0.15}
        />
      </div>

      {/* A2. Performance Summary Cards - Row 2: Alpha, Beta, Calmar */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <MetricCard
          icon={Alpha}
          label="Alpha"
          value={formatPct(metrics.alpha)}
          subValue="Excess return over NIFTY"
          positive={metrics.alpha >= 0}
          delay={0.2}
        />
        <MetricCard
          icon={BetaIcon}
          label="Beta"
          value={metrics.beta.toFixed(2)}
          subValue="Volatility vs NIFTY 50"
          positive={metrics.beta < 1.2}
          delay={0.25}
        />
        <MetricCard
          icon={Gauge}
          label="Calmar Ratio"
          value={metrics.calmarRatio.toFixed(2)}
          subValue="Return / Max Drawdown"
          positive={metrics.calmarRatio > 1}
          delay={0.3}
        />
      </div>

      {/* B. Equity Curve Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.5 }}
      >
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                Equity Curve
              </CardTitle>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 rounded bg-emerald-400" />
                  <span className="text-zinc-500 font-mono">Portfolio</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-0.5 rounded bg-amber-400" />
                  <span className="text-zinc-500 font-mono">NIFTY 50</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={equityData}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(63,63,70,0.4)"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#3f3f46' }}
                    tickLine={{ stroke: '#3f3f46' }}
                    interval={tickInterval}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#3f3f46' }}
                    tickLine={{ stroke: '#3f3f46' }}
                    tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}K`}
                    domain={['auto', 'auto']}
                  />
                  <Tooltip content={<EquityTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="portfolio"
                    name="Portfolio"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#10b981', stroke: '#064e3b', strokeWidth: 2 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="nifty"
                    name="NIFTY 50"
                    stroke="#f59e0b"
                    strokeWidth={1.5}
                    dot={false}
                    strokeDasharray="4 2"
                    activeDot={{ r: 3, fill: '#f59e0b', stroke: '#78350f', strokeWidth: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* C. Drawdown Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.5 }}
      >
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4 text-red-400" />
              Drawdown
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <div className="h-[100px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={drawdownData}
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(63,63,70,0.3)"
                  />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: '#52525b', fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#3f3f46' }}
                    tickLine={false}
                    interval={tickInterval}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: '#52525b', fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                    domain={['auto', 0]}
                  />
                  <Tooltip content={<DrawdownTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="drawdown"
                    stroke="#ef4444"
                    strokeWidth={1.5}
                    fill="url(#drawdownGradient)"
                  />
                  <defs>
                    <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* D. Monthly Returns Heatmap + E. Trade Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Returns Heatmap */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.5 }}
        >
          <Card className="bg-zinc-900/80 border-zinc-800 h-full">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-emerald-400" />
                Monthly Returns
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex flex-wrap gap-2">
                {monthlyReturns.map((mr, i) => (
                  <HeatmapCell
                    key={i}
                    month={`${mr.month} ${mr.year}`}
                    returnPct={mr.returnPct}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3 mt-3 text-[10px] text-zinc-500">
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm bg-red-500/30" />
                  <span>Negative</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm bg-zinc-700/50" />
                  <span>Neutral</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500/30" />
                  <span>Positive</span>
                </div>
                <span className="ml-auto font-mono">Intensity = Magnitude</span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Trade Statistics Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <Card className="bg-zinc-900/80 border-zinc-800 h-full">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <PieChart className="h-4 w-4 text-emerald-400" />
                Trade Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                <StatRow
                  icon={<Zap className="h-3.5 w-3.5 text-zinc-500" />}
                  label="Total Trades"
                  value={String(tradeStats.totalTrades)}
                />
                <StatRow
                  icon={<Trophy className="h-3.5 w-3.5 text-emerald-500" />}
                  label="Winning Trades"
                  value={`${tradeStats.winningTrades} (${tradeStats.winRate}%)`}
                  valueColor="text-emerald-400"
                />
                <StatRow
                  icon={<Flame className="h-3.5 w-3.5 text-red-500" />}
                  label="Losing Trades"
                  value={`${tradeStats.losingTrades} (${(100 - tradeStats.winRate).toFixed(2)}%)`}
                  valueColor="text-red-400"
                />
                <StatRow
                  icon={<TrendingUp className="h-3.5 w-3.5 text-emerald-500" />}
                  label="Avg Win"
                  value={formatINRWithSign(tradeStats.avgWin)}
                  valueColor="text-emerald-400"
                />
                <StatRow
                  icon={<TrendingDown className="h-3.5 w-3.5 text-red-500" />}
                  label="Avg Loss"
                  value={formatINRWithSign(tradeStats.avgLoss)}
                  valueColor="text-red-400"
                />
                <StatRow
                  icon={<IndianRupee className="h-3.5 w-3.5 text-emerald-500" />}
                  label="Largest Win"
                  value={formatINRWithSign(tradeStats.largestWin)}
                  valueColor="text-emerald-400"
                />
                <StatRow
                  icon={<IndianRupee className="h-3.5 w-3.5 text-red-500" />}
                  label="Largest Loss"
                  value={formatINRWithSign(tradeStats.largestLoss)}
                  valueColor="text-red-400"
                />
                <StatRow
                  icon={<Timer className="h-3.5 w-3.5 text-zinc-500" />}
                  label="Avg Holding"
                  value={`${tradeStats.avgHoldingHours} hours`}
                />
                <StatRow
                  icon={<Target className="h-3.5 w-3.5 text-amber-500" />}
                  label="Profit Factor"
                  value={tradeStats.profitFactor.toFixed(2)}
                  valueColor="text-amber-400"
                />
              </div>

              <Separator className="bg-zinc-800 my-3" />

              {/* Win Rate Visual Bar */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500">Win Rate Distribution</span>
                  <span className="font-mono text-emerald-400">{tradeStats.winRate}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${tradeStats.winRate}%` }}
                    transition={{ delay: 0.6, duration: 0.8, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-full"
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-600 font-mono">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* F. Win Rate by Day of Week */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.5 }}
      >
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-400" />
              Win Rate by Day of Week
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-2">
            <div className="h-[160px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={dayWinRates}
                  margin={{ top: 10, right: 20, left: 0, bottom: 5 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(63,63,70,0.3)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="day"
                    tick={{ fontSize: 11, fill: '#a1a1aa', fontFamily: 'monospace' }}
                    axisLine={{ stroke: '#3f3f46' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#71717a', fontFamily: 'monospace' }}
                    axisLine={false}
                    tickLine={false}
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#18181b',
                      border: '1px solid #3f3f46',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => {
                      if (name === 'winRate') return [`${value}%`, 'Win Rate']
                      return [value, name]
                    }}
                    labelFormatter={(label: string) => {
                      const day = dayWinRates.find((d) => d.day === label)
                      return day ? `${label} (${day.trades} trades)` : label
                    }}
                  />
                  <Bar
                    dataKey="winRate"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                    fill="#10b981"
                    fillOpacity={0.8}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-between mt-2 px-1 text-[10px] text-zinc-600">
              <span>Best: Wednesday (71%)</span>
              <span className="text-zinc-500">Avg: 58.8%</span>
              <span>Worst: Friday (48%)</span>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* G. Trade-Level Breakdown (Expandable) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.5 }}
      >
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader
            className="pb-2 pt-4 px-4 cursor-pointer select-none hover:bg-zinc-800/40 transition-colors rounded-t-lg"
            onClick={() => setTradesExpanded(!tradesExpanded)}
          >
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-zinc-300 flex items-center gap-2">
                <Activity className="h-4 w-4 text-emerald-400" />
                Recent Trade Breakdown
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-zinc-700 text-zinc-400">
                  Last 5
                </Badge>
              </CardTitle>
              <motion.div
                animate={{ rotate: tradesExpanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown className="h-4 w-4 text-zinc-500" />
              </motion.div>
            </div>
          </CardHeader>
          {tradesExpanded && (
            <CardContent className="px-4 pb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left py-2 px-2 text-zinc-500 font-medium">Symbol</th>
                      <th className="text-left py-2 px-2 text-zinc-500 font-medium">Action</th>
                      <th className="text-right py-2 px-2 text-zinc-500 font-medium">Entry</th>
                      <th className="text-right py-2 px-2 text-zinc-500 font-medium">Exit</th>
                      <th className="text-right py-2 px-2 text-zinc-500 font-medium">P&L</th>
                      <th className="text-right py-2 px-2 text-zinc-500 font-medium">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradeBreakdown.map((trade) => (
                      <tr
                        key={trade.id}
                        className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                      >
                        <td className="py-2 px-2 font-medium text-zinc-200">{trade.symbol}</td>
                        <td className="py-2 px-2">
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${
                              trade.action === 'BUY'
                                ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/5'
                                : 'border-red-500/30 text-red-400 bg-red-500/5'
                            }`}
                          >
                            {trade.action}
                          </Badge>
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-zinc-400">₹{trade.entry.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-2 text-right font-mono text-zinc-400">₹{trade.exit.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-2 text-right">
                          <span className={`font-mono font-semibold ${trade.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {trade.pnl >= 0 ? '+' : ''}₹{Math.abs(trade.pnl).toLocaleString('en-IN')}
                          </span>
                          <span className={`ml-1 text-[10px] ${trade.pnlPct >= 0 ? 'text-emerald-400/60' : 'text-red-400/60'}`}>
                            ({trade.pnlPct >= 0 ? '+' : ''}{trade.pnlPct.toFixed(2)}%)
                          </span>
                        </td>
                        <td className="py-2 px-2 text-right font-mono text-zinc-500">
                          {trade.durationHours.toFixed(1)}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-zinc-800/50 text-[10px] text-zinc-600">
                <span>Net P&L: <span className={`font-mono font-semibold ${tradeBreakdown.reduce((s, t) => s + t.pnl, 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatINRWithSign(tradeBreakdown.reduce((s, t) => s + t.pnl, 0))}</span></span>
                <span>Avg Duration: {(tradeBreakdown.reduce((s, t) => s + t.durationHours, 0) / tradeBreakdown.length).toFixed(1)}h</span>
              </div>
            </CardContent>
          )}
        </Card>
      </motion.div>
    </div>
  )
}

// Small stat row component for the trade statistics table
function StatRow({
  icon,
  label,
  value,
  valueColor = 'text-zinc-100',
}: {
  icon: React.ReactNode
  label: string
  value: string
  valueColor?: string
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-xs text-zinc-500">{label}</span>
      </div>
      <span className={`text-xs font-mono font-semibold ${valueColor}`}>
        {value}
      </span>
    </div>
  )
}
