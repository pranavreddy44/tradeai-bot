import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { buildTrustedTelegramCandidate, parseTelegramSignal, type TelegramParseResult } from '@/lib/ai-engine';
import { inferTradeType, parseSourceTimestamp } from '@/lib/trade-classification';
import { getGrowwLivePrice } from '@/lib/broker/live-prices';
import { resolveInstrumentFromText } from '@/lib/market/instrument-resolver';

// POST /api/ai/telegram-analyze - Analyze a Telegram message for trading signals
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.message || typeof body.message !== 'string') {
      return NextResponse.json(
        { error: 'message is required and must be a string' },
        { status: 400 }
      );
    }

    const channelId = body.channelId || null;

    // Fetch most recent reasoning text from this channel (last ~300 chars is enough for context)
    let lastSignal: any = null;
    if (channelId) {
      lastSignal = await db.tradeSignal.findFirst({
        where: { channelId },
        orderBy: { createdAt: 'desc' },
        select: { reasoning: true, createdAt: true },
      });
    }

    // Only pass context if the last signal is recent (within 4 hours)
    const isRecent = lastSignal && (Date.now() - new Date(lastSignal.createdAt).getTime()) < 4 * 60 * 60 * 1000;
    const precedingContext = isRecent && lastSignal?.reasoning
      ? lastSignal.reasoning.substring(0, 300)
      : undefined;

    // Step 1: Parse the Telegram message using AI (passing previous message context)
    let result: TelegramParseResult = await parseTelegramSignal(
      body.message,
      precedingContext ? { previousMessage: precedingContext } : undefined
    );
    if (!result.isValid) {
      const resolvedInstrument = await resolveInstrumentFromText(body.message).catch(() => null);
      const preliminary = buildTrustedTelegramCandidate(body.message, null, resolvedInstrument?.symbol);
      const symbol = preliminary.signal?.symbol || resolvedInstrument?.symbol || null;
      const livePrice = symbol ? await getGrowwLivePrice(symbol) : null;
      const recovered = buildTrustedTelegramCandidate(body.message, livePrice, resolvedInstrument?.symbol);
      if (recovered.isValid) {
        result = {
          ...recovered,
          reasoning: `${recovered.reasoning} ${resolvedInstrument ? `Resolved via Groww instruments (${resolvedInstrument.matchType}: ${resolvedInstrument.name}).` : ''} Recovered from AI rejection: ${result.reasoning || 'not provided'}`,
        };
      }
    }

    const method = result.source === 'rule' ? 'rule-based' : (result.modelName || 'huggingface-qwen3');

    // Step 2: Save AI decision regardless of validity
    const aiDecision = await db.aIDecision.create({
      data: {
        model: method,
        inputType: 'telegram',
        inputData: body.message.substring(0, 5000),
        output: JSON.stringify(result),
        symbol: result.signal?.symbol || null,
        action: result.isValid ? result.signal?.action : null,
        confidence: result.signal?.confidence ?? null,
      },
    });

    // Step 3: If valid, create a trade signal
    if (result.isValid && result.signal) {
      const { getSourceConfidenceMultiplier } = await import('@/lib/signals/source-performance');
      const sourceMultiplier = await getSourceConfidenceMultiplier('telegram', channelId);
      const weightedConfidence = Math.min(95, Math.round(result.signal.confidence * sourceMultiplier));

      const signal = await db.tradeSignal.create({
        data: {
          symbol: result.signal.symbol.toUpperCase(),
          exchange: 'NSE',
          action: result.signal.action,
          source: 'telegram',
          confidence: weightedConfidence,
          entryPrice: result.signal.entryPrice,
          targetPrice: result.signal.targetPrice,
          stopLoss: result.signal.stopLoss,
          quantity: 1,
          reasoning: result.reasoning || body.message,
          status: 'pending',
          channelId: channelId,
          modelName: method,
          tradeType: inferTradeType({
            symbol: result.signal.symbol,
            source: 'telegram',
            text: `${result.reasoning || ''} ${body.message}`,
          }),
          sourceTimestamp: parseSourceTimestamp(body.messageAt || body.date || body.sourceTimestamp),
        },
      });

      // Update AI decision with signal reference
      await db.aIDecision.update({
        where: { id: aiDecision.id },
        data: { signalId: signal.id },
      });

      return NextResponse.json({
        isValid: true,
        signal,
        reasoning: result.reasoning,
        aiDecisionId: aiDecision.id,
      }, { status: 201 });
    }

    // Not a valid signal
    return NextResponse.json({
      isValid: false,
      reasoning: result.reasoning || 'No valid trading signal found in the message',
      aiDecisionId: aiDecision.id,
    });
  } catch (error) {
    console.error('Error analyzing Telegram message:', error);
    return NextResponse.json(
      { error: 'Telegram analysis failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
