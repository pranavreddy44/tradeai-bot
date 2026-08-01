'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useTradingStore } from '@/lib/store/trading-store'
import {
  BarChart3,
  Brain,
  ShieldAlert,
  Radio,
  Eye,
  Plus,
  Trash2,
  Wifi,
  Save,
  Check,
  Zap,
  Clock,
  Gauge,
  Shield,
  Sword,
  CheckCircle2,
  ArrowRight,
  FileText,
  Bell,
  BellRing,
  Volume2,
  Timer,
  CalendarClock,
  TrendingUp,
} from 'lucide-react'
import type { TelegramChannel } from '@/lib/types/trading'
import { NIFTY50_SYMBOLS } from '@/lib/types/trading'
import { TelegramSetupGuide } from '@/components/telegram-setup-guide'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

type AIModelType = string
type TradingModeType = 'conservative' | 'moderate' | 'aggressive'

const modelCards: {
  id: AIModelType
  name: string
  description: string
  speed: number // 1-3
  quality: number // 1-3
  capability: string
  tag: string
}[] = [
  {
    id: 'Qwen/Qwen3-32B',
    name: 'Qwen3 32B',
    description: 'Best default for Telegram signal parsing, market news reasoning, and structured trade levels.',
    speed: 2,
    quality: 3,
    capability: 'Trading Reasoning',
    tag: 'DEFAULT',
  },
  {
    id: 'Qwen/Qwen3-14B',
    name: 'Qwen3 14B',
    description: 'Balanced fallback for frequent scans when the larger model is busy or slower.',
    speed: 2,
    quality: 2,
    capability: 'Balanced Analysis',
    tag: 'BALANCED',
  },
  {
    id: 'Qwen/Qwen3-8B',
    name: 'Qwen3 8B',
    description: 'Fast fallback for quick scans, chat responses, and lower-latency parsing.',
    speed: 3,
    quality: 2,
    capability: 'Fast Scanning',
    tag: 'FAST',
  },
]

const tradingModes: {
  id: TradingModeType
  name: string
  icon: React.ReactNode
  description: string
  color: string
  borderColor: string
  bgColor: string
}[] = [
  {
    id: 'conservative',
    name: 'Conservative',
    icon: <Shield className="h-5 w-5" />,
    description: 'Lower risk, smaller position sizes, tight stop losses. Best for beginners.',
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/40',
    bgColor: 'bg-emerald-500/10',
  },
  {
    id: 'moderate',
    name: 'Moderate',
    icon: <Gauge className="h-5 w-5" />,
    description: 'Balanced risk-reward. Standard position sizes and moderate stop losses.',
    color: 'text-amber-400',
    borderColor: 'border-amber-500/40',
    bgColor: 'bg-amber-500/10',
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    icon: <Sword className="h-5 w-5" />,
    description: 'Higher risk tolerance, larger positions, wider stops. For experienced traders.',
    color: 'text-red-400',
    borderColor: 'border-red-500/40',
    bgColor: 'bg-red-500/10',
  },
]

// Section header with number
function SectionHeader({ number, icon, title }: { number: number; icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="flex items-center justify-center h-7 w-7 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-bold">
        {number}
      </div>
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  )
}

