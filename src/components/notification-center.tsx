'use client'

import { useState, useCallback } from 'react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Bell,
  Zap,
  Play,
  Newspaper,
  Settings,
  Check,
  Trash2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

type NotificationType = 'signal' | 'trade' | 'news' | 'system'

interface Notification {
  id: string
  type: NotificationType
  title: string
  description: string
  timestamp: Date
  read: boolean
}

const notificationTypeConfig: Record<NotificationType, { icon: typeof Zap; color: string; bgColor: string; borderColor: string }> = {
  signal: { icon: Zap, color: 'text-emerald-400', bgColor: 'bg-emerald-500/15', borderColor: 'border-l-emerald-500' },
  trade: { icon: Play, color: 'text-sky-400', bgColor: 'bg-sky-500/15', borderColor: 'border-l-sky-500' },
  news: { icon: Newspaper, color: 'text-amber-400', bgColor: 'bg-amber-500/15', borderColor: 'border-l-amber-500' },
  system: { icon: Settings, color: 'text-zinc-400', bgColor: 'bg-zinc-500/15', borderColor: 'border-l-zinc-500' },
}

const initialNotifications: Notification[] = [
  {
    id: '1',
    type: 'signal',
    title: 'Signal Generated: BUY RELIANCE',
    description: 'AI detected bullish momentum on RELIANCE with 87% confidence. Entry at ₹2,890, Target ₹2,980.',
    timestamp: new Date(Date.now() - 2 * 60 * 1000),
    read: false,
  },
  {
    id: '2',
    type: 'trade',
    title: 'Trade Executed: TATAMOTORS',
    description: 'BUY order filled at ₹980.00. Quantity: 50 shares. Stop Loss set at ₹950.',
    timestamp: new Date(Date.now() - 8 * 60 * 1000),
    read: false,
  },
  {
    id: '3',
    type: 'news',
    title: 'RBI Policy Announcement',
    description: 'RBI maintains repo rate at 6.5%. Banking sector likely to see increased volatility.',
    timestamp: new Date(Date.now() - 15 * 60 * 1000),
    read: false,
  },
  {
    id: '4',
    type: 'system',
    title: 'Auto-Scan Completed',
    description: 'Market scan completed. 3 new signals detected across NIFTY 50 stocks.',
    timestamp: new Date(Date.now() - 22 * 60 * 1000),
    read: true,
  },
  {
    id: '5',
    type: 'signal',
    title: 'Signal Generated: SELL HDFCBANK',
    description: 'Bearish divergence detected on HDFCBANK with 74% confidence. Entry at ₹1,645, Target ₹1,590.',
    timestamp: new Date(Date.now() - 35 * 60 * 1000),
    read: false,
  },
  {
    id: '6',
    type: 'trade',
    title: 'Target Hit: INFY +3.2%',
    description: 'BUY INFY position reached target at ₹1,580. Unrealized P&L: +₹4,800.',
    timestamp: new Date(Date.now() - 48 * 60 * 1000),
    read: true,
  },
  {
    id: '7',
    type: 'news',
    title: 'Q4 Earnings: TCS Beats Estimates',
    description: 'TCS reported Q4 revenue of ₹62,200Cr, beating street estimates by 3.5%. IT sector rally expected.',
    timestamp: new Date(Date.now() - 65 * 60 * 1000),
    read: true,
  },
  {
    id: '8',
    type: 'system',
    title: 'Model Updated: Qwen3 32B',
    description: 'AI model has been updated with latest market data. Analysis accuracy improved by 2.1%.',
    timestamp: new Date(Date.now() - 90 * 60 * 1000),
    read: true,
  },
  {
    id: '9',
    type: 'signal',
    title: 'Signal Generated: BUY ITC',
    description: 'Breakout above resistance at ₹465 with strong volume. Confidence: 81%.',
    timestamp: new Date(Date.now() - 120 * 60 * 1000),
    read: true,
  },
  {
    id: '10',
    type: 'trade',
    title: 'Stop Loss Triggered: SBIN',
    description: 'SELL SBIN position stopped out at ₹780. Loss: -₹1,200 (-1.5%).',
    timestamp: new Date(Date.now() - 180 * 60 * 1000),
    read: true,
  },
]

function formatRelativeTime(date: Date): string {
  const diff = Date.now() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

export function NotificationCenter() {
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications)
  const [open, setOpen] = useState(false)

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }, [])

  const clearAll = useCallback(() => {
    setNotifications([])
  }, [])

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }, [])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative text-muted-foreground p-2">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-h-[16px] min-w-[16px] px-1 rounded-full bg-amber-400 text-[10px] font-bold text-amber-950"
            >
              {unreadCount}
            </motion.span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-80 sm:w-96 p-0 bg-popover border-border/60 shadow-xl shadow-black/20"
      >
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">Notifications</h3>
                  {unreadCount > 0 && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-500/15 text-amber-400">
                      {unreadCount} new
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {unreadCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-amber-400 hover:text-amber-300 gap-1 px-2"
                      onClick={markAllAsRead}
                    >
                      <Check className="h-3 w-3" />
                      Mark all read
                    </Button>
                  )}
                  {notifications.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-[11px] text-red-400 hover:text-red-300 gap-1 px-2"
                      onClick={clearAll}
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear all
                    </Button>
                  )}
                </div>
              </div>
              <Separator />

              {/* Notification List */}
              <div className="max-h-96 overflow-y-auto custom-scrollbar">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Bell className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-xs">No notifications</p>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {notifications.map((notification) => {
                      const config = notificationTypeConfig[notification.type]
                      const IconComponent = config.icon

                      return (
                        <motion.div
                          key={notification.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.15 }}
                          className={`border-b border-border/30 last:border-b-0 cursor-pointer transition-colors hover:bg-muted/30 ${
                            !notification.read ? `border-l-2 ${config.borderColor} bg-muted/10` : 'border-l-2 border-l-transparent'
                          }`}
                          onClick={() => markAsRead(notification.id)}
                        >
                          <div className="flex items-start gap-3 px-4 py-3">
                            <div className={`shrink-0 flex items-center justify-center h-7 w-7 rounded-full ${config.bgColor}`}>
                              <IconComponent className={`h-3.5 w-3.5 ${config.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className={`text-xs font-medium truncate ${!notification.read ? 'text-foreground' : 'text-muted-foreground'}`}>
                                  {notification.title}
                                </p>
                                {!notification.read && (
                                  <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-amber-400" />
                                )}
                              </div>
                              <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                                {notification.description}
                              </p>
                              <p className="text-[10px] text-muted-foreground/60 mt-1">
                                {formatRelativeTime(notification.timestamp)}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </PopoverContent>
    </Popover>
  )
}
