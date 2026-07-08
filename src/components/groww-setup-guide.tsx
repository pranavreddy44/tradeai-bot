'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '@/components/ui/input-otp'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import {
  Shield,
  Key,
  ExternalLink,
  CheckCircle,
  Clock,
  AlertTriangle,
  Zap,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Globe,
  Activity,
  BarChart3,
  Target,
  Radio,
  Unlock,
  Wallet,
  IndianRupee,
  RefreshCw,
  LogOut,
  ClipboardPaste,
  Smartphone,
  Info,
} from 'lucide-react'

// ─── Types ─────────────────────────────────────────────────

type Step = 'welcome' | 'credentials' | 'auth' | 'connected'
type AuthMethod = 'approval' | 'totp' | 'direct'

interface GrowwConnectionStatus {
  connected: boolean
  hasCredentials: boolean
  accessTokenValid?: boolean
  profile?: {
    vendorUserId: string
    ucc: string
    nseEnabled: boolean
    bseEnabled: boolean
    activeSegments: string[]
  }
  margin?: {
    clearCash: number
    netMarginUsed: number
    collateralAvailable: number
  }
  error?: string
  authMethod?: AuthMethod
}

// ─── Component ─────────────────────────────────────────────

export function GrowwSetupGuide() {
  const [step, setStep] = useState<Step>('welcome')
  const [authMethod, setAuthMethod] = useState<AuthMethod>('direct')
  const [apiKey, setApiKey] = useState('')
  const [apiSecret, setApiSecret] = useState('')
  const [totpSecret, setTotpSecret] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [directAccessToken, setDirectAccessToken] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [showAccessToken, setShowAccessToken] = useState(false)
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<GrowwConnectionStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Load credentials and status on mount
  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/broker/groww?action=status')
      const data = await res.json()
      setStatus(data)
      if (data.connected) {
        setStep('connected')
      } else if (data.hasCredentials) {
        setStep('auth')
      }
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadStatus()
  }, [loadStatus])

  // ─── Save Credentials ────────────────────────────────────

  const handleSaveCredentials = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/broker/groww', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-credentials',
          apiKey: authMethod === 'direct' ? `direct-${Date.now()}` : apiKey,
          apiSecret: authMethod === 'approval' ? apiSecret : undefined,
          authMethod,
          totpSecret: authMethod === 'totp' ? totpSecret : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        if (data.autoConnected) {
          // For approval flow: token was generated automatically from server
          setSuccess('Connected! Access token generated automatically from server — your server IP is included.')
          await loadStatus()
          setStep('connected')
        } else if (data.tokenError) {
          // Token generation failed (e.g., not approved yet)
          setSuccess('Credentials saved!')
          setError(`Auto token generation failed: ${data.tokenError}. Click "Approve" on Groww Cloud, then try again.`)
          setStep('auth')
        } else {
          // For TOTP flow: need to enter TOTP code in auth step
          setSuccess('Credentials saved! Now enter your TOTP code to generate access token.')
          setStep('auth')
        }
      } else {
        setError(data.error || 'Failed to save credentials')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Save Direct Access Token ────────────────────────────

  const handleDirectAccessToken = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/broker/groww', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save-direct-token',
          accessToken: directAccessToken.trim(),
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('Access token saved! Connected to Groww.')
        await loadStatus()
        setStep('connected')
      } else {
        setError(data.error || 'Failed to save access token')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Generate Access Token ───────────────────────────────

  const handleGenerateToken = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/broker/groww', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-token',
          totp_code: authMethod === 'totp' ? totpCode : undefined,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setSuccess('Access token generated! Connected to Groww.')
        await loadStatus()
        setStep('connected')
      } else {
        setError(data.error || 'Failed to generate access token')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Test Connection ─────────────────────────────────────

  const handleTestConnection = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/broker/groww', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test-connection' }),
      })
      const data = await res.json()
      if (data.connected) {
        setSuccess('Connection is active!')
      } else {
        setError(data.error || 'Connection failed')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Disconnect ──────────────────────────────────────────

  const handleDisconnect = async () => {
    setLoading(true)
    try {
      await fetch('/api/broker/groww', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'disconnect' }),
      })
      setStatus(null)
      setStep('welcome')
      setApiKey('')
      setApiSecret('')
      setTotpSecret('')
      setTotpCode('')
      setDirectAccessToken('')
      setSuccess('Disconnected from Groww')
      setError(null)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ─── Format Currency ─────────────────────────────────────

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(amount)
  }

  // ─── Step Indicator ──────────────────────────────────────

  const steps = [
    { id: 'welcome', label: 'Welcome', num: 1 },
    { id: 'credentials', label: 'API Keys', num: 2 },
    { id: 'auth', label: 'Authenticate', num: 3 },
    { id: 'connected', label: 'Connected', num: 4 },
  ]

  const stepIndex = steps.findIndex(s => s.id === step)

  return (
    <Card className="border-emerald-500/20 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="h-8 w-8 rounded-lg bg-emerald-600/20 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-emerald-400" />
            </div>
            Groww Trade API
          </CardTitle>
          <Badge
            variant="outline"
            className={
              status?.connected
                ? 'border-emerald-600/50 text-emerald-400 bg-emerald-950/30'
                : 'border-slate-600/50 text-slate-400 bg-slate-800/30'
            }
          >
            {status?.connected ? 'Connected' : 'Not Connected'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Step Indicator */}
        <div>
          <div className="flex items-center gap-1">
            {steps.map((s, i) => (
              <div key={s.id} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-medium transition-colors
                  ${i <= stepIndex ? 'bg-emerald-600 text-white' : 'bg-slate-700/50 text-slate-500'}`}>
                  {i < stepIndex ? <CheckCircle className="h-4 w-4" /> : s.num}
                </div>
                {i < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-1 transition-colors
                    ${i < stepIndex ? 'bg-emerald-600' : 'bg-slate-700/50'}`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {steps.map(s => (
              <span key={s.id} className="text-[10px] text-slate-500 flex-1 text-center">{s.label}</span>
            ))}
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <Alert variant="destructive" className="bg-red-950/30 border-red-800/50 text-red-300">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}
        {success && (
          <Alert className="bg-emerald-950/30 border-emerald-800/50 text-emerald-300">
            <CheckCircle className="h-4 w-4" />
            <AlertTitle>Success</AlertTitle>
            <AlertDescription className="text-sm">{success}</AlertDescription>
          </Alert>
        )}

        {/* ─── Step 1: Welcome ──────────────────────────── */}
        {step === 'welcome' && (
          <div className="space-y-4">
            <div className="text-center py-4">
              <div className="h-16 w-16 rounded-2xl bg-emerald-600/20 flex items-center justify-center mx-auto mb-3">
                <IndianRupee className="h-8 w-8 text-emerald-400" />
              </div>
              <h3 className="text-xl font-semibold text-white">Trade with Groww</h3>
              <p className="text-sm text-slate-400 mt-1">Connect your Groww account for automated trading</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: Zap, label: 'Auto-Execute Signals', desc: 'AI signals → instant orders' },
                { icon: Target, label: 'Smart Orders (OCO)', desc: 'Target + SL auto-exit' },
                { icon: Activity, label: 'Real-time Data', desc: 'LTP, Quote, Option Chain' },
                { icon: Wallet, label: 'Margin & Positions', desc: 'Live portfolio tracking' },
              ].map(item => (
                <Card key={item.label} className="bg-slate-800/30 border-slate-700/30">
                  <CardContent className="p-3">
                    <item.icon className="h-5 w-5 text-emerald-400 mb-1" />
                    <div className="text-sm font-medium text-slate-200">{item.label}</div>
                    <div className="text-xs text-slate-500">{item.desc}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="bg-amber-950/20 border border-amber-800/30 rounded-lg p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <div className="text-xs text-amber-300">
                  <strong>Prerequisite:</strong> You need an active Groww Trade API subscription (₹499/month).
                  <a href="https://groww.in/trade-api" target="_blank" rel="noopener noreferrer" className="underline ml-1 text-amber-200 hover:text-amber-100">
                    Subscribe here <ExternalLink className="h-3 w-3 inline" />
                  </a>
                </div>
              </div>
            </div>

            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setStep('credentials')}
            >
              Get Started <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* ─── Step 2: API Credentials ──────────────────── */}
        {step === 'credentials' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">API Credentials</h3>
              <p className="text-sm text-slate-400">Choose how you want to connect to Groww</p>
            </div>

            {/* How to get API keys */}
            <div className="bg-slate-800/40 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                <Key className="h-4 w-4 text-emerald-400" />
                Step-by-step guide:
              </h4>
              <ol className="space-y-2 text-xs text-slate-400">
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-mono font-bold">1.</span>
                  Go to{' '}
                  <a href="https://groww.in/trade-api/api-keys" target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline hover:text-emerald-200">
                    Groww Cloud API Keys <ExternalLink className="h-3 w-3 inline" />
                  </a>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-mono font-bold">2.</span>
                  Log in with your Groww account
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-400 font-mono font-bold">3.</span>
                  Choose an authentication method below and generate keys
                </li>
              </ol>
            </div>

            {/* Auth Method Selection */}
            <div className="space-y-2">
              <Label className="text-slate-300 text-sm">Authentication Method</Label>
              <div className="space-y-2">
                {/* Direct Access Token - Most Common & Easiest */}
                <button
                  onClick={() => setAuthMethod('direct')}
                  className={`w-full p-3 rounded-lg border text-left transition-all ${
                    authMethod === 'direct'
                      ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                      : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <ClipboardPaste className="h-5 w-5 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Paste Access Token</span>
                        <Badge className="bg-emerald-600/80 text-white text-[10px] px-1.5 py-0">Easiest</Badge>
                      </div>
                      <div className="text-xs opacity-70 mt-0.5">Generate token on Groww dashboard and paste it here</div>
                    </div>
                  </div>
                </button>

                {/* TOTP Flow - No daily approval */}
                <button
                  onClick={() => setAuthMethod('totp')}
                  className={`w-full p-3 rounded-lg border text-left transition-all ${
                    authMethod === 'totp'
                      ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                      : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Smartphone className="h-5 w-5 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">TOTP Token</span>
                        <Badge variant="outline" className="border-blue-500/50 text-blue-400 text-[10px] px-1.5 py-0">Recommended</Badge>
                      </div>
                      <div className="text-xs opacity-70 mt-0.5">No daily approval needed — use authenticator app</div>
                    </div>
                  </div>
                </button>

                {/* Approval Flow */}
                <button
                  onClick={() => setAuthMethod('approval')}
                  className={`w-full p-3 rounded-lg border text-left transition-all ${
                    authMethod === 'approval'
                      ? 'border-emerald-500 bg-emerald-950/30 text-emerald-300'
                      : 'border-slate-700 bg-slate-800/30 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <Shield className="h-5 w-5 mt-0.5 shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">API Key + Secret</span>
                        <Badge className="bg-blue-600/80 text-white text-[10px] px-1.5 py-0">Server-Side</Badge>
                      </div>
                      <div className="text-xs opacity-70 mt-0.5">Token auto-generated from server — server IP auto-included for orders</div>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* ─── Direct Access Token Fields ─── */}
            {authMethod === 'direct' && (
              <>
                <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-4 space-y-3">
                  <h4 className="text-sm font-medium text-emerald-300 flex items-center gap-2">
                    <ClipboardPaste className="h-4 w-4" />
                    How to get your Access Token directly:
                  </h4>
                  <ol className="space-y-2 text-xs text-slate-400">
                    <li className="flex gap-2">
                      <span className="text-emerald-400 font-mono font-bold">1.</span>
                      Go to{' '}
                      <a href="https://groww.in/trade-api/api-keys" target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline hover:text-emerald-200">
                        Groww Cloud API Keys <ExternalLink className="h-3 w-3 inline" />
                      </a>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-400 font-mono font-bold">2.</span>
                      Click the dropdown arrow (▼) at the top right next to &quot;Generate API key&quot;
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-400 font-mono font-bold">3.</span>
                      Select <strong className="text-emerald-300">&quot;Generate Access Token&quot;</strong> — the one described as &quot;Direct Access token for API&quot;
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-400 font-mono font-bold">4.</span>
                      Copy the access token that appears and paste it below
                    </li>
                  </ol>
                  <div className="bg-slate-900/50 rounded-md p-2 flex items-start gap-2 mt-2">
                    <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-400">
                      <strong className="text-blue-300">Tip:</strong> This is the quickest way! The access token resets daily at 6 AM IST.
                      You&apos;ll need to re-paste it each day.
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-sm">Access Token</Label>
                  <div className="relative">
                    <Input
                      type={showAccessToken ? 'text' : 'password'}
                      value={directAccessToken}
                      onChange={(e) => setDirectAccessToken(e.target.value)}
                      placeholder="Paste the access token from Groww dashboard"
                      className="bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-600 pr-10 font-mono text-sm"
                    />
                    <button
                      onClick={() => setShowAccessToken(!showAccessToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep('welcome')}
                    className="border-slate-700 text-slate-400"
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleDirectAccessToken}
                    disabled={loading || !directAccessToken.trim()}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlock className="h-4 w-4 mr-2" />}
                    Connect with Access Token
                  </Button>
                </div>
              </>
            )}

            {/* ─── TOTP Flow Fields ─── */}
            {authMethod === 'totp' && (
              <>
                <div className="space-y-3">
                  <div className="bg-blue-950/20 border border-blue-800/30 rounded-lg p-4 space-y-3">
                    <h4 className="text-sm font-medium text-blue-300 flex items-center gap-2">
                      <Smartphone className="h-4 w-4" />
                      How TOTP Authentication Works:
                    </h4>
                    <ol className="space-y-2 text-xs text-slate-400">
                      <li className="flex gap-2">
                        <span className="text-emerald-400 font-mono font-bold">1.</span>
                        On Groww dashboard dropdown → Click <strong className="text-blue-300">&quot;Generate TOTP Token&quot;</strong> (NOT &quot;Generate Access Token&quot;)
                      </li>
                      <li className="flex gap-2">
                        <span className="text-emerald-400 font-mono font-bold">2.</span>
                        Groww will show you a <strong className="text-blue-300">TOTP Secret</strong> (a long string) and/or a QR code
                      </li>
                      <li className="flex gap-2">
                        <span className="text-emerald-400 font-mono font-bold">3.</span>
                        Open <strong className="text-blue-300">Google Authenticator</strong> or <strong className="text-blue-300">Authy</strong> on your phone
                      </li>
                      <li className="flex gap-2">
                        <span className="text-emerald-400 font-mono font-bold">4.</span>
                        Tap &quot;+&quot; → &quot;Enter a setup key&quot; → Paste the TOTP Secret, or scan the QR code
                      </li>
                      <li className="flex gap-2">
                        <span className="text-emerald-400 font-mono font-bold">5.</span>
                        The app now generates a <strong className="text-blue-300">6-digit code every 30 seconds</strong>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-emerald-400 font-mono font-bold">6.</span>
                        Enter that 6-digit code in the next step to generate your access token
                      </li>
                    </ol>
                    <div className="bg-slate-900/50 rounded-md p-2 flex items-start gap-2">
                      <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-400">
                        <strong className="text-amber-300">Advantage:</strong> No need to approve daily on Groww Cloud.
                        Just enter the fresh 6-digit code from your authenticator app whenever the token expires (daily at 6 AM).
                      </p>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm">API Key (from Groww)</Label>
                    <Input
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your Groww API Key"
                      className="bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-600"
                    />
                    <p className="text-xs text-slate-500">Found on the Groww API Keys page under your key name</p>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm">TOTP Secret</Label>
                    <div className="relative">
                      <Input
                        type={showSecret ? 'text' : 'password'}
                        value={totpSecret}
                        onChange={(e) => setTotpSecret(e.target.value)}
                        placeholder="Paste the TOTP Secret from Groww"
                        className="bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-600 pr-10"
                      />
                      <button
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">This is the secret shown when you click &quot;Generate TOTP Token&quot; on Groww</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep('welcome')}
                    className="border-slate-700 text-slate-400"
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleSaveCredentials}
                    disabled={loading || !apiKey || !totpSecret}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save Credentials
                  </Button>
                </div>
              </>
            )}

            {/* ─── Approval Flow Fields ─── */}
            {authMethod === 'approval' && (
              <>
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm">API Key</Label>
                    <Input
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="Enter your Groww API Key"
                      className="bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-600"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-slate-300 text-sm">API Secret</Label>
                    <div className="relative">
                      <Input
                        type={showSecret ? 'text' : 'password'}
                        value={apiSecret}
                        onChange={(e) => setApiSecret(e.target.value)}
                        placeholder="Enter your API Secret"
                        className="bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-600 pr-10"
                      />
                      <button
                        onClick={() => setShowSecret(!showSecret)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                      >
                        {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-amber-400/80 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      You need to approve the session daily on Groww Cloud API Keys page
                    </p>
                  </div>
                </div>

                <div className="bg-blue-950/20 border border-blue-800/30 rounded-lg p-3">
                  <p className="text-xs text-blue-300">
                    <strong>How to get API Key + Secret:</strong> On the Groww Cloud API Keys page, click
                    &quot;Generate API Key&quot; → Enter a name → Copy the API Key and Secret.
                    You&apos;ll need to click &quot;Approve&quot; daily on that page.
                  </p>
                  <div className="mt-2 bg-slate-900/50 rounded p-2 flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-400">
                      <strong className="text-emerald-300">Why use this method:</strong> The access token is generated from our server, so Groww automatically includes our server&apos;s IP address. This means <strong>order placement will work</strong> without manually registering IPs!
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep('welcome')}
                    className="border-slate-700 text-slate-400"
                  >
                    Back
                  </Button>
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleSaveCredentials}
                    disabled={loading || !apiKey || !apiSecret}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save Credentials
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {/* ─── Step 3: Authenticate ─────────────────────── */}
        {step === 'auth' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Authenticate</h3>
              <p className="text-sm text-slate-400">Generate your access token to connect</p>
            </div>

            {status?.authMethod === 'approval' ? (
              <div className="space-y-3">
                <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-emerald-300 flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Approval Flow — Generate Access Token from Server
                  </h4>
                  <ol className="mt-2 space-y-2 text-xs text-slate-400">
                    <li className="flex gap-2">
                      <span className="text-emerald-400 font-mono font-bold">1.</span>
                      Go to{' '}
                      <a href="https://groww.in/trade-api/api-keys" target="_blank" rel="noopener noreferrer" className="text-emerald-300 underline hover:text-emerald-200">
                        Groww Cloud API Keys <ExternalLink className="h-3 w-3 inline" />
                      </a>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-400 font-mono font-bold">2.</span>
                      Click <strong className="text-emerald-300">&quot;Approve&quot;</strong> next to your API Key
                    </li>
                    <li className="flex gap-2">
                      <span className="text-emerald-400 font-mono font-bold">3.</span>
                      Come back here and click <strong className="text-emerald-300">&quot;Generate Access Token&quot;</strong>
                    </li>
                  </ol>
                  <div className="bg-slate-900/50 rounded-md p-2 flex items-start gap-2 mt-2">
                    <Info className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-400">
                      <strong className="text-blue-300">Server-side token:</strong> When you click the button below, the access token is generated from our server. This automatically includes the server&apos;s IP address, so order placement will work.
                    </p>
                  </div>
                </div>

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleGenerateToken}
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlock className="h-4 w-4 mr-2" />}
                  Generate Access Token from Server
                </Button>
              </div>
            ) : status?.authMethod === 'totp' ? (
              <div className="space-y-3">
                <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-emerald-300 flex items-center gap-2">
                    <Radio className="h-4 w-4" />
                    TOTP Flow
                  </h4>
                  <p className="mt-1 text-xs text-slate-400">
                    Enter the 6-digit code from your authenticator app (Google Authenticator, Authy, etc.)
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-sm">6-Digit TOTP Code</Label>
                  <InputOTP maxLength={6} value={totpCode} onChange={setTotpCode}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                    </InputOTPGroup>
                    <InputOTPSeparator />
                    <InputOTPGroup>
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                  <p className="text-xs text-slate-500 text-center">
                    Open your authenticator app and enter the current 6-digit code
                  </p>
                </div>

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleGenerateToken}
                  disabled={loading || totpCode.length !== 6}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlock className="h-4 w-4 mr-2" />}
                  Generate Access Token
                </Button>
              </div>
            ) : (
              /* Direct token flow - should not normally reach here but just in case */
              <div className="space-y-3">
                <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-lg p-4">
                  <h4 className="text-sm font-medium text-emerald-300 flex items-center gap-2">
                    <ClipboardPaste className="h-4 w-4" />
                    Paste Access Token
                  </h4>
                  <p className="mt-1 text-xs text-slate-400">
                    Generate an access token on the Groww dashboard and paste it here.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-slate-300 text-sm">Access Token</Label>
                  <div className="relative">
                    <Input
                      type={showAccessToken ? 'text' : 'password'}
                      value={directAccessToken}
                      onChange={(e) => setDirectAccessToken(e.target.value)}
                      placeholder="Paste the access token from Groww dashboard"
                      className="bg-slate-800/50 border-slate-700 text-slate-200 placeholder:text-slate-600 pr-10 font-mono text-sm"
                    />
                    <button
                      onClick={() => setShowAccessToken(!showAccessToken)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                    >
                      {showAccessToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={handleDirectAccessToken}
                  disabled={loading || !directAccessToken.trim()}
                >
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Unlock className="h-4 w-4 mr-2" />}
                  Connect with Access Token
                </Button>
              </div>
            )}

            <Button
              variant="outline"
              onClick={() => setStep('credentials')}
              className="w-full border-slate-700 text-slate-400"
            >
              Back to Credentials
            </Button>
          </div>
        )}

        {/* ─── Step 4: Connected ────────────────────────── */}
        {step === 'connected' && (
          <div className="space-y-4">
            <div className="text-center py-2">
              <div className="h-12 w-12 rounded-full bg-emerald-600/20 flex items-center justify-center mx-auto mb-2">
                <CheckCircle className="h-7 w-7 text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">Connected to Groww</h3>
              <p className="text-sm text-slate-400">Your trading account is linked</p>
            </div>

            {/* Profile Info */}
            {status?.profile && (
              <Card className="bg-slate-800/30 border-slate-700/30">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-medium text-slate-200">Account Details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">User ID</span>
                      <div className="text-slate-300 font-mono">{status.profile.ucc}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Active Segments</span>
                      <div className="text-slate-300">{status.profile.activeSegments?.join(', ') || 'N/A'}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">NSE</span>
                      <Badge variant={status.profile.nseEnabled ? 'default' : 'destructive'} className="text-xs">
                        {status.profile.nseEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-slate-500">BSE</span>
                      <Badge variant={status.profile.bseEnabled ? 'default' : 'destructive'} className="text-xs">
                        {status.profile.bseEnabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Margin Info */}
            {status?.margin && (
              <Card className="bg-slate-800/30 border-slate-700/30">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-medium text-slate-200">Margin Details</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <div className="text-lg font-bold text-emerald-400">{formatCurrency(status.margin.clearCash)}</div>
                      <div className="text-xs text-slate-500">Available Cash</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-amber-400">{formatCurrency(status.margin.netMarginUsed)}</div>
                      <div className="text-xs text-slate-500">Margin Used</div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-400">{formatCurrency(status.margin.collateralAvailable)}</div>
                      <div className="text-xs text-slate-500">Collateral</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800/50"
                onClick={handleTestConnection}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Test Connection
              </Button>

              {(status?.authMethod === 'approval' || status?.authMethod === 'totp') && (
                <div className="bg-amber-950/20 border border-amber-800/30 rounded-lg p-3">
                  <p className="text-xs text-amber-300 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <strong>Remember:</strong> Access tokens reset daily at 6 AM IST. {status?.authMethod === 'approval' ? 'Approve your session on Groww Cloud, then re-generate token here.' : 'Re-generate here using your saved TOTP secret, or enter a fresh authenticator code as an override.'}
                  </p>
                </div>
              )}

              {status?.authMethod === 'direct' && (
                <div className="bg-amber-950/20 border border-amber-800/30 rounded-lg p-3">
                  <p className="text-xs text-amber-300 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <strong>Remember:</strong> Access tokens reset daily at 6 AM IST. Generate a new one from Groww dashboard and re-paste it here.
                  </p>
                </div>
              )}

              <Button
                variant="outline"
                className="w-full border-red-800/50 text-red-400 hover:bg-red-950/30"
                onClick={handleDisconnect}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
                Disconnect Groww
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
