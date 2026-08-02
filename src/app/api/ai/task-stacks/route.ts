import { NextRequest, NextResponse } from 'next/server';
import {
  getAllTaskModelStacks,
  saveTaskModelStacks,
  clearTaskModelStacks,
  type TaskAnchor,
  type TaskModelStack,
} from '@/lib/ai-engine';

export async function GET() {
  try {
    const stacks = await getAllTaskModelStacks();
    return NextResponse.json({ stacks });
  } catch (error) {
    console.error('Error fetching task model stacks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch task model stacks' },
      { status: 500 }
    );
  }
}

const VALID_ANCHORS: TaskAnchor[] = ['rules', 'reject', 'neutral'];

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const stacks = body?.stacks as Record<string, Partial<TaskModelStack>> | undefined;

    if (!stacks || typeof stacks !== 'object' || Array.isArray(stacks)) {
      return NextResponse.json({ error: 'Invalid stacks payload' }, { status: 400 });
    }

    const clean: Record<string, Partial<TaskModelStack>> = {};
    for (const [task, entry] of Object.entries(stacks)) {
      const primary = typeof entry?.primary === 'string' ? entry.primary.trim() : '';
      const fallbacks = Array.isArray(entry?.fallbacks)
        ? entry.fallbacks.filter((f: unknown): f is string => typeof f === 'string' && f.trim().length > 0)
        : [];
      const anchor = VALID_ANCHORS.includes(entry?.anchor as TaskAnchor)
        ? (entry.anchor as TaskAnchor)
        : undefined;

      if (!primary && fallbacks.length === 0) continue;
      clean[task] = {
        ...(primary ? { primary } : {}),
        ...(fallbacks.length > 0 ? { fallbacks } : {}),
        ...(anchor ? { anchor } : {}),
      };
    }

    await saveTaskModelStacks(clean);
    const updated = await getAllTaskModelStacks();
    return NextResponse.json({ success: true, stacks: updated });
  } catch (error) {
    console.error('Error saving task model stacks:', error);
    return NextResponse.json(
      { error: 'Failed to save task model stacks', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await clearTaskModelStacks();
    const stacks = await getAllTaskModelStacks();
    return NextResponse.json({ success: true, stacks });
  } catch (error) {
    console.error('Error resetting task model stacks:', error);
    return NextResponse.json(
      { error: 'Failed to reset task model stacks' },
      { status: 500 }
    );
  }
}
