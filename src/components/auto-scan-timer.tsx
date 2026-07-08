'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Timer, Loader2 } from 'lucide-react'

interface AutoScanTimerProps {
  enabled: boolean
  onToggle: () => void
  intervalMinutes?: number
  onScanComplete?: () => void
}

export function AutoScanTimer({ enabled, onToggle, intervalMinutes = 5, onScanComplete }: AutoScanTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(intervalMinutes * 60)
  const [isScanning, setIsScanning] = useState(false)
  const [justCompleted, setJustCompleted] = useState(false)
  const totalTime = intervalMinutes * 60
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const scanTriggeredRef = useRef(false)

  const performScan = useCallback(async () => {
    if (scanTriggeredRef.current) return
    scanTriggeredRef.current = true
    setIsScanning(true)
    await new Promise((resolve) => setTimeout(resolve, 2500))
    setIsScanning(false)
    setJustCompleted(true)
    onScanComplete?.()

    setTimeout(() => {
      setJustCompleted(false)
      setTimeRemaining(intervalMinutes * 60)
      scanTriggeredRef.current = false
    }, 1500)
  }, [onScanComplete, intervalMinutes])

  // Handle toggle click - reset timer when enabling
  const handleToggle = useCallback(() => {
    if (!enabled) {
      // We're about to enable, so reset the timer
      setTimeRemaining(intervalMinutes * 60)
      scanTriggeredRef.current = false
    }
    onToggle()
  }, [enabled, onToggle, intervalMinutes])

  useEffect(() => {
    if (!enabled || isScanning || justCompleted) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    intervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
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
  }, [enabled, isScanning, justCompleted, performScan])

  const minutes = Math.floor(timeRemaining / 60)
  const seconds = timeRemaining % 60
  const progress = totalTime > 0 ? (totalTime - timeRemaining) / totalTime : 0

  const radius = 18
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - progress * circumference

  const getStrokeColor = () => {
    if (justCompleted) return '#10b981'
    if (isScanning) return '#3b82f6'
    if (!enabled) return '#71717a'
    if (timeRemaining < 30) return '#f59e0b'
    return '#10b981'
  }

  return (
    <div className="flex items-center gap-2">
      <motion.button
        onClick={handleToggle}
        className="relative flex items-center justify-center cursor-pointer"
        whileTap={{ scale: 0.95 }}
        title={enabled ? 'Disable Auto-Scan' : 'Enable Auto-Scan'}
      >
        {/* SVG Circular Progress */}
        <svg
          width="40"
          height="40"
          viewBox="0 0 40 40"
          className="transform -rotate-90"
        >
          {/* Background circle */}
          <circle
            cx="20"
            cy="20"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="text-border/50"
          />
          {/* Progress circle */}
          <motion.circle
            cx="20"
            cy="20"
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
          {/* Flash effect circle on completion */}
          <AnimatePresence>
            {justCompleted && (
              <motion.circle
                cx="20"
                cy="20"
                r={radius}
                fill="none"
                stroke="#10b981"
                strokeWidth="4"
                initial={{ opacity: 1, strokeDashoffset: 0 }}
                animate={{ opacity: 0, strokeWidth: 8 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
              />
            )}
          </AnimatePresence>
        </svg>

        {/* Center icon or time */}
        <div className="absolute inset-0 flex items-center justify-center">
          <AnimatePresence mode="wait">
            {isScanning ? (
              <motion.div
                key="scanning"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1, rotate: 360 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ rotate: { repeat: Infinity, duration: 1, ease: 'linear' }, opacity: { duration: 0.15 }, scale: { duration: 0.15 } }}
              >
                <Loader2 className="h-4 w-4 text-blue-400" />
              </motion.div>
            ) : !enabled ? (
              <motion.div
                key="disabled"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.15 }}
              >
                <Timer className="h-3.5 w-3.5 text-zinc-500" />
              </motion.div>
            ) : justCompleted ? (
              <motion.div
                key="completed"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.15 }}
              >
                <svg className="h-4 w-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
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
      </motion.button>

      {/* Text info */}
      <div className="flex flex-col leading-none">
        <span className="text-[10px] text-muted-foreground">
          {isScanning ? 'Scanning...' : justCompleted ? 'Scan Complete' : !enabled ? 'Auto-Scan OFF' : 'Next scan in'}
        </span>
        {enabled && !isScanning && !justCompleted && (
          <span className="text-[11px] font-mono font-medium text-emerald-400">
            {minutes}m {seconds.toString().padStart(2, '0')}s
          </span>
        )}
        {justCompleted && (
          <motion.span
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[11px] font-medium text-emerald-400"
          >
            Resetting...
          </motion.span>
        )}
      </div>
    </div>
  )
}
