import { NextRequest, NextResponse } from 'next/server';
import {
  callConfiguredChatCompletion,
  getConfiguredAIProvider,
  OMNIROUTE_TEXT_MODELS,
  GROQ_TEXT_MODELS,
} from '@/lib/ai-engine';

const SYSTEM_PROMPT = `You are TradeAI Bot, an expert trading assistant for Indian stock markets (NSE/BSE). You provide market analysis, trading strategies, risk management advice, and help with technical/fundamental analysis. Always include relevant stock symbols and prices when discussing Indian stocks. Be concise and actionable. Use Indian Rupee (₹) for prices.

Key guidelines:
- Always reference NSE/BSE stock symbols (e.g., RELIANCE, TCS, INFY, HDFCBANK)
- Use ₹ for all price references
- Provide specific entry/exit levels when suggesting trades
- Include risk-reward ratios where applicable
- Mention relevant indices (NIFTY 50, SENSEX, BANK NIFTY) when discussing market outlook
- Keep responses concise but informative
- If unsure about current prices, provide approximate ranges with disclaimer
- Always remind users that this is not financial advice`;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const MODEL_DISPLAY_NAMES = new Map<string, string>([
  ...OMNIROUTE_TEXT_MODELS.map(model => [model.id, model.name] as [string, string]),
  ...GROQ_TEXT_MODELS.map(model => [model.id, model.name] as [string, string]),
]);

// POST /api/ai/chat - AI Chat Assistant endpoint
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const userMessages: ChatMessage[] = body.messages || [];
    const requestedModel = body.model as string | undefined;

    if (userMessages.length === 0) {
      return NextResponse.json(
        { error: 'No messages provided' },
        { status: 400 }
      );
    }

    const activeProvider = await getConfiguredAIProvider();
    const model = requestedModel || activeProvider.model;

    // Build the messages array with system prompt
    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...userMessages.map((m: ChatMessage) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const response = await callConfiguredChatCompletion(messages, {
      model,
      temperature: 0.7,
      maxTokens: 1200,
      timeoutMs: 20_000,
    });

    const aiContent = response.content || 'I apologize, but I was unable to generate a response. Please try again.';

    return NextResponse.json({
      message: {
        role: 'assistant',
        content: aiContent,
      },
      model: MODEL_DISPLAY_NAMES.get(response.model) || response.model,
      modelId: response.model,
    });
  } catch (error) {
    console.error('Error in AI chat:', error);
    return NextResponse.json(
      { error: 'AI chat failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
