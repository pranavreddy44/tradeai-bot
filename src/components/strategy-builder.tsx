'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plus,
  Trash2,
  Play,
  Pause,
  Zap,
  Brain,
  TrendingUp,
  Filter,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { NIFTY50_SYMBOLS } from '@/lib/types/trading'
import { toast } from 'sonner'

// --- Types ---
interface StrategyRule {
  id: string
  indicator: string
  operator: string
  value: string
  logic?: 'AND' | 'OR' // logic connector to next rule
}

interface Strategy {
  id: string
  name: string
  description: string | null
  rules: string // JSON string of StrategyRule[]
  isActive: boolean
  symbol: string | null
  action: string
  confidence: number
  createdAt: string
  updatedAt: string
}

// --- Constants ---
const INDICATORS = [
  { value: 'RSI', label: 'RSI (Relative Strength Index)' },
  { value: 'SMA20', label: 'SMA 20 (Simple Moving Avg)' },
  { value: 'SMA50', label: 'SMA 50 (Simple Moving Avg)' },
  { value: 'EMA12', label: 'EMA 12 (Exponential Moving Avg)' },
  { value: 'EMA26', label: 'EMA 26 (Exponential Moving Avg)' },
  { value: 'MACD', label: 'MACD' },
  { value: 'BB_UPPER', label: 'Bollinger Band Upper' },
  { value: 'BB_LOWER', label: 'Bollinger Band Lower' },
  { value: 'VOLUME', label: 'Volume' },
  { value: 'VOLUME_AVG', label: 'Volume (vs Avg)' },
  { value: 'PRICE', label: 'Price' },
  { value: 'PE_RATIO', label: 'P/E Ratio' },
  { value: 'SENTIMENT', label: 'Sentiment Score' },
  { value: 'STOCHASTIC', label: 'Stochastic %K' },
  { value: 'ATR', label: 'ATR (Avg True Range)' },
] as const

const OPERATORS = [
  { value: '>', label: 'Greater than (>)' },
  { value: '<', label: 'Less than (<)' },
  { value: '=', label: 'Equals (=)' },
  { value: '>=', label: 'Greater or equal (≥)' },
  { value: '<=', label: 'Less or equal (≤)' },
  { value: 'crosses_above', label: 'Crosses above' },
  { value: 'crosses_below', label: 'Crosses below' },
] as const

function generateId(): string {
  return Math.random().toString(36).substring(2, 10)
}

function createEmptyRule(): StrategyRule {
  return {
    id: generateId(),
    indicator: 'RSI',
    operator: '>',
    value: '70',
  }
}

// --- Helper to parse rules from JSON ---
function parseRules(rulesJson: string): StrategyRule[] {
  try {
    return JSON.parse(rulesJson)
  } catch {
    return []
  }
}

