import { NextRequest, NextResponse } from 'next/server';

// ============================================================
// Proxy route — forwards all requests to the telegram-listener
// mini-service (Bun, port 3002) directly.
//
// This avoids importing the heavy `telegram` (gramJS) library
// into the Next.js / Turbopack process, which was causing OOM
// crashes during compilation.
//
// Note: test-image-signal is handled locally because it only
// needs the AI engine (not telegram) and avoids a circular
// proxy loop with the mini-service.
// ============================================================

const MINI_SERVICE_URL = `http://localhost:3002`;

// Map route.ts actions → mini-service paths
const ACTION_TO_PATH: Record<string, { path: string; method: string }> = {
  'get-saved-credentials': { path: '/saved-credentials', method: 'GET' },
  'auth-start':            { path: '/auth/start',        method: 'POST' },
  'auth-code':             { path: '/auth/code',         method: 'POST' },
  'auth-2fa':              { path: '/auth/2fa',          method: 'POST' },
  'disconnect':            { path: '/auth/disconnect',   method: 'POST' },
  'dialogs':               { path: '/dialogs',           method: 'GET' },
  'start-monitoring':      { path: '/start-monitoring',  method: 'POST' },
  'test-connection':       { path: '/test-connection',   method: 'POST' },
  'test-channel':          { path: '/test-channel',      method: 'POST' },
  // 'test-image-signal' handled locally — no telegram import needed
};

// GET /api/telegram/userbot → proxy to mini-service /status
export async function GET() {
  try {
    const res = await fetch(
      `${MINI_SERVICE_URL}/status`,
      { signal: AbortSignal.timeout(10_000) }
    );
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to reach telegram-listener service',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 502 }
    );
  }
}

