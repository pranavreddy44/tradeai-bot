'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SignalCard } from '@/components/signal-card'
import { useTradingStore } from '@/lib/store/trading-store'
import { mockSignals } from '@/lib/mock-data'
import { Sparkles, Filter, Activity, Brain, Radio, Zap, BarChart3, TrendingUp, ArrowUpDown, Signal, Download } from 'lucide-react'
import type { TradeSignal } from '@/lib/types/trading'
import { motion } from 'framer-motion'
import { quickExportCSV } from '@/components/export-dialog'
import { toast } from 'sonner'

type FilterType = 'all' | 'ai' | 'telegram' | 'executed' | 'pending'

interface SignalListProps {
  onSignalClick?: (signal: TradeSignal) => void
  sourceFilter?: string
  onSourceFilterChange?: (source: string) => void
}

export function SignalList({ onSignalClick, sourceFilter, onSourceFilterChange }: SignalListProps) {
  const { signals, setSignals } = useTradingStore()
  const [filter, setFilter] = useState<FilterType>('all')
  const [isGenerating, setIsGenerating] = useState(false)
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'confidence' | 'symbol'>('newest')
  const [tradeTypeFilter, setTradeTypeFilter] = useState<string>('all')
  const [localSourceFilter, setLocalSourceFilter] = useState<string>('all')

  const activeSourceFilter = sourceFilter !== undefined ? sourceFilter : localSourceFilter
  const handleSourceFilterChange = onSourceFilterChange || setLocalSourceFilter

  useEffect(() => {
    if (signals.length === 0) {
      setSignals(mockSignals)
    }
  }, [signals.length, setSignals])

  const filteredSignals = signals
    .filter((s: TradeSignal) => {
      switch (filter) {
        case 'ai':
          return s.source.startsWith('ai')
        case 'telegram':
          return s.source.startsWith('telegram')
        case 'executed':
          return s.status === 'executed'
        case 'pending':
          return s.status === 'pending'
        default:
          return true
      }
    })
    .filter((s: TradeSignal) => {
      if (tradeTypeFilter === 'all') return true
      return (s.tradeType || '').toUpperCase() === tradeTypeFilter.toUpperCase()
    })
    .filter((s: TradeSignal) => {
      if (activeSourceFilter === 'all') return true
      if (activeSourceFilter === 'telegram') return s.source.startsWith('telegram')
      if (s.channelId === activeSourceFilter) return true
      if (s.modelName === activeSourceFilter) return true
      return s.source === activeSourceFilter
    })
    .sort((a: TradeSignal, b: TradeSignal) => {
      if (sortBy === 'newest') {
        const timeA = new Date(a.sourceTimestamp || a.createdAt).getTime()
        const timeB = new Date(b.sourceTimestamp || b.createdAt).getTime()
        return timeB - timeA
      }
      if (sortBy === 'oldest') {
        const timeA = new Date(a.sourceTimestamp || a.createdAt).getTime()
        const timeB = new Date(b.sourceTimestamp || b.createdAt).getTime()
        return timeA - timeB
      }
      if (sortBy === 'confidence') {
        return b.confidence - a.confidence
      }
      if (sortBy === 'symbol') {
        return a.symbol.localeCompare(b.symbol)
      }
      return 0
    })

  // Stats calculations
  const todaySignals = signals.filter((s: TradeSignal) => {
    const today = new Date()
    const created = new Date(s.createdAt)
    return created.toDateString() === today.toDateString()
  })
  const aiSignals = signals.filter((s: TradeSignal) => s.source.startsWith('ai'))
  const telegramSignals = signals.filter((s: TradeSignal) => s.source.startsWith('telegram'))

  const executedSignals = signals.filter((s: TradeSignal) => s.status === 'executed')
  const wins = executedSignals.filter((s: TradeSignal) => (s.pnl || 0) >= 0)
  const winRate = executedSignals.length > 0 ? Math.round((wins.length / executedSignals.length) * 100) : 0

  const handleGenerateSignal = async () => {
    setIsGenerating(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const newSignal: TradeSignal = {
      id: `sig-${Date.now()}`,
      symbol: ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK'][Math.floor(Math.random() * 5)],
      exchange: 'NSE',
      action: Math.random() > 0.5 ? 'BUY' : 'SELL',
      source: Math.random() > 0.5 ? 'ai-technical' : 'ai-news',
      confidence: Math.floor(Math.random() * 30) + 60,
      entryPrice: Math.floor(Math.random() * 3000) + 500,
      targetPrice: Math.floor(Math.random() * 500) + 1500,
      stopLoss: Math.floor(Math.random() * 200) + 800,
      quantity: Math.floor(Math.random() * 40) + 5,
      reasoning: 'New AI-generated signal based on latest market analysis and technical indicators.',
      status: 'pending',
      modelName: 'Qwen3 32B',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const { addSignal } = useTradingStore.getState()
    addSignal(newSignal)
    setIsGenerating(false)
  }

  const filterButtons: { label: string; value: FilterType; count: number; icon: React.ReactNode }[] = [
    { label: 'All', value: 'all', count: signals.length, icon: <Activity className="h-3 w-3" /> },
    { label: 'AI Signals', value: 'ai', count: aiSignals.length, icon: <Brain className="h-3 w-3" /> },
    { label: 'Telegram', value: 'telegram', count: telegramSignals.length, icon: <Radio className="h-3 w-3" /> },
    { label: 'Executed', value: 'executed', count: signals.filter((s: TradeSignal) => s.status === 'executed').length, icon: <Zap className="h-3 w-3" /> },
    { label: 'Pending', value: 'pending', count: signals.filter((s: TradeSignal) => s.status === 'pending').length, icon: <TrendingUp className="h-3 w-3" /> },
  ]

  return (
    <Card className="card-top-accent card-top-accent-emerald overflow-hidden rounded-lg shadow-sm shadow-black/20">
      <CardHeader className="pb-3 px-4 pt-4">
        {/* Professional Header Section */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-500 shadow-sm shadow-black/20">
              <Signal className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold tracking-tight">Trading Signals</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Real-time trade recommendations</p>
            </div>
            <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs ml-2 font-semibold">
              {signals.length} signals
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const data = filteredSignals.map((s) => ({
                  Symbol: s.symbol,
                  Exchange: s.exchange,
                  Action: s.action,
                  Source: s.source,
                  'Trade Type': s.tradeType ?? '',
                  Confidence: s.confidence,
                  'Entry Price': s.entryPrice,
                  'Target Price': s.targetPrice ?? '',
                  'Stop Loss': s.stopLoss ?? '',
                  Quantity: s.quantity,
                  Status: s.status,
                  'P&L (₹)': s.pnl ?? '',
                  Model: s.modelName ?? '',
                  'Source Time': s.sourceTimestamp ? new Date(s.sourceTimestamp).toLocaleString('en-IN') : '',
                  'Created At': new Date(s.createdAt).toLocaleString('en-IN'),
                }))
                const headers = ['Symbol', 'Exchange', 'Action', 'Source', 'Trade Type', 'Confidence', 'Entry Price', 'Target Price', 'Stop Loss', 'Quantity', 'Status', 'P&L (₹)', 'Model', 'Source Time', 'Created At']
                if (data.length === 0) {
                  toast.info('No signals to export', { description: 'Generate some signals first' })
                  return
                }
                quickExportCSV(data as unknown as Record<string, unknown>[], headers, 'tradeai-signals')
              }}
              className="gap-1.5 text-xs border-border/50 hover:border-emerald-500/30 hover:text-emerald-400 transition-all"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Export</span>
            </Button>
            <Button
              onClick={handleGenerateSignal}
              disabled={isGenerating}
              className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white gap-2 shadow-sm shadow-black/20 transition-all duration-200 hover:shadow-md hover:shadow-emerald-500/20 focus-ring"
            >
              <Sparkles className={`h-4 w-4 ${isGenerating ? 'animate-pulse' : ''}`} />
              {isGenerating ? 'Analyzing...' : 'Generate Signal'}
            </Button>
          </div>
        </div>

        {/* Mini Stats Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 p-3 rounded-lg glass-card">
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-500/10">
              <Zap className="h-3 w-3 text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-[10px] tracking-wide font-semibold">Today</span>
              <span className="text-sm font-bold tabular-nums">{todaySignals.length} <span className="text-muted-foreground text-[10px] font-normal">signals</span></span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-amber-500/10">
              <Brain className="h-3 w-3 text-amber-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-[10px] tracking-wide font-semibold">AI</span>
              <span className="text-sm font-bold tabular-nums">{aiSignals.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-sky-500/10">
              <Radio className="h-3 w-3 text-sky-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-[10px] tracking-wide font-semibold">Telegram</span>
              <span className="text-sm font-bold tabular-nums">{telegramSignals.length}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center justify-center w-6 h-6 rounded-md bg-emerald-500/10">
              <TrendingUp className="h-3 w-3 text-emerald-400" />
            </div>
            <div className="flex flex-col">
              <span className="text-muted-foreground text-[10px] tracking-wide font-semibold">Win Rate</span>
              <span className="text-sm font-bold tabular-nums">{winRate}<span className="text-muted-foreground text-[10px] font-normal">%</span></span>
            </div>
          </div>
        </div>

        {/* Filter Bar with Pills & Dropdowns */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center mt-3">
          <div className="flex flex-wrap gap-1.5">
            {filterButtons.map((btn) => (
              <Button
                key={btn.value}
                variant="outline"
                size="sm"
                onClick={() => setFilter(btn.value)}
                className={`rounded-full h-7 text-xs gap-1.5 px-3 transition-all duration-200 focus-ring ${
                  filter === btn.value
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-sm shadow-black/20'
                    : 'text-muted-foreground border-border/50 hover:border-emerald-500/30 hover:text-emerald-400'
                }`}
              >
                {btn.icon}
                {btn.label}
                <span className={`ml-0.5 text-[10px] px-1.5 py-0 rounded-full ${
                  filter === btn.value
                    ? 'bg-white/20 text-white'
                    : 'bg-muted/50 text-muted-foreground'
                }`}>
                  {btn.count}
                </span>
              </Button>
            ))}
          </div>

          <div className="sm:ml-auto flex flex-wrap items-center gap-2">
            {/* Source filter dropdown */}
            <Select value={activeSourceFilter} onValueChange={handleSourceFilterChange}>
              <SelectTrigger className="w-[110px] h-8 text-xs bg-background/50 border-border/50">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                 <SelectItem value="telegram">Telegram</SelectItem>
                <SelectItem value="ai-news">AI News</SelectItem>
                <SelectItem value="ai-technical">AI Technical</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                {!(["all", "telegram", "ai-news", "ai-technical", "manual"].includes(activeSourceFilter)) && (
                  <SelectItem value={activeSourceFilter}>{activeSourceFilter}</SelectItem>
                )}

              </SelectContent>
            </Select>

            {/* Trade Type filter dropdown */}
            <Select value={tradeTypeFilter} onValueChange={setTradeTypeFilter}>
              <SelectTrigger className="w-[110px] h-8 text-xs bg-background/50 border-border/50">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="intraday">Intraday</SelectItem>
                <SelectItem value="swing">Swing</SelectItem>
                <SelectItem value="positional">Positional</SelectItem>
                <SelectItem value="scalp">Scalp</SelectItem>
                <SelectItem value="delivery">Delivery</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
              </SelectContent>
            </Select>

            {/* Sort Select */}
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
            <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
              <SelectTrigger className="w-[125px] h-8 text-xs bg-background/50 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest First</SelectItem>
                <SelectItem value="oldest">Oldest First</SelectItem>
                <SelectItem value="confidence">Confidence</SelectItem>
                <SelectItem value="symbol">Symbol A-Z</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-0">
        <div className="space-y-0 max-h-[calc(100vh-420px)] overflow-y-auto pr-1 custom-scrollbar">
          {filteredSignals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center mb-4">
                  <BarChart3 className="h-8 w-8 opacity-30" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                </div>
              </div>
              <p className="text-sm font-medium">No signals found</p>
              <p className="text-xs mt-1 text-muted-foreground/60">Try a different filter or generate a new signal</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4 gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all duration-200"
                onClick={handleGenerateSignal}
                disabled={isGenerating}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Generate Signal
              </Button>
            </div>
          ) : (
            filteredSignals.map((signal, index) => (
              <div key={signal.id} className="data-row">
                <SignalCard signal={signal} index={index} onSignalClick={onSignalClick} />
                {index < filteredSignals.length - 1 && (
                  <div className="mx-4 border-b border-border/15" />
                )}
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}