// --- Component ---
export function StrategyBuilder() {
  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [symbol, setSymbol] = useState<string>('ALL')
  const [action, setAction] = useState<string>('BUY')
  const [confidence, setConfidence] = useState(70)
  const [rules, setRules] = useState<StrategyRule[]>([createEmptyRule()])

  // Saved strategies state
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [expanded, setExpanded] = useState(true)

  // Fetch strategies
  const fetchStrategies = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/strategies')
      if (res.ok) {
        const data = await res.json()
        setStrategies(data.strategies || [])
      }
    } catch (err) {
      console.error('Failed to fetch strategies:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStrategies()
  }, [fetchStrategies])

  // --- Rule Management ---
  const addRule = () => {
    setRules([...rules, { ...createEmptyRule(), logic: 'AND' }])
  }

  const removeRule = (id: string) => {
    if (rules.length <= 1) {
      toast.error('At least one rule is required')
      return
    }
    const updated = rules.filter((r) => r.id !== id)
    // Remove logic from first rule
    if (updated.length > 0) {
      delete updated[0].logic
    }
    setRules(updated)
  }

  const updateRule = (id: string, field: keyof StrategyRule, value: string) => {
    setRules(
      rules.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    )
  }

  // --- Save Strategy ---
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a strategy name')
      return
    }
    if (rules.length === 0) {
      toast.error('At least one rule is required')
      return
    }
    // Validate all rules have values
    const invalidRule = rules.find((r) => !r.value.trim())
    if (invalidRule) {
      toast.error('All rules must have a value')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        rules: rules.map(({ logic, ...rest }) => ({
          ...rest,
          ...(logic ? { logic } : {}),
        })),
        symbol: symbol === 'ALL' ? null : symbol,
        action,
        confidence,
        isActive: false,
      }

      const res = await fetch('/api/strategies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (res.ok) {
        toast.success('Strategy created successfully!')
        // Reset form
        setName('')
        setDescription('')
        setSymbol('ALL')
        setAction('BUY')
        setConfidence(70)
        setRules([createEmptyRule()])
        // Refresh list
        fetchStrategies()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to create strategy')
      }
    } catch (err) {
      console.error('Error saving strategy:', err)
      toast.error('Failed to save strategy')
    } finally {
      setSaving(false)
    }
  }

  // --- Toggle Strategy Active ---
  const toggleActive = async (strategy: Strategy) => {
    try {
      const res = await fetch(`/api/strategies/${strategy.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !strategy.isActive }),
      })
      if (res.ok) {
        toast.success(
          strategy.isActive ? 'Strategy deactivated' : 'Strategy activated'
        )
        fetchStrategies()
      } else {
        toast.error('Failed to update strategy')
      }
    } catch (err) {
      console.error('Error toggling strategy:', err)
      toast.error('Failed to update strategy')
    }
  }

  // --- Delete Strategy ---
  const deleteStrategy = async (id: string) => {
    try {
      const res = await fetch(`/api/strategies/${id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        toast.success('Strategy deleted')
        fetchStrategies()
      } else {
        toast.error('Failed to delete strategy')
      }
    } catch (err) {
      console.error('Error deleting strategy:', err)
      toast.error('Failed to delete strategy')
    }
  }

  // --- Render Rule Line ---
  const renderRule = (rule: StrategyRule, index: number) => (
    <motion.div
      key={rule.id}
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2 }}
      className="space-y-2"
    >
      {/* Logic connector (AND/OR) between rules */}
      {index > 0 && (
        <div className="flex items-center gap-2 pl-2">
          <div className="h-px flex-1 bg-border/50" />
          <Select
            value={rule.logic || 'AND'}
            onValueChange={(val) => updateRule(rule.id, 'logic', val)}
          >
            <SelectTrigger
              size="sm"
              className={`h-6 w-20 text-[10px] font-bold border-dashed ${
                rule.logic === 'OR'
                  ? 'border-amber-500/50 text-amber-400'
                  : 'border-emerald-500/50 text-emerald-400'
              }`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AND" className="text-emerald-400 text-xs font-bold">
                AND
              </SelectItem>
              <SelectItem value="OR" className="text-amber-400 text-xs font-bold">
                OR
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="h-px flex-1 bg-border/50" />
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {/* Indicator */}
        <Select
          value={rule.indicator}
          onValueChange={(val) => updateRule(rule.id, 'indicator', val)}
        >
          <SelectTrigger size="sm" className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INDICATORS.map((ind) => (
              <SelectItem key={ind.value} value={ind.value} className="text-xs">
                {ind.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Operator */}
        <Select
          value={rule.operator}
          onValueChange={(val) => updateRule(rule.id, 'operator', val)}
        >
          <SelectTrigger size="sm" className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((op) => (
              <SelectItem key={op.value} value={op.value} className="text-xs">
                {op.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Value */}
        <Input
          value={rule.value}
          onChange={(e) => updateRule(rule.id, 'value', e.target.value)}
          placeholder="Value"
          className="h-8 w-20 text-xs font-mono"
        />

        {/* Delete rule button */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => removeRule(rule.id)}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </motion.div>
  )

  return (
    <Card className="overflow-hidden rounded-xl shadow-sm shadow-black/10">
      <CardHeader
        className="pb-2 px-4 pt-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="section-header text-muted-foreground flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Brain className="h-3.5 w-3.5 text-amber-400" />
            Strategy Builder
          </span>
          <div className="flex items-center gap-2">
            {strategies.filter((s) => s.isActive).length > 0 && (
              <Badge className="text-[9px] px-1.5 py-0 bg-emerald-500/15 text-emerald-400 border-0">
                <Zap className="h-2.5 w-2.5 mr-0.5" />
                {strategies.filter((s) => s.isActive).length} active
              </Badge>
            )}
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </div>
        </CardTitle>
      </CardHeader>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <CardContent className="px-4 pb-3 space-y-3">
              {/* Strategy Name & Description */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Strategy name..."
                    className="h-8 text-xs flex-1"
                  />
                </div>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)..."
                  className="h-7 text-[11px]"
                />
              </div>

              {/* Symbol & Action Row */}
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Symbol
                  </Label>
                  <Select value={symbol} onValueChange={setSymbol}>
                    <SelectTrigger size="sm" className="h-8 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL" className="text-xs">
                        All Symbols
                      </SelectItem>
                      <SelectSeparator />
                      {NIFTY50_SYMBOLS.filter(
                        (s, i, arr) => arr.indexOf(s) === i
                      ).map((sym) => (
                        <SelectItem key={sym} value={sym} className="text-xs font-mono">
                          {sym}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-[10px] text-muted-foreground mb-1 block">
                    Action
                  </Label>
                  <Select value={action} onValueChange={setAction}>
                    <SelectTrigger
                      size="sm"
                      className={`h-8 w-[90px] text-xs font-bold ${
                        action === 'BUY'
                          ? 'text-emerald-400 border-emerald-500/30'
                          : 'text-red-400 border-red-500/30'
                      }`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="BUY" className="text-emerald-400 text-xs font-bold">
                        BUY
                      </SelectItem>
                      <SelectItem value="SELL" className="text-red-400 text-xs font-bold">
                        SELL
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Confidence Slider */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground">
                    Confidence Threshold
                  </Label>
                  <span className="text-xs font-mono font-semibold text-emerald-400">
                    {confidence}%
                  </span>
                </div>
                <Slider
                  value={[confidence]}
                  onValueChange={([v]) => setConfidence(v)}
                  min={0}
                  max={100}
                  step={5}
                  className="w-full [&_[data-slot=slider-range]]:bg-emerald-500 [&_[data-slot=slider-thumb]]:border-emerald-500"
                />
                <div className="flex justify-between text-[9px] text-muted-foreground">
                  <span>Low</span>
                  <span>Medium</span>
                  <span>High</span>
                </div>
              </div>

              <Separator className="bg-border/50" />

              {/* Rules Section */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Filter className="h-3 w-3" />
                    Conditions
                  </Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addRule}
                    className="h-6 text-[10px] text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 px-2"
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Rule
                  </Button>
                </div>

                <AnimatePresence>
                  {rules.map((rule, i) => renderRule(rule, i))}
                </AnimatePresence>
              </div>

              {/* Save Button */}
              <Button
                onClick={handleSave}
                disabled={saving}
                className="w-full h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                )}
                {saving ? 'Saving...' : 'Save Strategy'}
              </Button>

              {/* Saved Strategies List */}
              {strategies.length > 0 && (
                <>
                  <Separator className="bg-border/50" />
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Zap className="h-3 w-3" />
                      Saved Strategies
                      {loading && (
                        <Loader2 className="h-3 w-3 animate-spin ml-1" />
                      )}
                    </Label>
                    <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1">
                      <AnimatePresence>
                        {strategies.map((strategy, i) => {
                          const parsedRules = parseRules(strategy.rules)
                          return (
                            <motion.div
                              key={strategy.id}
                              initial={{ opacity: 0, x: -8 }}
                              animate={{ opacity: 1, x: 0 }}
                              exit={{ opacity: 0, x: 8 }}
                              transition={{ delay: i * 0.04 }}
                              className="flex items-center gap-2 rounded-md border border-border/50 bg-muted/20 px-2.5 py-1.5 hover:bg-muted/40 transition-colors"
                            >
                              {/* Active toggle */}
                              <Switch
                                checked={strategy.isActive}
                                onCheckedChange={() => toggleActive(strategy)}
                                className="scale-75 data-[state=checked]:bg-emerald-500"
                              />

                              {/* Strategy info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs font-medium truncate">
                                    {strategy.name}
                                  </span>
                                  <Badge
                                    className={`text-[8px] px-1 py-0 border-0 ${
                                      strategy.action === 'BUY'
                                        ? 'bg-emerald-500/15 text-emerald-400'
                                        : 'bg-red-500/15 text-red-400'
                                    }`}
                                  >
                                    {strategy.action}
                                  </Badge>
                                  {strategy.symbol && (
                                    <Badge
                                      variant="outline"
                                      className="text-[8px] px-1 py-0 font-mono"
                                    >
                                      {strategy.symbol}
                                    </Badge>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className="text-[8px] px-1 py-0 font-mono"
                                  >
                                    {strategy.confidence}%
                                  </Badge>
                                </div>
                                <div className="text-[9px] text-muted-foreground truncate mt-0.5">
                                  {parsedRules
                                    .map((r: StrategyRule) => {
                                      const ind = INDICATORS.find(
                                        (i) => i.value === r.indicator
                                      )
                                      const op = OPERATORS.find(
                                        (o) => o.value === r.operator
                                      )
                                      return `${r.logic ? r.logic + ' ' : ''}${ind?.label.split(' ')[0] || r.indicator} ${op?.label.split(' ')[0] || r.operator} ${r.value}`
                                    })
                                    .join(' ')}
                                </div>
                              </div>

                              {/* Active indicator */}
                              {strategy.isActive && (
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                              )}

                              {/* Delete button */}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteStrategy(strategy.id)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 shrink-0"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </motion.div>
                          )
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}
