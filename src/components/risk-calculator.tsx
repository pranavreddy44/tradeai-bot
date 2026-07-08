'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { useTradingStore } from '@/lib/store/trading-store'
import { mockPositions } from '@/lib/mock-data'
import {
  Calculator,
  Shield,
  Target,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  IndianRupee,
  Activity,
  PieChart,
  Info,
  Gauge,
  Zap,
  Scale,
} from 'lucide-react'
import { motion, type Variants } from 'framer-motion'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip } from 'recharts'

// Sector mapping for diversification score
const SECTOR_MAP: Record<string, string> = {
  RELIANCE: 'Energy',
  TCS: 'IT',
  INFY: 'IT',
  WIPRO: 'IT',
  HCLTECH: 'IT',
  TECHM: 'IT',
  HDFCBANK: 'Banking',
  ICICIBANK: 'Banking',
  SBIN: 'Banking',
  KOTAKBANK: 'Banking',
  AXISBANK: 'Banking',
  INDUSINDBK: 'Banking',
  ITC: 'FMCG',
  HINDUNILVR: 'FMCG',
  BRITANNIA: 'FMCG',
  NESTLEIND: 'FMCG',
  TATAMOTORS: 'Auto',
  MARUTI: 'Auto',
  'M&M': 'Auto',
  HEROMOTOCO: 'Auto',
  EICHERMOT: 'Auto',
  BAJFINANCE: 'Finance',
  BAJAJFINSV: 'Finance',
  ASIANPAINT: 'Consumer',
  TITAN: 'Consumer',
  SUNPHARMA: 'Pharma',
  DRREDDY: 'Pharma',
  CIPLA: 'Pharma',
  DIVISLAB: 'Pharma',
  TATASTEEL: 'Metals',
  HINDALCO: 'Metals',
  JSWSTEEL: 'Metals',
  ADANIENT: 'Conglomerate',
  ADANIPORTS: 'Infrastructure',
  NTPC: 'Power',
  POWERGRID: 'Power',
  ONGC: 'Energy',
  COALINDIA: 'Mining',
  ULTRACEMCO: 'Cement',
  LT: 'Infrastructure',
  TATACONSUM: 'FMCG',
  GRASIM: 'Cement',
  SBILIFE: 'Insurance',
  HDFCLIFE: 'Insurance',
  APOLLOHOSP: 'Healthcare',
  BPCL: 'Energy',
  IOC: 'Energy',
}

// Sector color map for diversification bar
const SECTOR_COLORS: Record<string, { bg: string; text: string; tailwind: string }> = {
  IT: { bg: 'rgba(56, 189, 248, 0.7)', text: '#38bdf8', tailwind: 'bg-sky-400' },
  Banking: { bg: 'rgba(16, 185, 129, 0.7)', text: '#10b981', tailwind: 'bg-emerald-500' },
  FMCG: { bg: 'rgba(245, 158, 11, 0.7)', text: '#f59e0b', tailwind: 'bg-amber-500' },
  Pharma: { bg: 'rgba(168, 85, 247, 0.7)', text: '#a855f7', tailwind: 'bg-purple-500' },
  Auto: { bg: 'rgba(239, 68, 68, 0.7)', text: '#ef4444', tailwind: 'bg-red-500' },
  Metals: { bg: 'rgba(249, 115, 22, 0.7)', text: '#f97316', tailwind: 'bg-orange-500' },
  Energy: { bg: 'rgba(234, 179, 8, 0.7)', text: '#eab308', tailwind: 'bg-yellow-500' },
  Finance: { bg: 'rgba(34, 197, 94, 0.7)', text: '#22c55e', tailwind: 'bg-green-500' },
  Consumer: { bg: 'rgba(236, 72, 153, 0.7)', text: '#ec4899', tailwind: 'bg-pink-500' },
  Infrastructure: { bg: 'rgba(99, 102, 241, 0.7)', text: '#6366f1', tailwind: 'bg-indigo-500' },
  Power: { bg: 'rgba(20, 184, 166, 0.7)', text: '#14b8a6', tailwind: 'bg-teal-500' },
  Cement: { bg: 'rgba(156, 163, 175, 0.7)', text: '#9ca3af', tailwind: 'bg-gray-400' },
  Conglomerate: { bg: 'rgba(139, 92, 246, 0.7)', text: '#8b5cf6', tailwind: 'bg-violet-500' },
  Insurance: { bg: 'rgba(6, 182, 212, 0.7)', text: '#06b6d4', tailwind: 'bg-cyan-500' },
  Healthcare: { bg: 'rgba(244, 63, 94, 0.7)', text: '#f43f5e', tailwind: 'bg-rose-500' },
  Mining: { bg: 'rgba(180, 83, 9, 0.7)', text: '#b45309', tailwind: 'bg-amber-700' },
  Other: { bg: 'rgba(107, 114, 128, 0.7)', text: '#6b7280', tailwind: 'bg-gray-500' },
}

// Risk Tolerance Profiles
type RiskProfile = 'conservative' | 'moderate' | 'aggressive'

interface RiskProfileConfig {
  id: RiskProfile
  name: string
  emoji: string
  icon: React.ReactNode
  maxRiskPerTrade: number
  maxDailyTrades: number
  stopLossDefault: number
  positionSizingMethod: string
  description: string
  borderColor: string
  glowColor: string
}

