// ============================================================
// Telegram MTProto Userbot - Server-Side Singleton
// Runs within the Next.js process to avoid networking issues
// with the sandbox environment (Node.js can't reach Bun servers)
// ============================================================

import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { Api } from 'telegram';

// ─── Types ──────────────────────────────────────────────────

type AuthStatus = 'idle' | 'connecting' | 'waiting_code' | 'waiting_password' | 'connected' | 'error';

export interface UserbotStatus {
  auth: AuthStatus;
  phone: string | null;
  connectedAt: string | null;
  errorMessage: string | null;
  channels: number;
  lastPoll: string | null;
  monitoredChannels: MonitoredChannelStatus[];
  messagesReceived: number;
  lastMessageAt: string | null;
  lastMessageFrom: string | null;
}

export interface MonitoredChannelStatus {
  id: string;
  name: string;
  channelId: string;
  isActive: boolean;
  isReachable: boolean | null; // null = not tested yet
  lastTestedAt: string | null;
  lastMessageAt: string | null;
  messageCount: number;
}

export interface TestConnectionResult {
  connected: boolean;
  phone: string | null;
  selfUser: string | null;
  error: string | null;
}

export interface TestChannelResult {
  channelId: string;
  reachable: boolean;
  channelTitle: string | null;
  recentMessages: Array<{
    id: number;
    text: string;
    date: string;
    fromId: string | null;
  }>;
  error: string | null;
}

interface Channel {
  id: string;
  name: string;
  channelId: string;
  isActive: boolean;
  lastMessageId: string | null;
}

interface TelegramDialog {
  id: string;
  name: string;
  username: string | null;
  type: string;
}

// ─── State ──────────────────────────────────────────────────

let authState: {
  status: AuthStatus;
  client: TelegramClient | null;
  codeResolve: ((code: string) => void) | null;
  passwordResolve: ((password: string) => void) | null;
  errorMessage: string | null;
  apiId: number | null;
  apiHash: string | null;
  phone: string | null;
  connectedAt: string | null;
} = {
  status: 'idle',
  client: null,
  codeResolve: null,
  passwordResolve: null,
  errorMessage: null,
  apiId: null,
  apiHash: null,
  phone: null,
  connectedAt: null,
};

let channels: Channel[] = [];
let monitoredChannelIds: Set<string> = new Set();
let lastPollTimestamp: string | null = null;
let channelRefreshTimer: ReturnType<typeof setInterval> | null = null;
let isInitialized = false;

// Message tracking
let totalMessagesReceived = 0;
let lastMessageTimestamp: string | null = null;
let lastMessageFromChannel: string | null = null;

// Track if session was revoked (AUTH_KEY_UNREGISTERED)
let sessionRevoked = false;

// Channel reachability testing results
const channelReachability: Map<string, { reachable: boolean; testedAt: string; title: string | null }> = new Map();

// Per-channel message tracking
const channelMessageStats: Map<string, { count: number; lastMessageAt: string }> = new Map();

// ─── Settings Helpers ───────────────────────────────────────

async function saveSetting(key: string, value: string): Promise<void> {
  try {
    const { db } = await import('@/lib/db');
    await db.botSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  } catch (e) {
    console.error('[TelegramUserbot] Failed to save setting:', e);
  }
}

async function loadSetting(key: string): Promise<string | null> {
  try {
    const { db } = await import('@/lib/db');
    const setting = await db.botSetting.findUnique({ where: { key } });
    return setting?.value || null;
  } catch {
    return null;
  }
}

// ─── Channel Management ─────────────────────────────────────

async function refreshChannels(): Promise<void> {
  try {
    const { db } = await import('@/lib/db');
    const allChannels = await db.telegramChannel.findMany({
      orderBy: { createdAt: 'desc' },
    });
    channels = allChannels;
    const newSet = new Set<string>();
    for (const ch of channels) {
      if (!ch.isActive) continue;
      newSet.add(ch.channelId);
      const stripped = ch.channelId.replace(/^@/, '');
      newSet.add(stripped);
      if (!ch.channelId.startsWith('@')) newSet.add(`@${ch.channelId}`);
      newSet.add(ch.channelId.toLowerCase());
      newSet.add(stripped.toLowerCase());
    }
    monitoredChannelIds = newSet;
    console.log(`[TelegramUserbot] Refreshed channels: ${channels.filter((c) => c.isActive).length} active`);
  } catch (e) {
    console.error('[TelegramUserbot] Failed to refresh channels:', e);
  }
}

