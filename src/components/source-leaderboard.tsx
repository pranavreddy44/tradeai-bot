'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useAutoTradeStore } from '@/lib/store/autotrade-store'
import type { TradeSignal } from '@/lib/store/autotrade-store'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Trophy,
  TrendingUp,
  Activity,
  MessageSquare,
  User,
  Zap,
  BarChart3,
  Percent,
  Search,
  ExternalLink,

} from 'lucide-react'

// Helper to format currency
function formatCurrency(num: number): string {
  const isNeg = num < 0
  const absVal = Math.abs(num)
  const formatted = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(absVal)
  return `${isNeg ? '-' : '+'}${formatted}`
}

export interface SourceStats {
  id: string
  name: string
  type: 'Telegram' | 'Manual' | 'Other'

  totalCount: number
  executedCount: number
  pendingCount: number
  winCount: number
  lossCount: number
  winRate: number
  totalPnl: number
  winPnlSum: number
  lossPnlSum: number
  avgWin: number
  avgLoss: number
  profitFactor: number
  latestSignalTime?: string
}

interface SourceLeaderboardProps {
  onViewSourceSignals?: (sourceName: string) => void
}

export function SourceLeaderboard({ onViewSourceSignals }: SourceLeaderboardProps) {
  const signals = useAutoTradeStore(s => s.signals)
  const [filterType, setFilterType] = useState<'all' | 'telegram'>('all')

  const [sortBy, setSortBy] = useState<'winRate' | 'profitFactor' | 'totalCount' | 'totalPnl'>('winRate')
  const [searchQuery, setSearchQuery] = useState('')

  // 1. Group signals by source and aggregate statistics
  const sourceGroups = useMemo(() => {
    const groups: Record<string, SourceStats> = {}

    signals.forEach((s: TradeSignal) => {
      let id = ''
      let name = ''
      let type: 'Telegram' | 'Manual' | 'Other' = 'Other'

      const sourceLower = s.source.toLowerCase()

      // Skip AI-model generated signals — the leaderboard ranks channel sources
      if (sourceLower.startsWith('ai') || s.modelName) return

      if (sourceLower === 'manual') {
        id = 'manual'
        name = 'Manual Trades'
        type = 'Manual'
      } else if (sourceLower.startsWith('telegram')) {
        id = s.channelId || 'telegram-general'
        name = s.channelId || 'Telegram Channel'
        type = 'Telegram'
      } else {
        id = s.source
        name = s.source.charAt(0).toUpperCase() + s.source.slice(1)
        type = 'Other'
      }


      if (!groups[id]) {
        groups[id] = {
          id,
          name,
          type,
          totalCount: 0,
          executedCount: 0,
          pendingCount: 0,
          winCount: 0,
          lossCount: 0,
          winRate: 0,
          totalPnl: 0,
          winPnlSum: 0,
          lossPnlSum: 0,
          avgWin: 0,
          avgLoss: 0,
          profitFactor: 1.0,
        }
      }

      const stats = groups[id]
      stats.totalCount++

      if (s.status === 'pending') {
        stats.pendingCount++
      } else if (s.status === 'executed' || s.status === 'closed') {
        stats.executedCount++
        const pnl = s.pnl || 0
        stats.totalPnl += pnl

        if (pnl > 0) {
          stats.winCount++
          stats.winPnlSum += pnl
        } else if (pnl < 0) {
          stats.lossCount++
          stats.lossPnlSum += Math.abs(pnl)
        }
      }

      // Track latest signal timestamp
      const timeStr = s.sourceTimestamp || s.createdAt
      if (timeStr) {
        if (!stats.latestSignalTime || new Date(timeStr) > new Date(stats.latestSignalTime)) {
          stats.latestSignalTime = timeStr
        }
      }
    })

    // Calculate derived fields
    Object.values(groups).forEach((stats) => {
      if (stats.executedCount > 0) {
        stats.winRate = Math.round((stats.winCount / stats.executedCount) * 100)
        stats.avgWin = stats.winCount > 0 ? Math.round(stats.winPnlSum / stats.winCount) : 0
        stats.avgLoss = stats.lossCount > 0 ? Math.round(stats.lossPnlSum / stats.lossCount) : 0
        stats.profitFactor = stats.lossPnlSum > 0 
          ? parseFloat((stats.winPnlSum / stats.lossPnlSum).toFixed(2)) 
          : stats.winPnlSum > 0 ? 99.9 : 1.0
      }
    })

    return Object.values(groups)
  }, [signals])

  // 2. Filter & search source stats
  const filteredSources = useMemo(() => {
    return sourceGroups
      .filter((stats) => {
        // Search query filter
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          if (!stats.name.toLowerCase().includes(query) && !stats.id.toLowerCase().includes(query)) {
            return false
          }
        }

        // Type filter
        if (filterType === 'all') return true
        if (filterType === 'telegram') return stats.type === 'Telegram'
        return true

      })
      .sort((a, b) => {
        if (sortBy === 'winRate') {
          // Sort by win rate, tie-break by volume
          if (b.winRate !== a.winRate) return b.winRate - a.winRate
          return b.totalCount - a.totalCount
        }
        if (sortBy === 'profitFactor') {
          if (b.profitFactor !== a.profitFactor) return b.profitFactor - a.profitFactor
          return b.totalCount - a.totalCount
        }
        if (sortBy === 'totalCount') {
          return b.totalCount - a.totalCount
        }
        if (sortBy === 'totalPnl') {
          return b.totalPnl - a.totalPnl
        }
        return 0
      })
  }, [sourceGroups, searchQuery, filterType, sortBy])

  // 3. Overall Top Performers Highlights
  const highlights = useMemo(() => {
    // Sources with at least 1 executed trade
    const activeSources = sourceGroups.filter(s => s.executedCount > 0)

    const topWinRate = activeSources.length > 0
      ? [...activeSources].sort((a, b) => b.winRate - a.winRate)[0]
      : null

    const topPnl = activeSources.length > 0
      ? [...activeSources].sort((a, b) => b.totalPnl - a.totalPnl)[0]
      : null

    const topVolume = sourceGroups.length > 0
      ? [...sourceGroups].sort((a, b) => b.totalCount - a.totalCount)[0]
      : null

    return { topWinRate, topPnl, topVolume }
  }, [sourceGroups])

  // Render proper icon for source type
  const getSourceIcon = (type: string) => {
    switch (type) {
      case 'Telegram':
        return <MessageSquare className="h-4 w-4 text-blue-400" />
      case 'Manual':
        return <User className="h-4 w-4 text-purple-400" />
      default:
        return <Zap className="h-4 w-4 text-amber-400" />
    }

  }

  return (
    <div className="space-y-4">
      {/* ─── HIGHLIGHT BANNERS ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Top Win Rate */}
        <Card className="border-emerald-500/20 bg-emerald-950/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 text-emerald-500/10 text-7xl font-bold font-mono select-none">
            WR
          </div>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] uppercase font-bold text-emerald-400/70 tracking-wider flex items-center gap-1">
                <Trophy className="h-3 w-3 text-yellow-400 animate-pulse" /> Top Accuracy
              </span>
              <h4 className="text-base font-bold truncate pr-6 text-emerald-100">
                {highlights.topWinRate ? highlights.topWinRate.name : 'N/A'}
              </h4>
              <p className="text-xs text-muted-foreground">
                Win Rate: <span className="text-emerald-400 font-semibold">{highlights.topWinRate ? `${highlights.topWinRate.winRate}%` : '0%'}</span> ({highlights.topWinRate?.executedCount} trades)
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
              <Percent className="h-5 w-5 text-emerald-400" />
            </div>
          </CardContent>
        </Card>

        {/* Top PnL */}
        <Card className="border-blue-500/20 bg-blue-950/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 text-blue-500/10 text-7xl font-bold font-mono select-none">
            PF
          </div>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] uppercase font-bold text-blue-400/70 tracking-wider flex items-center gap-1">
                <TrendingUp className="h-3 w-3 text-blue-400" /> Most Profitable
              </span>
              <h4 className="text-base font-bold truncate pr-6 text-blue-100">
                {highlights.topPnl ? highlights.topPnl.name : 'N/A'}
              </h4>
              <p className="text-xs text-muted-foreground">
                PnL: <span className={`font-semibold ${highlights.topPnl && highlights.topPnl.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {highlights.topPnl ? formatCurrency(highlights.topPnl.totalPnl) : '₹0'}
                </span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20 shrink-0">
              <BarChart3 className="h-5 w-5 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        {/* Highest Activity */}
        <Card className="border-amber-500/20 bg-amber-950/5 relative overflow-hidden group">
          <div className="absolute right-0 top-0 translate-x-2 -translate-y-2 text-amber-500/10 text-7xl font-bold font-mono select-none">
            VOL
          </div>
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-1 min-w-0">
              <span className="text-[10px] uppercase font-bold text-amber-400/70 tracking-wider flex items-center gap-1">
                <Activity className="h-3 w-3 text-amber-400" /> Highest Volume
              </span>
              <h4 className="text-base font-bold truncate pr-6 text-amber-100">
                {highlights.topVolume ? highlights.topVolume.name : 'N/A'}
              </h4>
              <p className="text-xs text-muted-foreground">
                Total Signals: <span className="text-amber-400 font-semibold">{highlights.topVolume ? highlights.topVolume.totalCount : '0'}</span>
              </p>
            </div>
            <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shrink-0">
              <Zap className="h-5 w-5 text-amber-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── FILTERS & CONTROLS ─── */}
      <Card className="border-border/50 bg-card/30 backdrop-blur-md">
        <CardContent className="p-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Search bar */}
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search source name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 pl-9 pr-3 rounded-md bg-background/50 border border-border/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground placeholder-muted-foreground"
            />
          </div>

          {/* Sub-Filters & Sort */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <div className="flex bg-background/50 border border-border/50 p-0.5 rounded-md text-[10px] font-medium shrink-0">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded-sm transition-colors ${filterType === 'all' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('telegram')}
                className={`px-2.5 py-1 rounded-sm transition-colors ${filterType === 'telegram' ? 'bg-blue-500/20 text-blue-400' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Telegram
              </button>
            </div>


            <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
              <SelectTrigger className="h-8 w-[130px] text-xs bg-background/50 border-border/50">
                <SelectValue placeholder="Sort By" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="winRate">Accuracy (Win %)</SelectItem>
                <SelectItem value="profitFactor">Profit Factor</SelectItem>
                <SelectItem value="totalCount">Total Signals</SelectItem>
                <SelectItem value="totalPnl">Net Profit (PnL)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ─── LEADERBOARD LIST ─── */}
      <div className="space-y-2.5">
        <AnimatePresence mode="popLayout">
          {filteredSources.length === 0 ? (
            <Card className="border-border/30 bg-card/20 py-12">
              <CardContent className="flex flex-col items-center justify-center text-center text-muted-foreground">
                <div className="h-12 w-12 rounded-full bg-muted/15 flex items-center justify-center mb-3">
                  <BarChart3 className="h-6 w-6 opacity-30" />
                </div>
                <h5 className="font-semibold text-sm">No channels matched</h5>
                <p className="text-xs text-muted-foreground/70 mt-1 max-w-[280px]">
                  Ensure signals are active or try modifying your search query.
                </p>
              </CardContent>
            </Card>
          ) : (
            filteredSources.map((source, index) => {
              // Ranks badge colors
              const isTopRank = index < 3
              const rankColors = [
                'text-yellow-400 border-yellow-500/30 bg-yellow-500/5',
                'text-zinc-300 border-zinc-400/30 bg-zinc-400/5',
                'text-amber-600 border-amber-700/30 bg-amber-700/5',
              ]

              return (
                <motion.div
                  key={source.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.25, delay: index * 0.02 }}
                >
                  <Card className={`border-border/30 hover:border-primary/20 hover:bg-muted/10 transition-all ${isTopRank ? 'border-l-2 border-l-primary/60' : ''}`}>
                    <CardContent className="p-3 sm:p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
                      
                      {/* Rank, Name and Type */}
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className={`h-7 w-7 rounded-md border flex items-center justify-center font-bold text-xs shrink-0 ${isTopRank ? rankColors[index] : 'border-border/40 text-muted-foreground bg-muted/5'}`}>
                          {index + 1}
                        </div>
                        
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h5 className="font-bold text-sm text-foreground truncate max-w-[200px] sm:max-w-xs">
                              {source.name}
                            </h5>
                            <Badge variant="secondary" className="gap-1 text-[9px] h-4 font-semibold px-1 py-0 border-border/20">
                              {getSourceIcon(source.type)}
                              {source.type}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-2 mt-1">
                            <span>ID: <code className="font-mono text-primary/80">{source.id}</code></span>
                            {source.latestSignalTime && (
                              <>
                                <span>•</span>
                                <span>Active {new Date(source.latestSignalTime).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Performance Bar Stats */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 shrink-0">
                        {/* Accuracy progress */}
                        <div className="w-full sm:w-36 space-y-1">
                          <div className="flex justify-between text-[10px] font-medium">
                            <span className="text-muted-foreground">Accuracy (Win Rate)</span>
                            <span className="text-emerald-400 font-semibold">{source.winRate}%</span>
                          </div>
                          <div className="h-1.5 bg-muted-foreground/10 w-full rounded-full overflow-hidden">
                            <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${source.winRate}%` }} />
                          </div>
                          <div className="flex justify-between text-[9px] text-muted-foreground">
                            <span>{source.executedCount} Executed</span>
                            <span>{source.winCount} W / {source.lossCount} L</span>
                          </div>
                        </div>

                        {/* Profit Factor & PnL */}
                        <div className="grid grid-cols-3 gap-2 sm:gap-4 shrink-0 text-center min-w-[220px]">
                          {/* Total Signals */}
                          <div className="flex flex-col items-center justify-center p-1 rounded bg-muted/20 border border-border/20">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Signals</span>
                            <span className="text-sm font-extrabold text-foreground">{source.totalCount}</span>
                          </div>

                          {/* Profit Factor */}
                          <div className="flex flex-col items-center justify-center p-1 rounded bg-muted/20 border border-border/20">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">P. Factor</span>
                            <span className={`text-sm font-extrabold ${source.profitFactor >= 2 ? 'text-emerald-400' : source.profitFactor >= 1.5 ? 'text-emerald-500/80' : source.profitFactor >= 1 ? 'text-amber-500' : 'text-red-400'}`}>
                              {source.profitFactor === 99.9 ? '∞' : source.profitFactor.toFixed(2)}
                            </span>
                          </div>

                          {/* Net Profit */}
                          <div className="flex flex-col items-center justify-center p-1 rounded bg-muted/20 border border-border/20">
                            <span className="text-[9px] uppercase font-bold text-muted-foreground/60 tracking-wider">Net PnL</span>
                            <span className={`text-xs font-bold ${source.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {formatCurrency(source.totalPnl)}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0 justify-end">
                          {onViewSourceSignals && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-[10px] gap-1 px-2 border-primary/20 hover:border-primary/40 hover:bg-primary/5 text-primary"
                              onClick={() => onViewSourceSignals(source.id)}
                            >
                              <ExternalLink className="h-3 w-3" />
                              View
                            </Button>
                          )}
                        </div>
                      </div>

                    </CardContent>
                  </Card>
                </motion.div>
              )
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
