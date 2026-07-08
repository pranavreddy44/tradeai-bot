import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/ai/chat/history - Return chat messages from DB
export async function GET() {
  try {
    const messages = await db.chatMessage.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        model: m.model,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error('Error fetching chat history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat history' },
      { status: 500 }
    );
  }
}

// POST /api/ai/chat/history - Save a new chat message to DB
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { role, content, model } = body;

    if (!role || !content) {
      return NextResponse.json(
        { error: 'Role and content are required' },
        { status: 400 }
      );
    }

    if (role !== 'user' && role !== 'assistant') {
      return NextResponse.json(
        { error: 'Role must be "user" or "assistant"' },
        { status: 400 }
      );
    }

    const message = await db.chatMessage.create({
      data: {
        role,
        content,
        model: model || 'Qwen/Qwen3-32B',
      },
    });

    return NextResponse.json({
      message: {
        id: message.id,
        role: message.role,
        content: message.content,
        model: message.model,
        createdAt: message.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error saving chat message:', error);
    return NextResponse.json(
      { error: 'Failed to save chat message' },
      { status: 500 }
    );
  }
}

// DELETE /api/ai/chat/history - Clear all chat history
export async function DELETE() {
  try {
    await db.chatMessage.deleteMany();

    return NextResponse.json({
      success: true,
      message: 'Chat history cleared',
    });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    return NextResponse.json(
      { error: 'Failed to clear chat history' },
      { status: 500 }
    );
  }
}