// ─── Message Monitoring ─────────────────────────────────────

function beginMonitoring(client: TelegramClient): void {
  client.addEventHandler(async (event: NewMessage) => {
    const message = event.message as Api.Message;
    const text = message.text || message.message || '';
    const hasPhoto = !!message.photo;
    const hasMedia = !!message.media;

    // Skip messages with no text AND no photo
    if (!text.trim() && !hasPhoto && !hasMedia) return;

    lastPollTimestamp = new Date().toISOString();

    // Get channel/chat info
    let chatIdStr = '';
    let chatUsername = '';

    try {
      const peerId = message.peerId;
      if (peerId && 'channelId' in peerId) {
        chatIdStr = String((peerId as Api.PeerChannel).channelId);
      } else if (peerId && 'chatId' in peerId) {
        chatIdStr = String((peerId as Api.PeerChat).chatId);
      }

      // Try to get entity for username
      if (message.peerId) {
        try {
          const entity = await client.getEntity(message.peerId);
          if (entity && 'username' in entity && entity.username) {
            chatUsername = entity.username;
          }
        } catch {
          // entity resolution might fail, that's OK
        }
      }
    } catch {
      // peerId parsing failed
    }

    // Check if from a monitored channel
    const isMonitored =
      monitoredChannelIds.has(chatIdStr) ||
      monitoredChannelIds.has(`@${chatUsername}`) ||
      monitoredChannelIds.has(chatUsername) ||
      monitoredChannelIds.has(chatUsername.toLowerCase()) ||
      monitoredChannelIds.has(`@${chatUsername.toLowerCase()}`);

    if (!isMonitored) return;

    const displayId = chatUsername ? `@${chatUsername}` : chatIdStr;

    // Update message tracking
    totalMessagesReceived++;
    lastMessageTimestamp = new Date().toISOString();
    lastMessageFromChannel = displayId;
    const channelKey = chatUsername || chatIdStr;
    const existing = channelMessageStats.get(channelKey) || { count: 0, lastMessageAt: '' };
    channelMessageStats.set(channelKey, {
      count: existing.count + 1,
      lastMessageAt: lastMessageTimestamp,
    });

    // ─── Process text-based messages ──────────────────────────
    if (text.trim() && !hasPhoto) {
      console.log(`[TelegramUserbot] 📥 Text from ${displayId}: ${text.substring(0, 100)}`);
      await processTextSignal(text, displayId, chatIdStr, chatUsername, message.date ? new Date(message.date * 1000).toISOString() : null);
    }

    // ─── Process photo/image messages ─────────────────────────
    if (hasPhoto || (hasMedia && message.media instanceof Api.Photo)) {
      console.log(`[TelegramUserbot] 📸 Image from ${displayId} ${text ? `(caption: ${text.substring(0, 50)})` : '(no caption)'}`);
      await processImageSignal(client, message, displayId, chatIdStr, chatUsername);
    }
  }, new NewMessage({}));

  console.log('[TelegramUserbot] 📡 Message monitoring started (with image support)');
}

// ─── Text Signal Processing ─────────────────────────────────

