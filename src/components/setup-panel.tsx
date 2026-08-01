'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload,
  Brain,
  Wifi,
  WifiOff,
  Plus,
  Trash2,
  Radio,
  Bot,
  Settings2,
  ShieldCheck,
  Shield,
  Zap,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Key,
  Lock,
  ArrowRight,
  Info,
  TestTube,
  Signal,
  AlertTriangle,
  Link2,
} from 'lucide-react'
import { useAutoTradeStore, type TelegramChannel, type RiskLevel } from '@/lib/store/autotrade-store'
import { TelegramSetupGuide } from '@/components/telegram-setup-guide'
import { toast } from 'sonner'


// ─── Telegram Channels Card ────────────────────────────────

function AIProviderCard() {
  const [provider, setProvider] = useState<'omniroute' | 'groq'>('omniroute')
  const [model, setModel] = useState('')
  const [token, setToken] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  
  // Cache of configuration for each provider
  const [providerConfigs, setProviderConfigs] = useState<Record<string, {
    model: string
    baseUrl?: string
    hasToken: boolean
    tokenSource: 'env' | 'settings' | 'none'
    tokenPreview: string | null
    models: Array<{ id: string; name: string; description: string }>
  }>>({})

  const [loading, setLoading] = useState(false)
  const [testing, setTesting] = useState(false)
  const [activeProvider, setActiveProvider] = useState<string>('')
  const [jsonModel, setJsonModel] = useState('oc/nemotron-3-ultra-free')

  const loadProvider = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/provider')
      const data = await res.json()
      if (res.ok && data.providers) {
        setProviderConfigs(data.providers)
        setActiveProvider(data.activeProvider)
        
        // Default to active provider
        const currentProvider = data.activeProvider || 'omniroute'
        setProvider(currentProvider)

        const config = data.providers[currentProvider]
        if (config) {
          setModel(config.model)
          if (config.baseUrl) setBaseUrl(config.baseUrl)
          if (config.jsonModel) setJsonModel(config.jsonModel)
        }
      }
    } catch (err: any) {
      toast.error('Failed to load AI provider', { description: err.message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProvider()
  }, [loadProvider])

  const handleProviderChange = (newProvider: 'omniroute' | 'groq') => {
    setProvider(newProvider)
    setToken('')
    const config = providerConfigs[newProvider]
    if (config) {
      setModel(config.model)
      if (config.baseUrl) setBaseUrl(config.baseUrl)
    }
  }

  const saveProvider = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ai/provider', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model,
          token: token.trim(),
          baseUrl: baseUrl.trim(),
          jsonModel: jsonModel.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok || data.error) {
        toast.error('AI provider save failed', { description: data.error || `Error ${res.status}` })
        return
      }
      setToken('')
      toast.success('AI provider settings saved', { description: `Active: ${provider} (${model})` })
      await loadProvider()
    } catch (err: any) {
      toast.error('AI provider save failed', { description: err.message })
    } finally {
      setLoading(false)
    }
  }

  const testProvider = async () => {
    setTesting(true)
    try {
      const res = await fetch('/api/ai/provider', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        toast.success('AI model responded successfully!', { description: `${data.model}: ${data.sample}` })
      } else {
        toast.error('AI provider test failed', { description: data.error || `Error ${res.status}` })
      }
    } catch (err: any) {
      toast.error('AI provider test failed', { description: err.message })
    } finally {
      setTesting(false)
    }
  }

  const currentConfig = providerConfigs[provider]
  const hasToken = currentConfig?.hasToken || false
  const tokenSource = currentConfig?.tokenSource || 'none'
  const tokenPreview = currentConfig?.tokenPreview || null
  const models = currentConfig?.models || []
  
  const isActive = activeProvider === provider

  return (
    <Card className={`border ${isActive && hasToken ? 'border-emerald-800/30' : 'border-border/50'}`}>
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary shrink-0" />
            <span>AI Model Provider</span>
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {isActive && (
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 text-emerald-400 border-emerald-500/20 bg-emerald-500/5">
                Active
              </Badge>
            )}
            <Badge variant="outline" className={`text-[10px] h-5 px-1.5 shrink-0 ${
              hasToken ? 'text-emerald-400 border-emerald-500/20 bg-emerald-500/5' : 'text-amber-400 border-amber-500/20 bg-amber-500/5'
            }`}>
              {hasToken ? 'Configured' : 'Token Needed'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-3.5">
        <div className="space-y-1.5">
          <Label className="text-xs">Select AI Provider</Label>
          <Select value={provider} onValueChange={(val: any) => handleProviderChange(val)}>
            <SelectTrigger className="h-8 text-xs bg-muted/20">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="omniroute" className="text-xs">OmniRoute Gateway (Default)</SelectItem>
              <SelectItem value="groq" className="text-xs">Groq Cloud (Fast Free Tier)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="p-2.5 rounded-lg bg-muted/20 border border-border/20">
          <div className="flex items-center justify-between gap-2 text-[10px]">
            <span className="text-muted-foreground">Provider Mode</span>
            <span className="font-medium text-foreground capitalize">{provider}</span>
          </div>
          <div className="flex items-center justify-between gap-2 text-[10px] mt-1">
            <span className="text-muted-foreground">Token Status</span>
            <span className="font-medium text-foreground">
              {tokenSource === 'env' 
                ? `Loaded from env (${provider === 'omniroute' ? 'OMNIROUTE_KEY' : 'GROQ_API_KEY'})` 
                : tokenPreview || 'Not configured'}
            </span>
          </div>
        </div>

        <div>
          <Label className="text-xs flex items-center gap-1.5">
            <Key className="h-3 w-3 shrink-0" /> 
            {provider === 'omniroute' ? 'OmniRoute API Key' : 'Groq API Key'}
          </Label>
          <Input
            type="password"
            placeholder={hasToken ? 'Leave blank to keep existing key/token' : provider === 'omniroute' ? 'Leave blank for zero-config (no key needed)' : 'gsk_...'}
            value={token}
            onChange={e => setToken(e.target.value)}
            className="h-8 text-xs mt-1 bg-muted/10 focus-visible:bg-transparent"
            disabled={tokenSource === 'env'}
          />
          {tokenSource === 'env' && (
            <p className="text-[10px] text-muted-foreground mt-1">Token is coming from server environment variable.</p>
          )}
          {provider === 'omniroute' && (
            <p className="text-[10px] text-muted-foreground mt-1">OmniRoute works with zero config — leave the key blank to use free providers out of the box.</p>
          )}
          {!hasToken && tokenSource !== 'env' && provider !== 'omniroute' && (
            <p className="text-[10px] text-amber-500 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              API Key is required to run {provider} models.
            </p>
          )}
        </div>

        {provider === 'omniroute' && (
          <div>
            <Label className="text-xs flex items-center gap-1.5">
              <Link2 className="h-3 w-3 shrink-0" /> OmniRoute Base URL
            </Label>
            <Input
              type="text"
              placeholder="http://localhost:20128/v1/chat/completions"
              value={baseUrl}
              onChange={e => setBaseUrl(e.target.value)}
              className="h-8 text-xs mt-1 bg-muted/10 focus-visible:bg-transparent font-mono"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Where OmniRoute runs. Use this to point at a deployed gateway instead of localhost.
            </p>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-xs">Select Model</Label>
          <div className="grid gap-1.5">
            {models.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setModel(option.id)}
                className={`w-full min-h-12 text-left rounded-lg border px-2.5 py-2 transition-colors ${
                  model === option.id
                    ? 'border-primary/40 bg-primary/5'
                    : 'border-border/25 bg-muted/10 hover:bg-muted/20'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold">{option.name}</span>
                  {model === option.id && <CheckCircle2 className="h-3.5 w-3.5 text-primary shrink-0" />}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">{option.description}</p>
              </button>
            ))}
          </div>
          {provider === 'omniroute' && (
            <div className="mt-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Link2 className="h-3 w-3 shrink-0" /> Custom Model Alias
              </Label>
              <Input
                type="text"
                placeholder="e.g. auto, auto/coding, claude/sonnet-4-5, gemini/2.5-flash"
                value={model}
                onChange={e => setModel(e.target.value)}
                className="h-8 text-xs mt-1 bg-muted/10 focus-visible:bg-transparent font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Any OmniRoute model/alias works — use one of the presets above or type your own.
              </p>
            </div>
          )}
          {provider === 'omniroute' && (
            <div className="mt-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Link2 className="h-3 w-3 shrink-0" /> JSON Parsing Model
              </Label>
              <Input
                type="text"
                placeholder="oc/nemotron-3-ultra-free"
                value={jsonModel}
                onChange={e => setJsonModel(e.target.value)}
                className="h-8 text-xs mt-1 bg-muted/10 focus-visible:bg-transparent font-mono"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Fixed model for structured JSON parsing (signals, analysis). Avoids combos that can return broken JSON.
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" className="h-8 text-xs gap-1.5" onClick={saveProvider} disabled={loading}>
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Save &amp; Activate
          </Button>
          <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" onClick={testProvider} disabled={testing || !isActive || !hasToken}>
            {testing ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube className="h-3 w-3" />}
            Test Config
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function TelegramChannelsCard() {
  const { telegramChannels, setTelegramChannels, addActivity } = useAutoTradeStore()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')
  const [newChannelId, setNewChannelId] = useState('')
  const [scanning, setScanning] = useState(false)
  const [testingChannel, setTestingChannel] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ channelId: string; reachable: boolean; messageCount: number; channelTitle?: string } | null>(null)
  const [togglingChannel, setTogglingChannel] = useState<string | null>(null)
  const [selectedChannelId, setSelectedChannelId] = useState<string>('')

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/telegram?action=channels')
      if (res.ok) {
        const data = await res.json()
        const channels = data.channels || []
        setTelegramChannels(channels)
        setSelectedChannelId((current) => {
          if (current && channels.some((channel: TelegramChannel) => channel.id === current)) return current
          return channels[0]?.id || ''
        })
      }
    } catch (err) {
      console.error('Failed to fetch channels:', err)
    }
  }, [setTelegramChannels])

  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  const addChannel = async () => {
    if (!newName.trim() || !newChannelId.trim()) {
      toast.error('Channel name and ID are required')
      return
    }
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add-channel', name: newName.trim(), channelId: newChannelId.trim() }),
      })
      const data = await res.json()
      if (data.channel) {
        toast.success(`Added channel: ${newName}`)
        addActivity({ message: `Added Telegram channel: ${newName}`, type: 'system' })
        setNewName(''); setNewChannelId(''); setAdding(false)
        fetchChannels()
      } else {
        toast.error(data.error || 'Failed to add channel')
      }
    } catch (err: any) {
      toast.error('Failed to add channel', { description: err.message })
    }
  }

  const removeChannel = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" from your channels?`)) return
    try {
      await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove-channel', id }),
      })
      toast.success(`Removed: ${name}`)
      addActivity({ message: `Removed Telegram channel: ${name}`, type: 'system' })
      fetchChannels()
    } catch {
      toast.error('Failed to remove channel')
    }
  }

  const toggleChannel = async (id: string, currentActive: boolean, name: string) => {
    setTogglingChannel(id)
    try {
      const res = await fetch(`/api/channels/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      })
      if (res.ok) {
        toast.success(`${name} ${!currentActive ? 'enabled' : 'disabled'}`)
        addActivity({ message: `${!currentActive ? 'Enabled' : 'Disabled'} channel: ${name}`, type: 'system' })
        fetchChannels()
      } else {
        toast.error('Failed to toggle channel')
      }
    } catch {
      toast.error('Failed to toggle channel')
    } finally {
      setTogglingChannel(null)
    }
  }

  const scanMessages = async () => {
    setScanning(true)
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan-messages' }),
      })

      let data: any
      try {
        const text = await res.text()
        if (text.startsWith('{')) {
          data = JSON.parse(text)
        } else {
          toast.error('Scan failed', {
            description: res.status === 502 || res.status === 504
              ? 'Gateway timeout — the scan took too long. Try again in a moment.'
              : `Server error (${res.status})`,
          })
          return
        }
      } catch {
        toast.error('Scan failed', { description: 'Invalid server response' })
        return
      }

      if (!res.ok || data.error) {
        const isRateLimited = res.status === 429 || data?.retryable
        if (isRateLimited) {
          // With rule-based fallback, this shouldn't happen often
          toast.warning('Scan Partial', {
            description: data.details || 'AI was busy — rule-based fallback may have been used.',
            duration: 5000,
          })
          // Don't return — if there are signals, still show them
          if (!data.signals || data.signals.length === 0) return
        } else {
          toast.error('Scan failed', { description: data.error || `Error (${res.status})` })
          return
        }
      }

      if (data.signals && data.signals.length > 0) {
        toast.success(`Scanned! Found ${data.signals.length} signals from ${data.scanned} channels`)
        addActivity({ message: `📡 Scanned ${data.scanned} channels, found ${data.signals.length} signals`, type: 'scan' })
      } else {
        toast.info(data.message || `Scanned ${data.scanned || 0} channels, no new signals found`)
        addActivity({ message: `Scanned ${data.scanned || 0} channels`, type: 'scan' })
      }
    } catch (err: any) {
      toast.error('Scan failed', { description: err.message || 'Network error. Please try again.' })
    } finally {
      setScanning(false)
    }
  }

  const testChannel = async (channelId: string) => {
    setTestingChannel(channelId)
    setTestResult(null)
    try {
      const res = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-channel', channelId }),
      })
      const data = await res.json()
      setTestResult({
        channelId,
        reachable: data.reachable ?? false,
        messageCount: data.messageCount ?? 0,
        channelTitle: data.channelTitle,
      })
      if (data.reachable) {
        toast.success(`${channelId} is reachable — ${data.messageCount || 0} recent messages`)
      } else {
        toast.warning(`${channelId} is not reachable`, {
          description: data.error || 'Channel may be private or inaccessible',
        })
      }
    } catch {
      setTestResult({ channelId, reachable: false, messageCount: 0 })
      toast.error('Test failed — Telegram service may be down')
    } finally {
      setTestingChannel(null)
    }
  }

  const activeCount = telegramChannels.filter(c => c.isActive).length
  const selectedChannel = telegramChannels.find(channel => channel.id === selectedChannelId) || telegramChannels[0] || null

  return (
    <Card className="border-border/50">
      <CardHeader className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Radio className="h-4 w-4 shrink-0" />
            <span>Telegram Channels</span>
          </CardTitle>
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5 shrink-0">
            {activeCount}/{telegramChannels.length} active
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0 space-y-2.5">
        {/* Channel Dropdown */}
        {telegramChannels.length === 0 ? (
          <div className="text-center py-8 rounded-lg border border-border/30 bg-muted/10">
            <Radio className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">No channels added yet</p>
            <p className="text-[10px] text-muted-foreground/60 mt-0.5">Add a Telegram channel to start receiving signals</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">Selected Channel</Label>
              <Select value={selectedChannel?.id || ''} onValueChange={setSelectedChannelId}>
                <SelectTrigger className="h-10 w-full text-xs">
                  <SelectValue placeholder="Select a Telegram channel" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {telegramChannels.map(channel => (
                    <SelectItem key={channel.id} value={channel.id} className="text-xs">
                      {channel.isActive ? '●' : '○'} {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedChannel && (
              <div
                className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                  selectedChannel.isActive
                    ? 'bg-background border-border/40'
                    : 'bg-muted/5 border-border/20 opacity-70'
                }`}
              >
                <div className={`h-2 w-2 rounded-full shrink-0 ${
                  selectedChannel.isActive ? 'bg-emerald-400' : 'bg-muted-foreground/30'
                }`} />
                <div className="flex-1 min-w-0 overflow-hidden">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-xs font-medium truncate ${selectedChannel.isActive ? '' : 'text-muted-foreground'}`}>
                      {selectedChannel.name}
                    </p>
                    {!selectedChannel.isActive && (
                      <span className="text-[8px] px-1 py-0.5 rounded bg-muted text-muted-foreground shrink-0 leading-none">
                        OFF
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {selectedChannel.channelId}
                  </p>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <Switch
                    checked={selectedChannel.isActive}
                    onCheckedChange={() => toggleChannel(selectedChannel.id, selectedChannel.isActive, selectedChannel.name)}
                    disabled={togglingChannel === selectedChannel.id}
                    className="scale-[0.65] origin-right"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-primary"
                    onClick={() => testChannel(selectedChannel.channelId)}
                    disabled={testingChannel === selectedChannel.channelId}
                    title="Test connectivity"
                  >
                    {testingChannel === selectedChannel.channelId
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <TestTube className="h-3.5 w-3.5" />
                    }
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground/60 hover:text-red-400"
                    onClick={() => removeChannel(selectedChannel.id, selectedChannel.name)}
                    title="Remove channel"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Test Result Banner */}
        <AnimatePresence>
          {testResult && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`p-2.5 rounded-lg border text-xs ${
                testResult.reachable
                  ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-400'
                  : 'bg-red-500/5 border-red-500/10 text-red-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  {testResult.reachable ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                  <span className="font-medium shrink-0">{testResult.reachable ? 'Reachable' : 'Not Reachable'}</span>
                  {testResult.channelTitle && (
                    <span className="text-muted-foreground truncate">— {testResult.channelTitle}</span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0 text-muted-foreground shrink-0"
                  onClick={() => setTestResult(null)}
                >
                  <XCircle className="h-3 w-3" />
                </Button>
              </div>
              {testResult.reachable && (
                <p className="text-[10px] mt-0.5 text-muted-foreground">
                  {testResult.messageCount} recent messages found
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Add channel form / buttons */}
        <AnimatePresence mode="wait">
          {adding ? (
            <motion.div
              key="add-form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-2 p-3 rounded-lg border border-primary/20 bg-primary/5"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <Plus className="h-3 w-3 text-primary shrink-0" />
                <span className="text-xs font-medium">Add New Channel</span>
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Channel Name</Label>
                <Input
                  placeholder="e.g., StockPro India"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Channel ID / Username</Label>
                <Input
                  placeholder="e.g., @stockproindia"
                  value={newChannelId}
                  onChange={e => setNewChannelId(e.target.value)}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Button size="sm" className="h-9 text-xs w-full" onClick={addChannel}>Add Channel</Button>
                <Button size="sm" variant="outline" className="h-9 text-xs w-full" onClick={() => { setAdding(false); setNewName(''); setNewChannelId('') }}>Cancel</Button>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="buttons"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2"
            >
              <Button
                size="sm"
                variant="outline"
                className="h-9 text-xs gap-1.5 w-full justify-center"
                onClick={() => setAdding(true)}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" /> Add Channel
              </Button>
              <Button
                size="sm"
                className="h-9 text-xs gap-1.5 w-full justify-center bg-primary hover:bg-primary/90"
                onClick={scanMessages}
                disabled={scanning || activeCount === 0}
              >
                {scanning ? <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> : <Signal className="h-3.5 w-3.5 shrink-0" />}
                {scanning ? 'Scanning...' : 'Scan All'}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Telegram Service Status */}
        <TelegramServiceStatus />
      </CardContent>
    </Card>
  )
}

// ─── Telegram Service Status Indicator ───────────────────

function TelegramServiceStatus() {
  const [status, setStatus] = useState<'checking' | 'connected' | 'needs-auth' | 'offline'>('checking')
  const [phone, setPhone] = useState<string | null>(null)
  const [auth, setAuth] = useState<string | null>(null)

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/telegram?action=service-status')
        if (res.ok) {
          const data = await res.json()
          setAuth(data.auth || null)
          setStatus(data.online ? (data.auth === 'connected' ? 'connected' : 'needs-auth') : 'offline')
          setPhone(data.phone || null)
        } else {
          setStatus('offline')
          setAuth(null)
        }
      } catch {
        setStatus('offline')
        setAuth(null)
      }
    }
    check()
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className={`flex items-center justify-between p-2.5 rounded-lg border text-[10px] ${
      status === 'connected'
        ? 'bg-emerald-500/5 border-emerald-500/10'
      : status === 'offline'
        ? 'bg-red-500/5 border-red-500/10'
        : status === 'needs-auth'
        ? 'bg-amber-500/5 border-amber-500/10'
        : 'bg-muted/20 border-border/20'
    }`}>
      <div className="flex items-center gap-1.5 min-w-0">
        <div className={`h-1.5 w-1.5 rounded-full shrink-0 ${
          status === 'connected' ? 'bg-emerald-400' : status === 'offline' ? 'bg-red-400' : 'bg-amber-400 animate-pulse'
        }`} />
        <span className="text-muted-foreground">Telegram Service</span>
        {phone && status === 'connected' && (
          <span className="text-muted-foreground/50 truncate">({phone})</span>
        )}
        {status === 'needs-auth' && auth && (
          <span className="text-muted-foreground/50 truncate">({auth})</span>
        )}
      </div>
      <span className={`font-medium shrink-0 ${
        status === 'connected' ? 'text-emerald-400' : status === 'offline' ? 'text-red-400' : 'text-amber-400'
      }`}>
        {status === 'checking' ? 'Checking...' : status === 'connected' ? 'Connected' : status === 'needs-auth' ? 'Needs Login' : 'Offline'}
      </span>
    </div>
  )
}


// ─── Test VLM Image Analysis Card ──────────────────────────

export function VlmImageTestCard({ onAnalysisSuccess }: { onAnalysisSuccess?: () => void }) {
  const [preview, setPreview] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<any>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null
    if (selected) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(selected)
      setResult(null)
    } else {
      setPreview(null)
      setResult(null)
    }
  }

  const handleAnalyze = async () => {
    if (!preview) return
    setAnalyzing(true)
    setResult(null)
    try {
      const base64Data = preview.split(',')[1]
      const mimeType = preview.split(';')[0].split(':')[1] || 'image/png'

      const res = await fetch('/api/telegram/userbot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'test-image-signal',
          base64Image: base64Data,
          mimeType,
          createSignals: true, // Auto-create signal if valid
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setResult(data)
        if (data.hasValidSignals) {
          toast.success('VLM Analysis Complete', {
            description: `Signals generated for: ${data.signals.map((s: any) => s.symbol).join(', ')}`,
          })
        } else {
          toast.success('VLM Analysis Complete', {
            description: 'Processed image, but no trading signals were extracted.',
          })
        }
        if (onAnalysisSuccess) onAnalysisSuccess()
      } else {
        const errData = await res.json().catch(() => ({}))
        toast.error('VLM Analysis Failed', { description: errData.error || `Error ${res.status}` })
      }
    } catch (err: any) {
      toast.error('VLM Analysis Failed', { description: err.message || 'Network error' })
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="p-4 pb-0">
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Upload className="h-3.5 w-3.5 text-primary" /> Test VLM Image Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-2 space-y-3">
        <div className="space-y-2">
          <Input 
            type="file" 
            accept="image/*" 
            onChange={handleFileChange}
            className="text-xs h-9 cursor-pointer file:text-xs file:font-semibold"
          />
          {preview && (
            <div className="relative border border-border/40 rounded-lg overflow-hidden max-h-48 flex justify-center bg-muted/10">
              <img src={preview} alt="Upload preview" className="object-contain max-h-48 w-full" />
            </div>
          )}
          {preview && (
            <Button 
              size="sm" 
              onClick={handleAnalyze} 
              disabled={analyzing}
              className="w-full text-xs h-8 gap-1.5"
            >
              {analyzing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Running VLM Analysis...
                </>
              ) : (
                <>
                  <Brain className="h-3.5 w-3.5" />
                  Analyze Chart Image
                </>
              )}
            </Button>
          )}
        </div>

        {result && (
          <div className="p-3 rounded-md bg-muted/20 border border-border/30 text-xs space-y-2.5 max-h-60 overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="font-bold text-[10px] text-muted-foreground tracking-wider">VLM RESPONSE</span>
              <Badge variant="outline" className="text-[9px]">
                Type: {result.imageType || 'unknown'}
              </Badge>
            </div>
            <Separator />

            {result.extractedText && (
              <div>
                <span className="text-[9px] font-semibold text-muted-foreground block">Extracted Text:</span>
                <div className="text-[10px] whitespace-pre-wrap break-words italic bg-muted/40 p-2 rounded mt-1 border border-border/10">
                  {result.extractedText.substring(0, 1000)}
                </div>
              </div>
            )}

            {result.chartAnalysis && (
              <div className="space-y-1 bg-muted/40 p-2 rounded border border-border/10">
                <span className="text-[9px] font-semibold text-muted-foreground block">Chart Structure:</span>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] mt-1">
                  <div><span className="text-muted-foreground">Setup:</span> {result.chartAnalysis.setup || 'N/A'}</div>
                  <div><span className="text-muted-foreground">Trend:</span> {result.chartAnalysis.trend || 'N/A'}</div>
                  <div className="col-span-2"><span className="text-muted-foreground">Timeframe:</span> {result.chartAnalysis.timeframe || 'N/A'}</div>
                </div>
              </div>
            )}

            {result.signals && result.signals.length > 0 ? (
              <div className="space-y-1.5">
                <span className="text-[9px] font-semibold text-emerald-400 block">Extracted Signals:</span>
                <div className="space-y-1.5">
                  {result.signals.map((sig: any, index: number) => (
                    <div key={index} className="p-2.5 rounded bg-emerald-500/5 border border-emerald-500/20 text-[10px] space-y-1">
                      <div className="flex justify-between font-bold">
                        <span className="text-emerald-400">{sig.symbol}</span>
                        <span className={sig.action === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{sig.action}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-1 text-[9px] text-muted-foreground mt-1">
                        <div>Entry: ₹{sig.entryPrice}</div>
                        <div>Target: ₹{sig.targetPrice}</div>
                        <div>SL: ₹{sig.stopLoss}</div>
                      </div>
                      <div className="text-[8px] text-muted-foreground/80 mt-1 pt-1 border-t border-border/10">
                        Confidence: {sig.confidence}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-[10px] text-yellow-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> No trade signals extracted
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}


// ─── Setup Panel ───────────────────────────────────────────

export function SetupPanel() {
  return (
    <div className="space-y-3 pb-4">
      <TelegramSetupGuide />
      <AIProviderCard />
      <TelegramChannelsCard />
      <VlmImageTestCard />
    </div>
  )
}
