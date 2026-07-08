'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTradingStore } from '@/lib/store/trading-store'
import { Brain, Zap, Gauge, Loader2, TrendingUp, TrendingDown, Minus, Sparkles, ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { toast } from 'sonner'

interface ModelResult {
  model: string
  modelId: string
  action: string
  confidence: number
  entryPrice: number
  targetPrice: number
  stopLoss: number
  reasoning: string
}

interface ConsensusData {
  symbol: string
  results: ModelResult[]
  consensus: {
    action: string
    confidence: number
    strength: number
    buyVotes: number
    sellVotes: number
    totalModels: number
  }
}

const modelIcons: Record<string, React.ReactNode> = {
  'Qwen3 32B': <Brain className="h-4 w-4" />,
  'Qwen3 14B': <Gauge className="h-4 w-4" />,
  'Qwen3 8B': <Zap className="h-4 w-4" />,
}

const modelColors: Record<string, string> = {
  'Qwen3 32B': 'text-emerald-400 bg-emerald-500/15',
  'Qwen3 14B': 'text-purple-400 bg-purple-500/15',
  'Qwen3 8B': 'text-amber-400 bg-amber-500/15',
}

export function MultiModelConsensus() {
  const { selectedSymbol } = useTradingStore()
  const [consensusData, setConsensusData] = useState<ConsensusData | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleRunConsensus = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/ai/consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol }),
      })
      const data = await res.json()
      if (data.consensus) {
        setConsensusData(data)
        toast.success(`Consensus: ${data.consensus.action} ${selectedSymbol} (${data.consensus.confidence}% avg)`)
      } else {
        toast.error('Consensus analysis failed')
      }
    } catch {
      toast.error('Failed to run consensus analysis')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="border-purple-500/20">
      <CardHeader className="pb-2 px-4 pt-3">
        <CardTitle className="text-xs flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-purple-500" />
          Multi-Model Consensus
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-purple-500/15 text-purple-400 ml-1">AI</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-3">
        <p className="text-[10px] text-muted-foreground mb-2">
          Run {selectedSymbol} through 3 AI models simultaneously for consensus
        </p>
        
        {!consensusData ? (
          <Button
            size="sm"
            className="h-8 gap-1.5 text-xs w-full bg-purple-600 hover:bg-purple-700 text-white"
            onClick={handleRunConsensus}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {isLoading ? 'Analyzing...' : 'Run Consensus Analysis'}
          </Button>
        ) : (
          <div className="space-y-2">
            {/* Consensus Result */}
            <div className={`p-3 rounded-xl border ${
              consensusData.consensus.action === 'BUY' ? 'border-emerald-500/30 bg-emerald-500/5' :
              consensusData.consensus.action === 'SELL' ? 'border-red-500/30 bg-red-500/5' :
              'border-amber-500/30 bg-amber-500/5'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {consensusData.consensus.action === 'BUY' ? (
                    <TrendingUp className="h-5 w-5 text-emerald-400" />
                  ) : consensusData.consensus.action === 'SELL' ? (
                    <TrendingDown className="h-5 w-5 text-red-400" />
                  ) : (
                    <Minus className="h-5 w-5 text-amber-400" />
                  )}
                  <span className={`text-lg font-bold ${
                    consensusData.consensus.action === 'BUY' ? 'text-emerald-400' :
                    consensusData.consensus.action === 'SELL' ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {consensusData.consensus.action}
                  </span>
                  <span className="text-sm text-muted-foreground">{selectedSymbol}</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{consensusData.consensus.confidence}%</div>
                  <div className="text-[10px] text-muted-foreground">Avg Confidence</div>
                </div>
              </div>

              {/* Vote Distribution */}
              <div className="flex items-center gap-2 mb-1">
                <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-muted/50">
                  <div
                    className="bg-emerald-500 transition-all"
                    style={{ width: `${(consensusData.consensus.buyVotes / consensusData.consensus.totalModels) * 100}%` }}
                  />
                  <div
                    className="bg-red-500 transition-all"
                    style={{ width: `${(consensusData.consensus.sellVotes / consensusData.consensus.totalModels) * 100}%` }}
                  />
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span className="text-emerald-400">{consensusData.consensus.buyVotes} BUY</span>
                <span>Strength: {consensusData.consensus.strength}%</span>
                <span className="text-red-400">{consensusData.consensus.sellVotes} SELL</span>
              </div>
            </div>

            {/* Individual Model Results */}
            <div className="space-y-1.5">
              {consensusData.results.map((result, i) => (
                <motion.div
                  key={result.model}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 border border-border/30"
                >
                  <div className={`flex items-center justify-center h-7 w-7 rounded-lg ${modelColors[result.model] || 'text-zinc-400 bg-zinc-500/15'}`}>
                    {modelIcons[result.model] || <Brain className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-semibold">{result.model}</span>
                      <Badge
                        variant="secondary"
                        className={`text-[9px] px-1 py-0 ${
                          result.action === 'BUY' ? 'bg-emerald-500/15 text-emerald-400' :
                          result.action === 'SELL' ? 'bg-red-500/15 text-red-400' :
                          'bg-zinc-500/15 text-zinc-400'
                        }`}
                      >
                        {result.action}
                      </Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{result.reasoning}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-12 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          result.confidence >= 70 ? 'bg-emerald-500' :
                          result.confidence >= 40 ? 'bg-amber-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${result.confidence}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono w-7 text-right">{result.confidence}%</span>
                  </div>
                </motion.div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-[10px] w-full border-purple-500/30 text-purple-400 hover:bg-purple-500/10 mt-2"
              onClick={handleRunConsensus}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Re-run Analysis
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
