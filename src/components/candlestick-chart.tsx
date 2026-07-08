'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { BarChart3, TrendingUp, TrendingDown, X } from 'lucide-react'
import { useTradingStore } from '@/lib/store/trading-store'

// ─── Types ───────────────────────────────────────────────────────────

interface OHLCData {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

interface ChartDataPoint extends OHLCData {
  isBullish: boolean
  candleRange: number // high - low, used as Bar dataKey for full wick span
  sma5: number | null
  changePercent: number
}

type PeriodType = '1W' | '1M' | '3M' | '6M' | '1Y'

// ─── Base prices for Indian stocks ───────────────────────────────────

const BASE_PRICES: Record<string, number> = {
  RELIANCE: 2890,
  TCS: 3800,
  INFY: 1580,
  HDFCBANK: 1620,
  ICICIBANK: 1245,
  SBIN: 812,
  WIPRO: 480,
  ITC: 465,
  BHARTIARTL: 1580,
  MARUTI: 12400,
  TATAMOTORS: 980,
  TATASTEEL: 168,
  HINDUNILVR: 2520,
  BAJFINANCE: 7250,
  ADANIENT: 2980,
  SUNPHARMA: 1820,
  LT: 3520,
  KOTAKBANK: 1780,
  AXISBANK: 1120,
  ASIANPAINT: 2890,
}

// ─── Seeded random generator ─────────────────────────────────────────

function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

// ─── Period to trading days ──────────────────────────────────────────

function getPeriodDays(period: PeriodType): number {
  switch (period) {
    case '1W': return 5
    case '1M': return 22
    case '3M': return 66
    case '6M': return 132
    case '1Y': return 252
    default: return 22
  }
}

// ─── Generate realistic OHLC data ────────────────────────────────────

function generateOHLCData(symbol: string, period: PeriodType): OHLCData[] {
  const basePrice = BASE_PRICES[symbol] ?? 1500
  const days = getPeriodDays(period)
  const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + period.length * 7
  const rand = seededRandom(seed)

  const data: OHLCData[] = []
  let prevClose = basePrice * (0.97 + rand() * 0.06)

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)

    const dayOfWeek = date.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) continue

    const volatilityFactor = basePrice > 5000 ? 0.015 : basePrice > 1000 ? 0.02 : 0.025
    const trend = Math.sin(i * 0.15) * 0.003
    const changePercent = (rand() - 0.48 + trend) * volatilityFactor * 2

    const open = prevClose * (1 + (rand() - 0.5) * 0.005)
    const close = prevClose * (1 + changePercent)

    const bodyHigh = Math.max(open, close)
    const bodyLow = Math.min(open, close)
    const wickUp = bodyHigh + rand() * volatilityFactor * basePrice * 0.5
    const wickDown = bodyLow - rand() * volatilityFactor * basePrice * 0.5

    const high = Math.max(bodyHigh, wickUp)
    const low = Math.max(Math.min(bodyLow, wickDown), basePrice * 0.9)

    const avgVolume = basePrice > 5000 ? 800000 : basePrice > 1000 ? 2000000 : 5000000
    const volumeSpike = Math.abs(changePercent) > 0.02 ? 1.5 + rand() : 1
    const volume = Math.floor(avgVolume * (0.6 + rand() * 0.8) * volumeSpike)

    data.push({
      date: date.toISOString().split('T')[0],
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(close * 100) / 100,
      volume,
    })

    prevClose = close
  }

  return data
}

// ─── Calculate SMA ───────────────────────────────────────────────────

function calculateSMA(closes: number[], period: number): (number | null)[] {
  return closes.map((_, i) => {
    if (i < period - 1) return null
    const slice = closes.slice(i - period + 1, i + 1)
    return Math.round((slice.reduce((a, b) => a + b, 0) / period) * 100) / 100
  })
}

// ─── Format helpers ──────────────────────────────────────────────────

