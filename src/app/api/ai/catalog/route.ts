import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

async function getSettingValue(key: string): Promise<string | null> {
  try {
    const setting = await db.botSetting.findUnique({ where: { key } });
    return setting?.value || null;
  } catch {
    return null;
  }
}

function modelName(id: string): string {
  const parts = id.split('/');
  const short = parts[parts.length - 1] || id;
  return short
    .split(/[-_:]/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

export async function GET() {
  const baseUrl = process.env.OMNIROUTE_BASE_URL
    || await getSettingValue('omniRouteBaseUrl')
    || 'http://localhost:20128/v1/chat/completions';
  const token = process.env.OMNIROUTE_KEY
    || await getSettingValue('omniRouteKey')
    || '';

  // /v1/models lives at the gateway root, not the chat completions path.
  const modelsUrl = baseUrl.replace(/\/chat\/completions\/?$/, '/models');

  try {
    const res = await fetch(modelsUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: AbortSignal.timeout(10_000),
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Catalog fetch failed (${res.status})`);
    }
    const payload = await res.json();
    const raw = Array.isArray(payload?.data) ? payload.data : [];

    const models = raw
      .map((m: any) => ({ id: String(m.id || ''), name: String(m.name || ''), description: String(m.description || '') }))
      .filter((m: { id: string }) => m.id.length > 0)
      .map((m: { id: string; name: string; description: string }) => ({
        id: m.id,
        name: m.name || modelName(m.id),
        description: m.description || `${modelName(m.id)} — OmniRoute model`,
      }));

    return NextResponse.json({ models });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch model catalog', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 502 }
    );
  }
}
