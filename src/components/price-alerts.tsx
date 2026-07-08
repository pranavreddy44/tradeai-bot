'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useTradingStore } from '@/lib/store/trading-store'
import {
  BellRing,
  Plus,
  Trash2,
  TrendingUp,
  TrendingDown,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// --- Types ---
type AlertCondition = 'above_price' | 'below_price' | 'change_pct_above' | 'change_pct_below'

interface PriceAlert {
  id: string
  symbol: string
  condition: AlertCondition
  targetValue: number
  currentValue: number
  currentChangePct: number
  notify: boolean
  status: 'active' | 'triggered'
  triggeredAt?: string
  createdAt: string
}

// Mock current prices for watched stocks
const MOCK_PRICES: Record<string, { price: number; changePct: number }> = {
  RELIANCE: { price: 2945.60, changePct: 1.22 },
  TCS: { price: 3845.60, changePct: 1.11 },
  INFY: { price: 1568.45, changePct: -0.79 },
  HDFCBANK: { price: 1648.75, changePct: 1.14 },
  SBIN: { price: 786.45, changePct: -1.91 },
  ICICIBANK: { price: 1124.30, changePct: -0.72 },
  WIPRO: { price: 478.30, changePct: -1.79 },
  ITC: { price: 438.60, changePct: 1.25 },
  BHARTIARTL: { price: 1585.40, changePct: 1.84 },
  MARUTI: { price: 12485.50, changePct: 2.34 },
}

const CONDITION_LABELS: Record<AlertCondition, string> = {
  above_price: 'Above price',
  below_price: 'Below price',
  change_pct_above: 'Change % above',
  change_pct_below: 'Change % below',
}

const CONDITION_ICONS: Record<AlertCondition, typeof TrendingUp> = {
  above_price: ArrowUp,
  below_price: ArrowDown,
  change_pct_above: TrendingUp,
  change_pct_below: TrendingDown,
}

// Pre-seeded mock alerts
const INITIAL_ALERTS: PriceAlert[] = [
  {
    id: 'alert-1',
    symbol: 'RELIANCE',
    condition: 'above_price',
    targetValue: 3000,
    currentValue: 2945.60,
    currentChangePct: 1.22,
    notify: true,
    status: 'active',
    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'alert-2',
    symbol: 'TCS',
    condition: 'below_price',
    targetValue: 3800,
    currentValue: 3845.60,
    currentChangePct: 1.11,
    notify: true,
    status: 'active',
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'alert-3',
    symbol: 'INFY',
    condition: 'change_pct_below',
    targetValue: -0.5,
    currentValue: -0.79,
    currentChangePct: -0.79,
    notify: true,
    status: 'triggered',
    triggeredAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'alert-4',
    symbol: 'HDFCBANK',
    condition: 'change_pct_above',
    targetValue: 1.0,
    currentValue: 1.14,
    currentChangePct: 1.14,
    notify: false,
    status: 'triggered',
    triggeredAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: 'alert-5',
    symbol: 'SBIN',
    condition: 'below_price',
    targetValue: 750,
    currentValue: 786.45,
    currentChangePct: -1.91,
    notify: true,
    status: 'active',
    createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
  },
]

function getDistancePercent(alert: PriceAlert): number {
  if (alert.condition === 'above_price' || alert.condition === 'below_price') {
    return ((alert.targetValue - alert.currentValue) / alert.currentValue) * 100
  }
  // change_pct_above / change_pct_below
  return alert.targetValue - alert.currentChangePct
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function PriceAlerts() {
  const { settings } = useTradingStore()
  const watchlist = settings.watchlist

  const [alerts, setAlerts] = useState<PriceAlert[]>(INITIAL_ALERTS)
  const [collapsed, setCollapsed] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Form state
  const [formSymbol, setFormSymbol] = useState(watchlist[0] || 'RELIANCE')
  const [formCondition, setFormCondition] = useState<AlertCondition>('above_price')
  const [formValue, setFormValue] = useState('')
  const [formNotify, setFormNotify] = useState(true)

  // Track if initial load from localStorage has happened
  const initialLoadDone = useRef(false)

  // Load from localStorage on mount via lazy initializer
  // We use a ref + single effect to avoid setState-in-effect lint issue
  useEffect(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      try {
        const stored = localStorage.getItem('tradeai-price-alerts')
        if (stored) {
          const parsed = JSON.parse(stored) as PriceAlert[]
          // Use a microtask to avoid synchronous setState in effect
          queueMicrotask(() => setAlerts(parsed))
        }
      } catch {
        // Use initial alerts
      }
    }
  }, [])

  // Save to localStorage on change (skip the initial render)
  const isInitialRender = useRef(true)
  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false
      return
    }
    try {
      localStorage.setItem('tradeai-price-alerts', JSON.stringify(alerts))
    } catch {
      // ignore
    }
  }, [alerts])

  const handleCreateAlert = () => {
    const val = parseFloat(formValue)
    if (isNaN(val)) {
      toast.error('Please enter a valid number')
      return
    }

    const stockData = MOCK_PRICES[formSymbol]
    const currentPrice = stockData?.price ?? 0
    const currentChangePct = stockData?.changePct ?? 0

    const newAlert: PriceAlert = {
      id: `alert-${Date.now()}`,
      symbol: formSymbol,
      condition: formCondition,
      targetValue: val,
      currentValue: currentPrice,
      currentChangePct,
      notify: formNotify,
      status: 'active',
      createdAt: new Date().toISOString(),
    }

    setAlerts((prev) => [newAlert, ...prev])
    setShowForm(false)
    setFormValue('')
    toast.success(`Price alert created for ${formSymbol}`)
  }

  const handleDeleteAlert = (id: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id))
    setDeleteId(null)
    toast.success('Alert deleted')
  }

  const activeAlerts = alerts.filter((a) => a.status === 'active')
  const triggeredAlerts = alerts.filter((a) => a.status === 'triggered')

  return (
    <>
      <Card className="border-border/50 overflow-hidden">
        <CardHeader
          className="pb-2 px-4 pt-3 cursor-pointer select-none"
          onClick={() => setCollapsed(!collapsed)}
        >
          <CardTitle className="text-xs flex items-center justify-between">
            <span className="flex items-center gap-2">
              <BellRing className="h-3.5 w-3.5 text-emerald-500" />
              Price Alerts
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-emerald-500/15 text-emerald-400 ml-1">
                {activeAlerts.length} active
              </Badge>
              {triggeredAlerts.length > 0 && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400">
                  {triggeredAlerts.length} triggered
                </Badge>
              )}
            </span>
            <div className="flex items-center gap-2">
              {!showForm && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowForm(true)
                    setCollapsed(false)
                  }}
                >
                  <Plus className="h-3.5 w-3.5 text-emerald-400" />
                </Button>
              )}
              {collapsed ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          </CardTitle>
        </CardHeader>

        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CardContent className="px-4 pb-3 space-y-3">
                {/* Create Alert Form */}
                <AnimatePresence>
                  {showForm && (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-2.5 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-400 mb-1">
                        <Plus className="h-3 w-3" />
                        New Alert
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Symbol</label>
                          <Select value={formSymbol} onValueChange={setFormSymbol}>
                            <SelectTrigger className="h-7 text-xs bg-background/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {watchlist.map((s) => (
                                <SelectItem key={s} value={s}>{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Condition</label>
                          <Select value={formCondition} onValueChange={(v) => setFormCondition(v as AlertCondition)}>
                            <SelectTrigger className="h-7 text-xs bg-background/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(CONDITION_LABELS).map(([key, label]) => (
                                <SelectItem key={key} value={key}>{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">
                          {formCondition.includes('price') ? 'Target Price (₹)' : 'Target Change %'}
                        </label>
                        <Input
                          type="number"
                          step={formCondition.includes('price') ? '0.01' : '0.1'}
                          placeholder={formCondition.includes('price') ? 'e.g. 3000' : 'e.g. 2.5'}
                          className="h-7 text-xs bg-background/50 font-mono"
                          value={formValue}
                          onChange={(e) => setFormValue(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleCreateAlert()}
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={formNotify}
                            onCheckedChange={setFormNotify}
                            className="scale-75"
                          />
                          <span className="text-[10px] text-muted-foreground">Notify</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-[10px]"
                            onClick={() => {
                              setShowForm(false)
                              setFormValue('')
                            }}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="h-6 px-3 text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                            onClick={handleCreateAlert}
                            disabled={!formValue.trim()}
                          >
                            <Plus className="h-2.5 w-2.5" />
                            Create
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Alerts List */}
                <div className="max-h-64 overflow-y-auto custom-scrollbar space-y-1.5">
                  <AnimatePresence>
                    {alerts.map((alert, i) => {
                      const Icon = CONDITION_ICONS[alert.condition]
                      const distance = getDistancePercent(alert)
                      const isTriggered = alert.status === 'triggered'

                      return (
                        <motion.div
                          key={alert.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          transition={{ delay: i * 0.03, duration: 0.15 }}
                          className={`flex items-center gap-2 p-2 rounded-md text-xs transition-colors ${
                            isTriggered
                              ? 'bg-amber-500/5 border border-amber-500/15'
                              : 'bg-background/30 border border-border/20 hover:bg-muted/20'
                          }`}
                        >
                          {/* Status indicator */}
                          {isTriggered ? (
                            <span className="relative flex h-2.5 w-2.5 shrink-0">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                            </span>
                          ) : (
                            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 shrink-0" />
                          )}

                          {/* Symbol + Condition */}
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold truncate">{alert.symbol}</span>
                            <Badge
                              variant="outline"
                              className={`text-[9px] h-4 px-1 py-0 shrink-0 ${
                                isTriggered
                                  ? 'border-amber-500/30 text-amber-400'
                                  : 'border-border/30 text-muted-foreground'
                              }`}
                            >
                              <Icon className="h-2.5 w-2.5 mr-0.5" />
                              {CONDITION_LABELS[alert.condition]}
                            </Badge>
                          </div>

                          {/* Target Value */}
                          <span className="font-mono text-muted-foreground shrink-0 ml-auto">
                            {alert.condition.includes('price') ? `₹${alert.targetValue.toLocaleString('en-IN')}` : `${alert.targetValue > 0 ? '+' : ''}${alert.targetValue}%`}
                          </span>

                          {/* Current Value */}
                          <span className="font-mono shrink-0 text-[10px] text-muted-foreground">
                            now {alert.condition.includes('price')
                              ? `₹${alert.currentValue.toLocaleString('en-IN')}`
                              : `${alert.currentChangePct > 0 ? '+' : ''}${alert.currentChangePct.toFixed(2)}%`}
                          </span>

                          {/* Distance */}
                          <Badge
                            variant="secondary"
                            className={`text-[9px] h-4 px-1 py-0 shrink-0 ${
                              isTriggered
                                ? 'bg-emerald-500/15 text-emerald-400'
                                : distance > 0
                                ? 'bg-red-500/10 text-red-400'
                                : 'bg-emerald-500/10 text-emerald-400'
                            }`}
                          >
                            {isTriggered ? '✓' : `${distance > 0 ? '+' : ''}${distance.toFixed(1)}%`}
                          </Badge>

                          {/* Triggered time */}
                          {isTriggered && alert.triggeredAt && (
                            <span className="text-[9px] text-amber-400/70 shrink-0">
                              {formatTimeAgo(alert.triggeredAt)}
                            </span>
                          )}

                          {/* Delete */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 w-5 p-0 shrink-0 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                            onClick={() => setDeleteId(alert.id)}
                          >
                            <Trash2 className="h-2.5 w-2.5" />
                          </Button>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>

                  {alerts.length === 0 && !showForm && (
                    <div className="text-center py-4 text-muted-foreground">
                      <BellRing className="h-6 w-6 mx-auto mb-1.5 opacity-30" />
                      <p className="text-xs">No price alerts yet</p>
                      <Button
                        variant="link"
                        className="text-[10px] text-emerald-400 h-6 mt-1"
                        onClick={() => setShowForm(true)}
                      >
                        Create your first alert
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent className="sm:max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm">Delete Alert?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              This will permanently remove this price alert. You cannot undo this action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-8 text-xs bg-red-600 hover:bg-red-700 text-white"
              onClick={() => deleteId && handleDeleteAlert(deleteId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