// Risk meter visualization
function RiskMeter({ value, max }: { value: number; max: number }) {
  const percent = Math.min(100, (value / max) * 100)
  const color = percent > 75 ? '#ef4444' : percent > 50 ? '#f59e0b' : '#10b981'

  return (
    <div className="space-y-1">
      <div className="h-2.5 rounded-full bg-muted/50 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="h-full rounded-full"
          style={{ background: `linear-gradient(90deg, #10b981, ${color})` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>Low Risk</span>
        <span style={{ color }} className="font-medium">{percent.toFixed(0)}%</span>
        <span>High Risk</span>
      </div>
    </div>
  )
}

// Custom toggle switch with emerald styling
function EmeraldSwitch({ checked, onCheckedChange, label, description }: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  label: string
  description: string
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="data-[state=checked]:bg-emerald-500"
      />
    </div>
  )
}

// NSE Market Hours Timeline visualization
function MarketHoursTimeline() {
  // NSE market hours: 9:15 AM - 3:30 PM IST
  const startHour = 9
  const startMin = 15
  const endHour = 15
  const endMin = 30
  const totalMinutes = (endHour * 60 + endMin) - (startHour * 60 + startMin) // 375 minutes

  // Calculate current IST time position
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const ist = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60000)
  const currentMinutes = ist.getHours() * 60 + ist.getMinutes()
  const isDuringMarket = currentMinutes >= (startHour * 60 + startMin) && currentMinutes <= (endHour * 60 + endMin)
  const progressPercent = isDuringMarket
    ? ((currentMinutes - (startHour * 60 + startMin)) / totalMinutes) * 100
    : currentMinutes < (startHour * 60 + startMin) ? 0 : 100

  const day = ist.getDay()
  const isWeekend = day === 0 || day === 6

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">NSE Trading Hours (IST)</span>
        <Badge variant="secondary" className={`text-[10px] ${isWeekend ? 'bg-red-500/20 text-red-400' : isDuringMarket ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
          {isWeekend ? 'Weekend' : isDuringMarket ? 'Market Open' : 'Market Closed'}
        </Badge>
      </div>

      {/* Timeline bar */}
      <div className="relative">
        <div className="h-8 rounded-lg bg-muted/30 border border-border/30 overflow-hidden relative">
          {/* Pre-market zone */}
          <div
            className="absolute top-0 bottom-0 bg-zinc-500/10"
            style={{ left: '0%', width: `${((15 - 0) / totalMinutes) * 100}%` }}
          />
          {/* Active market zone */}
          <div
            className="absolute top-0 bottom-0 bg-emerald-500/10"
            style={{ left: `${((15) / totalMinutes) * 100}%`, width: `${((totalMinutes - 15 - 30) / totalMinutes) * 100}%` }}
          />
          {/* Closing zone */}
          <div
            className="absolute top-0 bottom-0 bg-amber-500/10"
            style={{ right: '0%', width: `${(30 / totalMinutes) * 100}%` }}
          />

          {/* Progress fill */}
          {!isWeekend && (
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="absolute top-0 bottom-0 left-0 bg-emerald-500/20 rounded-l-lg"
            />
          )}

          {/* Current time marker */}
          {!isWeekend && isDuringMarket && (
            <motion.div
              initial={{ left: 0 }}
              animate={{ left: `${progressPercent}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="absolute top-0 bottom-0 w-0.5 bg-emerald-500 z-10"
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rounded-full bg-emerald-500" />
            </motion.div>
          )}

          {/* Time labels */}
          <div className="absolute inset-0 flex items-center justify-between px-2 text-[9px] text-muted-foreground pointer-events-none">
            <span>9:15</span>
            <span>12:00</span>
            <span>15:30</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-zinc-500/40" />
          Pre-market
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-emerald-500/40" />
          Active Trading
        </div>
        <div className="flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-amber-500/40" />
          Closing
        </div>
      </div>
    </div>
  )
}

