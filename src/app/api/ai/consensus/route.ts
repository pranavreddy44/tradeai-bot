import { NextRequest, NextResponse } from 'next/server';
import {
  callConfiguredChatCompletion,
  getConfiguredAIProvider,
  OMNIROUTE_TEXT_MODELS,
  GROQ_TEXT_MODELS,
} from '@/lib/ai-engine';

// POST /api/ai/consensus - Run multi-model consensus analysis
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const symbol = body.symbol || 'RELIANCE';

    const activeProvider = await getConfiguredAIProvider();
    let models: readonly any[] = [];
    if (activeProvider.provider === 'groq') {
      models = GROQ_TEXT_MODELS;
    } else {
      models = OMNIROUTE_TEXT_MODELS;
    }

    const prompt = `Analyze the Indian stock ${symbol} on NSE. Provide:
1. Action: BUY or SELL
2. Confidence: 0-100
3. Entry Price (realistic current NSE price)
4. Target Price
5. Stop Loss
6. Brief reasoning (1-2 sentences)

Respond in this exact JSON format only:
{"action":"BUY/SELL","confidence":75,"entryPrice":2890,"targetPrice":2980,"stopLoss":2845,"reasoning":"..."}`;

    const results: Array<{
      model: string;
      modelId: string;
      action: string;
      confidence: number;
      entryPrice: number;
      targetPrice: number;
      stopLoss: number;
      reasoning: string;
    }> = [];

    for (let i = 0; i < models.length; i++) {
      try {
        const response = await callConfiguredChatCompletion([{
          role: 'user',
          content: prompt,
        }], {
          model: models[i].id,
          temperature: 0.3,
          maxTokens: 700,
          timeoutMs: 15_000,
        });

        const content = response.content || '';
        
        // Parse JSON from response
        const jsonMatch = content.match(/\{[^}]+\}/);
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0]);
            results.push({
              model: models[i].name,
              modelId: models[i].id,
              action: parsed.action || 'HOLD',
              confidence: Number(parsed.confidence) || 50,
              entryPrice: Number(parsed.entryPrice) || 0,
              targetPrice: Number(parsed.targetPrice) || 0,
              stopLoss: Number(parsed.stopLoss) || 0,
              reasoning: parsed.reasoning || 'No reasoning provided',
            });
          } catch {
            results.push({
              model: models[i].name,
              modelId: models[i].id,
              action: 'HOLD',
              confidence: 50,
              entryPrice: 0,
              targetPrice: 0,
              stopLoss: 0,
              reasoning: 'Failed to parse model response',
            });
          }
        }
      } catch (err) {
        console.error(`Model ${models[i].id} failed:`, err);
        results.push({
          model: models[i].name,
          modelId: models[i].id,
          action: 'HOLD',
          confidence: 0,
          entryPrice: 0,
          targetPrice: 0,
          stopLoss: 0,
          reasoning: 'Model unavailable',
        });
      }
    }

    // Calculate consensus
    const validResults = results.filter((r) => r.confidence > 0);
    const buyVotes = validResults.filter((r) => r.action === 'BUY').length;
    const sellVotes = validResults.filter((r) => r.action === 'SELL').length;
    const consensusAction = buyVotes > sellVotes ? 'BUY' : sellVotes > buyVotes ? 'SELL' : 'HOLD';
    const avgConfidence = validResults.length > 0
      ? Math.round(validResults.reduce((sum, r) => sum + r.confidence, 0) / validResults.length)
      : 0;
    const consensusStrength = Math.abs(buyVotes - sellVotes) / Math.max(validResults.length, 1);

    return NextResponse.json({
      symbol,
      results,
      consensus: {
        action: consensusAction,
        confidence: avgConfidence,
        strength: Math.round(consensusStrength * 100),
        buyVotes,
        sellVotes,
        totalModels: results.length,
      },
    });
  } catch (error) {
    console.error('Error in consensus analysis:', error);
    return NextResponse.json(
      { error: 'Consensus analysis failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
