import { NextRequest, NextResponse } from 'next/server'

// Base prices for Indian stocks
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

// Seeded random number generator for consistent data per symbol
function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

// Period to number of trading days
function getPeriodDays(period: string): number {
  switch (period) {
    case '1W': return 5
    case '1M': return 22
    case '3M': return 66
    case '6M': return 132
    case '1Y': return 252
    default: return 30
  }
}

type OHLCPoint = {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

function generateOHLCData(symbol: string, period: string): OHLCPoint[] {
  const basePrice = BASE_PRICES[symbol] ?? 1500
  const days = getPeriodDays(period)
  const seed = symbol.split('').reduce((a, c) => a + c.charCodeAt(0), 0) + period.length
  const rand = seededRandom(seed)

  const data: OHLCPoint[] = []
  let prevClose = basePrice * (0.97 + rand() * 0.06) // Start near base price

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)

    // Skip weekends
    const dayOfWeek = date.getDay()
    if (dayOfWeek === 0 || dayOfWeek === 6) continue

    // Daily volatility varies by price tier
    const volatilityFactor = basePrice > 5000 ? 0.015 : basePrice > 1000 ? 0.02 : 0.025
    const trend = Math.sin(i * 0.15) * 0.003 // Slight trend component

    // Generate OHLC
    const changePercent = (rand() - 0.48 + trend) * volatilityFactor * 2
    const open = prevClose * (1 + (rand() - 0.5) * 0.005)
    const close = prevClose * (1 + changePercent)

    // High and low extend beyond open/close
    const bodyHigh = Math.max(open, close)
    const bodyLow = Math.min(open, close)
    const wickUp = bodyHigh + (rand() * volatilityFactor * basePrice * 0.5)
    const wickDown = bodyLow - (rand() * volatilityFactor * basePrice * 0.5)

    const high = Math.max(bodyHigh, wickUp)
    const low = Math.max(Math.min(bodyLow, wickDown), basePrice * 0.9) // Floor at 90% of base

    // Volume: higher on big move days
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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const symbol = searchParams.get('symbol') || 'RELIANCE'
  const period = searchParams.get('period') || '1M'

  const data = generateOHLCData(symbol.toUpperCase(), period.toUpperCase())

  return NextResponse.json({
    symbol: symbol.toUpperCase(),
    period: period.toUpperCase(),
    data,
  })
}
