'use client'

import { TrendingUp, TrendingDown } from 'lucide-react'

interface TickerItem {
  name: string
  price: number
  change: number
  changePercent: number
}

const tickerData: TickerItem[] = [
  { name: 'NIFTY 50', price: 22456.80, change: 102.35, changePercent: 0.46 },
  { name: 'SENSEX', price: 73842.50, change: 318.75, changePercent: 0.43 },
  { name: 'BANK NIFTY', price: 48235.60, change: -128.40, changePercent: -0.27 },
  { name: 'INDIA VIX', price: 13.42, change: -0.85, changePercent: -5.96 },
  { name: 'NIFTY IT', price: 35620.15, change: -245.30, changePercent: -0.68 },
  { name: 'NIFTY MIDCAP', price: 42156.80, change: 187.30, changePercent: 0.45 },
  { name: 'NIFTY AUTO', price: 22180.40, change: 312.55, changePercent: 1.43 },
  { name: 'NIFTY PHARMA', price: 18945.25, change: 87.60, changePercent: 0.46 },
  { name: 'NIFTY FMCG', price: 56120.80, change: -45.20, changePercent: -0.08 },
  { name: 'NIFTY METAL', price: 8234.50, change: 156.80, changePercent: 1.94 },
  { name: 'NIFTY ENERGY', price: 31245.60, change: 89.30, changePercent: 0.29 },
  { name: 'NIFTY REALTY', price: 892.35, change: 22.15, changePercent: 2.54 },
]

function TickerItemRow({ item }: { item: TickerItem }) {
  const isPositive = item.change >= 0

  return (
    <div className="ticker-item flex items-center gap-2.5 px-5 py-2 border-r border-border/20 last:border-r-0">
      <span className="text-[11px] font-semibold text-foreground/80 whitespace-nowrap tracking-wide">
        {item.name}
      </span>
      <span className="text-[11px] font-mono font-medium whitespace-nowrap tabular-nums">
        {item.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
      <span
        className={`text-[11px] font-mono font-medium flex items-center gap-0.5 whitespace-nowrap tabular-nums ${
          isPositive ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {isPositive ? (
          <TrendingUp className="h-3 w-3" />
        ) : (
          <TrendingDown className="h-3 w-3" />
        )}
        {isPositive ? '+' : ''}
        {item.changePercent.toFixed(2)}%
      </span>
    </div>
  )
}

export function MarketTicker() {
  const doubledData = [...tickerData, ...tickerData]

  return (
    <div className="w-full overflow-hidden bg-muted/30 border-b border-border/30 relative">
      {/* Fade edges for smooth visual truncation */}
      <div className="absolute left-0 top-0 bottom-0 w-10 bg-gradient-to-r from-muted/60 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-muted/60 to-transparent z-10 pointer-events-none" />
      <div className="ticker-scroll">
        {doubledData.map((item, i) => (
          <TickerItemRow key={`${item.name}-${i}`} item={item} />
        ))}
      </div>
    </div>
  )
}
