'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp } from 'lucide-react'
import { motion } from 'framer-motion'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts'

// --- Mock Data ---

// Index sparkline data (7 points)
const niftyData = [
  { p: 22280 }, { p: 22350 }, { p: 22310 }, { p: 22420 }, { p: 22380 }, { p: 22460 }, { p: 22456 },
]
const sensexData = [
  { p: 73580 }, { p: 73650 }, { p: 73420 }, { p: 73800 }, { p: 73720 }, { p: 73890 }, { p: 73842 },
]
const bankNiftyData = [
  { p: 48400 }, { p: 48350 }, { p: 48280 }, { p: 48310 }, { p: 48260 }, { p: 48280 }, { p: 48235 },
]

const indices = [
  {
    name: 'NIFTY 50',
    value: 22456.80,
    change: +102.45,
    changePct: +0.46,
    data: niftyData,
    color: '#10b981',
  },
  {
    name: 'SENSEX',
    value: 73842.50,
    change: +315.80,
    changePct: +0.43,
    data: sensexData,
    color: '#10b981',
  },
  {
    name: 'BANK NIFTY',
    value: 48235.60,
    change: -131.20,
    changePct: -0.27,
    data: bankNiftyData,
    color: '#ef4444',
  },
]

// Market breadth
const breadth = {
  advances: 1245,
  declines: 832,
  unchanged: 189,
}

// FII/DII Activity
const fiiDii = {
  fiiBuy: 12456.32,
  fiiSell: 14235.80,
  diiBuy: 15892.45,
  diiSell: 13456.20,
}

// Sector performance
const sectorPerformance = [
  { name: 'Metals', pct: 2.85, color: '#10b981' },
  { name: 'Energy', pct: 1.92, color: '#10b981' },
  { name: 'Auto', pct: 1.45, color: '#10b981' },
  { name: 'IT', pct: -0.68, color: '#ef4444' },
  { name: 'FMCG', pct: -1.12, color: '#ef4444' },
]

// Market sentiment (0-100)
const sentimentValue = 62

function formatCr(val: number): string {
  if (Math.abs(val) >= 1000) return `₹${(val / 1000).toFixed(1)}K Cr`
  return `₹${val.toFixed(0)} Cr`
}