export function SettingsPanel() {
  const {
    settings,
    updateSettings,
    addTelegramChannel,
    removeTelegramChannel,
    addWatchlistSymbol,
    removeWatchlistSymbol,
  } = useTradingStore()

  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelId, setNewChannelId] = useState('')
  const [newWatchlistSymbol, setNewWatchlistSymbol] = useState('')
  const [saved, setSaved] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)
  const [tradingMode, setTradingMode] = useState<TradingModeType>('moderate')

  // New settings state
  const [paperTrading, setPaperTrading] = useState(true)
  const [autoClosePositions, setAutoClosePositions] = useState(false)
  const [autoCloseTime, setAutoCloseTime] = useState('15:15')
  const [signalExpiry, setSignalExpiry] = useState(30)
  const [newSignalAlerts, setNewSignalAlerts] = useState(true)
  const [tradeExecutionAlerts, setTradeExecutionAlerts] = useState(true)
  const [newsSentimentAlerts, setNewsSentimentAlerts] = useState(true)
  const [soundNotifications, setSoundNotifications] = useState(false)

  const handleSave = async () => {
    setSaved(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      })
      if (res.ok) {
        toast.success('Settings saved successfully')
      } else {
        toast.error('Failed to save settings to database')
      }
    } catch (err: any) {
      toast.error('Failed to save settings: ' + err.message)
    }
    setTimeout(() => setSaved(false), 2000)
  }

  const handleAddChannel = () => {
    if (newChannelName && newChannelId) {
      const channel: TelegramChannel = {
        id: `ch-${Date.now()}`,
        name: newChannelName,
        channelId: newChannelId,
        active: true,
      }
      addTelegramChannel(channel)
      setNewChannelName('')
      setNewChannelId('')
    }
  }

  const handleTestConnection = async () => {
    setTestingConnection(true)
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setTestingConnection(false)
  }

  const handleAddWatchlist = () => {
    if (newWatchlistSymbol && !settings.watchlist.includes(newWatchlistSymbol.toUpperCase())) {
      addWatchlistSymbol(newWatchlistSymbol.toUpperCase())
      setNewWatchlistSymbol('')
    }
  }

  // Risk meter calculation based on settings
  const riskScore = (() => {
    let score = 0
    score += (settings.maxPositionSize / 500000) * 25 // position size contribution
    score += (settings.maxDailyTrades / 20) * 25 // daily trades contribution
    score += ((5 - settings.stopLossDefault) / 5) * 25 // stop loss contribution (tighter = lower risk)
    score += (settings.riskPerTrade / 5) * 25 // risk per trade contribution
    return Math.min(100, Math.max(0, score))
  })()

  return (
    <div className="space-y-4 max-h-[calc(100vh-250px)] overflow-y-auto pr-1 custom-scrollbar">
      {/* Section 1: AI Model Configuration */}
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <SectionHeader
            number={1}
            icon={<Brain className="h-5 w-5 text-emerald-500" />}
            title="AI Model Configuration"
          />

          {/* Visual Model Comparison Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            {modelCards.map((model) => {
              const isSelected = settings.aiModel === model.id
              return (
                <motion.div
                  key={model.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    updateSettings({ aiModel: model.id })
                    // Save to API
                    fetch('/api/settings', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ settings: { aiModel: model.id } }),
                    })
                    fetch('/api/ai/provider', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ model: model.id }),
                    }).then(() => {
                      toast.success(`AI model switched to ${model.name}`)
                    }).catch(() => {
                      toast.error('Failed to save model preference')
                    })
                  }}
                  className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/5 glow-emerald'
                      : 'border-border/50 hover:border-emerald-500/30 bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold">{model.name}</span>
                    {isSelected ? (
                      <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0">
                        <CheckCircle2 className="h-3 w-3 mr-0.5" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[9px] px-1.5 py-0 text-muted-foreground">
                        {model.tag}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mb-2 leading-snug">
                    {model.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-0.5">
                        <Zap className="h-3 w-3 text-emerald-400/60" />
                        {Array.from({ length: 3 }).map((_, i) => (
                          <div
                            key={i}
                            className={`h-1.5 w-3 rounded-full ${
                              i < model.speed
                                ? 'bg-emerald-500'
                                : 'bg-muted/50'
                            }`}
                          />
                        ))}
                        <span className="text-[9px] text-muted-foreground ml-0.5">
                          {model.speed === 3 ? 'Fast' : model.speed === 2 ? 'Med' : 'Slow'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <Brain className="h-3 w-3 text-amber-400/60" />
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div
                          key={i}
                          className={`h-1.5 w-3 rounded-full ${
                            i < model.quality
                              ? 'bg-amber-500'
                              : 'bg-muted/50'
                          }`}
                        />
                      ))}
                      <span className="text-[9px] text-muted-foreground ml-0.5">
                        {model.quality === 3 ? 'High' : model.quality === 2 ? 'Med' : 'Low'}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{model.capability}</span>
                </motion.div>
              )
            })}
          </div>

          <Separator className="my-4" />

          <div className="space-y-4">
            <EmeraldSwitch
              checked={settings.newsAnalysisEnabled}
              onCheckedChange={(checked) => updateSettings({ newsAnalysisEnabled: checked })}
              label="News Analysis"
              description="Analyze market news for sentiment-based signals"
            />
            <EmeraldSwitch
              checked={settings.telegramSignalEnabled}
              onCheckedChange={(checked) => updateSettings({ telegramSignalEnabled: checked })}
              label="Telegram Signal"
              description="Receive and process signals from Telegram channels"
            />
            <EmeraldSwitch
              checked={settings.autoPauseOnMacroEvents}
              onCheckedChange={(checked) => updateSettings({ autoPauseOnMacroEvents: checked })}
              label="Macro Auto-Pause Safeguard"
              description="Temporarily pause scanning during high-impact macroeconomic events (15m window)"
            />
          </div>


          <Separator className="my-4" />

          <div className="space-y-3">
            <Label className="text-sm font-medium">Signal Source Weight</Label>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-emerald-400 font-medium">AI: {settings.aiWeight}%</span>
                <ArrowRight className="h-3 w-3 text-muted-foreground" />
                <span className="text-blue-400 font-medium">Telegram: {settings.telegramWeight}%</span>
              </div>
              <Slider
                value={[settings.aiWeight]}
                max={100}
                step={5}
                onValueChange={([val]) =>
                  updateSettings({ aiWeight: val, telegramWeight: 100 - val })
                }
                className="py-2"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Trading Mode + Risk Management */}
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <SectionHeader
            number={2}
            icon={<ShieldAlert className="h-5 w-5 text-amber-500" />}
            title="Risk Management"
          />

          {/* Trading Mode Selector */}
          <div className="mb-5">
            <Label className="text-sm font-medium mb-3 block">Trading Mode</Label>
            <div className="grid grid-cols-3 gap-2">
              {tradingModes.map((mode) => {
                const isSelected = tradingMode === mode.id
                return (
                  <motion.div
                    key={mode.id}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setTradingMode(mode.id)}
                    className={`cursor-pointer rounded-xl border-2 p-3 text-center transition-all ${
                      isSelected
                        ? `${mode.borderColor} ${mode.bgColor}`
                        : 'border-border/50 hover:border-muted bg-card'
                    }`}
                  >
                    <div className={`mx-auto mb-1.5 ${mode.color}`}>{mode.icon}</div>
                    <div className={`text-xs font-semibold ${isSelected ? mode.color : ''}`}>
                      {mode.name}
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1 leading-snug">
                      {mode.description}
                    </p>
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Risk Meter */}
          <div className="mb-5">
            <Label className="text-sm font-medium mb-2 block flex items-center gap-2">
              <Gauge className="h-4 w-4 text-amber-400" />
              Risk Level
            </Label>
            <RiskMeter value={riskScore} max={100} />
          </div>

          {/* Risk Settings Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm">Max Position Size (₹)</Label>
              <Input
                type="number"
                value={settings.maxPositionSize}
                onChange={(e) => updateSettings({ maxPositionSize: Number(e.target.value) })}
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Max Daily Trades</Label>
              <Input
                type="number"
                value={settings.maxDailyTrades}
                onChange={(e) => updateSettings({ maxDailyTrades: Number(e.target.value) })}
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Default Stop Loss (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={settings.stopLossDefault}
                onChange={(e) => updateSettings({ stopLossDefault: Number(e.target.value) })}
                className="bg-background/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Risk Per Trade (%)</Label>
              <Input
                type="number"
                step="0.5"
                value={settings.riskPerTrade}
                onChange={(e) => updateSettings({ riskPerTrade: Number(e.target.value) })}
                className="bg-background/50"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 3: Paper Trading + Trading Hours */}
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <SectionHeader
            number={3}
            icon={<FileText className="h-5 w-5 text-cyan-500" />}
            title="Trading Mode & Hours"
          />

          {/* Paper Trading Toggle */}
          <div className="rounded-lg border border-border/30 p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Paper Trading Mode</Label>
                  <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${paperTrading ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                    {paperTrading ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  Simulate trades without real money. All positions and P&L are virtual. Recommended for testing strategies before live trading.
                </p>
              </div>
              <Switch
                checked={paperTrading}
                onCheckedChange={setPaperTrading}
                className="data-[state=checked]:bg-emerald-500 ml-4"
              />
            </div>
            {paperTrading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 rounded-md bg-emerald-500/5 border border-emerald-500/10 p-3"
              >
                <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3" />
                  Paper trading is active — no real trades will be executed
                </p>
              </motion.div>
            )}
            {!paperTrading && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-3 rounded-md bg-amber-500/5 border border-amber-500/10 p-3"
              >
                <p className="text-xs text-amber-400 flex items-center gap-1.5">
                  <ShieldAlert className="h-3 w-3" />
                  Live trading mode — real trades will be executed through your broker
                </p>
              </motion.div>
            )}
          </div>

          {/* Trading Hours Timeline */}
          <div className="mb-4">
            <Label className="text-sm font-medium mb-3 block flex items-center gap-2">
              <Clock className="h-4 w-4 text-cyan-400" />
              NSE Market Hours
            </Label>
            <MarketHoursTimeline />
          </div>

          <Separator className="my-4" />

          {/* Auto-close positions */}
          <div className="space-y-3">
            <EmeraldSwitch
              checked={autoClosePositions}
              onCheckedChange={setAutoClosePositions}
              label="Auto-close Positions"
              description="Automatically close all open positions before market close"
            />
            {autoClosePositions && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="pl-0"
              >
                <div className="space-y-2">
                  <Label className="text-sm">Close positions at (IST)</Label>
                  <Input
                    type="time"
                    value={autoCloseTime}
                    onChange={(e) => setAutoCloseTime(e.target.value)}
                    className="bg-background/50 w-40"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    All open positions will be automatically closed at the specified time before market ends.
                  </p>
                </div>
              </motion.div>
            )}
          </div>

          <Separator className="my-4" />

          {/* Signal Expiry */}
          <div className="space-y-3">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4 text-amber-400" />
              Signal Expiry Time
            </Label>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={5}
                max={120}
                step={5}
                value={signalExpiry}
                onChange={(e) => setSignalExpiry(Number(e.target.value))}
                className="bg-background/50 w-24"
              />
              <span className="text-sm text-muted-foreground">minutes</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Pending signals will automatically expire after this duration. Default: 30 minutes.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section 4: Telegram Setup Guide (replaces old channels section) */}
      <TelegramSetupGuide />

      {/* Section 5: Notification Preferences */}
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <SectionHeader
            number={5}
            icon={<Bell className="h-5 w-5 text-pink-500" />}
            title="Notification Preferences"
          />

          <div className="space-y-4">
            <EmeraldSwitch
              checked={newSignalAlerts}
              onCheckedChange={setNewSignalAlerts}
              label="New Signal Alerts"
              description="Get notified when a new trading signal is generated"
            />

            <EmeraldSwitch
              checked={tradeExecutionAlerts}
              onCheckedChange={setTradeExecutionAlerts}
              label="Trade Execution Alerts"
              description="Get notified when a trade is executed or filled"
            />

            <EmeraldSwitch
              checked={newsSentimentAlerts}
              onCheckedChange={setNewsSentimentAlerts}
              label="News Sentiment Alerts"
              description="Get notified when significant news sentiment changes are detected"
            />

            <EmeraldSwitch
              checked={soundNotifications}
              onCheckedChange={setSoundNotifications}
              label="Sound Notifications"
              description="Play a sound when notifications are triggered"
            />
          </div>

          {/* Notification Preview */}
          <div className="mt-4 rounded-lg bg-muted/20 border border-border/30 p-3">
            <p className="text-[10px] text-muted-foreground mb-2">Active notification channels:</p>
            <div className="flex flex-wrap gap-2">
              {newSignalAlerts && (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-emerald-500/15 text-emerald-400">
                  <BellRing className="h-3 w-3" />
                  Signals
                </Badge>
              )}
              {tradeExecutionAlerts && (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-amber-500/15 text-amber-400">
                  <Zap className="h-3 w-3" />
                  Trades
                </Badge>
              )}
              {newsSentimentAlerts && (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-pink-500/15 text-pink-400">
                  <TrendingUp className="h-3 w-3" />
                  News
                </Badge>
              )}
              {soundNotifications && (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-sky-500/15 text-sky-400">
                  <Volume2 className="h-3 w-3" />
                  Sound
                </Badge>
              )}
              {!newSignalAlerts && !tradeExecutionAlerts && !newsSentimentAlerts && (
                <span className="text-xs text-muted-foreground">No notifications enabled</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 7: Watchlist Management */}
      <Card className="overflow-hidden">
        <CardContent className="p-5">
          <SectionHeader
            number={6}
            icon={<Eye className="h-5 w-5 text-cyan-500" />}
            title="Watchlist Management"
          />

          <div className="flex gap-2 mb-4">
            <Select value={newWatchlistSymbol} onValueChange={setNewWatchlistSymbol}>
              <SelectTrigger className="flex-1 bg-background/50">
                <SelectValue placeholder="Select NIFTY50 stock..." />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {NIFTY50_SYMBOLS.filter((s) => !settings.watchlist.includes(s)).map((symbol) => (
                  <SelectItem key={symbol} value={symbol}>
                    {symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={handleAddWatchlist}
              disabled={!newWatchlistSymbol}
              className="gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {settings.watchlist.map((symbol) => (
              <Badge
                key={symbol}
                variant="secondary"
                className="px-3 py-1.5 gap-1.5 hover:bg-muted/80 transition-colors bg-muted/30"
              >
                {symbol}
                <button
                  onClick={() => removeWatchlistSymbol(symbol)}
                  className="ml-1 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save Button with Success Animation */}
      <div className="flex justify-end pb-4">
        <motion.div whileTap={{ scale: 0.95 }}>
          <Button
            onClick={handleSave}
            className={`gap-2 min-w-[160px] h-10 transition-all ${
              saved
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white'
            }`}
          >
            <motion.div
              key={saved ? 'saved' : 'save'}
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              {saved ? <CheckCircle2 className="h-4 w-4" /> : <Save className="h-4 w-4" />}
            </motion.div>
            {saved ? 'Saved!' : 'Save Settings'}
          </Button>
        </motion.div>
      </div>
    </div>
  )
}