async function processTextSignal(
  text: string,
  displayId: string,
  chatIdStr: string,
  chatUsername: string,
  messageAt: string | null
): Promise<void> {
  try {
    const { buildTrustedTelegramCandidate, parseTelegramSignal } = await import('@/lib/ai-engine');
    const { db } = await import('@/lib/db');
    const { getGrowwLivePrice, normalizeSignalWithLivePrice } = await import('@/lib/broker/live-prices');
    const { inferTradeType, parseSourceTimestamp } = await import('@/lib/trade-classification');
    const { resolveInstrumentFromText } = await import('@/lib/market/instrument-resolver');

    let result = await parseTelegramSignal(text);
    if (!result.isValid) {
      const resolvedInstrument = await resolveInstrumentFromText(text).catch(() => null);
      const preliminary = buildTrustedTelegramCandidate(text, null, resolvedInstrument?.symbol);
      const symbol = preliminary.signal?.symbol || resolvedInstrument?.symbol || null;
      const livePrice = symbol ? await getGrowwLivePrice(symbol) : null;
      const recovered = buildTrustedTelegramCandidate(text, livePrice, resolvedInstrument?.symbol);
      if (recovered.isValid) {
        result = {
          ...recovered,
          reasoning: `${recovered.reasoning} ${resolvedInstrument ? `Resolved via Groww instruments (${resolvedInstrument.matchType}: ${resolvedInstrument.name}).` : ''} Recovered from AI rejection: ${result.reasoning || 'not provided'}`,
        };
      }
    }

    await db.aIDecision.create({
      data: {
        model: 'zai-llm',
        inputType: 'telegram',
        inputData: text.substring(0, 5000),
        output: JSON.stringify(result),
        symbol: result.signal?.symbol || null,
        action: result.isValid ? result.signal?.action : null,
        confidence: result.signal?.confidence ?? null,
      },
    });

    if (result.isValid && result.signal) {
      const signalWithLivePrice = await normalizeSignalWithLivePrice({
        ...result.signal,
        reasoning: result.reasoning || text,
      });
      await db.tradeSignal.create({
        data: {
          symbol: signalWithLivePrice.symbol.toUpperCase(),
          exchange: 'NSE',
          action: signalWithLivePrice.action,
          source: 'telegram',
          confidence: signalWithLivePrice.confidence,
          entryPrice: signalWithLivePrice.entryPrice,
          targetPrice: signalWithLivePrice.targetPrice,
          stopLoss: signalWithLivePrice.stopLoss,
          quantity: 1,
          reasoning: signalWithLivePrice.reasoning,
          status: 'pending',
          channelId: chatIdStr || chatUsername,
          tradeType: inferTradeType({ symbol: signalWithLivePrice.symbol, source: 'telegram', text }),
          sourceTimestamp: parseSourceTimestamp(messageAt),
        },
      });
      console.log(`[TelegramUserbot] ✅ Text signal from ${displayId}: ${signalWithLivePrice.symbol} ${signalWithLivePrice.action}`);
    }

    // Handle multiple signals from text
    if (result.isValid && result.signals && result.signals.length > 1) {
      for (const rawSig of result.signals) {
        const sig = await normalizeSignalWithLivePrice({
          ...rawSig,
          reasoning: result.reasoning || text,
        });
        await db.tradeSignal.create({
          data: {
            symbol: sig.symbol.toUpperCase(),
            exchange: 'NSE',
            action: sig.action,
            source: 'telegram',
            confidence: sig.confidence,
            entryPrice: sig.entryPrice,
            targetPrice: sig.targetPrice,
            stopLoss: sig.stopLoss,
            quantity: 1,
            reasoning: sig.reasoning,
            status: 'pending',
            channelId: chatIdStr || chatUsername,
            tradeType: inferTradeType({ symbol: sig.symbol, source: 'telegram', text }),
            sourceTimestamp: parseSourceTimestamp(messageAt),
          },
        });
      }
      console.log(`[TelegramUserbot] ✅ ${result.signals.length} text signals from ${displayId}`);
    }
  } catch (e) {
    if (isSessionRevokedError(e)) {
      await handleSessionRevoked(e instanceof Error ? e.message : String(e));
      return;
    }
    console.error(`[TelegramUserbot] Failed to process text from ${displayId}:`, e);
  }
}

// ─── Image Signal Processing ────────────────────────────────

