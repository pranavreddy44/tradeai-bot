'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

import {
  MessageCircle,
  Phone,
  Key,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Copy,
  Eye,
  EyeOff,
  Wifi,
  WifiOff,
  RefreshCw,
  Plus,
  Trash2,
  Radio,
  Search,
  ChevronDown,
  Info,
  Zap,
  Send,
  Globe,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'

// ─── Types ──────────────────────────────────────────────────

type SetupStep = 'welcome' | 'api-credentials' | 'authenticate' | 'verify-code' | 'two-factor' | 'connected' | 'add-channels'

interface UserbotStatus {
  auth: 'idle' | 'connecting' | 'waiting_code' | 'waiting_password' | 'connected' | 'error'
  phone: string | null
  connectedAt: string | null
  errorMessage: string | null
  channels: number
  lastPoll: string | null
  monitoredChannels: MonitoredChannelInfo[]
  messagesReceived: number
  lastMessageAt: string | null
  lastMessageFrom: string | null
}

interface MonitoredChannelInfo {
  id: string
  name: string
  channelId: string
  isActive: boolean
  isReachable: boolean | null
  lastTestedAt: string | null
  lastMessageAt: string | null
  messageCount: number
}

interface TestConnectionResult {
  connected: boolean
  phone: string | null
  selfUser: string | null
  error: string | null
}

interface TestChannelResult {
  channelId: string
  reachable: boolean
  channelTitle: string | null
  recentMessages: Array<{
    id: number
    text: string
    date: string
    fromId: string | null
  }>
  error: string | null
}

interface TelegramDialog {
  id: string
  name: string
  username: string | null
  type: string
}

interface Channel {
  id: string
  name: string
  channelId: string
  isActive: boolean
  lastMessageId: string | null
}

// ─── Helpers ─────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr)
    const now = new Date()
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000)
    if (seconds < 60) return 'just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return date.toLocaleDateString()
  } catch {
    return dateStr
  }
}

// ─── Component ──────────────────────────────────────────────

