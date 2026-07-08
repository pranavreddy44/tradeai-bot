// ============================================================
// Telegram MTProto Userbot Listener Service
// Uses GramJS to read messages from ANY channel the user
// is subscribed to (public or private) — no bot needed!
// ============================================================

import { TelegramClient, Api, Logger } from "telegram";
import { StringSession } from "telegram/sessions";
import { NewMessage } from "telegram/events";
import { ConnectionTCPObfuscated } from "telegram/network";

const PORT = 3002;
const MAIN_APP_BASE = "http://localhost:3000";

// ─── Types ──────────────────────────────────────────────────

interface Channel {
  id: string;
  name: string;
  channelId: string;
  isActive: boolean;
  lastMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

type AuthStatus =
  | "idle"
  | "connecting"
  | "waiting_code"
  | "waiting_password"
  | "connected"
  | "error";

interface AuthState {
  status: AuthStatus;
  client: TelegramClient | null;
  codeResolve: ((code: string) => void) | null;
  passwordResolve: ((password: string) => void) | null;
  errorMessage: string | null;
  apiId: number | null;
  apiHash: string | null;
  phone: string | null;
  connectedAt: string | null;
}

interface HealthResponse {
  status: "ok" | "degraded" | "error" | "not_configured";
  auth: AuthStatus;
  phone: string | null;
  channels: number;
  lastPoll: string | null;
  uptime: number;
  mode: "userbot";
}

// ─── State ──────────────────────────────────────────────────

let authState: AuthState = {
  status: "idle",
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
let isShuttingDown = false;
const startTime = Date.now();
let channelRefreshTimer: ReturnType<typeof setInterval> | null = null;

// Message tracking (mirrors userbot.ts)
let totalMessagesReceived = 0;
let lastMessageTimestamp: string | null = null;
let lastMessageFromChannel: string | null = null;

// Per-channel message tracking
const channelMessageStats: Map<string, { count: number; lastMessageAt: string }> = new Map();

// Channel reachability testing results
const channelReachability: Map<string, { reachable: boolean; testedAt: string; title: string | null }> = new Map();

function getReachabilityCache(channelId: string): { reachable: boolean; testedAt: string; title: string | null } | null {
  const stripped = channelId.replace(/^@/, "");
  return channelReachability.get(channelId)
    || channelReachability.get(stripped)
    || channelReachability.get(`@${stripped}`)
    || channelReachability.get(channelId.toLowerCase())
    || channelReachability.get(stripped.toLowerCase())
    || null;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

// Track if session was revoked
let sessionRevoked = false;

// ─── Logging ────────────────────────────────────────────────

function getISTTimestamp(): string {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(
    now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000
  );
  return istTime.toISOString().replace("Z", "+05:30");
}

function log(
  level: "INFO" | "WARN" | "ERROR" | "DEBUG",
  message: string,
  data?: unknown
) {
  const timestamp = getISTTimestamp();
  const prefix = `[${timestamp}] [${level}]`;
  if (data !== undefined) {
    console.log(
      prefix,
      message,
      typeof data === "object" ? JSON.stringify(data) : data
    );
  } else {
    console.log(prefix, message);
  }
}

// ─── Settings Helpers ───────────────────────────────────────

async function saveSetting(key: string, value: string): Promise<void> {
  try {
    await fetch(`${MAIN_APP_BASE}/api/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { [key]: value } }),
    });
  } catch (e) {
    log("WARN", `Failed to save setting ${key}`, {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

async function loadSetting(key: string): Promise<string | null> {
  try {
    const res = await fetch(`${MAIN_APP_BASE}/api/settings?key=${key}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { value?: string };
      return data.value || null;
    }
  } catch {
    // ignore
  }
  return null;
}

// ─── Channel Management ─────────────────────────────────────

async function refreshChannels(): Promise<void> {
  try {
    const res = await fetch(`${MAIN_APP_BASE}/api/channels`, {
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as { channels: Channel[] };
      channels = data.channels || [];
      const newSet = new Set<string>();
      for (const ch of channels) {
        if (!ch.isActive) continue;
        newSet.add(ch.channelId);
        const stripped = ch.channelId.replace(/^@/, "");
        newSet.add(stripped);
        if (!ch.channelId.startsWith("@")) newSet.add(`@${ch.channelId}`);
        newSet.add(ch.channelId.toLowerCase());
        newSet.add(stripped.toLowerCase());
      }
      monitoredChannelIds = newSet;
      log(
        "INFO",
        `Refreshed channels: ${channels.filter((c) => c.isActive).length} active / ${channels.length} total`
      );
    }
  } catch (e) {
    log("WARN", "Failed to refresh channels", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

// ─── Message Monitoring ─────────────────────────────────────

function startMonitoring(client: TelegramClient): void {
  client.addEventHandler(async (event: NewMessage) => {
    if (isShuttingDown) return;

    const message = event.message as Api.Message;
    const text = message.text || message.message || "";
    const hasMedia = Boolean((message as any).photo || (message as any).media);
    if (!text.trim() && !hasMedia) return;

    lastPollTimestamp = getISTTimestamp();

    // Get channel/chat info
    let chatIdStr = "";
    let chatUsername = "";

    try {
      const peerId = message.peerId;
      if (peerId && "channelId" in peerId) {
        chatIdStr = String(
          (peerId as Api.PeerChannel).channelId
        );
      } else if (peerId && "chatId" in peerId) {
        chatIdStr = String((peerId as Api.PeerChat).chatId);
      }

      // Try to get entity for username
      if (message.peerId) {
        try {
          const entity = await client.getEntity(message.peerId);
          if (entity && "username" in entity && entity.username) {
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

    if (!isMonitored) {
      log("DEBUG", `Skipping message from unmonitored: ${chatUsername || chatIdStr}`);
      return;
    }

    const displayId = chatUsername ? `@${chatUsername}` : chatIdStr;
    log(
      "INFO",
      `📥 Message from ${displayId}: ${text ? text.substring(0, 100) : "[image/media]"}${text.length > 100 ? "..." : ""}`
    );

    // Update message tracking
    totalMessagesReceived++;
    lastMessageTimestamp = getISTTimestamp();
    lastMessageFromChannel = displayId;
    const channelKey = chatUsername || chatIdStr;
    const existing = channelMessageStats.get(channelKey) || { count: 0, lastMessageAt: "" };
    channelMessageStats.set(channelKey, {
      count: existing.count + 1,
      lastMessageAt: lastMessageTimestamp,
    });

    if (hasMedia) {
      try {
        log("INFO", `📥 Downloading image/media from ${displayId} for VLM analysis`);
        const downloadResult = await client.downloadMedia(message, {
          outputFile: undefined,
        });

        let imageBuffer: Buffer | null = null;
        if (downloadResult instanceof Buffer) {
          imageBuffer = downloadResult;
        } else if (downloadResult instanceof Uint8Array) {
          imageBuffer = Buffer.from(downloadResult);
        } else if (typeof downloadResult === "string") {
          const fs = await import("node:fs");
          imageBuffer = fs.readFileSync(downloadResult);
        }

        if (imageBuffer) {
          const imageRes = await fetch(`${MAIN_APP_BASE}/api/telegram/userbot`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "test-image-signal",
              base64Image: imageBuffer.toString("base64"),
              mimeType: "image/jpeg",
              channelId: chatIdStr || chatUsername,
              caption: text || "",
              date: message.date ? new Date(message.date * 1000).toISOString() : new Date().toISOString(),
              createSignals: true,
            }),
          });
          const imageResult = await imageRes.json() as {
            extractedText?: string;
            imageType?: string;
            chartAnalysis?: unknown;
            hasValidSignals?: boolean;
            signals?: unknown[];
            createdSignals?: unknown[];
          };

          if (imageResult.hasValidSignals && imageResult.signals?.length) {
            if (imageResult.createdSignals?.length) {
              log("INFO", `✅ Image signal from ${displayId} created directly by main app`);
              return;
            }

            const imageSignalText = [
              `[Image signal from ${displayId}]`,
              imageResult.imageType ? `Image type: ${imageResult.imageType}` : "",
              text ? `Caption: ${text}` : "",
              imageResult.chartAnalysis ? `Chart analysis: ${JSON.stringify(imageResult.chartAnalysis)}` : "",
              imageResult.extractedText ? `Extracted text: ${imageResult.extractedText}` : "",
              `Signals: ${JSON.stringify(imageResult.signals)}`,
            ].filter(Boolean).join("\n");

            await fetch(`${MAIN_APP_BASE}/api/ai/telegram-analyze`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                message: imageSignalText,
                channelId: chatIdStr || chatUsername,
              }),
            });
            log("INFO", `✅ Forwarded image signal from ${displayId} for AI analysis`);
          } else {
            log("INFO", `📷 Image from ${displayId} did not contain a valid trading signal`);
          }
        } else {
          log("WARN", `Image/media download returned no buffer for ${displayId}`);
        }
      } catch (e) {
        log("ERROR", `Failed to process image/media from ${displayId}`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (text.trim()) {
      // Forward to main app for AI analysis
      try {
        await fetch(`${MAIN_APP_BASE}/api/ai/telegram-analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            channelId: chatIdStr || chatUsername,
            messageAt: message.date ? new Date(message.date * 1000).toISOString() : null,
          }),
        });
        log("INFO", `✅ Forwarded message from ${displayId} for AI analysis`);
      } catch (e) {
        log("ERROR", `Failed to forward message from ${displayId}`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }, new NewMessage({}));

  log("INFO", "📡 Message monitoring started");
}

// ─── Authentication ─────────────────────────────────────────

async function startAuth(
  apiId: number,
  apiHash: string,
  phone: string
): Promise<{ status: string; message: string }> {
  if (authState.status === "connected" || authState.status === "connecting") {
    return {
      status: authState.status,
      message: `Already in ${authState.status} state`,
    };
  }

  // Reset session revoked flag on new auth attempt
  sessionRevoked = false;

  authState.apiId = apiId;
  authState.apiHash = apiHash;
  authState.phone = phone;
  authState.errorMessage = null;
  authState.status = "connecting";

  // Run auth in background
  ;(async () => {
    try {
      const session = new StringSession("");
      const client = new TelegramClient(session, apiId, apiHash, {
        connection: ConnectionTCPObfuscated,
        connectionRetries: 100,
        retryDelay: 3000,
        autoReconnect: true,
        timeout: 30000,
        baseLogger: new Logger("debug"),
      });

      authState.client = client;

      await client.start({
        phoneNumber: async () => phone,
        phoneCode: async () => {
          authState.status = "waiting_code";
          log("INFO", `📱 Waiting for verification code for ${phone}`);
          return new Promise<string>((resolve) => {
            authState.codeResolve = resolve;
          });
        },
        password: async () => {
          authState.status = "waiting_password";
          log("INFO", "🔐 Waiting for 2FA password");
          return new Promise<string>((resolve) => {
            authState.passwordResolve = resolve;
          });
        },
        onError: (err: Error) => {
          authState.status = "error";
          authState.errorMessage = err.message;
          log("ERROR", `Auth error: ${err.message}`);
        },
      });

      // Auth succeeded!
      authState.status = "connected";
      authState.connectedAt = getISTTimestamp();
      log("INFO", `✅ Telegram userbot connected as ${phone}`);

      // Save session and credentials
      const sessionStr = client.session.save() as unknown as string;
      await saveSetting("telegramSession", String(sessionStr));
      await saveSetting("telegramApiId", String(apiId));
      await saveSetting("telegramApiHash", apiHash);
      await saveSetting("telegramPhone", phone);
      log("INFO", "💾 Session saved to main app settings");

      // Load channels and start monitoring
      await refreshChannels();
      startMonitoring(client);
    } catch (err) {
      authState.status = "error";
      authState.errorMessage = err instanceof Error ? err.message : String(err);
      log("ERROR", `Auth failed: ${authState.errorMessage}`);
    }
  })();

  return { status: "connecting", message: "Connecting to Telegram..." };
}

function submitCode(code: string): { status: string; message: string } {
  if (authState.status !== "waiting_code") {
    return {
      status: authState.status,
      message: `Not waiting for code. Current state: ${authState.status}`,
    };
  }

  if (authState.codeResolve) {
    authState.codeResolve(code);
    authState.codeResolve = null;
    return { status: "verifying", message: "Code submitted, verifying..." };
  }

  return { status: "error", message: "No pending code request" };
}

function submitPassword(
  password: string
): { status: string; message: string } {
  if (authState.status !== "waiting_password") {
    return {
      status: authState.status,
      message: `Not waiting for password. Current state: ${authState.status}`,
    };
  }

  if (authState.passwordResolve) {
    authState.passwordResolve(password);
    authState.passwordResolve = null;
    return { status: "verifying", message: "Password submitted, verifying..." };
  }

  return { status: "error", message: "No pending password request" };
}

async function disconnect(): Promise<{ status: string; message: string }> {
  if (authState.client) {
    try {
      await authState.client.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }

  // Clear saved session
  await saveSetting("telegramSession", "");

  authState = {
    status: "idle",
    client: null,
    codeResolve: null,
    passwordResolve: null,
    errorMessage: null,
    apiId: null,
    apiHash: null,
    phone: null,
    connectedAt: null,
  };

  // Reset message tracking
  totalMessagesReceived = 0;
  lastMessageTimestamp = null;
  lastMessageFromChannel = null;
  channelMessageStats.clear();
  channelReachability.clear();
  sessionRevoked = false;

  log("INFO", "🔌 Disconnected and session cleared");
  return { status: "idle", message: "Disconnected successfully" };
}

// ─── Session Revoked Detection ──────────────────────────────

function isSessionRevokedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("AUTH_KEY_UNREGISTERED") || msg.includes("SESSION_REVOKED") || msg.includes("USER_DEACTIVATED");
}

async function handleSessionRevoked(reason: string): Promise<void> {
  log("ERROR", `🚫 Session revoked: ${reason}`);
  sessionRevoked = true;
  authState.status = "error";
  authState.errorMessage = `Session revoked: ${reason}. Please disconnect and re-authenticate.`;

  if (authState.client) {
    try {
      await authState.client.disconnect();
    } catch {
      // ignore
    }
  }

  // Clear the invalid session from DB
  await saveSetting("telegramSession", "");
  authState.client = null;
}

// ─── Auto-connect on startup ────────────────────────────────

async function tryAutoConnect(): Promise<void> {
  const [sessionStr, apiIdStr, apiHashStr, phone] = await Promise.all([
    loadSetting("telegramSession"),
    loadSetting("telegramApiId"),
    loadSetting("telegramApiHash"),
    loadSetting("telegramPhone"),
  ]);

  if (!sessionStr || !apiIdStr || !apiHashStr) {
    log("INFO", "No saved Telegram session found. Please configure via UI.");
    return;
  }

  const apiId = parseInt(apiIdStr, 10);
  if (isNaN(apiId)) {
    log("ERROR", "Invalid saved apiId");
    return;
  }

  log("INFO", `🔑 Found saved session, reconnecting as ${phone || "unknown"}...`);

  try {
    const session = new StringSession(sessionStr);
    const client = new TelegramClient(session, apiId, apiHashStr, {
      connection: ConnectionTCPObfuscated,
      connectionRetries: 100,
      retryDelay: 3000,
      autoReconnect: true,
      timeout: 30000,
      baseLogger: new Logger("debug"),
    });

    await client.connect();

    if (client.connected) {
      // Verify the session is actually valid by calling getMe()
      try {
        await client.getMe();
      } catch (verifyErr) {
        if (isSessionRevokedError(verifyErr)) {
          log("ERROR", "🚫 Saved session is revoked, clearing...");
          await saveSetting("telegramSession", "");
          try { await client.disconnect(); } catch { /* ignore */ }
          authState.status = "error";
          authState.errorMessage = "Previous session was revoked. Please re-authenticate.";
          authState.apiId = apiId;
          authState.apiHash = apiHashStr;
          authState.phone = phone;
          return;
        }
        log("WARN", "Session verification warning: " + (verifyErr instanceof Error ? verifyErr.message : String(verifyErr)));
      }

      authState.status = "connected";
      authState.client = client;
      authState.apiId = apiId;
      authState.apiHash = apiHashStr;
      authState.phone = phone;
      authState.connectedAt = getISTTimestamp();
      log("INFO", `✅ Auto-connected to Telegram as ${phone}`);

      await refreshChannels();
      startMonitoring(client);
    } else {
      log("WARN", "Saved session didn't connect immediately. Retrying in 15 seconds...");
      authState.status = "error";
      authState.errorMessage = "Saved session didn't connect. Retrying...";
      setTimeout(tryAutoConnect, 15000);
    }
  } catch (err) {
    log("ERROR", `Auto-connect failed: ${err instanceof Error ? err.message : String(err)}`);
    if (isSessionRevokedError(err)) {
      await handleSessionRevoked(err instanceof Error ? err.message : String(err));
    } else {
      log("INFO", "Network or server connection failed. Retrying in 15 seconds...");
      authState.status = "error";
      authState.errorMessage = err instanceof Error ? err.message : String(err);
      setTimeout(tryAutoConnect, 15000);
    }
  }
}

// ─── Get Dialogs ────────────────────────────────────────────

async function getDialogs(): Promise<
  { id: string; name: string; username: string | null; type: string }[]
> {
  if (!authState.client || authState.status !== "connected") {
    return [];
  }

  try {
    const dialogs = await authState.client.getDialogs({});
    const result: {
      id: string;
      name: string;
      username: string | null;
      type: string;
    }[] = [];

    for (const dialog of dialogs) {
      const entity = dialog.entity;
      if (!entity) continue;

      // Only include channels and groups (not private chats)
      if (
        entity instanceof Api.Channel ||
        entity instanceof Api.Chat
      ) {
        const id =
          entity instanceof Api.Channel
            ? String(entity.id)
            : String(entity.id);
        const name =
          entity instanceof Api.Channel
            ? entity.title || ""
            : entity instanceof Api.Chat
              ? entity.title || ""
              : "";
        const username =
          entity instanceof Api.Channel ? entity.username || null : null;

        result.push({
          id,
          name,
          username,
          type: entity instanceof Api.Channel ? "channel" : "group",
        });
      }
    }

    return result;
  } catch (err) {
    log("ERROR", `Failed to get dialogs: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

// ─── HTTP Server ────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // ─── Health Check ───────────────────────────────────
      if (url.pathname === "/health") {
        const health: HealthResponse = {
          status:
            authState.status === "connected"
              ? "ok"
              : authState.status === "idle"
                ? "not_configured"
                : "degraded",
          auth: authState.status,
          phone: authState.phone,
          channels: channels.filter((c) => c.isActive).length,
          lastPoll: lastPollTimestamp,
          uptime: Math.floor((Date.now() - startTime) / 1000),
          mode: "userbot",
        };
        return new Response(JSON.stringify(health, null, 2), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ─── Status ─────────────────────────────────────────
      if (url.pathname === "/status") {
        // Build monitored channels with reachability info
        const monitoredChannels = channels.map((ch) => {
          const channelId = ch.channelId.replace(/^@/, "");
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

        return new Response(
          JSON.stringify({
            auth: authState.status,
            phone: authState.phone,
            connectedAt: authState.connectedAt,
            errorMessage: sessionRevoked ? "Session revoked by Telegram. Please disconnect and re-authenticate." : authState.errorMessage,
            channels: channels.filter((c) => c.isActive).length,
            lastPoll: lastPollTimestamp,
            monitoredChannels,
            messagesReceived: totalMessagesReceived,
            lastMessageAt: lastMessageTimestamp,
            lastMessageFrom: lastMessageFromChannel,
          }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // ─── Auth: Start ────────────────────────────────────
      if (url.pathname === "/auth/start" && req.method === "POST") {
        const body = (await req.json()) as {
          apiId?: number | string;
          apiHash?: string;
          phone?: string;
        };

        if (!body.apiId || !body.apiHash || !body.phone) {
          return new Response(
            JSON.stringify({
              error: "apiId, apiHash, and phone are required",
            }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        const apiId =
          typeof body.apiId === "string"
            ? parseInt(body.apiId, 10)
            : body.apiId;

        // Save credentials immediately
        await saveSetting("telegramApiId", String(apiId));
        await saveSetting("telegramApiHash", body.apiHash);
        await saveSetting("telegramPhone", body.phone);

        const result = await startAuth(apiId, body.apiHash, body.phone);
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ─── Auth: Submit Code ──────────────────────────────
      if (url.pathname === "/auth/code" && req.method === "POST") {
        const body = (await req.json()) as { code?: string };

        if (!body.code) {
          return new Response(
            JSON.stringify({ error: "code is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        const result = submitCode(body.code);
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ─── Auth: Submit 2FA Password ──────────────────────
      if (url.pathname === "/auth/2fa" && req.method === "POST") {
        const body = (await req.json()) as { password?: string };

        if (!body.password) {
          return new Response(
            JSON.stringify({ error: "password is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        const result = submitPassword(body.password);
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ─── Auth: Disconnect ───────────────────────────────
      if (url.pathname === "/auth/disconnect" && req.method === "POST") {
        const result = await disconnect();
        return new Response(JSON.stringify(result), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ─── Get Dialogs (channels/groups) ──────────────────
      if (url.pathname === "/dialogs" && req.method === "GET") {
        const dialogs = await getDialogs();
        return new Response(JSON.stringify({ dialogs }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      // ─── Start Monitoring ───────────────────────────────
      if (url.pathname === "/start-monitoring" && req.method === "POST") {
        if (authState.status !== "connected" || !authState.client) {
          return new Response(
            JSON.stringify({ error: "Not connected. Authenticate first." }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        await refreshChannels();
        log("INFO", "📡 Monitoring restarted");
        return new Response(
          JSON.stringify({
            status: "monitoring",
            channels: channels.filter((c) => c.isActive).length,
          }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // ─── Test Connection ────────────────────────────────
      if (url.pathname === "/test-connection" && req.method === "POST") {
        if (!authState.client || authState.status !== "connected") {
          return new Response(
            JSON.stringify({ connected: false, phone: null, selfUser: null, error: "Not connected" }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        try {
          const self = await authState.client.getMe();
          const selfUser = self
            ? `${(self as Api.User).firstName || ""}${(self as Api.User).lastName ? " " + (self as Api.User).lastName : ""}`.trim() || (self as Api.User).username || null
            : null;
          return new Response(
            JSON.stringify({ connected: true, phone: authState.phone, selfUser, error: null }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          log("ERROR", `Connection test failed: ${errMsg}`);

          if (isSessionRevokedError(err)) {
            await handleSessionRevoked(errMsg);
            return new Response(
              JSON.stringify({ connected: false, phone: authState.phone, selfUser: null, error: "Session revoked by Telegram. Please disconnect and re-authenticate." }),
              {
                headers: { "Content-Type": "application/json", ...corsHeaders },
              }
            );
          }

          return new Response(
            JSON.stringify({ connected: false, phone: authState.phone, selfUser: null, error: errMsg }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
      }

      // ─── Test Channel ───────────────────────────────────
      if (url.pathname === "/test-channel" && req.method === "POST") {
        const body = (await req.json()) as { channelId?: string };

        if (!body.channelId) {
          return new Response(
            JSON.stringify({ error: "channelId is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        if (!authState.client || authState.status !== "connected") {
          return new Response(
            JSON.stringify({ channelId: body.channelId, reachable: false, channelTitle: null, recentMessages: [], error: "Not connected to Telegram" }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        try {
          let entity: Api.TypeEntity;
          const cleanId = body.channelId.replace(/^@/, "");

          if (/^\d+$/.test(cleanId)) {
            try {
              entity = await withTimeout(authState.client.getEntity(BigInt(cleanId)), 6000, `getEntity ${body.channelId}`);
            } catch {
              entity = await withTimeout(authState.client.getEntity(BigInt(`-100${cleanId}`)), 6000, `getEntity -100${body.channelId}`);
            }
          } else {
            entity = await withTimeout(
              authState.client.getEntity(body.channelId.startsWith("@") ? body.channelId : `@${body.channelId}`),
              6000,
              `getEntity ${body.channelId}`
            );
          }

          let channelTitle: string | null = null;
          try {
            if (entity instanceof Api.Channel) {
              channelTitle = entity.title || entity.username || null;
            } else if (entity instanceof Api.Chat) {
              channelTitle = entity.title || null;
            } else if (entity && typeof entity === "object" && "title" in entity) {
              channelTitle = String((entity as { title: string }).title) || null;
            } else if (entity && typeof entity === "object" && "username" in entity) {
              channelTitle = String((entity as { username: string }).username) || null;
            }
          } catch {
            if (entity && typeof entity === "object" && "title" in entity) {
              channelTitle = String((entity as { title: string }).title) || null;
            }
          }

          const recentMessages: Array<{
            id: number;
            text: string;
            date: string;
            fromId: string | null;
            hasMedia: boolean;
            mediaType: string | null;
            isPhoto: boolean;
          }> = [];
          try {
            const messages = await withTimeout(
              authState.client.getMessages(entity, { limit: 8 }),
              7000,
              `getMessages ${body.channelId}`
            );
            if (messages && Array.isArray(messages)) {
              for (const msg of messages) {
                const text = msg && "text" in msg && msg.text
                  ? (typeof msg.text === "string" ? msg.text : JSON.stringify(msg.text))
                  : "";
                const media = msg && "media" in msg ? msg.media : null;
                const mediaType = media
                  ? typeof media === "object" && "className" in media
                    ? String((media as { className?: string }).className || "")
                    : "media"
                  : null;
                const isPhoto = Boolean(mediaType?.toLowerCase().includes("photo"));

                if (msg && (text || media)) {
                  recentMessages.push({
                    id: msg.id,
                    text: text.substring(0, 1000),
                    date: msg.date ? new Date(msg.date * 1000).toISOString() : new Date().toISOString(),
                    fromId: msg.fromId ? String(msg.fromId) : null,
                    hasMedia: Boolean(media),
                    mediaType,
                    isPhoto,
                  });
                }
              }
            }
          } catch (msgErr) {
            log("WARN", `Could not fetch messages from channel: ${msgErr instanceof Error ? msgErr.message : String(msgErr)}`);
          }

          // Update reachability cache
          const now = getISTTimestamp();
          channelReachability.set(body.channelId, { reachable: true, testedAt: now, title: channelTitle });
          if (body.channelId.startsWith("@")) {
            channelReachability.set(body.channelId.replace(/^@/, ""), { reachable: true, testedAt: now, title: channelTitle });
          } else {
            channelReachability.set(`@${body.channelId}`, { reachable: true, testedAt: now, title: channelTitle });
          }

          log("INFO", `✅ Channel test OK: ${body.channelId} (${channelTitle})`);
          return new Response(
            JSON.stringify({ channelId: body.channelId, reachable: true, channelTitle, recentMessages, error: null }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);

          if (isSessionRevokedError(err)) {
            await handleSessionRevoked(errMsg);
            return new Response(
              JSON.stringify({ channelId: body.channelId, reachable: false, channelTitle: null, recentMessages: [], error: "Session revoked by Telegram. Please disconnect and re-authenticate." }),
              {
                headers: { "Content-Type": "application/json", ...corsHeaders },
              }
            );
          }

          const cached = getReachabilityCache(body.channelId);
          if (errMsg.includes("timed out") && cached?.reachable) {
            log("WARN", `Channel test timed out for ${body.channelId}; returning cached reachable status from ${cached.testedAt}`);
            return new Response(
              JSON.stringify({
                channelId: body.channelId,
                reachable: true,
                channelTitle: cached.title,
                recentMessages: [],
                warning: errMsg,
                cached: true,
                lastTestedAt: cached.testedAt,
                error: null,
              }),
              {
                headers: { "Content-Type": "application/json", ...corsHeaders },
              }
            );
          }

          const now = getISTTimestamp();
          channelReachability.set(body.channelId, { reachable: false, testedAt: now, title: null });

          log("ERROR", `❌ Channel test FAILED: ${body.channelId} - ${errMsg}`);
          return new Response(
            JSON.stringify({ channelId: body.channelId, reachable: false, channelTitle: null, recentMessages: [], error: errMsg }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
      }

      // ─── Latest Channel Image ────────────────────────────
      if (url.pathname === "/latest-image" && req.method === "POST") {
        const body = (await req.json()) as { channelId?: string };

        if (!body.channelId) {
          return new Response(
            JSON.stringify({ error: "channelId is required" }),
            {
              status: 400,
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        if (!authState.client || authState.status !== "connected") {
          return new Response(
            JSON.stringify({ channelId: body.channelId, found: false, error: "Not connected to Telegram" }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }

        try {
          let entity: any;
          const cleanId = body.channelId.replace(/^@/, "");

          if (/^\d+$/.test(cleanId)) {
            try {
              entity = await authState.client.getEntity(BigInt(cleanId) as any);
            } catch {
              entity = await authState.client.getEntity(BigInt(`-100${cleanId}`) as any);
            }
          } else {
            entity = await authState.client.getEntity(body.channelId.startsWith("@") ? body.channelId : `@${body.channelId}`);
          }

          const messages = await authState.client.getMessages(entity, { limit: 25 });
          const photoMessage = Array.isArray(messages)
            ? messages.find((msg) => Boolean(msg && ("photo" in msg ? msg.photo : null) || (msg && "media" in msg && msg.media)))
            : null;

          if (!photoMessage) {
            return new Response(
              JSON.stringify({ channelId: body.channelId, found: false, error: "No recent image found" }),
              {
                headers: { "Content-Type": "application/json", ...corsHeaders },
              }
            );
          }

          const downloadResult = await authState.client.downloadMedia(photoMessage as any, {
            outputFile: undefined,
          });

          if (!downloadResult) {
            return new Response(
              JSON.stringify({ channelId: body.channelId, found: false, error: "Image download failed" }),
              {
                headers: { "Content-Type": "application/json", ...corsHeaders },
              }
            );
          }

          let imageBuffer: Buffer;
          if (downloadResult instanceof Buffer) {
            imageBuffer = downloadResult;
          } else if (downloadResult instanceof Uint8Array) {
            imageBuffer = Buffer.from(downloadResult);
          } else if (typeof downloadResult === "string") {
            const fs = await import("node:fs");
            imageBuffer = fs.readFileSync(downloadResult);
          } else {
            return new Response(
              JSON.stringify({ channelId: body.channelId, found: false, error: `Unsupported download result: ${typeof downloadResult}` }),
              {
                headers: { "Content-Type": "application/json", ...corsHeaders },
              }
            );
          }

          const text = photoMessage && "text" in photoMessage && photoMessage.text
            ? (typeof photoMessage.text === "string" ? photoMessage.text : JSON.stringify(photoMessage.text))
            : "";

          return new Response(
            JSON.stringify({
              channelId: body.channelId,
              found: true,
              messageId: photoMessage.id,
              date: photoMessage.date ? new Date(photoMessage.date * 1000).toISOString() : new Date().toISOString(),
              caption: text,
              mimeType: "image/jpeg",
              sizeBytes: imageBuffer.length,
              base64Image: imageBuffer.toString("base64"),
              error: null,
            }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          log("ERROR", `❌ Latest image fetch FAILED: ${body.channelId} - ${errMsg}`);
          return new Response(
            JSON.stringify({ channelId: body.channelId, found: false, error: errMsg }),
            {
              headers: { "Content-Type": "application/json", ...corsHeaders },
            }
          );
        }
      }

      // ─── Saved Credentials ──────────────────────────────
      if (url.pathname === "/saved-credentials" && req.method === "GET") {
        const [apiIdStr, apiHashStr, phone] = await Promise.all([
          loadSetting("telegramApiId"),
          loadSetting("telegramApiHash"),
          loadSetting("telegramPhone"),
        ]);
        return new Response(
          JSON.stringify({ apiId: apiIdStr, apiHash: apiHashStr, phone }),
          {
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }

      // ─── 404 ────────────────────────────────────────────
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    } catch (err) {
      log("ERROR", `Request handler error: ${err instanceof Error ? err.message : String(err)}`);
      return new Response(
        JSON.stringify({ error: "Internal server error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
  },
});

log("INFO", "========================================");
log("INFO", "  Telegram MTProto Userbot Service");
log("INFO", `  Running on port ${PORT}`);
log("INFO", "========================================");

// Try auto-connect with saved session
setTimeout(() => {
  tryAutoConnect();
}, 2000);

// Periodic channel refresh
channelRefreshTimer = setInterval(() => {
  if (!isShuttingDown && authState.status === "connected") {
    refreshChannels();
  }
}, 60_000);

// Graceful shutdown
process.on("SIGINT", async () => {
  isShuttingDown = true;
  log("INFO", "Shutting down...");
  if (authState.client) {
    try {
      await authState.client.disconnect();
    } catch {
      // ignore
    }
  }
  if (channelRefreshTimer) clearInterval(channelRefreshTimer);
  process.exit(0);
});

process.on("SIGTERM", async () => {
  isShuttingDown = true;
  log("INFO", "Shutting down...");
  if (authState.client) {
    try {
      await authState.client.disconnect();
    } catch {
      // ignore
    }
  }
  if (channelRefreshTimer) clearInterval(channelRefreshTimer);
  process.exit(0);
});
