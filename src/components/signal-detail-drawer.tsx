'use client'

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ConfidenceMeter } from '@/components/confidence-meter'
import type { TradeSignal } from '@/lib/types/trading'
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Brain,
  Zap,
  Radio,
  User,
  Clock,
  Target,
  ShieldAlert,
  BarChart3,
  Play,
  Activity,
  Timer,
  Gauge,
  Hash,
  Layers,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { useState } from 'react'
import { toast } from 'sonner'

interface SignalDetailDrawerProps {
  signal: TradeSignal | null
  open: boolean
  onClose: () => void
  onExecute?: (signal: TradeSignal) => void
}

function generateSparklineData(symbol: string): Array<{ value: number }> {
  const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const data: Array<{ value: number }> = []
  let val = 50 + (seed % 30)
  for (let i = 0; i < 14; i++) {
    val = val + (Math.sin(seed + i) * 8 + (Math.random() - 0.4) * 10)
    val = Math.max(20, Math.min(80, val))
    data.push({ value: Math.round(val * 10) / 10 })
  }
  return data
}

export function SignalDetailDrawer({ signal, open, onClose, onExecute }: SignalDetailDrawerProps) {
  const [isExecuting, setIsExecuting] = useState(false)

  if (!signal) return null

  const isBuy = signal.action === 'BUY'
  const sparklineData = generateSparklineData(signal.symbol)
  const sourceTimestamp = signal.sourceTimestamp || signal.createdAt
  const sourceTimestampLabel = signal.sourceTimestamp
    ? signal.source === 'ai-news'
      ? 'News Time'
      : signal.source.startsWith('telegram')
      ? 'Telegram Time'
      : 'Source Time'
    : 'Created'


  const riskRewardRatio = (() => {
    if (!signal.targetPrice || !signal.stopLoss || !signal.entryPrice) return null
    const entry = signal.entryPrice
    const target = signal.targetPrice
    const sl = signal.stopLoss
    if (isBuy) {
      const reward = target - entry
      const risk = entry - sl
      if (risk <= 0) return null
      return (reward / risk).toFixed(2)
    } else {
      const reward = entry - target
      const risk = sl - entry
      if (risk <= 0) return null
      return (reward / risk).toFixed(2)
    }
  })()

  const targetPercent = signal.targetPrice && signal.entryPrice
    ? ((signal.targetPrice - signal.entryPrice) / signal.entryPrice * 100).toFixed(2)
    : null
  const slPercent = signal.stopLoss && signal.entryPrice
    ? ((signal.stopLoss - signal.entryPrice) / signal.entryPrice * 100).toFixed(2)
    : null

  const getSourceInfo = () => {
    switch (signal.source) {
      case 'ai-news':
        return { icon: <Brain className="h-4 w-4" />, label: 'AI News Analysis', color: 'bg-emerald-500/15 text-emerald-400', desc: 'Signal generated from AI-powered news sentiment analysis' }
      case 'ai-technical':
        return { icon: <Zap className="h-4 w-4" />, label: 'AI Technical Analysis', color: 'bg-amber-500/15 text-amber-400', desc: 'Signal generated from AI-powered technical pattern recognition' }
      case 'telegram-chart-image':
        return { icon: <Activity className="h-4 w-4" />, label: 'Telegram Chart Image', color: 'bg-cyan-500/15 text-cyan-400', desc: 'Chart screenshot parsed by VLM and validated with technical indicators' }
      case 'telegram-image':
        return { icon: <BarChart3 className="h-4 w-4" />, label: 'Telegram Image', color: 'bg-purple-500/15 text-purple-400', desc: 'Signal extracted from an image received through Telegram' }
      case 'telegram':
        return { icon: <Radio className="h-4 w-4" />, label: 'Telegram Channel', color: 'bg-blue-500/15 text-blue-400', desc: 'Signal received from a connected Telegram channel' }
      case 'manual':
      default:
        return { icon: <User className="h-4 w-4" />, label: 'Manual Entry', color: 'bg-zinc-500/15 text-zinc-400', desc: 'Manually created signal' }
    }
  }


  const sourceInfo = getSourceInfo()

  const getStatusInfo = () => {
    switch (signal.status) {
      case 'pending':
        return { icon: <Timer className="h-4 w-4" />, label: 'Pending', color: 'bg-amber-500/15 text-amber-400', desc: 'Waiting for execution' }
      case 'executed':
        return { icon: <CheckCircle2 className="h-4 w-4" />, label: 'Executed', color: 'bg-emerald-500/15 text-emerald-400', desc: 'Trade has been executed' }
      case 'closed':
        return { icon: <XCircle className="h-4 w-4" />, label: 'Closed', color: 'bg-sky-500/15 text-sky-400', desc: 'Position has been closed' }
      case 'expired':
        return { icon: <Clock className="h-4 w-4" />, label: 'Expired', color: 'bg-zinc-500/15 text-zinc-400', desc: 'Signal expired without execution' }
    }
  }

  const statusInfo = getStatusInfo()

  const handleExecute = async () => {
    setIsExecuting(true)
    try {
      const res = await fetch(`/api/signals/${signal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'executed' })
      })
      if (res.ok) {
        await fetch('/api/positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: signal.symbol,
            exchange: signal.exchange,
            action: signal.action,
            quantity: signal.quantity,
            entryPrice: signal.entryPrice,
            currentPrice: signal.entryPrice,
            signalId: signal.id
          })
        })
        toast.success(`${signal.action} ${signal.symbol} executed at ₹${signal.entryPrice.toLocaleString('en-IN')}`)
        if (onExecute) onExecute(signal)
        onClose()
      } else {
        toast.error('Failed to execute trade.')
      }
    } catch {
      toast.error('Network error.')
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg bg-background border-l border-border overflow-y-auto custom-scrollbar">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
              isBuy ? 'bg-emerald-500/15' : 'bg-red-500/15'
            }`}>
              {isBuy ? <TrendingUp className="h-5 w-5 text-emerald-400" /> : <TrendingDown className="h-5 w-5 text-red-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold">{signal.symbol}</span>
                <Badge className={`font-bold ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                  {isBuy ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                  {signal.action}
                </Badge>
              </div>
              <span className="text-sm text-muted-foreground">{signal.exchange} · Signal Detail</span>
            </div>
          </SheetTitle>
          <SheetDescription className="sr-only">Signal details for {signal.symbol}</SheetDescription>
        </SheetHeader>

        {/* Confidence + Sparkline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/30 mb-4"
        >
          <div className="flex flex-col items-center">
            <ConfidenceMeter value={signal.confidence} size={80} strokeWidth={6} />
            <span className={`text-xs font-medium mt-1 ${
              signal.confidence >= 70 ? 'text-emerald-400' : signal.confidence >= 40 ? 'text-amber-400' : 'text-red-400'
            }`}>
              {signal.confidence >= 70 ? 'High' : signal.confidence >= 40 ? 'Medium' : 'Low'} Confidence
            </span>
          </div>
          <div className="w-32 h-16">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={isBuy ? '#10b981' : '#ef4444'}
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Source & Status */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {signal.postUrl ? (
            <a
              href={signal.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`rounded-xl p-3 border border-border/30 transition-all hover:opacity-85 hover:border-blue-500/30 cursor-pointer active:scale-[0.98] ${sourceInfo ? sourceInfo.color.split(' ')[0] : ''}`}
              title="Click to open original post in a new tab"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {sourceInfo?.icon}
                  <span className="text-xs font-semibold">Source 🔗</span>
                </div>
              </div>
              <p className={`text-sm font-medium ${sourceInfo ? sourceInfo.color.split(' ')[1] : ''}`}>{sourceInfo?.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{sourceInfo?.desc} (click to verify)</p>
            </a>
          ) : (
            <div className={`rounded-xl p-3 border border-border/30 ${sourceInfo ? sourceInfo.color.split(' ')[0] : ''}`}>
              <div className="flex items-center gap-2 mb-1">
                {sourceInfo?.icon}
                <span className="text-xs font-semibold">Source</span>
              </div>
              <p className={`text-sm font-medium ${sourceInfo ? sourceInfo.color.split(' ')[1] : ''}`}>{sourceInfo?.label}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{sourceInfo?.desc}</p>
            </div>
          )}

          <div className={`rounded-xl p-3 border border-border/30 ${statusInfo.color.split(' ')[0]}`}>
            <div className="flex items-center gap-2 mb-1">
              {statusInfo.icon}
              <span className="text-xs font-semibold">Status</span>
            </div>
            <p className={`text-sm font-medium ${statusInfo.color.split(' ')[1]}`}>{statusInfo.label}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{statusInfo.desc}</p>
          </div>
        </div>

        {/* Price Levels */}
        <div className="space-y-3 mb-4">
          <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
            <Target className="h-3.5 w-3.5" />
            Price Levels
          </h4>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <div className="text-[10px] text-muted-foreground mb-1">Entry Price</div>
              <div className="text-base font-bold font-mono">₹{signal.entryPrice.toLocaleString('en-IN')}</div>
            </div>
            {signal.targetPrice && (
              <div className="rounded-xl bg-emerald-500/10 p-3 text-center border border-emerald-500/20">
                <div className="text-[10px] text-emerald-400/80 mb-1 flex items-center justify-center gap-0.5">
                  <ArrowUpRight className="h-3 w-3" /> Target
                </div>
                <div className="text-base font-bold font-mono text-emerald-400">₹{signal.targetPrice.toLocaleString('en-IN')}</div>
                {targetPercent && (
                  <div className="text-[10px] text-emerald-400/70 mt-0.5">
                    {parseFloat(targetPercent) >= 0 ? '+' : ''}{targetPercent}%
                  </div>
                )}
              </div>
            )}
            {signal.stopLoss && (
              <div className="rounded-xl bg-red-500/10 p-3 text-center border border-red-500/20">
                <div className="text-[10px] text-red-400/80 mb-1 flex items-center justify-center gap-0.5">
                  <AlertTriangle className="h-3 w-3" /> Stop Loss
                </div>
                <div className="text-base font-bold font-mono text-red-400">₹{signal.stopLoss.toLocaleString('en-IN')}</div>
                {slPercent && (
                  <div className="text-[10px] text-red-400/70 mt-0.5">
                    {parseFloat(slPercent) >= 0 ? '+' : ''}{slPercent}%
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Risk/Reward Bar */}
        {riskRewardRatio && (
          <div className="p-3 rounded-xl bg-muted/30 border border-border/30 mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Gauge className="h-3.5 w-3.5" />
                Risk:Reward Ratio
              </span>
              <span className={`text-sm font-bold ${
                parseFloat(riskRewardRatio) >= 2 ? 'text-emerald-400' : parseFloat(riskRewardRatio) >= 1 ? 'text-amber-400' : 'text-red-400'
              }`}>
                1:{riskRewardRatio}
              </span>
            </div>
            <div className="flex gap-1 h-2 rounded-full overflow-hidden">
              <div
                className="bg-red-500/60 rounded-l-full"
                style={{ width: `${100 / (1 + parseFloat(riskRewardRatio))}%` }}
              />
              <div
                className="bg-emerald-500/60 rounded-r-full"
                style={{ width: `${(parseFloat(riskRewardRatio) / (1 + parseFloat(riskRewardRatio))) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>Risk</span>
              <span>Reward</span>
            </div>
          </div>
        )}

        <Separator className="my-4" />

        {/* Trade Details */}
        <div className="space-y-3 mb-4">
          <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
            <Layers className="h-3.5 w-3.5" />
            Trade Details
          </h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Quantity:</span>
              <span className="font-medium font-mono">{signal.quantity}</span>
            </div>
            <div className="flex items-center gap-2">
              <BarChart3 className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Investment:</span>
              <span className="font-medium font-mono">₹{(signal.entryPrice * signal.quantity).toLocaleString('en-IN')}</span>
            </div>
            {signal.modelName && (
              <div className="flex items-center gap-2">
                <Brain className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Model:</span>
                <span className="font-medium">{signal.modelName}</span>
              </div>
            )}
            {signal.channelId && (
              <div className="flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Channel:</span>
                <span className="font-medium">{signal.channelId}</span>
              </div>
            )}
            {signal.tradeType && (
              <div className="flex items-center gap-2">
                <Gauge className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">Trade Type:</span>
                <span className="font-medium">{signal.tradeType}</span>
              </div>
            )}
            {signal.pnl !== undefined && (
              <div className="flex items-center gap-2">
                <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-muted-foreground">P&L:</span>
                <span className={`font-medium font-mono ${signal.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {signal.pnl >= 0 ? '+' : ''}₹{signal.pnl.toLocaleString('en-IN')}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">{sourceTimestampLabel}:</span>
              <span className="font-medium text-xs">
                {new Date(sourceTimestamp).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        </div>

        {/* AI Reasoning */}
        {signal.reasoning && (
          <>
            <Separator className="my-4" />
            <div className="space-y-2 mb-4">
              <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                <Brain className="h-3.5 w-3.5" />
                AI Reasoning
              </h4>
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/10 p-4">
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {signal.reasoning}
                </p>
              </div>
            </div>
          </>
        )}

        {/* Action Buttons */}
        {signal.status === 'pending' && (
          <div className="flex gap-3 mt-6 pb-4">
            <Button
              className={`flex-1 gap-2 h-11 text-sm font-semibold ${
                isBuy ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
              onClick={handleExecute}
              disabled={isExecuting}
            >
              <Play className="h-4 w-4" />
              {isExecuting ? 'Executing...' : 'Execute Trade'}
            </Button>
            <Button
              variant="outline"
              className="gap-2 h-11 text-sm"
              onClick={onClose}
            >
              Close
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
