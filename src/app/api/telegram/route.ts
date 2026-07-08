// ============================================================
// Telegram Channel Management API
// GET: List channels, test-channel, service-status
// POST: add-channel, remove-channel, scan-messages, test-channel
// Now with rule-based fallback when AI is rate-limited
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { batchParseTelegramSignals, buildTrustedTelegramCandidate, ruleBasedBatchParseTelegramSignals, resetRateLimit, NSE_SYMBOLS, COMPANY_ALIASES, containsSymbol, containsAlias } from '@/lib/ai-engine';
import { inferTradeType, parseSourceTimestamp } from '@/lib/trade-classification';
import { evaluateTradeQuality, formatTradeQualityReason } from '@/lib/trade-quality';
import { getGrowwLivePrice } from '@/lib/broker/live-prices';
import { resolveInstrumentFromText } from '@/lib/market/instrument-resolver';
import { getSourceConfidenceMultiplier } from '@/lib/signals/source-performance';


const TELEGRAM_SERVICE_URL = 'http://localhost:3002';
const TELEGRAM_AI_SELECTION_PERCENT = 0.6;
const TELEGRAM_AI_MAX_MESSAGES = 60;

type ScoredTelegramMessage = {
  text: string;
  channelId: string;
  channelName: string;
  messageId: number | null;
  messageAt: string | null;
  qualityScore: number;
  scoreReasons: string[];
};

type TelegramScanParseResult = {
  messageIndex: number;
  isValid: boolean;
  signal?: {
    symbol: string;
    action: 'BUY' | 'SELL';
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
    confidence: number;
  };
  signals?: Array<{
    symbol: string;
    action: 'BUY' | 'SELL';
    entryPrice: number;
    targetPrice: number;
    stopLoss: number;
    confidence: number;
  }>;
  reasoning?: string;
};

