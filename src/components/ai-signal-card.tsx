'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Brain, Zap, Radio, User, Clock, Play, X, Activity,
  ArrowUpRight, ArrowDownRight, AlertTriangle, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react'
import type { TradeSignal } from '@/lib/types/trading'
import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'

interface AISignalCardProps {
  signal: TradeSignal
  onExecute?: (signal: TradeSignal) => void
  onSignalClick?: (signal: TradeSignal) => void
}

// Generate mini candlestick data
function generateCandlestickData(symbol: string) {
  const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const bars: { height: number; color: 'green' | 'red' }[] = []
  let val = 50 + (seed % 30)
  for (let i = 0; i < 5; i++) {
    const prev = val
    val = val + (Math.sin(seed + i) * 8 + (Math.random() - 0.4) * 10)
    val = Math.max(20, Math.min(80, val))
    bars.push({
      height: Math.abs(val - prev) * 0.6 + 10,
      color: val >= prev ? 'green' : 'red',
    })
  }
  return bars
}

function formatSourceTime(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return 'N/A'
  }
}

// Signal strength dots (5 dots like phone signal bars)
function SignalStrengthDots({ confidence }: { confidence: number }) {
  const filledDots = Math.round(confidence / 20)
  const getColor = (val: number, index: number) => {
    if (index >= filledDots) return 'bg-muted/40'
    if (val >= 70) return 'bg-emerald-400'
    if (val >= 40) return 'bg-amber-400'
    return 'bg-red-400'
  }
  return (
    <div className="flex items-end gap-[3px]">
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className={`w-[5px] rounded-sm transition-colors duration-300 ${getColor(confidence, i)}`}
          style={{ height: `${8 + i * 3}px` }}
        />
      ))}
    </div>
  )
}

