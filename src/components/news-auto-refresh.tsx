'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import {
  RefreshCw,
  Play,
  Pause,
  Clock,
  Newspaper,
  Wifi,
  WifiOff,
  Loader2,
  Timer,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

type IntervalOption = 1 | 5 | 15 | 30

interface ScanResult {
  success: boolean
  totalNew: number
  totalSignals: number
  isMarketHours: boolean
  newItems: Array<{
    id: string
    title: string
    sentiment: string | null
  }>
}

interface NewsAutoRefreshProps {
  onScanComplete?: (result: ScanResult | null) => void
  /** Whether the component starts in active mode */
  defaultActive?: boolean
  /** Default interval in minutes */
  defaultInterval?: IntervalOption
  /** Compact mode: shows only status badge + countdown */
  compact?: boolean
}

// ─── Market Hours Utility ────────────────────────────────────────────────────

function isMarketHours(): boolean {
  const now = new Date()
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000
  const istTime = new Date(
    now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000
  )

  const day = istTime.getDay() // 0=Sun, 6=Sat
  const hours = istTime.getHours()
  const minutes = istTime.getMinutes()

  // Weekend check
  if (day === 0 || day === 6) return false

  // Market hours: 9:15 AM to 3:30 PM IST
  const timeInMinutes = hours * 60 + minutes
  return timeInMinutes >= 555 && timeInMinutes <= 930 // 9:15=555, 15:30=930
}

function getTimeToMarketOpen(): string {
  const now = new Date()
  const istOffset = 5.5 * 60 * 60 * 1000
  const istTime = new Date(
    now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000
  )

  const day = istTime.getDay()
  const hours = istTime.getHours()
  const minutes = istTime.getMinutes()

  // If it's a weekend, say when market opens on Monday
  if (day === 0) return 'Opens Mon 9:15 AM'
  if (day === 6) return 'Opens Mon 9:15 AM'

  // If before market hours
  if (hours * 60 + minutes < 555) {
    const minsToOpen = 555 - (hours * 60 + minutes)
    const h = Math.floor(minsToOpen / 60)
    const m = minsToOpen % 60
    return h > 0 ? `Opens in ${h}h ${m}m` : `Opens in ${m}m`
  }

  // After market hours
  if (day === 5) return 'Opens Mon 9:15 AM'
  return 'Opens tomorrow 9:15 AM'
}

// ─── Component ───────────────────────────────────────────────────────────────

