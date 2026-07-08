'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTradingStore } from '@/lib/store/trading-store'
import type { Position } from '@/lib/types/trading'
import {
  History,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  IndianRupee,
  BarChart3,
  Trophy,
  Flame,
  Calendar,
  Filter,
  Target,
  ShieldAlert,
  Timer,
  PieChart as PieChartIcon,
  Zap,
  Activity,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Cell as RechartsCell, Legend } from 'recharts'

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

type CalendarDay = {
  date: Date
  dayStr: string
  dayNum: number
  pnl: number
  isWeekend: boolean
  isToday: boolean
}

// Generate mock 30-day P&L calendar data
function generateCalendarData(): CalendarDay[] {
  const data: CalendarDay[] = []
  for (let i = 29; i >= 0; i--) {
    const date = new Date()
    date.setDate(date.getDate() - i)
    const isWeekend = date.getDay() === 0 || date.getDay() === 6
    const pnl = isWeekend ? 0 : Math.round((Math.random() - 0.35) * 3000)
    data.push({
      date,
      dayStr: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      dayNum: date.getDate(),
      pnl,
      isWeekend,
      isToday: i === 0,
    })
  }
  return data
}

const calendarData = generateCalendarData()

// Colors for the calendar heatmap - improved scale
function getPnlColor(pnl: number, isWeekend: boolean, isToday: boolean): string {
  if (isToday) {
    if (pnl > 1000) return 'bg-emerald-400 ring-2 ring-emerald-400/50'
    if (pnl > 0) return 'bg-emerald-400/70 ring-2 ring-emerald-400/30'
    if (pnl > -500) return 'bg-red-400/40 ring-2 ring-red-400/30'
    return 'bg-red-400 ring-2 ring-red-400/50'
  }
  if (isWeekend) return 'bg-muted/20'
  if (pnl === 0) return 'bg-muted/40'
  if (pnl > 2000) return 'bg-emerald-500/90'
  if (pnl > 1000) return 'bg-emerald-500/65'
  if (pnl > 500) return 'bg-emerald-500/45'
  if (pnl > 0) return 'bg-emerald-500/25'
  if (pnl > -500) return 'bg-red-500/20'
  if (pnl > -1000) return 'bg-red-500/40'
  if (pnl > -2000) return 'bg-red-500/60'
  return 'bg-red-500/80'
}

// Gradient divider component
function GradientDivider() {
  return <div className="h-px bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />
}

