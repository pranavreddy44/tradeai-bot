'use client'

import { useEffect, useRef, memo, useState, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTradingStore } from '@/lib/store/trading-store'
import { NSE_SYMBOLS } from '@/lib/types/trading'
import { CandlestickChart, Maximize2, Minimize2, ExternalLink, TrendingUp, TrendingDown, BarChart3, LineChart as LineChartIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Area, ResponsiveContainer, XAxis, YAxis, Tooltip, Line, ComposedChart, Bar, ReferenceLine } from 'recharts'

// Calculate EMA for a given period
function calcEMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = []
  const k = 2 / (period + 1)
  let ema: number | null = null

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null)
    } else if (i === period - 1) {
      // First EMA is SMA of first 'period' values
      ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period
      result.push(ema)
    } else {
      ema = values[i] * k + (ema as number) * (1 - k)
      result.push(ema)
    }
  }
  return result
}

// Generate mock price data with SMA, RSI, Bollinger Bands, and MACD
function generateMockChartData(symbol: string): ChartDataPoint[] {
  const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const basePrice: Record<string, number> = {
    RELIANCE: 2890, TCS: 3820, INFY: 1510, HDFCBANK: 1620,
    ICICIBANK: 1245, SBIN: 812, WIPRO: 480, ITC: 465,
    BHARTIARTL: 1580, MARUTI: 12400, TATAMOTORS: 980,
    TATASTEEL: 168, HINDUNILVR: 2520, BAJFINANCE: 7250,
    ADANIENT: 2980, SUNPHARMA: 1820, LT: 3520, KOTAKBANK: 1780,
    AXISBANK: 1120, ASIANPAINT: 2890
  }
  const base = basePrice[symbol] || (seed * 100 + 500)
  const data: ChartDataPoint[] = []
  let price = base
  const prices: number[] = []
  const gains: number[] = []
  const losses: number[] = []
  
  for (let i = 0; i < 78; i++) {
    const change = (Math.sin(seed + i * 0.3) * 20 + (Math.random() - 0.48) * 15)
    price = Math.max(base * 0.95, Math.min(base * 1.08, price + change))
    prices.push(price)
    
    const hour = 9 + Math.floor(i * 6.5 / 78)
    const min = Math.floor((i * 6.5 / 78 - Math.floor(i * 6.5 / 78)) * 60) + 15
    const volume = Math.floor(Math.random() * 500000 + 100000)
    
    // Calculate SMA-10
    const smaWindow = prices.slice(-10)
    const sma10 = smaWindow.length >= 5 ? smaWindow.reduce((a, b) => a + b, 0) / smaWindow.length : null
    
    // Calculate SMA-20
    const sma20Window = prices.slice(-20)
    const sma20 = sma20Window.length >= 10 ? sma20Window.reduce((a, b) => a + b, 0) / sma20Window.length : null
    
    // Calculate RSI-14
    let rsi: number | null = null
    if (i > 0) {
      const diff = prices[i] - prices[i - 1]
      gains.push(diff > 0 ? diff : 0)
      losses.push(diff < 0 ? Math.abs(diff) : 0)
      
      if (gains.length >= 14) {
        const recentGains = gains.slice(-14)
        const recentLosses = losses.slice(-14)
        const avgGain = recentGains.reduce((a, b) => a + b, 0) / 14
        const avgLoss = recentLosses.reduce((a, b) => a + b, 0) / 14
        if (avgLoss === 0) rsi = 100
        else {
          const rs = avgGain / avgLoss
          rsi = 100 - (100 / (1 + rs))
        }
      }
    }

    // Calculate Bollinger Bands (20-period SMA ± 2 stddev)
    let bbUpper: number | undefined
    let bbMiddle: number | undefined
    let bbLower: number | undefined
    if (sma20 !== null && prices.length >= 20) {
      const bbWindow = prices.slice(-20)
      const mean = sma20
      const variance = bbWindow.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / 20
      const stddev = Math.sqrt(variance)
      bbMiddle = Math.round(sma20 * 100) / 100
      bbUpper = Math.round((sma20 + 2 * stddev) * 100) / 100
      bbLower = Math.round((sma20 - 2 * stddev) * 100) / 100
    }
    
    data.push({
      time: `${hour}:${min.toString().padStart(2, '0')}`,
      price: Math.round(price * 100) / 100,
      volume,
      sma10: sma10 ? Math.round(sma10 * 100) / 100 : undefined,
      sma20: sma20 ? Math.round(sma20 * 100) / 100 : undefined,
      rsi: rsi ? Math.round(rsi * 100) / 100 : undefined,
      bbUpper,
      bbMiddle,
      bbLower,
    })
  }

  // Calculate MACD (EMA12 - EMA26), Signal (EMA9 of MACD), Histogram
  const ema12 = calcEMA(prices, 12)
  const ema26 = calcEMA(prices, 26)
  const macdValues: (number | null)[] = []

  for (let i = 0; i < prices.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) {
      macdValues.push(ema12[i]! - ema26[i]!)
    } else {
      macdValues.push(null)
    }
  }

  const validMacdValues = macdValues.filter((v): v is number => v !== null)
  const signalValues = calcEMA(validMacdValues, 9)

  // Map signal back to original indices
  let signalIdx = 0
  for (let i = 0; i < data.length; i++) {
    const macdVal = macdValues[i]
    if (macdVal !== null && signalIdx < signalValues.length) {
      const signalVal = signalValues[signalIdx]
      if (signalVal !== null) {
        const histogram = macdVal - signalVal
        data[i].macd = Math.round(macdVal * 100) / 100
        data[i].macdSignal = Math.round(signalVal * 100) / 100
        data[i].macdHistogram = Math.round(histogram * 100) / 100
      }
      signalIdx++
    }
  }

  return data
}