async function processImageSignal(
  client: TelegramClient,
  message: Api.Message,
  displayId: string,
  chatIdStr: string,
  chatUsername: string
): Promise<void> {
  try {
    // Download the photo media
    console.log(`[TelegramUserbot] 📥 Downloading image from ${displayId}...`);

    const downloadResult = await client.downloadMedia(message, {
      outputFile: undefined, // Return as Buffer
    });

    if (!downloadResult) {
      console.warn(`[TelegramUserbot] ⚠️ Failed to download image from ${displayId}`);
      return;
    }

    // Convert buffer to base64
    let imageBuffer: Buffer;
    if (downloadResult instanceof Buffer) {
      imageBuffer = downloadResult;
    } else if (typeof downloadResult === 'string') {
      // GramJS may return file path
      const fs = await import('fs');
      imageBuffer = fs.readFileSync(downloadResult);
    } else if (downloadResult instanceof Uint8Array) {
      imageBuffer = Buffer.from(downloadResult);
    } else {
      console.warn(`[TelegramUserbot] ⚠️ Unexpected download format from ${displayId}: ${typeof downloadResult}`);
      return;
    }

    const base64Image = imageBuffer.toString('base64');
    console.log(`[TelegramUserbot] 📸 Image downloaded (${(imageBuffer.length / 1024).toFixed(1)}KB), sending to VLM...`);

    // Use VLM to extract trading signals from the image
    const { parseImageSignal } = await import('@/lib/ai-engine');
    const { db } = await import('@/lib/db');
    const { normalizeSignalWithLivePrice } = await import('@/lib/broker/live-prices');
    const { validateChartSignalWithIndicators } = await import('@/lib/chart/technical-analysis');
    const { inferTradeType, parseSourceTimestamp } = await import('@/lib/trade-classification');

    const textCaption = message.text || message.message || '';
    const vlmResult = await parseImageSignal(base64Image, 'image/jpeg', textCaption);

    if (!vlmResult.hasValidSignals || vlmResult.signals.length === 0) {
      console.log(`[TelegramUserbot] 📷 No trading signals found in image from ${displayId}`);
      // Still log the AI decision for tracking
      await db.aIDecision.create({
        data: {
          model: 'zai-vlm',
          inputType: 'telegram-image',
          inputData: `[Image from ${displayId}] ${message.text || '(no caption)'}`,
          output: JSON.stringify(vlmResult),
          symbol: null,
          action: null,
          confidence: null,
        },
      });
      return;
    }

    console.log(`[TelegramUserbot] 🎯 VLM found ${vlmResult.signals.length} signal(s) in image from ${displayId}`);

    // Create AI decision record
    await db.aIDecision.create({
      data: {
        model: 'zai-vlm',
        inputType: 'telegram-image',
        inputData: `[Image from ${displayId}] ${vlmResult.extractedText?.substring(0, 2000) || message.text || '(no text)'}`,
        output: JSON.stringify(vlmResult),
        symbol: vlmResult.signals[0]?.symbol || null,
        action: vlmResult.signals[0]?.action || null,
        confidence: vlmResult.signals[0]?.confidence ?? null,
      },
    });

    // Create trade signals for each extracted signal
    for (const rawSig of vlmResult.signals) {
      const chartReason = vlmResult.chartAnalysis
        ? [
            vlmResult.chartAnalysis.setup ? `Setup: ${vlmResult.chartAnalysis.setup}` : '',
            vlmResult.chartAnalysis.trend ? `Trend: ${vlmResult.chartAnalysis.trend}` : '',
            vlmResult.chartAnalysis.timeframe ? `Timeframe: ${vlmResult.chartAnalysis.timeframe}` : '',
            vlmResult.chartAnalysis.resistanceLevels?.length ? `Resistance: ${vlmResult.chartAnalysis.resistanceLevels.join(', ')}` : '',
            vlmResult.chartAnalysis.supportLevels?.length ? `Support: ${vlmResult.chartAnalysis.supportLevels.join(', ')}` : '',
            vlmResult.chartAnalysis.chartNotes || '',
            vlmResult.chartAnalysis.riskNotes || '',
          ].filter(Boolean).join(' | ')
        : '';
      const liveNormalizedSig = await normalizeSignalWithLivePrice({
        ...rawSig,
        reasoning: `[${vlmResult.imageType === 'chart' ? 'Chart Image Signal' : 'Image Signal'}${rawSig.notes ? ` — ${rawSig.notes}` : ''}] ${textCaption ? textCaption + ' | ' : ''}${chartReason || vlmResult.extractedText?.substring(0, 500) || ''}`,
      });
      const sig = vlmResult.imageType === 'chart'
        ? await validateChartSignalWithIndicators(liveNormalizedSig, vlmResult.chartAnalysis)
        : liveNormalizedSig;
      await db.tradeSignal.create({
        data: {
          symbol: sig.symbol.toUpperCase(),
          exchange: 'NSE',
          action: sig.action,
          source: vlmResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
          confidence: sig.confidence,
          entryPrice: sig.entryPrice,
          targetPrice: sig.targetPrice,
          stopLoss: sig.stopLoss,
          quantity: 1,
          reasoning: sig.reasoning,
          status: 'pending',
          channelId: chatIdStr || chatUsername,
          tradeType: inferTradeType({
            symbol: sig.symbol,
            source: vlmResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
            text: sig.reasoning,
          }),
          sourceTimestamp: parseSourceTimestamp(message.date ? new Date(message.date * 1000).toISOString() : null),
        },
      });
      console.log(`[TelegramUserbot] ✅ Image signal from ${displayId}: ${sig.symbol} ${sig.action} @${sig.entryPrice}`);
    }
  } catch (e) {
    if (isSessionRevokedError(e)) {
      await handleSessionRevoked(e instanceof Error ? e.message : String(e));
      return;
    }
    console.error(`[TelegramUserbot] Failed to process image from ${displayId}:`, e);
  }
}

