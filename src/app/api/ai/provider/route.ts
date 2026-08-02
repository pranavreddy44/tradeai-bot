import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  callConfiguredChatCompletion,
  DEFAULT_OMNIROUTE_BASE_URL,
  DEFAULT_OMNIROUTE_MODEL,
  getConfiguredAIProvider,
  invalidateBotSettingCache,
  OMNIROUTE_TEXT_MODELS,
  GROQ_TEXT_MODELS,
} from '@/lib/ai-engine';

function tokenPreview(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.length <= 10) return 'configured';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

async function getSettingValue(key: string): Promise<string | null> {
  const setting = await db.botSetting.findUnique({ where: { key } });
  return setting?.value || null;
}

export async function GET() {
  try {
    const activeProvider = await getConfiguredAIProvider();

    // OmniRoute tokens + endpoint
    const omniRouteSettingsToken = await getSettingValue('omniRouteKey');
    const omniRouteEnvToken = process.env.OMNIROUTE_KEY || '';
    const omniRouteToken = omniRouteEnvToken || omniRouteSettingsToken || '';
    const omniRouteBaseUrl = process.env.OMNIROUTE_BASE_URL
      || await getSettingValue('omniRouteBaseUrl')
      || DEFAULT_OMNIROUTE_BASE_URL;

    // Groq tokens
    const groqSettingsToken = await getSettingValue('groqApiKey');
    const groqEnvToken = process.env.GROQ_API_KEY || '';
    const groqToken = groqEnvToken || groqSettingsToken || '';

    // Active model for each provider
    const omniRouteModel = await getSettingValue('omniRouteModel') || DEFAULT_OMNIROUTE_MODEL;
    const omniRouteJsonModel = await getSettingValue('omniRouteJsonModel') || 'oc/nemotron-3-ultra-free';
    const omniRouteVisionModel = await getSettingValue('omniRouteVisionModel') || 'gemini/gemini-3.5-flash';
    const groqModel = await getSettingValue('groqModel') || 'llama-3.3-70b-versatile';

    return NextResponse.json({
      activeProvider: activeProvider.provider,
      activeModel: activeProvider.model,

      // Configuration for all providers so frontend can show previews and status
      providers: {
        omniroute: {
          model: omniRouteModel,
          jsonModel: omniRouteJsonModel,
          visionModel: omniRouteVisionModel,
          baseUrl: omniRouteBaseUrl,
          hasToken: Boolean(omniRouteToken),
          tokenSource: omniRouteEnvToken ? 'env' : (omniRouteSettingsToken ? 'settings' : 'none'),
          tokenPreview: tokenPreview(omniRouteToken),
          models: OMNIROUTE_TEXT_MODELS,
        },
        groq: {
          model: groqModel,
          hasToken: Boolean(groqToken),
          tokenSource: groqEnvToken ? 'env' : (groqSettingsToken ? 'settings' : 'none'),
          tokenPreview: tokenPreview(groqToken),
          models: GROQ_TEXT_MODELS,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching AI provider config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch AI provider config' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const provider = typeof body.provider === 'string' ? body.provider.trim() : 'omniroute';
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : '';
    const jsonModel = typeof body.jsonModel === 'string' && body.jsonModel.trim() ? body.jsonModel.trim() : '';
    const visionModel = typeof body.visionModel === 'string' && body.visionModel.trim() ? body.visionModel.trim() : '';
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    const baseUrl = typeof body.baseUrl === 'string' ? body.baseUrl.trim() : '';

    if (!['omniroute', 'groq'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    // Save active provider
    await db.botSetting.upsert({
      where: { key: 'aiProvider' },
      create: { key: 'aiProvider', value: provider },
      update: { value: provider },
    });

    // Save model and token based on selected provider
    if (provider === 'omniroute') {
      const activeModel = model || DEFAULT_OMNIROUTE_MODEL;
      await db.botSetting.upsert({
        where: { key: 'omniRouteModel' },
        create: { key: 'omniRouteModel', value: activeModel },
        update: { value: activeModel },
      });
      if (baseUrl) {
        await db.botSetting.upsert({
          where: { key: 'omniRouteBaseUrl' },
          create: { key: 'omniRouteBaseUrl', value: baseUrl },
          update: { value: baseUrl },
        });
      }
      if (jsonModel) {
        await db.botSetting.upsert({
          where: { key: 'omniRouteJsonModel' },
          create: { key: 'omniRouteJsonModel', value: jsonModel },
          update: { value: jsonModel },
        });
      }
      if (visionModel) {
        await db.botSetting.upsert({
          where: { key: 'omniRouteVisionModel' },
          create: { key: 'omniRouteVisionModel', value: visionModel },
          update: { value: visionModel },
        });
      }
      if (token && token !== 'configured') {
        await db.botSetting.upsert({
          where: { key: 'omniRouteKey' },
          create: { key: 'omniRouteKey', value: token },
          update: { value: token },
        });
      }
    } else {
      // groq
      const activeModel = model || 'llama-3.3-70b-versatile';
      await db.botSetting.upsert({
        where: { key: 'groqModel' },
        create: { key: 'groqModel', value: activeModel },
        update: { value: activeModel },
      });
      if (token && token !== 'configured') {
        await db.botSetting.upsert({
          where: { key: 'groqApiKey' },
          create: { key: 'groqApiKey', value: token },
          update: { value: token },
        });
      }
    }

    const providerConfig = await getConfiguredAIProvider();
    invalidateBotSettingCache();
    return NextResponse.json({
      success: true,
      activeProvider: providerConfig.provider,
      activeModel: providerConfig.model,
    });
  } catch (error) {
    console.error('Error saving AI provider config:', error);
    return NextResponse.json(
      { error: 'Failed to save AI provider config', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const response = await callConfiguredChatCompletion([
      {
        role: 'system',
        content: 'You are a JSON-only health check for an Indian stock trading assistant.',
      },
      {
        role: 'user',
        content: 'Return {"ok":true,"task":"trading-ai"} only.',
      },
    ], {
      temperature: 0,
      maxTokens: 80,
      timeoutMs: 15_000,
    });

    return NextResponse.json({
      success: true,
      model: response.model,
      sample: response.content,
    });
  } catch (error) {
    console.error('Error testing AI provider:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'AI provider test failed' },
      { status: 500 }
    );
  }
}

