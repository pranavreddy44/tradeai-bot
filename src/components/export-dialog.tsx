'use client'

import { useState, useMemo, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { useTradingStore } from '@/lib/store/trading-store'
import {
  Download,
  FileText,
  FileJson,
  Table,
  Signal,
  Briefcase,
  BookOpen,
  Newspaper,
  Calendar,
  CheckCircle2,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { TradeSignal, Position, NewsItem } from '@/lib/types/trading'

// ─── Types ───────────────────────────────────────────────────────────────────

type ExportFormat = 'csv' | 'json'
type DataSource = 'signals' | 'portfolio' | 'journal' | 'news'
type DateRange = '7d' | '30d' | '90d' | 'all'

interface ExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultSource?: DataSource
}

// ─── Journal Entry Type (mirrors trade-journal.tsx) ─────────────────────────

interface JournalEntry {
  id: string
  symbol: string
  exchange: string
  action: 'BUY' | 'SELL'
  entryPrice: number
  exitPrice: number | null
  quantity: number
  entryDate: string
  exitDate: string | null
  pnl: number | null
  emotion: string | null
  strategy: string | null
  notes: string | null
  lessons: string | null
  rating: number
  tags: string | null
  createdAt: string
  updatedAt: string
}

// ─── Data Source Config ──────────────────────────────────────────────────────

const DATA_SOURCES: {
  id: DataSource
  label: string
  icon: React.ReactNode
  description: string
}[] = [
  {
    id: 'signals',
    label: 'Signals',
    icon: <Signal className="h-4 w-4" />,
    description: 'Trading signals with confidence, entry/exit levels',
  },
  {
    id: 'portfolio',
    label: 'Positions / Portfolio',
    icon: <Briefcase className="h-4 w-4" />,
    description: 'Open & closed positions with P&L data',
  },
  {
    id: 'journal',
    label: 'Trade Journal',
    icon: <BookOpen className="h-4 w-4" />,
    description: 'Journal entries with emotions, strategy & lessons',
  },
  {
    id: 'news',
    label: 'News',
    icon: <Newspaper className="h-4 w-4" />,
    description: 'Analyzed news with sentiment scores',
  },
]

const DATE_RANGES: {
  id: DateRange
  label: string
}[] = [
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'all', label: 'All time' },
]

// ─── CSV Escaping ────────────────────────────────────────────────────────────

function escapeCSV(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function objectsToCSV(headers: string[], rows: Record<string, unknown>[]): string {
  const headerLine = headers.join(',')
  const dataLines = rows.map((row) =>
    headers.map((h) => escapeCSV(row[h])).join(',')
  )
  return [headerLine, ...dataLines].join('\n')
}

// ─── Indian Number Formatting ────────────────────────────────────────────────

function formatINR(value: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)
}

// ─── Date Filter ─────────────────────────────────────────────────────────────