const RISK_PROFILES: RiskProfileConfig[] = [
  {
    id: 'conservative',
    name: 'Conservative',
    emoji: '🐢',
    icon: <Shield className="h-5 w-5 text-emerald-400" />,
    maxRiskPerTrade: 1,
    maxDailyTrades: 5,
    stopLossDefault: 3,
    positionSizingMethod: 'Fixed Fractional',
    description: 'Capital preservation first. Small, calculated risks with wider stops.',
    borderColor: 'border-emerald-500/50',
    glowColor: 'shadow-emerald-500/20',
  },
  {
    id: 'moderate',
    name: 'Moderate',
    emoji: '⚖️',
    icon: <Scale className="h-5 w-5 text-amber-400" />,
    maxRiskPerTrade: 2,
    maxDailyTrades: 10,
    stopLossDefault: 2,
    positionSizingMethod: 'Kelly Criterion',
    description: 'Balanced approach. Medium risk for consistent growth over time.',
    borderColor: 'border-amber-500/50',
    glowColor: 'shadow-amber-500/20',
  },
  {
    id: 'aggressive',
    name: 'Aggressive',
    emoji: '🚀',
    icon: <Zap className="h-5 w-5 text-red-400" />,
    maxRiskPerTrade: 5,
    maxDailyTrades: 20,
    stopLossDefault: 1,
    positionSizingMethod: 'Volatility-Based',
    description: 'Maximum growth potential. Higher risk with tighter stops.',
    borderColor: 'border-red-500/50',
    glowColor: 'shadow-red-500/20',
  },
]

// Mock risk exposure data for 7-day chart
const generateRiskTrendData = () => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  let base = 18
  return days.map((day, i) => {
    const variation = Math.sin(i * 0.8) * 6 + (Math.random() - 0.3) * 5
    base = Math.max(5, Math.min(45, base + variation))
    return {
      day,
      risk: Math.round(base * 10) / 10,
    }
  })
}

const riskTrendData = generateRiskTrendData()

// Format number in Indian system (e.g., 10,00,000)
function formatINR(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function formatPercent(value: number): string {
  return value.toFixed(2) + '%'
}

// Animation variants
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.5, ease: 'easeOut' },
  }),
}

// Educational tooltip helper component
function EduTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="inline-flex items-center justify-center ml-1 focus:outline-none" tabIndex={-1}>
          <Info className="h-3 w-3 text-muted-foreground/50 hover:text-emerald-400 transition-colors" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-[11px] leading-relaxed bg-popover text-popover-foreground border-border/50">
        {text}
      </TooltipContent>
    </Tooltip>
  )
}