// Fear/Greed gauge SVG
function SentimentGauge({ value }: { value: number }) {
  const radius = 38
  const strokeWidth = 6
  const cx = 50
  const cy = 50
  const startAngle = -225
  const endAngle = 45
  const totalAngle = endAngle - startAngle // 270 degrees
  const currentAngle = startAngle + (value / 100) * totalAngle

  // Convert angle to radians (0° = top, clockwise)
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180

  // Arc path
  const polarToCartesian = (angle: number) => ({
    x: cx + radius * Math.cos(toRad(angle)),
    y: cy + radius * Math.sin(toRad(angle)),
  })

  const arcStart = polarToCartesian(startAngle)
  const arcEnd = polarToCartesian(currentAngle)
  const arcFullEnd = polarToCartesian(endAngle)

  const largeArcFlag = currentAngle - startAngle > 180 ? 1 : 0

  const gaugeColor =
    value < 25 ? '#ef4444' :
    value < 45 ? '#f59e0b' :
    value < 65 ? '#10b981' :
    value < 80 ? '#06b6d4' : '#8b5cf6'

  const label =
    value < 25 ? 'Fear' :
    value < 45 ? 'Caution' :
    value < 65 ? 'Neutral' :
    value < 80 ? 'Greed' : 'Extreme Greed'

  return (
    <div className="relative w-24 h-16 mx-auto">
      <svg viewBox="0 0 100 60" className="w-full h-full">
        {/* Background arc */}
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 1 1 ${arcFullEnd.x} ${arcFullEnd.y}`}
          fill="none"
          stroke="currentColor"
          className="text-muted/30"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Active arc */}
        <path
          d={`M ${arcStart.x} ${arcStart.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${arcEnd.x} ${arcEnd.y}`}
          fill="none"
          stroke={gaugeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {/* Needle dot */}
        <circle
          cx={arcEnd.x}
          cy={arcEnd.y}
          r="4"
          fill={gaugeColor}
          className="drop-shadow-sm"
        />
        {/* Value text */}
        <text x={cx} y={cy + 4} textAnchor="middle" className="fill-foreground text-[14px] font-bold" style={{ fontSize: '14px' }}>
          {value}
        </text>
        <text x={cx} y={cy + 16} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: '7px' }}>
          {label}
        </text>
      </svg>
    </div>
  )
}

export function MarketOverview() {
  const fiiNet = fiiDii.fiiBuy - fiiDii.fiiSell
  const diiNet = fiiDii.diiBuy - fiiDii.diiSell
  const totalBreath = breadth.advances + breadth.declines + breadth.unchanged
  const advancePct = (breadth.advances / totalBreath) * 100
  const declinePct = (breadth.declines / totalBreath) * 100
  const unchangedPct = (breadth.unchanged / totalBreath) * 100

  return (
    <Card className="border-border/50 overflow-hidden rounded-xl shadow-sm shadow-black/10">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-sm font-bold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-sky-400" />
          Market Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-5">
        {/* Index Sparklines */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {indices.map((idx, i) => (
            <motion.div
              key={idx.name}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.2 }}
              className="rounded-md border border-border/30 bg-background/30 p-2"
            >
              <div className="text-[9px] text-muted-foreground font-medium uppercase tracking-wider mb-0.5">
                {idx.name}
              </div>
              <div className="font-mono text-xs font-bold tabular-nums">
                {idx.value.toLocaleString('en-IN', { minimumFractionDigits: 1 })}
              </div>
              <div className={`text-[10px] font-mono font-medium flex items-center gap-0.5 ${
                idx.change >= 0 ? 'text-emerald-400' : 'text-red-400'
              }`}>
                {idx.change >= 0 ? '▲' : '▼'}
                {idx.changePct >= 0 ? '+' : ''}{idx.changePct.toFixed(2)}%
              </div>
              <div className="h-6 mt-1">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={idx.data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id={`sparkGrad-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={idx.color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={idx.color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="p"
                      stroke={idx.color}
                      strokeWidth={1.2}
                      fill={`url(#sparkGrad-${i})`}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Market Breadth Bar */}
        <div className="pt-3 border-t border-border/30 space-y-1">
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Market Breadth</div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">
              <span className="text-emerald-400 font-mono">{breadth.advances}</span>
              {' / '}
              <span className="text-red-400 font-mono">{breadth.declines}</span>
              {' / '}
              <span className="font-mono">{breadth.unchanged}</span>
            </span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex bg-muted/30">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${advancePct}%` }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-emerald-500 h-full"
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${unchangedPct}%` }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="bg-muted-foreground/30 h-full"
            />
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${declinePct}%` }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="bg-red-500 h-full"
            />
          </div>
          <div className="flex items-center justify-between text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Advances {advancePct.toFixed(0)}%
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
              Unchanged {unchangedPct.toFixed(0)}%
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              Declines {declinePct.toFixed(0)}%
            </span>
          </div>
        </div>

        {/* FII/DII Activity */}
        <div className="pt-3 border-t border-border/30 space-y-1.5">
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">FII / DII Activity</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-md border border-border/20 bg-background/20 p-2">
              <div className="text-[9px] text-muted-foreground mb-0.5">FII Net</div>
              <div className={`font-mono text-xs font-bold ${fiiNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fiiNet >= 0 ? '+' : ''}{formatCr(Math.abs(fiiNet))}
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">
                Buy: {formatCr(fiiDii.fiiBuy)}
              </div>
            </div>
            <div className="rounded-md border border-border/20 bg-background/20 p-2">
              <div className="text-[9px] text-muted-foreground mb-0.5">DII Net</div>
              <div className={`font-mono text-xs font-bold ${diiNet >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {diiNet >= 0 ? '+' : ''}{formatCr(Math.abs(diiNet))}
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5">
                Buy: {formatCr(fiiDii.diiBuy)}
              </div>
            </div>
          </div>
        </div>

        {/* Sector Performance */}
        <div className="pt-3 border-t border-border/30 space-y-1.5">
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Sector Performance</div>
          <div className="h-28">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={sectorPerformance}
                layout="vertical"
                margin={{ top: 2, right: 30, bottom: 2, left: 40 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={38}
                />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: '#1a1a2e',
                    border: '1px solid #2a2a3e',
                    borderRadius: '6px',
                    fontSize: '10px',
                  }}
                  formatter={(value: number) => [`${value > 0 ? '+' : ''}${value}%`, 'Change']}
                />
                <Bar dataKey="pct" radius={[0, 3, 3, 0]} barSize={12}>
                  {sectorPerformance.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Market Sentiment Gauge */}
        <div className="pt-3 border-t border-border/30 space-y-1">
          <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider text-center mb-1">Market Sentiment</div>
          <SentimentGauge value={sentimentValue} />
          <div className="flex items-center justify-center gap-1">
            <Badge
              variant="secondary"
              className={`text-[9px] px-1.5 py-0 ${
                sentimentValue < 25 ? 'bg-red-500/15 text-red-400' :
                sentimentValue < 45 ? 'bg-amber-500/15 text-amber-400' :
                sentimentValue < 65 ? 'bg-emerald-500/15 text-emerald-400' :
                sentimentValue < 80 ? 'bg-sky-500/15 text-sky-400' :
                'bg-purple-500/15 text-purple-400'
              }`}
            >
              {sentimentValue < 25 ? 'Fear' :
               sentimentValue < 45 ? 'Caution' :
               sentimentValue < 65 ? 'Neutral' :
               sentimentValue < 80 ? 'Greed' : 'Extreme Greed'}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