function formatIndianPrice(value: number): string {
  return '₹' + value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatIndianVolume(value: number): string {
  if (value >= 10000000) return (value / 10000000).toFixed(2) + ' Cr'
  if (value >= 100000) return (value / 100000).toFixed(2) + ' L'
  if (value >= 1000) return (value / 1000).toFixed(1) + 'K'
  return value.toString()
}

// ─── Custom Candlestick Shape for Bar ────────────────────────────────
// The Bar is configured with dataKey="candleRange" (high - low),
// domain starting at [low_min], so the bar's y/height correspond to
// the pixel span from low to high. We use that + the payload to
// correctly render body and wicks.

interface CandleShapeProps {
  x: number
  y: number
  width: number
  height: number
  payload: ChartDataPoint
}

function CandleShape({ x, y, width, height, payload }: CandleShapeProps) {
  const { isBullish, high, low, open, close } = payload

  if (height <= 0 || width <= 0) return null

  const color = isBullish ? '#10b981' : '#ef4444'
  const fillColor = isBullish ? color : color

  // The Bar spans from `low` to `high` in the y-axis.
  // y = pixel position of the TOP of the bar (corresponds to `high`)
  // height = pixel span from high to low
  // So we can calculate intermediate positions using ratios.

  const totalRange = high - low
  if (totalRange <= 0) return null

  // Ratio of each price level from the top (high)
  const openRatio = (high - open) / totalRange
  const closeRatio = (high - close) / totalRange

  const openY = y + openRatio * height
  const closeY = y + closeRatio * height

  const bodyTop = Math.min(openY, closeY)
  const bodyBottom = Math.max(openY, closeY)
  const bodyHeight = Math.max(bodyBottom - bodyTop, 1) // min 1px for doji

  const bodyWidth = width * 0.6
  const bodyX = x + (width - bodyWidth) / 2
  const wickX = x + width / 2

  return (
    <g>
      {/* Upper wick */}
      <line
        x1={wickX}
        y1={y}
        x2={wickX}
        y2={bodyTop}
        stroke={color}
        strokeWidth={1}
      />
      {/* Lower wick */}
      <line
        x1={wickX}
        y1={bodyTop + bodyHeight}
        x2={wickX}
        y2={y + height}
        stroke={color}
        strokeWidth={1}
      />
      {/* Candle body */}
      <rect
        x={bodyX}
        y={bodyTop}
        width={bodyWidth}
        height={bodyHeight}
        fill={isBullish ? fillColor : fillColor}
        stroke={color}
        strokeWidth={0.5}
        rx={0.5}
      />
    </g>
  )
}

// ─── Volume Bar Shape ────────────────────────────────────────────────

interface VolumeShapeProps {
  x: number
  y: number
  width: number
  height: number
  payload: ChartDataPoint
}

function VolumeShape({ x, y, width, height, payload }: VolumeShapeProps) {
  const color = payload.isBullish
    ? 'rgba(16, 185, 129, 0.3)'
    : 'rgba(239, 68, 68, 0.3)'

  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      fill={color}
      rx={1}
    />
  )
}