export function RiskCalculator() {
  // Risk Profile state
  const [activeProfile, setActiveProfile] = useState<RiskProfile>('moderate')

  // Position Size Calculator state
  const [accountSize, setAccountSize] = useState(1000000)
  const [riskPerTrade, setRiskPerTrade] = useState(2)
  const [entryPrice, setEntryPrice] = useState(2892.5)
  const [stopLoss, setStopLoss] = useState(2845)

  // Risk/Reward Analyzer state
  const [rrEntryPrice, setRrEntryPrice] = useState(2892.5)
  const [rrTargetPrice, setRrTargetPrice] = useState(2980)
  const [rrStopLoss, setRrStopLoss] = useState(2845)

  // Get positions from store
  const { positions } = useTradingStore()

  // Use mock positions if store is empty (for demo)
  const activePositions = positions.length > 0 ? positions : mockPositions.filter((p) => p.status === 'open')

  // Handle profile selection - update calculator values
  const handleProfileSelect = (profile: RiskProfileConfig) => {
    setActiveProfile(profile.id)
    setRiskPerTrade(profile.maxRiskPerTrade)
    // Update stop loss based on entry price and profile default
    const slPercent = profile.stopLossDefault / 100
    setStopLoss(Math.round(entryPrice * (1 - slPercent) * 100) / 100)
    setRrStopLoss(Math.round(rrEntryPrice * (1 - slPercent) * 100) / 100)
  }

  // ============ POSITION SIZE CALCULATIONS ============
  const positionSizeCalc = useMemo(() => {
    if (!entryPrice || !stopLoss || entryPrice === stopLoss) {
      return {
        riskAmount: 0,
        positionSize: 0,
        positionValue: 0,
        accountRiskPercent: 0,
        riskLevel: 'Safe' as const,
        riskColor: '#10b981',
      }
    }

    const riskAmount = accountSize * (riskPerTrade / 100)
    const perShareRisk = Math.abs(entryPrice - stopLoss)
    const positionSize = perShareRisk > 0 ? Math.floor(riskAmount / perShareRisk) : 0
    const positionValue = positionSize * entryPrice
    const accountRiskPercent = (positionValue / accountSize) * 100

    let riskLevel: 'Safe' | 'Moderate' | 'High' = 'Safe'
    let riskColor = '#10b981'
    if (accountRiskPercent > 5) {
      riskLevel = 'High'
      riskColor = '#ef4444'
    } else if (accountRiskPercent > 2) {
      riskLevel = 'Moderate'
      riskColor = '#f59e0b'
    }

    return { riskAmount, positionSize, positionValue, accountRiskPercent, riskLevel, riskColor }
  }, [accountSize, riskPerTrade, entryPrice, stopLoss])

  // ============ RISK/REWARD CALCULATIONS ============
  const riskRewardCalc = useMemo(() => {
    if (!rrEntryPrice || !rrStopLoss || !rrTargetPrice || rrEntryPrice === rrStopLoss) {
      return {
        rrRatio: 0,
        potentialProfit: 0,
        potentialLoss: 0,
        profitPercent: 0,
        lossPercent: 0,
        breakEvenWinRate: 0,
        isFavorable: false,
      }
    }

    const potentialProfit = rrTargetPrice - rrEntryPrice
    const potentialLoss = rrEntryPrice - rrStopLoss
    const rrRatio = potentialLoss !== 0 ? Math.abs(potentialProfit / potentialLoss) : 0
    const profitPercent = (potentialProfit / rrEntryPrice) * 100
    const lossPercent = (Math.abs(potentialLoss) / rrEntryPrice) * 100
    const breakEvenWinRate = rrRatio > 0 ? (1 / (1 + rrRatio)) * 100 : 0
    const isFavorable = rrRatio >= 2

    return { rrRatio, potentialProfit, potentialLoss, profitPercent, lossPercent, breakEvenWinRate, isFavorable }
  }, [rrEntryPrice, rrTargetPrice, rrStopLoss])

  // ============ PORTFOLIO RISK SUMMARY CALCULATIONS ============
  const portfolioCalc = useMemo(() => {
    if (activePositions.length === 0) {
      return {
        totalPortfolioValue: 0,
        totalRiskExposure: 0,
        riskExposurePercent: 0,
        topRiskyPositions: [],
        diversificationScore: 0,
        riskMeter: 0,
      }
    }

    // Total portfolio value = sum of (currentPrice * quantity) for open positions
    const totalPortfolioValue = activePositions.reduce((sum, pos) => {
      const price = pos.currentPrice || pos.entryPrice
      return sum + price * pos.quantity
    }, 0)

    // Total risk exposure = sum of risk per position (2% default SL from entry for each)
    const totalRiskExposure = activePositions.reduce((sum, pos) => {
      const price = pos.currentPrice || pos.entryPrice
      const riskPerPos = price * 0.02 * pos.quantity // assume 2% SL
      return sum + riskPerPos
    }, 0)

    const riskExposurePercent = totalPortfolioValue > 0 ? (totalRiskExposure / totalPortfolioValue) * 100 : 0

    // Top 3 riskiest positions by % of portfolio
    const positionsWithRisk = activePositions.map((pos) => {
      const price = pos.currentPrice || pos.entryPrice
      const positionValue = price * pos.quantity
      const percentOfPortfolio = totalPortfolioValue > 0 ? (positionValue / totalPortfolioValue) * 100 : 0
      const sector = SECTOR_MAP[pos.symbol] || 'Other'
      return {
        symbol: pos.symbol,
        positionValue,
        percentOfPortfolio,
        sector,
        pnlPercent: pos.pnlPercent || 0,
        action: pos.action,
      }
    })

    const topRiskyPositions = [...positionsWithRisk].sort((a, b) => b.percentOfPortfolio - a.percentOfPortfolio).slice(0, 3)

    // Diversification score based on how spread across sectors
    const sectorMap = new Map<string, number>()
    positionsWithRisk.forEach((p) => {
      sectorMap.set(p.sector, (sectorMap.get(p.sector) || 0) + p.percentOfPortfolio)
    })

    // Herfindahl index for concentration (lower = more diversified)
    const herfindahl = Array.from(sectorMap.values()).reduce((sum, pct) => sum + (pct * pct) / 10000, 0)
    // Convert to 0-100 score: 100 = perfectly diversified, 0 = all in one sector
    const numSectors = sectorMap.size
    const minHerfindahl = numSectors > 0 ? 100 / numSectors : 100 // minimum possible HHI with equal distribution
    const maxHerfindahl = 10000 // all in one sector
    const diversificationScore = Math.min(
      100,
      Math.max(0, Math.round(((maxHerfindahl - herfindahl) / (maxHerfindahl - minHerfindahl)) * 100 || 0))
    )

    // Risk meter (0-100): combines concentration risk, overall exposure, and number of positions
    const concentrationRisk = 100 - diversificationScore
    const exposureRisk = Math.min(riskExposurePercent * 10, 50) // scale exposure risk
    const positionCountRisk = activePositions.length < 3 ? 30 : activePositions.length > 10 ? 20 : 10
    const riskMeter = Math.min(100, Math.max(0, Math.round(concentrationRisk * 0.4 + exposureRisk * 0.4 + positionCountRisk * 0.2)))

    return { totalPortfolioValue, totalRiskExposure, riskExposurePercent, topRiskyPositions, diversificationScore, riskMeter }
  }, [activePositions])

  // ============ SECTOR DIVERSIFICATION BREAKDOWN ============
  const sectorBreakdown = useMemo(() => {
    if (activePositions.length === 0) return []

    const totalPortfolioValue = activePositions.reduce((sum, pos) => {
      const price = pos.currentPrice || pos.entryPrice
      return sum + price * pos.quantity
    }, 0)

    if (totalPortfolioValue === 0) return []

    const sectorValues = new Map<string, number>()
    activePositions.forEach((pos) => {
      const price = pos.currentPrice || pos.entryPrice
      const positionValue = price * pos.quantity
      const sector = SECTOR_MAP[pos.symbol] || 'Other'
      sectorValues.set(sector, (sectorValues.get(sector) || 0) + positionValue)
    })

    const sectors = Array.from(sectorValues.entries())
      .map(([sector, value]) => ({
        sector,
        value,
        percent: (value / totalPortfolioValue) * 100,
        color: SECTOR_COLORS[sector] || SECTOR_COLORS.Other,
      }))
      .sort((a, b) => b.percent - a.percent)

    return sectors
  }, [activePositions])

  // Check if any sector is over-concentrated
  const overConcentratedSector = sectorBreakdown.find((s) => s.percent > 30)

  // Risk meter color gradient
  const getRiskMeterColor = (value: number) => {
    if (value <= 30) return '#10b981'
    if (value <= 60) return '#f59e0b'
    return '#ef4444'
  }

  const riskMeterColor = getRiskMeterColor(portfolioCalc.riskMeter)

  return (
    <TooltipProvider>
      <div className="space-y-4 md:space-y-6">
        {/* ============ RISK TOLERANCE PROFILES ============ */}
        <motion.div custom={-1} initial="hidden" animate="visible" variants={cardVariants}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            {RISK_PROFILES.map((profile) => {
              const isActive = activeProfile === profile.id
              return (
                <motion.button
                  key={profile.id}
                  onClick={() => handleProfileSelect(profile)}
                  className={`relative rounded-xl p-4 text-left transition-all duration-300 border ${
                    isActive
                      ? `${profile.borderColor} bg-card/90 shadow-lg ${profile.glowColor} ring-1 ring-emerald-500/30`
                      : 'border-border/30 bg-card/50 hover:border-border/60 hover:bg-card/70'
                  }`}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {/* Active indicator glow */}
                  {isActive && (
                    <motion.div
                      className="absolute -top-px -left-px -right-px h-[3px] rounded-t-xl bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500"
                      layoutId="activeProfileGlow"
                      transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                    />
                  )}

                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-xl">{profile.emoji}</span>
                    <div>
                      <h3 className="text-sm font-semibold flex items-center gap-1.5">
                        {profile.name}
                        {isActive && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="inline-block h-2 w-2 rounded-full bg-emerald-400"
                          />
                        )}
                      </h3>
                    </div>
                  </div>

                  <p className="text-[10px] text-muted-foreground mb-3 leading-relaxed">{profile.description}</p>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Max Risk/Trade</span>
                      <span className="font-mono font-semibold" style={{ color: profile.maxRiskPerTrade > 3 ? '#ef4444' : profile.maxRiskPerTrade > 1 ? '#f59e0b' : '#10b981' }}>
                        {profile.maxRiskPerTrade}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Max Daily Trades</span>
                      <span className="font-mono font-medium text-foreground">{profile.maxDailyTrades}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Stop Loss Default</span>
                      <span className="font-mono font-medium text-foreground">{profile.stopLossDefault}%</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Sizing Method</span>
                      <span className="font-medium text-foreground text-[9px]">{profile.positionSizingMethod}</span>
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </motion.div>

        {/* ============ MAIN GRID: CALCULATOR + ANALYZER ============ */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* ============ POSITION SIZE CALCULATOR ============ */}
          <motion.div custom={0} initial="hidden" animate="visible" variants={cardVariants}>
            <Card className="relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
              {/* Gradient accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500" />

              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                    <Calculator className="h-4 w-4 text-emerald-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">Position Size Calculator</CardTitle>
                    <CardDescription className="text-xs">Calculate optimal position size based on risk tolerance</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Account Size */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    <IndianRupee className="inline h-3 w-3 mr-1" />
                    Account Size
                  </Label>
                  <Input
                    type="number"
                    value={accountSize || ''}
                    onChange={(e) => setAccountSize(Number(e.target.value))}
                    className="bg-background/50 border-border/50 h-9 text-sm"
                    placeholder="10,00,000"
                  />
                </div>

                {/* Risk Per Trade */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Risk Per Trade (%)</Label>
                    <Badge variant="outline" className="text-xs font-mono">
                      {riskPerTrade}%
                    </Badge>
                  </div>
                  <Slider
                    value={[riskPerTrade]}
                    min={0.5}
                    max={10}
                    step={0.5}
                    onValueChange={(v) => setRiskPerTrade(v[0])}
                    className="py-2"
                  />
                  <div className="flex justify-between text-[10px] text-muted-foreground/60">
                    <span>0.5%</span>
                    <span>5%</span>
                    <span>10%</span>
                  </div>
                </div>

                {/* Entry Price & Stop Loss */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      <TrendingUp className="inline h-3 w-3 mr-1 text-emerald-500" />
                      Entry Price (₹)
                    </Label>
                    <Input
                      type="number"
                      value={entryPrice || ''}
                      onChange={(e) => setEntryPrice(Number(e.target.value))}
                      className="bg-background/50 border-border/50 h-9 text-sm"
                      placeholder="2892.50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      <TrendingDown className="inline h-3 w-3 mr-1 text-red-400" />
                      Stop Loss (₹)
                    </Label>
                    <Input
                      type="number"
                      value={stopLoss || ''}
                      onChange={(e) => setStopLoss(Number(e.target.value))}
                      className="bg-background/50 border-border/50 h-9 text-sm"
                      placeholder="2845.00"
                    />
                  </div>
                </div>

                <Separator className="bg-border/30" />

                {/* Results */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center">
                        Position Size
                        <EduTooltip text="Recommended number of shares based on your risk tolerance and stop-loss distance" />
                      </p>
                      <p className="text-lg font-bold text-emerald-400 font-mono">
                        {positionSizeCalc.positionSize.toLocaleString('en-IN')} <span className="text-xs text-muted-foreground">shares</span>
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Amount</p>
                      <p className="text-lg font-bold text-amber-400 font-mono">{formatINR(positionSizeCalc.riskAmount)}</p>
                    </div>
                  </div>

                  <div className="rounded-lg bg-background/30 border border-border/30 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Position Value</p>
                      <p className="text-sm font-semibold font-mono">{formatINR(positionSizeCalc.positionValue)}</p>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center">
                        Account at Risk
                        <EduTooltip text="Percentage of your total capital that could be lost if all stop-losses trigger" />
                      </p>
                      <p className="text-sm font-semibold font-mono" style={{ color: positionSizeCalc.riskColor }}>
                        {formatPercent(positionSizeCalc.accountRiskPercent)}
                      </p>
                    </div>

                    {/* Risk level bar */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-muted-foreground flex items-center">
                          Risk Level
                          <EduTooltip text="The overall risk assessment based on your position sizes and market exposure" />
                        </span>
                        <Badge
                          className="text-[10px] font-medium"
                          style={{
                            backgroundColor:
                              positionSizeCalc.riskLevel === 'Safe'
                                ? 'rgba(16,185,129,0.15)'
                                : positionSizeCalc.riskLevel === 'Moderate'
                                  ? 'rgba(245,158,11,0.15)'
                                  : 'rgba(239,68,68,0.15)',
                            color: positionSizeCalc.riskColor,
                            borderColor: 'transparent',
                          }}
                        >
                          <Shield className="h-2.5 w-2.5 mr-1" />
                          {positionSizeCalc.riskLevel}
                        </Badge>
                      </div>
                      <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background:
                              positionSizeCalc.riskLevel === 'Safe'
                                ? 'linear-gradient(90deg, #10b981, #34d399)'
                                : positionSizeCalc.riskLevel === 'Moderate'
                                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                  : 'linear-gradient(90deg, #ef4444, #f87171)',
                          }}
                          initial={{ width: 0 }}
                          animate={{
                            width: `${Math.min(positionSizeCalc.accountRiskPercent * 10, 100)}%`,
                          }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                        />
                      </div>
                      <div className="flex justify-between text-[9px] text-muted-foreground/50">
                        <span>Safe (&lt;2%)</span>
                        <span>Moderate (2-5%)</span>
                        <span>High (&gt;5%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ============ RISK/REWARD ANALYZER ============ */}
          <motion.div custom={1} initial="hidden" animate="visible" variants={cardVariants}>
            <Card className="relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
              {/* Gradient accent line */}
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-amber-500 via-orange-400 to-amber-500" />

              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10">
                    <Target className="h-4 w-4 text-amber-500" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">Risk/Reward Analyzer</CardTitle>
                    <CardDescription className="text-xs">Evaluate potential profit vs risk for any trade</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Entry, Target, Stop Loss */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      <TrendingUp className="inline h-3 w-3 mr-1 text-emerald-500" />
                      Entry Price (₹)
                    </Label>
                    <Input
                      type="number"
                      value={rrEntryPrice || ''}
                      onChange={(e) => setRrEntryPrice(Number(e.target.value))}
                      className="bg-background/50 border-border/50 h-9 text-sm"
                      placeholder="2892.50"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        <Target className="inline h-3 w-3 mr-1 text-emerald-400" />
                        Target Price (₹)
                      </Label>
                      <Input
                        type="number"
                        value={rrTargetPrice || ''}
                        onChange={(e) => setRrTargetPrice(Number(e.target.value))}
                        className="bg-background/50 border-border/50 h-9 text-sm"
                        placeholder="2980.00"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        <TrendingDown className="inline h-3 w-3 mr-1 text-red-400" />
                        Stop Loss (₹)
                      </Label>
                      <Input
                        type="number"
                        value={rrStopLoss || ''}
                        onChange={(e) => setRrStopLoss(Number(e.target.value))}
                        className="bg-background/50 border-border/50 h-9 text-sm"
                        placeholder="2845.00"
                      />
                    </div>
                  </div>
                </div>

                <Separator className="bg-border/30" />

                {/* R:R Ratio Display */}
                <div className="flex items-center justify-center">
                  <div className="relative">
                    <div className="text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1 flex items-center justify-center">
                        Risk : Reward Ratio
                        <EduTooltip text="Ratio of potential profit to potential loss. Aim for 1:2 or better" />
                      </p>
                      <div className="flex items-baseline gap-1 justify-center">
                        <span className="text-3xl font-bold font-mono" style={{ color: riskRewardCalc.isFavorable ? '#10b981' : '#ef4444' }}>
                          1 : {riskRewardCalc.rrRatio.toFixed(2)}
                        </span>
                      </div>
                      <Badge
                        className="mt-1.5 text-[10px]"
                        style={{
                          backgroundColor: riskRewardCalc.isFavorable ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                          color: riskRewardCalc.isFavorable ? '#10b981' : '#ef4444',
                          borderColor: 'transparent',
                        }}
                      >
                        {riskRewardCalc.isFavorable ? (
                          <TrendingUp className="h-2.5 w-2.5 mr-1" />
                        ) : (
                          <AlertTriangle className="h-2.5 w-2.5 mr-1" />
                        )}
                        {riskRewardCalc.isFavorable ? 'Favorable (≥ 1:2)' : 'Unfavorable (< 1:2)'}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Visual R:R Gauge */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <div className="flex h-8 rounded-lg overflow-hidden">
                        {/* Loss portion */}
                        <motion.div
                          className="flex items-center justify-center bg-red-500/20 border-r border-red-500/30"
                          initial={{ width: '50%' }}
                          animate={{
                            width: `${riskRewardCalc.rrRatio > 0 ? (1 / (1 + riskRewardCalc.rrRatio)) * 100 : 50}%`,
                          }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                        >
                          <span className="text-[10px] font-medium text-red-400">Risk</span>
                        </motion.div>
                        {/* Profit portion */}
                        <motion.div
                          className="flex items-center justify-center bg-emerald-500/20"
                          initial={{ width: '50%' }}
                          animate={{
                            width: `${riskRewardCalc.rrRatio > 0 ? (riskRewardCalc.rrRatio / (1 + riskRewardCalc.rrRatio)) * 100 : 50}%`,
                          }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                        >
                          <span className="text-[10px] font-medium text-emerald-400">Reward</span>
                        </motion.div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Profit/Loss Details */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingUp className="h-3 w-3 text-emerald-500" />
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Potential Profit</p>
                    </div>
                    <p className="text-base font-bold text-emerald-400 font-mono">
                      {formatINR(riskRewardCalc.potentialProfit)}
                    </p>
                    <p className="text-[10px] text-emerald-400/70 font-mono">+{formatPercent(riskRewardCalc.profitPercent)}</p>
                  </div>
                  <div className="rounded-lg bg-red-500/5 border border-red-500/10 p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <TrendingDown className="h-3 w-3 text-red-400" />
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Potential Loss</p>
                    </div>
                    <p className="text-base font-bold text-red-400 font-mono">
                      {formatINR(Math.abs(riskRewardCalc.potentialLoss))}
                    </p>
                    <p className="text-[10px] text-red-400/70 font-mono">-{formatPercent(riskRewardCalc.lossPercent)}</p>
                  </div>
                </div>

                {/* Break-even Win Rate */}
                <div className="rounded-lg bg-background/30 border border-border/30 p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                        <Activity className="h-3 w-3" />
                        Break-even Win Rate
                        <EduTooltip text="Minimum win rate needed to be profitable with current risk/reward ratio" />
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">Minimum win rate needed for profitability</p>
                    </div>
                    <p className="text-lg font-bold font-mono" style={{ color: riskRewardCalc.breakEvenWinRate <= 50 ? '#10b981' : '#f59e0b' }}>
                      {formatPercent(riskRewardCalc.breakEvenWinRate)}
                    </p>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-muted/30 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background:
                          riskRewardCalc.breakEvenWinRate <= 33
                            ? 'linear-gradient(90deg, #10b981, #34d399)'
                            : riskRewardCalc.breakEvenWinRate <= 50
                              ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                              : 'linear-gradient(90deg, #ef4444, #f87171)',
                      }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(riskRewardCalc.breakEvenWinRate, 100)}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-1">
                    <span>Easy (≤33%)</span>
                    <span>Moderate (33-50%)</span>
                    <span>Hard (&gt;50%)</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ============ RISK EXPOSURE TREND (7 DAYS) ============ */}
          <motion.div custom={2} initial="hidden" animate="visible" variants={cardVariants}>
            <Card className="relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-teal-500 via-cyan-400 to-teal-500" />

              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10">
                    <Gauge className="h-4 w-4 text-teal-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">Risk Exposure Trend (7 Days)</CardTitle>
                    <CardDescription className="text-xs">Simulated portfolio risk exposure over the past week</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                <div className="h-[180px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={riskTrendData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="riskTrendGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                        dy={5}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.4)' }}
                        domain={[0, 50]}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: 'rgba(15, 23, 42, 0.95)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                          fontSize: '11px',
                          color: '#e2e8f0',
                        }}
                        formatter={(value: number) => [`${value}%`, 'Risk Exposure']}
                      />
                      <Area
                        type="monotone"
                        dataKey="risk"
                        stroke="#14b8a6"
                        strokeWidth={2}
                        fill="url(#riskTrendGradient)"
                        dot={{ r: 3, fill: '#14b8a6', stroke: '#0f172a', strokeWidth: 2 }}
                        activeDot={{ r: 5, fill: '#14b8a6', stroke: '#0f172a', strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-3 gap-2 mt-3">
                  <div className="rounded-lg bg-teal-500/5 border border-teal-500/10 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Avg Risk</p>
                    <p className="text-sm font-bold text-teal-400 font-mono">
                      {(riskTrendData.reduce((s, d) => s + d.risk, 0) / riskTrendData.length).toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-red-500/5 border border-red-500/10 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Peak Risk</p>
                    <p className="text-sm font-bold text-red-400 font-mono">
                      {Math.max(...riskTrendData.map((d) => d.risk)).toFixed(1)}%
                    </p>
                  </div>
                  <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-2 text-center">
                    <p className="text-[9px] text-muted-foreground uppercase">Min Risk</p>
                    <p className="text-sm font-bold text-emerald-400 font-mono">
                      {Math.min(...riskTrendData.map((d) => d.risk)).toFixed(1)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* ============ SECTOR DIVERSIFICATION BREAKDOWN ============ */}
          <motion.div custom={3} initial="hidden" animate="visible" variants={cardVariants}>
            <Card className="relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-purple-500 via-pink-400 to-purple-500" />

              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-500/10">
                    <PieChart className="h-4 w-4 text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">Sector Diversification</CardTitle>
                    <CardDescription className="text-xs">Portfolio allocation across market sectors</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent>
                {sectorBreakdown.length > 0 ? (
                  <div className="space-y-4">
                    {/* Concentration Warning */}
                    {overConcentratedSector && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2"
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" />
                        <p className="text-[10px] text-amber-300">
                          <span className="font-semibold">{overConcentratedSector.sector}</span> sector is over-concentrated at{' '}
                          <span className="font-mono font-bold">{overConcentratedSector.percent.toFixed(1)}%</span> (threshold: 30%)
                        </p>
                      </motion.div>
                    )}

                    {/* Horizontal Stacked Bar Chart */}
                    <div>
                      <div className="flex h-8 rounded-lg overflow-hidden border border-border/20">
                        {sectorBreakdown.map((sector) => (
                          <motion.div
                            key={sector.sector}
                            className="relative flex items-center justify-center overflow-hidden"
                            style={{ backgroundColor: sector.color.bg }}
                            initial={{ width: 0 }}
                            animate={{ width: `${sector.percent}%` }}
                            transition={{ duration: 0.8, ease: 'easeOut' }}
                          >
                            {sector.percent > 12 && (
                              <span className="text-[9px] font-semibold text-white drop-shadow-sm truncate px-1">
                                {sector.sector}
                              </span>
                            )}
                          </motion.div>
                        ))}
                      </div>
                      {/* Scale markers */}
                      <div className="flex justify-between text-[9px] text-muted-foreground/40 mt-1 px-0.5">
                        <span>0%</span>
                        <span>25%</span>
                        <span>50%</span>
                        <span>75%</span>
                        <span>100%</span>
                      </div>
                    </div>

                    {/* Legend */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                      {sectorBreakdown.map((sector) => (
                        <div key={sector.sector} className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-sm flex-shrink-0"
                            style={{ backgroundColor: sector.color.bg }}
                          />
                          <span className="text-[10px] text-muted-foreground truncate">{sector.sector}</span>
                          <span className="text-[10px] font-mono font-medium ml-auto" style={{ color: sector.color.text }}>
                            {sector.percent.toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Sector Detail Bars */}
                    <div className="space-y-2 mt-2">
                      {sectorBreakdown.slice(0, 4).map((sector) => (
                        <div key={sector.sector} className="space-y-1">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <div
                                className="h-2 w-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: sector.color.bg }}
                              />
                              <span className="text-[10px] font-medium">{sector.sector}</span>
                            </div>
                            <span className="text-[10px] font-mono" style={{ color: sector.color.text }}>
                              {sector.percent.toFixed(1)}%
                            </span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-muted/20 overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ backgroundColor: sector.color.bg }}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(sector.percent, 100)}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-background/30 border border-border/30 p-6 text-center">
                    <PieChart className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground">No open positions to analyze</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ============ PORTFOLIO RISK SUMMARY ============ */}
        <motion.div custom={4} initial="hidden" animate="visible" variants={cardVariants}>
          <Card className="relative overflow-hidden border-border/50 bg-card/80 backdrop-blur-sm">
            {/* Gradient accent line */}
            <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-500 via-orange-400 to-amber-500" />

            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-500/10">
                  <Shield className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <CardTitle className="text-base font-semibold">Portfolio Risk Summary</CardTitle>
                  <CardDescription className="text-xs">Overview of portfolio risk exposure and diversification</CardDescription>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                {/* Portfolio Overview */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Portfolio Overview</h4>

                  <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/10 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Portfolio Value</p>
                    <p className="text-xl font-bold text-emerald-400 font-mono">{formatINR(portfolioCalc.totalPortfolioValue)}</p>
                  </div>

                  <div className="rounded-lg bg-amber-500/5 border border-amber-500/10 p-3">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider flex items-center">
                      Total Risk Exposure
                      <EduTooltip text="Percentage of your total capital that could be lost if all stop-losses trigger" />
                    </p>
                    <p className="text-xl font-bold text-amber-400 font-mono">{formatINR(portfolioCalc.totalRiskExposure)}</p>
                    <p className="text-[10px] text-amber-400/70 font-mono mt-0.5">
                      {formatPercent(portfolioCalc.riskExposurePercent)} of portfolio
                    </p>
                  </div>

                  <div className="rounded-lg bg-background/30 border border-border/30 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Open Positions</p>
                      <p className="text-lg font-bold font-mono">{activePositions.length}</p>
                    </div>
                  </div>
                </div>

                {/* Top 3 Riskiest Positions */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    Top Riskiest Positions
                  </h4>

                  {portfolioCalc.topRiskyPositions.length > 0 ? (
                    <div className="space-y-2">
                      {portfolioCalc.topRiskyPositions.map((pos, idx) => (
                        <motion.div
                          key={pos.symbol}
                          className="rounded-lg bg-background/30 border border-border/30 p-3"
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.3 + idx * 0.1 }}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold">{pos.symbol}</span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0">
                                {pos.sector}
                              </Badge>
                            </div>
                            <Badge
                              className="text-[9px] px-1.5 py-0"
                              style={{
                                backgroundColor: pos.pnlPercent >= 0 ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                color: pos.pnlPercent >= 0 ? '#10b981' : '#ef4444',
                                borderColor: 'transparent',
                              }}
                            >
                              {pos.action === 'BUY' ? (
                                <TrendingUp className="h-2.5 w-2.5 mr-0.5" />
                              ) : (
                                <TrendingDown className="h-2.5 w-2.5 mr-0.5" />
                              )}
                              {pos.pnlPercent >= 0 ? '+' : ''}{formatPercent(pos.pnlPercent)}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>Value: {formatINR(pos.positionValue)}</span>
                            <span className="font-mono font-medium" style={{ color: pos.percentOfPortfolio > 40 ? '#ef4444' : pos.percentOfPortfolio > 25 ? '#f59e0b' : '#10b981' }}>
                              {formatPercent(pos.percentOfPortfolio)} of portfolio
                            </span>
                          </div>
                          {/* Concentration bar */}
                          <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted/30 overflow-hidden">
                            <motion.div
                              className="h-full rounded-full"
                              style={{
                                background:
                                  pos.percentOfPortfolio > 40
                                    ? 'linear-gradient(90deg, #ef4444, #f87171)'
                                    : pos.percentOfPortfolio > 25
                                      ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                      : 'linear-gradient(90deg, #10b981, #34d399)',
                              }}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(pos.percentOfPortfolio, 100)}%` }}
                              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 + idx * 0.1 }}
                            />
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg bg-background/30 border border-border/30 p-6 text-center">
                      <p className="text-xs text-muted-foreground">No open positions</p>
                    </div>
                  )}
                </div>

                {/* Risk Meter & Diversification */}
                <div className="space-y-4">
                  {/* Visual Risk Meter */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1">
                      <Activity className="h-3 w-3 text-red-400" />
                      Risk Meter
                    </h4>

                    <div className="flex items-center gap-4">
                      {/* SVG Gauge */}
                      <div className="relative flex-shrink-0">
                        <svg width="100" height="60" viewBox="0 0 100 60">
                          {/* Background arc */}
                          <path
                            d="M 10 55 A 40 40 0 0 1 90 55"
                            fill="none"
                            stroke="rgba(255,255,255,0.08)"
                            strokeWidth="8"
                            strokeLinecap="round"
                          />
                          {/* Color gradient arc segments */}
                          <path
                            d="M 10 55 A 40 40 0 0 1 37 18"
                            fill="none"
                            stroke="#10b981"
                            strokeWidth="8"
                            strokeLinecap="round"
                            opacity="0.6"
                          />
                          <path
                            d="M 37 18 A 40 40 0 0 1 63 18"
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="8"
                            strokeLinecap="round"
                            opacity="0.6"
                          />
                          <path
                            d="M 63 18 A 40 40 0 0 1 90 55"
                            fill="none"
                            stroke="#ef4444"
                            strokeWidth="8"
                            strokeLinecap="round"
                            opacity="0.6"
                          />
                          {/* Needle */}
                          <motion.line
                            x1="50"
                            y1="55"
                            x2={50 + 35 * Math.cos(Math.PI * (1 - portfolioCalc.riskMeter / 100))}
                            y2={55 - 35 * Math.sin(Math.PI * (1 - portfolioCalc.riskMeter / 100))}
                            stroke={riskMeterColor}
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            initial={{
                              x2: 50 + 35 * Math.cos(Math.PI),
                              y2: 55 - 35 * Math.sin(Math.PI),
                            }}
                            animate={{
                              x2: 50 + 35 * Math.cos(Math.PI * (1 - portfolioCalc.riskMeter / 100)),
                              y2: 55 - 35 * Math.sin(Math.PI * (1 - portfolioCalc.riskMeter / 100)),
                            }}
                            transition={{ duration: 1.2, ease: 'easeOut' }}
                          />
                          {/* Center dot */}
                          <circle cx="50" cy="55" r="4" fill={riskMeterColor} />
                        </svg>
                      </div>
                      <div>
                        <p className="text-3xl font-bold font-mono" style={{ color: riskMeterColor }}>
                          {portfolioCalc.riskMeter}
                        </p>
                        <p className="text-[10px] text-muted-foreground">out of 100</p>
                        <Badge
                          className="text-[10px] mt-1"
                          style={{
                            backgroundColor:
                              portfolioCalc.riskMeter <= 30
                                ? 'rgba(16,185,129,0.15)'
                                : portfolioCalc.riskMeter <= 60
                                  ? 'rgba(245,158,11,0.15)'
                                  : 'rgba(239,68,68,0.15)',
                            color: riskMeterColor,
                            borderColor: 'transparent',
                          }}
                        >
                          {portfolioCalc.riskMeter <= 30 ? 'Low Risk' : portfolioCalc.riskMeter <= 60 ? 'Medium Risk' : 'High Risk'}
                        </Badge>
                      </div>
                    </div>

                    {/* Scale labels */}
                    <div className="flex justify-between text-[9px] text-muted-foreground/50 mt-1 px-1">
                      <span>0</span>
                      <span>25</span>
                      <span>50</span>
                      <span>75</span>
                      <span>100</span>
                    </div>
                  </div>

                  <Separator className="bg-border/30" />

                  {/* Diversification Score */}
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1">
                      <PieChart className="h-3 w-3 text-blue-400" />
                      Diversification Score
                      <EduTooltip text="How well your portfolio is spread across different sectors (0-100)" />
                    </h4>

                    <div className="flex items-center gap-3">
                      <div className="relative flex-shrink-0">
                        <svg width="64" height="64" viewBox="0 0 64 64">
                          <circle
                            cx="32"
                            cy="32"
                            r="26"
                            fill="none"
                            stroke="rgba(255,255,255,0.08)"
                            strokeWidth="6"
                          />
                          <motion.circle
                            cx="32"
                            cy="32"
                            r="26"
                            fill="none"
                            stroke={portfolioCalc.diversificationScore >= 60 ? '#10b981' : portfolioCalc.diversificationScore >= 40 ? '#f59e0b' : '#ef4444'}
                            strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={26 * 2 * Math.PI}
                            initial={{ strokeDashoffset: 26 * 2 * Math.PI }}
                            animate={{
                              strokeDashoffset:
                                26 * 2 * Math.PI - (portfolioCalc.diversificationScore / 100) * 26 * 2 * Math.PI,
                            }}
                            transition={{ duration: 1.2, ease: 'easeOut' }}
                            transform="rotate(-90 32 32)"
                          />
                          <text
                            x="32"
                            y="35"
                            textAnchor="middle"
                            fill="currentColor"
                            className="text-xs font-bold"
                            style={{ fontSize: '14px' }}
                          >
                            {portfolioCalc.diversificationScore}
                          </text>
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">
                          {portfolioCalc.diversificationScore >= 70
                            ? 'Well Diversified'
                            : portfolioCalc.diversificationScore >= 40
                              ? 'Moderately Diversified'
                              : 'Poorly Diversified'}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {activePositions.length > 0
                            ? `Spread across ${new Set(activePositions.map((p) => SECTOR_MAP[p.symbol] || 'Other')).size} sectors`
                            : 'No positions to analyze'}
                        </p>
                        {portfolioCalc.diversificationScore < 50 && (
                          <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-0.5">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Consider diversifying across more sectors
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </TooltipProvider>
  )
}