// ─── Authentication ─────────────────────────────────────────

export async function startAuth(
  apiId: number,
  apiHash: string,
  phone: string
): Promise<{ status: string; message: string }> {
  if (authState.status === 'connected' || authState.status === 'connecting') {
    return { status: authState.status, message: `Already in ${authState.status} state` };
  }

  // Reset session revoked flag on new auth attempt
  sessionRevoked = false;

  authState.apiId = apiId;
  authState.apiHash = apiHash;
  authState.phone = phone;
  authState.errorMessage = null;
  authState.status = 'connecting';

  // Save credentials
  await saveSetting('telegramApiId', String(apiId));
  await saveSetting('telegramApiHash', apiHash);
  await saveSetting('telegramPhone', phone);

  // Run auth in background (non-blocking)
  ;(async () => {
    try {
      const session = new StringSession('');
      const client = new TelegramClient(session, apiId, apiHash, {
        connectionRetries: 5,
        retryDelay: 3000,
        autoReconnect: true,
      });

      authState.client = client;

      await client.start({
        phoneNumber: async () => phone,
        phoneCode: async () => {
          authState.status = 'waiting_code';
          console.log(`[TelegramUserbot] 📱 Waiting for verification code for ${phone}`);
          return new Promise<string>((resolve) => {
            authState.codeResolve = resolve;
          });
        },
        password: async () => {
          authState.status = 'waiting_password';
          console.log('[TelegramUserbot] 🔐 Waiting for 2FA password');
          return new Promise<string>((resolve) => {
            authState.passwordResolve = resolve;
          });
        },
        onError: (err: Error) => {
          authState.status = 'error';
          authState.errorMessage = err.message;
          console.error(`[TelegramUserbot] Auth error: ${err.message}`);
        },
      });

      // Auth succeeded!
      authState.status = 'connected';
      authState.connectedAt = new Date().toISOString();
      console.log(`[TelegramUserbot] ✅ Connected as ${phone}`);

      // Save session
      const sessionStr = client.session.save() as unknown as string;
      await saveSetting('telegramSession', String(sessionStr));

      // Start monitoring
      await refreshChannels();
      beginMonitoring(client);
    } catch (err) {
      authState.status = 'error';
      authState.errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[TelegramUserbot] Auth failed: ${authState.errorMessage}`);
    }
  })();

  return { status: 'connecting', message: 'Connecting to Telegram...' };
}

export function submitCode(code: string): { status: string; message: string } {
  if (authState.status !== 'waiting_code') {
    return { status: authState.status, message: `Not waiting for code. Current: ${authState.status}` };
  }
  if (authState.codeResolve) {
    authState.codeResolve(code);
    authState.codeResolve = null;
    return { status: 'verifying', message: 'Code submitted, verifying...' };
  }
  return { status: 'error', message: 'No pending code request' };
}

export function submitPassword(password: string): { status: string; message: string } {
  if (authState.status !== 'waiting_password') {
    return { status: authState.status, message: `Not waiting for password. Current: ${authState.status}` };
  }
  if (authState.passwordResolve) {
    authState.passwordResolve(password);
    authState.passwordResolve = null;
    return { status: 'verifying', message: 'Password submitted, verifying...' };
  }
  return { status: 'error', message: 'No pending password request' };
}

// Check if an error is a session-revoked error
function isSessionRevokedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes('AUTH_KEY_UNREGISTERED') || msg.includes('SESSION_REVOKED') || msg.includes('USER_DEACTIVATED');
}

// Internal reset function - clears all state
function resetState(): void {
  authState = {
    status: 'idle',
    client: null,
    codeResolve: null,
    passwordResolve: null,
    errorMessage: null,
    apiId: null,
    apiHash: null,
    phone: null,
    connectedAt: null,
  };
  sessionRevoked = false;

  if (channelRefreshTimer) {
    clearInterval(channelRefreshTimer);
    channelRefreshTimer = null;
  }
}

// Handle a revoked session - mark as error and clean up
async function handleSessionRevoked(reason: string): Promise<void> {
  console.error(`[TelegramUserbot] 🚫 Session revoked: ${reason}`);
  sessionRevoked = true;
  authState.status = 'error';
  authState.errorMessage = `Session revoked: ${reason}. Please disconnect and re-authenticate.`;

  // Disconnect the client
  if (authState.client) {
    try {
      await authState.client.disconnect();
    } catch {
      // ignore
    }
  }

  // Clear the invalid session from DB
  await saveSetting('telegramSession', '');

  // Reset client reference but keep error state visible
  authState.client = null;

  if (channelRefreshTimer) {
    clearInterval(channelRefreshTimer);
    channelRefreshTimer = null;
  }
}

export async function disconnect(): Promise<{ status: string; message: string }> {
  if (authState.client) {
    try {
      await authState.client.disconnect();
    } catch {
      // ignore
    }
  }

  await saveSetting('telegramSession', '');
  resetState();

  console.log('[TelegramUserbot] 🔌 Disconnected');
  return { status: 'idle', message: 'Disconnected successfully' };
}

export function getStatus(): UserbotStatus {
  const monitoredChannelStatuses: MonitoredChannelStatus[] = channels.map((ch) => {
    const channelId = ch.channelId.replace(/^@/, '');
    const reachability = channelReachability.get(ch.channelId) || channelReachability.get(channelId);
    const msgStats = channelMessageStats.get(ch.channelId) || channelMessageStats.get(channelId) || channelMessageStats.get(`@${channelId}`);
    return {
      id: ch.id,
      name: ch.name,
      channelId: ch.channelId,
      isActive: ch.isActive,
      isReachable: reachability?.reachable ?? null,
      lastTestedAt: reachability?.testedAt ?? null,
      lastMessageAt: msgStats?.lastMessageAt ?? ch.lastMessageId ?? null,
      messageCount: msgStats?.count ?? 0,
    };
  });

  return {
    auth: authState.status,
    phone: authState.phone,
    connectedAt: authState.connectedAt,
    errorMessage: sessionRevoked ? 'Session revoked by Telegram. Please disconnect and re-authenticate.' : authState.errorMessage,
    channels: channels.filter((c) => c.isActive).length,
    lastPoll: lastPollTimestamp,
    monitoredChannels: monitoredChannelStatuses,
    messagesReceived: totalMessagesReceived,
    lastMessageAt: lastMessageTimestamp,
    lastMessageFrom: lastMessageFromChannel,
  };
}

export async function getDialogs(): Promise<TelegramDialog[]> {
  if (!authState.client || authState.status !== 'connected') return [];

  try {
    const dialogs = await authState.client.getDialogs({});
    const result: TelegramDialog[] = [];

    for (const dialog of dialogs) {
      const entity = dialog.entity;
      if (!entity) continue;

      if (entity instanceof Api.Channel || entity instanceof Api.Chat) {
        result.push({
          id: String(entity.id),
          name: entity.title || '',
          username: entity instanceof Api.Channel ? entity.username || null : null,
          type: entity instanceof Api.Channel ? 'channel' : 'group',
        });
      }
    }

    return result;
  } catch (err) {
    console.error('[TelegramUserbot] Failed to get dialogs:', err);
    return [];
  }
}

export async function startMonitoring(): Promise<{ status: string; channels: number }> {
  if (authState.status !== 'connected' || !authState.client) {
    throw new Error('Not connected');
  }
  await refreshChannels();
  console.log('[TelegramUserbot] 📡 Monitoring restarted');
  return { status: 'monitoring', channels: channels.filter((c) => c.isActive).length };
}

// ─── Connection & Channel Testing ────────────────────────────

export async function testConnection(): Promise<TestConnectionResult> {
  if (!authState.client || authState.status !== 'connected') {
    return { connected: false, phone: null, selfUser: null, error: 'Not connected' };
  }

  try {
    // Try to get self user info - this proves the session is alive
    const self = await authState.client.getMe();
    const selfUser = self
      ? `${(self as Api.User).firstName || ''}${(self as Api.User).lastName ? ' ' + (self as Api.User).lastName : ''}`.trim() || (self as Api.User).username || null
      : null;
    return { connected: true, phone: authState.phone, selfUser, error: null };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error('[TelegramUserbot] Connection test failed:', errMsg);

    // Auto-detect revoked session
    if (isSessionRevokedError(err)) {
      await handleSessionRevoked(errMsg);
      return { connected: false, phone: authState.phone, selfUser: null, error: `Session revoked by Telegram. Please disconnect and re-authenticate.` };
    }

    return { connected: false, phone: authState.phone, selfUser: null, error: errMsg };
  }
}

export async function testChannel(channelId: string): Promise<TestChannelResult> {
  if (!authState.client || authState.status !== 'connected') {
    return { channelId, reachable: false, channelTitle: null, recentMessages: [], error: 'Not connected to Telegram' };
  }

  try {
    // Resolve the entity (channel/group) by username or ID
    let entity: Api.TypeEntity;
    const cleanId = channelId.replace(/^@/, '');

    // Try numeric ID first
    if (/^\d+$/.test(cleanId)) {
      try {
        entity = await authState.client.getEntity(BigInt(cleanId));
      } catch {
        // Try as channel entity with -100 prefix
        entity = await authState.client.getEntity(BigInt(`-100${cleanId}`));
      }
    } else {
      // Username-based lookup
      entity = await authState.client.getEntity(channelId.startsWith('@') ? channelId : `@${channelId}`);
    }

    // Get channel title
    let channelTitle: string | null = null;
    try {
      if (Api && entity instanceof Api.Channel) {
        channelTitle = entity.title || entity.username || null;
      } else if (Api && entity instanceof Api.Chat) {
        channelTitle = entity.title || null;
      } else if (entity && typeof entity === 'object' && 'title' in entity) {
        channelTitle = String((entity as { title: string }).title) || null;
      } else if (entity && typeof entity === 'object' && 'username' in entity) {
        channelTitle = String((entity as { username: string }).username) || null;
      }
    } catch {
      // fallback - try to extract title from any object
      if (entity && typeof entity === 'object' && 'title' in entity) {
        channelTitle = String((entity as { title: string }).title) || null;
      }
    }

    // Try to fetch recent messages from this channel
    const recentMessages: TestChannelResult['recentMessages'] = [];
    try {
      const messages = await authState.client.getMessages(entity, { limit: 5 });
      if (messages && Array.isArray(messages)) {
        for (const msg of messages) {
          if (msg && 'text' in msg && msg.text) {
            recentMessages.push({
              id: msg.id,
              text: typeof msg.text === 'string' ? msg.text.substring(0, 200) : JSON.stringify(msg.text).substring(0, 200),
              date: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
              fromId: msg.fromId ? String(msg.fromId) : null,
            });
          }
        }
      }
    } catch (msgErr) {
      console.warn('[TelegramUserbot] Could not fetch messages from channel:', msgErr);
    }

    // Update reachability cache
    const now = new Date().toISOString();
    channelReachability.set(channelId, { reachable: true, testedAt: now, title: channelTitle });
    if (channelId.startsWith('@')) {
      channelReachability.set(channelId.replace(/^@/, ''), { reachable: true, testedAt: now, title: channelTitle });
    } else {
      channelReachability.set(`@${channelId}`, { reachable: true, testedAt: now, title: channelTitle });
    }

    console.log(`[TelegramUserbot] ✅ Channel test OK: ${channelId} (${channelTitle})`);
    return { channelId, reachable: true, channelTitle, recentMessages, error: null };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);

    // Auto-detect revoked session
    if (isSessionRevokedError(err)) {
      await handleSessionRevoked(errMsg);
      return { channelId, reachable: false, channelTitle: null, recentMessages: [], error: 'Session revoked by Telegram. Please disconnect and re-authenticate.' };
    }

    // Update reachability cache
    const now = new Date().toISOString();
    channelReachability.set(channelId, { reachable: false, testedAt: now, title: null });

    console.error(`[TelegramUserbot] ❌ Channel test FAILED: ${channelId} - ${errMsg}`);
    return { channelId, reachable: false, channelTitle: null, recentMessages: [], error: errMsg };
  }
}

// ─── Saved Credentials Access ──────────────────────────────

export async function getSavedCredentials(): Promise<{
  apiId: string | null;
  apiHash: string | null;
  phone: string | null;
}> {
  const [apiIdStr, apiHashStr, phone] = await Promise.all([
    loadSetting('telegramApiId'),
    loadSetting('telegramApiHash'),
    loadSetting('telegramPhone'),
  ]);
  return { apiId: apiIdStr, apiHash: apiHashStr, phone };
}

// ─── Auto-Connect on Module Load ────────────────────────────

export async function initializeUserbot(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  const [sessionStr, apiIdStr, apiHashStr, phone] = await Promise.all([
    loadSetting('telegramSession'),
    loadSetting('telegramApiId'),
    loadSetting('telegramApiHash'),
    loadSetting('telegramPhone'),
  ]);

  if (!sessionStr || !apiIdStr || !apiHashStr) {
    console.log('[TelegramUserbot] No saved session, waiting for UI configuration');
    return;
  }

  const apiId = parseInt(apiIdStr, 10);
  if (isNaN(apiId)) return;

  console.log(`[TelegramUserbot] 🔑 Found saved session, reconnecting as ${phone || 'unknown'}...`);

  try {
    const session = new StringSession(sessionStr);
    const client = new TelegramClient(session, apiId, apiHashStr, {
      connectionRetries: 5,
      retryDelay: 3000,
      autoReconnect: true,
    });

    await client.connect();

    if (client.connected) {
      // Verify the session is actually valid by calling getMe()
      try {
        await client.getMe();
      } catch (verifyErr) {
        if (isSessionRevokedError(verifyErr)) {
          console.error('[TelegramUserbot] 🚫 Saved session is revoked, clearing...');
          await saveSetting('telegramSession', '');
          try { await client.disconnect(); } catch { /* ignore */ }
          authState.status = 'error';
          authState.errorMessage = 'Previous session was revoked. Please re-authenticate.';
          authState.apiId = apiId;
          authState.apiHash = apiHashStr;
          authState.phone = phone;
          return;
        }
        // Other errors during verification - still try to continue
        console.warn('[TelegramUserbot] Session verification warning:', verifyErr);
      }

      authState.status = 'connected';
      authState.client = client;
      authState.apiId = apiId;
      authState.apiHash = apiHashStr;
      authState.phone = phone;
      authState.connectedAt = new Date().toISOString();
      console.log(`[TelegramUserbot] ✅ Auto-connected as ${phone}`);

      await refreshChannels();
      beginMonitoring(client);

      // Periodic channel refresh
      channelRefreshTimer = setInterval(() => {
        if (authState.status === 'connected') refreshChannels();
      }, 60_000);
    } else {
      await saveSetting('telegramSession', '');
    }
  } catch (err) {
    console.error('[TelegramUserbot] Auto-connect failed:', err);
    if (isSessionRevokedError(err)) {
      await handleSessionRevoked(err instanceof Error ? err.message : String(err));
    } else {
      await saveSetting('telegramSession', '');
    }
  }
}

// Auto-initialize on first import
initializeUserbot().catch(console.error);
