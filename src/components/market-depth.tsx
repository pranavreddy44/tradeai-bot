'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTradingStore } from '@/lib/store/trading-store'
import { motion, type Variants } from 'framer-motion'
import { ArrowUp, ArrowDown, BarChart3, Layers } from 'lucide-react'

// --- Types ---
interface DepthRow {
  price: number
  quantity: number
  orders: number
}

interface MarketDepthData {
  bids: DepthRow[]
  asks: DepthRow[]
  ltp: number
  change: number
  changePercent: number
  open: number
  high: number
  low: number
  close: number
  totalBuyQty: number
  totalSellQty: number
}

// --- Price base map for Indian stocks ---
const PRICE_BASE: Record<string, number> = {
  RELIANCE: 2890,
  TCS: 3845,
  INFY: 1567,
  HDFCBANK: 1678,
  ICICIBANK: 1124,
  SBIN: 745,
  WIPRO: 478,
  ITC: 456,
  BHARTIARTL: 1234,
  MARUTI: 12456,
  KOTAKBANK: 1789,
  AXISBANK: 1098,
  HCLTECH: 1523,
  TATAMOTORS: 978,
  SUNPHARMA: 1567,
  DRREDDY: 6234,
  CIPLA: 1456,
  ONGC: 268,
  NTPC: 356,
  POWERGRID: 312,
  'M&M': 2734,
  'BAJAJ-AUTO': 8945,
  ADANIENT: 2890,
  ASIANPAINT: 3120,
  LT: 3456,
  TITAN: 3278,
  BAJFINANCE: 7234,
  ULTRACEMCO: 10456,
  NESTLEIND: 2456,
  HINDUNILVR: 2567,
}

const TICK_SIZES: Record<string, number> = {
  default: 0.05,
  sub500: 0.05,
  sub100: 0.05,
  above10000: 5,
}

function getTickSize(basePrice: number): number {
  if (basePrice >= 10000) return TICK_SIZES.above10000
  return TICK_SIZES.default
}

// --- Seeded random to make data stable per symbol ---
function seededRandom(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return s / 2147483647
  }
}

function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return Math.abs(hash)
}

function generateMarketDepth(symbol: string): MarketDepthData {
  const basePrice = PRICE_BASE[symbol] || 1500
  const rand = seededRandom(hashString(symbol) + Date.now() % 1000)
  const tickSize = getTickSize(basePrice)

  // Generate LTP with small variation
  const ltpVariation = (rand() - 0.45) * basePrice * 0.02
  const ltp = Math.round((basePrice + ltpVariation) / tickSize) * tickSize

  // OHLC
  const open = Math.round((ltp - (rand() - 0.4) * basePrice * 0.01) / tickSize) * tickSize
  const high = Math.round((ltp + rand() * basePrice * 0.015) / tickSize) * tickSize
  const low = Math.round((ltp - rand() * basePrice * 0.015) / tickSize) * tickSize
  const close = Math.round((ltp - (rand() - 0.5) * basePrice * 0.005) / tickSize) * tickSize
  const change = Math.round((ltp - close) * 100) / 100
  const changePercent = close > 0 ? Math.round((change / close) * 10000) / 100 : 0

  // Generate 5 bid levels (decreasing from LTP)
  const bids: DepthRow[] = []
  for (let i = 0; i < 5; i++) {
    const price = Math.round((ltp - i * tickSize * (1 + Math.floor(rand() * 2))) / tickSize) * tickSize
    const quantity = Math.round(50 + rand() * 800)
    const orders = Math.round(3 + rand() * 20)
    bids.push({ price, quantity, orders })
  }

  // Generate 5 ask levels (increasing from LTP)
  const asks: DepthRow[] = []
  for (let i = 0; i < 5; i++) {
    const price = Math.round((ltp + (i + 1) * tickSize * (1 + Math.floor(rand() * 2))) / tickSize) * tickSize
    const quantity = Math.round(50 + rand() * 800)
    const orders = Math.round(3 + rand() * 20)
    asks.push({ price, quantity, orders })
  }

  const totalBuyQty = bids.reduce((s, b) => s + b.quantity, 0)
  const totalSellQty = asks.reduce((s, a) => s + a.quantity, 0)

  return { bids, asks, ltp, change, changePercent, open, high, low, close, totalBuyQty, totalSellQty }
}

