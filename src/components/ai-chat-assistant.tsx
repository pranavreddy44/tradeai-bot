'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  MessageSquare,
  X,
  Send,
  Bot,
  User,
  Sparkles,
  Loader2,
  TrendingUp,
  Target,
  Shield,
  Star,
  Trash2,
  ChevronDown,
  Zap,
  Brain,
  Clock,
  Save,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTradingStore } from '@/lib/store/trading-store'
import { toast } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface APIChatMessage {
  role: 'user' | 'assistant'
  content: string
}

type AIModelType = string

// ─── Model Config ────────────────────────────────────────────────────────────

const AI_MODELS: {
  id: AIModelType
  name: string
  shortName: string
  icon: React.ReactNode
  description: string
}[] = [
  {
    id: 'Qwen/Qwen3-32B',
    name: 'Qwen3 32B',
    shortName: '32B',
    icon: <Brain className="h-3 w-3" />,
    description: 'Best quality for trading analysis',
  },
  {
    id: 'Qwen/Qwen3-14B',
    name: 'Qwen3 14B',
    shortName: '14B',
    icon: <Clock className="h-3 w-3" />,
    description: 'Balanced fallback',
  },
  {
    id: 'Qwen/Qwen3-8B',
    name: 'Qwen3 8B',
    shortName: '8B',
    icon: <Zap className="h-3 w-3" />,
    description: 'Fast quick-scan model',
  },
]

// ─── Quick Suggestion Chips ──────────────────────────────────────────────────

const QUICK_SUGGESTIONS = [
  { label: 'Analyze RELIANCE', icon: TrendingUp, query: 'Analyze RELIANCE stock on NSE - current outlook, support/resistance levels, and trading strategy' },
  { label: 'Market outlook', icon: Target, query: 'What is the current market outlook for NSE? How are NIFTY 50 and SENSEX performing?' },
  { label: 'Risk advice', icon: Shield, query: 'Give me risk management advice for intraday trading in Indian markets' },
  { label: 'Top picks today', icon: Star, query: 'What are the top stock picks for today on NSE? Suggest 3-5 stocks with reasons' },
]

