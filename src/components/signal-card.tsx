'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  Brain,
  Zap,
  User,
  Radio,
  ChevronDown,
  ChevronUp,
  Target,
  ShieldAlert,
  Clock,
  Activity,
} from 'lucide-react'
import type { TradeSignal } from '@/lib/types/trading'
import { useState } from 'react'

interface SignalCardProps {
  signal: TradeSignal
  index?: number
  onSignalClick?: (signal: TradeSignal) => void
}

export function SignalCard({ signal, index = 0, onSignalClick }: SignalCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isBuy = signal.action === 'BUY'
  const sourceTime = signal.sourceTimestamp || signal.createdAt
  const sourceTimeLabel = signal.sourceTimestamp
    ? signal.source === 'ai-news'
      ? 'News'
      : signal.source.startsWith('telegram')
      ? 'Telegram'
      : 'Source'
    : 'Created'

  const getSourceIcon = () => {
    const src = signal.source.toLowerCase();
    if (src === 'ai-news') return <Brain className="h-3.5 w-3.5" />
    if (src === 'ai-technical') return <Zap className="h-3.5 w-3.5" />
    if (src.startsWith('telegram')) return <Radio className="h-3.5 w-3.5" />
    return <User className="h-3.5 w-3.5" />
  }

  const getSourceColor = () => {
    const src = signal.source.toLowerCase();
    if (src === 'ai-news') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
    if (src === 'ai-technical') return 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    if (src.startsWith('telegram')) return 'bg-sky-500/10 text-sky-400 border-sky-500/20'
    return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
  }

  const formatExactTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const getStatusColor = () => {
    switch (signal.status) {
      case 'executed':
        return 'bg-emerald-500/20 text-emerald-400'
      case 'pending':
        return 'bg-amber-500/20 text-amber-400'
      case 'closed':
        return 'bg-sky-500/20 text-sky-400'
      case 'expired':
        return 'bg-zinc-500/20 text-zinc-400'
    }
  }

  // Confidence bar gradient color
  const getConfidenceBarColor = (val: number) => {
    if (val >= 70) return 'from-emerald-500 to-emerald-400'
    if (val >= 40) return 'from-amber-500 to-amber-400'
    return 'from-red-500 to-red-400'
  }

  const getConfidenceTextColor = (val: number) => {
    if (val >= 70) return 'text-emerald-400'
    if (val >= 40) return 'text-amber-400'
    return 'text-red-400'
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <Card
        className={`trading-card group border-l-4 cursor-pointer ${
          isBuy ? 'border-l-emerald-500' : 'border-l-red-500'
        }`}
        onClick={() => {
          setExpanded(!expanded)
          if (onSignalClick) onSignalClick(signal)
        }}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-2.5">
            {/* Action Badge */}
            <div className="flex-shrink-0">
              <Badge
                className={`font-bold px-2 py-0.5 text-[10px] transition-all duration-200 ${
                  isBuy
                    ? 'badge-buy-consistent hover:bg-emerald-500/25'
                    : 'badge-sell-consistent hover:bg-red-500/25'
                }`}
              >
                {isBuy ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                {signal.action}
              </Badge>
            </div>

            {/* Symbol & Exchange */}
            <div className="flex-shrink-0 min-w-[80px]">
              <div className="font-bold text-sm leading-tight tracking-tight">{signal.symbol}</div>
              <div className="text-[9px] text-muted-foreground tracking-wide">{signal.exchange}</div>
            </div>

            {/* Confidence Horizontal Bar */}
            <div className="flex-shrink-0 hidden sm:flex items-center gap-2 w-24">
              <div className="flex-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${getConfidenceBarColor(signal.confidence)} confidence-bar-fill`}
                  style={{ '--confidence-width': `${signal.confidence}%` } as React.CSSProperties}
                />
              </div>
              <span className={`text-[10px] font-bold tabular-nums w-7 text-right ${getConfidenceTextColor(signal.confidence)}`}>
                {signal.confidence}%
              </span>
            </div>

            {/* Source & Channel Badges */}
            {signal.postUrl ? (
              <a
                href={signal.postUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 hover:opacity-80 active:scale-95 transition-all shrink-0"
                onClick={(e) => e.stopPropagation()}
                title="Open original post"
              >
                <Badge variant="outline" className={`flex items-center gap-1 text-[10px] px-1.5 py-0 cursor-pointer ${getSourceColor()}`}>
                  {getSourceIcon()}
                  <span className="capitalize hidden sm:inline">{signal.source.replace('-', ' ')}</span>
                </Badge>
                {signal.channelId && (
                  <Badge variant="outline" className="flex-shrink-0 text-[9px] px-1.5 py-0 border-violet-500/30 bg-violet-500/10 text-violet-400 cursor-pointer hover:border-violet-400/50">
                    {signal.channelId}
                  </Badge>
                )}
              </a>
            ) : (
              <div className="flex items-center gap-1.5 shrink-0">
                <Badge variant="outline" className={`flex items-center gap-1 text-[10px] px-1.5 py-0 ${getSourceColor()}`}>
                  {getSourceIcon()}
                  <span className="capitalize hidden sm:inline">{signal.source.replace('-', ' ')}</span>
                </Badge>
                {signal.channelId && (
                  <Badge variant="outline" className="flex-shrink-0 text-[9px] px-1.5 py-0 border-violet-500/30 bg-violet-500/10 text-violet-400">
                    {signal.channelId}
                  </Badge>
                )}
              </div>
            )}

            {signal.tradeType && (
              <Badge variant="outline" className="flex-shrink-0 text-[9px] px-1.5 py-0 border-border/40">
                {signal.tradeType}
              </Badge>
            )}

            {/* Prices - compact font-mono */}
            <div className="flex gap-2.5 text-[10px] flex-shrink-0 hidden md:flex">
              <div>
                <span className="text-muted-foreground tracking-wide">Entry </span>
                <span className="font-semibold font-mono tabular-nums tracking-tight">₹{signal.entryPrice.toLocaleString('en-IN')}</span>
              </div>
              {signal.targetPrice && (
                <div className="flex items-center gap-0.5">
                  <Target className="h-2.5 w-2.5 text-emerald-500" />
                  <span className="text-emerald-400 font-bold font-mono tabular-nums tracking-tight">₹{signal.targetPrice.toLocaleString('en-IN')}</span>
                </div>
              )}
              {signal.stopLoss && (
                <div className="flex items-center gap-0.5">
                  <ShieldAlert className="h-2.5 w-2.5 text-red-500" />
                  <span className="text-red-400 font-bold font-mono tabular-nums tracking-tight">₹{signal.stopLoss.toLocaleString('en-IN')}</span>
                </div>
              )}
            </div>

            {/* Status */}
            <Badge variant="secondary" className={`ml-auto flex-shrink-0 text-[9px] px-1.5 py-0 ${getStatusColor()}`}>
              {signal.status}
            </Badge>

            {/* Time */}
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
              <Clock className="h-2.5 w-2.5" />
              <span>{sourceTimeLabel}: {formatTime(sourceTime)}</span>
              <span className="text-[9px] opacity-75 hidden md:inline">({formatExactTime(sourceTime)})</span>
            </div>

            {/* Expand Toggle */}
            <div className="flex-shrink-0 text-muted-foreground/50 group-hover:text-emerald-500 transition-colors duration-200">
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </div>
          </div>

          {/* Expanded Reasoning */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2.5 pt-2.5 border-t border-border/30">
                  {/* Mobile-only confidence bar + prices */}
                  <div className="flex gap-3 mb-2 sm:hidden">
                    <div className="flex items-center gap-2">
                      <Activity className="h-3 w-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">Confidence:</span>
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${getConfidenceBarColor(signal.confidence)}`}
                            style={{ width: `${signal.confidence}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-bold ${getConfidenceTextColor(signal.confidence)}`}>
                          {signal.confidence}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {signal.reasoning && (
                    <div className="glass-card rounded-md p-2.5 text-xs text-muted-foreground leading-relaxed mb-2">
                      <span className="font-bold text-emerald-400 text-[10px] flex items-center gap-1 mb-1 tracking-wide uppercase">
                        <Brain className="h-3 w-3" />
                        AI Reasoning
                      </span>
                      {signal.reasoning}
                    </div>
                  )}
                  <div className="flex gap-4 text-[10px] text-muted-foreground">
                    {signal.modelName && <span>Model: <span className="text-foreground/80 font-semibold">{signal.modelName}</span></span>}
                    {signal.channelId && <span>Channel: {signal.channelId}</span>}
                    {signal.tradeType && <span>Type: <span className="text-foreground/80 font-semibold">{signal.tradeType}</span></span>}
                    <span>Qty: <span className="text-foreground/80 font-semibold font-mono tabular-nums">{signal.quantity}</span></span>
                    {signal.pnl !== undefined && (
                      <span className={`font-bold font-mono tabular-nums ${signal.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        P&L: ₹{signal.pnl.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>
    </motion.div>
  )
}
