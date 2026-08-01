'use client'

import { useState, useEffect, useCallback } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { motion } from 'framer-motion'
import {
  Radio,
  Bot,
  BarChart3,
  Settings,
  Wifi,
  WifiOff,
  Activity,
  CircleDot,
  Wallet,
  Zap,
  Loader2,
  Newspaper,
  Link2,
  Trophy,
} from 'lucide-react'
import { useAutoTradeStore, type BotStatus } from '@/lib/store/autotrade-store'
import { SignalFeed } from '@/components/signal-feed'
import { SourceLeaderboard } from '@/components/source-leaderboard'


import { SetupPanel } from '@/components/setup-panel'
import { NewsPanel } from '@/components/news-panel'

// ─── Status Indicator ──────────────────────────────────────

function StatusIndicator({ status }: { status: BotStatus }) {
  const colors = {
    running: 'bg-emerald-500',
    stopped: 'bg-zinc-500',
    scanning: 'bg-yellow-500 animate-pulse',
  }
  const labels = {
    running: 'Running',
    stopped: 'Stopped',
    scanning: 'Scanning',
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className={`h-2 w-2 rounded-full ${colors[status]}`} />
      <span className="text-xs font-medium">{labels[status]}</span>
    </div>
  )
}

// ─── AutoTrade Dashboard ───────────────────────────────────

export function AutoTradeDashboard() {
  const {
    botStatus, setBotStatus,
    config, updateConfig,
    signals,
    setLastScanTime,
    setSentiment,
    setIsScanning,
    addActivity,
  } = useAutoTradeStore()

  const [activeTab, setActiveTab] = useState('signals')
  const [signalsSubTab, setSignalsSubTab] = useState<'feed' | 'leaderboard'>('feed')
  const [leaderboardSourceFilter, setLeaderboardSourceFilter] = useState<string | null>(null)

  // Fetch bot settings
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/settings')
        if (res.ok) {
          const data = await res.json()
          const s = data.settings || {}
          if (s.autoTrade !== undefined) updateConfig({ autoTrade: s.autoTrade === 'true' })
          if (s.maxPerTrade) updateConfig({ maxPerTrade: parseInt(s.maxPerTrade) })
          if (s.dailyLimit) updateConfig({ dailyLimit: parseInt(s.dailyLimit) })
          if (s.totalBudget) updateConfig({ totalBudget: parseInt(s.totalBudget) })
          if (s.scanInterval) updateConfig({ scanInterval: parseInt(s.scanInterval) })
          if (s.riskLevel) updateConfig({ riskLevel: s.riskLevel as any })
          if (s.confidenceThreshold) updateConfig({ confidenceThreshold: parseInt(s.confidenceThreshold) })
        }
      } catch {}
    }
    loadSettings()
  }, [updateConfig])



  const pendingSignals = signals.filter(s => s.status === 'pending').length
  const newsCount = useAutoTradeStore(s => s.newsItems.length)

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md"
      >
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2.5">
          <div className="flex items-center justify-between gap-3">
            {/* Logo + Name */}
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Zap className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <h1 className="text-sm sm:text-base font-bold tracking-tight">AutoTrade Bot</h1>
                <div className="flex items-center gap-2">
                  <StatusIndicator status={botStatus} />
                </div>
              </div>
            </div>

            {/* Right side info */}
            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3 flex-1">

              {/* News badge */}
              {newsCount > 0 && (
                <Badge
                  variant="secondary"
                  className="text-[10px] h-6 px-2 gap-1 bg-primary/10 text-primary border-primary/20 cursor-pointer"
                  onClick={() => setActiveTab('news')}
                >
                  <Newspaper className="h-3 w-3" />
                  {newsCount}
                </Badge>
              )}

              {/* Pending signals badge */}
              {pendingSignals > 0 && (
                <Badge variant="secondary" className="text-[10px] h-6 px-2 gap-1 bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                  <CircleDot className="h-3 w-3" />
                  {pendingSignals} pending
                </Badge>
              )}

              {/* Budget */}
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wallet className="h-3.5 w-3.5" />
                <span>₹{config.totalBudget.toLocaleString()}</span>
                <span className="text-[9px]">Budget</span>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-3 sm:px-4 py-3">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full flex flex-wrap sm:grid sm:grid-cols-3 h-auto min-h-9 mb-3">
            <TabsTrigger value="signals" className="text-xs gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex-1 sm:flex-none">
              <Radio className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Signals</span>
            </TabsTrigger>
            <TabsTrigger value="news" className="text-xs gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary flex-1 sm:flex-none">
              <Newspaper className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">News</span>
            </TabsTrigger>
            <TabsTrigger value="setup" className="text-xs gap-1 data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Setup</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signals" className="mt-0">
            {/* Sub-tab switcher */}
            <div className="flex items-center gap-1 mb-3 p-1 bg-muted/30 rounded-lg border border-border/40 w-fit">
              <button
                onClick={() => setSignalsSubTab('feed')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  signalsSubTab === 'feed'
                    ? 'bg-primary/15 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Radio className="h-3 w-3" />
                Signals Feed
              </button>
              <button
                onClick={() => {
                  setSignalsSubTab('leaderboard')
                  setLeaderboardSourceFilter(null)
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  signalsSubTab === 'leaderboard'
                    ? 'bg-primary/15 text-primary shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Trophy className="h-3 w-3" />
                Source Leaderboard
              </button>
            </div>
            {signalsSubTab === 'feed' ? (
              <SignalFeed sourceFilter={leaderboardSourceFilter ?? undefined} />
            ) : (
              <SourceLeaderboard
                onViewSourceSignals={(sourceId) => {
                  setLeaderboardSourceFilter(sourceId)
                  setSignalsSubTab('feed')
                }}
              />
            )}
          </TabsContent>

          <TabsContent value="news" className="mt-0">
            <NewsPanel />
          </TabsContent>

          <TabsContent value="setup" className="mt-0">
            <SetupPanel />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 mt-auto">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 py-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Trade AI Bot v1.0</span>
            <div className="flex items-center gap-3">
              <span>Risk: <span className={`font-medium ${
                config.riskLevel === 'conservative' ? 'text-blue-400'
                : config.riskLevel === 'moderate' ? 'text-yellow-400'
                : 'text-red-400'
              }`}>{config.riskLevel}</span></span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
