'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useTradingStore } from '@/lib/store/trading-store'
import { mockNews } from '@/lib/mock-data'
import type { NewsItem } from '@/lib/types/trading'
import {
  ScanSearch,
  Search,
  ThumbsUp,
  ThumbsDown,
  Minus,
  ExternalLink,
  Clock,
  Brain,
  Newspaper,
  Link2,
  Rss,
  Heart,
  Download,
  Filter,
  ArrowUpDown,
  Bookmark,
  FileText,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { quickExportCSV } from '@/components/export-dialog'

type SentimentFilter = 'all' | 'positive' | 'negative' | 'neutral'
type CategoryFilter = 'all' | 'market' | 'sector' | 'company'
type SortOption = 'newest' | 'impactful' | 'relevant'

function SentimentGauge({ score }: { score: number }) {
  // Score is -1 to 1, normalize to 0-180 degrees
  const angle = ((score + 1) / 2) * 180
  const color = score > 0.3 ? '#10b981' : score < -0.3 ? '#ef4444' : '#f59e0b'
  const label = score > 0.3 ? 'Bullish' : score < -0.3 ? 'Bearish' : 'Neutral'

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div className="relative w-20 h-10 overflow-hidden">
        <svg viewBox="0 0 80 40" className="w-full h-full">
          {/* Background arc */}
          <path
            d="M 6 38 A 34 34 0 0 1 74 38"
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            className="text-muted/20"
            strokeLinecap="round"
          />
          {/* Red zone (bearish) */}
          <path
            d="M 6 38 A 34 34 0 0 1 28 6"
            fill="none"
            stroke="#ef4444"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.4"
          />
          {/* Amber zone (neutral) */}
          <path
            d="M 24 8 A 34 34 0 0 1 56 8"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.4"
          />
          {/* Green zone (bullish) */}
          <path
            d="M 52 6 A 34 34 0 0 1 74 38"
            fill="none"
            stroke="#10b981"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.4"
          />
          {/* Colored needle */}
          <line
            x1="40"
            y1="38"
            x2={40 + 30 * Math.cos(((180 - angle) * Math.PI) / 180)}
            y2={38 - 30 * Math.sin(((180 - angle) * Math.PI) / 180)}
            stroke={color}
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 3px ${color})` }}
          />
          <circle cx="40" cy="38" r="4" fill={color} style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
          <circle cx="40" cy="38" r="2" fill="var(--card)" />
        </svg>
      </div>
      <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color }}>{label}</span>
    </div>
  )
}

function getImpactLevel(score: number | undefined): { label: string; color: string; accent: string } {
  if (score === undefined) return { label: 'Unknown', color: 'bg-zinc-500/15 text-zinc-400', accent: 'gradient-top-sky' }
  const abs = Math.abs(score)
  if (abs >= 0.7) return { label: 'High', color: 'bg-red-500/15 text-red-400 badge-glow-red', accent: 'gradient-top-red' }
  if (abs >= 0.3) return { label: 'Medium', color: 'bg-amber-500/15 text-amber-400 badge-glow-amber', accent: 'gradient-top-amber' }
  return { label: 'Low', color: 'bg-zinc-500/15 text-zinc-400', accent: 'gradient-top-sky' }
}

function getBorderColor(sentiment?: string): string {
  switch (sentiment) {
    case 'positive': return 'border-l-emerald-500'
    case 'negative': return 'border-l-red-500'
    default: return 'border-l-amber-500'
  }
}

// Infer category from news content/title
function inferCategory(item: NewsItem): CategoryFilter {
  const text = `${item.title} ${item.content || ''}`.toLowerCase()
  const marketKeywords = ['rbi', 'fii', 'dii', 'nifty', 'sensex', 'market', 'index', 'policy', 'rate', 'gdp', 'inflation', 'outflow', 'inflow']
  const sectorKeywords = ['banking', 'it sector', 'auto sector', 'pharma', 'oil', 'steel', 'psu', 'fmcg', 'energy', 'infra']
  if (marketKeywords.some((k) => text.includes(k))) return 'market'
  if (sectorKeywords.some((k) => text.includes(k))) return 'sector'
  if (item.relatedSymbols && item.relatedSymbols.length > 0) return 'company'
  return 'market'
}

export function NewsFeed() {
  const { news, setNews } = useTradingStore()
  const [searchSymbol, setSearchSymbol] = useState('')
  const [isScanning, setIsScanning] = useState(false)
  const [sentimentFilter, setSentimentFilter] = useState<SentimentFilter>('all')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const [sortBy, setSortBy] = useState<SortOption>('newest')
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (news.length === 0) {
      setNews(mockNews)
    }
  }, [news.length, setNews])

  const handleScanNews = async () => {
    setIsScanning(true)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const updated = useTradingStore.getState().news.map((n: NewsItem) =>
      n.analyzed
        ? n
        : {
            ...n,
            analyzed: true,
            aiSummary: 'AI analysis complete. This news has moderate impact on the related stocks.',
            sentiment: (['positive', 'negative', 'neutral'] as const)[Math.floor(Math.random() * 3)],
            sentimentScore: Math.round((Math.random() * 2 - 1) * 100) / 100,
          }
    )
    setNews(updated)
    setIsScanning(false)
  }

  const handleAnalyzeSingle = async (newsId: string) => {
    const updated = useTradingStore.getState().news.map((n: NewsItem) =>
      n.id === newsId
        ? {
            ...n,
            analyzed: true,
            aiSummary: 'AI analysis complete. This news has significant market implications.',
            sentiment: (['positive', 'negative', 'neutral'] as const)[Math.floor(Math.random() * 3)],
            sentimentScore: Math.round((Math.random() * 2 - 1) * 100) / 100,
          }
        : n
    )
    setNews(updated)
  }

  const toggleBookmark = useCallback((id: string) => {
    setBookmarkedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleExportNews = useCallback(() => {
    // Re-apply filters at export time to get current filtered results
    const currentFiltered = news
      .filter((n: NewsItem) => {
        if (searchSymbol) {
          const matches =
            n.relatedSymbols?.some((s) => s.toLowerCase().includes(searchSymbol.toLowerCase())) ||
            n.title.toLowerCase().includes(searchSymbol.toLowerCase())
          if (!matches) return false
        }
        if (sentimentFilter !== 'all' && n.sentiment !== sentimentFilter) return false
        if (categoryFilter !== 'all' && inferCategory(n) !== categoryFilter) return false
        return true
      })
    const dataToExport = currentFiltered.map((n: NewsItem) => ({
      Title: n.title,
      Source: n.source,
      Sentiment: n.sentiment || 'unknown',
      'Sentiment Score': n.sentimentScore ?? '',
      'Related Symbols': (n.relatedSymbols || []).join('; '),
      Analyzed: n.analyzed ? 'Yes' : 'No',
      'Published At': n.publishedAt ? new Date(n.publishedAt).toLocaleString('en-IN') : '',
      'Created At': new Date(n.createdAt).toLocaleString('en-IN'),
    }))
    const headers = ['Title', 'Source', 'Sentiment', 'Sentiment Score', 'Related Symbols', 'Analyzed', 'Published At', 'Created At']
    quickExportCSV(dataToExport as unknown as Record<string, unknown>[], headers, 'tradeai-news')
  }, [news, searchSymbol, sentimentFilter, categoryFilter])

  // Apply all filters
  const filteredNews = news
    .filter((n: NewsItem) => {
      // Search filter
      if (searchSymbol) {
        const matches =
          n.relatedSymbols?.some((s) => s.toLowerCase().includes(searchSymbol.toLowerCase())) ||
          n.title.toLowerCase().includes(searchSymbol.toLowerCase())
        if (!matches) return false
      }
      // Sentiment filter
      if (sentimentFilter !== 'all' && n.sentiment !== sentimentFilter) return false
      // Category filter
      if (categoryFilter !== 'all' && inferCategory(n) !== categoryFilter) return false
      return true
    })
    .sort((a: NewsItem, b: NewsItem) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime()
        case 'impactful':
          return Math.abs(b.sentimentScore || 0) - Math.abs(a.sentimentScore || 0)
        case 'relevant':
          // Prioritize analyzed with related symbols
          const aScore = (a.analyzed ? 1 : 0) + (a.relatedSymbols?.length || 0)
          const bScore = (b.analyzed ? 1 : 0) + (b.relatedSymbols?.length || 0)
          return bScore - aScore
        default:
          return 0
      }
    })

  const getSentimentIcon = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return <ThumbsUp className="h-3.5 w-3.5" />
      case 'negative':
        return <ThumbsDown className="h-3.5 w-3.5" />
      default:
        return <Minus className="h-3.5 w-3.5" />
    }
  }

  const getSentimentColor = (sentiment?: string) => {
    switch (sentiment) {
      case 'positive':
        return 'bg-emerald-500/20 text-emerald-400'
      case 'negative':
        return 'bg-red-500/20 text-red-400'
      default:
        return 'bg-zinc-500/20 text-zinc-400'
    }
  }

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })
  }

  // Source icon mapping
  const getSourceIcon = (source: string) => {
    return <Rss className="h-3 w-3" />
  }

  return (
    <div className="space-y-4">
      {/* Professional Header */}
      <Card className="card-top-accent card-top-accent-emerald overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-600 to-emerald-500 shadow-lg shadow-emerald-500/20">
                <Newspaper className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold">News Feed</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">AI-powered market intelligence</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 gap-1.5 text-xs">
                <FileText className="h-3 w-3" />
                {filteredNews.length} articles
              </Badge>
              {bookmarkedIds.size > 0 && (
                <Badge variant="secondary" className="gap-1 text-xs bg-pink-500/15 text-pink-400 border border-pink-500/20">
                  <Heart className="h-3 w-3 fill-current" />
                  {bookmarkedIds.size} saved
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 pb-4">
          <div className="flex flex-col gap-3">
            {/* Search + Scan row */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by symbol or keyword..."
                  value={searchSymbol}
                  onChange={(e) => setSearchSymbol(e.target.value)}
                  className="pl-9 bg-background/50 border-border/50 focus:border-emerald-500/50"
                />
              </div>
              <Button
                onClick={handleScanNews}
                disabled={isScanning}
                className="bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white gap-2 shrink-0 shadow-lg shadow-emerald-500/20 transition-all duration-200 hover:shadow-emerald-500/30"
              >
                <ScanSearch className={`h-4 w-4 ${isScanning ? 'animate-pulse' : ''}`} />
                {isScanning ? 'Scanning...' : 'Scan News'}
              </Button>
            </div>

            {/* Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              {/* Sentiment Filter */}
              <div className="flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Select value={sentimentFilter} onValueChange={(v) => setSentimentFilter(v as SentimentFilter)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs bg-background/50 border-border/50">
                    <SelectValue placeholder="Sentiment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sentiments</SelectItem>
                    <SelectItem value="positive">Positive</SelectItem>
                    <SelectItem value="negative">Negative</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sort */}
              <div className="flex items-center gap-2">
                <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                  <SelectTrigger className="h-8 w-[140px] text-xs bg-background/50 border-border/50">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest First</SelectItem>
                    <SelectItem value="impactful">Most Impactful</SelectItem>
                    <SelectItem value="relevant">Most Relevant</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Export */}
              <div className="flex items-center gap-2 sm:ml-auto">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5 border-border/50 hover:border-emerald-500/30 hover:text-emerald-400 transition-colors"
                  onClick={handleExportNews}
                >
                  <Download className="h-3 w-3" />
                  Export
                </Button>
              </div>
            </div>

            {/* Category Tabs with active indicator */}
            <div className="flex items-center gap-1 border-b border-border/30 pb-0.5">
              {(['all', 'market', 'sector', 'company'] as CategoryFilter[]).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={`relative px-3 py-2 text-xs font-medium rounded-t-md transition-all duration-200 ${
                    categoryFilter === cat
                      ? 'text-emerald-400 tab-indicator active'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/20'
                  }`}
                >
                  {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                  {categoryFilter === cat && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3/4 h-0.5 bg-emerald-500 rounded-full" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* News Cards */}
      <div className="space-y-0 max-h-[calc(100vh-380px)] overflow-y-auto pr-1 custom-scrollbar">
        <AnimatePresence>
          {filteredNews.map((item, index) => {
            const impact = getImpactLevel(item.sentimentScore)
            const isBookmarked = bookmarkedIds.has(item.id)
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card className={`trading-card border-l-4 ${getBorderColor(item.sentiment)} ${index > 0 ? 'mt-0' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-3">
                      {/* Title Row */}
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="font-semibold text-sm leading-snug flex-1">{item.title}</h3>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {/* Impact Level Badge */}
                          {item.sentimentScore !== undefined && (
                            <Badge variant="secondary" className={`text-[10px] px-1.5 py-0 ${impact.color} border border-current/10`}>
                              {impact.label} Impact
                            </Badge>
                          )}
                          {item.sentiment && (
                            <Badge variant="secondary" className={`gap-1 text-[10px] ${getSentimentColor(item.sentiment)} border border-current/10`}>
                              {getSentimentIcon(item.sentiment)}
                              {item.sentiment.charAt(0).toUpperCase() + item.sentiment.slice(1)}
                            </Badge>
                          )}
                          {!item.analyzed && (
                            <Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[10px] badge-glow-amber">
                              New
                            </Badge>
                          )}
                          {/* Bookmark Button with animation */}
                          <button
                            onClick={() => toggleBookmark(item.id)}
                            className={`p-1.5 rounded-md transition-all duration-200 ${
                              isBookmarked
                                ? 'text-pink-400 hover:text-pink-300 scale-110'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                            }`}
                            title={isBookmarked ? 'Remove bookmark' : 'Bookmark this article'}
                          >
                            <Bookmark className={`h-3.5 w-3.5 transition-all duration-200 ${isBookmarked ? 'fill-current scale-105' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {/* Sentiment Gauge + Meta Row */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            {getSourceIcon(item.source)}
                            {item.source}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTime(item.publishedAt)}
                          </span>
                          {item.sentimentScore !== undefined && (
                            <span className="font-mono text-muted-foreground/80">
                              Score: <span className={item.sentimentScore > 0 ? 'text-emerald-400' : item.sentimentScore < 0 ? 'text-red-400' : 'text-amber-400'}>{item.sentimentScore > 0 ? '+' : ''}{item.sentimentScore.toFixed(2)}</span>
                            </span>
                          )}
                        </div>
                        {/* Sentiment Gauge */}
                        {item.sentimentScore !== undefined && (
                          <SentimentGauge score={item.sentimentScore} />
                        )}
                      </div>

                      {/* Related Symbols */}
                      {item.relatedSymbols && item.relatedSymbols.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                          {item.relatedSymbols.map((symbol) => (
                            <Badge
                              key={symbol}
                              variant="outline"
                              className="text-xs px-2 py-0 cursor-pointer hover:bg-emerald-500/10 hover:text-emerald-400 hover:border-emerald-500/30 transition-all duration-150"
                            >
                              {symbol}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* AI Summary - glass card background */}
                      {item.analyzed && item.aiSummary && (
                        <div className="glass-card rounded-lg p-3 text-sm text-muted-foreground leading-relaxed">
                          <span className="font-semibold text-emerald-400 text-xs flex items-center gap-1.5 mb-1.5">
                            <Brain className="h-3.5 w-3.5" />
                            AI Summary
                          </span>
                          <p className="text-[13px] leading-relaxed">{item.aiSummary}</p>
                        </div>
                      )}

                      {/* Content Preview for Unanalyzed */}
                      {item.content && !item.analyzed && (
                        <p className="text-xs text-muted-foreground/70 line-clamp-2">{item.content}</p>
                      )}

                      {/* Action Buttons */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {!item.analyzed && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/50 transition-all duration-200"
                              onClick={() => handleAnalyzeSingle(item.id)}
                            >
                              <Brain className="h-3 w-3" />
                              Analyze with AI
                            </Button>
                          )}
                          {item.analyzed && item.relatedSymbols && item.relatedSymbols.length > 0 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                            >
                              <Link2 className="h-3 w-3" />
                              Related Signals
                            </Button>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60">
                          <Newspaper className="h-3 w-3" />
                          {item.source}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                {/* Separator between items */}
                {index < filteredNews.length - 1 && (
                  <div className="mx-4 border-b border-border/20" />
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

        {filteredNews.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-muted/20 flex items-center justify-center mb-4">
                <Newspaper className="h-8 w-8 opacity-30" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Search className="h-2.5 w-2.5 text-emerald-400" />
              </div>
            </div>
            <p className="text-sm font-medium">No news found</p>
            <p className="text-xs mt-1 text-muted-foreground/60">Try different filters or search terms</p>
          </div>
        )}
      </div>
    </div>
  )
}
