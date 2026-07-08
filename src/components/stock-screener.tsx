'use client'

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useTradingStore } from '@/lib/store/trading-store'
import {
  Filter,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  SlidersHorizontal,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Activity,
  Eye,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Zap,
  Star,
  Download,
  Flame,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// --- Types ---
interface StockData {
  symbol: string
  name: string
  sector: string
  price: number
  change: number
  changePercent: number
  volume: number
  avgVolume: number
  marketCap: number // in Cr
  rsi: number
  peRatio: number
  signal: 'BUY' | 'SELL' | null
}

interface ScreenerFilters {
  sectors: string[]
  priceMin: string
  priceMax: string
  changeMin: string
  changeMax: string
  volumeFilter: 'all' | 'above_avg' | 'below_avg'
  marketCapFilter: 'all' | 'large' | 'mid' | 'small'
  signalFilter: 'all' | 'buy' | 'sell' | 'none'
  search: string
}

type SortField = 'symbol' | 'sector' | 'price' | 'change' | 'changePercent' | 'volume' | 'marketCap' | 'rsi' | 'signal'
type SortDirection = 'asc' | 'desc'

const SECTORS = ['IT', 'Banking', 'Energy', 'Auto', 'Pharma', 'FMCG', 'Metals', 'Telecom', 'Infrastructure', 'Financial Services']

// --- Mock Data: 55 NSE stocks with realistic data ---
const STOCKS: StockData[] = [
  // IT Sector
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT', price: 3845.60, change: 42.30, changePercent: 1.11, volume: 4250000, avgVolume: 3800000, marketCap: 1405000, rsi: 58.2, peRatio: 31.5, signal: 'BUY' },
  { symbol: 'INFY', name: 'Infosys Limited', sector: 'IT', price: 1568.45, change: -12.55, changePercent: -0.79, volume: 6800000, avgVolume: 5500000, marketCap: 652000, rsi: 44.8, peRatio: 26.8, signal: null },
  { symbol: 'WIPRO', name: 'Wipro Limited', sector: 'IT', price: 478.30, change: -8.70, changePercent: -1.79, volume: 5200000, avgVolume: 4800000, marketCap: 249000, rsi: 32.1, peRatio: 22.4, signal: 'SELL' },
  { symbol: 'HCLTECH', name: 'HCL Technologies', sector: 'IT', price: 1612.80, change: 28.45, changePercent: 1.80, volume: 3100000, avgVolume: 2900000, marketCap: 438000, rsi: 62.5, peRatio: 24.1, signal: 'BUY' },
  { symbol: 'TECHM', name: 'Tech Mahindra', sector: 'IT', price: 1528.75, change: -3.25, changePercent: -0.21, volume: 2800000, avgVolume: 2600000, marketCap: 149000, rsi: 48.9, peRatio: 25.6, signal: null },
  { symbol: 'LTIM', name: 'LTIMindtree', sector: 'IT', price: 5425.00, change: 85.50, changePercent: 1.60, volume: 980000, avgVolume: 850000, marketCap: 160000, rsi: 55.3, peRatio: 33.2, signal: null },
  { symbol: 'PERSISTENT', name: 'Persistent Systems', sector: 'IT', price: 5890.20, change: -120.80, changePercent: -2.01, volume: 450000, avgVolume: 520000, marketCap: 45000, rsi: 28.5, peRatio: 38.2, signal: 'SELL' },
  { symbol: 'COFORGE', name: 'Coforge', sector: 'IT', price: 6780.50, change: 210.30, changePercent: 3.20, volume: 320000, avgVolume: 280000, marketCap: 41000, rsi: 72.8, peRatio: 45.1, signal: 'BUY' },

  // Banking Sector
  { symbol: 'HDFCBANK', name: 'HDFC Bank Limited', sector: 'Banking', price: 1648.75, change: 18.55, changePercent: 1.14, volume: 8900000, avgVolume: 7500000, marketCap: 1250000, rsi: 55.4, peRatio: 19.2, signal: 'BUY' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Limited', sector: 'Banking', price: 1124.30, change: -8.20, changePercent: -0.72, volume: 7200000, avgVolume: 6500000, marketCap: 790000, rsi: 49.2, peRatio: 18.1, signal: null },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking', price: 786.45, change: -15.35, changePercent: -1.91, volume: 12500000, avgVolume: 10000000, marketCap: 702000, rsi: 35.8, peRatio: 10.5, signal: 'SELL' },
  { symbol: 'KOTAKBANK', name: 'Kotak Mahindra Bank', sector: 'Banking', price: 1792.60, change: 12.40, changePercent: 0.70, volume: 2400000, avgVolume: 2200000, marketCap: 356000, rsi: 52.1, peRatio: 22.8, signal: null },
  { symbol: 'AXISBANK', name: 'Axis Bank Limited', sector: 'Banking', price: 1145.80, change: -22.70, changePercent: -1.94, volume: 9800000, avgVolume: 8000000, marketCap: 354000, rsi: 38.5, peRatio: 14.2, signal: 'SELL' },
  { symbol: 'BANKBARODA', name: 'Bank of Baroda', sector: 'Banking', price: 265.40, change: 8.60, changePercent: 3.35, volume: 15000000, avgVolume: 12000000, marketCap: 137000, rsi: 68.2, peRatio: 7.8, signal: 'BUY' },
  { symbol: 'PNB', name: 'Punjab National Bank', sector: 'Banking', price: 128.75, change: 4.25, changePercent: 3.42, volume: 18000000, avgVolume: 14000000, marketCap: 79000, rsi: 71.5, peRatio: 9.2, signal: 'BUY' },
  { symbol: 'INDUSINDBK', name: 'IndusInd Bank', sector: 'Banking', price: 1458.30, change: -32.70, changePercent: -2.19, volume: 3800000, avgVolume: 3500000, marketCap: 142000, rsi: 29.8, peRatio: 15.4, signal: 'SELL' },

  // Energy Sector
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy', price: 2945.60, change: 35.40, changePercent: 1.22, volume: 5800000, avgVolume: 5000000, marketCap: 1995000, rsi: 60.8, peRatio: 28.5, signal: 'BUY' },
  { symbol: 'ONGC', name: 'Oil & Natural Gas Corp', sector: 'Energy', price: 268.45, change: -5.55, changePercent: -2.03, volume: 8500000, avgVolume: 7000000, marketCap: 337000, rsi: 42.3, peRatio: 8.2, signal: null },
  { symbol: 'NTPC', name: 'NTPC Limited', sector: 'Energy', price: 378.90, change: 12.10, changePercent: 3.30, volume: 9200000, avgVolume: 7500000, marketCap: 366000, rsi: 73.4, peRatio: 17.8, signal: 'BUY' },
  { symbol: 'POWERGRID', name: 'Power Grid Corporation', sector: 'Energy', price: 312.50, change: 8.80, changePercent: 2.90, volume: 6800000, avgVolume: 5500000, marketCap: 290000, rsi: 66.8, peRatio: 17.2, signal: 'BUY' },
  { symbol: 'COALINDIA', name: 'Coal India Limited', sector: 'Energy', price: 478.30, change: -9.70, changePercent: -1.99, volume: 4200000, avgVolume: 3800000, marketCap: 295000, rsi: 37.2, peRatio: 8.5, signal: null },
  { symbol: 'BPCL', name: 'Bharat Petroleum', sector: 'Energy', price: 612.80, change: -14.20, changePercent: -2.26, volume: 5100000, avgVolume: 4200000, marketCap: 133000, rsi: 31.5, peRatio: 11.8, signal: 'SELL' },
  { symbol: 'IOC', name: 'Indian Oil Corporation', sector: 'Energy', price: 168.45, change: 5.55, changePercent: 3.41, volume: 11000000, avgVolume: 9000000, marketCap: 188000, rsi: 74.2, peRatio: 12.4, signal: 'BUY' },
  { symbol: 'ADANIGREEN', name: 'Adani Green Energy', sector: 'Energy', price: 1845.20, change: -45.80, changePercent: -2.42, volume: 1200000, avgVolume: 1500000, marketCap: 292000, rsi: 26.4, peRatio: 85.2, signal: 'SELL' },

  // Auto Sector
  { symbol: 'MARUTI', name: 'Maruti Suzuki India', sector: 'Auto', price: 12485.50, change: 285.50, changePercent: 2.34, volume: 680000, avgVolume: 550000, marketCap: 388000, rsi: 64.8, peRatio: 30.2, signal: 'BUY' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Limited', sector: 'Auto', price: 945.60, change: -18.40, changePercent: -1.91, volume: 8500000, avgVolume: 7000000, marketCap: 347000, rsi: 40.5, peRatio: 8.1, signal: null },
  { symbol: 'M&M', name: 'Mahindra & Mahindra', sector: 'Auto', price: 2685.40, change: 52.60, changePercent: 2.00, volume: 3200000, avgVolume: 2800000, marketCap: 332000, rsi: 62.4, peRatio: 26.8, signal: 'BUY' },
  { symbol: 'HEROMOTOCO', name: 'Hero MotoCorp', sector: 'Auto', price: 4892.30, change: -42.70, changePercent: -0.86, volume: 580000, avgVolume: 520000, marketCap: 98000, rsi: 45.2, peRatio: 24.5, signal: null },
  { symbol: 'EICHERMOT', name: 'Eicher Motors', sector: 'Auto', price: 4568.75, change: 98.25, changePercent: 2.20, volume: 420000, avgVolume: 380000, marketCap: 125000, rsi: 67.8, peRatio: 32.4, signal: 'BUY' },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto', sector: 'Auto', price: 8945.20, change: -125.80, changePercent: -1.39, volume: 380000, avgVolume: 350000, marketCap: 260000, rsi: 42.8, peRatio: 28.6, signal: null },
  { symbol: 'ASHOKLEY', name: 'Ashok Leyland', sector: 'Auto', price: 245.80, change: 8.20, changePercent: 3.45, volume: 9500000, avgVolume: 7800000, marketCap: 72000, rsi: 75.2, peRatio: 18.4, signal: 'BUY' },

  // Pharma Sector
  { symbol: 'SUNPHARMA', name: 'Sun Pharmaceutical', sector: 'Pharma', price: 1685.40, change: 22.60, changePercent: 1.36, volume: 3800000, avgVolume: 3200000, marketCap: 405000, rsi: 58.2, peRatio: 32.5, signal: 'BUY' },
  { symbol: 'DRREDDY', name: "Dr. Reddy's Laboratories", sector: 'Pharma', price: 6345.80, change: -78.20, changePercent: -1.22, volume: 580000, avgVolume: 520000, marketCap: 105000, rsi: 43.5, peRatio: 20.8, signal: null },
  { symbol: 'CIPLA', name: 'Cipla Limited', sector: 'Pharma', price: 1482.60, change: 32.40, changePercent: 2.23, volume: 2900000, avgVolume: 2500000, marketCap: 120000, rsi: 64.8, peRatio: 25.4, signal: 'BUY' },
  { symbol: 'DIVISLAB', name: 'Divi\'s Laboratories', sector: 'Pharma', price: 5245.30, change: -85.70, changePercent: -1.61, volume: 720000, avgVolume: 680000, marketCap: 140000, rsi: 36.2, peRatio: 35.8, signal: null },
  { symbol: 'AUROPHARMA', name: 'Aurobindo Pharma', sector: 'Pharma', price: 1245.80, change: -28.20, changePercent: -2.21, volume: 3200000, avgVolume: 2800000, marketCap: 73000, rsi: 30.8, peRatio: 14.2, signal: 'SELL' },
  { symbol: 'LUPIN', name: 'Lupin Limited', sector: 'Pharma', price: 1582.45, change: 18.55, changePercent: 1.19, volume: 2100000, avgVolume: 1800000, marketCap: 72000, rsi: 56.4, peRatio: 28.2, signal: null },
  { symbol: 'BIOCON', name: 'Biocon Limited', sector: 'Pharma', price: 342.80, change: 12.20, changePercent: 3.69, volume: 5800000, avgVolume: 4500000, marketCap: 41000, rsi: 78.5, peRatio: 42.5, signal: 'BUY' },

  // FMCG Sector
  { symbol: 'ITC', name: 'ITC Limited', sector: 'FMCG', price: 438.60, change: 5.40, changePercent: 1.25, volume: 8200000, avgVolume: 7000000, marketCap: 549000, rsi: 54.8, peRatio: 26.4, signal: null },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever', sector: 'FMCG', price: 2345.80, change: -28.20, changePercent: -1.19, volume: 1800000, avgVolume: 1600000, marketCap: 551000, rsi: 41.2, peRatio: 54.8, signal: null },
  { symbol: 'NESTLEIND', name: 'Nestle India', sector: 'FMCG', price: 2452.40, change: -35.60, changePercent: -1.43, volume: 620000, avgVolume: 580000, marketCap: 236000, rsi: 38.4, peRatio: 72.5, signal: 'SELL' },
  { symbol: 'BRITANNIA', name: 'Britannia Industries', sector: 'FMCG', price: 5345.20, change: 68.80, changePercent: 1.30, volume: 320000, avgVolume: 280000, marketCap: 129000, rsi: 57.5, peRatio: 52.8, signal: null },
  { symbol: 'TATACONSUM', name: 'Tata Consumer Products', sector: 'FMCG', price: 1045.60, change: 22.40, changePercent: 2.19, volume: 2400000, avgVolume: 2000000, marketCap: 98000, rsi: 65.2, peRatio: 68.4, signal: 'BUY' },
  { symbol: 'MARICO', name: 'Marico Limited', sector: 'FMCG', price: 568.30, change: -8.70, changePercent: -1.51, volume: 1800000, avgVolume: 1500000, marketCap: 73000, rsi: 43.8, peRatio: 48.5, signal: null },

  // Metals Sector
  { symbol: 'TATASTEEL', name: 'Tata Steel Limited', sector: 'Metals', price: 148.50, change: 5.50, changePercent: 3.85, volume: 18000000, avgVolume: 14000000, marketCap: 181000, rsi: 76.8, peRatio: 12.5, signal: 'BUY' },
  { symbol: 'HINDALCO', name: 'Hindalco Industries', sector: 'Metals', price: 625.80, change: -12.20, changePercent: -1.91, volume: 4800000, avgVolume: 4200000, marketCap: 140000, rsi: 39.5, peRatio: 14.8, signal: null },
  { symbol: 'JSWSTEEL', name: 'JSW Steel Limited', sector: 'Metals', price: 892.40, change: 18.60, changePercent: 2.13, volume: 3500000, avgVolume: 3000000, marketCap: 217000, rsi: 61.2, peRatio: 16.2, signal: 'BUY' },
  { symbol: 'SAIL', name: 'Steel Authority of India', sector: 'Metals', price: 128.75, change: 6.25, changePercent: 5.10, volume: 22000000, avgVolume: 16000000, marketCap: 53000, rsi: 82.5, peRatio: 10.8, signal: 'BUY' },
  { symbol: 'VEDL', name: 'Vedanta Limited', sector: 'Metals', price: 438.20, change: -8.80, changePercent: -1.97, volume: 6500000, avgVolume: 5500000, marketCap: 163000, rsi: 34.2, peRatio: 9.5, signal: 'SELL' },
  { symbol: 'NMDC', name: 'NMDC Limited', sector: 'Metals', price: 228.40, change: 7.60, changePercent: 3.44, volume: 8200000, avgVolume: 6500000, marketCap: 67000, rsi: 72.4, peRatio: 11.8, signal: 'BUY' },

  // Telecom Sector
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom', price: 1585.40, change: 28.60, changePercent: 1.84, volume: 4200000, avgVolume: 3600000, marketCap: 950000, rsi: 63.5, peRatio: 72.8, signal: 'BUY' },
  { symbol: 'IDEA', name: 'Vodafone Idea', sector: 'Telecom', price: 14.25, change: -0.75, changePercent: -5.00, volume: 45000000, avgVolume: 35000000, marketCap: 48000, rsi: 22.8, peRatio: -2.5, signal: 'SELL' },

  // Infrastructure Sector
  { symbol: 'LT', name: 'Larsen & Toubro', sector: 'Infrastructure', price: 3542.80, change: 62.20, changePercent: 1.79, volume: 2800000, avgVolume: 2400000, marketCap: 487000, rsi: 59.8, peRatio: 28.4, signal: 'BUY' },
  { symbol: 'ADANIENT', name: 'Adani Enterprises', sector: 'Infrastructure', price: 2845.60, change: -52.40, changePercent: -1.81, volume: 3200000, avgVolume: 2800000, marketCap: 325000, rsi: 38.2, peRatio: 95.2, signal: 'SELL' },
  { symbol: 'ADANIPORTS', name: 'Adani Ports & SEZ', sector: 'Infrastructure', price: 1328.40, change: 18.60, changePercent: 1.42, volume: 2100000, avgVolume: 1800000, marketCap: 287000, rsi: 56.8, peRatio: 32.5, signal: null },
  { symbol: 'ULTRACEMCO', name: 'UltraTech Cement', sector: 'Infrastructure', price: 10485.50, change: -185.50, changePercent: -1.74, volume: 420000, avgVolume: 380000, marketCap: 303000, rsi: 40.2, peRatio: 35.8, signal: null },
  { symbol: 'GRASIM', name: 'Grasim Industries', sector: 'Infrastructure', price: 2545.30, change: 42.70, changePercent: 1.71, volume: 1800000, avgVolume: 1500000, marketCap: 167000, rsi: 58.4, peRatio: 28.2, signal: null },

  // Financial Services Sector
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance', sector: 'Financial Services', price: 6845.20, change: -125.80, changePercent: -1.80, volume: 1200000, avgVolume: 1100000, marketCap: 424000, rsi: 35.8, peRatio: 32.4, signal: 'SELL' },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv', sector: 'Financial Services', price: 1642.80, change: -22.20, changePercent: -1.33, volume: 1500000, avgVolume: 1300000, marketCap: 262000, rsi: 42.5, peRatio: 18.6, signal: null },
  { symbol: 'SBILIFE', name: 'SBI Life Insurance', sector: 'Financial Services', price: 1548.30, change: 18.70, changePercent: 1.22, volume: 1800000, avgVolume: 1600000, marketCap: 155000, rsi: 55.2, peRatio: 62.8, signal: null },
  { symbol: 'HDFCLIFE', name: 'HDFC Life Insurance', sector: 'Financial Services', price: 648.50, change: -8.50, changePercent: -1.29, volume: 3200000, avgVolume: 2800000, marketCap: 139000, rsi: 44.8, peRatio: 85.4, signal: null },
  { symbol: 'TITAN', name: 'Titan Company', sector: 'Financial Services', price: 3345.60, change: 52.40, changePercent: 1.59, volume: 1400000, avgVolume: 1200000, marketCap: 297000, rsi: 60.5, peRatio: 78.2, signal: 'BUY' },
  { symbol: 'ASIANPAINT', name: 'Asian Paints', sector: 'Financial Services', price: 2845.80, change: -38.20, changePercent: -1.32, volume: 1100000, avgVolume: 980000, marketCap: 273000, rsi: 38.8, peRatio: 55.4, signal: null },
  { symbol: 'APOLLOHOSP', name: 'Apollo Hospitals', sector: 'Financial Services', price: 5845.20, change: 95.80, changePercent: 1.67, volume: 580000, avgVolume: 480000, marketCap: 84000, rsi: 62.8, peRatio: 72.5, signal: 'BUY' },
]

const DEFAULT_FILTERS: ScreenerFilters = {
  sectors: [],
  priceMin: '',
  priceMax: '',
  changeMin: '',
  changeMax: '',
  volumeFilter: 'all',
  marketCapFilter: 'all',
  signalFilter: 'all',
  search: '',
}

const PRESET_SCREENS = [
  { id: 'top_gainers', label: 'Top Gainers', icon: TrendingUp, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20' },
  { id: 'top_losers', label: 'Top Losers', icon: TrendingDown, color: 'text-red-400 border-red-500/30 bg-red-500/10 hover:bg-red-500/20' },
  { id: 'top_movers', label: 'Top Movers', icon: Flame, color: 'text-orange-400 border-orange-500/30 bg-orange-500/10 hover:bg-orange-500/20' },
  { id: 'high_volume', label: 'High Volume', icon: BarChart3, color: 'text-sky-400 border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20' },
  { id: 'overbought', label: 'Overbought', icon: ArrowUp, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20' },
  { id: 'oversold', label: 'Oversold', icon: ArrowDown, color: 'text-purple-400 border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20' },
]

// --- Helper Functions ---
function formatNumber(num: number): string {
  if (num >= 10000000) return `${(num / 10000000).toFixed(2)}Cr`
  if (num >= 100000) return `${(num / 100000).toFixed(2)}L`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

function formatVolume(num: number): string {
  if (num >= 10000000) return `${(num / 10000000).toFixed(2)}Cr`
  if (num >= 100000) return `${(num / 100000).toFixed(2)}L`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

function formatMarketCap(capCr: number): string {
  if (capCr >= 100000) return `₹${(capCr / 100000).toFixed(2)}L Cr`
  if (capCr >= 1000) return `₹${(capCr / 1000).toFixed(1)}K Cr`
  return `₹${capCr.toFixed(0)} Cr`
}

// --- Main Component ---
export function StockScreener() {
  const { setSelectedSymbol, addWatchlistSymbol, settings } = useTradingStore()
  const watchlist = settings.watchlist

  const [filters, setFilters] = useState<ScreenerFilters>(DEFAULT_FILTERS)
  const [sortField, setSortField] = useState<SortField>('marketCap')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState(20)
  const [currentPage, setCurrentPage] = useState(1)
  const [filtersOpen, setFiltersOpen] = useState(true)

  // Apply preset screen
  const applyPreset = useCallback((presetId: string) => {
    if (activePreset === presetId) {
      // Deselect preset
      setActivePreset(null)
      setFilters(DEFAULT_FILTERS)
      setCurrentPage(1)
      return
    }
    setActivePreset(presetId)
    const newFilters = { ...DEFAULT_FILTERS }
    switch (presetId) {
      case 'top_gainers':
        newFilters.changeMin = '2'
        break
      case 'top_losers':
        newFilters.changeMax = '-2'
        break
      case 'top_movers':
        // Filter stocks with >2% change (gainers or losers)
        break
      case 'high_volume':
        newFilters.volumeFilter = 'above_avg'
        break
      case 'overbought':
        // We'll handle RSI filtering in the filter logic
        break
      case 'oversold':
        break
    }
    setFilters(newFilters)
    setCurrentPage(1)
  }, [activePreset])

  // Filter stocks
  const filteredStocks = useMemo(() => {
    let result = [...STOCKS]

    // Search filter
    if (filters.search.trim()) {
      const q = filters.search.toLowerCase()
      result = result.filter(
        (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
      )
    }

    // Sector filter
    if (filters.sectors.length > 0) {
      result = result.filter((s) => filters.sectors.includes(s.sector))
    }

    // Price range
    if (filters.priceMin) {
      const min = parseFloat(filters.priceMin)
      if (!isNaN(min)) result = result.filter((s) => s.price >= min)
    }
    if (filters.priceMax) {
      const max = parseFloat(filters.priceMax)
      if (!isNaN(max)) result = result.filter((s) => s.price <= max)
    }

    // Change %
    if (filters.changeMin) {
      const min = parseFloat(filters.changeMin)
      if (!isNaN(min)) result = result.filter((s) => s.changePercent >= min)
    }
    if (filters.changeMax) {
      const max = parseFloat(filters.changeMax)
      if (!isNaN(max)) result = result.filter((s) => s.changePercent <= max)
    }

    // Volume filter
    if (filters.volumeFilter === 'above_avg') {
      result = result.filter((s) => s.volume > s.avgVolume)
    } else if (filters.volumeFilter === 'below_avg') {
      result = result.filter((s) => s.volume < s.avgVolume)
    }

    // Market cap filter
    if (filters.marketCapFilter === 'large') {
      result = result.filter((s) => s.marketCap >= 50000)
    } else if (filters.marketCapFilter === 'mid') {
      result = result.filter((s) => s.marketCap >= 10000 && s.marketCap < 50000)
    } else if (filters.marketCapFilter === 'small') {
      result = result.filter((s) => s.marketCap < 10000)
    }

    // Signal filter
    if (filters.signalFilter === 'buy') {
      result = result.filter((s) => s.signal === 'BUY')
    } else if (filters.signalFilter === 'sell') {
      result = result.filter((s) => s.signal === 'SELL')
    } else if (filters.signalFilter === 'none') {
      result = result.filter((s) => s.signal === null)
    }

    // Preset overrides
    if (activePreset === 'top_movers') {
      result = result.filter((s) => Math.abs(s.changePercent) > 2)
    } else if (activePreset === 'overbought') {
      result = result.filter((s) => s.rsi > 70)
    } else if (activePreset === 'oversold') {
      result = result.filter((s) => s.rsi < 30)
    }

    // Sorting
    result.sort((a, b) => {
      let aVal: number | string = ''
      let bVal: number | string = ''

      switch (sortField) {
        case 'symbol': aVal = a.symbol; bVal = b.symbol; break
        case 'sector': aVal = a.sector; bVal = b.sector; break
        case 'price': aVal = a.price; bVal = b.price; break
        case 'change': aVal = a.change; bVal = b.change; break
        case 'changePercent': aVal = a.changePercent; bVal = b.changePercent; break
        case 'volume': aVal = a.volume; bVal = b.volume; break
        case 'marketCap': aVal = a.marketCap; bVal = b.marketCap; break
        case 'rsi': aVal = a.rsi; bVal = b.rsi; break
        case 'signal':
          aVal = a.signal || 'ZZZ'
          bVal = b.signal || 'ZZZ'
          break
      }

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      }
      return sortDirection === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number)
    })

    return result
  }, [filters, sortField, sortDirection, activePreset])

  // Export filtered stocks as CSV
  const handleExportCSV = useCallback(() => {
    const headers = ['Symbol', 'Name', 'Sector', 'Price', 'Change', 'Change%', 'Volume', 'MktCap(Cr)', 'RSI', 'PE', 'Signal']
    const rows = filteredStocks.map((s) => [
      s.symbol,
      `"${s.name}"`,
      s.sector,
      s.price.toFixed(2),
      s.change.toFixed(2),
      s.changePercent.toFixed(2),
      s.volume.toString(),
      s.marketCap.toString(),
      s.rsi.toFixed(1),
      s.peRatio.toFixed(1),
      s.signal || '',
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `screener-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
    toast.success(`Exported ${filteredStocks.length} stocks to CSV`)
  }, [filteredStocks])

  // Pagination
  const totalPages = Math.ceil(filteredStocks.length / pageSize)
  const paginatedStocks = filteredStocks.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  )

  // Summary stats
  const summary = useMemo(() => {
    const avgChange = filteredStocks.length > 0
      ? filteredStocks.reduce((sum, s) => sum + s.changePercent, 0) / filteredStocks.length
      : 0
    const buyCount = filteredStocks.filter((s) => s.signal === 'BUY').length
    const sellCount = filteredStocks.filter((s) => s.signal === 'SELL').length
    return { avgChange, buyCount, sellCount, total: filteredStocks.length }
  }, [filteredStocks])

  // Sort handler
  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection(field === 'symbol' || field === 'sector' ? 'asc' : 'desc')
    }
  }, [sortField])

  // Clear filters
  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS)
    setActivePreset(null)
    setCurrentPage(1)
  }, [])

  // Toggle sector
  const toggleSector = useCallback((sector: string) => {
    setFilters((prev) => ({
      ...prev,
      sectors: prev.sectors.includes(sector)
        ? prev.sectors.filter((s) => s !== sector)
        : [...prev.sectors, sector],
    }))
    setCurrentPage(1)
  }, [])

  // Active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (filters.sectors.length > 0) count++
    if (filters.priceMin || filters.priceMax) count++
    if (filters.changeMin || filters.changeMax) count++
    if (filters.volumeFilter !== 'all') count++
    if (filters.marketCapFilter !== 'all') count++
    if (filters.signalFilter !== 'all') count++
    if (filters.search.trim()) count++
    return count
  }, [filters])



  return (
    <TooltipProvider delayDuration={300}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="space-y-4"
      >
        {/* Preset Screens */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider mr-1">Quick Screens:</span>
          {PRESET_SCREENS.map((preset) => {
            const Icon = preset.icon
            const isActive = activePreset === preset.id
            return (
              <Button
                key={preset.id}
                variant="outline"
                size="sm"
                className={`h-8 text-xs gap-1.5 border transition-all ${
                  isActive
                    ? preset.color + ' ring-1 ring-current/20'
                    : 'border-border/50 text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => applyPreset(preset.id)}
              >
                <Icon className="h-3.5 w-3.5" />
                {preset.label}
              </Button>
            )
          })}
        </div>

        <div className="flex gap-4">
          {/* Filter Panel */}
          <AnimatePresence mode="wait">
            {filtersOpen && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex-shrink-0 overflow-hidden"
              >
                <Card className="border-border/50 bg-card/50 h-full">
                  <CardHeader className="pb-3 pt-4 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <SlidersHorizontal className="h-4 w-4 text-emerald-400" />
                        Filters
                        {activeFilterCount > 0 && (
                          <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            {activeFilterCount}
                          </Badge>
                        )}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => setFiltersOpen(false)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-4">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search symbol or name..."
                        className="pl-8 h-8 text-xs bg-background/50"
                        value={filters.search}
                        onChange={(e) => {
                          setFilters((prev) => ({ ...prev, search: e.target.value }))
                          setCurrentPage(1)
                        }}
                      />
                      {filters.search && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="absolute right-1 top-1 h-6 w-6 p-0"
                          onClick={() => setFilters((prev) => ({ ...prev, search: '' }))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>

                    <Separator className="bg-border/30" />

                    {/* Sector Filter */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Sector</Label>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                        {SECTORS.map((sector) => (
                          <label
                            key={sector}
                            className="flex items-center gap-2 cursor-pointer hover:bg-muted/30 rounded px-1.5 py-1 transition-colors"
                          >
                            <Checkbox
                              checked={filters.sectors.includes(sector)}
                              onCheckedChange={() => toggleSector(sector)}
                              className="h-3.5 w-3.5"
                            />
                            <span className="text-xs">{sector}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <Separator className="bg-border/30" />

                    {/* Price Range */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Price Range (₹)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Min"
                          type="number"
                          className="h-7 text-xs bg-background/50 font-mono"
                          value={filters.priceMin}
                          onChange={(e) => {
                            setFilters((prev) => ({ ...prev, priceMin: e.target.value }))
                            setCurrentPage(1)
                          }}
                        />
                        <span className="text-xs text-muted-foreground">—</span>
                        <Input
                          placeholder="Max"
                          type="number"
                          className="h-7 text-xs bg-background/50 font-mono"
                          value={filters.priceMax}
                          onChange={(e) => {
                            setFilters((prev) => ({ ...prev, priceMax: e.target.value }))
                            setCurrentPage(1)
                          }}
                        />
                      </div>
                    </div>

                    <Separator className="bg-border/30" />

                    {/* Change % */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Change %</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          placeholder="Min"
                          type="number"
                          step="0.1"
                          className="h-7 text-xs bg-background/50 font-mono"
                          value={filters.changeMin}
                          onChange={(e) => {
                            setFilters((prev) => ({ ...prev, changeMin: e.target.value }))
                            setCurrentPage(1)
                          }}
                        />
                        <span className="text-xs text-muted-foreground">—</span>
                        <Input
                          placeholder="Max"
                          type="number"
                          step="0.1"
                          className="h-7 text-xs bg-background/50 font-mono"
                          value={filters.changeMax}
                          onChange={(e) => {
                            setFilters((prev) => ({ ...prev, changeMax: e.target.value }))
                            setCurrentPage(1)
                          }}
                        />
                      </div>
                    </div>

                    <Separator className="bg-border/30" />

                    {/* Volume Filter */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Volume</Label>
                      <Select
                        value={filters.volumeFilter}
                        onValueChange={(v) => {
                          setFilters((prev) => ({ ...prev, volumeFilter: v as ScreenerFilters['volumeFilter'] }))
                          setCurrentPage(1)
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs bg-background/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All</SelectItem>
                          <SelectItem value="above_avg">Above Average</SelectItem>
                          <SelectItem value="below_avg">Below Average</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/30" />

                    {/* Market Cap */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Market Cap</Label>
                      <Select
                        value={filters.marketCapFilter}
                        onValueChange={(v) => {
                          setFilters((prev) => ({ ...prev, marketCapFilter: v as ScreenerFilters['marketCapFilter'] }))
                          setCurrentPage(1)
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs bg-background/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Caps</SelectItem>
                          <SelectItem value="large">Large Cap (&gt;₹50K Cr)</SelectItem>
                          <SelectItem value="mid">Mid Cap (₹10K-50K Cr)</SelectItem>
                          <SelectItem value="small">Small Cap (&lt;₹10K Cr)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/30" />

                    {/* Signal Filter */}
                    <div className="space-y-2">
                      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Signal</Label>
                      <Select
                        value={filters.signalFilter}
                        onValueChange={(v) => {
                          setFilters((prev) => ({ ...prev, signalFilter: v as ScreenerFilters['signalFilter'] }))
                          setCurrentPage(1)
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs bg-background/50">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Signals</SelectItem>
                          <SelectItem value="buy">Has BUY Signal</SelectItem>
                          <SelectItem value="sell">Has SELL Signal</SelectItem>
                          <SelectItem value="none">No Signal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Separator className="bg-border/30" />

                    {/* Clear All */}
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs gap-1.5 border-border/50 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-colors"
                      onClick={clearFilters}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Clear All Filters
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Results Area */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Summary Bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-sm font-medium">
                  Showing <span className="text-emerald-400 font-mono">{filteredStocks.length}</span> of <span className="font-mono">{STOCKS.length}</span> stocks
                </span>
                <Separator orientation="vertical" className="h-4 bg-border/30" />
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  Avg Change:
                  <span className={`font-mono font-medium ${summary.avgChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {summary.avgChange >= 0 ? '+' : ''}{summary.avgChange.toFixed(2)}%
                  </span>
                </span>
                <Separator orientation="vertical" className="h-4 bg-border/30" />
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Badge className="h-5 px-1.5 text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                    BUY: {summary.buyCount}
                  </Badge>
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Badge className="h-5 px-1.5 text-[10px] bg-red-500/20 text-red-400 border-red-500/30">
                    SELL: {summary.sellCount}
                  </Badge>
                </span>
              </div>
              <div className="flex items-center gap-2">
                {!filtersOpen && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5 text-xs border-border/50"
                        onClick={() => setFiltersOpen(true)}
                      >
                        <Filter className="h-3.5 w-3.5" />
                        Filters
                        {activeFilterCount > 0 && (
                          <Badge className="h-4 px-1 text-[9px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                            {activeFilterCount}
                          </Badge>
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Show filter panel</TooltipContent>
                  </Tooltip>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs border-border/50 hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30"
                      onClick={handleExportCSV}
                      disabled={filteredStocks.length === 0}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Export filtered stocks as CSV</TooltipContent>
                </Tooltip>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => {
                    setPageSize(Number(v))
                    setCurrentPage(1)
                  }}
                >
                  <SelectTrigger className="h-8 w-[100px] text-xs bg-background/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / page</SelectItem>
                    <SelectItem value="20">20 / page</SelectItem>
                    <SelectItem value="50">50 / page</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Results Table */}
            <Card className="border-border/50 bg-card/30 overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border/30 hover:bg-transparent">
                      <TableHead
                        className="cursor-pointer select-none h-9 text-xs font-semibold uppercase tracking-wider"
                        onClick={() => handleSort('symbol')}
                      >
                        <div className="flex items-center gap-1">
                          Symbol {sortField === 'symbol' ? (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-emerald-400" /> : <ArrowDown className="h-3 w-3 text-emerald-400" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none h-9 text-xs font-semibold uppercase tracking-wider"
                        onClick={() => handleSort('sector')}
                      >
                        <div className="flex items-center gap-1">
                          Sector {sortField === 'sector' ? (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-emerald-400" /> : <ArrowDown className="h-3 w-3 text-emerald-400" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none h-9 text-xs font-semibold uppercase tracking-wider text-right"
                        onClick={() => handleSort('price')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Price (₹) {sortField === 'price' ? (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-emerald-400" /> : <ArrowDown className="h-3 w-3 text-emerald-400" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none h-9 text-xs font-semibold uppercase tracking-wider text-right"
                        onClick={() => handleSort('change')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Chg (₹) {sortField === 'change' ? (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-emerald-400" /> : <ArrowDown className="h-3 w-3 text-emerald-400" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none h-9 text-xs font-semibold uppercase tracking-wider text-right"
                        onClick={() => handleSort('changePercent')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Chg % {sortField === 'changePercent' ? (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-emerald-400" /> : <ArrowDown className="h-3 w-3 text-emerald-400" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none h-9 text-xs font-semibold uppercase tracking-wider text-right"
                        onClick={() => handleSort('volume')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Volume {sortField === 'volume' ? (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-emerald-400" /> : <ArrowDown className="h-3 w-3 text-emerald-400" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none h-9 text-xs font-semibold uppercase tracking-wider text-right"
                        onClick={() => handleSort('marketCap')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          Mkt Cap {sortField === 'marketCap' ? (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-emerald-400" /> : <ArrowDown className="h-3 w-3 text-emerald-400" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none h-9 text-xs font-semibold uppercase tracking-wider text-right"
                        onClick={() => handleSort('rsi')}
                      >
                        <div className="flex items-center justify-end gap-1">
                          RSI {sortField === 'rsi' ? (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-emerald-400" /> : <ArrowDown className="h-3 w-3 text-emerald-400" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer select-none h-9 text-xs font-semibold uppercase tracking-wider text-center"
                        onClick={() => handleSort('signal')}
                      >
                        <div className="flex items-center justify-center gap-1">
                          Signal {sortField === 'signal' ? (sortDirection === 'asc' ? <ArrowUp className="h-3 w-3 text-emerald-400" /> : <ArrowDown className="h-3 w-3 text-emerald-400" />) : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                        </div>
                      </TableHead>
                      <TableHead className="h-9 text-xs font-semibold uppercase tracking-wider text-center">
                        Action
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <AnimatePresence mode="popLayout">
                      {paginatedStocks.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-12">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                              <Filter className="h-8 w-8 opacity-30" />
                              <span className="text-sm">No stocks match your filters</span>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-xs gap-1.5 mt-1"
                                onClick={clearFilters}
                              >
                                <RotateCcw className="h-3 w-3" />
                                Clear Filters
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedStocks.map((stock, idx) => (
                          <motion.tr
                            key={stock.symbol}
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            transition={{ duration: 0.15, delay: idx * 0.02 }}
                            className="border-border/20 cursor-pointer hover:bg-muted/20 transition-colors group"
                            onClick={() => setSelectedSymbol(stock.symbol)}
                          >
                            <TableCell className="py-2.5">
                              <div>
                                <span className="font-semibold text-sm group-hover:text-emerald-400 transition-colors">
                                  {stock.symbol}
                                </span>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">
                                  {stock.name}
                                </p>
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5">
                              <Badge
                                variant="outline"
                                className="text-[10px] h-5 px-1.5 font-normal border-border/30"
                              >
                                {stock.sector}
                              </Badge>
                            </TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-sm font-medium">
                              ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell
                              className={`py-2.5 text-right font-mono text-sm ${
                                stock.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {stock.change >= 0 ? '+' : ''}{stock.change.toFixed(2)}
                            </TableCell>
                            <TableCell
                              className={`py-2.5 text-right font-mono text-sm font-medium ${
                                stock.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                            </TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-xs text-muted-foreground">
                              <div className="flex items-center justify-end gap-1">
                                {formatVolume(stock.volume)}
                                {stock.volume > stock.avgVolume && (
                                  <Tooltip>
                                    <TooltipTrigger>
                                      <Zap className="h-3 w-3 text-amber-400" />
                                    </TooltipTrigger>
                                    <TooltipContent className="text-xs">
                                      Above avg volume ({((stock.volume / stock.avgVolume - 1) * 100).toFixed(0)}% higher)
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-2.5 text-right font-mono text-xs">
                              {formatMarketCap(stock.marketCap)}
                            </TableCell>
                            <TableCell className="py-2.5 text-right">
                              <span
                                className={`font-mono text-xs font-medium ${
                                  stock.rsi > 70
                                    ? 'text-amber-400'
                                    : stock.rsi < 30
                                    ? 'text-purple-400'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {stock.rsi.toFixed(1)}
                              </span>
                            </TableCell>
                            <TableCell className="py-2.5 text-center">
                              {stock.signal === 'BUY' ? (
                                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] h-5 px-2 font-semibold">
                                  BUY
                                </Badge>
                              ) : stock.signal === 'SELL' ? (
                                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px] h-5 px-2 font-semibold">
                                  SELL
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground/40 text-xs">—</span>
                              )}
                            </TableCell>
                            <TableCell className="py-2.5 text-center">
                              <div className="flex items-center justify-center gap-0.5">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className={`h-7 w-7 p-0 transition-opacity ${
                                        watchlist.includes(stock.symbol)
                                          ? 'opacity-100'
                                          : 'opacity-0 group-hover:opacity-100'
                                      }`}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (!watchlist.includes(stock.symbol)) {
                                          addWatchlistSymbol(stock.symbol)
                                          toast.success(`Added ${stock.symbol} to watchlist`)
                                        }
                                      }}
                                      disabled={watchlist.includes(stock.symbol)}
                                    >
                                      <Star className={`h-3.5 w-3.5 ${
                                        watchlist.includes(stock.symbol)
                                          ? 'fill-amber-400 text-amber-400'
                                          : 'text-muted-foreground hover:text-amber-400'
                                      }`} />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs">
                                    {watchlist.includes(stock.symbol) ? `${stock.symbol} in watchlist` : `Add ${stock.symbol} to watchlist`}
                                  </TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setSelectedSymbol(stock.symbol)
                                      }}
                                    >
                                      <Eye className="h-3.5 w-3.5 text-emerald-400" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="text-xs">View {stock.symbol}</TooltipContent>
                                </Tooltip>
                              </div>
                            </TableCell>
                          </motion.tr>
                        ))
                      )}
                    </AnimatePresence>
                  </TableBody>
                </Table>
              </div>
            </Card>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Page {currentPage} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 border-border/50"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 5) {
                      pageNum = i + 1
                    } else if (currentPage <= 3) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i
                    } else {
                      pageNum = currentPage - 2 + i
                    }
                    return (
                      <Button
                        key={pageNum}
                        variant={currentPage === pageNum ? 'default' : 'outline'}
                        size="sm"
                        className={`h-7 w-7 p-0 text-xs ${
                          currentPage === pageNum
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                            : 'border-border/50'
                        }`}
                        onClick={() => setCurrentPage(pageNum)}
                      >
                        {pageNum}
                      </Button>
                    )
                  })}
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 w-7 p-0 border-border/50"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </TooltipProvider>
  )
}
