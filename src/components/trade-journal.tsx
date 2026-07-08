'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BookOpen,
  Star,
  Edit,
  Trash2,
  Plus,
  Filter,
  Calendar,
  Brain,
  ChevronDown,
  ChevronUp,
  Loader2,
  TrendingUp,
  TrendingDown,
  X,
  Search,
  BarChart3,
  Heart,
  Download,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { NIFTY50_SYMBOLS } from '@/lib/types/trading'
import { toast } from 'sonner'
import { quickExportCSV } from '@/components/export-dialog'

// --- Types ---
interface JournalEntry {
  id: string
  symbol: string
  exchange: string
  action: 'BUY' | 'SELL'
  entryPrice: number
  exitPrice: number | null
  quantity: number
  entryDate: string
  exitDate: string | null
  pnl: number | null
  emotion: string | null
  strategy: string | null
  notes: string | null
  lessons: string | null
  rating: number
  tags: string | null
  createdAt: string
  updatedAt: string
}

interface JournalStats {
  totalEntries: number
  winCount: number
  lossCount: number
  winRate: number
  avgPnl: number
  totalPnl: number
  mostCommonEmotion: string | null
  avgRating: number
  bestStrategy: string | null
}

type EmotionOption = {
  label: string
  emoji: string
  value: string
  color: string
  bgColor: string
}

const EMOTIONS: EmotionOption[] = [
  { label: 'Confident', emoji: '😊', value: 'Confident', color: 'text-green-400', bgColor: 'bg-green-500/20 border-green-500/30' },
  { label: 'Anxious', emoji: '😰', value: 'Anxious', color: 'text-yellow-400', bgColor: 'bg-yellow-500/20 border-yellow-500/30' },
  { label: 'FOMO', emoji: '🤑', value: 'FOMO', color: 'text-orange-400', bgColor: 'bg-orange-500/20 border-orange-500/30' },
  { label: 'Greedy', emoji: '💰', value: 'Greedy', color: 'text-amber-400', bgColor: 'bg-amber-500/20 border-amber-500/30' },
  { label: 'Fearful', emoji: '😱', value: 'Fearful', color: 'text-red-400', bgColor: 'bg-red-500/20 border-red-500/30' },
  { label: 'Calm', emoji: '🧘', value: 'Calm', color: 'text-cyan-400', bgColor: 'bg-cyan-500/20 border-cyan-500/30' },
]

const EMPTY_FORM = {
  symbol: '',
  exchange: 'NSE',
  action: 'BUY' as 'BUY' | 'SELL',
  entryPrice: '',
  exitPrice: '',
  quantity: '1',
  entryDate: new Date().toISOString().split('T')[0],
  exitDate: '',
  emotion: '',
  strategy: '',
  notes: '',
  lessons: '',
  rating: 3,
  tags: '',
}

