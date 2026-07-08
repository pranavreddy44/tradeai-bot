import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// DELETE /api/news/[id] - Delete a single news item by ID
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.newsItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: 'News item not found' },
        { status: 404 }
      );
    }

    await db.newsItem.delete({ where: { id } });
    return NextResponse.json({ success: true, deleted: 1 });
  } catch (error) {
    console.error('Error deleting news item:', error);
    return NextResponse.json(
      { error: 'Failed to delete news item' },
      { status: 500 }
    );
  }
}
