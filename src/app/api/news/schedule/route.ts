import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ScheduleSettings {
  isActive: boolean;
  intervalMinutes: number;
  lastRun: string | null;
  nextRun: string | null;
  marketHoursOnly: boolean;
}

const DEFAULT_SCHEDULE: ScheduleSettings = {
  isActive: false,
  intervalMinutes: 5,
  lastRun: null,
  nextRun: null,
  marketHoursOnly: true,
};

const SCHEDULE_KEYS = [
  'newsScheduleActive',
  'newsScheduleInterval',
  'newsScheduleLastRun',
  'newsScheduleNextRun',
  'newsScheduleMarketHoursOnly',
] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getScheduleSettings(): Promise<ScheduleSettings> {
  const settings = await db.botSetting.findMany({
    where: { key: { in: [...SCHEDULE_KEYS] } },
  });

  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }

  return {
    isActive: map.newsScheduleActive === 'true',
    intervalMinutes: parseInt(map.newsScheduleInterval || '5', 10),
    lastRun: map.newsScheduleLastRun || null,
    nextRun: map.newsScheduleNextRun || null,
    marketHoursOnly: map.newsScheduleMarketHoursOnly !== 'false',
  };
}

async function saveScheduleSetting(key: string, value: string): Promise<void> {
  await db.botSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
}

/**
 * Check if current time is within Indian market hours (9:15 AM - 3:30 PM IST, Mon-Fri)
 */
function isMarketHours(): boolean {
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);

  const day = istTime.getDay(); // 0=Sun, 6=Sat
  const hours = istTime.getHours();
  const minutes = istTime.getMinutes();

  // Weekend check
  if (day === 0 || day === 6) return false;

  // Market hours: 9:15 AM to 3:30 PM IST
  const timeInMinutes = hours * 60 + minutes;
  return timeInMinutes >= 555 && timeInMinutes <= 930; // 9:15=555, 15:30=930
}

// ─── GET /api/news/schedule ─────────────────────────────────────────────────

export async function GET() {
  try {
    const settings = await getScheduleSettings();
    const marketOpen = isMarketHours();

    return NextResponse.json({
      schedule: settings,
      marketOpen,
      currentTimeIST: new Date().toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour12: false,
      }),
    });
  } catch (error) {
    console.error('Error fetching schedule settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch schedule settings' },
      { status: 500 }
    );
  }
}

// ─── POST /api/news/schedule ────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { action, intervalMinutes, isActive, marketHoursOnly } = body as {
      action?: string;
      intervalMinutes?: number;
      isActive?: boolean;
      marketHoursOnly?: boolean;
    };

    // Handle immediate scan trigger
    if (action === 'run') {
      const marketOpen = isMarketHours();
      const schedule = await getScheduleSettings();

      if (schedule.marketHoursOnly && !marketOpen) {
        return NextResponse.json(
          {
            error: 'Market is currently closed. Cannot scan outside market hours.',
            marketOpen,
          },
          { status: 400 }
        );
      }

      // Trigger scan by calling the scan API internally
      const scanResponse = await fetch(
        `http://localhost:${process.env.PORT || 3000}/api/news/scan`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );

      const scanResult = await scanResponse.json();

      // Update last run time
      const now = new Date().toISOString();
      await saveScheduleSetting('newsScheduleLastRun', now);

      // Calculate next run
      const currentSchedule = await getScheduleSettings();
      const nextRun = new Date(
        Date.now() + currentSchedule.intervalMinutes * 60 * 1000
      ).toISOString();
      await saveScheduleSetting('newsScheduleNextRun', nextRun);

      return NextResponse.json({
        message: 'Manual scan completed',
        scanResult,
        marketOpen,
      });
    }

    // Update schedule settings
    if (typeof isActive === 'boolean') {
      await saveScheduleSetting('newsScheduleActive', String(isActive));

      if (isActive) {
        const now = new Date().toISOString();
        await saveScheduleSetting('newsScheduleLastRun', now);

        const interval = intervalMinutes || (await getScheduleSettings()).intervalMinutes;
        const nextRun = new Date(Date.now() + interval * 60 * 1000).toISOString();
        await saveScheduleSetting('newsScheduleNextRun', nextRun);
      }
    }

    if (typeof intervalMinutes === 'number') {
      const clampedInterval = Math.max(1, Math.min(intervalMinutes, 60));
      await saveScheduleSetting('newsScheduleInterval', String(clampedInterval));

      // Recalculate next run if schedule is active
      const settings = await getScheduleSettings();
      if (settings.isActive) {
        const lastRun = settings.lastRun ? new Date(settings.lastRun) : new Date();
        const nextRun = new Date(lastRun.getTime() + clampedInterval * 60 * 1000).toISOString();
        await saveScheduleSetting('newsScheduleNextRun', nextRun);
      }
    }

    if (typeof marketHoursOnly === 'boolean') {
      await saveScheduleSetting('newsScheduleMarketHoursOnly', String(marketHoursOnly));
    }

    const updatedSettings = await getScheduleSettings();

    return NextResponse.json({
      message: 'Schedule settings updated',
      schedule: updatedSettings,
      marketOpen: isMarketHours(),
    });
  } catch (error) {
    console.error('Error updating schedule settings:', error);
    return NextResponse.json(
      { error: 'Failed to update schedule settings' },
      { status: 500 }
    );
  }
}

// ─── DELETE /api/news/schedule ──────────────────────────────────────────────

export async function DELETE() {
  try {
    await saveScheduleSetting('newsScheduleActive', 'false');
    await saveScheduleSetting('newsScheduleNextRun', '');

    const settings = await getScheduleSettings();

    return NextResponse.json({
      message: 'Schedule stopped',
      schedule: settings,
    });
  } catch (error) {
    console.error('Error stopping schedule:', error);
    return NextResponse.json(
      { error: 'Failed to stop schedule' },
      { status: 500 }
    );
  }
}
