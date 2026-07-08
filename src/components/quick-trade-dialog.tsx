'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useTradingStore } from '@/lib/store/trading-store'
import { NSE_SYMBOLS } from '@/lib/types/trading'
import { watchlistData } from '@/lib/mock-data'
import {
  TrendingUp,
  TrendingDown,
  Loader2,
  Zap,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

interface QuickTradeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function QuickTradeDialog({ open, onOpenChange }: QuickTradeDialogProps) {
  const { addSignal, signals } = useTradingStore()

  const [symbol, setSymbol] = useState('RELIANCE')
  const [action, setAction] = useState<'BUY' | 'SELL'>('BUY')
  const [quantity, setQuantity] = useState(10)
  const [entryPrice, setEntryPrice] = useState(0)
  const [targetPrice, setTargetPrice] = useState('')
  const [stopLoss, setStopLoss] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Pre-fill entry price when symbol changes
  useEffect(() => {
    const watchItem = watchlistData.find((w) => w.symbol === symbol)
    if (watchItem) {
      setEntryPrice(watchItem.price)
    } else {
      setEntryPrice(0)
    }
  }, [symbol])

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setSymbol('RELIANCE')
      setAction('BUY')
      setQuantity(10)
      setTargetPrice('')
      setStopLoss('')
      setNotes('')
    }
  }, [open])

  const pendingCount = signals.filter((s) => s.status === 'pending').length

  const handleSubmit = async () => {
    if (!symbol || !entryPrice || !quantity) {
      toast.error('Please fill in required fields')
      return
    }

    setIsSubmitting(true)
    try {
      const now = new Date().toISOString()
      const signalId = `sig-qt-${Date.now()}`
      const positionId = `pos-qt-${Date.now()}`

      const signalPayload = {
        symbol,
        exchange: 'NSE',
        action,
        source: 'manual',
        confidence: 100,
        entryPrice,
        targetPrice: targetPrice ? Number(targetPrice) : undefined,
        stopLoss: stopLoss ? Number(stopLoss) : undefined,
        quantity,
        reasoning: notes || `Manual ${action} signal via Quick Trade`,
        status: 'pending',
      } as const

      // Create signal via API
      const signalRes = await fetch('/api/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signalPayload),
      })

      if (!signalRes.ok) {
        // Fallback to local store
        addSignal({
          id: signalId,
          ...signalPayload,
          pnl: undefined,
          modelName: undefined,
          channelId: undefined,
          createdAt: now,
          updatedAt: now,
        })
      }

      // Create position via API
      const positionPayload = {
        symbol,
        exchange: 'NSE',
        action,
        quantity,
        entryPrice,
        currentPrice: entryPrice,
        status: 'open',
        signalId,
      }

      try {
        await fetch('/api/positions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(positionPayload),
        })
      } catch {
        // Position API may fail, that's OK
      }

      toast.success(`${action} ${symbol} × ${quantity} @ ₹${entryPrice.toLocaleString('en-IN')}`, {
        description: 'Trade signal and position created successfully',
      })

      onOpenChange(false)
    } catch {
      toast.error('Failed to create trade')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-500" />
            Quick Trade
          </DialogTitle>
          <DialogDescription>
            Create a manual trade signal and open a position instantly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Symbol */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Symbol</Label>
            <Select value={symbol} onValueChange={setSymbol}>
              <SelectTrigger className="bg-background/50">
                <SelectValue placeholder="Select symbol..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {NSE_SYMBOLS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Action Toggle */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Action</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={action === 'BUY' ? 'default' : 'outline'}
                className={`gap-2 ${
                  action === 'BUY'
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30'
                }`}
                onClick={() => setAction('BUY')}
              >
                <TrendingUp className="h-4 w-4" />
                BUY
              </Button>
              <Button
                type="button"
                variant={action === 'SELL' ? 'default' : 'outline'}
                className={`gap-2 ${
                  action === 'SELL'
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30'
                }`}
                onClick={() => setAction('SELL')}
              >
                <TrendingDown className="h-4 w-4" />
                SELL
              </Button>
            </div>
          </div>

          {/* Quantity + Entry Price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Quantity</Label>
              <Input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Entry Price (₹)</Label>
              <Input
                type="number"
                step={0.05}
                value={entryPrice || ''}
                onChange={(e) => setEntryPrice(Number(e.target.value))}
                className="bg-background/50"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Target Price + Stop Loss */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Target Price (₹) <span className="text-muted-foreground text-xs">optional</span>
              </Label>
              <Input
                type="number"
                step={0.05}
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="bg-background/50"
                placeholder="0.00"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Stop Loss (₹) <span className="text-muted-foreground text-xs">optional</span>
              </Label>
              <Input
                type="number"
                step={0.05}
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                className="bg-background/50"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Notes <span className="text-muted-foreground text-xs">optional</span>
            </Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this trade..."
              className="bg-background/50 min-h-[60px] resize-none"
              rows={2}
            />
          </div>

          {/* Order Value Preview */}
          {entryPrice > 0 && quantity > 0 && (
            <div className="rounded-lg bg-muted/30 border border-border/30 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Order Value</span>
                <span className="font-semibold">
                  ₹{(entryPrice * quantity).toLocaleString('en-IN')}
                </span>
              </div>
              {targetPrice && (
                <div className="flex items-center justify-between text-sm mt-1">
                  <span className="text-muted-foreground">Potential P&L</span>
                  <span className={`font-semibold ${
                    action === 'BUY'
                      ? Number(targetPrice) > entryPrice ? 'text-emerald-400' : 'text-red-400'
                      : Number(targetPrice) < entryPrice ? 'text-emerald-400' : 'text-red-400'
                  }`}>
                    {action === 'BUY' ? '+' : '-'}₹{Math.abs((Number(targetPrice) - entryPrice) * quantity).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !symbol || !entryPrice || !quantity}
            className={`gap-2 min-w-[120px] ${
              action === 'BUY'
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-red-600 hover:bg-red-700 text-white'
            }`}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : action === 'BUY' ? (
              <TrendingUp className="h-4 w-4" />
            ) : (
              <TrendingDown className="h-4 w-4" />
            )}
            {isSubmitting ? 'Submitting...' : action === 'BUY' ? 'Buy Now' : 'Sell Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Floating Action Button with pulse effect
export function QuickTradeFAB({
  onClick,
  pendingCount = 0,
}: {
  onClick: () => void
  pendingCount?: number
}) {
  return (
    <motion.button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-black/25 flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.95 }}
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.5 }}
      aria-label="Quick Trade"
    >
      <Zap className="h-6 w-6" />

      {/* Pulse effect when there are pending signals */}
      <AnimatePresence>
        {pendingCount > 0 && (
          <motion.span
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            className="absolute inset-0 rounded-full bg-primary/80"
          >
            <motion.span
              className="absolute inset-0 rounded-full bg-primary/60"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </motion.span>
        )}
      </AnimatePresence>

      {/* Pending count badge */}
      {pendingCount > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 h-5 min-w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1"
        >
          {pendingCount}
        </motion.span>
      )}
    </motion.button>
  )
}
