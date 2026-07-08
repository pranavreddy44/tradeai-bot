'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  Clock,
  Loader2,
  Filter,
  Radio,
  Newspaper,
  Bot,
  Play,
  Square,
  AlertTriangle,
  Wifi,
  Sparkles,
  Activity,
  Trash2,
  Cpu,
  Copy,
  Timer,
  ArrowUpDown,
  Zap,
  ShieldCheck,
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  X,
  LineChart,
} from 'lucide-react'
import { useAutoTradeStore, type TradeSignal } from '@/lib/store/autotrade-store'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'


// ─── Validity Score Panel ──────────────────────────────────

interface ValidityResult {
  score: number
  verdict: 'valid' | 'stale' | 'invalidated'
  verdictLabel: string
  reasons: string[]
  livePrice?: number
}

function ValidityPanel({ signalId, onClose }: { signalId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState<ValidityResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/signals/${signalId}/validate`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setResult(data)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [signalId])

  const scoreColor = result
    ? result.score >= 65 ? 'text-emerald-400' : result.score >= 35 ? 'text-yellow-400' : 'text-red-400'
    : 'text-muted-foreground'

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-2 rounded-lg border border-border/30 bg-muted/10 overflow-hidden"
    >
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-muted-foreground tracking-wider">SIGNAL VALIDITY CHECK</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking live price + indicators...
          </div>
        )}

        {error && (
          <div className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> {error}
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold ${scoreColor}`}>{result.score}<span className="text-sm font-normal text-muted-foreground">/100</span></span>
              <span className={`text-xs font-semibold ${scoreColor}`}>{result.verdictLabel}</span>
              {result.livePrice && (
                <span className="text-[10px] text-muted-foreground ml-auto">CMP ₹{result.livePrice.toLocaleString()}</span>
              )}
            </div>
            <div className="space-y-1">
              {result.reasons.map((r, i) => (
                <div key={i} className="text-[10px] text-muted-foreground leading-relaxed">{r}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}


// ─── Outcome Buttons ───────────────────────────────────────

function OutcomeButtons({ signalId, currentOutcome, onOutcomeSet }: {
  signalId: string
  currentOutcome?: string | null
  onOutcomeSet: () => void
}) {
  const [loading, setLoading] = useState(false)

  const setOutcome = async (outcome: 'profit' | 'loss' | 'missed') => {
    setLoading(true)
    try {
      const res = await fetch(`/api/signals/${signalId}/outcome`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
      if (res.ok) {
        toast.success(`Marked as ${outcome}`, { description: 'Helps improve source rankings' })
        onOutcomeSet()
      } else {
        toast.error('Failed to save outcome')
      }
    } finally {
      setLoading(false)
    }
  }

  if (currentOutcome) {
    const color = currentOutcome === 'profit' ? 'text-emerald-400' : currentOutcome === 'loss' ? 'text-red-400' : 'text-muted-foreground'
    const icon = currentOutcome === 'profit' ? '✅' : currentOutcome === 'loss' ? '❌' : '⏭'
    return (
      <div className={`text-[9px] font-semibold ${color} flex items-center gap-0.5`}>
        {icon} {currentOutcome.charAt(0).toUpperCase() + currentOutcome.slice(1)}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1 mt-1">
      <span className="text-[9px] text-muted-foreground/60">Result:</span>
      <button
        onClick={() => setOutcome('profit')}
        disabled={loading}
        title="Mark as Profit"
        className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 transition-colors"
      >
        <ThumbsUp className="h-2.5 w-2.5" /> Win
      </button>
      <button
        onClick={() => setOutcome('loss')}
        disabled={loading}
        title="Mark as Loss"
        className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors"
      >
        <ThumbsDown className="h-2.5 w-2.5" /> Loss
      </button>
      <button
        onClick={() => setOutcome('missed')}
        disabled={loading}
        title="Missed / Skipped"
        className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded border border-border/30 text-muted-foreground hover:bg-muted/20 transition-colors"
      >
        <MinusCircle className="h-2.5 w-2.5" /> Skip
      </button>
    </div>
  )
}


// ─── Signal Card ───────────────────────────────────────────

function SignalCard({
  signal,
  onDelete,
  onRefresh,
}: {
  signal: TradeSignal & { fusionSources?: string | null; validityScore?: number | null; userOutcome?: string | null }
  onDelete: (id: string) => void
  onRefresh: () => void
}) {
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [showValidity, setShowValidity] = useState(false)
  const isBuy = signal.action === 'BUY'
  const isFusion = Boolean(signal.fusionSources && signal.fusionSources.includes(','))

  const isCashStock = /^[A-Z0-9&\-]+$/i.test(signal.symbol)
  const financeUrl = isCashStock
    ? `https://www.google.com/finance/beta/quote/${encodeURIComponent(signal.symbol)}:NSE`
    : `https://www.google.com/search?tbm=fin&q=${encodeURIComponent(signal.symbol)}`

  const sourceIcon = signal.source === 'telegram-chart-image'
    ? <Activity className="h-3 w-3" />
    : signal.source === 'telegram-image'
    ? <Bot className="h-3 w-3" />
    : signal.source.startsWith('telegram')
    ? <Radio className="h-3 w-3" />
    : signal.source.startsWith('ai-news') || signal.source === 'news'
    ? <Newspaper className="h-3 w-3" />
    : signal.source === 'ai-rule'
    ? <Cpu className="h-3 w-3" />
    : <Bot className="h-3 w-3" />

  const sourceLabel = signal.source === 'telegram-chart-image'
    ? 'Chart'
    : signal.source === 'telegram-image'
    ? 'TG Image'
    : signal.source.startsWith('telegram')
    ? 'Telegram'
    : signal.source.startsWith('ai-news') || signal.source === 'news'
    ? 'AI News'
    : signal.source === 'ai-rule'
    ? 'Rule-Based'
    : signal.source === 'ai-technical'
    ? 'AI Tech'
    : 'Manual'

  const sourceTime = signal.sourceTimestamp || signal.createdAt
  const timeLabel = signal.sourceTimestamp
    ? signal.source.startsWith('ai-news') ? 'News' : signal.source.startsWith('telegram') ? 'Telegram' : 'Source'
    : 'Created'

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
      >
        <Card className={`border transition-colors ${
          isFusion
          ? 'bg-gradient-to-br from-violet-950/15 to-card border-violet-500/25 hover:border-violet-500/40'
          : isBuy
          ? 'bg-card border-emerald-800/20 hover:border-emerald-700/40'
          : 'bg-card border-red-800/20 hover:border-red-700/40'
        }`}>
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-2">
              <div className="flex-1 w-full min-w-0 space-y-2 overflow-hidden">

                {/* Symbol + Action + Badges row */}
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-bold text-sm text-foreground truncate min-w-0">{signal.symbol}</span>
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-1.5 py-0 h-5 font-semibold shrink-0 ${
                      isBuy
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}
                  >
                    {isBuy ? <TrendingUp className="h-2.5 w-2.5 mr-0.5 shrink-0" /> : <TrendingDown className="h-2.5 w-2.5 mr-0.5 shrink-0" />}
                    {signal.action}
                  </Badge>

                  {/* ⚡ Convergence badge */}
                  {isFusion && (
                    <Badge className="text-[9px] px-1.5 py-0 h-5 bg-violet-500/15 text-violet-300 border border-violet-500/25 shrink-0 gap-0.5">
                      <Zap className="h-2.5 w-2.5" /> CONVERGENCE
                    </Badge>
                  )}

                  {/* Validity score badge (if already checked) */}
                  {signal.validityScore != null && (
                    <Badge
                      variant="outline"
                      className={`text-[9px] px-1.5 py-0 h-5 shrink-0 ${
                        signal.validityScore >= 65 ? 'border-emerald-500/30 text-emerald-400' :
                        signal.validityScore >= 35 ? 'border-yellow-500/30 text-yellow-400' :
                        'border-red-500/30 text-red-400'
                      }`}
                    >
                      <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />{signal.validityScore}/100
                    </Badge>
                  )}

                  {signal.status === 'closed' && (
                    <Badge className="text-[10px] px-1.5 py-0 h-5 bg-muted/30 text-muted-foreground border border-border/30 shrink-0">
                      Closed
                    </Badge>
                  )}
                </div>

                {/* Price info */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                  <span className="shrink-0">Entry: ₹{signal.entryPrice.toLocaleString()}</span>
                  {signal.targetPrice && <span className="shrink-0 text-emerald-400/80">TGT: ₹{signal.targetPrice.toLocaleString()}</span>}
                  {signal.stopLoss && <span className="shrink-0 text-red-400/80">SL: ₹{signal.stopLoss.toLocaleString()}</span>}
                </div>

                {/* Source + Channel + Time */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {signal.postUrl ? (
                    <a
                      href={signal.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 hover:opacity-80 active:scale-95 transition-all shrink-0"
                      onClick={(e) => e.stopPropagation()}
                      title="Open original post"
                    >
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 gap-0.5 shrink-0 overflow-hidden max-w-[100px] cursor-pointer">
                        <span className="shrink-0">{sourceIcon}</span> <span className="truncate">{sourceLabel}</span>
                      </Badge>
                      {signal.channelId && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5 border-violet-500/30 bg-violet-500/10 text-violet-400 shrink-0 cursor-pointer hover:border-violet-400/50">
                          {signal.channelId}
                        </Badge>
                      )}
                    </a>
                  ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 gap-0.5 shrink-0 overflow-hidden max-w-[100px]">
                        <span className="shrink-0">{sourceIcon}</span> <span className="truncate">{sourceLabel}</span>
                      </Badge>
                      {signal.channelId && (
                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-5 border-violet-500/30 bg-violet-500/10 text-violet-400 shrink-0">
                          {signal.channelId}
                        </Badge>
                      )}
                    </div>
                  )}
                  {signal.tradeType && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-border/40 shrink-0">
                      {signal.tradeType}
                    </Badge>
                  )}
                  <span className="text-muted-foreground shrink-0 flex items-center gap-1 text-[10px]">
                    <Clock className="h-2.5 w-2.5 shrink-0" />
                    <span>{timeLabel}: {formatTime(sourceTime)}</span>
                    <span className="opacity-75 hidden md:inline ml-0.5">({formatExactTime(sourceTime)})</span>
                  </span>
                </div>

                {/* Reasoning */}
                {signal.reasoning && (
                  <p className="text-xs text-muted-foreground line-clamp-2 overflow-hidden min-w-0">{signal.reasoning}</p>
                )}

                {/* Validity panel (expandable) */}
                <AnimatePresence>
                  {showValidity && (
                    <ValidityPanel signalId={signal.id} onClose={() => setShowValidity(false)} />
                  )}
                </AnimatePresence>

                {/* Outcome feedback buttons */}
                <OutcomeButtons
                  signalId={signal.id}
                  currentOutcome={(signal as any).userOutcome}
                  onOutcomeSet={onRefresh}
                />
              </div>

              <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between shrink-0 gap-2 w-full sm:w-auto mt-1 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-0 border-border/20">
                {/* Confidence */}
                <div className="flex flex-col items-center sm:items-end">
                  <div className={`text-lg sm:text-lg font-bold ${
                    signal.confidence >= 75 ? 'text-emerald-400' : signal.confidence >= 50 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {signal.confidence}%
                  </div>
                  <div className="text-[10px] text-muted-foreground hidden sm:block">Confidence</div>
                </div>

                {/* Action buttons: Google Finance + Validity Check + Delete */}
                <div className="flex items-center justify-end gap-1">
                  <a
                    href={financeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={isCashStock ? "View on Google Finance Beta" : "Search on Google Finance"}
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      className="h-7 w-7 p-0 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/10 shrink-0"
                    >
                      <LineChart className="h-3 w-3" />
                    </Button>
                  </a>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 w-7 p-0 border-blue-500/20 text-blue-400 hover:bg-blue-500/10 shrink-0"
                    title="Check AI signal validity"
                    onClick={() => setShowValidity(v => !v)}
                  >
                    <ShieldCheck className="h-3 w-3" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0 text-muted-foreground/40 hover:text-red-400 shrink-0"
                    onClick={() => setConfirmDeleteOpen(true)}
                    title="Remove signal"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Remove Signal"
        description={`Remove the ${signal.action} signal for ${signal.symbol}? This cannot be undone.`}
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => onDelete(signal.id)}
      />
    </>
  )
}

// ─── Onboarding Card ──────────────────────────────────────

function OnboardingCard({ onStartBot }: { onStartBot: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-emerald-800/30 bg-gradient-to-br from-emerald-950/20 to-background">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <div className="text-4xl">📡</div>
            <div>
              <h3 className="text-lg font-bold">Signal Intelligence Ready</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Telegram & News signals → AI analysis → Manual decision
              </p>
            </div>

            <div className="space-y-2 text-left max-w-xs mx-auto">
              <div className="flex items-center gap-2 text-xs">
                <div className="h-5 w-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Wifi className="h-3 w-3 text-emerald-400" />
                </div>
                <span>Connect your Groww account in Setup</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="h-5 w-5 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
                  <Radio className="h-3 w-3 text-emerald-400" />
                </div>
                <span>Add Telegram channels for signals</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <div className="h-5 w-5 rounded-full bg-violet-500/10 flex items-center justify-center shrink-0">
                  <Zap className="h-3 w-3 text-violet-400" />
                </div>
                <span>⚡ Convergence signals = Telegram + News agree</span>
              </div>
            </div>

            <Button
              size="lg"
              className="w-full h-11 text-sm font-semibold gap-2 bg-emerald-600 hover:bg-emerald-700"
              onClick={onStartBot}
            >
              <Sparkles className="h-4 w-4" />
              START BOT
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

// ─── Helper ────────────────────────────────────────────────

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMin = Math.floor(diffMs / 60000)

    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })
  } catch {
    return 'N/A'
  }
}

function formatExactTime(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  } catch {
    return 'N/A'
  }
}


// ─── Signal Feed Component ─────────────────────────────────

interface SignalFeedProps {
  sourceFilter?: string
}

export function SignalFeed({ sourceFilter: externalSourceFilter }: SignalFeedProps) {
  const {
    signals, setSignals,
    signalFilter, setSignalFilter,
    loadingSignals, setLoadingSignals,
    config, updateConfig,
    addActivity,
  } = useAutoTradeStore()

  const [showClearMenu, setShowClearMenu] = useState(false)
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'confidence' | 'symbol'>('newest')
  const [tradeTypeFilter, setTradeTypeFilter] = useState<string>('all')
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [convergenceOnly, setConvergenceOnly] = useState(false)

  const effectiveSourceFilter = externalSourceFilter ?? sourceFilter

  const fetchSignals = useCallback(async () => {
    setLoadingSignals(true)
    try {
      const res = await fetch('/api/signals?limit=50')
      if (res.ok) {
        const data = await res.json()
        setSignals(data.signals || [])
      }
    } catch (err) {
      console.error('Failed to fetch signals:', err)
    } finally {
      setLoadingSignals(false)
    }
  }, [setSignals, setLoadingSignals])

  useEffect(() => {
    const autoDedup = async () => {
      try {
        await fetch('/api/signals', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'dedup' }),
        })
      } catch {
        // Silent fail
      }
    }
    autoDedup()
    fetchSignals()
    const interval = setInterval(fetchSignals, 30000)
    return () => clearInterval(interval)
  }, [fetchSignals])

  const deleteSignal = async (signalId: string) => {
    try {
      const res = await fetch(`/api/signals/${signalId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Signal removed')
        fetchSignals()
      } else {
        toast.error('Failed to remove signal')
      }
    } catch {
      toast.error('Failed to remove signal')
    }
  }

  const clearOldSignals = async (type: 'pending' | 'executed' | 'older24h' | 'all') => {
    try {
      let url = '/api/signals?'
      if (type === 'pending') url += 'status=pending'
      else if (type === 'executed') url += 'status=executed'
      else if (type === 'older24h') url += 'olderThan=24'
      else if (type === 'all') url += 'clearAll=true'

      const res = await fetch(url, { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json()
        toast.success(`Cleared ${data.deleted} signal(s)`)
        addActivity({ message: `Cleared ${data.deleted} old signals`, type: 'system' })
        fetchSignals()
      } else {
        toast.error('Failed to clear signals')
      }
    } catch {
      toast.error('Failed to clear signals')
    } finally {
      setShowClearMenu(false)
    }
  }

  const dedupSignals = async () => {
    try {
      const res = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dedup' }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.duplicatesRemoved > 0) {
          toast.success(`Removed ${data.duplicatesRemoved} duplicate signal(s)`)
          addActivity({ message: `Removed ${data.duplicatesRemoved} duplicate signals`, type: 'system' })
        } else {
          toast.info('No duplicate signals found')
        }
        fetchSignals()
      }
    } catch {
      toast.error('Failed to dedup signals')
    } finally {
      setShowClearMenu(false)
    }
  }

  const startBot = () => {
    updateConfig({ autoTrade: true })
    toast.success('Bot started!', { description: 'Signal ingestion is now active' })
    addActivity({ message: 'Bot started — signal ingestion enabled', type: 'system' })
    const aiTab = document.querySelector('[value="ai"]') as HTMLElement
    if (aiTab) aiTab.click()
  }

  const stopBot = () => {
    updateConfig({ autoTrade: false })
    toast.info('Bot stopped')
    addActivity({ message: 'Bot stopped', type: 'system' })
  }

  // Frontend dedup
  const dedupedSignals = useMemo(() => {
    const seen = new Map<string, TradeSignal>()
    for (const signal of signals) {
      const key = `${signal.symbol}:${signal.action}`
      if (!seen.has(key)) seen.set(key, signal)
    }
    return Array.from(seen.values())
  }, [signals])

  const filteredSignals = dedupedSignals
    .filter(s => {
      if (signalFilter === 'all') return true
      return s.action === signalFilter
    })
    .filter(s => {
      if (tradeTypeFilter === 'all') return true
      return (s.tradeType || '').toUpperCase() === tradeTypeFilter.toUpperCase()
    })
    .filter(s => {
      if (effectiveSourceFilter === 'all' || !effectiveSourceFilter) return true
      if ((s as any).channelId && (s as any).channelId === effectiveSourceFilter) return true
      if (s.source === effectiveSourceFilter) return true
      if (effectiveSourceFilter === 'telegram') return s.source.toLowerCase().startsWith('telegram')
      if (effectiveSourceFilter === 'ai-news') return s.source.startsWith('ai-news') || s.source === 'news'
      return false
    })
    .filter(s => {
      if (!convergenceOnly) return true
      const fs = (s as any).fusionSources as string | null | undefined
      return Boolean(fs && fs.includes(','))
    })
    .sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.sourceTimestamp || b.createdAt).getTime() - new Date(a.sourceTimestamp || a.createdAt).getTime()
      }
      if (sortBy === 'oldest') {
        return new Date(a.sourceTimestamp || a.createdAt).getTime() - new Date(b.sourceTimestamp || b.createdAt).getTime()
      }
      if (sortBy === 'confidence') return b.confidence - a.confidence
      if (sortBy === 'symbol') return a.symbol.localeCompare(b.symbol)
      return 0
    })

  const buyCount = dedupedSignals.filter(s => s.action === 'BUY').length
  const sellCount = dedupedSignals.filter(s => s.action === 'SELL').length
  const convergenceCount = dedupedSignals.filter(s => {
    const fs = (s as any).fusionSources as string | null | undefined
    return Boolean(fs && fs.includes(','))
  }).length
  const isBotRunning = config.autoTrade
  const noSignals = signals.length === 0 && !loadingSignals
  const duplicateCount = signals.length - dedupedSignals.length

  return (
    <div className="space-y-3">
      {/* Filter + Bot Toggle + Clear */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto">
          <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Button
            size="sm"
            variant={signalFilter === 'all' ? 'default' : 'ghost'}
            className="h-7 text-xs px-2.5 shrink-0"
            onClick={() => setSignalFilter('all')}
          >
            All ({signals.length})
          </Button>
          <Button
            size="sm"
            variant={signalFilter === 'BUY' ? 'default' : 'ghost'}
            className={`h-7 text-xs px-2.5 shrink-0 ${signalFilter === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
            onClick={() => setSignalFilter('BUY')}
          >
            <TrendingUp className="h-3 w-3 mr-0.5" /> Buy ({buyCount})
          </Button>
          <Button
            size="sm"
            variant={signalFilter === 'SELL' ? 'default' : 'ghost'}
            className={`h-7 text-xs px-2.5 shrink-0 ${signalFilter === 'SELL' ? 'bg-red-600 hover:bg-red-700' : ''}`}
            onClick={() => setSignalFilter('SELL')}
          >
            <TrendingDown className="h-3 w-3 mr-0.5" /> Sell ({sellCount})
          </Button>
          {/* ⚡ Convergence filter chip */}
          {convergenceCount > 0 && (
            <Button
              size="sm"
              variant={convergenceOnly ? 'default' : 'ghost'}
              className={`h-7 text-xs px-2.5 shrink-0 gap-1 ${convergenceOnly ? 'bg-violet-600 hover:bg-violet-700' : 'text-violet-400 hover:text-violet-300'}`}
              onClick={() => setConvergenceOnly(v => !v)}
            >
              <Zap className="h-3 w-3" /> ⚡ ({convergenceCount})
            </Button>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {duplicateCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1 border-amber-500/30 text-amber-400 hover:bg-amber-500/10 shrink-0"
              onClick={dedupSignals}
            >
              <Copy className="h-3 w-3" />
              <span className="hidden sm:inline">Dedup ({duplicateCount})</span>
            </Button>
          )}

          {signals.length > 0 && (
            <div className="relative">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground shrink-0"
                onClick={() => setShowClearMenu(!showClearMenu)}
              >
                <Trash2 className="h-3 w-3" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
              <AnimatePresence>
                {showClearMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: -5 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: -5 }}
                    className="absolute right-0 top-full mt-1 z-50 bg-popover border border-border rounded-lg shadow-lg overflow-hidden min-w-[160px]"
                  >
                    <div className="p-1">
                      <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 rounded transition-colors" onClick={() => clearOldSignals('pending')}>
                        Clear pending signals
                      </button>
                      <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 rounded transition-colors" onClick={() => clearOldSignals('executed')}>
                        Clear executed signals
                      </button>
                      <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-muted/50 rounded transition-colors flex items-center gap-1.5" onClick={() => clearOldSignals('older24h')}>
                        <Timer className="h-3 w-3" />
                        Clear old (&gt;24h)
                      </button>
                      <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-amber-500/10 text-amber-400 rounded transition-colors flex items-center gap-1.5" onClick={dedupSignals}>
                        <Copy className="h-3 w-3" />
                        Remove duplicates {duplicateCount > 0 ? `(${duplicateCount})` : ''}
                      </button>
                      <Separator className="my-1" />
                      <button className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded transition-colors" onClick={() => clearOldSignals('all')}>
                        Clear all signals
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Bot Toggle */}
          {isBotRunning ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1.5 border-emerald-500/30 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 shrink-0"
              onClick={stopBot}
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="hidden sm:inline">BOT RUNNING</span>
              <Square className="h-3 w-3" />
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 shrink-0"
              onClick={startBot}
            >
              <Play className="h-3 w-3" />
              <span className="hidden sm:inline">START BOT</span>
            </Button>
          )}
        </div>
      </div>

      {/* Refine and Sort */}
      <div className="flex flex-wrap items-center gap-2 pt-1.5 border-t border-border/10">
        <span className="text-[10px] font-medium text-muted-foreground mr-1">Refine:</span>

        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-[110px] h-7 text-xs bg-background/50 border-border/50">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="telegram">📡 Telegram</SelectItem>
            <SelectItem value="ai-news">📰 AI News</SelectItem>
            <SelectItem value="ai-technical">🤖 AI Tech</SelectItem>
            <SelectItem value="manual">✏️ Manual</SelectItem>
          </SelectContent>
        </Select>

        <Select value={tradeTypeFilter} onValueChange={setTradeTypeFilter}>
          <SelectTrigger className="w-[105px] h-7 text-xs bg-background/50 border-border/50">
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

        <span className="text-[10px] font-medium text-muted-foreground ml-auto mr-1 flex items-center gap-1 shrink-0">
          <ArrowUpDown className="h-3 w-3" /> Sort:
        </span>
        <Select value={sortBy} onValueChange={(val: any) => setSortBy(val)}>
          <SelectTrigger className="w-[115px] h-7 text-xs bg-background/50 border-border/50">
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

      {/* Close clear menu on click outside */}
      {showClearMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowClearMenu(false)} />
      )}

      {/* Onboarding or Signal list */}
      {noSignals && !isBotRunning ? (
        <OnboardingCard onStartBot={startBot} />
      ) : (
        <ScrollArea className="max-h-[calc(100vh-340px)]">
          <AnimatePresence mode="popLayout">
            {loadingSignals && signals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-3" />
                <p className="text-sm">Loading signals...</p>
              </div>
            ) : filteredSignals.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Radio className="h-8 w-8 mb-3 opacity-50" />
                <p className="text-sm">{convergenceOnly ? 'No convergence signals yet' : 'No signals yet'}</p>
                <p className="text-xs mt-1">
                  {convergenceOnly
                    ? 'Convergence signals appear when Telegram + News both mention the same stock'
                    : 'Run AI analysis or scan Telegram channels to generate signals'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 pr-1">
                {filteredSignals.map(signal => (
                  <SignalCard
                    key={signal.id}
                    signal={signal as any}
                    onDelete={deleteSignal}
                    onRefresh={fetchSignals}
                  />
                ))}
              </div>
            )}
          </AnimatePresence>
        </ScrollArea>
      )}
    </div>
  )
}