function scoreTelegramMessage(text: string, messageAt?: string | null): { score: number; reasons: string[] } {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const upper = normalized.toUpperCase();
  const reasons: string[] = [];
  let score = 0;

  const add = (points: number, reason: string) => {
    score += points;
    reasons.push(reason);
  };

  if (/\b(BUY|SELL|SHORT|LONG|ACCUMULATE|EXIT)\b/.test(upper)) add(25, 'action');
  if (/\b(TARGET|TGT|TP)\b/.test(upper)) add(20, 'target');
  if (/\b(STOP.?LOSS|SL)\b/.test(upper)) add(20, 'stopLoss');
  if (/\b(ENTRY|ABOVE|BELOW|CMP|BREAKOUT|SUPPORT|RESISTANCE)\b/.test(upper)) add(15, 'entryOrLevel');
  if (/\b(NIFTY|BANKNIFTY|FINNIFTY|SENSEX|RELIANCE|TCS|INFY|HDFCBANK|ICICIBANK|SBIN|LT|MARUTI|TATAMOTORS|TATASTEEL|VEDL|ELECON|SAREGAMA)\b/.test(upper)) add(15, 'symbol');
  if (/\b(CE|PE|CALL|PUT|OPTION|FUT|FUTURE)\b/.test(upper)) add(10, 'derivative');

  const numericLevels = normalized.match(/(?:₹|Rs\.?\s*)?\b\d{2,6}(?:\.\d+)?\b/gi) || [];
  if (numericLevels.length >= 2) add(12, 'multiplePriceLevels');
  else if (numericLevels.length === 1) add(5, 'priceLevel');

  if (messageAt) {
    const ageMs = Date.now() - new Date(messageAt).getTime();
    if (!Number.isNaN(ageMs)) {
      if (ageMs <= 60 * 60 * 1000) add(12, 'freshUnder1h');
      else if (ageMs <= 6 * 60 * 60 * 1000) add(8, 'freshUnder6h');
      else if (ageMs <= 24 * 60 * 60 * 1000) add(4, 'freshUnder24h');
    }
  }

  if (/YOUTUBE|YOUTU\.BE|SUBSCRIBE|JOIN|COURSE|WEBINAR|THANK|RESULT|PROFIT BOOKED|SCREENSHOT/i.test(normalized)) {
    score -= 18;
    reasons.push('promoOrNonActionablePenalty');
  }
  if (normalized.length < 25) {
    score -= 10;
    reasons.push('tooShortPenalty');
  }
  if (normalized.length > 900) {
    score -= 8;
    reasons.push('tooLongPenalty');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

async function recoverTrustedTelegramResult(
  result: TelegramScanParseResult,
  msgInfo: ScoredTelegramMessage
): Promise<TelegramScanParseResult> {
  if (result.isValid && (result.signal || result.signals?.length)) return result;

  const resolvedInstrument = await resolveInstrumentFromText(msgInfo.text).catch(() => null);
  const preliminary = buildTrustedTelegramCandidate(msgInfo.text, null, resolvedInstrument?.symbol);
  const symbol = preliminary.signal?.symbol || resolvedInstrument?.symbol || null;
  const livePrice = symbol ? await getGrowwLivePrice(symbol) : null;

  const recovered = buildTrustedTelegramCandidate(msgInfo.text, livePrice, resolvedInstrument?.symbol);
  if (!recovered.isValid || !recovered.signal) return result;

  return {
    ...result,
    isValid: true,
    signal: recovered.signal,
    signals: [recovered.signal],
    reasoning: `${recovered.reasoning} ${resolvedInstrument ? `Resolved via Groww instruments (${resolvedInstrument.matchType}: ${resolvedInstrument.name}).` : ''} Recovered from AI rejection: ${result.reasoning || 'not provided'}`,
  };
}

// GET /api/telegram?action=channels
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'channels': {
        const channels = await db.telegramChannel.findMany({
          orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({ channels });
      }

      case 'service-status': {
        try {
          const res = await fetch(`${TELEGRAM_SERVICE_URL}/health`, {
            signal: AbortSignal.timeout(5000),
          });
          if (res.ok) {
            const data = await res.json();
            return NextResponse.json({
              online: true,
              auth: data.auth,
              phone: data.phone,
              channels: data.channels,
              lastPoll: data.lastPoll,
              uptime: data.uptime,
            });
          }
          return NextResponse.json({ online: false, auth: 'unknown' });
        } catch {
          return NextResponse.json({ online: false, auth: 'unknown' });
        }
      }

      default:
        return NextResponse.json({ error: 'Invalid action. Use: channels, service-status' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[TelegramAPI] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/telegram
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      // ─── Add Channel ─────────────────────────────────────
      case 'add-channel': {
        const { name, channelId } = body;
        if (!name || !channelId) {
          return NextResponse.json({ error: 'name and channelId are required' }, { status: 400 });
        }

        // Check duplicate
        const existing = await db.telegramChannel.findFirst({ where: { channelId } });
        if (existing) {
          return NextResponse.json({ error: 'Channel already exists' }, { status: 409 });
        }

        const channel = await db.telegramChannel.create({
          data: { name, channelId, isActive: true },
        });

        return NextResponse.json({ channel }, { status: 201 });
      }

      // ─── Remove Channel ──────────────────────────────────
      case 'remove-channel': {
        const { id } = body;
        if (!id) {
          return NextResponse.json({ error: 'Channel id is required' }, { status: 400 });
        }

        await db.telegramChannel.delete({ where: { id } });
        return NextResponse.json({ success: true });
      }

      // ─── Test Channel ────────────────────────────────────
      case 'test-channel': {
        const { channelId } = body;
        if (!channelId) {
          return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
        }

        try {
          const res = await fetch(`${TELEGRAM_SERVICE_URL}/test-channel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channelId }),
            signal: AbortSignal.timeout(15_000),
          });

          if (res.ok) {
            const data = await res.json();
            return NextResponse.json({
              channelId,
              reachable: data.reachable ?? false,
              channelTitle: data.channelTitle || null,
              messageCount: data.recentMessages?.length ?? 0,
              recentMessages: (data.recentMessages || []).slice(0, 3).map((m: any) => ({
                id: m.id,
                text: (m.text || '').substring(0, 200),
                date: m.date,
              })),
            });
          }

          return NextResponse.json({
            channelId,
            reachable: false,
            channelTitle: null,
            messageCount: 0,
            recentMessages: [],
            error: 'Telegram service returned error',
          });
        } catch (err: any) {
          return NextResponse.json({
            channelId,
            reachable: false,
            channelTitle: null,
            messageCount: 0,
            recentMessages: [],
            error: 'Telegram service unavailable',
          });
        }
      }

      // ─── Scan Messages (with AI + rule-based fallback) ───
      case 'scan-messages': {

        // Get all active channels
        const channels = await db.telegramChannel.findMany({
          where: { isActive: true },
        });

        if (channels.length === 0) {
          return NextResponse.json({
            scanned: 0,
            signals: [],
            message: 'No active Telegram channels configured',
          });
        }

        // Collect ALL messages from ALL channels first (no AI calls yet)
        const signals: any[] = [];
        const allMessages: ScoredTelegramMessage[] = [];
        const channelReports: Array<{
          channelId: string;
          channelName: string;
          reachable: boolean;
          channelTitle: string | null;
          messageCount: number;
          latestMessageId: number | null;
          latestMessageAt: string | null;
          sample: string | null;
          error: string | null;
        }> = [];
        let scannedCount = 0;
        let channelsWithMessages = 0;

        // Perform fetches in chunks to prevent proxy overload
        const scanResults: any[] = [];
        for (let i = 0; i < channels.length; i += 3) {
          const chunk = channels.slice(i, i + 3);
          const chunkPromises = chunk.map(async (channel) => {
            let testData: any = null;
            let imageData: any = null;
            let reachable = false;
            let testError: string | null = null;
            let imageError: string | null = null;

            // 1. Fetch messages
            try {
              const res = await fetch(`${TELEGRAM_SERVICE_URL}/test-channel`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelId: channel.channelId }),
                signal: AbortSignal.timeout(10_000), // Bounded 10s timeout
              });
              if (res.ok) {
                testData = await res.json();
                reachable = testData.reachable ?? false;
              } else {
                testError = `HTTP ${res.status}`;
              }
            } catch (err: any) {
              testError = err.message || 'Timeout/Network error';
            }

            // 2. Fetch latest image
            try {
              const res = await fetch(`${TELEGRAM_SERVICE_URL}/latest-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ channelId: channel.channelId }),
                signal: AbortSignal.timeout(10_000), // Bounded 10s timeout
              });
              if (res.ok) {
                imageData = await res.json();
              } else {
                imageError = `HTTP ${res.status}`;
              }
            } catch (err: any) {
              imageError = err.message || 'Timeout/Network error';
            }

            return {
              channel,
              testData,
              imageData,
              reachable,
              testError,
              imageError,
            };
          });
          const chunkResults = await Promise.all(chunkPromises);
          scanResults.push(...chunkResults);
          if (i + 3 < channels.length) {
            await new Promise((resolve) => setTimeout(resolve, 500)); // Rate limit pause
          }
        }

        // Process the fetched results in-memory
        for (const { channel, testData, imageData, reachable, testError, imageError } of scanResults) {
          if (testData) {
            scannedCount++;
            const messages = testData.recentMessages || testData.messages || [];
            const latestMessage = Array.isArray(messages) && messages.length > 0 ? messages[0] : null;

            channelReports.push({
              channelId: channel.channelId,
              channelName: channel.name,
              reachable,
              channelTitle: testData.channelTitle || null,
              messageCount: Array.isArray(messages) ? messages.length : 0,
              latestMessageId: latestMessage?.id ?? null,
              latestMessageAt: latestMessage?.date ?? null,
              sample: latestMessage ? (latestMessage.text || latestMessage.message || '').substring(0, 160) : null,
              error: testData.error || testError,
            });

            if (latestMessage?.date || latestMessage?.id) {
              await db.telegramChannel.update({
                where: { id: channel.id },
                data: { lastMessageId: latestMessage.date || String(latestMessage.id) },
              }).catch((e) => {
                console.error(`[TelegramAPI] Failed to update lastMessageId for ${channel.channelId}:`, e);
              });
            }

            if (Array.isArray(messages) && messages.length > 0) {
              channelsWithMessages++;
              for (const msg of messages) {
                const text = msg.text || msg.message || '';
                if (text.length >= 10) {
                  const scored = scoreTelegramMessage(text, msg.date || null);
                  allMessages.push({
                    text,
                    channelId: channel.channelId,
                    channelName: channel.name,
                    messageId: msg.id ?? null,
                    messageAt: msg.date ?? null,
                    qualityScore: scored.score,
                    scoreReasons: scored.reasons,
                  });
                }
              }
            }
          } else {
            channelReports.push({
              channelId: channel.channelId,
              channelName: channel.name,
              reachable: false,
              channelTitle: null,
              messageCount: 0,
              latestMessageId: null,
              latestMessageAt: null,
              sample: null,
              error: testError || 'Failed to fetch messages',
            });
            scannedCount++;
          }

          // Process image data if found
          if (imageData && imageData.found && imageData.base64Image) {
            try {
              const { parseImageSignal, deriveTrustedChartSignal, deriveTrustedMentionSignal } = await import('@/lib/ai-engine');
              const { normalizeSignalWithLivePrice } = await import('@/lib/broker/live-prices');
              const { validateChartSignalWithIndicators } = await import('@/lib/chart/technical-analysis');

              const captionTextOnly = [imageData.caption, imageData.message, imageData.text].filter(Boolean).join(' ');
              const imageResult = await parseImageSignal(imageData.base64Image, imageData.mimeType || 'image/png', captionTextOnly);
              const captionText = [imageData.caption, imageData.message, imageData.text, imageResult.extractedText].filter(Boolean).join(' ');
              
              const fallbackSignal = !imageResult.signals?.length
                ? deriveTrustedChartSignal(imageResult) || await deriveTrustedMentionSignal(captionText)
                : null;
              
              const signalsToCreate = imageResult.signals?.length ? imageResult.signals : fallbackSignal ? [fallbackSignal] : [];
              
              if (signalsToCreate.length > 0) {
                await db.aIDecision.create({
                  data: {
                    model: imageResult.imageType === 'chart' ? 'zai-vlm+technicalindicators' : 'zai-vlm',
                    inputType: imageResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
                    inputData: `[Image from ${channel.name || channel.channelId}] ${imageResult.extractedText?.substring(0, 2000) || '(no extracted text)'}`,
                    output: JSON.stringify({ ...imageResult, trustedFallbackSignal: fallbackSignal }),
                    symbol: signalsToCreate[0]?.symbol || imageResult.chartAnalysis?.symbol || null,
                    action: signalsToCreate[0]?.action || null,
                    confidence: signalsToCreate[0]?.confidence ?? null,
                  },
                });

                for (const rawSig of signalsToCreate) {
                  try {
                    const chartReason = imageResult.chartAnalysis
                      ? [
                          imageResult.chartAnalysis.setup ? `Setup: ${imageResult.chartAnalysis.setup}` : '',
                          imageResult.chartAnalysis.trend ? `Trend: ${imageResult.chartAnalysis.trend}` : '',
                          imageResult.chartAnalysis.timeframe ? `Timeframe: ${imageResult.chartAnalysis.timeframe}` : '',
                          imageResult.chartAnalysis.resistanceLevels?.length ? `Resistance: ${imageResult.chartAnalysis.resistanceLevels.join(', ')}` : '',
                          imageResult.chartAnalysis.supportLevels?.length ? `Support: ${imageResult.chartAnalysis.supportLevels.join(', ')}` : '',
                          imageResult.chartAnalysis.chartNotes || '',
                          imageResult.chartAnalysis.riskNotes || '',
                        ].filter(Boolean).join(' | ')
                      : '';

                    const liveNormalizedSig = await normalizeSignalWithLivePrice({
                      ...rawSig,
                      reasoning: `[${imageResult.imageType === 'chart' ? 'Chart Image Signal' : 'Image Signal'}${rawSig.notes ? ` — ${rawSig.notes}` : ''}] ${captionTextOnly ? captionTextOnly + ' | ' : ''}${chartReason || imageResult.extractedText?.substring(0, 500) || ''}`,
                    });

                    const sig = imageResult.imageType === 'chart'
                      ? await validateChartSignalWithIndicators(liveNormalizedSig, imageResult.chartAnalysis)
                      : liveNormalizedSig;

                    const tradeType = inferTradeType({
                      symbol: sig.symbol,
                      source: imageResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
                      text: sig.reasoning,
                    });
                    const sourceTimestamp = parseSourceTimestamp(imageData.date);

                    const quality = evaluateTradeQuality({
                      symbol: sig.symbol,
                      action: sig.action,
                      confidence: sig.confidence,
                      entryPrice: sig.entryPrice,
                      targetPrice: sig.targetPrice,
                      stopLoss: sig.stopLoss,
                      tradeType,
                      source: imageResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
                      sourceTimestamp,
                      text: sig.reasoning,
                      trustedSource: true,
                    });

                    let warningText = '';
                    if (!quality.accepted) {
                      const isCriticalError = quality.reasons.includes('missingValidEntryTargetStop') || quality.reasons.includes('invalidDirectionalLevels');
                      if (isCriticalError) {
                        console.log(`[TelegramAPI] Critical invalid levels for image signal ${sig.symbol}: ${formatTradeQualityReason(quality)}`);
                        continue;
                      }
                      warningText = `[Quality Warning: ${quality.reasons.join(', ')}] `;
                      console.log(`[TelegramAPI] Trusted source bypassed quality check for image signal ${sig.symbol}: ${formatTradeQualityReason(quality)}`);
                    }

                    // Check for duplicates
                    const existing = await db.tradeSignal.findFirst({
                      where: {
                        symbol: sig.symbol.toUpperCase(),
                        action: sig.action,
                        status: 'pending',
                        createdAt: {
                          gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        },
                      },
                    });

                    if (existing) {
                      const sourceMultiplier = await getSourceConfidenceMultiplier(
                        imageResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
                        channel.channelId
                      );
                      const finalConfidence = Math.min(95, Math.round(quality.score * sourceMultiplier));
                      await db.tradeSignal.update({
                        where: { id: existing.id },
                        data: {
                          confidence: Math.max(existing.confidence, finalConfidence),
                          entryPrice: sig.entryPrice,
                          targetPrice: sig.targetPrice ?? existing.targetPrice,
                          stopLoss: sig.stopLoss ?? existing.stopLoss,
                          reasoning: `${warningText}${sig.reasoning} | ${formatTradeQualityReason(quality)}`,
                          source: imageResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
                          updatedAt: new Date(),
                        },
                      });
                    } else {
                      const sourceMultiplier = await getSourceConfidenceMultiplier(
                        imageResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
                        channel.channelId
                      );
                      const finalConfidence = Math.min(95, Math.round(quality.score * sourceMultiplier));
                      const created = await db.tradeSignal.create({
                        data: {
                          symbol: sig.symbol.toUpperCase(),
                          exchange: 'NSE',
                          action: sig.action,
                          source: imageResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
                          confidence: finalConfidence,
                          entryPrice: sig.entryPrice,
                          targetPrice: sig.targetPrice,
                          stopLoss: sig.stopLoss,
                          quantity: 1,
                          reasoning: `${warningText}${sig.reasoning} | ${formatTradeQualityReason(quality)}`,
                          status: 'pending',
                          channelId: channel.channelId,
                          modelName: imageResult.imageType === 'chart' ? 'vlm+technicalindicators' : 'vlm',
                          tradeType,
                          sourceTimestamp,
                        },
                      });
                      signals.push(created);
                    }
                  } catch (sigErr) {
                    console.error(`[TelegramAPI] Image signal creation error for ${rawSig.symbol}:`, sigErr);
                  }
                }
              }
            } catch (imgErr) {
              console.error(`[TelegramAPI] Channel ${channel.channelId} image parsing error:`, imgErr);
            }
          } else if (imageError) {
            console.error(`[TelegramAPI] Channel ${channel.channelId} image fetch error:`, imageError);
          }
        }

        if (allMessages.length === 0) {
          return NextResponse.json({
            scanned: scannedCount,
            signals: [],
            channelsScanned: channels.length,
            channelReports,
            message: `Scanned ${scannedCount} channels, no messages with enough content found`,
          });
        }

        // Rank messages before AI parsing. We send the top 60% by trading-signal quality,
        // capped to keep scans reliable when channels are noisy.
        const signalKeywords = /buy|sell|target|tgt|stop.?loss|sl|entry|breakout|support|resistance|nifty|banknifty|option|call|put|bullish|bearish|trade|signal|stock|share|intraday|positional|swing|₹|rs\.|price|level|above|below|hold|exit|booking|profit|loss|ce\b|pe\b/i;
        const eligibleMessages = allMessages
          .filter(m => {
            const upperText = m.text.toUpperCase();
            const mentionsSymbol = Array.from(NSE_SYMBOLS).some(sym => containsSymbol(upperText, sym)) ||
                                   Object.keys(COMPANY_ALIASES).some(alias => containsAlias(upperText, alias));
            return signalKeywords.test(m.text) || m.qualityScore >= 35 || mentionsSymbol;
          })
          .sort((a, b) => {
            if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
            const bTime = b.messageAt ? new Date(b.messageAt).getTime() : 0;
            const aTime = a.messageAt ? new Date(a.messageAt).getTime() : 0;
            return bTime - aTime;
          });
        const selectedCount = Math.min(
          TELEGRAM_AI_MAX_MESSAGES,
          Math.max(1, Math.ceil(eligibleMessages.length * TELEGRAM_AI_SELECTION_PERCENT))
        );
        const selectedMessages = eligibleMessages.slice(0, selectedCount);
        const selectionSummary = {
          strategy: 'top_60_percent_by_signal_quality',
          totalMessages: allMessages.length,
          eligibleMessages: eligibleMessages.length,
          messagesSentToAi: selectedMessages.length,
          maxMessagesSentToAi: TELEGRAM_AI_MAX_MESSAGES,
          topMessages: selectedMessages.slice(0, 10).map(m => ({
            channelId: m.channelId,
            channelName: m.channelName,
            messageId: m.messageId,
            messageAt: m.messageAt,
            qualityScore: m.qualityScore,
            scoreReasons: m.scoreReasons,
            sample: m.text.substring(0, 160),
          })),
        };

        if (selectedMessages.length === 0) {
          return NextResponse.json({
            scanned: scannedCount,
            signals: [],
            channelsScanned: channels.length,
            channelReports,
            selectionSummary,
            messagesCollected: allMessages.length,
            message: `Scanned ${scannedCount} channels, ${allMessages.length} messages found but none appear to be trading signals`,
          });
        }

        console.log(`[TelegramAPI] Selected ${selectedMessages.length}/${eligibleMessages.length} eligible messages from ${channelsWithMessages} channels (collected ${allMessages.length} total)`);

        // Use batch AI parsing (with rule-based fallback built in)
        let parseErrors = 0;

        try {
          const batchResults = await batchParseTelegramSignals(
            selectedMessages.map(m => m.text),
            15 // max 15 messages per batch
          );

          // Process results and create trade signals
          for (let i = 0; i < batchResults.results.length; i++) {
            const rawResult = batchResults.results[i];
            const msgInfo = selectedMessages[rawResult.messageIndex] || selectedMessages[i];

            if (!msgInfo) continue;
            const result = await recoverTrustedTelegramResult(rawResult, msgInfo);

            if (result.isValid) {
              const parsedSignals = result.signals || (result.signal ? [result.signal] : []);

              for (const sig of parsedSignals) {
                try {
                  const tradeType = inferTradeType({
                    symbol: sig.symbol,
                    source: 'telegram',
                    text: `${result.reasoning || ''} ${msgInfo.text}`,
                  });
                  const sourceTimestamp = parseSourceTimestamp(msgInfo.messageAt);
                  const quality = evaluateTradeQuality({
                    symbol: sig.symbol,
                    action: sig.action,
                    confidence: sig.confidence,
                    entryPrice: sig.entryPrice,
                    targetPrice: sig.targetPrice,
                    stopLoss: sig.stopLoss,
                    tradeType,
                    source: 'telegram',
                    sourceTimestamp,
                    text: `${result.reasoning || ''} ${msgInfo.text}`,
                    trustedSource: true,
                  });
                  let warningText = '';
                  const trustedEstimate = /Trusted Telegram estimate|manual review/i.test(result.reasoning || '');
                  if (!quality.accepted && !trustedEstimate) {
                    const isCriticalError = quality.reasons.includes('missingValidEntryTargetStop') || quality.reasons.includes('invalidDirectionalLevels');
                    if (isCriticalError) {
                      console.log(`[TelegramAPI] Critical invalid levels for ${sig.symbol} signal: ${formatTradeQualityReason(quality)}`);
                      parseErrors++;
                      continue;
                    }
                    warningText = `[Quality Warning: ${quality.reasons.join(', ')}] `;
                    console.log(`[TelegramAPI] Trusted source bypassed quality check for ${sig.symbol}: ${formatTradeQualityReason(quality)}`);
                  }
                  const finalConfidence = (!quality.accepted && !trustedEstimate) || trustedEstimate
                    ? Math.max(50, Math.min(72, Math.max(sig.confidence, quality.score)))
                    : quality.score;
                  const qualityReason = (!quality.accepted && !trustedEstimate) || trustedEstimate
                    ? `${formatTradeQualityReason(quality)} | trustedTelegramManualReview`
                    : formatTradeQualityReason(quality);

                  // Check for duplicates across ALL sources
                  const existing = await db.tradeSignal.findFirst({
                    where: {
                      symbol: sig.symbol.toUpperCase(),
                      action: sig.action,
                      status: 'pending',
                      createdAt: {
                        gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
                      },
                    },
                  });

                  const tgPostUrl = msgInfo.channelId && msgInfo.messageId
                    ? msgInfo.channelId.startsWith('@')
                      ? `https://t.me/${msgInfo.channelId.substring(1)}/${msgInfo.messageId}`
                      : msgInfo.channelId.startsWith('-100')
                      ? `https://t.me/c/${msgInfo.channelId.substring(4)}/${msgInfo.messageId}`
                      : `https://t.me/${msgInfo.channelId}/${msgInfo.messageId}`
                    : null;

                  if (existing) {
                    const sourceMultiplier = await getSourceConfidenceMultiplier('telegram', msgInfo.channelId);
                    const weightedConfidence = Math.min(95, Math.round(finalConfidence * sourceMultiplier));
                    const activeModel = result.modelName || (result.reasoning?.includes('rule') ? 'rule-based' : 'huggingface-qwen3');
                    // Update existing signal with latest data instead of creating duplicate
                    const updated = await db.tradeSignal.update({
                      where: { id: existing.id },
                      data: {
                        confidence: Math.max(existing.confidence, weightedConfidence),
                        entryPrice: sig.entryPrice,
                        targetPrice: sig.targetPrice ?? existing.targetPrice,
                        stopLoss: sig.stopLoss ?? existing.stopLoss,
                        reasoning: `${warningText}${result.reasoning || msgInfo.text.substring(0, 500)} | scanScore=${msgInfo.qualityScore} | ${qualityReason}`,
                        source: 'telegram',
                        modelName: activeModel,
                        channelId: msgInfo.channelId,
                        tradeType: existing.tradeType ?? tradeType,
                        postUrl: tgPostUrl || existing.postUrl,
                        sourceTimestamp: existing.sourceTimestamp ?? sourceTimestamp,
                        updatedAt: new Date(),
                      },
                    });
                    console.log(`[TelegramAPI] Updated existing signal: ${sig.symbol} ${sig.action} (confidence: ${updated.confidence}%)`);
                    signals.push(updated);
                    continue;
                  }

                  const sourceMultiplier = await getSourceConfidenceMultiplier('telegram', msgInfo.channelId);
                  const weightedConfidence = Math.min(95, Math.round(finalConfidence * sourceMultiplier));
                  const activeModel = result.modelName || (result.reasoning?.includes('rule') ? 'rule-based' : 'huggingface-qwen3');
                  const signal = await db.tradeSignal.create({
                    data: {
                      symbol: sig.symbol.toUpperCase(),
                      exchange: 'NSE',
                      action: sig.action,
                      source: 'telegram',
                      confidence: weightedConfidence,
                      entryPrice: sig.entryPrice,
                      targetPrice: sig.targetPrice,
                      stopLoss: sig.stopLoss,
                      quantity: 1,
                      reasoning: `${warningText}${result.reasoning || msgInfo.text.substring(0, 500)} | scanScore=${msgInfo.qualityScore} | ${qualityReason}`,
                      status: 'pending',
                      modelName: activeModel,
                      channelId: msgInfo.channelId,
                      tradeType,
                      postUrl: tgPostUrl,

                      sourceTimestamp,
                    },
                  });

                  signals.push(signal);
                } catch (createErr) {
                  console.error(`[TelegramAPI] Signal creation error for ${sig.symbol}:`, createErr);
                  parseErrors++;
                }
              }
            }

            // Save AI decision for each message
            try {
              const activeModel = result.modelName || (result.reasoning?.includes('rule') ? 'rule-based' : 'huggingface-qwen3');
              await db.aIDecision.create({
                data: {
                  model: activeModel,
                  inputType: 'telegram',
                  inputData: JSON.stringify({
                    channelId: msgInfo.channelId,
                    channelName: msgInfo.channelName,
                    messageId: msgInfo.messageId,
                    messageAt: msgInfo.messageAt,
                    qualityScore: msgInfo.qualityScore,
                    scoreReasons: msgInfo.scoreReasons,
                    text: msgInfo.text,
                  }).substring(0, 5000),
                  output: JSON.stringify(result),
                  symbol: result.signal?.symbol || (result.signals && result.signals[0]?.symbol) || null,
                  action: result.isValid ? (result.signal?.action || (result.signals && result.signals[0]?.action)) : null,
                  confidence: result.signal?.confidence ?? (result.signals && result.signals[0]?.confidence) ?? null,
                },
              });
            } catch (err) {
              console.error(`[TelegramAPI] Failed to log AI decision:`, err);
            }
          }
        } catch (batchErr: any) {
          console.error('[TelegramAPI] Batch parse error:', batchErr);
          parseErrors = selectedMessages.length;
        }

        // Auto-dedup after scan — remove remaining duplicate signals
        try {
          const pendingSignals = await db.tradeSignal.findMany({
            where: { status: 'pending' },
            orderBy: { createdAt: 'desc' },
          });
          const seen = new Map<string, string>();
          const idsToDelete: string[] = [];
          for (const s of pendingSignals) {
            const key = `${s.symbol}:${s.action}`;
            if (seen.has(key)) {
              idsToDelete.push(s.id);
            } else {
              seen.set(key, s.id);
            }
          }
          if (idsToDelete.length > 0) {
            await db.tradeSignal.deleteMany({ where: { id: { in: idsToDelete } } });
            console.log(`[TelegramAPI] Auto-dedup removed ${idsToDelete.length} duplicate signals`);
          }
        } catch (dedupErr) {
          console.error('[TelegramAPI] Auto-dedup failed:', dedupErr);
        }

        return NextResponse.json({
          scanned: scannedCount,
          signals,
          channelsScanned: channels.length,
          channelReports,
          selectionSummary,
          messagesCollected: selectedMessages.length,
          totalMessages: allMessages.length,
          eligibleMessages: eligibleMessages.length,
          parseErrors,
        });
      }

      default:
        return NextResponse.json(
          { error: `Invalid action: ${action}. Valid: add-channel, remove-channel, scan-messages, test-channel` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[TelegramAPI] POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