// --- Format helpers ---
function formatPrice(n: number): string {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatQty(n: number): string {
  return n.toLocaleString('en-IN')
}

// --- Animation variants ---
const rowVariants: Variants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.04, duration: 0.25, ease: 'easeOut' },
  }),
}

const askRowVariants: Variants = {
  hidden: { opacity: 0, x: 8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { delay: i * 0.04, duration: 0.25, ease: 'easeOut' },
  }),
}

// --- Component ---
export function MarketDepth() {
  const { selectedSymbol } = useTradingStore()

  const data = useMemo(() => generateMarketDepth(selectedSymbol), [selectedSymbol])

  const maxBidQty = Math.max(...data.bids.map((b) => b.quantity))
  const maxAskQty = Math.max(...data.asks.map((a) => a.quantity))
  const spread = data.asks[0]?.price - data.bids[0]?.price || 0
  const spreadPercent = data.ltp > 0 ? ((spread / data.ltp) * 100) : 0
  const buyRatio = data.totalBuyQty / (data.totalBuyQty + data.totalSellQty) * 100

  const isPositive = data.change >= 0

  return (
    <Card className="border-border/40 bg-card/60 backdrop-blur-sm overflow-hidden rounded-xl shadow-sm shadow-black/10">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-emerald-500" />
            <CardTitle className="text-sm font-bold tracking-tight">
              Market Depth
            </CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0 h-5 bg-muted text-muted-foreground">
              NSE
            </Badge>
            <span className="text-sm font-mono font-bold tracking-tight text-foreground">
              {selectedSymbol}
            </span>
          </div>
        </div>
        {/* OHLC Row - compact tooltip-style */}
        <div className="flex items-center gap-3 mt-2 text-[10px] font-mono text-muted-foreground">
          <span className="flex items-center gap-1">O <span className="text-foreground/80 font-semibold">{formatPrice(data.open)}</span></span>
          <span className="flex items-center gap-1">H <span className="text-foreground/80 font-semibold">{formatPrice(data.high)}</span></span>
          <span className="flex items-center gap-1">L <span className="text-foreground/80 font-semibold">{formatPrice(data.low)}</span></span>
          <span className="flex items-center gap-1">C <span className="text-foreground/80 font-semibold">{formatPrice(data.close)}</span></span>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-0">
        {/* Bids / Asks Headers */}
        <div className="grid grid-cols-2 gap-6 mb-2">
          <div className="flex items-center justify-between text-[10px] font-bold text-emerald-400 uppercase tracking-widest">
            <span>Bids</span>
            <BarChart3 className="h-3 w-3" />
          </div>
          <div className="flex items-center justify-between text-[10px] font-bold text-red-400 uppercase tracking-widest">
            <BarChart3 className="h-3 w-3" />
            <span>Asks</span>
          </div>
        </div>

        {/* Column Headers */}
        <div className="grid grid-cols-2 gap-6 mb-1.5 pb-1.5 border-b border-border/20">
          <div className="grid grid-cols-3 text-[10px] font-mono font-semibold text-muted-foreground/70 uppercase tracking-widest">
            <span className="text-right">Qty</span>
            <span className="text-right">Price</span>
            <span className="text-right">Ord</span>
          </div>
          <div className="grid grid-cols-3 text-[10px] font-mono font-semibold text-muted-foreground/70 uppercase tracking-widest">
            <span>Price</span>
            <span>Qty</span>
            <span>Ord</span>
          </div>
        </div>

        {/* Depth Rows */}
        <div className="grid grid-cols-2 gap-6">
          {/* Bids */}
          <div className="space-y-1">
            {data.bids.map((bid, i) => (
              <motion.div
                key={`bid-${i}`}
                custom={i}
                variants={rowVariants}
                initial="hidden"
                animate="visible"
                className="relative grid grid-cols-3 text-[11px] font-mono group depth-row rounded-sm py-1.5"
              >
                {/* Depth bar */}
                <div
                  className="absolute inset-0 right-0 bg-emerald-500/10 rounded-sm transition-all duration-300 group-hover:bg-emerald-500/15"
                  style={{ width: `${(bid.quantity / maxBidQty) * 100}%`, marginLeft: 'auto' }}
                />
                <span className="relative text-right text-foreground/80 group-hover:text-foreground font-medium tabular-nums transition-colors">
                  {formatQty(bid.quantity)}
                </span>
                <span className="relative text-right text-emerald-400 font-bold group-hover:text-emerald-300 tabular-nums transition-colors">
                  {formatPrice(bid.price)}
                </span>
                <span className="relative text-right text-muted-foreground/60 group-hover:text-muted-foreground font-medium tabular-nums transition-colors text-[10px]">
                  {bid.orders}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Asks */}
          <div className="space-y-1">
            {data.asks.map((ask, i) => (
              <motion.div
                key={`ask-${i}`}
                custom={i}
                variants={askRowVariants}
                initial="hidden"
                animate="visible"
                className="relative grid grid-cols-3 text-[11px] font-mono group depth-row rounded-sm py-1.5"
              >
                {/* Depth bar */}
                <div
                  className="absolute inset-0 left-0 bg-red-500/10 rounded-sm transition-all duration-300 group-hover:bg-red-500/15"
                  style={{ width: `${(ask.quantity / maxAskQty) * 100}%` }}
                />
                <span className="relative text-red-400 font-bold group-hover:text-red-300 tabular-nums transition-colors">
                  {formatPrice(ask.price)}
                </span>
                <span className="relative text-foreground/80 group-hover:text-foreground font-medium tabular-nums transition-colors">
                  {formatQty(ask.quantity)}
                </span>
                <span className="relative text-muted-foreground/60 group-hover:text-muted-foreground font-medium tabular-nums transition-colors text-[10px]">
                  {ask.orders}
                </span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* LTP + Spread Section */}
        <div className="mt-4 pt-3 border-t border-border/40">
          <div className="flex items-center justify-center gap-2">
            <span className="text-base font-mono font-bold tracking-tight text-foreground">
              ₹{formatPrice(data.ltp)}
            </span>
            <motion.div
              className="flex items-center gap-0.5"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              {isPositive ? (
                <ArrowUp className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <ArrowDown className="h-3.5 w-3.5 text-red-400" />
              )}
              <span className={`text-xs font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
                {isPositive ? '+' : ''}{data.change.toFixed(2)} ({isPositive ? '+' : ''}{data.changePercent.toFixed(2)}%)
              </span>
            </motion.div>
          </div>
          <div className="text-center mt-1">
            <span className="text-[10px] font-mono text-muted-foreground/60">
              Spread: ₹{spread.toFixed(2)} ({spreadPercent.toFixed(3)}%)
            </span>
          </div>
        </div>

        {/* Buy/Sell Volume Ratio */}
        <div className="mt-4 pt-3 border-t border-border/40">
          <div className="flex items-center justify-between text-[10px] font-mono font-semibold mb-1.5">
            <span className="text-emerald-400">
              Buy: {formatQty(data.totalBuyQty)}
            </span>
            <span className="text-red-400">
              Sell: {formatQty(data.totalSellQty)}
            </span>
          </div>
          <div className="h-2 rounded-full bg-muted/30 overflow-hidden flex">
            <motion.div
              className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 rounded-l-full"
              initial={{ width: 0 }}
              animate={{ width: `${buyRatio}%` }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}
            />
            <motion.div
              className="h-full bg-gradient-to-r from-red-400 to-red-600 rounded-r-full"
              initial={{ width: '100%' }}
              animate={{ width: `${100 - buyRatio}%` }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