export function AISignalCard({ signal, onExecute, onSignalClick }: AISignalCardProps) {
  const isBuy = signal.action === 'BUY'
  const [countdown, setCountdown] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [reasoningExpanded, setReasoningExpanded] = useState(false)

  // Risk/Reward calculation
  const riskRewardRatio = useMemo(() => {
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
  }, [signal.targetPrice, signal.stopLoss, signal.entryPrice, isBuy])

  // Countdown timer for pending signals
  useEffect(() => {
    if (signal.status !== 'pending') return
    const created = new Date(signal.createdAt).getTime()
    const expiresAt = created + 30 * 60 * 1000
    const updateTimer = () => {
      const remaining = Math.max(0, expiresAt - Date.now())
      setCountdown(Math.ceil(remaining / 60000))
    }
    updateTimer()
    const interval = setInterval(updateTimer, 10000)
    return () => clearInterval(interval)
  }, [signal.status, signal.createdAt])

  const candlestickBars = useMemo(() => generateCandlestickData(signal.symbol), [signal.symbol])

  const getSourceInfo = () => {
    switch (signal.source) {
      case 'ai-news':
        return { icon: <Brain className="h-3 w-3" />, label: 'AI News', color: 'bg-emerald-500/15 text-emerald-400' }
      case 'ai-technical':
        return { icon: <Zap className="h-3 w-3" />, label: 'AI Technical', color: 'bg-amber-500/15 text-amber-400' }
      case 'telegram-chart-image':
        return { icon: <Activity className="h-3 w-3" />, label: 'Chart Image', color: 'bg-cyan-500/15 text-cyan-400' }
      case 'telegram-image':
        return { icon: <Zap className="h-3 w-3" />, label: 'Image', color: 'bg-purple-500/15 text-purple-400' }
      case 'telegram':
        return { icon: <Radio className="h-3 w-3" />, label: 'Telegram', color: 'bg-blue-500/15 text-blue-400' }
      case 'manual':
      default:
        return { icon: <User className="h-3 w-3" />, label: 'Manual', color: 'bg-zinc-500/15 text-zinc-400' }
    }
  }

  const sourceInfo = getSourceInfo()
  const sourceTime = signal.sourceTimestamp || signal.createdAt
  const sourceTimeLabel = signal.sourceTimestamp
    ? signal.source === 'ai-news'
      ? 'News'
      : signal.source.startsWith('telegram')
      ? 'Telegram'
      : 'Source'
    : 'Created'



  // Confidence color zone
  const getConfidenceZone = (val: number) => {
    if (val >= 70) return { text: 'text-emerald-400', bg: 'from-emerald-600 to-emerald-400', track: 'bg-emerald-500/20', label: 'High' }
    if (val >= 40) return { text: 'text-amber-400', bg: 'from-amber-600 to-amber-400', track: 'bg-amber-500/20', label: 'Medium' }
    return { text: 'text-red-400', bg: 'from-red-600 to-red-400', track: 'bg-red-500/20', label: 'Low' }
  }

  const confZone = getConfidenceZone(signal.confidence)

  // Price level percentages
  const targetPercent = signal.targetPrice && signal.entryPrice
    ? ((signal.targetPrice - signal.entryPrice) / signal.entryPrice * 100).toFixed(2)
    : null
  const slPercent = signal.stopLoss && signal.entryPrice
    ? ((signal.stopLoss - signal.entryPrice) / signal.entryPrice * 100).toFixed(2)
    : null

  // Price distribution bar (relative position of entry, target, stop)
  const priceDistribution = useMemo(() => {
    if (!signal.targetPrice || !signal.stopLoss || !signal.entryPrice) return null
    const allPrices = [signal.entryPrice, signal.targetPrice, signal.stopLoss]
    const min = Math.min(...allPrices)
    const max = Math.max(...allPrices)
    const range = max - min || 1
    return {
      entry: ((signal.entryPrice - min) / range) * 100,
      target: ((signal.targetPrice - min) / range) * 100,
      stop: ((signal.stopLoss - min) / range) * 100,
    }
  }, [signal.entryPrice, signal.targetPrice, signal.stopLoss])

  if (dismissed) return null

  const handleExecute = async () => {
    setIsExecuting(true)
    try {
      // First, try to execute on Groww broker if connected
      let brokerOrderId = null
      let brokerSucceeded = false

      try {
        // Check if Groww is connected before attempting broker execution
        const statusRes = await fetch('/api/broker/groww?action=status')
        let statusData: any = { connected: false, hasCredentials: false }
        try {
          const statusText = await statusRes.text()
          if (statusText.startsWith('{')) {
            statusData = JSON.parse(statusText)
          }
        } catch {
          // Status check failed, assume not connected
        }

        if (!statusData.hasCredentials) {
          // Groww not connected — inform user but continue with local execution
          toast.warning('Groww not connected', {
            description: 'Connect your Groww account in Setup tab to execute trades on the broker',
            duration: 6000,
          })
        } else if (!statusData.connected) {
          // Has credentials but NOT connected — likely auth error (expired token, IP issue, etc.)
          const statusError = statusData.error || ''
          if (statusError.includes('IP_NOT_REGISTERED')) {
            toast.error('🔒 IP Not Registered on Groww', {
              description: statusData.hint || 'Register this server IP in Groww API Dashboard, then regenerate access token.',
              duration: 12000,
            })
          } else if (statusError.includes('AUTHORISATION_FAILED') || statusError.includes('Access denied')) {
            toast.error('🚫 Groww Authorisation Failed (403)', {
              description: statusData.hint || 'Your server IP is likely not registered in Groww API dashboard. Register the IP and regenerate the access token.',
              duration: 12000,
            })
          } else if (statusError.includes('AUTHENTICATION_FAILED') || statusError.includes('GA005')) {
            toast.error('🔑 Groww Token Expired / Invalid', {
              description: statusData.hint || 'Your access token is invalid or expired. Go to Setup → Generate / Refresh Token.',
              duration: 12000,
            })
          } else if (statusError.includes('Access token not generated')) {
            toast.warning('⚠️ Groww Access Token Missing', {
              description: statusData.hint || 'Go to Setup → Generate / Refresh Token to create a new access token.',
              duration: 10000,
            })
          } else {
            toast.warning('Groww connection issue', {
              description: statusData.hint || statusError || 'Check your Groww connection in the Setup tab and regenerate the access token if needed.',
              duration: 10000,
            })
          }
        } else {
          // Groww IS connected — try executing the trade on the broker
          const brokerRes = await fetch('/api/broker/groww', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'execute-signal', signalId: signal.id }),
          })

          let brokerData: any
          try {
            const text = await brokerRes.text()
            if (text.startsWith('{')) {
              brokerData = JSON.parse(text)
            } else {
              toast.error('Broker call failed', {
                description: brokerRes.status === 502 || brokerRes.status === 504
                  ? 'Gateway timeout — the broker API took too long.'
                  : `Server error (${brokerRes.status})`,
              })
            }
          } catch {
            toast.error('Broker call failed', { description: 'Invalid server response' })
          }

          if (brokerData) {
            if (brokerData.success) {
              brokerOrderId = brokerData.order?.id
              brokerSucceeded = true
              toast.success(`🚀 Groww order placed: ${signal.action} ${signal.symbol}`)
            } else if (brokerData.error === 'IP_NOT_REGISTERED') {
              toast.error('🔒 IP Not Registered on Groww', {
                description: brokerData.hint || 'Register this server IP in Groww API Dashboard, then regenerate access token.',
                duration: 12000,
              })
            } else if (brokerData.error === 'AUTHORISATION_FAILED') {
              toast.error('🚫 Groww Authorisation Failed (403)', {
                description: brokerData.hint || 'Your server IP is likely not registered in Groww API dashboard. Register the IP and regenerate the access token.',
                duration: 12000,
              })
            } else if (brokerData.error === 'AUTHENTICATION_FAILED') {
              toast.error('🔑 Groww Token Expired / Invalid', {
                description: brokerData.hint || 'Your access token is invalid or expired. Go to Setup → Generate / Refresh Token.',
                duration: 12000,
              })
            } else if (brokerData.error === 'Not connected') {
              toast.warning('Groww not connected', {
                description: 'Connect your Groww account in Setup tab to execute trades on the broker',
                duration: 6000,
              })
            } else if (brokerData.error === 'INSUFFICIENT_MARGIN') {
              toast.error('💰 Insufficient Margin', {
                description: brokerData.hint || 'Add funds or reduce the quantity.',
                duration: 10000,
              })
            } else if (brokerData.error) {
              toast.error('Broker Error', { description: brokerData.hint || brokerData.error, duration: 10000 })
            }
          }
        }
      } catch {
        // Broker status check or execution failed — inform user and continue with local execution
        toast.warning('Groww not connected', {
          description: 'Connect your Groww account in Setup tab to execute trades on the broker',
          duration: 6000,
        })
      }

      // ALWAYS update local signal status and create position, regardless of broker result
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
        if (brokerSucceeded) {
          toast.success(`${signal.action} ${signal.symbol} executed at ₹${signal.entryPrice.toLocaleString('en-IN')} → Groww`)
        } else {
          toast.success(`${signal.action} ${signal.symbol} executed locally at ₹${signal.entryPrice.toLocaleString('en-IN')}`, {
            description: brokerOrderId ? '' : 'Signal marked as executed. Connect Groww to place real broker orders.',
            duration: 5000,
          })
        }
        if (onExecute) onExecute(signal)
      } else {
        toast.error('Failed to execute trade. Please try again.')
      }
    } catch (err) {
      console.error('Execute trade error:', err)
      toast.error('Network error. Please check your connection.')
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      <Card
        className={`overflow-hidden cursor-pointer transition-all duration-200 hover:shadow-lg ${
          isBuy ? 'gradient-border glow-emerald' : 'gradient-border gradient-border-red glow-red'
        }`}
        onClick={() => onSignalClick?.(signal)}
      >
        <CardHeader className="pb-2 pt-3 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              {isBuy ? (
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span className="font-bold tracking-tight">AI Signal</span>
              {signal.status === 'pending' && (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <SignalStrengthDots confidence={signal.confidence} />
              <Badge
                variant="secondary"
                className={`font-bold text-xs ${isBuy ? 'badge-buy-consistent' : 'badge-sell-consistent'}`}
              >
                {isBuy ? <ArrowUpRight className="h-3 w-3 mr-1" /> : <ArrowDownRight className="h-3 w-3 mr-1" />}
                {signal.action}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 px-4 pb-4">
          {/* Symbol Row + Candlestick + Confidence Bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="min-w-0">
                <div className="text-xl font-bold tracking-tight truncate">{signal.symbol}</div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground tracking-wide">{signal.exchange}</span>
                  {signal.postUrl ? (
                    <a
                      href={signal.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 hover:opacity-80 active:scale-95 transition-all shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      title="Open original post"
                    >
                      <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 gap-0.5 font-semibold cursor-pointer ${sourceInfo ? sourceInfo.color : ''}`}>
                        {sourceInfo?.icon}
                        {sourceInfo?.label}
                      </Badge>
                      {signal.channelId && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-violet-500/30 bg-violet-500/10 text-violet-400 cursor-pointer hover:border-violet-400/50">
                          {signal.channelId}
                        </Badge>
                      )}
                    </a>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className={`text-[9px] px-1.5 py-0 gap-0.5 font-semibold ${sourceInfo ? sourceInfo.color : ''}`}>
                        {sourceInfo?.icon}
                        {sourceInfo?.label}
                      </Badge>
                      {signal.channelId && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-violet-500/30 bg-violet-500/10 text-violet-400">
                          {signal.channelId}
                        </Badge>
                      )}
                    </div>
                  )}
                  {signal.tradeType && (
                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-border/40">
                      {signal.tradeType}
                    </Badge>
                  )}


                </div>
                <div className="mt-1 flex items-center gap-1 text-[9px] text-muted-foreground">
                  <Clock className="h-2.5 w-2.5" />
                  <span>{sourceTimeLabel}: {formatSourceTime(sourceTime)}</span>
                </div>
              </div>
            </div>

            {/* Mini Candlestick Indicator */}
            <div className="flex items-end gap-[2px] h-6 shrink-0">
              {candlestickBars.map((bar, i) => (
                <motion.div
                  key={i}
                  initial={{ height: 0 }}
                  animate={{ height: `${bar.height}%` }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className={`w-[4px] rounded-sm ${
                    bar.color === 'green'
                      ? 'bg-emerald-500/80'
                      : 'bg-red-500/80'
                  }`}
                  style={{ minHeight: 3 }}
                />
              ))}
            </div>

            {/* Horizontal Confidence Bar */}
            <div className="flex items-center gap-2 shrink-0 w-36">
              <div className="flex-1">
                <div className={`h-2 rounded-full ${confZone.track} overflow-hidden`}>
                  <motion.div
                    className={`h-full rounded-full bg-gradient-to-r ${confZone.bg}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${signal.confidence}%` }}
                    transition={{ duration: 1, ease: 'easeOut' }}
                  />
                </div>
              </div>
              <div className="flex flex-col items-end min-w-[44px]">
                <span className={`text-xs font-bold tabular-nums ${confZone.text}`}>
                  {signal.confidence}%
                </span>
                <span className={`text-[9px] font-medium ${confZone.text}`}>
                  {confZone.label}
                </span>
              </div>
            </div>
          </div>

          {/* Professional Price Levels - Order Book Style */}
          <div className="rounded-lg border border-border/40 overflow-hidden">
            <div className="grid grid-cols-3 text-[10px] font-bold text-muted-foreground bg-muted/30 px-2 py-1.5 border-b border-border/30 uppercase tracking-wider">
              <div className="text-center">Entry</div>
              <div className="text-center">Target</div>
              <div className="text-center">Stop Loss</div>
            </div>
            <div className="grid grid-cols-3 px-2 py-2.5">
              <div className="text-center">
                <div className="font-bold font-mono text-sm tabular-nums tracking-tight">₹{signal.entryPrice.toLocaleString('en-IN')}</div>
              </div>
              {signal.targetPrice && (
                <div className="text-center border-l border-border/30">
                  <div className="flex items-center justify-center gap-0.5">
                    <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                    <span className="font-bold font-mono text-sm tabular-nums tracking-tight text-emerald-400">
                      ₹{signal.targetPrice.toLocaleString('en-IN')}
                    </span>
                  </div>
                  {targetPercent && (
                    <span className="text-[9px] text-emerald-400/70 font-mono tabular-nums">
                      +{targetPercent}%
                    </span>
                  )}
                </div>
              )}
              {signal.stopLoss && (
                <div className="text-center border-l border-border/30">
                  <div className="flex items-center justify-center gap-0.5">
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                    <span className="font-bold font-mono text-sm tabular-nums tracking-tight text-red-400">
                      ₹{signal.stopLoss.toLocaleString('en-IN')}
                    </span>
                  </div>
                  {slPercent && (
                    <span className="text-[9px] text-red-400/70 font-mono tabular-nums">
                      {slPercent}%
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* Price Distribution Bar */}
            {priceDistribution && (
              <div className="px-3 pb-2.5 pt-0.5">
                <div className="relative h-1.5 bg-muted/50 rounded-full">
                  <div
                    className="absolute top-0 h-full w-1 rounded-full bg-foreground/60"
                    style={{ left: `${priceDistribution.entry}%`, transform: 'translateX(-50%)' }}
                  />
                  <div
                    className="absolute top-0 h-full w-1.5 rounded-full bg-emerald-500"
                    style={{ left: `${priceDistribution.target}%`, transform: 'translateX(-50%)' }}
                  />
                  <div
                    className="absolute top-0 h-full w-1.5 rounded-full bg-red-500"
                    style={{ left: `${priceDistribution.stop}%`, transform: 'translateX(-50%)' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Risk/Reward + Countdown + Model */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {riskRewardRatio && (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-muted/50 px-1.5">
                  <span className="text-muted-foreground">R:R</span>
                  <span className={`font-bold ${
                    parseFloat(riskRewardRatio) >= 2 ? 'text-emerald-400' : parseFloat(riskRewardRatio) >= 1 ? 'text-amber-400' : 'text-red-400'
                  }`}>
                    1:{riskRewardRatio}
                  </span>
                </Badge>
              )}
              {signal.status === 'pending' && countdown > 0 && (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-500/15 text-amber-400 px-1.5 font-semibold">
                  <Clock className="h-2.5 w-2.5" />
                  {countdown}m
                </Badge>
              )}
              {signal.modelName && (
                <span className="text-[9px] text-muted-foreground tracking-wide">· {signal.modelName}</span>
              )}
            </div>
          </div>

          {/* Collapsible Reasoning */}
          {signal.reasoning && (
            <div className="rounded-lg bg-muted/20 border border-border/25 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-muted-foreground hover:bg-muted/30 transition-colors"
                onClick={(e) => { e.stopPropagation(); setReasoningExpanded(!reasoningExpanded) }}
              >
                <span className="flex items-center gap-1.5">
                  <Brain className="h-3 w-3" />
                  AI Reasoning
                </span>
                {reasoningExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              </button>
              <AnimatePresence>
                {reasoningExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="px-3 pb-2.5 text-xs text-muted-foreground leading-relaxed">
                      {signal.reasoning.split('.').filter(Boolean).map((sentence, i) => (
                        <div key={i} className="flex gap-1.5 mb-1">
                          <span className="text-emerald-500/70 mt-0.5 shrink-0">•</span>
                          <span>{sentence.trim()}.</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              {!reasoningExpanded && (
                <div className="px-3 pb-2 text-xs text-muted-foreground/70 leading-relaxed line-clamp-2">
                  {signal.reasoning}
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <Button
              size="sm"
              className={`w-full gap-2 text-sm h-9 font-bold tracking-tight transition-all duration-200 focus-ring ${
                isBuy
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-sm shadow-black/20 hover:shadow-md hover:shadow-emerald-500/20'
                  : 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white shadow-sm shadow-black/20 hover:shadow-md hover:shadow-red-500/20'
              }`}
              onClick={(e) => { e.stopPropagation(); handleExecute() }}
              disabled={isExecuting || signal.status === 'executed'}
            >
              {isExecuting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Executing...
                </>
              ) : signal.status === 'executed' ? (
                'Executed ✓'
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Execute Trade
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full gap-1.5 text-xs h-7 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30"
              onClick={(e) => { e.stopPropagation(); setDismissed(true) }}
            >
              <X className="h-3 w-3" />
              Dismiss
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