// ─── Custom Tooltip ──────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: Array<{ payload: ChartDataPoint }>
}) {
  if (!active || !payload || !payload.length) return null

  const data = payload[0].payload
  const isBullish = data.close >= data.open
  const changePct = ((data.close - data.open) / data.open) * 100

  return (
    <div className="bg-popover border border-border rounded-lg shadow-xl p-3 text-sm min-w-[220px]">
      <div className="font-semibold text-foreground mb-2 border-b border-border pb-1.5 text-xs">
        {data.date}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <span className="text-muted-foreground">Open</span>
        <span className="text-right font-mono">{formatIndianPrice(data.open)}</span>
        <span className="text-muted-foreground">High</span>
        <span className="text-right font-mono">{formatIndianPrice(data.high)}</span>
        <span className="text-muted-foreground">Low</span>
        <span className="text-right font-mono">{formatIndianPrice(data.low)}</span>
        <span className="text-muted-foreground">Close</span>
        <span className={`text-right font-mono font-semibold ${isBullish ? 'text-emerald-500' : 'text-red-500'}`}>
          {formatIndianPrice(data.close)}
        </span>
        <span className="text-muted-foreground">Volume</span>
        <span className="text-right font-mono">{formatIndianVolume(data.volume)}</span>
        <span className="text-muted-foreground">Change</span>
        <span className={`text-right font-mono font-semibold ${isBullish ? 'text-emerald-500' : 'text-red-500'}`}>
          {changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%
        </span>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────────────

export function CandlestickChart() {
  const { selectedSymbol } = useTradingStore()
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('1M')
  const [selectedCandle, setSelectedCandle] = useState<ChartDataPoint | null>(null)
  const [ohlcData, setOhlcData] = useState<OHLCData[]>([])
  const chartRef = useRef<any>(null)

  // Fetch OHLC data from API, fallback to local generation
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/market/ohlc?symbol=${selectedSymbol}&period=${selectedPeriod}`)
        if (res.ok) {
          const json = await res.json()
          setOhlcData(json.data)
          return
        }
      } catch {
        // fallback below
      }
      setOhlcData(generateOHLCData(selectedSymbol, selectedPeriod))
    }
    fetchData()
  }, [selectedSymbol, selectedPeriod])

  // Transform data for chart rendering
  const chartData = useMemo((): ChartDataPoint[] => {
    const closes = ohlcData.map(d => d.close)
    const sma5Values = calculateSMA(closes, 5)

    return ohlcData.map((d, i) => {
      const isBullish = d.close >= d.open
      return {
        ...d,
        isBullish,
        candleRange: d.high - d.low,
        sma5: sma5Values[i],
        changePercent: i > 0
          ? ((d.close - ohlcData[i - 1].close) / ohlcData[i - 1].close) * 100
          : 0,
      }
    })
  }, [ohlcData])

  // Current price info for header
  const latestData = chartData[chartData.length - 1]
  const currentPrice = latestData?.close ?? 0
  const firstPrice = chartData[0]?.close ?? 0
  const overallChange = currentPrice - firstPrice
  const overallChangePercent = firstPrice ? (overallChange / firstPrice) * 100 : 0
  const isOverallBullish = overallChange >= 0

  // Price y-axis domain (pad slightly)
  const [priceMin, priceMax] = useMemo(() => {
    if (!chartData.length) return [0, 100]
    const min = Math.min(...chartData.map(d => d.low))
    const max = Math.max(...chartData.map(d => d.high))
    const pad = (max - min) * 0.05
    return [min - pad, max + pad]
  }, [chartData])

  // Volume max for scaling (volume uses 1/4 of chart height)
  const volumeMax = useMemo(() => {
    if (!chartData.length) return 1
    return Math.max(...chartData.map(d => d.volume))
  }, [chartData])

  // Format x-axis dates
  const formatXAxis = useCallback((dateStr: string) => {
    const d = new Date(dateStr)
    return `${d.getDate()}/${d.getMonth() + 1}`
  }, [])

  // Handle chart click (candle selection)
  const handleChartClick = useCallback((e: { activePayload?: Array<{ payload: ChartDataPoint }> }) => {
    if (e?.activePayload?.[0]?.payload) {
      const clicked = e.activePayload[0].payload
      setSelectedCandle(prev => prev?.date === clicked.date ? null : clicked)
    }
  }, [])

  // Period buttons
  const periods: PeriodType[] = ['1W', '1M', '3M', '6M', '1Y']

  if (!chartData.length) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center h-[400px]">
          <div className="text-muted-foreground text-sm animate-pulse">Loading chart data...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      <Card className="border-border/50 overflow-hidden">
        {/* Header */}
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/10">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  {selectedSymbol}
                  <Badge variant="outline" className="text-[10px] font-normal">
                    NSE
                  </Badge>
                </CardTitle>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-lg font-bold font-mono">
                    {formatIndianPrice(currentPrice)}
                  </span>
                  <span
                    className={`text-xs font-semibold flex items-center gap-0.5 px-1.5 py-0.5 rounded ${
                      isOverallBullish
                        ? 'text-emerald-500 bg-emerald-500/10'
                        : 'text-red-500 bg-red-500/10'
                    }`}
                  >
                    {isOverallBullish ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {overallChange >= 0 ? '+' : ''}
                    {overallChangePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Period Selector */}
            <div className="flex items-center gap-1">
              {periods.map((period) => (
                <Button
                  key={period}
                  variant={selectedPeriod === period ? 'default' : 'ghost'}
                  size="sm"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => {
                    setSelectedPeriod(period)
                    setSelectedCandle(null)
                  }}
                >
                  {period}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground px-6 pb-2">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-emerald-500" />
            <span>Bullish</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-red-500" />
            <span>Bearish</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 bg-amber-400 rounded" />
            <span>SMA 5</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm bg-muted-foreground/25" />
            <span>Volume</span>
          </div>
        </div>

        {/* Chart */}
        <CardContent className="pt-0 pb-2">
          <ResponsiveContainer width="100%" height={400}>
            <ComposedChart
              ref={chartRef}
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
              onClick={handleChartClick}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                opacity={0.3}
                vertical={false}
              />

              {/* Price Y-Axis (left) */}
              <YAxis
                yAxisId="price"
                domain={[priceMin, priceMax]}
                tickFormatter={(v: number) => `₹${Math.round(v).toLocaleString('en-IN')}`}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={72}
              />

              {/* Volume Y-Axis (right) */}
              <YAxis
                yAxisId="volume"
                orientation="right"
                domain={[0, volumeMax * 4]}
                tickFormatter={() => ''}
                tick={false}
                tickLine={false}
                axisLine={false}
                width={0}
              />

              <XAxis
                dataKey="date"
                tickFormatter={formatXAxis}
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={{ stroke: 'hsl(var(--border))', opacity: 0.5 }}
                interval="preserveStartEnd"
                minTickGap={40}
              />

              <Tooltip content={<CustomTooltip />} />

              {/* Volume Bars (behind candles) */}
              <Bar
                yAxisId="volume"
                dataKey="volume"
                barSize={8}
                shape={(props: unknown) => <VolumeShape {...(props as VolumeShapeProps)} />}
                isAnimationActive={false}
              />

              {/* Candlestick Bodies + Wicks */}
              <Bar
                yAxisId="price"
                dataKey="candleRange"
                barSize={14}
                shape={(props: unknown) => <CandleShape {...(props as CandleShapeProps)} />}
                isAnimationActive={false}
              />

              {/* SMA 5 Line */}
              <Line
                yAxisId="price"
                dataKey="sma5"
                stroke="#f59e0b"
                strokeWidth={1.5}
                dot={false}
                type="monotone"
                connectNulls={false}
                isAnimationActive={true}
                animationDuration={800}
              />
            </ComposedChart>
          </ResponsiveContainer>

          {/* Selected Candle Detail Panel */}
          {selectedCandle && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 p-3 bg-muted/30 rounded-lg border border-border/50 relative"
            >
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 h-5 w-5"
                onClick={() => setSelectedCandle(null)}
              >
                <X className="h-3 w-3" />
              </Button>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-semibold text-foreground">
                  {selectedCandle.date}
                </span>
                <Badge
                  variant={selectedCandle.isBullish ? 'default' : 'destructive'}
                  className="text-[10px] h-4"
                  style={selectedCandle.isBullish ? { backgroundColor: '#10b981' } : undefined}
                >
                  {selectedCandle.isBullish ? 'BULLISH' : 'BEARISH'}
                </Badge>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">O</span>
                  <p className="font-mono font-medium">{formatIndianPrice(selectedCandle.open)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">H</span>
                  <p className="font-mono font-medium">{formatIndianPrice(selectedCandle.high)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">L</span>
                  <p className="font-mono font-medium">{formatIndianPrice(selectedCandle.low)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">C</span>
                  <p className={`font-mono font-medium ${selectedCandle.isBullish ? 'text-emerald-500' : 'text-red-500'}`}>
                    {formatIndianPrice(selectedCandle.close)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Vol</span>
                  <p className="font-mono font-medium">{formatIndianVolume(selectedCandle.volume)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Chg%</span>
                  <p className={`font-mono font-medium ${selectedCandle.changePercent >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                    {selectedCandle.changePercent >= 0 ? '+' : ''}
                    {selectedCandle.changePercent.toFixed(2)}%
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