const WELCOME_MESSAGE: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: 'Namaste! 🙏 I\'m **TradeAI Bot**, your expert trading assistant for Indian markets (NSE/BSE). Ask me about stock analysis, market outlook, trading strategies, or risk management. How can I help you today?',
  timestamp: new Date(),
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AIChatAssistant() {
  const { settings, updateSettings } = useTradingStore()
  const currentModel = settings.aiModel

  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [hasNewMessage, setHasNewMessage] = useState(false)
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [chatSaved, setChatSaved] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Get model display name
  const getModelInfo = useCallback((modelId: AIModelType) => {
    return AI_MODELS.find(m => m.id === modelId) || AI_MODELS[0]
  }, [])

  // Load chat history from DB on mount
  useEffect(() => {
    async function loadHistory() {
      try {
        const response = await fetch('/api/ai/chat/history')
        if (!response.ok) return

        const data = await response.json()
        if (data.messages && data.messages.length > 0) {
          const loadedMessages: ChatMessage[] = [
            WELCOME_MESSAGE,
            ...data.messages.map((m: { id: string; role: string; content: string; createdAt: string }) => ({
              id: m.id,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              timestamp: new Date(m.createdAt),
            })),
          ]
          setMessages(loadedMessages)
        }
      } catch (error) {
        console.error('Error loading chat history:', error)
      } finally {
        setHistoryLoaded(true)
      }
    }

    loadHistory()
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const viewport = scrollRef.current.querySelector('[data-slot="scroll-area-viewport"]')
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight
      }
    }
  }, [messages, hasNewMessage])

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 300)
    }
  }, [isOpen])

  // Generate unique ID
  const generateId = () => `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`

  // Show "Chat saved" indicator briefly
  const showSavedIndicator = useCallback(() => {
    setChatSaved(true)
    setTimeout(() => setChatSaved(false), 2000)
  }, [])

  // Save a single message to the DB
  const saveMessageToDb = useCallback(async (role: 'user' | 'assistant', content: string, model: string) => {
    try {
      await fetch('/api/ai/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, content, model }),
      })
      showSavedIndicator()
    } catch (error) {
      console.error('Error saving chat message:', error)
    }
  }, [showSavedIndicator])

  // Format message content with basic markdown-like rendering
  const formatContent = (content: string) => {
    // Bold text
    let formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // Currency symbols
    formatted = formatted.replace(/₹/g, '<span class="font-mono">₹</span>')
    // Stock symbols (uppercase words that look like stock tickers)
    formatted = formatted.replace(/\b([A-Z]{2,}(?:[A-Z]+)?)\b/g, (match) => {
      const knownSymbols = ['RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK', 'HINDUNILVR', 'SBIN', 'BHARTIARTL', 'ITC', 'KOTAKBANK', 'NSE', 'BSE', 'NIFTY', 'SENSEX', 'BANKNIFTY', 'HCL', 'WIPRO', 'AXISBANK', 'MARUTI', 'SUNPHARMA', 'TATAMOTORS', 'TATASTEEL', 'BAJFINANCE', 'ADANIENT', 'ADANIPORTS', 'POWERGRID', 'NTPC', 'ONGC', 'COALINDIA', 'JSWSTEEL', 'ULTRACEMCO', 'ASIANPAINT', 'TITAN', 'NESTLEIND', 'LT', 'DRREDDY', 'CIPLA', 'BPCL', 'TECHM', 'DIVISLAB', 'HEROMOTOCO', 'EICHERMOT', 'M&M', 'BAJAJFINSV', 'GRASIM', 'INDUSINDBK', 'HDFC', 'SHREECEM']
      if (knownSymbols.includes(match)) {
        return `<span class="text-emerald-400 font-mono font-semibold">${match}</span>`
      }
      return match
    })
    // Line breaks
    formatted = formatted.replace(/\n/g, '<br/>')
    return formatted
  }

  // Send message to API
  const sendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return

    const userMessage: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: content.trim(),
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue('')
    setIsLoading(true)
    setHasNewMessage((prev) => !prev)

    // Save user message to DB
    saveMessageToDb('user', content.trim(), currentModel)

    try {
      // Build conversation history for API
      const chatHistory: APIChatMessage[] = [...messages, userMessage]
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.role,
          content: m.content,
        }))

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistory, model: currentModel }),
      })

      if (!response.ok) {
        throw new Error('Failed to get AI response')
      }

      const data = await response.json()

      const assistantContent = data.message?.content || 'Sorry, I couldn\'t process that. Please try again.'

      const assistantMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: assistantContent,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, assistantMessage])
      setHasNewMessage((prev) => !prev)

      // Save assistant message to DB
      saveMessageToDb('assistant', assistantContent, currentModel)
    } catch (error) {
      console.error('Chat error:', error)
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: 'assistant',
        content: 'I\'m having trouble connecting right now. Please try again in a moment. 🔧',
        timestamp: new Date(),
      }
      setMessages((prev) => [...prev, errorMessage])
      setHasNewMessage((prev) => !prev)
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, messages, currentModel, saveMessageToDb])

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    sendMessage(inputValue)
  }

  // Handle quick suggestion click
  const handleSuggestionClick = (query: string) => {
    sendMessage(query)
  }

  // Clear chat (also clear from DB)
  const clearChat = useCallback(async () => {
    try {
      await fetch('/api/ai/chat/history', { method: 'DELETE' })
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: 'Chat cleared! 🔄 How can I help you with your trading today?',
          timestamp: new Date(),
        },
      ])
      toast.success('Chat history cleared', { duration: 2000 })
    } catch (error) {
      console.error('Error clearing chat history:', error)
      // Still clear locally even if DB delete fails
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: 'Chat cleared! 🔄 How can I help you with your trading today?',
          timestamp: new Date(),
        },
      ])
    }
  }, [])

  // Handle model switch
  const handleModelSwitch = (modelId: AIModelType) => {
    updateSettings({ aiModel: modelId })
    // Save to API
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings: { aiModel: modelId } }),
    }).catch(() => {
      // Silently fail - store already updated
    })
    fetch('/api/ai/provider', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelId }),
    }).catch(() => {
      // Silently fail - chat request still sends the selected model
    })
    const modelInfo = getModelInfo(modelId)
    toast.success(`Switched to ${modelInfo.name}`, {
      description: modelInfo.description,
      duration: 2000,
    })
  }

  const modelInfo = getModelInfo(currentModel)

  return (
    <>
      {/* Floating Chat Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            onClick={() => setIsOpen(true)}
            className="fixed bottom-24 right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-background"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.3 }}
            aria-label="Open AI Chat Assistant"
          >
            <MessageSquare className="h-6 w-6" />
            {/* Pulse ring */}
            <motion.span
              className="absolute inset-0 rounded-full border-2 border-emerald-400/50"
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border/50 bg-card/95 backdrop-blur-xl shadow-2xl shadow-black/40 w-[calc(100vw-16px)] sm:w-[400px] h-[70vh] sm:h-[520px] right-2 sm:right-6 bottom-2 sm:bottom-6"
            initial={{ opacity: 0, scale: 0.8, y: 20, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          >
            {/* Chat Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-gradient-to-r from-emerald-600/10 to-emerald-500/5">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-md shadow-emerald-500/20">
                  <Bot className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">TradeAI Bot</span>
                    {/* Model Selector Dropdown */}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-emerald-500/10 transition-colors">
                          <Badge variant="secondary" className="h-4 text-[10px] px-1.5 font-mono bg-emerald-500/15 text-emerald-400 border-emerald-500/20 cursor-pointer hover:bg-emerald-500/25 transition-colors">
                            {modelInfo.shortName}
                          </Badge>
                          <ChevronDown className="h-2.5 w-2.5 text-emerald-400/60" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56 bg-card border-border/50">
                        {AI_MODELS.map((model) => (
                          <DropdownMenuItem
                            key={model.id}
                            onClick={() => handleModelSwitch(model.id)}
                            className={`flex items-center gap-2 cursor-pointer ${
                              currentModel === model.id ? 'bg-emerald-500/10 text-emerald-400' : ''
                            }`}
                          >
                            <div className={`flex items-center justify-center h-5 w-5 rounded ${
                              currentModel === model.id ? 'bg-emerald-500/20 text-emerald-400' : 'bg-muted/50 text-muted-foreground'
                            }`}>
                              {model.icon}
                            </div>
                            <div className="flex-1">
                              <div className="text-xs font-medium">{model.name}</div>
                              <div className="text-[10px] text-muted-foreground">{model.description}</div>
                            </div>
                            {currentModel === model.id && (
                              <div className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <span className="text-[11px] text-muted-foreground">AI Trading Assistant • {modelInfo.name}</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                  onClick={clearChat}
                  title="Clear chat"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Chat Messages */}
            <ScrollArea ref={scrollRef} className="flex-1 px-4 py-4">
              {!historyLoaded ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-400 mr-2" />
                  <span className="text-xs text-muted-foreground">Loading chat history...</span>
                </div>
              ) : (
                <div className="space-y-5">
                  {messages.map((msg, msgIndex) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                      className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="flex-shrink-0 h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 flex items-center justify-center mt-0.5">
                          <Bot className="h-3.5 w-3.5 text-emerald-400" />
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-emerald-500/15 text-foreground border border-emerald-500/20 rounded-tr-md'
                            : 'bg-muted/50 text-foreground border border-border/50 rounded-tl-md'
                        }`}
                      >
                        {msg.role === 'assistant' ? (
                          <div
                            className="prose prose-sm prose-invert max-w-none [&_strong]:text-foreground [&_strong]:font-semibold"
                            dangerouslySetInnerHTML={{ __html: formatContent(msg.content) }}
                          />
                        ) : (
                          <p className="whitespace-pre-wrap">{msg.content}</p>
                        )}
                        <span className="block mt-1.5 text-[10px] text-muted-foreground/60">
                          {msg.timestamp.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      {msg.role === 'user' && (
                        <div className="flex-shrink-0 h-7 w-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center mt-0.5">
                          <User className="h-3.5 w-3.5 text-primary" />
                        </div>
                      )}
                      {/* Subtle separator between messages */}
                      {msgIndex < messages.length - 1 && (
                        <div className="hidden" />
                      )}
                    </motion.div>
                  ))}

                  {/* Loading indicator */}
                  {isLoading && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex gap-2.5 justify-start"
                    >
                      <div className="flex-shrink-0 h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-500/20 flex items-center justify-center mt-0.5">
                        <Bot className="h-3.5 w-3.5 text-emerald-400" />
                      </div>
                      <div className="bg-muted/50 border border-border/50 rounded-2xl rounded-tl-md px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                          <span className="text-xs text-muted-foreground">Analyzing...</span>
                          <div className="flex gap-0.5">
                            <motion.span
                              className="h-1 w-1 rounded-full bg-emerald-400"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1, repeat: Infinity, delay: 0 }}
                            />
                            <motion.span
                              className="h-1 w-1 rounded-full bg-emerald-400"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
                            />
                            <motion.span
                              className="h-1 w-1 rounded-full bg-emerald-400"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ duration: 1, repeat: Infinity, delay: 0.4 }}
                            />
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              )}
            </ScrollArea>

            {/* Quick Suggestions */}
            {messages.length <= 1 && !isLoading && historyLoaded && (
              <div className="px-4 pb-3">
                <div className="flex flex-wrap gap-2">
                  {QUICK_SUGGESTIONS.map((suggestion) => {
                    const IconComp = suggestion.icon
                    return (
                      <button
                        key={suggestion.label}
                        onClick={() => handleSuggestionClick(suggestion.query)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-medium bg-muted/40 border border-border/40 text-muted-foreground hover:text-foreground hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all"
                      >
                        <IconComp className="h-3.5 w-3.5 text-emerald-400/70" />
                        {suggestion.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Chat Input */}
            <form onSubmit={handleSubmit} className="px-4 py-3 border-t border-border/50 bg-muted/20">
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder="Ask about RELIANCE, NIFTY, or trading strategies..."
                  className="flex-1 h-9 bg-background/50 border-border/50 text-sm placeholder:text-muted-foreground/50 focus-visible:border-emerald-500/50 focus-visible:ring-emerald-500/20"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!inputValue.trim() || isLoading}
                  className="h-9 w-9 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-500/20 disabled:opacity-50 disabled:shadow-none"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
              <div className="flex items-center justify-center gap-2 mt-2">
                <p className="text-[11px] text-muted-foreground/40">
                  AI-powered insights • {modelInfo.name} • Not financial advice
                </p>
                {chatSaved && (
                  <motion.span
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1 text-[10px] text-emerald-400/70"
                  >
                    <Save className="h-2.5 w-2.5" />
                    Chat saved
                  </motion.span>
                )}
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
