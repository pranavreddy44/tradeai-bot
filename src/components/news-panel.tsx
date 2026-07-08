'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Newspaper,
  Search,
  ScanSearch,
  ThumbsUp,
  ThumbsDown,
  Minus,
  Brain,
  Clock,
  Rss,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Filter,
  ArrowUpDown,
  RefreshCw,
  Loader2,
  TrendingUp,
  TrendingDown,
  Zap,
  Globe,
  Bookmark,
  BookmarkCheck,
  Sparkles,
  AlertCircle,
  FileText,
  Trash2,
} from 'lucide-react'
import { useAutoTradeStore, type NewsItem } from '@/lib/store/autotrade-store'
import { toast } from 'sonner'

// ─── Types ─────────────────────────────────────────────────

type SentimentFilter = 'all' | 'positive' | 'negative' | 'neutral'
type CategoryFilter = 'all' | 'market' | 'sector' | 'company'
type SortOption = 'newest' | 'impactful' | 'relevant'
type TimeFilter = 'all' | '1h' | '6h' | '24h' | '7d'

// ─── Helpers ───────────────────────────────────────────────

function formatTime(dateStr?: string | null): string {
  if (!dateStr) return ''
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMin = Math.floor(diffMs / 60000)
    const diffHr = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHr / 24)

    if (diffMin < 1) return 'Just now'
    if (diffMin < 60) return `${diffMin}m ago`
    if (diffHr < 24) return `${diffHr}h ago`
    if (diffDay < 7) return `${diffDay}d ago`
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  } catch {
    return 'N/A'
  }
}

function inferCategory(item: NewsItem): CategoryFilter {
  const text = `${item.title} ${item.content || ''}`.toLowerCase()
  const marketKeywords = ['rbi', 'fii', 'dii', 'nifty', 'sensex', 'market', 'index', 'policy', 'rate', 'gdp', 'inflation', 'outflow', 'inflow', 'fed', 'sebi', 'ipo']
  const sectorKeywords = ['banking', 'it sector', 'auto sector', 'pharma', 'oil', 'steel', 'psu', 'fmcg', 'energy', 'infra', 'realty', 'cement']
  if (marketKeywords.some((k) => text.includes(k))) return 'market'
  if (sectorKeywords.some((k) => text.includes(k))) return 'sector'
  if (item.relatedSymbols && item.relatedSymbols.length > 0) return 'company'
  return 'market'
}

function getImpactLevel(score: number | null | undefined): { label: string; color: string } {
  if (score === null || score === undefined) return { label: 'Unknown', color: 'bg-zinc-500/15 text-zinc-400' }
  const abs = Math.abs(score)
  if (abs >= 0.7) return { label: 'High', color: 'bg-red-500/15 text-red-400' }
  if (abs >= 0.3) return { label: 'Medium', color: 'bg-amber-500/15 text-amber-400' }
  return { label: 'Low', color: 'bg-zinc-500/15 text-zinc-400' }
}

function getBorderColor(sentiment: string | null): string {
  switch (sentiment) {
    case 'positive': return 'border-l-emerald-500'
    case 'negative': return 'border-l-red-500'
    default: return 'border-l-amber-500'
  }
}

function getTimeCutoff(timeFilter: TimeFilter): Date | null {
  if (timeFilter === 'all') return null
  const now = Date.now()
  switch (timeFilter) {
    case '1h': return new Date(now - 60 * 60 * 1000)
    case '6h': return new Date(now - 6 * 60 * 60 * 1000)
    case '24h': return new Date(now - 24 * 60 * 60 * 1000)
    case '7d': return new Date(now - 7 * 24 * 60 * 60 * 1000)
  }
}

// ─── Sentiment Gauge ───────────────────────────────────────

