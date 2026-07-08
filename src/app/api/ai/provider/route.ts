import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  callConfiguredChatCompletion,
  DEFAULT_HUGGINGFACE_MODEL,
  getConfiguredAIProvider,
  HUGGINGFACE_TEXT_MODELS,
  GEMINI_TEXT_MODELS,
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
    
    // Hugging Face tokens
    const hfSettingsToken = await getSettingValue('huggingFaceToken');
    const hfEnvToken = process.env.HF_TOKEN || process.env.HUGGINGFACE_API_KEY || '';
    const hfToken = hfEnvToken || hfSettingsToken || '';
    
    // Gemini tokens
    const geminiSettingsToken = await getSettingValue('geminiApiKey');
    const geminiEnvToken = process.env.GEMINI_API_KEY || '';
    const geminiToken = geminiEnvToken || geminiSettingsToken || '';
    
    // Groq tokens
    const groqSettingsToken = await getSettingValue('groqApiKey');
    const groqEnvToken = process.env.GROQ_API_KEY || '';
    const groqToken = groqEnvToken || groqSettingsToken || '';

    // Active model for each provider
    const hfModel = await getSettingValue('huggingFaceModel') || DEFAULT_HUGGINGFACE_MODEL;
    const geminiModel = await getSettingValue('geminiModel') || 'gemini-3.5-flash';
    const groqModel = await getSettingValue('groqModel') || 'llama-3.3-70b-versatile';

    return NextResponse.json({
      activeProvider: activeProvider.provider,
      activeModel: activeProvider.model,
      
      // Configuration for all providers so frontend can show previews and status
      providers: {
        huggingface: {
          model: hfModel,
          hasToken: Boolean(hfToken),
          tokenSource: hfEnvToken ? 'env' : (hfSettingsToken ? 'settings' : 'none'),
          tokenPreview: tokenPreview(hfToken),
          models: HUGGINGFACE_TEXT_MODELS,
        },
        gemini: {
          model: geminiModel,
          hasToken: Boolean(geminiToken),
          tokenSource: geminiEnvToken ? 'env' : (geminiSettingsToken ? 'settings' : 'none'),
          tokenPreview: tokenPreview(geminiToken),
          models: GEMINI_TEXT_MODELS,
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
    const provider = typeof body.provider === 'string' ? body.provider.trim() : 'huggingface';
    const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : '';
    const token = typeof body.token === 'string' ? body.token.trim() : '';

    if (!['huggingface', 'gemini', 'groq'].includes(provider)) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    // Save active provider
    await db.botSetting.upsert({
      where: { key: 'aiProvider' },
      create: { key: 'aiProvider', value: provider },
      update: { value: provider },
    });

    // Save model and token based on selected provider
    if (provider === 'gemini') {
      const activeModel = model || 'gemini-3.5-flash';
      await db.botSetting.upsert({
        where: { key: 'geminiModel' },
        create: { key: 'geminiModel', value: activeModel },
        update: { value: activeModel },
      });
      if (token && token !== 'configured') {
        await db.botSetting.upsert({
          where: { key: 'geminiApiKey' },
          create: { key: 'geminiApiKey', value: token },
          update: { value: token },
        });
      }
    } else if (provider === 'groq') {
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
    } else {
      // huggingface
      const activeModel = model || DEFAULT_HUGGINGFACE_MODEL;
      await db.botSetting.upsert({
        where: { key: 'huggingFaceModel' },
        create: { key: 'huggingFaceModel', value: activeModel },
        update: { value: activeModel },
      });
      if (token && token !== 'configured') {
        await db.botSetting.upsert({
          where: { key: 'huggingFaceToken' },
          create: { key: 'huggingFaceToken', value: token },
          update: { value: token },
        });
      }
    }

    const providerConfig = await getConfiguredAIProvider();
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

