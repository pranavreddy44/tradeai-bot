import { NextRequest, NextResponse } from 'next/server';
import type { BotSetting } from '@prisma/client';
import { db } from '@/lib/db';
import { invalidateBotSettingCache } from '@/lib/ai-engine';

// GET /api/settings - Return all settings as key-value pairs
// GET /api/settings?key=<key> - Return a specific setting value
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');

    // If a specific key is requested, return just that setting
    if (key) {
      const setting = await db.botSetting.findUnique({
        where: { key },
      });

      if (!setting) {
        return NextResponse.json(
          { error: `Setting "${key}" not found`, value: null },
          { status: 404 }
        );
      }

      return NextResponse.json({ key: setting.key, value: setting.value });
    }

    // Otherwise return all settings as key-value pairs
    const settings = await db.botSetting.findMany();
    const settingsMap: Record<string, string> = {};
    const secretKeys = ['huggingFaceToken', 'geminiApiKey', 'groqApiKey', 'omniRouteKey'];
    for (const setting of settings) {
      settingsMap[setting.key] = secretKeys.includes(setting.key) ? 'configured' : setting.value;
    }
    return NextResponse.json({ settings: settingsMap });
  } catch (error) {
    console.error('Error fetching settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

// PUT /api/settings - Update settings
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.settings || typeof body.settings !== 'object') {
      return NextResponse.json(
        { error: 'settings object is required' },
        { status: 400 }
      );
    }

    const results: BotSetting[] = [];
    for (const [key, value] of Object.entries(body.settings)) {
      const setting = await db.botSetting.upsert({
        where: { key },
        create: { key, value: String(value) },
        update: { value: String(value) },
      });
      results.push(setting);
    }

    // Settings changed — drop the AI engine's short-TTL cache so the next
    // LLM call picks up the new values immediately.
    invalidateBotSettingCache();

    // Return updated settings as key-value map
    const settingsMap: Record<string, string> = {};
    for (const setting of results) {
      settingsMap[setting.key] = setting.value;
    }

    return NextResponse.json({ settings: settingsMap, updated: results.length });
  } catch (error) {
    console.error('Error updating settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