export function NewsAutoRefresh({
  onScanComplete,
  defaultActive = false,
  defaultInterval = 5,
  compact = false,
}: NewsAutoRefreshProps) {
  // State
  const [isActive, setIsActive] = useState(defaultActive)
  const [intervalMinutes, setIntervalMinutes] = useState<IntervalOption>(defaultInterval)
  const [timeRemaining, setTimeRemaining] = useState(defaultInterval * 60)
  const [isScanning, setIsScanning] = useState(false)
  const [lastScanResult, setLastScanResult] = useState<string | null>(null)
  const [marketOpen, setMarketOpen] = useState(true)
  const [scanCount, setScanCount] = useState(0)

  // Refs
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scanTriggeredRef = useRef(false)
  const marketCheckRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Total time for progress calculation
  const totalTime = intervalMinutes * 60

  // ─── Perform Scan ───────────────────────────────────────────────────────

  const performScan = useCallback(async () => {
    if (scanTriggeredRef.current || isScanning) return

    scanTriggeredRef.current = true
    setIsScanning(true)
    setLastScanResult(null)

    try {
      const response = await fetch('/api/news/auto-scan', {
        method: 'POST',
      })

      if (!response.ok) {
        throw new Error(`Scan failed: ${response.status}`)
      }

      const result: ScanResult = await response.json()

      setScanCount((prev) => prev + 1)
      setLastScanResult(
        result.totalNew > 0
          ? `${result.totalNew} new article${result.totalNew > 1 ? 's' : ''} found`
          : 'No new articles'
      )

      if (result.totalNew > 0) {
        toast.success('News scan complete', {
          description: `${result.totalNew} new article${result.totalNew > 1 ? 's' : ''} found and analyzed`,
          duration: 4000,
        })
      } else {
        toast.info('News scan complete', {
          description: 'No new articles found',
          duration: 2000,
        })
      }

      onScanComplete?.(result)
    } catch (err) {
      console.error('News scan failed:', err)
      setLastScanResult('Scan failed')
      toast.error('News scan failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
      onScanComplete?.(null)
    } finally {
      setIsScanning(false)
      scanTriggeredRef.current = false

      // Reset timer after scan
      if (isActive) {
        setTimeRemaining(intervalMinutes * 60)
      }
    }
  }, [isScanning, isActive, intervalMinutes, onScanComplete])

  // ─── Market Hours Check ─────────────────────────────────────────────────

  useEffect(() => {
    // Check market hours initially
    setMarketOpen(isMarketHours())

    // Check market hours every 30 seconds
    marketCheckRef.current = setInterval(() => {
      const open = isMarketHours()
      setMarketOpen((prev) => {
        if (prev && !open) {
          // Market just closed
          toast.info('Market closed', {
            description: 'Auto-scanning paused until market hours',
            duration: 5000,
          })
        } else if (!prev && open) {
          // Market just opened
          toast.success('Market is open!', {
            description: 'Auto-scanning resumed',
            duration: 3000,
          })
        }
        return open
      })
    }, 30000)

    return () => {
      if (marketCheckRef.current) clearInterval(marketCheckRef.current)
    }
  }, [])

  // ─── Countdown Timer ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isActive || isScanning || !marketOpen) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          // Trigger scan when timer reaches 0
          setTimeout(() => performScan(), 0)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [isActive, isScanning, marketOpen, performScan])

  // ─── Handle Interval Change ─────────────────────────────────────────────

  const handleIntervalChange = useCallback(
    (value: string) => {
      const newInterval = parseInt(value, 10) as IntervalOption
      setIntervalMinutes(newInterval)
      setTimeRemaining(newInterval * 60)
      scanTriggeredRef.current = false

      // Persist to local storage
      if (typeof window !== 'undefined') {
        localStorage.setItem('news-scan-interval', String(newInterval))
      }
    },
    []
  )

  // ─── Handle Toggle ──────────────────────────────────────────────────────

  const handleToggle = useCallback(async () => {
    const newState = !isActive
    setIsActive(newState)

    if (newState) {
      // Reset timer
      setTimeRemaining(intervalMinutes * 60)
      scanTriggeredRef.current = false
    }

    // Persist to local storage
    if (typeof window !== 'undefined') {
      localStorage.setItem('news-scan-active', String(newState))
    }
  }, [isActive, intervalMinutes])

  // ─── Manual Scan ────────────────────────────────────────────────────────

  const handleManualScan = useCallback(() => {
    if (isScanning) return
    performScan()
  }, [isScanning, performScan])

  // ─── Format Time ────────────────────────────────────────────────────────

  const formatCountdown = (seconds: number): string => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    if (m > 0) return `${m}m ${s.toString().padStart(2, '0')}s`
    return `${s}s`
  }

  // ─── Progress Calculation ───────────────────────────────────────────────

  const progress = totalTime > 0 ? (totalTime - timeRemaining) / totalTime : 0
  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60

  // ─── Circular Progress SVG ──────────────────────────────────────────────

  const radius = compact ? 14 : 18
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - progress * circumference

  const getStrokeColor = () => {
    if (isScanning) return '#3b82f6'
    if (!isActive) return '#71717a'
    if (!marketOpen) return '#f59e0b'
    if (timeRemaining < 30) return '#f59e0b'
    return '#10b981'
  }

  // ─── Status Badge ───────────────────────────────────────────────────────

  const getStatusBadge = () => {
    if (isScanning) {
      return (
        <Badge
          variant="secondary"
          className="gap-1.5 text-xs bg-blue-500/15 text-blue-400 border border-blue-500/20"
        >
          <Loader2 className="h-3 w-3 animate-spin" />
          Scanning
        </Badge>
      )
    }

    if (!marketOpen && isActive) {
      return (
        <Badge
          variant="secondary"
          className="gap-1.5 text-xs bg-amber-500/15 text-amber-400 border border-amber-500/20"
        >
          <WifiOff className="h-3 w-3" />
          Market Closed
        </Badge>
      )
    }

    if (isActive) {
      return (
        <Badge
          variant="secondary"
          className="gap-1.5 text-xs bg-emerald-500/15 text-emerald-400 border border-emerald-500/20"
        >
          <motion.span
            className="relative flex h-2 w-2"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
          >
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </motion.span>
          Live
        </Badge>
      )
    }

    return (
      <Badge
        variant="secondary"
        className="gap-1.5 text-xs bg-zinc-500/15 text-zinc-400 border border-zinc-500/20"
      >
        <Wifi className="h-3 w-3" />
        Paused
      </Badge>
    )
  }

  // ─── Compact Mode ───────────────────────────────────────────────────────

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {getStatusBadge()}
        {isActive && !isScanning && (
          <span className="text-[10px] font-mono text-muted-foreground">
            {marketOpen ? formatCountdown(timeRemaining) : getTimeToMarketOpen()}
          </span>
        )}
        {lastScanResult && (
          <motion.span
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-[10px] text-emerald-400"
          >
            {lastScanResult}
          </motion.span>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={handleToggle}
              disabled={isScanning}
            >
              {isActive ? (
                <Pause className="h-3.5 w-3.5" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isActive ? 'Pause auto-scan' : 'Start auto-scan'}
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  // ─── Full Mode ──────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-3 p-3 rounded-xl bg-card/50 border border-border/30">
      {/* Top Row: Status + Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {getStatusBadge()}
          {scanCount > 0 && (
            <span className="text-[10px] text-muted-foreground">
              #{scanCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {/* Interval Selector */}
          <Select
            value={String(intervalMinutes)}
            onValueChange={handleIntervalChange}
          >
            <SelectTrigger className="h-7 w-[85px] text-[11px] bg-background/50 border-border/50">
              <Timer className="h-3 w-3 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 min</SelectItem>
              <SelectItem value="5">5 min</SelectItem>
              <SelectItem value="15">15 min</SelectItem>
              <SelectItem value="30">30 min</SelectItem>
            </SelectContent>
          </Select>

          {/* Manual Scan Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={handleManualScan}
                disabled={isScanning}
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Scan now</TooltipContent>
          </Tooltip>

          {/* Play/Pause Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 w-7 p-0 ${isActive ? 'text-emerald-400' : 'text-muted-foreground'}`}
                onClick={handleToggle}
                disabled={isScanning}
              >
                {isActive ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {isActive ? 'Pause auto-scan' : 'Start auto-scan'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Countdown + Progress Ring */}
      <div className="flex items-center gap-3">
        {/* Circular Progress */}
        <div className="relative flex-shrink-0">
          <svg
            width={compact ? 32 : 40}
            height={compact ? 32 : 40}
            viewBox={`0 0 ${compact ? 32 : 40} ${compact ? 32 : 40}`}
            className="transform -rotate-90"
          >
            {/* Background circle */}
            <circle
              cx={compact ? 16 : 20}
              cy={compact ? 16 : 20}
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-border/50"
            />
            {/* Progress circle */}
            <motion.circle
              cx={compact ? 16 : 20}
              cy={compact ? 16 : 20}
              r={radius}
              fill="none"
              stroke={getStrokeColor()}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              initial={false}
              animate={{
                strokeDashoffset,
                stroke: getStrokeColor(),
              }}
              transition={{ duration: 0.5, ease: 'easeInOut' }}
            />
          </svg>

          {/* Center Content */}
          <div className="absolute inset-0 flex items-center justify-center">
            <AnimatePresence mode="wait">
              {isScanning ? (
                <motion.div
                  key="scanning"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1, rotate: 360 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{
                    rotate: { repeat: Infinity, duration: 1, ease: 'linear' },
                    opacity: { duration: 0.15 },
                    scale: { duration: 0.15 },
                  }}
                >
                  <Loader2 className="h-4 w-4 text-blue-400" />
                </motion.div>
              ) : !isActive ? (
                <motion.div
                  key="disabled"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15 }}
                >
                  <Clock className="h-3.5 w-3.5 text-zinc-500" />
                </motion.div>
              ) : !marketOpen ? (
                <motion.div
                  key="market-closed"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.15 }}
                >
                  <WifiOff className="h-3.5 w-3.5 text-amber-400" />
                </motion.div>
              ) : (
                <motion.div
                  key="timer"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[9px] font-mono font-bold text-emerald-400"
                >
                  {minutes > 0 ? `${minutes}m` : `${seconds}s`}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Timer Text + Last Scan */}
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Newspaper className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground truncate">
              {isScanning
                ? 'Scanning news...'
                : !isActive
                  ? 'Auto-scan paused'
                  : !marketOpen
                    ? 'Market closed — scanning paused'
                    : `Next scan in ${minutes}m ${seconds.toString().padStart(2, '0')}s`}
            </span>
          </div>

          {/* Last Scan Result */}
          <AnimatePresence>
            {lastScanResult && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="flex items-center gap-1.5"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                  className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0"
                />
                <span className="text-[11px] text-emerald-400 truncate">
                  {lastScanResult}
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Market Closed Info */}
          {isActive && !marketOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-1.5"
            >
              <Clock className="h-3 w-3 text-amber-400 flex-shrink-0" />
              <span className="text-[10px] text-amber-400/80">
                {getTimeToMarketOpen()}
              </span>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}