function filterByDateRange<T extends Record<string, unknown>>(
  items: T[],
  dateField: string,
  range: DateRange
): T[] {
  if (range === 'all') return items
  const now = Date.now()
  const rangeMs: Record<string, number> = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
  }
  const cutoff = now - (rangeMs[range] || 0)
  return items.filter((item) => {
    const d = item[dateField]
    if (!d) return true
    return new Date(d as string).getTime() >= cutoff
  })
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ExportDialog({ open, onOpenChange, defaultSource = 'signals' }: ExportDialogProps) {
  const { signals, positions, news } = useTradingStore()
  const [format, setFormat] = useState<ExportFormat>('csv')
  const [source, setSource] = useState<DataSource>(defaultSource)
  const [dateRange, setDateRange] = useState<DateRange>('30d')
  const [isExporting, setIsExporting] = useState(false)

  // Journal entries from API (we'll fetch on demand, or use store)
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([])

  // Fetch journal entries when source changes to journal
  const fetchJournalEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/journal')
      const data = await res.json()
      if (data.entries?.length) {
        setJournalEntries(data.entries)
      } else {
        setJournalEntries([])
      }
    } catch {
      setJournalEntries([])
    }
  }, [])

  // Fetch journal when source selected
  const handleSourceChange = useCallback((val: DataSource) => {
    setSource(val)
    if (val === 'journal') {
      fetchJournalEntries()
    }
  }, [fetchJournalEntries])

  // Get export data based on source and date range
  const exportData = useMemo(() => {
    let raw: Record<string, unknown>[] = []
    let headers: string[] = []
    let dateField = 'createdAt'

    switch (source) {
      case 'signals': {
        dateField = 'createdAt'
        const filtered = filterByDateRange(signals as unknown as Record<string, unknown>[], dateField, dateRange)
        raw = filtered.map((s) => ({
          Symbol: (s as unknown as TradeSignal).symbol,
          Exchange: (s as unknown as TradeSignal).exchange,
          Action: (s as unknown as TradeSignal).action,
          Source: (s as unknown as TradeSignal).source,
          'Trade Type': (s as unknown as TradeSignal).tradeType ?? '',
          Confidence: (s as unknown as TradeSignal).confidence,
          'Entry Price': (s as unknown as TradeSignal).entryPrice,
          'Target Price': (s as unknown as TradeSignal).targetPrice ?? '',
          'Stop Loss': (s as unknown as TradeSignal).stopLoss ?? '',
          Quantity: (s as unknown as TradeSignal).quantity,
          Status: (s as unknown as TradeSignal).status,
          'P&L (₹)': (s as unknown as TradeSignal).pnl ?? '',
          Model: (s as unknown as TradeSignal).modelName ?? '',
          'Source Time': (s as unknown as TradeSignal).sourceTimestamp
            ? new Date((s as unknown as TradeSignal).sourceTimestamp as string).toLocaleString('en-IN')
            : '',
          'Created At': new Date((s as unknown as TradeSignal).createdAt).toLocaleString('en-IN'),
        }))
        headers = ['Symbol', 'Exchange', 'Action', 'Source', 'Trade Type', 'Confidence', 'Entry Price', 'Target Price', 'Stop Loss', 'Quantity', 'Status', 'P&L (₹)', 'Model', 'Source Time', 'Created At']
        break
      }
      case 'portfolio': {
        dateField = 'createdAt'
        const filtered = filterByDateRange(positions as unknown as Record<string, unknown>[], dateField, dateRange)
        raw = filtered.map((p) => ({
          Symbol: (p as unknown as Position).symbol,
          Exchange: (p as unknown as Position).exchange,
          Action: (p as unknown as Position).action,
          Quantity: (p as unknown as Position).quantity,
          'Entry Price': (p as unknown as Position).entryPrice,
          'Current Price': (p as unknown as Position).currentPrice ?? '',
          'P&L (₹)': (p as unknown as Position).pnl ?? '',
          'P&L %': (p as unknown as Position).pnlPercent ?? '',
          Status: (p as unknown as Position).status,
          'Created At': new Date((p as unknown as Position).createdAt).toLocaleString('en-IN'),
          'Closed At': (p as unknown as Position).closedAt ? new Date((p as unknown as Position).closedAt!).toLocaleString('en-IN') : '',
        }))
        headers = ['Symbol', 'Exchange', 'Action', 'Quantity', 'Entry Price', 'Current Price', 'P&L (₹)', 'P&L %', 'Status', 'Created At', 'Closed At']
        break
      }
      case 'journal': {
        dateField = 'createdAt'
        const filtered = filterByDateRange(journalEntries as unknown as Record<string, unknown>[], dateField, dateRange)
        raw = filtered.map((j) => ({
          Symbol: (j as unknown as JournalEntry).symbol,
          Exchange: (j as unknown as JournalEntry).exchange,
          Action: (j as unknown as JournalEntry).action,
          'Entry Price': (j as unknown as JournalEntry).entryPrice,
          'Exit Price': (j as unknown as JournalEntry).exitPrice ?? '',
          Quantity: (j as unknown as JournalEntry).quantity,
          'P&L (₹)': (j as unknown as JournalEntry).pnl ?? '',
          Emotion: (j as unknown as JournalEntry).emotion ?? '',
          Strategy: (j as unknown as JournalEntry).strategy ?? '',
          Rating: (j as unknown as JournalEntry).rating,
          Tags: (j as unknown as JournalEntry).tags ?? '',
          'Entry Date': (j as unknown as JournalEntry).entryDate,
          'Created At': new Date((j as unknown as JournalEntry).createdAt).toLocaleString('en-IN'),
        }))
        headers = ['Symbol', 'Exchange', 'Action', 'Entry Price', 'Exit Price', 'Quantity', 'P&L (₹)', 'Emotion', 'Strategy', 'Rating', 'Tags', 'Entry Date', 'Created At']
        break
      }
      case 'news': {
        dateField = 'createdAt'
        const filtered = filterByDateRange(news as unknown as Record<string, unknown>[], dateField, dateRange)
        raw = filtered.map((n) => ({
          Title: (n as unknown as NewsItem).title,
          Source: (n as unknown as NewsItem).source,
          Sentiment: (n as unknown as NewsItem).sentiment ?? '',
          'Sentiment Score': (n as unknown as NewsItem).sentimentScore ?? '',
          'Related Symbols': ((n as unknown as NewsItem).relatedSymbols ?? []).join('; '),
          Analyzed: (n as unknown as NewsItem).analyzed ? 'Yes' : 'No',
          'Published At': (n as unknown as NewsItem).publishedAt ? new Date((n as unknown as NewsItem).publishedAt!).toLocaleString('en-IN') : '',
          'Created At': new Date((n as unknown as NewsItem).createdAt).toLocaleString('en-IN'),
        }))
        headers = ['Title', 'Source', 'Sentiment', 'Sentiment Score', 'Related Symbols', 'Analyzed', 'Published At', 'Created At']
        break
      }
    }

    return { raw, headers }
  }, [source, dateRange, signals, positions, news, journalEntries])

  // Preview data (first 5 rows)
  const previewRows = useMemo(() => exportData.raw.slice(0, 5), [exportData])
  const totalCount = exportData.raw.length

  // Format cell value for display
  const formatCellValue = (value: unknown, key: string): string => {
    if (value === null || value === undefined || value === '') return '—'
    if (key.includes('Price') || key.includes('P&L')) {
      const num = Number(value)
      if (!isNaN(num) && num !== 0) return formatINR(num)
    }
    if (key === 'Confidence') return `${value}%`
    if (key === 'P&L %') return `${value}%`
    if (key === 'Rating') return `${value}/5`
    if (key === 'Sentiment Score') {
      const num = Number(value)
      if (!isNaN(num)) return num.toFixed(2)
    }
    return String(value)
  }

  // Generate file content
  const generateFileContent = useCallback((): string => {
    if (format === 'csv') {
      return objectsToCSV(exportData.headers, exportData.raw)
    }
    // JSON format
    return JSON.stringify(exportData.raw, null, 2)
  }, [format, exportData])

  // Download file
  const handleExport = useCallback(() => {
    setIsExporting(true)
    try {
      const content = generateFileContent()
      const blob = new Blob([content], {
        type: format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const timestamp = new Date().toISOString().slice(0, 10)
      link.href = url
      link.download = `tradeai-${source}-${timestamp}.${format}`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success(`Exported ${totalCount} ${source} entries`, {
        description: `File saved as tradeai-${source}-${timestamp}.${format}`,
      })
      onOpenChange(false)
    } catch (error) {
      console.error('Export error:', error)
      toast.error('Export failed', {
        description: 'Could not generate export file. Please try again.',
      })
    } finally {
      setIsExporting(false)
    }
  }, [format, source, totalCount, generateFileContent, onOpenChange])

  // Get source count
  const getSourceCount = useCallback((src: DataSource): number => {
    switch (src) {
      case 'signals': return signals.length
      case 'portfolio': return positions.length
      case 'journal': return journalEntries.length
      case 'news': return news.length
    }
  }, [signals, positions, journalEntries, news])

  // Reset state when dialog opens
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      if (source === 'journal') {
        fetchJournalEntries()
      }
    }
    onOpenChange(newOpen)
  }, [onOpenChange, source, fetchJournalEntries])

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="h-5 w-5 text-emerald-500" />
            Export Data
          </DialogTitle>
          <DialogDescription>
            Export your trading data as CSV or JSON for analysis and record keeping.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1 custom-scrollbar">
          {/* Data Source Selector */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Data Source</Label>
            <div className="grid grid-cols-2 gap-2">
              {DATA_SOURCES.map((ds) => {
                const isActive = source === ds.id
                const count = getSourceCount(ds.id)
                return (
                  <button
                    key={ds.id}
                    onClick={() => handleSourceChange(ds.id)}
                    className={`flex items-start gap-2.5 p-3 rounded-lg border-2 text-left transition-all ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-500/5 shadow-sm shadow-emerald-500/10'
                        : 'border-border/50 hover:border-emerald-500/30 bg-card'
                    }`}
                  >
                    <div className={`mt-0.5 ${isActive ? 'text-emerald-400' : 'text-muted-foreground'}`}>
                      {ds.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{ds.label}</span>
                        <Badge variant="secondary" className="text-[10px] px-1.5 h-4">
                          {count}
                        </Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug truncate">
                        {ds.description}
                      </p>
                    </div>
                    {isActive && (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <Separator />

          {/* Export Format */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Export Format</Label>
            <div className="flex gap-2">
              <button
                onClick={() => setFormat('csv')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm transition-all flex-1 ${
                  format === 'csv'
                    ? 'border-emerald-500 bg-emerald-500/5 text-emerald-400'
                    : 'border-border/50 hover:border-emerald-500/30 text-muted-foreground'
                }`}
              >
                <Table className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium text-foreground">CSV</div>
                  <div className="text-[10px] text-muted-foreground">Spreadsheet compatible</div>
                </div>
                {format === 'csv' && <CheckCircle2 className="h-4 w-4 text-emerald-400 ml-auto" />}
              </button>
              <button
                onClick={() => setFormat('json')}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 text-sm transition-all flex-1 ${
                  format === 'json'
                    ? 'border-emerald-500 bg-emerald-500/5 text-emerald-400'
                    : 'border-border/50 hover:border-emerald-500/30 text-muted-foreground'
                }`}
              >
                <FileJson className="h-4 w-4" />
                <div className="text-left">
                  <div className="font-medium text-foreground">JSON</div>
                  <div className="text-[10px] text-muted-foreground">Structured data format</div>
                </div>
                {format === 'json' && <CheckCircle2 className="h-4 w-4 text-emerald-400 ml-auto" />}
              </button>
            </div>
          </div>

          <Separator />

          {/* Date Range Filter */}
          <div className="space-y-2">
            <Label className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5" />
              Date Range
            </Label>
            <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
              <SelectTrigger className="w-full bg-background/50 border-border/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGES.map((dr) => (
                  <SelectItem key={dr.id} value={dr.id}>
                    {dr.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Preview Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Preview</Label>
              <Badge variant="secondary" className="text-[10px]">
                {totalCount} total record{totalCount !== 1 ? 's' : ''}
              </Badge>
            </div>
            {previewRows.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No data available for export</p>
                <p className="text-xs mt-1">Try a different date range or data source</p>
              </div>
            ) : (
              <div className="rounded-lg border border-border/50 overflow-hidden">
                <ScrollArea className="max-h-[200px]">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/30 border-b border-border/50">
                        {exportData.headers.slice(0, 6).map((h) => (
                          <th key={h} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                        {exportData.headers.length > 6 && (
                          <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                            +{exportData.headers.length - 6} more
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, i) => (
                        <tr key={i} className="border-b border-border/20 last:border-0">
                          {exportData.headers.slice(0, 6).map((h) => (
                            <td key={h} className="px-2 py-1.5 text-foreground whitespace-nowrap max-w-[120px] truncate">
                              {formatCellValue(row[h], h)}
                            </td>
                          ))}
                          {exportData.headers.length > 6 && (
                            <td className="px-2 py-1.5 text-muted-foreground">...</td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </ScrollArea>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="border-t border-border/30 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="gap-1.5">
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || totalCount === 0}
            className="gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-lg shadow-emerald-500/20"
          >
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isExporting ? 'Exporting...' : `Export ${totalCount} Records`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Quick Export Helper (for individual tab export buttons) ─────────────────

export function quickExportCSV(
  data: Record<string, unknown>[],
  headers: string[],
  filename: string
) {
  try {
    const csv = objectsToCSV(headers, data)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${filename}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(`Exported ${data.length} records`, {
      description: `Saved as ${filename}.csv`,
    })
  } catch (error) {
    console.error('Quick export error:', error)
    toast.error('Export failed')
  }
}