interface ChartDataPoint {
  time: string
  price: number
  volume: number
  sma10?: number
  sma20?: number
  rsi?: number
  bbUpper?: number
  bbMiddle?: number
  bbLower?: number
  macd?: number
  macdSignal?: number
  macdHistogram?: number
}

export const TradingViewChart = memo(function TradingViewChart() {
  const { selectedSymbol, setSelectedSymbol } = useTradingStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [chartMode, setChartMode] = useState<'fallback' | 'widget'>('fallback')
  const [tvLoaded, setTvLoaded] = useState(false)
  const [showSMA10, setShowSMA10] = useState(true)
  const [showSMA20, setShowSMA20] = useState(true)
  const [showRSI, setShowRSI] = useState(false)
  const [showVolume, setShowVolume] = useState(false)
  const [showBB, setShowBB] = useState(false)
  const [showMACD, setShowMACD] = useState(false)

  const chartData = generateMockChartData(selectedSymbol) as ChartDataPoint[]
  const currentPrice = chartData[chartData.length - 1]?.price || 0
  const prevPrice = chartData[0]?.price || 0
  const priceChange = currentPrice - prevPrice
  const priceChangePercent = ((priceChange / prevPrice) * 100)

  // Determine sub-chart count for height distribution
  const subChartCount = (showRSI ? 1 : 0) + (showMACD ? 1 : 0)
  const mainChartHeight = subChartCount === 0 ? 'h-[90%]' : subChartCount === 1 ? 'h-[65%]' : 'h-[48%]'

  const handleTvLoad = useCallback(() => {
    setTvLoaded(true)
    setChartMode('widget')
  }, [])

  useEffect(() => {
    if (chartMode !== 'widget' || !containerRef.current) return

    // Clear previous content
    containerRef.current.innerHTML = ''

    // Try loading TradingView widget
    const existingScript = document.querySelector('script[src="https://s3.tradingview.com/tv.js"]')
    if (existingScript) {
      existingScript.remove()
    }

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/tv.js'
    script.async = true
    script.onload = () => {
      handleTvLoad()
      const win = window as unknown as Record<string, Record<string, new (config: Record<string, unknown>) => unknown>>
      if (containerRef.current && win.TradingView?.widget) {
        try {
          new win.TradingView.widget({
            autosize: true,
            symbol: `NSE:${selectedSymbol}`,
            interval: '15',
            timezone: 'Asia/Kolkata',
            theme: 'dark',
            style: '1',
            locale: 'in',
            toolbar_bg: '#0f0f1a',
            enable_publishing: false,
            allow_symbol_change: true,
            container_id: 'tradingview_chart',
            hide_side_toolbar: false,
            studies: ['MASimple@tv-basicstudies'],
          })
        } catch {
          setChartMode('fallback')
        }
      }
    }
    script.onerror = () => {
      setChartMode('fallback')
    }

    document.head.appendChild(script)

    // Timeout fallback
    const timer = setTimeout(() => {
      if (!tvLoaded) {
        setChartMode('fallback')
      }
    }, 5000)

    return () => {
      clearTimeout(timer)
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [selectedSymbol, chartMode, handleTvLoad, tvLoaded])

  const openTradingView = () => {
    window.open(`https://www.tradingview.com/chart/?symbol=NSE%3A${selectedSymbol}`, '_blank')
  }

  // Get latest MACD values for display
  const latestMACD = chartData[chartData.length - 1]?.macd
  const latestSignal = chartData[chartData.length - 1]?.macdSignal
  const latestHistogram = chartData[chartData.length - 1]?.macdHistogram

  return (
    <Card className={`h-full border-border/50 ${isFullscreen ? 'fixed inset-0 z-[100] rounded-none' : ''}`}>
      <CardContent className="p-0 h-full flex flex-col">
        {/* Symbol Selector */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/50">
          <div className="flex items-center gap-2">
            <CandlestickChart className="h-4 w-4 text-emerald-500" />
            <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
              <SelectTrigger className="w-[180px] h-8 text-sm bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NSE_SYMBOLS.map((symbol) => (
                  <SelectItem key={symbol} value={symbol}>
                    NSE: {symbol}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 ml-2">
              <span className="text-sm font-bold">₹{currentPrice.toLocaleString('en-IN')}</span>
              <span className={`text-xs font-medium flex items-center gap-0.5 ${priceChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {priceChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {priceChange >= 0 ? '+' : ''}{priceChangePercent.toFixed(2)}%
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs text-muted-foreground hover:text-foreground"
              onClick={openTradingView}
            >
              <ExternalLink className="h-3 w-3" />
              <span className="hidden sm:inline">TradingView</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Chart Area */}
        <div className="flex-1 min-h-0 relative">
          {chartMode === 'widget' ? (
            <div
              id="tradingview_chart"
              ref={containerRef}
              className="w-full h-full"
              style={{ minHeight: isFullscreen ? 'calc(100vh - 48px)' : '400px' }}
            />
          ) : (
            /* Fallback Chart with Recharts + Technical Indicators */
            <div className="w-full h-full p-4 bg-[#0f0f1a]">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm font-medium text-muted-foreground">
                    {selectedSymbol} · NSE · Intraday
                  </span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Indicator Toggle Buttons */}
                  <Button
                    variant={showSMA10 ? 'default' : 'outline'}
                    size="sm"
                    className={`h-6 text-[10px] gap-1 px-2 font-mono ${showSMA10 ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30' : 'border-border/30 text-muted-foreground hover:bg-muted/50 hover:text-amber-300'}`}
                    onClick={() => setShowSMA10(!showSMA10)}
                  >
                    SMA10
                  </Button>
                  <Button
                    variant={showSMA20 ? 'default' : 'outline'}
                    size="sm"
                    className={`h-6 text-[10px] gap-1 px-2 font-mono ${showSMA20 ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 hover:bg-purple-500/30' : 'border-border/30 text-muted-foreground hover:bg-muted/50 hover:text-purple-300'}`}
                    onClick={() => setShowSMA20(!showSMA20)}
                  >
                    SMA20
                  </Button>
                  <Button
                    variant={showBB ? 'default' : 'outline'}
                    size="sm"
                    className={`h-6 text-[10px] gap-1 px-2 font-mono ${showBB ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30' : 'border-border/30 text-muted-foreground hover:bg-muted/50 hover:text-rose-300'}`}
                    onClick={() => setShowBB(!showBB)}
                  >
                    BB
                  </Button>
                  <Button
                    variant={showRSI ? 'default' : 'outline'}
                    size="sm"
                    className={`h-6 text-[10px] gap-1 px-2 font-mono ${showRSI ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 hover:bg-sky-500/30' : 'border-border/30 text-muted-foreground hover:bg-muted/50 hover:text-sky-300'}`}
                    onClick={() => setShowRSI(!showRSI)}
                  >
                    RSI
                  </Button>
                  <Button
                    variant={showMACD ? 'default' : 'outline'}
                    size="sm"
                    className={`h-6 text-[10px] gap-1 px-2 font-mono ${showMACD ? 'bg-blue-500/20 text-blue-300 border-blue-500/40 hover:bg-blue-500/30' : 'border-border/30 text-muted-foreground hover:bg-muted/50 hover:text-blue-300'}`}
                    onClick={() => setShowMACD(!showMACD)}
                  >
                    MACD
                  </Button>
                  <Button
                    variant={showVolume ? 'default' : 'outline'}
                    size="sm"
                    className={`h-6 text-[10px] gap-1 px-2 font-mono ${showVolume ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30' : 'border-border/30 text-muted-foreground hover:bg-muted/50 hover:text-emerald-300'}`}
                    onClick={() => setShowVolume(!showVolume)}
                  >
                    VOL
                  </Button>
                  <div className="w-px h-4 bg-border/50 mx-1" />
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 text-xs gap-1 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                    onClick={() => setChartMode('widget')}
                  >
                    <ExternalLink className="h-3 w-3" />
                    TradingView
                  </Button>
                </div>
              </div>

              {/* Main Price Chart with Indicators */}
              <div className={mainChartHeight}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                    <defs>
                      <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={priceChange >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={priceChange >= 0 ? '#10b981' : '#ef4444'} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="bbFillGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.06} />
                        <stop offset="50%" stopColor="#f43f5e" stopOpacity={0.03} />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity={0.06} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="time"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      interval={12}
                    />
                    <YAxis
                      yAxisId="price"
                      domain={['auto', 'auto']}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: '#6b7280' }}
                      tickFormatter={(val: number) => `₹${val.toLocaleString('en-IN')}`}
                      width={70}
                    />
                    {showVolume && (
                      <YAxis
                        yAxisId="volume"
                        orientation="right"
                        domain={[0, 'auto']}
                        axisLine={false}
                        tickLine={false}
                        tick={false}
                        width={0}
                      />
                    )}
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#1a1a2e',
                        border: '1px solid #2a2a3e',
                        borderRadius: '8px',
                        fontSize: '12px',
                        color: '#e5e7eb'
                      }}
                      formatter={(value: number, name: string) => {
                        if (name === 'price') return [`₹${value.toLocaleString('en-IN')}`, 'Price']
                        if (name === 'sma10') return [`₹${value.toLocaleString('en-IN')}`, 'SMA 10']
                        if (name === 'sma20') return [`₹${value.toLocaleString('en-IN')}`, 'SMA 20']
                        if (name === 'volume') return [value.toLocaleString(), 'Volume']
                        if (name === 'bbUpper') return [`₹${value.toLocaleString('en-IN')}`, 'BB Upper']
                        if (name === 'bbMiddle') return [`₹${value.toLocaleString('en-IN')}`, 'BB Middle']
                        if (name === 'bbLower') return [`₹${value.toLocaleString('en-IN')}`, 'BB Lower']
                        return [value, name]
                      }}
                      labelFormatter={(label: string) => `Time: ${label}`}
                    />
                    {showVolume && (
                      <Bar
                        yAxisId="volume"
                        dataKey="volume"
                        fill="rgba(16, 185, 129, 0.15)"
                        radius={[2, 2, 0, 0]}
                      />
                    )}
                    {/* Bollinger Bands shaded area */}
                    {showBB && (
                      <Area
                        yAxisId="price"
                        type="monotone"
                        dataKey="bbUpper"
                        stroke="none"
                        fill="transparent"
                        dot={false}
                        connectNulls
                      />
                    )}
                    {showBB && (
                      <Area
                        yAxisId="price"
                        type="monotone"
                        dataKey="bbLower"
                        stroke="none"
                        fill="url(#bbFillGradient)"
                        dot={false}
                        connectNulls
                      />
                    )}
                    <Area
                      yAxisId="price"
                      type="monotone"
                      dataKey="price"
                      stroke={priceChange >= 0 ? '#10b981' : '#ef4444'}
                      strokeWidth={2}
                      fill="url(#priceGradient)"
                      dot={false}
                      activeDot={{ r: 4, fill: priceChange >= 0 ? '#10b981' : '#ef4444' }}
                    />
                    {showSMA10 && (
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="sma10"
                        stroke="#f59e0b"
                        strokeWidth={1.5}
                        dot={false}
                        strokeDasharray="4 2"
                        connectNulls
                      />
                    )}
                    {showSMA20 && (
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="sma20"
                        stroke="#a855f7"
                        strokeWidth={1.5}
                        dot={false}
                        strokeDasharray="6 3"
                        connectNulls
                      />
                    )}
                    {/* Bollinger Bands lines */}
                    {showBB && (
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="bbUpper"
                        stroke="#ef4444"
                        strokeWidth={1}
                        dot={false}
                        strokeDasharray="3 3"
                        connectNulls
                      />
                    )}
                    {showBB && (
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="bbMiddle"
                        stroke="#ffffff"
                        strokeWidth={1}
                        dot={false}
                        strokeDasharray="4 2"
                        connectNulls
                      />
                    )}
                    {showBB && (
                      <Line
                        yAxisId="price"
                        type="monotone"
                        dataKey="bbLower"
                        stroke="#22c55e"
                        strokeWidth={1}
                        dot={false}
                        strokeDasharray="3 3"
                        connectNulls
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* RSI Sub-chart */}
              {showRSI && (
                <div className={subChartCount === 2 ? 'h-[22%]' : 'h-[30%]'} style={{ marginTop: '2px' }}>
                  <div className="h-full border-t border-border/30 pt-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <LineChartIcon className="h-3 w-3 text-sky-400" />
                      <span className="text-[10px] text-muted-foreground">RSI (14)</span>
                      <span className={`text-[10px] font-mono font-medium ${
                        (chartData[chartData.length - 1]?.rsi || 50) > 70 ? 'text-red-400' :
                        (chartData[chartData.length - 1]?.rsi || 50) < 30 ? 'text-emerald-400' : 'text-sky-400'
                      }`}>
                        {(chartData[chartData.length - 1]?.rsi || 50).toFixed(1)}
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height="85%">
                      <ComposedChart data={chartData} margin={{ top: 2, right: 5, left: 5, bottom: 2 }}>
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#6b7280' }} interval={18} />
                        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#6b7280' }} width={30} />
                        <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />
                        <ReferenceLine y={30} stroke="#10b981" strokeDasharray="3 3" strokeOpacity={0.5} />
                        <ReferenceLine y={50} stroke="#6b7280" strokeDasharray="2 2" strokeOpacity={0.3} />
                        <Area
                          type="monotone"
                          dataKey="rsi"
                          stroke="#38bdf8"
                          strokeWidth={1.5}
                          fill="rgba(56, 189, 248, 0.08)"
                          dot={false}
                          connectNulls
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* MACD Sub-chart */}
              {showMACD && (
                <div className={subChartCount === 2 ? 'h-[22%]' : 'h-[25%]'} style={{ marginTop: '2px' }}>
                  <div className="h-full border-t border-border/30 pt-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <LineChartIcon className="h-3 w-3 text-blue-400" />
                      <span className="text-[10px] text-muted-foreground">MACD (12,26,9)</span>
                      <span className="text-[10px] font-mono font-medium text-blue-400">
                        {latestMACD !== undefined ? latestMACD.toFixed(2) : '—'}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">Signal:</span>
                      <span className="text-[10px] font-mono font-medium text-orange-400">
                        {latestSignal !== undefined ? latestSignal.toFixed(2) : '—'}
                      </span>
                      <span className="text-[10px] text-muted-foreground/60">Hist:</span>
                      <span className={`text-[10px] font-mono font-medium ${(latestHistogram ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {latestHistogram !== undefined ? latestHistogram.toFixed(2) : '—'}
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height="85%">
                      <ComposedChart data={chartData} margin={{ top: 2, right: 5, left: 5, bottom: 2 }}>
                        <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: '#6b7280' }} interval={18} />
                        <YAxis
                          domain={['auto', 'auto']}
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 9, fill: '#6b7280' }}
                          width={40}
                          tickFormatter={(val: number) => val.toFixed(0)}
                        />
                        <ReferenceLine y={0} stroke="#6b7280" strokeDasharray="2 2" strokeOpacity={0.4} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#1a1a2e',
                            border: '1px solid #2a2a3e',
                            borderRadius: '8px',
                            fontSize: '11px',
                            color: '#e5e7eb'
                          }}
                          formatter={(value: number, name: string) => {
                            if (name === 'macd') return [value.toFixed(2), 'MACD']
                            if (name === 'macdSignal') return [value.toFixed(2), 'Signal']
                            if (name === 'macdHistogram') return [value.toFixed(2), 'Histogram']
                            return [value, name]
                          }}
                          labelFormatter={(label: string) => `Time: ${label}`}
                        />
                        <Bar
                          dataKey="macdHistogram"
                          fill="rgba(16, 185, 129, 0.5)"
                          radius={[2, 2, 0, 0]}
                          isAnimationActive={false}
                          shape={(props: unknown) => {
                            const { x, y, width, height, payload } = props as {
                              x: number; y: number; width: number; height: number;
                              payload: { macdHistogram?: number }
                            }
                            const fill = (payload?.macdHistogram ?? 0) >= 0
                              ? 'rgba(16, 185, 129, 0.6)'
                              : 'rgba(239, 68, 68, 0.6)'
                            return (
                              <rect
                                x={x}
                                y={height >= 0 ? y : y + height}
                                width={width}
                                height={Math.abs(height)}
                                fill={fill}
                                rx={1}
                              />
                            )
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="macd"
                          stroke="#3b82f6"
                          strokeWidth={1.5}
                          dot={false}
                          connectNulls
                        />
                        <Line
                          type="monotone"
                          dataKey="macdSignal"
                          stroke="#f97316"
                          strokeWidth={1.5}
                          dot={false}
                          strokeDasharray="4 2"
                          connectNulls
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Legend */}
              <div className="flex items-center gap-4 mt-2 text-[10px] text-muted-foreground flex-wrap">
                {showSMA10 && (
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-0.5 bg-amber-500 inline-block" style={{ borderTop: '2px dashed #f59e0b' }} />
                    SMA 10
                  </span>
                )}
                {showSMA20 && (
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-0.5 bg-purple-500 inline-block" style={{ borderTop: '2px dashed #a855f7' }} />
                    SMA 20
                  </span>
                )}
                {showBB && (
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-0.5 inline-block" style={{ borderTop: '2px dashed #ef4444' }} />
                    BB Upper
                    <span className="w-4 h-0.5 inline-block" style={{ borderTop: '2px dashed #ffffff' }} />
                    Mid
                    <span className="w-4 h-0.5 inline-block" style={{ borderTop: '2px dashed #22c55e' }} />
                    Lower
                    <span className="text-rose-400/60">(20, 2)</span>
                  </span>
                )}
                {showRSI && (
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-0.5 bg-sky-400 inline-block" />
                    RSI 14
                    <span className="text-red-400/60">OB:70</span>
                    <span className="text-emerald-400/60">OS:30</span>
                  </span>
                )}
                {showMACD && (
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-0.5 bg-blue-500 inline-block" />
                    MACD
                    <span className="w-4 h-0.5 inline-block" style={{ borderTop: '2px dashed #f97316' }} />
                    Signal
                    <span className="w-2 h-2 bg-emerald-500/50 inline-block rounded-sm" />
                    <span className="w-2 h-2 bg-red-500/50 inline-block rounded-sm" />
                    Hist
                    <span className="text-blue-400/60">(12,26,9)</span>
                  </span>
                )}
                <span className="ml-auto">15 min intervals</span>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
})
