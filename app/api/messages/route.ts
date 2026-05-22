import { NextResponse } from 'next/server';

import { postMessageBodySchema } from '@/lib/types';
import { extractMentions } from '@/lib/dispatcher/mention-router';
import { authenticate } from '@/lib/auth/token';
import {
  channelExists,
  createMessage,
  getMessageById,
  isDemoMode,
  listMessages,
} from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/messages?channel=lounge[&id=…|&limit=…&before=…]
export async function GET(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth) return new Response('unauthorized', { status: 401 });

  const url = new URL(req.url);
  const channel = url.searchParams.get('channel');
  if (!channel) return new Response('missing channel', { status: 400 });

  // Puntual: una sola fila por id. Usado por la UI al recibir un id por SSE.
  const wantedId = url.searchParams.get('id');
  if (wantedId) {
    const row = await getMessageById(channel, wantedId);
    return NextResponse.json({ messages: row ? [row] : [] });
  }

  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200);
  const before = url.searchParams.get('before') ?? undefined;

  const messages = await listMessages(channel, { limit, beforeId: before });
  return NextResponse.json({ messages });
}

// POST /api/messages
// Body: { channel, content, payload?, replyTo? }
export async function POST(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth) return new Response('unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const parsed = postMessageBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (!(await channelExists(parsed.data.channel))) {
    return new Response('channel not found', { status: 404 });
  }

  const mentioned = extractMentions(parsed.data.content);

  const { id } = await createMessage({
    channelSlug: parsed.data.channel,
    senderHandle: auth.handle,
    content: parsed.data.content,
    payload: parsed.data.payload ?? null,
    replyTo: parsed.data.replyTo ?? null,
    mentions: mentioned,
  });

  // Best-effort fan-out for dev (skipped in demo mode — no agents to call).
  if (!isDemoMode() && process.env.FAMILY_INLINE_FANOUT === '1') {
    const { fanOutMessage } = await import(
      '@/lib/dispatcher/webhook-fanout'
    );
    void fanOutMessage(id).catch((err) =>
      console.error('inline fanout failed:', err),
    );
  }

  return NextResponse.json({ id }, { status: 201 });
}