export function TradeHistory() {
  const { positions, signals } = useTradingStore()

  const closedPositions = positions.filter((p) => p.status === 'closed')
  const executedSignals = signals.filter((s) => s.status === 'executed' || s.status === 'closed')

  // Analytics
  const totalTrades = closedPositions.length
  const wins = closedPositions.filter((p) => (p.pnl || 0) > 0)
  const losses = closedPositions.filter((p) => (p.pnl || 0) < 0)
  const breakeven = closedPositions.filter((p) => (p.pnl || 0) === 0)
  const winRate = totalTrades > 0 ? Math.round((wins.length / totalTrades) * 100) : 0
  const totalPnl = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0)
  const avgPnl = totalTrades > 0 ? totalPnl / totalTrades : 0
  const bestTrade = closedPositions.length > 0
    ? closedPositions.reduce((best, p) => (p.pnl || 0) > (best.pnl || 0) ? p : best)
    : null
  const worstTrade = closedPositions.length > 0
    ? closedPositions.reduce((worst, p) => (p.pnl || 0) < (worst.pnl || 0) ? p : worst)
    : null

  // Consecutive wins
  let maxStreak = 0
  let currentStreak = 0
  closedPositions.forEach((p) => {
    if ((p.pnl || 0) >= 0) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else {
      currentStreak = 0
    }
  })

  // Daily P&L data for the last 7 days
  const dailyPnl = Array.from({ length: 7 }, (_, i) => {
    const date = new Date()
    date.setDate(date.getDate() - (6 - i))
    const dayStr = date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
    const dayPnl = closedPositions
      .filter((p) => {
        if (!p.closedAt) return false
        const closedDate = new Date(p.closedAt)
        return closedDate.toDateString() === date.toDateString()
      })
      .reduce((sum, p) => sum + (p.pnl || 0), 0)
    return { day: dayStr, pnl: dayPnl }
  })

  // Trade accuracy pie chart data
  const accuracyData = [
    { name: 'Wins', value: Math.max(wins.length, 3), fill: '#10b981' },
    { name: 'Losses', value: Math.max(losses.length, 2), fill: '#ef4444' },
    { name: 'Breakeven', value: Math.max(breakeven.length, 1), fill: '#6b7280' },
  ]

  // If no closed positions, use mock data for display
  const hasRealData = closedPositions.length > 0

  // Trade Stats summary bar
  const tradeStats = [
    { label: 'Total Trades', value: `${totalTrades}`, icon: History, color: 'text-sky-400', bg: 'bg-sky-500/10' },
    { label: 'Win Rate', value: `${winRate}%`, icon: Trophy, color: winRate >= 60 ? 'text-emerald-400' : winRate >= 40 ? 'text-amber-400' : 'text-red-400', bg: winRate >= 60 ? 'bg-emerald-500/10' : winRate >= 40 ? 'bg-amber-500/10' : 'bg-red-500/10' },
    { label: 'Total P&L', value: formatINRWithSign(totalPnl), icon: IndianRupee, color: totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400', bg: totalPnl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10' },
    { label: 'Avg P&L', value: formatINRWithSign(Math.round(avgPnl)), icon: BarChart3, color: avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400', bg: avgPnl >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10' },
  ]

  const analyticsCards = [
    {
      title: 'Win Rate',
      value: `${winRate}%`,
      icon: Trophy,
      color: winRate >= 60 ? 'text-emerald-400' : winRate >= 40 ? 'text-amber-400' : 'text-red-400',
      bg: winRate >= 60 ? 'from-emerald-500/15' : winRate >= 40 ? 'from-amber-500/15' : 'from-red-500/15',
      accent: winRate >= 60 ? 'emerald' : winRate >= 40 ? 'amber' : 'red',
      accentClass: winRate >= 60 ? 'card-top-accent card-top-accent-emerald' : winRate >= 40 ? 'card-top-accent card-top-accent-amber' : 'card-top-accent card-top-accent-red',
    },
    {
      title: 'Total P&L',
      value: formatINRWithSign(totalPnl),
      icon: IndianRupee,
      color: totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
      bg: totalPnl >= 0 ? 'from-emerald-500/15' : 'from-red-500/15',
      accent: totalPnl >= 0 ? 'emerald' : 'red',
      accentClass: totalPnl >= 0 ? 'card-top-accent card-top-accent-emerald' : 'card-top-accent card-top-accent-red',
    },
    {
      title: 'Avg P&L',
      value: formatINRWithSign(Math.round(avgPnl)),
      icon: BarChart3,
      color: avgPnl >= 0 ? 'text-emerald-400' : 'text-red-400',
      bg: avgPnl >= 0 ? 'from-emerald-500/15' : 'from-red-500/15',
      accent: avgPnl >= 0 ? 'emerald' : 'red',
      accentClass: avgPnl >= 0 ? 'card-top-accent card-top-accent-emerald' : 'card-top-accent card-top-accent-red',
    },
    {
      title: 'Win Streak',
      value: `${maxStreak}`,
      icon: Flame,
      color: 'text-amber-400',
      bg: 'from-amber-500/15',
      accent: 'amber',
      accentClass: 'card-top-accent card-top-accent-amber',
    },
  ]

  // Performance metrics (mock values as specified)
  const performanceMetrics = [
    {
      title: 'Sharpe Ratio',
      value: '1.8',
      icon: Target,
      description: 'Risk-adjusted return',
      color: 'text-emerald-400',
      bg: 'from-emerald-500/15',
      accent: 'emerald',
      accentClass: 'card-top-accent card-top-accent-emerald',
    },
    {
      title: 'Max Drawdown',
      value: '-4.2%',
      icon: ShieldAlert,
      description: 'Largest peak-to-trough decline',
      color: 'text-red-400',
      bg: 'from-red-500/15',
      accent: 'red',
      accentClass: 'card-top-accent card-top-accent-red',
    },
    {
      title: 'Profit Factor',
      value: '2.1',
      icon: Zap,
      description: 'Gross profit / gross loss',
      color: 'text-amber-400',
      bg: 'from-amber-500/15',
      accent: 'amber',
      accentClass: 'card-top-accent card-top-accent-amber',
    },
    {
      title: 'Avg Hold Time',
      value: '2.3h',
      icon: Timer,
      description: 'Average trade duration',
      color: 'text-sky-400',
      bg: 'from-sky-500/15',
      accent: 'sky',
      accentClass: 'card-top-accent card-top-accent-sky',
    },
  ]

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
          <h2 className="text-2xl font-bold gradient-text tracking-tight">Trade History</h2>
          <p className="text-xs text-muted-foreground mt-1">Performance analytics & trade records</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px] px-2.5 py-1 font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Activity className="h-3 w-3 mr-1" />
            {totalTrades} Trades
          </Badge>
        </div>
      </motion.div>

      {/* Trade Stats Summary Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass-card p-1"
      >
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-1">
          {tradeStats.map((stat, i) => (
            <div key={stat.label} className={`flex items-center gap-3 rounded-md px-3 py-2.5 ${stat.bg}`}>
              <stat.icon className={`h-4 w-4 ${stat.color} flex-shrink-0`} />
              <div className="min-w-0">
                <p className="text-[10px] text-muted-foreground truncate">{stat.label}</p>
                <p className={`text-sm font-bold font-mono ${stat.color} truncate`}>{stat.value}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {analyticsCards.map((card, i) => (
          <motion.div
            key={card.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 + 0.15 }}
          >
            <Card className={`trading-card card-shine card-top-accent ${card.accentClass} overflow-hidden shadow-sm shadow-black/20`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${card.bg} via-transparent to-transparent`} />
              <CardContent className="p-4 relative">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground font-medium">{card.title}</span>
                  <card.icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <div className={`metric-value-sm font-mono ${card.color}`}>{card.value}</div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {performanceMetrics.map((metric, i) => (
          <motion.div
            key={metric.title}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 + 0.3 }}
          >
            <Card className={`trading-card card-top-accent ${metric.accentClass} overflow-hidden shadow-sm shadow-black/20`}>
              <div className={`absolute inset-0 bg-gradient-to-br ${metric.bg} via-transparent to-transparent`} />
              <CardContent className="p-3 relative">
                <div className="flex items-center gap-2 mb-1">
                  <metric.icon className={`h-3.5 w-3.5 ${metric.color}`} />
                  <span className="text-[10px] text-muted-foreground font-medium">{metric.title}</span>
                </div>
                <div className={`text-xl font-bold font-mono ${metric.color}`}>{metric.value}</div>
                <p className="text-[9px] text-muted-foreground mt-0.5">{metric.description}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <GradientDivider />

      {/* Monthly P&L Calendar + Trade Accuracy Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 30-Day P&L Calendar Heatmap */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="trading-card card-top-accent card-top-accent-emerald shadow-sm shadow-black/20 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-emerald-500" />
                30-Day P&L Calendar
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Day labels */}
              <div className="grid grid-cols-7 gap-1.5 mb-1.5">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <div key={i} className="text-center text-[10px] text-muted-foreground font-semibold">{d}</div>
                ))}
              </div>
              {/* Calendar grid - larger cells */}
              <div className="grid grid-cols-7 gap-1.5">
                {/* Padding for first day */}
                {Array.from({ length: (calendarData[0]?.date.getDay() || 0 - 1 + 7) % 7 }, (_, i) => (
                  <div key={`pad-${i}`} className="aspect-square" />
                ))}
                {calendarData.map((day, i) => (
                  <div
                    key={i}
                    className={`group relative aspect-square rounded-md ${getPnlColor(day.pnl, day.isWeekend, day.isToday)} cursor-default transition-all duration-150 hover:scale-110 hover:ring-1 hover:ring-ring/30 flex items-center justify-center`}
                  >
                    <span className="text-[9px] text-muted-foreground/70 font-medium">{day.dayNum}</span>
                    {/* Tooltip on hover with ₹ values */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block z-20">
                      <div className="bg-popover text-popover-foreground text-[11px] px-2.5 py-1.5 rounded-md shadow-lg border border-border whitespace-nowrap font-mono">
                        <div className="font-semibold">{day.dayStr}</div>
                        <div className={day.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                          {day.pnl >= 0 ? '+' : ''}{formatINR(day.pnl)}
                        </div>
                      </div>
                    </div>
                    {/* Today indicator */}
                    {day.isToday && (
                      <div className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-sky-400 ring-1 ring-sky-400/50" />
                    )}
                  </div>
                ))}
              </div>

              {/* Legend - improved */}
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/30">
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    <div className="w-3 h-3 rounded-sm bg-red-500/60" />
                    <div className="w-3 h-3 rounded-sm bg-red-500/30" />
                  </div>
                  <span className="text-[10px] text-muted-foreground">Loss</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-sm bg-muted/40" />
                  <span className="text-[10px] text-muted-foreground">Neutral</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="flex gap-0.5">
                    <div className="w-3 h-3 rounded-sm bg-emerald-500/30" />
                    <div className="w-3 h-3 rounded-sm bg-emerald-500/60" />
                  </div>
                  <span className="text-[10px] text-muted-foreground">Profit</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                  <span className="text-[10px] text-muted-foreground">Today</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Trade Accuracy Pie Chart */}
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
        >
          <Card className="trading-card card-top-accent card-top-accent-amber shadow-sm shadow-black/20 overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <PieChartIcon className="h-4 w-4 text-amber-500" />
                Trade Accuracy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] relative">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <defs>
                      <linearGradient id="winGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#34d399" />
                        <stop offset="100%" stopColor="#059669" />
                      </linearGradient>
                      <linearGradient id="lossGrad" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#f87171" />
                        <stop offset="100%" stopColor="#dc2626" />
                      </linearGradient>
                    </defs>
                    <Pie
                      data={accuracyData}
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
                      {accuracyData.map((entry, index) => {
                        const fill = entry.name === 'Wins' ? 'url(#winGrad)' : entry.name === 'Losses' ? 'url(#lossGrad)' : entry.fill
                        return <RechartsCell key={`acc-cell-${index}`} fill={fill} />
                      })}
                    </Pie>
                    <Tooltip
                      formatter={(value: number, name: string) => [`${value} trades`, name]}
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
                {/* Center Label - Improved */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-3xl font-bold font-mono text-emerald-400">{winRate}%</p>
                    <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Win Rate</p>
                  </div>
                </div>
              </div>

              {/* Legend - better spacing */}
              <div className="flex items-center justify-center gap-6 mt-3">
                {accuracyData.map((d) => (
                  <div key={d.name} className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-sm ring-1 ring-white/10" style={{ backgroundColor: d.fill }} />
                    <span className="text-xs text-muted-foreground">{d.name}</span>
                    <span className="text-xs font-bold font-mono">{d.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <GradientDivider />

      {/* Daily P&L Chart */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
      >
        <Card className="trading-card card-top-accent card-top-accent-emerald shadow-sm shadow-black/20 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-500" />
              Daily P&L (Last 7 Days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyPnl} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                  <defs>
                    <linearGradient id="barProfitGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                    <linearGradient id="barLossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f87171" />
                      <stop offset="100%" stopColor="#dc2626" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `₹${v}`} width={55} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
                    formatter={(value: number) => [`₹${value.toLocaleString('en-IN')}`, 'P&L']}
                  />
                  <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                    {dailyPnl.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? 'url(#barProfitGrad)' : 'url(#barLossGrad)'} fillOpacity={0.85} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Best & Worst Trades */}
      {(bestTrade || worstTrade) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {bestTrade && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.55 }}
            >
              <Card className="trading-card card-top-accent card-top-accent-emerald border-emerald-500/20 bg-emerald-500/5 shadow-sm shadow-black/20 overflow-hidden glow-emerald">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/15 rounded">Best Trade</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold font-mono">{bestTrade.symbol}</div>
                      <div className="text-xs text-muted-foreground">{bestTrade.action} · {bestTrade.quantity} qty</div>
                    </div>
                    <div className="text-emerald-400 font-bold font-mono text-lg">
                      {formatINRWithSign(bestTrade.pnl || 0)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
          {worstTrade && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.55 }}
            >
              <Card className="trading-card card-top-accent card-top-accent-red border-red-500/20 bg-red-500/5 shadow-sm shadow-black/20 overflow-hidden glow-red">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingDown className="h-4 w-4 text-red-400" />
                    <span className="text-xs font-bold text-red-400 px-2 py-0.5 bg-red-500/15 rounded">Worst Trade</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-bold font-mono">{worstTrade.symbol}</div>
                      <div className="text-xs text-muted-foreground">{worstTrade.action} · {worstTrade.quantity} qty</div>
                    </div>
                    <div className="text-red-400 font-bold font-mono text-lg">
                      {formatINRWithSign(worstTrade.pnl || 0)}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </div>
      )}

      <GradientDivider />

      {/* Trade History Table */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <Card className="trading-card card-top-accent card-top-accent-amber shadow-sm shadow-black/20 overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <History className="h-4 w-4 text-amber-500" />
              Trade History
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5 font-bold">
                {closedPositions.length} trades
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {closedPositions.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <div className="relative inline-block mb-4">
                  <History className="h-16 w-16 opacity-10" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <BarChart3 className="h-6 w-6 opacity-40" />
                  </div>
                </div>
                <p className="text-lg font-semibold mb-1">No trade history yet</p>
                <p className="text-sm mb-4 max-w-xs mx-auto">Closed positions will appear here with detailed P&L data and performance analytics.</p>
                <Button variant="outline" size="sm" className="text-xs gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10">
                  <Filter className="h-3 w-3" />
                  View All Signals
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[300px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card z-10">
                    <tr className="border-b border-border">
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">Symbol</th>
                      <th className="text-left py-2.5 px-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">Action</th>
                      <th className="text-right py-2.5 px-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">Qty</th>
                      <th className="text-right py-2.5 px-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">Entry</th>
                      <th className="text-right py-2.5 px-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">Exit</th>
                      <th className="text-right py-2.5 px-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">P&L</th>
                      <th className="text-right py-2.5 px-3 text-muted-foreground font-semibold text-[11px] uppercase tracking-wider">Closed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {closedPositions.map((pos, i) => {
                      const isProfit = (pos.pnl || 0) >= 0
                      return (
                        <motion.tr
                          key={pos.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.03 }}
                          className="data-row border-b border-border/30 transition-colors"
                        >
                          <td className="py-2.5 px-3 font-semibold font-mono">{pos.symbol}</td>
                          <td className="py-2.5 px-3">
                            <Badge
                              variant="secondary"
                              className={`text-[10px] px-2 py-0.5 font-bold ${pos.action === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}
                            >
                              {pos.action}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs">{pos.quantity}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs">₹{pos.entryPrice.toLocaleString('en-IN')}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-xs">₹{(pos.currentPrice || pos.entryPrice).toLocaleString('en-IN')}</td>
                          <td className={`py-2.5 px-3 text-right font-bold font-mono text-xs ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatINRWithSign(pos.pnl || 0)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-xs text-muted-foreground">
                            {pos.closedAt ? new Date(pos.closedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'}
                          </td>
                        </motion.tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  )
}