export function TelegramSetupGuide() {
  const [isOpen, setIsOpen] = useState(false)
  const [currentStep, setCurrentStep] = useState<SetupStep>('welcome')
  const [status, setStatus] = useState<UserbotStatus | null>(null)
  const [loading, setLoading] = useState(false)

  // Auth form state
  const [apiId, setApiId] = useState('')
  const [apiHash, setApiHash] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [twoFaPassword, setTwoFaPassword] = useState('')
  const [showApiHash, setShowApiHash] = useState(false)

  // Channel management
  const [dialogs, setDialogs] = useState<TelegramDialog[]>([])
  const [channels, setChannels] = useState<Channel[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelId, setNewChannelId] = useState('')

  // Test & verification state
  const [testConnResult, setTestConnResult] = useState<TestConnectionResult | null>(null)
  const [testConnLoading, setTestConnLoading] = useState(false)
  const [testingChannelId, setTestingChannelId] = useState<string | null>(null)
  const [channelTestResults, setChannelTestResults] = useState<Map<string, TestChannelResult>>(new Map())
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null)

  // Poll status
  const pollStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/userbot')
      if (res.ok) {
        const data = await res.json()
        setStatus(data as UserbotStatus)

        // Auto-advance step based on status
        if (data.auth === 'connected' && currentStep !== 'connected' && currentStep !== 'add-channels') {
          setCurrentStep('connected')
        }
        if (data.auth === 'error' && data.errorMessage && data.errorMessage.includes('revoked') && (currentStep === 'connected' || currentStep === 'add-channels')) {
          // Session was revoked - go back to API credentials step so user can re-auth
          setCurrentStep('api-credentials')
        }
        if (data.auth === 'waiting_code' && currentStep === 'authenticate') {
          setCurrentStep('verify-code')
        }
        if (data.auth === 'waiting_password' && currentStep === 'verify-code') {
          setCurrentStep('two-factor')
        }
      }
    } catch {
      // service not running
    }
  }, [currentStep])

  // Load saved credentials when dialog opens
  const loadSavedCredentials = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram/userbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-saved-credentials' }),
      })
      if (res.ok) {
        const data = await res.json()
        if (data.apiId) setApiId(data.apiId)
        if (data.apiHash) setApiHash(data.apiHash)
        if (data.phone) setPhone(data.phone)
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      loadSavedCredentials()
    }
  }, [isOpen, loadSavedCredentials])

  useEffect(() => {
    pollStatus()
    const interval = setInterval(pollStatus, 3000)
    return () => clearInterval(interval)
  }, [pollStatus])

  // Load channels
  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/channels')
      if (res.ok) {
        const data = await res.json()
        setChannels(data.channels || [])
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadChannels()
  }, [loadChannels])

  // ─── Actions ─────────────────────────────────────────────

  const startAuth = async () => {
    if (!apiId || !apiHash || !phone) {
      toast.error('Please fill in all fields')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/telegram/userbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'auth-start',
          apiId: parseInt(apiId, 10),
          apiHash,
          phone,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('Connecting to Telegram...')
        setCurrentStep('verify-code')
        // Poll for status change
        setTimeout(pollStatus, 2000)
      } else {
        toast.error(data.error || 'Failed to start authentication')
      }
    } catch {
      toast.error('Telegram service unavailable. Make sure the service is running.')
    } finally {
      setLoading(false)
    }
  }

  const submitCode = async () => {
    if (!code) {
      toast.error('Please enter the verification code')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/telegram/userbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auth-code', code }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('Code submitted! Verifying...')
        setCode('')
        setTimeout(pollStatus, 2000)
        setTimeout(pollStatus, 5000)
      } else {
        toast.error(data.error || 'Failed to submit code')
      }
    } catch {
      toast.error('Service unavailable')
    } finally {
      setLoading(false)
    }
  }

  const submitPassword = async () => {
    if (!twoFaPassword) {
      toast.error('Please enter your 2FA password')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/telegram/userbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auth-2fa', password: twoFaPassword }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('Password submitted! Verifying...')
        setTwoFaPassword('')
        setTimeout(pollStatus, 2000)
        setTimeout(pollStatus, 5000)
      } else {
        toast.error(data.error || 'Failed to submit password')
      }
    } catch {
      toast.error('Service unavailable')
    } finally {
      setLoading(false)
    }
  }

  const disconnect = async () => {
    setLoading(true)
    try {
      await fetch('/api/telegram/userbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      })
      toast.success('Disconnected from Telegram')
      setCurrentStep('welcome')
      pollStatus()
    } catch {
      toast.error('Failed to disconnect')
    } finally {
      setLoading(false)
    }
  }

  const fetchDialogs = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/telegram/userbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dialogs' }),
      })

      if (res.ok) {
        const data = await res.json()
        setDialogs(data.dialogs || [])
        setCurrentStep('add-channels')
      } else {
        toast.error('Failed to fetch channels. Make sure you are connected.')
      }
    } catch {
      toast.error('Service unavailable')
    } finally {
      setLoading(false)
    }
  }

  const addChannel = async (channelId: string, name: string) => {
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          channelId: channelId.startsWith('@') ? channelId : `@${channelId}`,
          isActive: true,
        }),
      })

      if (res.ok) {
        toast.success(`Added ${name} to monitored channels`)
        loadChannels()
      } else {
        const data = await res.json()
        toast.error(data.error || 'Failed to add channel')
      }
    } catch {
      toast.error('Failed to add channel')
    }
  }

  const removeChannel = async (id: string) => {
    try {
      await fetch(`/api/channels/${id}`, { method: 'DELETE' })
      toast.success('Channel removed')
      loadChannels()
    } catch {
      toast.error('Failed to remove channel')
    }
  }

  const toggleChannel = async (id: string, isActive: boolean) => {
    try {
      await fetch(`/api/channels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive }),
      })
      loadChannels()
    } catch {
      toast.error('Failed to update channel')
    }
  }

  const addManualChannel = async () => {
    if (!newChannelName || !newChannelId) {
      toast.error('Please fill in channel name and ID')
      return
    }
    await addChannel(newChannelId, newChannelName)
    setNewChannelName('')
    setNewChannelId('')
  }

  const startMonitoring = async () => {
    try {
      await fetch('/api/telegram/userbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start-monitoring' }),
      })
      toast.success('Monitoring started!')
    } catch {
      toast.error('Failed to start monitoring')
    }
  }

  const runTestConnection = async () => {
    setTestConnLoading(true)
    try {
      const res = await fetch('/api/telegram/userbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-connection' }),
      })
      if (res.ok) {
        const data = await res.json() as TestConnectionResult
        setTestConnResult(data)
        if (data.connected) {
          toast.success(`Connected as ${data.selfUser || data.phone}`)
        } else {
          toast.error(`Connection failed: ${data.error}`)
        }
      }
    } catch {
      toast.error('Failed to test connection')
    } finally {
      setTestConnLoading(false)
    }
  }

  const runTestChannel = async (channelId: string) => {
    setTestingChannelId(channelId)
    try {
      const res = await fetch('/api/telegram/userbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-channel', channelId }),
      })
      if (res.ok) {
        const data = await res.json() as TestChannelResult
        setChannelTestResults(prev => {
          const next = new Map(prev)
          next.set(channelId, data)
          return next
        })
        if (data.reachable) {
          toast.success(`✅ Channel reachable: ${data.channelTitle || channelId}`)
        } else {
          toast.error(`❌ Cannot read channel: ${data.error}`)
        }
      }
    } catch {
      toast.error('Failed to test channel')
    } finally {
      setTestingChannelId(null)
    }
  }

  // ─── Connection Status Badge ──────────────────────────────

  const getStatusBadge = () => {
    if (!status) return <Badge variant="outline" className="text-xs">Unknown</Badge>

    switch (status.auth) {
      case 'connected':
        return (
          <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
            <Wifi className="w-3 h-3 mr-1" /> Connected
          </Badge>
        )
      case 'connecting':
        return (
          <Badge className="bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Connecting
          </Badge>
        )
      case 'waiting_code':
        return (
          <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30">
            <Phone className="w-3 h-3 mr-1" /> Awaiting Code
          </Badge>
        )
      case 'waiting_password':
        return (
          <Badge className="bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30">
            <Shield className="w-3 h-3 mr-1" /> Awaiting 2FA
          </Badge>
        )
      case 'error':
        return (
          <Badge variant="destructive">
            <AlertCircle className="w-3 h-3 mr-1" /> Error
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-xs">
            <WifiOff className="w-3 h-3 mr-1" /> Not Connected
          </Badge>
        )
    }
  }

  // ─── Render Steps ─────────────────────────────────────────

  const renderStepContent = () => {
    switch (currentStep) {
      // ─── Welcome / Overview ─────────────────────────────
      case 'welcome':
        return (
          <div className="space-y-6">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center border border-blue-500/20">
                <MessageCircle className="w-8 h-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-semibold">Connect Your Telegram</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Read trade signals from <strong>any channel you follow</strong> — public or private.
                No bot needed! Uses your personal Telegram account.
              </p>
            </div>

            {status?.auth === 'connected' ? (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    Already Connected as {status.phone}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">
                  Monitoring {status.channels} channel(s) · Last poll: {status.lastPoll || 'N/A'}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setCurrentStep('add-channels')} className="gap-1">
                    <Plus className="w-3 h-3" /> Add Channels
                  </Button>
                  <Button size="sm" variant="outline" onClick={startMonitoring} className="gap-1">
                    <Radio className="w-3 h-3" /> Start Monitoring
                  </Button>
                  <Button size="sm" variant="destructive" onClick={disconnect} className="gap-1">
                    <WifiOff className="w-3 h-3" /> Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* How it works */}
                <div className="bg-muted/50 rounded-xl p-4 space-y-3">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-500" /> How Userbot Works
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { icon: Key, title: 'Get API Keys', desc: 'Free from my.telegram.org' },
                      { icon: Phone, title: 'Verify Phone', desc: 'Login with your number' },
                      { icon: Radio, title: 'Auto-Read Signals', desc: 'AI parses trades 24/7' },
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <item.icon className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-medium">{item.title}</p>
                          <p className="text-xs text-muted-foreground">{item.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Important note */}
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      This uses <strong>MTProto Userbot</strong> — it logs in as YOUR account.
                      Your session is stored locally and never shared. This is the only way to
                      read private channels you don&apos;t own (Bot API can&apos;t do this).
                    </span>
                  </p>
                </div>

                <Button onClick={() => setCurrentStep('api-credentials')} className="w-full gap-2">
                  Get Started <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        )

      // ─── Step 1: API Credentials ────────────────────────
      case 'api-credentials':
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs">1</span>
              Get Your Telegram API Credentials
            </div>

            <div className="bg-muted/50 rounded-xl p-4 space-y-3">
              <h4 className="font-medium text-sm">Step-by-step:</h4>
              <ol className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">1</span>
                  Go to <a href="https://my.telegram.org" target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline inline-flex items-center gap-1">my.telegram.org <ExternalLink className="w-3 h-3" /></a>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">2</span>
                  Login with your phone number and verify with the code Telegram sends you
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">3</span>
                  Click <strong>&quot;API development tools&quot;</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">4</span>
                  Fill in: App title (e.g. &quot;TradeAI&quot;) &amp; Short name (e.g. &quot;tradeai&quot;)
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-500/10 text-blue-500 flex items-center justify-center text-xs flex-shrink-0 mt-0.5">5</span>
                  Copy the <strong>api_id</strong> (number) and <strong>api_hash</strong> (string) shown
                </li>
              </ol>
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="apiId" className="text-sm font-medium">
                  API ID <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="apiId"
                  type="text"
                  placeholder="e.g. 12345678"
                  value={apiId}
                  onChange={(e) => setApiId(e.target.value.replace(/\D/g, ''))}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">Numeric ID from my.telegram.org</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiHash" className="text-sm font-medium">
                  API Hash <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="apiHash"
                    type={showApiHash ? 'text' : 'password'}
                    placeholder="e.g. abc123def456..."
                    value={apiHash}
                    onChange={(e) => setApiHash(e.target.value)}
                    className="font-mono pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                    onClick={() => setShowApiHash(!showApiHash)}
                  >
                    {showApiHash ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Alphanumeric hash from my.telegram.org</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-sm font-medium">
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="+91 9876543210"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Your Telegram phone number with country code (e.g. +91 for India)
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setCurrentStep('welcome')} className="gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button
                onClick={startAuth}
                disabled={!apiId || !apiHash || !phone || loading}
                className="flex-1 gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Connect to Telegram
              </Button>
            </div>
          </div>
        )

      // ─── Step 2: Verify Code ────────────────────────────
      case 'verify-code':
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs">2</span>
              Verify Your Phone Number
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-blue-500" />
                <span className="font-medium text-blue-600 dark:text-blue-400">Code Sent!</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Telegram has sent a verification code to <strong>{phone}</strong>.
                Enter it below.
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="code" className="text-sm font-medium">Verification Code</Label>
              <Input
                id="code"
                type="text"
                placeholder="e.g. 12345"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className="font-mono text-center text-2xl tracking-[0.5em] h-14"
                maxLength={5}
                autoFocus
              />
              <p className="text-xs text-muted-foreground text-center">
                Enter the 5-digit code from your Telegram app
              </p>
            </div>

            {status?.auth === 'error' && status.errorMessage && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
                <p className="text-xs text-red-500 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  {status.errorMessage}
                </p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={disconnect} className="gap-1">
                Cancel
              </Button>
              <Button
                onClick={submitCode}
                disabled={!code || code.length < 5 || loading}
                className="flex-1 gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Verify Code
              </Button>
            </div>

            {/* Auto-detect 2FA requirement */}
            {status?.auth === 'waiting_password' && (
              <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
                <p className="text-xs text-orange-500 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  2FA detected! Enter your password below.
                </p>
              </div>
            )}
          </div>
        )

      // ─── Step 3: 2FA Password ───────────────────────────
      case 'two-factor':
        return (
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <span className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs">3</span>
              Two-Factor Authentication
            </div>

            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <Shield className="w-5 h-5 text-orange-500" />
                <span className="font-medium text-orange-600 dark:text-orange-400">2FA Required</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Your Telegram account has two-factor authentication enabled.
                Enter your cloud password below.
              </p>
            </div>

            <div className="space-y-3">
              <Label htmlFor="2fa" className="text-sm font-medium">Cloud Password</Label>
              <Input
                id="2fa"
                type="password"
                placeholder="Your 2FA password"
                value={twoFaPassword}
                onChange={(e) => setTwoFaPassword(e.target.value)}
                className="font-mono"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This is the password you set in Telegram Settings → Privacy → Two-Step Verification
              </p>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={disconnect} className="gap-1">
                Cancel
              </Button>
              <Button
                onClick={submitPassword}
                disabled={!twoFaPassword || loading}
                className="flex-1 gap-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Shield className="w-4 h-4" />
                )}
                Submit Password
              </Button>
            </div>
          </div>
        )

      // ─── Connected ──────────────────────────────────────
      case 'connected':
        // Check if session was revoked
        const isSessionRevoked = status?.errorMessage?.includes('revoked') || testConnResult?.error?.includes('revoked')
        return (
          <div className="space-y-5">
            {/* Session Revoked Banner */}
            {isSessionRevoked && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="font-semibold text-red-600 dark:text-red-400">Session Revoked</span>
                </div>
                <p className="text-sm text-red-500/80">
                  Your Telegram session was revoked (you may have terminated it from another device). You need to disconnect and re-authenticate.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={disconnect}
                    className="gap-1.5"
                  >
                    <WifiOff className="w-3.5 h-3.5" /> Disconnect & Re-authenticate
                  </Button>
                </div>
              </motion.div>
            )}

            <div className="text-center space-y-3">
              <div className={`w-16 h-16 mx-auto rounded-full ${isSessionRevoked ? 'bg-red-500/20 border-red-500/30' : 'bg-emerald-500/20 border-emerald-500/30'} flex items-center justify-center border-2`}>
                {isSessionRevoked ? (
                  <WifiOff className="w-8 h-8 text-red-500" />
                ) : (
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                )}
              </div>
              <h3 className={`text-lg font-semibold ${isSessionRevoked ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {isSessionRevoked ? 'Session Revoked!' : 'Connected Successfully!'}
              </h3>
              <p className="text-sm text-muted-foreground">
                Logged in as <strong>{status?.phone}</strong>
              </p>
            </div>

            {/* Connection Health Dashboard */}
            <div className="bg-muted/50 rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-medium flex items-center gap-2">
                {isSessionRevoked ? (
                  <><WifiOff className="w-4 h-4 text-red-500" /> Connection Status</>
                ) : (
                  <><Wifi className="w-4 h-4 text-emerald-500" /> Connection Health</>
                )}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-background/60 rounded-lg p-2.5 text-center">
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{status?.channels || 0}</p>
                  <p className="text-xs text-muted-foreground">Channels</p>
                </div>
                <div className="bg-background/60 rounded-lg p-2.5 text-center">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{status?.messagesReceived || 0}</p>
                  <p className="text-xs text-muted-foreground">Messages</p>
                </div>
                <div className="bg-background/60 rounded-lg p-2.5 text-center col-span-2">
                  <p className="text-xs text-muted-foreground">Last Activity</p>
                  <p className="text-sm font-medium">
                    {status?.lastMessageAt
                      ? `${timeAgo(status.lastMessageAt)} from ${status.lastMessageFrom || 'unknown'}`
                      : 'No messages received yet'}
                  </p>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                {isSessionRevoked ? (
                  <Badge className="bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30">
                    <WifiOff className="w-3 h-3 mr-1" /> Revoked
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                    <Wifi className="w-3 h-3 mr-1" /> Active
                  </Badge>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Connected At</span>
                <span className="font-medium text-xs">{status?.connectedAt ? new Date(status.connectedAt).toLocaleString() : 'N/A'}</span>
              </div>
            </div>

            {/* Test Connection */}
            <div className="space-y-2">
              <Button
                onClick={runTestConnection}
                disabled={testConnLoading}
                variant="outline"
                className="w-full gap-2 border-dashed"
              >
                {testConnLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                Test Connection — Verify Session is Alive
              </Button>
              {testConnResult && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`rounded-xl p-3 space-y-1.5 ${
                    testConnResult.connected
                      ? 'bg-emerald-500/10 border border-emerald-500/20'
                      : 'bg-red-500/10 border border-red-500/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {testConnResult.connected ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    )}
                    <span className={`text-sm font-medium ${testConnResult.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {testConnResult.connected ? 'Session is Active' : 'Connection Failed'}
                    </span>
                  </div>
                  {testConnResult.connected && testConnResult.selfUser && (
                    <p className="text-xs text-muted-foreground">
                      Logged in as: <strong>{testConnResult.selfUser}</strong> ({testConnResult.phone})
                    </p>
                  )}
                  {testConnResult.error && (
                    <p className="text-xs text-red-500">{testConnResult.error}</p>
                  )}
                  {testConnResult.error?.includes('revoked') && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={disconnect}
                      className="mt-2 gap-1.5 w-full"
                    >
                      <WifiOff className="w-3.5 h-3.5" /> Disconnect & Re-authenticate
                    </Button>
                  )}
                </motion.div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col gap-2">
              {!isSessionRevoked && (
                <Button onClick={fetchDialogs} disabled={loading} className="w-full gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  Browse My Channels & Groups
                </Button>
              )}
              <Button variant="outline" onClick={() => setCurrentStep('add-channels')} className="w-full gap-2">
                <Plus className="w-4 h-4" /> Manage Monitored Channels
              </Button>
              <Button variant="destructive" onClick={disconnect} className="w-full gap-2">
                <WifiOff className="w-4 h-4" /> {isSessionRevoked ? 'Disconnect & Start Over' : 'Disconnect'}
              </Button>
            </div>
          </div>
        )

      // ─── Add Channels ───────────────────────────────────
      case 'add-channels':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Manage Monitored Channels</h3>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={runTestConnection} className="gap-1 h-7 text-xs" disabled={testConnLoading}>
                  {testConnLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                  Test
                </Button>
                <Button variant="outline" size="sm" onClick={fetchDialogs} className="gap-1 h-7 text-xs">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </Button>
              </div>
            </div>

            {/* Connection test mini-result */}
            {testConnResult && (
              <div className={`rounded-lg p-2 flex items-center gap-2 text-xs ${
                testConnResult.connected
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
              }`}>
                {testConnResult.connected
                  ? <><CheckCircle2 className="w-3.5 h-3.5" /> Session active as {testConnResult.selfUser || testConnResult.phone}</>
                  : <><AlertCircle className="w-3.5 h-3.5" /> {testConnResult.error}</>
                }
              </div>
            )}

            {/* Currently monitored channels */}
            {channels.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Monitored Channels ({channels.length})
                </Label>
                <div className="space-y-2">
                  {channels.map((ch) => {
                    // Find matching monitored channel from status
                    const monitoredCh = status?.monitoredChannels?.find(
                      mc => mc.id === ch.id || mc.channelId === ch.channelId || mc.channelId === ch.channelId.replace('@', '') || `@${mc.channelId}` === ch.channelId
                    )
                    const testResult = channelTestResults.get(ch.channelId) || channelTestResults.get(ch.channelId.replace('@', ''))
                    const isTesting = testingChannelId === ch.channelId || testingChannelId === ch.channelId.replace('@', '')
                    const isReachable = testResult?.reachable ?? monitoredCh?.isReachable
                    const isExpanded = expandedChannel === ch.id

                    return (
                      <div key={ch.id} className="bg-muted/50 rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Switch
                              checked={ch.isActive}
                              onCheckedChange={(checked) => toggleChannel(ch.id, checked)}
                              className="scale-75"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium truncate">{ch.name}</p>
                                {/* Reachability indicator */}
                                {isReachable === true && (
                                  <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" title="Reachable" />
                                )}
                                {isReachable === false && (
                                  <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Unreachable" />
                                )}
                                {isReachable === null && ch.isActive && (
                                  <span className="w-2 h-2 rounded-full bg-yellow-500 flex-shrink-0 animate-pulse" title="Not tested" />
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{ch.channelId}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {monitoredCh && monitoredCh.messageCount > 0 && (
                              <Badge variant="outline" className="text-xs h-5 bg-blue-500/10 text-blue-500 border-blue-500/20">
                                {monitoredCh.messageCount} msgs
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => runTestChannel(ch.channelId)}
                              disabled={isTesting}
                              className="h-7 w-7 p-0"
                              title="Test channel reachability"
                            >
                              {isTesting ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Zap className="w-3 h-3 text-amber-500" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setExpandedChannel(isExpanded ? null : ch.id)}
                              className="h-7 w-7 p-0"
                              title="Show details"
                            >
                              <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => removeChannel(ch.id)}
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>

                        {/* Test result / expanded details */}
                        {(testResult || isExpanded) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="border-t border-border/50 px-3 py-2"
                          >
                            {testResult && (
                              <div className={`rounded-md p-2 mb-2 text-xs ${
                                testResult.reachable
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-red-500/10 text-red-600 dark:text-red-400'
                              }`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                  {testResult.reachable
                                    ? <CheckCircle2 className="w-3 h-3" />
                                    : <AlertCircle className="w-3 h-3" />
                                  }
                                  <span className="font-medium">
                                    {testResult.reachable
                                      ? `✅ Can read "${testResult.channelTitle || ch.channelId}"`
                                      : `❌ Cannot access: ${testResult.error}`
                                    }
                                  </span>
                                </div>
                                {testResult.recentMessages.length > 0 && (
                                  <div className="mt-1.5 space-y-1">
                                    <p className="text-muted-foreground font-medium">Recent messages:</p>
                                    {testResult.recentMessages.slice(0, 3).map((msg, i) => (
                                      <div key={i} className="bg-background/60 rounded px-2 py-1 truncate">
                                        <span className="text-muted-foreground text-[10px]">{timeAgo(msg.date)}</span>{' '}
                                        <span className="truncate">{msg.text.substring(0, 80)}{msg.text.length > 80 ? '...' : ''}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                            {monitoredCh && (
                              <div className="text-xs text-muted-foreground space-y-0.5">
                                <p>Messages received: <strong>{monitoredCh.messageCount}</strong></p>
                                {monitoredCh.lastMessageAt && (
                                  <p>Last message: <strong>{timeAgo(monitoredCh.lastMessageAt)}</strong></p>
                                )}
                                {monitoredCh.lastTestedAt && (
                                  <p>Last tested: {timeAgo(monitoredCh.lastTestedAt)}</p>
                                )}
                              </div>
                            )}
                          </motion.div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {channels.length === 0 && (
              <div className="bg-muted/30 rounded-xl p-6 text-center">
                <MessageCircle className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No channels added yet</p>
                <p className="text-xs text-muted-foreground mt-1">Browse your Telegram channels or add manually below</p>
              </div>
            )}

            <Separator />

            {/* Browse Telegram channels */}
            {dialogs.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Your Telegram Channels & Groups
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                  <Input
                    placeholder="Search channels..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 h-8 text-sm"
                  />
                </div>
                <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                  {dialogs
                    .filter(
                      (d) =>
                        !searchQuery ||
                        d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (d.username && d.username.toLowerCase().includes(searchQuery.toLowerCase()))
                    )
                    .map((dialog) => {
                      const isAdded = channels.some(
                        (c) =>
                          c.channelId.replace('@', '') === (dialog.username || dialog.id)
                      )
                      return (
                        <div
                          key={dialog.id}
                          className="flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2 hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                              {dialog.type === 'channel' ? (
                                <Globe className="w-4 h-4 text-primary" />
                              ) : (
                                <MessageCircle className="w-4 h-4 text-primary" />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{dialog.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {dialog.username ? `@${dialog.username}` : `ID: ${dialog.id}`}
                              </p>
                            </div>
                          </div>
                          {isAdded ? (
                            <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-500 border-emerald-500/20">
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Added
                            </Badge>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                addChannel(
                                  dialog.username || dialog.id,
                                  dialog.name
                                )
                              }
                              className="h-7 text-xs gap-1"
                            >
                              <Plus className="w-3 h-3" /> Add
                            </Button>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
            )}

            {/* Manual add */}
            <div className="space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Add Channel Manually
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Channel name"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="h-8 text-sm"
                />
                <Input
                  placeholder="@username or ID"
                  value={newChannelId}
                  onChange={(e) => setNewChannelId(e.target.value)}
                  className="h-8 text-sm font-mono"
                />
                <Button
                  size="sm"
                  onClick={addManualChannel}
                  disabled={!newChannelName || !newChannelId}
                  className="h-8 gap-1 flex-shrink-0"
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Use @username for public channels or numeric ID for private ones
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setCurrentStep('connected')} className="gap-1">
                <ArrowLeft className="w-4 h-4" /> Back
              </Button>
              <Button onClick={startMonitoring} className="flex-1 gap-2">
                <Radio className="w-4 h-4" /> Start Monitoring
              </Button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  // ─── Step indicators ──────────────────────────────────────

  const steps = [
    { key: 'welcome', label: 'Start', num: 0 },
    { key: 'api-credentials', label: 'API Keys', num: 1 },
    { key: 'verify-code', label: 'Verify', num: 2 },
    { key: 'connected', label: 'Connected', num: 3 },
    { key: 'add-channels', label: 'Channels', num: 4 },
  ]

  const currentStepIndex = steps.findIndex((s) => s.key === currentStep)

  return (
    <>
      {/* Trigger button */}
      <Card className="overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/20 flex items-center justify-center">
                <MessageCircle className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p className="font-medium text-sm">Telegram Integration</p>
                <p className="text-xs text-muted-foreground">
                  {status?.auth === 'connected'
                    ? `Connected as ${status.phone} · ${status.channels} channel(s)${status.messagesReceived > 0 ? ` · ${status.messagesReceived} msgs` : ''}`
                    : 'Connect to read signals from private channels'}
                </p>
                {status?.auth === 'connected' && status.lastMessageAt && (
                  <p className="text-[10px] text-muted-foreground">
                    Last activity: {timeAgo(status.lastMessageAt)} from {status.lastMessageFrom || 'unknown'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              <Button variant="outline" size="sm" onClick={() => setIsOpen(true)} className="gap-1">
                <ChevronDown className="w-4 h-4" />
                Setup
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Setup Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col gap-0 p-0 overflow-hidden" onPointerDownOutside={(e) => e.preventDefault()} style={{ display: 'flex' }}>
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-blue-500" />
              Telegram Userbot Setup
            </DialogTitle>
            <DialogDescription>
              Connect your Telegram account to read trade signals from any channel
            </DialogDescription>
          </DialogHeader>

          {/* Step indicators */}
          <div className="flex items-center gap-1 px-6 py-2 shrink-0">
            {steps.map((step, i) => (
              <div key={step.key} className="flex items-center flex-1">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                    i < currentStepIndex
                      ? 'bg-emerald-500 text-white'
                      : i === currentStepIndex
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {i < currentStepIndex ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : (
                    step.num
                  )}
                </div>
                {i < steps.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 rounded transition-colors ${
                      i < currentStepIndex ? 'bg-emerald-500' : 'bg-muted'
                    }`}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 custom-scrollbar">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="pb-6"
              >
                {renderStepContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
