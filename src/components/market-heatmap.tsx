'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTradingStore } from '@/lib/store/trading-store'
import { motion, AnimatePresence } from 'framer-motion'
import { LayoutGrid, TrendingUp, TrendingDown } from 'lucide-react'

// --- Mock Data ---
interface HeatmapStock {
  symbol: string
  name: string
  price: number
  change: number
  changePercent: number
  marketCap: number // in crores
  sector: string
}

const heatmapStocks: HeatmapStock[] = [
  // IT
  { symbol: 'TCS', name: 'Tata Consultancy Services', price: 3845.60, change: 42.30, changePercent: 1.11, marketCap: 1405000, sector: 'IT' },
  { symbol: 'INFY', name: 'Infosys', price: 1567.80, change: -18.50, changePercent: -1.16, marketCap: 652000, sector: 'IT' },
  { symbol: 'WIPRO', name: 'Wipro', price: 478.35, change: 6.20, changePercent: 1.31, marketCap: 250000, sector: 'IT' },
  { symbol: 'HCLTECH', name: 'HCL Technologies', price: 1523.45, change: 28.75, changePercent: 1.92, marketCap: 413000, sector: 'IT' },

  // Banking
  { symbol: 'HDFCBANK', name: 'HDFC Bank', price: 1678.90, change: -12.40, changePercent: -0.73, marketCap: 1275000, sector: 'Banking' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank', price: 1124.55, change: 15.80, changePercent: 1.42, marketCap: 792000, sector: 'Banking' },
  { symbol: 'SBIN', name: 'State Bank of India', price: 745.30, change: -8.60, changePercent: -1.14, marketCap: 665000, sector: 'Banking' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', price: 1789.20, change: 22.10, changePercent: 1.25, marketCap: 355000, sector: 'Banking' },
  { symbol: 'AXISBANK', name: 'Axis Bank', price: 1098.75, change: -5.30, changePercent: -0.48, marketCap: 339000, sector: 'Banking' },

  // Energy
  { symbol: 'RELIANCE', name: 'Reliance Industries', price: 2890.45, change: 35.60, changePercent: 1.25, marketCap: 1962000, sector: 'Energy' },
  { symbol: 'ONGC', name: 'Oil & Natural Gas Corp', price: 268.90, change: -4.20, changePercent: -1.54, marketCap: 337000, sector: 'Energy' },
  { symbol: 'NTPC', name: 'NTPC Limited', price: 356.70, change: 8.90, changePercent: 2.56, marketCap: 346000, sector: 'Energy' },
  { symbol: 'POWERGRID', name: 'Power Grid Corp', price: 312.40, change: 3.60, changePercent: 1.17, marketCap: 290000, sector: 'Energy' },

  // Auto
  { symbol: 'MARUTI', name: 'Maruti Suzuki', price: 12456.80, change: -156.30, changePercent: -1.24, marketCap: 388000, sector: 'Auto' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', price: 978.50, change: 18.40, changePercent: 1.91, marketCap: 361000, sector: 'Auto' },
  { symbol: 'M&M', name: 'Mahindra & Mahindra', price: 2734.60, change: 42.80, changePercent: 1.59, marketCap: 339000, sector: 'Auto' },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', price: 8945.20, change: -112.60, changePercent: -1.24, marketCap: 261000, sector: 'Auto' },

  // Pharma
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical', price: 1567.30, change: 23.50, changePercent: 1.52, marketCap: 376000, sector: 'Pharma' },
  { symbol: 'DRREDDY', name: "Dr. Reddy's Labs", price: 6234.80, change: -78.40, changePercent: -1.24, marketCap: 104000, sector: 'Pharma' },
  { symbol: 'CIPLA', name: 'Cipla', price: 1456.90, change: -18.70, changePercent: -1.27, marketCap: 118000, sector: 'Pharma' },

  // FMCG
  { symbol: 'ITC', name: 'ITC Limited', price: 434.60, change: 5.80, changePercent: 1.35, marketCap: 543000, sector: 'FMCG' },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', price: 2345.70, change: -32.10, changePercent: -1.35, marketCap: 551000, sector: 'FMCG' },
  { symbol: 'BRITANNIA', name: 'Britannia Industries', price: 5234.90, change: 67.30, changePercent: 1.30, marketCap: 126000, sector: 'FMCG' },

  // Metals
  { symbol: 'TATASTEEL', name: 'Tata Steel', price: 145.80, change: 3.40, changePercent: 2.38, marketCap: 178000, sector: 'Metals' },
  { symbol: 'JSWSTEEL', name: 'JSW Steel', price: 876.50, change: -14.30, changePercent: -1.60, marketCap: 215000, sector: 'Metals' },
  { symbol: 'HINDALCO', name: 'Hindalco Industries', price: 612.30, change: 9.70, changePercent: 1.61, marketCap: 137000, sector: 'Metals' },
]

// --- Color Utility ---
function getHeatmapColor(changePercent: number): string {
  const clamped = Math.max(-3, Math.min(3, changePercent))
  if (clamped >= 3) return '#16a34a'      // deep green
  if (clamped >= 2) return '#22c55e'      // green
  if (clamped >= 1) return '#4ade80'      // light green
  if (clamped >= 0.3) return '#86efac'    // very light green
  if (clamped >= -0.3) return '#52525b'   // gray/neutral
  if (clamped >= -1) return '#fca5a5'     // light red
  if (clamped >= -2) return '#f87171'     // red
  if (clamped >= -3) return '#dc2626'     // deep red
  return '#991b1b'                        // very deep red
}

function getHeatmapBgOpacity(changePercent: number): string {
  const clamped = Math.max(-3, Math.min(3, changePercent))
  const intensity = Math.abs(clamped) / 3
  const opacity = 0.15 + intensity * 0.65
  return opacity.toFixed(2)
}

// --- Sector Config ---
const sectorOrder = ['IT', 'Banking', 'Energy', 'Auto', 'Pharma', 'FMCG', 'Metals']
const sectorColors: Record<string, string> = {
  IT: '#6366f1',
  Banking: '#f59e0b',
  Energy: '#ef4444',
  Auto: '#8b5cf6',
  Pharma: '#10b981',
  FMCG: '#06b6d4',
  Metals: '#f97316',
}

// --- Tooltip Component ---
function HeatmapTooltip({ stock, x, y }: { stock: HeatmapStock; x: number; y: number }) {
  const isPositive = stock.changePercent >= 0
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="fixed z-[100] pointer-events-none"
      style={{ left: x + 12, top: y - 10 }}
    >
      <div className="bg-popover border border-border rounded-lg shadow-xl p-3 min-w-[200px]">
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-bold text-sm">{stock.symbol}</span>
          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
            isPositive ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
          }`}>
            {isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%
          </span>
        </div>
        <div className="text-[11px] text-muted-foreground mb-2">{stock.name}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          <div>
            <span className="text-muted-foreground">Price: </span>
            <span className="font-mono font-medium">₹{stock.price.toLocaleString('en-IN')}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Change: </span>
            <span className={`font-mono font-medium ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
              {isPositive ? '+' : ''}₹{stock.change.toFixed(2)}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground">Mkt Cap: </span>
            <span className="font-mono font-medium">₹{(stock.marketCap / 100).toFixed(0)}K Cr</span>
          </div>
          <div>
            <span className="text-muted-foreground">Sector: </span>
            <span className="font-medium">{stock.sector}</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// --- Single Stock Block ---
function StockBlock({
  stock,
  isSelected,
  onClick,
  onMouseEnter,
  onMouseLeave,
  index,
}: {
  stock: HeatmapStock
  isSelected: boolean
  onClick: () => void
  onMouseEnter: (e: React.MouseEvent) => void
  onMouseLeave: () => void
  index: number
}) {
  const isPositive = stock.changePercent >= 0
  const bgColor = getHeatmapColor(stock.changePercent)
  const opacity = getHeatmapBgOpacity(stock.changePercent)

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, delay: index * 0.02, ease: 'easeOut' }}
      className={`relative cursor-pointer rounded-md overflow-hidden p-2 transition-all duration-200 hover:scale-[1.05] hover:z-10 hover:shadow-lg hover:shadow-black/30 ${
        isSelected ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-background z-10' : ''
      }`}
      style={{
        backgroundColor: bgColor,
        opacity: parseFloat(opacity) + 0.35,
        border: `1px solid ${bgColor}44`,
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        // Brighten border on hover
        const target = e.currentTarget as HTMLElement
        target.style.borderColor = `${bgColor}88`
        onMouseEnter(e)
      }}
      onMouseLeave={(e) => {
        const target = e.currentTarget as HTMLElement
        target.style.borderColor = `${bgColor}44`
        onMouseLeave()
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
      <div className="relative flex flex-col items-center justify-center h-full text-center">
        <span className="font-bold text-white text-xs sm:text-sm leading-tight drop-shadow-sm">
          {stock.symbol}
        </span>
        <span className={`text-[10px] sm:text-[11px] font-semibold mt-0.5 flex items-center gap-0.5 ${
          isPositive ? 'text-emerald-200' : 'text-red-200'
        }`}>
          {isPositive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
          {isPositive ? '+' : ''}{stock.changePercent.toFixed(2)}%
        </span>
      </div>
    </motion.div>
  )
}

// --- Main Component ---
export function MarketHeatmap() {
  const { selectedSymbol, setSelectedSymbol } = useTradingStore()
  const [tooltipData, setTooltipData] = useState<{
    stock: HeatmapStock
    x: number
    y: number
  } | null>(null)
  const [collapsed, setCollapsed] = useState(false)

  // Group stocks by sector
  const sectorGroups = useMemo(() => {
    const groups: Record<string, HeatmapStock[]> = {}
    for (const stock of heatmapStocks) {
      if (!groups[stock.sector]) groups[stock.sector] = []
      groups[stock.sector].push(stock)
    }
    return sectorOrder.map((sector) => ({
      sector,
      stocks: groups[sector] || [],
    }))
  }, [])

  // Calculate total market cap per sector for proportional sizing
  const sectorMarketCaps = useMemo(() => {
    return sectorGroups.map((group) => ({
      sector: group.sector,
      totalCap: group.stocks.reduce((sum, s) => sum + s.marketCap, 0),
      stocks: group.stocks,
    }))
  }, [sectorGroups])

  const totalMarketCap = sectorMarketCaps.reduce((sum, s) => sum + s.totalCap, 0)

  const handleMouseEnter = (stock: HeatmapStock, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltipData({
      stock,
      x: rect.right,
      y: rect.top,
    })
  }

  const handleMouseLeave = () => {
    setTooltipData(null)
  }

  const handleClick = (symbol: string) => {
    setSelectedSymbol(symbol)
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2 px-4 pt-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-emerald-500" />
            Market Heatmap
            <span className="text-[10px] font-normal text-muted-foreground">NSE Sectors</span>
          </CardTitle>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? 'Expand' : 'Collapse'}
          </button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3">
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              {/* Color Legend */}
              <div className="flex items-center justify-center gap-1 mb-3">
                <span className="text-[10px] text-muted-foreground mr-1">-3%</span>
                <div className="flex h-2.5 rounded-sm overflow-hidden">
                  <div className="w-6 bg-red-700" />
                  <div className="w-6 bg-red-500" />
                  <div className="w-6 bg-red-300" />
                  <div className="w-6 bg-zinc-500" />
                  <div className="w-6 bg-emerald-300" />
                  <div className="w-6 bg-emerald-500" />
                  <div className="w-6 bg-emerald-700" />
                </div>
                <span className="text-[10px] text-muted-foreground ml-1">+3%</span>
              </div>

              {/* Heatmap Grid - organized by sectors */}
              <div className="space-y-0">
                {sectorMarketCaps.map((sectorData, sectorIndex) => {
                  // Width proportional to sector market cap
                  const sectorWidthPercent = (sectorData.totalCap / totalMarketCap) * 100
                  // Standardized row height - uniform across all sectors for consistency
                  const rowHeight = 56

                  return (
                    <div key={sectorData.sector}>
                      {/* Sector separator line between groups */}
                      {sectorIndex > 0 && (
                        <div className="section-separator" />
                      )}

                      {/* Sector Label */}
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: sectorColors[sectorData.sector] }}
                        />
                        <span className="text-[11px] font-semibold text-muted-foreground">
                          {sectorData.sector}
                        </span>
                        <span className="text-[9px] text-muted-foreground/60">
                          ₹{(sectorData.totalCap / 100).toFixed(0)}K Cr
                        </span>
                      </div>

                      {/* Stock Blocks Row */}
                      <div
                        className="flex gap-1"
                        style={{ height: `${rowHeight}px` }}
                      >
                        {sectorData.stocks.map((stock, i) => {
                          // Width proportional to market cap within sector
                          const widthPercent = (stock.marketCap / sectorData.totalCap) * 100
                          return (
                            <StockBlock
                              key={stock.symbol}
                              stock={stock}
                              index={i}
                              isSelected={selectedSymbol === stock.symbol}
                              onClick={() => handleClick(stock.symbol)}
                              onMouseEnter={(e) => handleMouseEnter(stock, e)}
                              onMouseLeave={handleMouseLeave}
                            />
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Selected stock indicator */}
              {selectedSymbol && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-2 text-[10px] text-center text-muted-foreground"
                >
                  Selected: <span className="text-emerald-400 font-medium">{selectedSymbol}</span> — click any block to view chart
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tooltip */}
        <AnimatePresence>
          {tooltipData && (
            <HeatmapTooltip
              stock={tooltipData.stock}
              x={tooltipData.x}
              y={tooltipData.y}
            />
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