// POST /api/telegram/userbot → proxy to the appropriate mini-service endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action as string | undefined;

    if (!action) {
      return NextResponse.json(
        { error: 'action is required' },
        { status: 400 }
      );
    }

    // ─── Handle test-image-signal locally (no telegram dependency) ─────
    if (action === 'test-image-signal') {
      if (!body.base64Image) {
        return NextResponse.json(
          { error: 'base64Image is required' },
          { status: 400 }
        );
      }
      const { parseImageSignal, deriveTrustedChartSignal, deriveTrustedMentionSignal, deriveTrustedTextSignal } = await import('@/lib/ai-engine');
      const { db } = await import('@/lib/db');
      const { normalizeSignalWithLivePrice } = await import('@/lib/broker/live-prices');
      const { validateChartSignalWithIndicators } = await import('@/lib/chart/technical-analysis');
      const { inferTradeType, parseSourceTimestamp } = await import('@/lib/trade-classification');
      const captionTextOnly = [body.caption, body.message, body.text].filter(Boolean).join(' ');
      const imageResult = await parseImageSignal(body.base64Image, body.mimeType || 'image/png', captionTextOnly);
      const captionText = [body.caption, body.message, body.text, imageResult.extractedText].filter(Boolean).join(' ');
      // Layered fallback: chart signal → text-based OCR signal → mention-based signal
      const fallbackSignal = !imageResult.signals?.length
        ? (
          deriveTrustedChartSignal(imageResult) ||
          await deriveTrustedTextSignal(captionText) ||
          await deriveTrustedMentionSignal(captionText)
        )
        : null;
      const signalsToCreate = imageResult.signals?.length ? imageResult.signals : fallbackSignal ? [fallbackSignal] : [];
      const hasSignalsToCreate = signalsToCreate.length > 0;
      const createdSignals: unknown[] = [];

      if (body.createSignals && hasSignalsToCreate) {
        await db.aIDecision.create({
          data: {
            model: imageResult.imageType === 'chart' ? 'zai-vlm+technicalindicators' : 'zai-vlm',
            inputType: imageResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
            inputData: `[Image${body.channelId ? ` from ${body.channelId}` : ''}] ${imageResult.extractedText?.substring(0, 2000) || '(no extracted text)'}`,
            output: JSON.stringify({ ...imageResult, trustedFallbackSignal: fallbackSignal }),
            symbol: signalsToCreate[0]?.symbol || imageResult.chartAnalysis?.symbol || null,
            action: signalsToCreate[0]?.action || null,
            confidence: signalsToCreate[0]?.confidence ?? null,
          },
        });

        for (const rawSig of signalsToCreate) {
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
            reasoning: `[${imageResult.imageType === 'chart' ? 'Chart Image Signal' : 'Image Signal'}${rawSig.notes ? ` — ${rawSig.notes}` : ''}] ${chartReason || imageResult.extractedText?.substring(0, 500) || ''}`,
          });
          const sig = imageResult.imageType === 'chart'
            ? await validateChartSignalWithIndicators(liveNormalizedSig, imageResult.chartAnalysis)
            : liveNormalizedSig;

          const userbotMsgId = body.messageId || body.message_id || body.id || body.msgId;
          const tgPostUrl = body.channelId && userbotMsgId
            ? body.channelId.startsWith('@')
              ? `https://t.me/${body.channelId.substring(1)}/${userbotMsgId}`
              : body.channelId.startsWith('-100')
              ? `https://t.me/c/${body.channelId.substring(4)}/${userbotMsgId}`
              : `https://t.me/${body.channelId}/${userbotMsgId}`
            : null;

          const { getSourceConfidenceMultiplier } = await import('@/lib/signals/source-performance');
          const sourceMultiplier = await getSourceConfidenceMultiplier(
            imageResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
            body.channelId || null
          );
          const weightedConfidence = Math.min(95, Math.round(sig.confidence * sourceMultiplier));

          const created = await db.tradeSignal.create({
            data: {
              symbol: sig.symbol.toUpperCase(),
              exchange: 'NSE',
              action: sig.action,
              source: imageResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
              confidence: weightedConfidence,
              entryPrice: sig.entryPrice,
              targetPrice: sig.targetPrice,
              stopLoss: sig.stopLoss,
              quantity: 1,
              reasoning: sig.reasoning,
              status: fallbackSignal ? 'pending' : 'pending',
              channelId: body.channelId || null,
              postUrl: tgPostUrl,
              modelName: imageResult.imageType === 'chart' ? 'vlm+technicalindicators' : 'vlm',
              tradeType: inferTradeType({
                symbol: sig.symbol,
                source: imageResult.imageType === 'chart' ? 'telegram-chart-image' : 'telegram-image',
                text: sig.reasoning,
              }),
              sourceTimestamp: parseSourceTimestamp(body.date || body.messageAt || body.sourceTimestamp),
            },
          });

          createdSignals.push(created);
        }
      }

      return NextResponse.json({
        ...imageResult,
        hasValidSignals: imageResult.hasValidSignals || Boolean(fallbackSignal),
        signals: signalsToCreate,
        trustedFallbackSignal: fallbackSignal,
        createdSignals,
      });
    }

    // ─── Proxy all other actions to the mini-service ───────────────────
    const mapping = ACTION_TO_PATH[action];
    if (!mapping) {
      return NextResponse.json(
        {
          error: `Unknown action: ${action}. Valid: ${[...Object.keys(ACTION_TO_PATH), 'test-image-signal'].join(', ')}`,
        },
        { status: 400 }
      );
    }

    const proxyUrl = `${MINI_SERVICE_URL}${mapping.path}`;

    const fetchOptions: RequestInit = {
      method: mapping.method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60_000),
    };

    if (mapping.method === 'POST') {
      let proxyBody: Record<string, unknown>;

      switch (action) {
        case 'auth-start':
          if (!body.apiId || !body.apiHash || !body.phone) {
            return NextResponse.json(
              { error: 'apiId, apiHash, and phone are required' },
              { status: 400 }
            );
          }
          proxyBody = { apiId: body.apiId, apiHash: body.apiHash, phone: body.phone };
          break;
        case 'auth-code':
          if (!body.code) {
            return NextResponse.json({ error: 'code is required' }, { status: 400 });
          }
          proxyBody = { code: body.code };
          break;
        case 'auth-2fa':
          if (!body.password) {
            return NextResponse.json({ error: 'password is required' }, { status: 400 });
          }
          proxyBody = { password: body.password };
          break;
        case 'test-channel':
          if (!body.channelId) {
            return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
          }
          proxyBody = { channelId: body.channelId };
          break;
        default:
          proxyBody = {};
          break;
      }

      fetchOptions.body = JSON.stringify(proxyBody);
    }

    const res = await fetch(proxyUrl, fetchOptions);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Request failed',
        details: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