function SentimentGauge({ score }: { score: number }) {
  const angle = ((score + 1) / 2) * 180
  const color = score > 0.3 ? '#10b981' : score < -0.3 ? '#ef4444' : '#f59e0b'
  const label = score > 0.3 ? 'Bullish' : score < -0.3 ? 'Bearish' : 'Neutral'

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative w-16 h-8 overflow-hidden">
        <svg viewBox="0 0 80 40" className="w-full h-full">
          <path d="M 6 38 A 34 34 0 0 1 74 38" fill="none" stroke="currentColor" strokeWidth="5" className="text-muted/20" strokeLinecap="round" />
          <path d="M 6 38 A 34 34 0 0 1 28 6" fill="none" stroke="#ef4444" strokeWidth="5" strokeLinecap="round" opacity="0.4" />
          <path d="M 24 8 A 34 34 0 0 1 56 8" fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" opacity="0.4" />
          <path d="M 52 6 A 34 34 0 0 1 74 38" fill="none" stroke="#10b981" strokeWidth="5" strokeLinecap="round" opacity="0.4" />
          <line
            x1="40" y1="38"
            x2={40 + 30 * Math.cos(((180 - angle) * Math.PI) / 180)}
            y2={38 - 30 * Math.sin(((180 - angle) * Math.PI) / 180)}
            stroke={color} strokeWidth="2" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 2px ${color})` }}
          />
          <circle cx="40" cy="38" r="3" fill={color} />
          <circle cx="40" cy="38" r="1.5" fill="var(--card)" />
        </svg>
      </div>
      <span className="text-[8px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
    </div>
  )
}

// ─── News Card ─────────────────────────────────────────────

function NewsCard({ item, onAnalyze, onBookmark, isBookmarked, onGenerateSignal, onDelete }: {
  item: NewsItem
  onAnalyze: (id: string) => void
  onBookmark: (id: string) => void
  isBookmarked: boolean
  onGenerateSignal: (item: NewsItem) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const impact = getImpactLevel(item.sentimentScore)
  const category = inferCategory(item)

  const sentimentIcon = item.sentiment === 'positive'
    ? <ThumbsUp className="h-3 w-3 shrink-0" />
    : item.sentiment === 'negative'
    ? <ThumbsDown className="h-3 w-3 shrink-0" />
    : <Minus className="h-3 w-3 shrink-0" />

  const sentimentColor = item.sentiment === 'positive'
    ? 'bg-emerald-500/20 text-emerald-400'
    : item.sentiment === 'negative'
    ? 'bg-red-500/20 text-red-400'
    : 'bg-zinc-500/20 text-zinc-400'

  const symbols = item.relatedSymbols ? item.relatedSymbols.split(',').filter(Boolean) : []

  return (
    <Card className={`border-l-4 ${getBorderColor(item.sentiment)} hover:bg-muted/30 transition-colors`}>
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CollapsibleTrigger asChild>
          <CardContent className="p-3 sm:p-4 cursor-pointer">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                {/* Title */}
                <h3 className="text-sm font-semibold leading-snug line-clamp-2 overflow-hidden mb-1.5">{item.title}</h3>

                {/* Meta row */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-1 min-w-0 max-w-[160px]">
                    <Rss className="h-3 w-3 shrink-0" />
                    <span className="truncate">{item.source.length > 30 ? new URL(item.source).hostname : item.source}</span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <Clock className="h-3 w-3 shrink-0" />
                    {formatTime(item.publishedAt)}
                  </span>
                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-border/30 shrink-0">
                    {category}
                  </Badge>
                </div>

                {/* Badges row */}
                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                  {item.sentiment && (
                    <Badge variant="secondary" className={`gap-1 text-[10px] h-5 shrink-0 ${sentimentColor}`}>
                      {sentimentIcon}
                      {item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1)}
                    </Badge>
                  )}
                  {item.sentimentScore !== null && item.sentimentScore !== undefined && (
                    <Badge variant="secondary" className={`text-[10px] h-5 shrink-0 ${impact.color}`}>
                      {impact.label} Impact
                    </Badge>
                  )}
                  {!item.analyzed && (
                    <Badge variant="outline" className="text-[10px] h-5 shrink-0 text-amber-400 border-amber-500/30">
                      New
                    </Badge>
                  )}
                </div>

                {/* Related Symbols */}
                {symbols.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap min-w-0">
                    {symbols.slice(0, 5).map(sym => (
                      <Badge
                        key={sym.trim()}
                        variant="outline"
                        className="text-[10px] h-5 px-1.5 shrink-0 cursor-pointer hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
                      >
                        {sym.trim()}
                      </Badge>
                    ))}
                    {symbols.length > 5 && (
                      <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0 text-muted-foreground">
                        +{symbols.length - 5}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Right side: Sentiment gauge + expand */}
              <div className="flex flex-col items-end gap-2 shrink-0">
                {item.sentimentScore !== null && item.sentimentScore !== undefined && (
                  <SentimentGauge score={item.sentimentScore} />
                )}
                {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            </div>
          </CardContent>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-3">
            <Separator />

            {/* Content preview */}
            {item.content && (
              <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3 overflow-hidden">{item.content}</p>
            )}

            {/* AI Summary */}
            {item.analyzed && item.aiSummary && (
              <div className="rounded-lg p-3 bg-primary/5 border border-primary/10">
                <span className="text-xs font-semibold text-primary flex items-center gap-1.5 mb-1.5">
                  <Brain className="h-3.5 w-3.5" /> AI Summary
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4 overflow-hidden">{item.aiSummary}</p>
              </div>
            )}

            {/* Sentiment Score Detail */}
            {item.sentimentScore !== null && item.sentimentScore !== undefined && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Sentiment Score</span>
                <span className={`font-mono font-medium ${item.sentimentScore > 0 ? 'text-emerald-400' : item.sentimentScore < 0 ? 'text-red-400' : 'text-amber-400'}`}>
                  {item.sentimentScore > 0 ? '+' : ''}{item.sentimentScore.toFixed(2)}
                </span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {!item.analyzed && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={(e) => { e.stopPropagation(); onAnalyze(item.id) }}
                >
                  <Brain className="h-3 w-3" /> Analyze with AI
                </Button>
              )}
              {item.analyzed && symbols.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
                  onClick={(e) => { e.stopPropagation(); onGenerateSignal(item) }}
                >
                  <Zap className="h-3 w-3" /> Generate Signal
                </Button>
              )}
              {item.source && item.source.startsWith('http') && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1.5 text-muted-foreground"
                  onClick={(e) => { e.stopPropagation(); window.open(item.source, '_blank') }}
                >
                  <ExternalLink className="h-3 w-3" /> Source
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className={`h-7 text-xs gap-1.5 ${isBookmarked ? 'text-amber-400' : 'text-muted-foreground'}`}
                onClick={(e) => { e.stopPropagation(); onBookmark(item.id) }}
              >
                {isBookmarked ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
                {isBookmarked ? 'Saved' : 'Save'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-red-400"
                onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

// ─── News Stats Banner ─────────────────────────────────────

function NewsStatsBanner({ items, scanned }: { items: NewsItem[]; scanned: number }) {
  const positive = items.filter(n => n.sentiment === 'positive').length
  const negative = items.filter(n => n.sentiment === 'negative').length
  const neutral = items.filter(n => n.sentiment === 'neutral').length
  const analyzed = items.filter(n => n.analyzed).length

  return (
    <div className="grid grid-cols-4 gap-2">
      <div className="flex flex-col items-center p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
        <span className="text-lg font-bold text-emerald-400">{positive}</span>
        <span className="text-[9px] text-muted-foreground">Positive</span>
      </div>
      <div className="flex flex-col items-center p-2 rounded-lg bg-red-500/5 border border-red-500/10">
        <span className="text-lg font-bold text-red-400">{negative}</span>
        <span className="text-[9px] text-muted-foreground">Negative</span>
      </div>
      <div className="flex flex-col items-center p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
        <span className="text-lg font-bold text-amber-400">{neutral}</span>
        <span className="text-[9px] text-muted-foreground">Neutral</span>
      </div>
      <div className="flex flex-col items-center p-2 rounded-lg bg-primary/5 border border-primary/10">
        <span className="text-lg font-bold text-primary">{analyzed}</span>
        <span className="text-[9px] text-muted-foreground">Analyzed</span>
      </div>
    </div>
  )
}

// ─── News Panel ────────────────────────────────────────────

export function NewsPanel() {
  const {
    newsItems, setNewsItems,
    newsLoading, setNewsLoading,
    newsScanning, setNewsScanning,
    addActivity,
  } = useAutoTradeStore()

  const [searchQuery, setSearchQuery] = useState('')
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set())
  const [lastScanned, setLastScanned] = useState<string | null>(null)
  const [totalScanned, setTotalScanned] = useState(0)

  // Fetch news from API
  const fetchNews = useCallback(async () => {
    setNewsLoading(true)
    try {
      const res = await fetch('/api/news?limit=50')
      if (res.ok) {
        const data = await res.json()
        setNewsItems(data.news || [])
      }
    } catch (err) {
      console.error('Failed to fetch news:', err)
    } finally {
      setNewsLoading(false)
    }
  }, [setNewsItems, setNewsLoading])

  useEffect(() => {
    fetchNews()
    const interval = setInterval(fetchNews, 60000) // refresh every minute
    return () => clearInterval(interval)
  }, [fetchNews])

  // Scan for new news
  const handleScanNews = async () => {
    setNewsScanning(true)
    try {
      const res = await fetch('/api/news/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxResults: 10 }),
      })

      if (!res.ok) {
        let errorMsg = `Failed to scan for news (${res.status})`
        if (res.status === 502 || res.status === 504) {
          errorMsg = 'Gateway timeout — the scan took too long. Try again in a moment.'
        } else {
          try {
            const text = await res.text()
            if (text.startsWith('{')) {
              const data = JSON.parse(text)
              errorMsg = data.error || data.details || errorMsg
            }
          } catch {}
        }
        toast.error('News scan failed', { description: errorMsg })
        return
      }

      const data = await res.json()
      setTotalScanned(data.totalScanned || 0)
      setLastScanned(new Date().toISOString())

      const newCount = data.newItemsSaved || 0
      const dupes = data.duplicatesSkipped || 0
      const signalsCreated = data.signalsCreated || 0
      const sourceMode = data.sourceMode as string | undefined
      const sourceLabel = sourceMode === 'combined'
        ? 'direct market feeds + web enrichment'
        : sourceMode === 'rss-first'
        ? 'direct market feeds'
        : 'saved articles'

      if (data.warning && sourceMode !== 'rss-first' && sourceMode !== 'combined') {
        if (newCount > 0) {
          toast.success('News scan partial', {
            description: `${newCount} articles analyzed. ${data.warning}`,
            duration: 6000,
          })
        } else {
          toast.warning('News scan: search timeout', {
            description: data.warning,
            duration: 8000,
          })
        }
      } else if (newCount === 0 && dupes > 0) {
        toast.warning('No new articles found', {
          description: `All ${dupes} results were duplicates. Clear old articles to make room for new ones.`,
          duration: 5000,
        })
      } else if (newCount === 0 && dupes === 0) {
        toast.info('No articles found', {
          description: 'Try clearing old articles and scanning again.',
          duration: 4000,
        })
      } else {
        toast.success('News scan complete', {
          description: `${newCount} new articles, ${dupes} duplicates skipped, ${signalsCreated} trade signals. Source: ${sourceLabel}.`,
        })
      }
      addActivity({
        message: `📰 News scan: ${newCount} new articles, ${signalsCreated} signals`,
        type: 'news',
      })

      // Refresh news list
      await fetchNews()
    } catch (err: any) {
      toast.error('News scan failed', { description: err.message || 'Network error. Please try again.' })
    } finally {
      setNewsScanning(false)
    }
  }

  // Analyze single news item
  const handleAnalyzeSingle = async (id: string) => {
    try {
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: newsItems.find(n => n.id === id)?.title || 'Indian stock market news' }),
      })

      if (!res.ok) {
        let errorMsg = `Server error (${res.status})`
        try {
          const text = await res.text()
          if (text.startsWith('{')) {
            const data = JSON.parse(text)
            errorMsg = data.error || data.details || errorMsg
          }
        } catch {}
        toast.error('Analysis failed', { description: errorMsg })
        return
      }
      const data = await res.json()
      toast.success('Analysis complete', { description: `${data.itemsSaved || 0} items processed` })
      await fetchNews()
    } catch (err: any) {
      toast.error('Analysis failed', { description: err.message || 'Network error' })
    }
  }

  // Generate signal from news
  const handleGenerateSignal = async (item: NewsItem) => {
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'analyze-signals',
          query: item.title,
        }),
      })

      // Parse response safely
      let data: any
      try {
        const text = await res.text()
        if (text.startsWith('{')) {
          data = JSON.parse(text)
        } else {
          toast.error('Failed to generate signal', { description: 'Server returned invalid response' })
          return
        }
      } catch {
        toast.error('Failed to generate signal', { description: 'Invalid server response' })
        return
      }

      if (!res.ok) {
        const errorMsg = data.error || data.details || `Server error (${res.status})`
        const isRateLimited = res.status === 429 || data.retryable
        if (isRateLimited) {
          toast.warning('AI Busy', { description: data.details || 'AI was busy — try again or use Scan Now in AI Engine for rule-based fallback.', duration: 5000 })
        } else {
          toast.error('Failed to generate signal', { description: errorMsg })
        }
        return
      }

      if (data.success && data.signalsGenerated > 0) {
        toast.success('Signal generated!', {
          description: `${data.signalsGenerated} signals from: ${item.title.substring(0, 50)}...`,
        })
        addActivity({
          message: `⚡ AI generated ${data.signalsGenerated} signal(s) from news: "${item.title.substring(0, 40)}"`,
          type: 'signal',
        })
      } else {
        toast.info(data.error || 'No actionable signals from this news')
      }
    } catch (err: any) {
      toast.error('Failed to generate signal', { description: err.message || 'Network error' })
    }
  }

  // Delete single news item
  const handleDeleteSingle = async (id: string) => {
    try {
      const res = await fetch(`/api/news?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Delete failed' }))
        toast.error('Failed to delete', { description: data.error || 'Unknown error' })
        return
      }
      const data = await res.json()
      setNewsItems(newsItems.filter(n => n.id !== id))
      toast.success('Article deleted', { description: 'News article removed successfully' })
    } catch (err: any) {
      toast.error('Delete failed', { description: err.message || 'Network error' })
    }
  }

  // Clear all news items
  const handleClearAll = async () => {
    if (!window.confirm(`Are you sure you want to delete all ${newsItems.length} news articles? This action cannot be undone.`)) {
      return
    }
    try {
      const res = await fetch('/api/news?clearAll=true', { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Clear failed' }))
        toast.error('Failed to clear', { description: data.error || 'Unknown error' })
        return
      }
      const data = await res.json()
      setNewsItems([])
      toast.success('All articles cleared', { description: `${data.deleted} news articles deleted` })
      addActivity({
        message: `🗑️ Cleared ${data.deleted} news articles`,
        type: 'system',
      })
    } catch (err: any) {
      toast.error('Clear failed', { description: err.message || 'Network error' })
    }
  }

  // Bookmark toggle
  const toggleBookmark = useCallback((id: string) => {
    setBookmarkedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // Apply all filters
  const filteredNews = newsItems
    .filter(n => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        const matchesSearch =
          n.title.toLowerCase().includes(query) ||
          (n.content && n.content.toLowerCase().includes(query)) ||
          (n.relatedSymbols && n.relatedSymbols.toLowerCase().includes(query))
        if (!matchesSearch) return false
      }
      // Sentiment filter
      if (sentimentFilter !== 'all' && n.sentiment !== sentimentFilter) return false
      // Category filter
      if (categoryFilter !== 'all' && inferCategory(n) !== categoryFilter) return false
      // Time filter
      const cutoff = getTimeCutoff(timeFilter)
      if (cutoff) {
        const newsDate = new Date(n.publishedAt || n.createdAt)
        if (newsDate < cutoff) return false
      }
      // Bookmarked only when filter active
      return true
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime()
        case 'impactful':
          return Math.abs(b.sentimentScore || 0) - Math.abs(a.sentimentScore || 0)
        case 'relevant':
          const aScore = (a.analyzed ? 1 : 0) + (a.relatedSymbols ? a.relatedSymbols.split(',').length : 0)
          const bScore = (b.analyzed ? 1 : 0) + (b.relatedSymbols ? b.relatedSymbols.split(',').length : 0)
          return bScore - aScore
        default:
          return 0
      }
    })

  // Stats
  const positiveCount = newsItems.filter(n => n.sentiment === 'positive').length
  const negativeCount = newsItems.filter(n => n.sentiment === 'negative').length

  return (
    <div className="space-y-3">

      {/* Header with Scan button */}
      <Card className="border-border/50">
        <CardContent className="p-3 sm:p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Newspaper className="h-4 w-4 text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Market News</h3>
                <p className="text-[10px] text-muted-foreground">
                  {lastScanned ? `Last scanned ${formatTime(lastScanned)}` : 'Not yet scanned'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {newsItems.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-muted-foreground hover:text-red-400 hover:border-red-500/30"
                  onClick={handleClearAll}
                  disabled={newsScanning}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Clear All
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 gap-1.5"
                onClick={handleScanNews}
                disabled={newsScanning}
              >
                {newsScanning ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <ScanSearch className="h-3.5 w-3.5" />
                    Scan News
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Scanning progress indicator */}
          {newsScanning && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
            >
              <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/10">
                <Globe className="h-3.5 w-3.5 text-primary animate-pulse" />
                <span className="text-xs text-primary">Searching web for Indian market news &amp; analyzing sentiment...</span>
              </div>
            </motion.div>
          )}

          {/* Stats */}
          {newsItems.length > 0 && (
            <NewsStatsBanner items={newsItems} scanned={totalScanned} />
          )}
        </CardContent>
      </Card>

      {/* Filter toolbar */}
      <Card className="border-border/50">
        <CardContent className="p-3 space-y-2.5">
          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search news by keyword or symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-xs pl-9 bg-background/50 border-border/50 focus:border-primary/50"
            />
          </div>

          {/* Filter row with dropdowns */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            {/* Sentiment Filter */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
              <Select value={sentimentFilter} onValueChange={(v) => setSentimentFilter(v as SentimentFilter)}>
                <SelectTrigger className="h-7 w-[120px] text-[11px] bg-background/50 border-border/50">
                  <SelectValue placeholder="Sentiment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sentiments</SelectItem>
                  <SelectItem value="positive">Positive ({positiveCount})</SelectItem>
                  <SelectItem value="negative">Negative ({negativeCount})</SelectItem>
                  <SelectItem value="neutral">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category Filter */}
            <div className="shrink-0">
              <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
                <SelectTrigger className="h-7 w-[110px] text-[11px] bg-background/50 border-border/50">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="market">Market</SelectItem>
                  <SelectItem value="sector">Sector</SelectItem>
                  <SelectItem value="company">Company</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Time Filter */}
            <div className="shrink-0">
              <Select value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)}>
                <SelectTrigger className="h-7 w-[90px] text-[11px] bg-background/50 border-border/50">
                  <SelectValue placeholder="Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="1h">Last 1h</SelectItem>
                  <SelectItem value="6h">Last 6h</SelectItem>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7d</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Sort */}
            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowUpDown className="h-3 w-3 text-muted-foreground shrink-0" />
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="h-7 w-[120px] text-[11px] bg-background/50 border-border/50">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest First</SelectItem>
                  <SelectItem value="impactful">Most Impactful</SelectItem>
                  <SelectItem value="relevant">Most Relevant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Bookmark filter toggle */}
            <Button
              variant="ghost"
              size="sm"
              className={`h-7 text-[11px] gap-1 ml-auto shrink-0 ${bookmarkedIds.size > 0 ? 'text-amber-400' : 'text-muted-foreground'}`}
              onClick={() => {
                if (bookmarkedIds.size > 0) setBookmarkedIds(new Set())
              }}
            >
              {bookmarkedIds.size > 0 ? <BookmarkCheck className="h-3 w-3 shrink-0" /> : <Bookmark className="h-3 w-3 shrink-0" />}
              {bookmarkedIds.size > 0 ? `${bookmarkedIds.size} saved` : 'Saved'}
            </Button>
          </div>

          {/* Results count */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">
              {filteredNews.length} of {newsItems.length} articles
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-[10px] gap-1 text-muted-foreground"
              onClick={fetchNews}
              disabled={newsLoading}
            >
              <RefreshCw className={`h-3 w-3 ${newsLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* News Feed */}
      {newsLoading && newsItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin mb-3" />
          <p className="text-sm">Loading news...</p>
        </div>
      ) : filteredNews.length === 0 ? (
        <Card className="border-border/30">
          <CardContent className="p-8">
            <div className="flex flex-col items-center text-center text-muted-foreground">
              <div className="relative mb-4">
                <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center">
                  <Newspaper className="h-8 w-8 opacity-30" />
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                  <Search className="h-2.5 w-2.5 text-primary" />
                </div>
              </div>
              <p className="text-sm font-medium">No news found</p>
              <p className="text-xs mt-1 text-muted-foreground/60">
                {newsItems.length === 0
                  ? 'Click "Scan News" to fetch latest market news'
                  : 'Try different filters or search terms'}
              </p>
              {newsItems.length === 0 && (
                <Button
                  size="sm"
                  className="mt-4 gap-1.5"
                  onClick={handleScanNews}
                  disabled={newsScanning}
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Scan for News Now
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="max-h-[calc(100vh-420px)]">
          <AnimatePresence mode="popLayout">
            <div className="space-y-2 pr-1">
              {filteredNews.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2, delay: index * 0.03 }}
                >
                  <NewsCard
                    item={item}
                    onAnalyze={handleAnalyzeSingle}
                    onBookmark={toggleBookmark}
                    isBookmarked={bookmarkedIds.has(item.id)}
                    onGenerateSignal={handleGenerateSignal}
                    onDelete={handleDeleteSingle}
                  />
                </motion.div>
              ))}
            </div>
          </AnimatePresence>
        </ScrollArea>
      )}
    </div>
  )
}