export function TradeJournal() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filters
  const [filterEmotion, setFilterEmotion] = useState<string>('all')
  const [filterAction, setFilterAction] = useState<string>('all')
  const [sortBy, setSortBy] = useState<string>('entryDate')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [showFilters, setShowFilters] = useState(false)

  // Symbol autocomplete
  const [symbolSearch, setSymbolSearch] = useState('')
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false)

  const filteredSymbols = symbolSearch
    ? NIFTY50_SYMBOLS.filter(s => s.toLowerCase().includes(symbolSearch.toLowerCase())).slice(0, 8)
    : NIFTY50_SYMBOLS.slice(0, 8)

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterEmotion !== 'all') params.set('emotion', filterEmotion)
      if (filterAction !== 'all') params.set('action', filterAction)
      params.set('sortBy', sortBy)
      params.set('sortOrder', sortOrder)

      const res = await fetch(`/api/journal?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries)
      }
    } catch (err) {
      console.error('Error fetching journal entries:', err)
    } finally {
      setLoading(false)
    }
  }, [filterEmotion, filterAction, sortBy, sortOrder])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // Compute stats
  const stats: JournalStats = (() => {
    const closed = entries.filter(e => e.pnl !== null)
    const wins = closed.filter(e => (e.pnl ?? 0) > 0)
    const losses = closed.filter(e => (e.pnl ?? 0) < 0)
    const totalPnl = closed.reduce((sum, e) => sum + (e.pnl ?? 0), 0)
    const avgPnl = closed.length > 0 ? totalPnl / closed.length : 0
    const avgRating = entries.length > 0
      ? entries.reduce((sum, e) => sum + e.rating, 0) / entries.length
      : 0

    // Most common emotion
    const emotionCounts: Record<string, number> = {}
    entries.forEach(e => {
      if (e.emotion) emotionCounts[e.emotion] = (emotionCounts[e.emotion] || 0) + 1
    })
    const mostCommonEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null

    // Best performing strategy
    const strategyPnl: Record<string, { total: number; count: number }> = {}
    closed.forEach(e => {
      if (e.strategy) {
        if (!strategyPnl[e.strategy]) strategyPnl[e.strategy] = { total: 0, count: 0 }
        strategyPnl[e.strategy].total += e.pnl ?? 0
        strategyPnl[e.strategy].count++
      }
    })
    const bestStrategy = Object.entries(strategyPnl)
      .sort((a, b) => (b[1].total / b[1].count) - (a[1].total / a[1].count))[0]?.[0] || null

    return {
      totalEntries: entries.length,
      winCount: wins.length,
      lossCount: losses.length,
      winRate: closed.length > 0 ? (wins.length / closed.length) * 100 : 0,
      avgPnl,
      totalPnl,
      mostCommonEmotion,
      avgRating,
      bestStrategy,
    }
  })()

  // Form handlers
  const handleFormChange = (field: string, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleSymbolSelect = (symbol: string) => {
    setForm(prev => ({ ...prev, symbol }))
    setSymbolSearch(symbol)
    setShowSymbolDropdown(false)
  }

  const resetForm = () => {
    setForm({ ...EMPTY_FORM })
    setEditingId(null)
    setSymbolSearch('')
    setShowSymbolDropdown(false)
  }

  const handleSubmit = async () => {
    if (!form.symbol || !form.entryPrice || !form.quantity) {
      toast.error('Please fill in required fields: Symbol, Entry Price, Quantity')
      return
    }

    setSaving(true)
    try {
      const payload = {
        symbol: form.symbol,
        exchange: form.exchange,
        action: form.action,
        entryPrice: parseFloat(form.entryPrice),
        exitPrice: form.exitPrice ? parseFloat(form.exitPrice) : null,
        quantity: parseInt(form.quantity),
        entryDate: form.entryDate,
        exitDate: form.exitDate || null,
        emotion: form.emotion || null,
        strategy: form.strategy || null,
        notes: form.notes || null,
        lessons: form.lessons || null,
        rating: form.rating,
        tags: form.tags || null,
      }

      if (editingId) {
        const res = await fetch(`/api/journal/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          toast.success('Journal entry updated!')
        } else {
          toast.error('Failed to update entry')
        }
      } else {
        const res = await fetch('/api/journal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          toast.success('Journal entry created!')
        } else {
          toast.error('Failed to create entry')
        }
      }

      resetForm()
      setShowForm(false)
      fetchEntries()
    } catch {
      toast.error('Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (entry: JournalEntry) => {
    setEditingId(entry.id)
    setForm({
      symbol: entry.symbol,
      exchange: entry.exchange,
      action: entry.action as 'BUY' | 'SELL',
      entryPrice: entry.entryPrice.toString(),
      exitPrice: entry.exitPrice?.toString() || '',
      quantity: entry.quantity.toString(),
      entryDate: entry.entryDate.split('T')[0],
      exitDate: entry.exitDate?.split('T')[0] || '',
      emotion: entry.emotion || '',
      strategy: entry.strategy || '',
      notes: entry.notes || '',
      lessons: entry.lessons || '',
      rating: entry.rating,
      tags: entry.tags || '',
    })
    setSymbolSearch(entry.symbol)
    setShowForm(true)
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/journal/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Entry deleted')
        fetchEntries()
      } else {
        toast.error('Failed to delete entry')
      }
    } catch {
      toast.error('Something went wrong')
    }
  }

  const getEmotionConfig = (emotion: string | null): EmotionOption | undefined => {
    if (!emotion) return undefined
    return EMOTIONS.find(e => e.value === emotion)
  }

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  const formatPnl = (pnl: number | null) => {
    if (pnl === null) return '—'
    const sign = pnl >= 0 ? '+' : ''
    return `${sign}₹${pnl.toFixed(2)}`
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <Card className="border-border/50 bg-card/80 backdrop-blur-sm">
        <CardHeader className="pb-2">
          <div
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-400" />
              <CardTitle className="text-base font-semibold">Trade Journal</CardTitle>
              <Badge variant="secondary" className="text-xs">
                {entries.length} entries
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 border-border/50 hover:border-emerald-500/30 hover:text-emerald-400 transition-all"
                onClick={(e) => {
                  e.stopPropagation()
                  if (entries.length === 0) {
                    toast.info('No entries to export')
                    return
                  }
                  const data = entries.map((j) => ({
                    Symbol: j.symbol,
                    Exchange: j.exchange,
                    Action: j.action,
                    'Entry Price': j.entryPrice,
                    'Exit Price': j.exitPrice ?? '',
                    Quantity: j.quantity,
                    'P&L (₹)': j.pnl ?? '',
                    Emotion: j.emotion ?? '',
                    Strategy: j.strategy ?? '',
                    Rating: j.rating,
                    Tags: j.tags ?? '',
                    'Entry Date': j.entryDate,
                    'Created At': new Date(j.createdAt).toLocaleString('en-IN'),
                  }))
                  const headers = ['Symbol', 'Exchange', 'Action', 'Entry Price', 'Exit Price', 'Quantity', 'P&L (₹)', 'Emotion', 'Strategy', 'Rating', 'Tags', 'Entry Date', 'Created At']
                  quickExportCSV(data as unknown as Record<string, unknown>[], headers, 'tradeai-journal')
                }}
              >
                <Download className="h-3 w-3" />
                Export
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowForm(!showForm)
                  if (showForm) resetForm()
                }}
              >
                <Plus className="h-3 w-3" />
                {showForm ? 'Cancel' : 'New Entry'}
              </Button>
              {isCollapsed ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CardHeader>

        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <CardContent className="pt-0 space-y-4">
                {/* Statistics Summary Bar */}
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  <div className="rounded-lg bg-muted/50 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Win Rate</p>
                    <p className={`text-sm font-bold font-mono ${stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                      {stats.totalEntries > 0 ? `${stats.winRate.toFixed(0)}%` : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total P&L</p>
                    <p className={`text-sm font-bold font-mono ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {stats.totalEntries > 0 ? formatPnl(stats.totalPnl) : '—'}
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Rating</p>
                    <p className="text-sm font-bold font-mono text-yellow-400">
                      {stats.totalEntries > 0 ? stats.avgRating.toFixed(1) : '—'} ⭐
                    </p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-2 text-center">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Top Emotion</p>
                    <p className="text-sm font-bold">
                      {stats.mostCommonEmotion
                        ? `${EMOTIONS.find(e => e.value === stats.mostCommonEmotion)?.emoji || ''} ${stats.mostCommonEmotion}`
                        : '—'}
                    </p>
                  </div>
                </div>

                {/* Best Strategy */}
                {stats.bestStrategy && (
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                    <Brain className="h-3.5 w-3.5 text-emerald-400" />
                    <span className="text-xs text-muted-foreground">Best Strategy:</span>
                    <span className="text-xs font-semibold text-emerald-400">{stats.bestStrategy}</span>
                  </div>
                )}

                {/* Journal Entry Form */}
                <AnimatePresence>
                  {showForm && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="rounded-lg border border-border/50 bg-muted/30 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-semibold flex items-center gap-2">
                            <Edit className="h-3.5 w-3.5" />
                            {editingId ? 'Edit Entry' : 'New Trade Entry'}
                          </h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => {
                              setShowForm(false)
                              resetForm()
                            }}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        {/* Row 1: Symbol & Action */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Symbol *</Label>
                            <div className="relative">
                              <Input
                                value={symbolSearch}
                                onChange={(e) => {
                                  setSymbolSearch(e.target.value)
                                  setForm(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))
                                  setShowSymbolDropdown(true)
                                }}
                                placeholder="e.g. RELIANCE"
                                className="h-8 text-xs font-mono uppercase"
                              />
                              <AnimatePresence>
                                {showSymbolDropdown && symbolSearch.length > 0 && filteredSymbols.length > 0 && (
                                  <motion.div
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -4 }}
                                    className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto"
                                  >
                                    {filteredSymbols.map(s => (
                                      <button
                                        key={s}
                                        className="w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-accent transition-colors"
                                        onClick={() => handleSymbolSelect(s)}
                                      >
                                        {s}
                                      </button>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Action *</Label>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant={form.action === 'BUY' ? 'default' : 'outline'}
                                className={`flex-1 h-8 text-xs ${form.action === 'BUY' ? 'bg-green-600 hover:bg-green-700' : ''}`}
                                onClick={() => handleFormChange('action', 'BUY')}
                              >
                                <TrendingUp className="h-3 w-3 mr-1" />
                                BUY
                              </Button>
                              <Button
                                size="sm"
                                variant={form.action === 'SELL' ? 'default' : 'outline'}
                                className={`flex-1 h-8 text-xs ${form.action === 'SELL' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                                onClick={() => handleFormChange('action', 'SELL')}
                              >
                                <TrendingDown className="h-3 w-3 mr-1" />
                                SELL
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Row 2: Prices & Quantity */}
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Entry Price *</Label>
                            <Input
                              type="number"
                              step="0.05"
                              value={form.entryPrice}
                              onChange={(e) => handleFormChange('entryPrice', e.target.value)}
                              placeholder="0.00"
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Exit Price</Label>
                            <Input
                              type="number"
                              step="0.05"
                              value={form.exitPrice}
                              onChange={(e) => handleFormChange('exitPrice', e.target.value)}
                              placeholder="0.00"
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Qty *</Label>
                            <Input
                              type="number"
                              value={form.quantity}
                              onChange={(e) => handleFormChange('quantity', e.target.value)}
                              placeholder="1"
                              className="h-8 text-xs font-mono"
                            />
                          </div>
                        </div>

                        {/* Row 3: Dates */}
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-xs flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> Entry Date *
                            </Label>
                            <Input
                              type="date"
                              value={form.entryDate}
                              onChange={(e) => handleFormChange('entryDate', e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> Exit Date
                            </Label>
                            <Input
                              type="date"
                              value={form.exitDate}
                              onChange={(e) => handleFormChange('exitDate', e.target.value)}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>

                        {/* Row 4: Emotion Selector */}
                        <div className="space-y-1.5">
                          <Label className="text-xs flex items-center gap-1">
                            <Heart className="h-3 w-3" /> Emotion During Trade
                          </Label>
                          <div className="flex flex-wrap gap-1.5">
                            {EMOTIONS.map(em => (
                              <button
                                key={em.value}
                                type="button"
                                onClick={() => handleFormChange('emotion', form.emotion === em.value ? '' : em.value)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-all ${
                                  form.emotion === em.value
                                    ? `${em.bgColor} ${em.color} ring-1 ring-current`
                                    : 'border-border/50 text-muted-foreground hover:border-border'
                                }`}
                              >
                                <span>{em.emoji}</span>
                                <span>{em.label}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Row 5: Rating Stars */}
                        <div className="space-y-1.5">
                          <Label className="text-xs flex items-center gap-1">
                            <Star className="h-3 w-3" /> Plan Adherence Rating
                          </Label>
                          <div className="flex gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                              <button
                                key={star}
                                type="button"
                                onClick={() => handleFormChange('rating', star)}
                                className="focus:outline-none transition-transform hover:scale-110"
                              >
                                <Star
                                  className={`h-5 w-5 ${
                                    star <= form.rating
                                      ? 'text-yellow-400 fill-yellow-400'
                                      : 'text-muted-foreground/30'
                                  }`}
                                />
                              </button>
                            ))}
                            <span className="text-xs text-muted-foreground ml-2 self-center">
                              {form.rating}/5
                            </span>
                          </div>
                        </div>

                        {/* Row 6: Strategy */}
                        <div className="space-y-1.5">
                          <Label className="text-xs flex items-center gap-1">
                            <Brain className="h-3 w-3" /> Strategy Name
                          </Label>
                          <Input
                            value={form.strategy}
                            onChange={(e) => handleFormChange('strategy', e.target.value)}
                            placeholder="e.g. Breakout Scalp, Momentum Swing"
                            className="h-8 text-xs"
                          />
                        </div>

                        {/* Row 7: Notes */}
                        <div className="space-y-1.5">
                          <Label className="text-xs">Trade Notes</Label>
                          <Textarea
                            value={form.notes}
                            onChange={(e) => handleFormChange('notes', e.target.value)}
                            placeholder="What was the setup? Why did you enter?"
                            className="min-h-[60px] text-xs resize-none"
                          />
                        </div>

                        {/* Row 8: Lessons Learned */}
                        <div className="space-y-1.5">
                          <Label className="text-xs">Lessons Learned</Label>
                          <Textarea
                            value={form.lessons}
                            onChange={(e) => handleFormChange('lessons', e.target.value)}
                            placeholder="What did you learn from this trade?"
                            className="min-h-[60px] text-xs resize-none"
                          />
                        </div>

                        {/* Row 9: Tags */}
                        <div className="space-y-1.5">
                          <Label className="text-xs">Tags (comma-separated)</Label>
                          <Input
                            value={form.tags}
                            onChange={(e) => handleFormChange('tags', e.target.value)}
                            placeholder="e.g. breakout, nifty, intraday"
                            className="h-8 text-xs"
                          />
                        </div>

                        {/* Submit */}
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            className="flex-1 h-8 text-xs gap-1"
                            onClick={handleSubmit}
                            disabled={saving}
                          >
                            {saving ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Plus className="h-3.5 w-3.5" />
                            )}
                            {editingId ? 'Update Entry' : 'Save Entry'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => {
                              setShowForm(false)
                              resetForm()
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Filters & Sort */}
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => setShowFilters(!showFilters)}
                  >
                    <Filter className="h-3 w-3" />
                    Filters
                    {(filterEmotion !== 'all' || filterAction !== 'all') && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    )}
                  </Button>

                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger className="h-7 w-[120px] text-xs">
                      <BarChart3 className="h-3 w-3 mr-1" />
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entryDate">Date</SelectItem>
                      <SelectItem value="pnl">P&L</SelectItem>
                      <SelectItem value="rating">Rating</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                  >
                    {sortOrder === 'desc' ? '↓' : '↑'}
                  </Button>
                </div>

                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="overflow-hidden"
                    >
                      <div className="flex gap-2 flex-wrap p-2 rounded-md bg-muted/30 border border-border/30">
                        <Select value={filterEmotion} onValueChange={setFilterEmotion}>
                          <SelectTrigger className="h-7 w-[130px] text-xs">
                            <SelectValue placeholder="Emotion" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Emotions</SelectItem>
                            {EMOTIONS.map(em => (
                              <SelectItem key={em.value} value={em.value}>
                                {em.emoji} {em.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        <Select value={filterAction} onValueChange={setFilterAction}>
                          <SelectTrigger className="h-7 w-[100px] text-xs">
                            <SelectValue placeholder="Action" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All</SelectItem>
                            <SelectItem value="BUY">BUY</SelectItem>
                            <SelectItem value="SELL">SELL</SelectItem>
                          </SelectContent>
                        </Select>

                        {(filterEmotion !== 'all' || filterAction !== 'all') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1"
                            onClick={() => {
                              setFilterEmotion('all')
                              setFilterAction('all')
                            }}
                          >
                            <X className="h-3 w-3" /> Clear
                          </Button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <Separator className="opacity-50" />

                {/* Entries List */}
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : entries.length === 0 ? (
                  <div className="text-center py-8">
                    <BookOpen className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-xs text-muted-foreground">No journal entries yet</p>
                    <p className="text-xs text-muted-foreground/70">Click &quot;New Entry&quot; to log your first trade</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-1 custom-scrollbar">
                    <AnimatePresence>
                      {entries.map(entry => {
                        const emotionConfig = getEmotionConfig(entry.emotion)
                        const isExpanded = expandedId === entry.id
                        const pnlColor = entry.pnl !== null
                          ? entry.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                          : 'text-muted-foreground'

                        return (
                          <motion.div
                            key={entry.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -5 }}
                            className="rounded-lg border border-border/40 bg-muted/20 hover:bg-muted/30 transition-colors"
                          >
                            {/* Card Header - Always Visible */}
                            <div
                              className="p-3 cursor-pointer"
                              onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono font-bold text-sm">{entry.symbol}</span>
                                  <Badge
                                    variant="secondary"
                                    className={`text-[10px] px-1.5 py-0 ${
                                      entry.action === 'BUY'
                                        ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                        : 'bg-red-500/20 text-red-400 border-red-500/30'
                                    }`}
                                  >
                                    {entry.action}
                                  </Badge>
                                  {emotionConfig && (
                                    <span
                                      className={`text-[10px] px-1.5 py-0.5 rounded-full border ${emotionConfig.bgColor} ${emotionConfig.color}`}
                                    >
                                      {emotionConfig.emoji} {entry.emotion}
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-mono text-sm font-bold ${pnlColor}`}>
                                    {formatPnl(entry.pnl)}
                                  </span>
                                  {isExpanded ? (
                                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : (
                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                </div>
                              </div>

                              {/* Quick Info Row */}
                              <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground">
                                <span className="font-mono">
                                  ₹{entry.entryPrice.toFixed(2)}
                                  {entry.exitPrice ? ` → ₹${entry.exitPrice.toFixed(2)}` : ' → open'}
                                </span>
                                <span>×{entry.quantity}</span>
                                <span>{formatDate(entry.entryDate)}</span>
                                <span className="flex items-center gap-0.5">
                                  {Array.from({ length: 5 }).map((_, i) => (
                                    <Star
                                      key={i}
                                      className={`h-2.5 w-2.5 ${
                                        i < entry.rating
                                          ? 'text-yellow-400 fill-yellow-400'
                                          : 'text-muted-foreground/20'
                                      }`}
                                    />
                                  ))}
                                </span>
                              </div>

                              {/* Strategy + Notes preview */}
                              <div className="flex items-center gap-2 mt-1.5">
                                {entry.strategy && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
                                    <Brain className="h-2.5 w-2.5 mr-0.5" />
                                    {entry.strategy}
                                  </Badge>
                                )}
                                {entry.notes && !isExpanded && (
                                  <span className="text-[10px] text-muted-foreground truncate">
                                    {entry.notes.substring(0, 80)}{entry.notes.length > 80 ? '...' : ''}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Expanded Details */}
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.15 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-3 pb-3 space-y-2 border-t border-border/30 pt-2">
                                    {entry.exitPrice && (
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                          <span className="text-muted-foreground">Entry:</span>
                                          <span className="ml-1 font-mono">₹{entry.entryPrice.toFixed(2)}</span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Exit:</span>
                                          <span className="ml-1 font-mono">₹{entry.exitPrice.toFixed(2)}</span>
                                        </div>
                                      </div>
                                    )}

                                    {entry.exitDate && (
                                      <div className="text-xs">
                                        <span className="text-muted-foreground">Exit Date:</span>
                                        <span className="ml-1">{formatDate(entry.exitDate)}</span>
                                      </div>
                                    )}

                                    {entry.notes && (
                                      <div className="text-xs">
                                        <span className="text-muted-foreground block mb-0.5">Notes:</span>
                                        <p className="text-foreground/80 whitespace-pre-wrap">{entry.notes}</p>
                                      </div>
                                    )}

                                    {entry.lessons && (
                                      <div className="text-xs">
                                        <span className="text-muted-foreground block mb-0.5">Lessons:</span>
                                        <p className="text-emerald-400/80 whitespace-pre-wrap">{entry.lessons}</p>
                                      </div>
                                    )}

                                    {entry.tags && (
                                      <div className="flex flex-wrap gap-1">
                                        {entry.tags.split(',').map((tag, i) => (
                                          <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                                            {tag.trim()}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}

                                    <div className="flex items-center gap-2 pt-1">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 text-xs gap-1"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleEdit(entry)
                                        }}
                                      >
                                        <Edit className="h-3 w-3" /> Edit
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 text-xs gap-1 text-red-400 hover:text-red-300"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleDelete(entry.id)
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" /> Delete
                                      </Button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        )
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  )
}
