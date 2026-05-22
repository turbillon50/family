import { NextResponse } from 'next/server';
import { desc, eq, lt, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';

import { db, schema } from '@/lib/db/client';
import { postMessageBodySchema } from '@/lib/types';
import { extractMentions } from '@/lib/dispatcher/mention-router';
import { authenticate } from '@/lib/auth/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/messages?channel=lounge&limit=50&before=<msgId>
// Returns the most recent messages for a channel, paginated by id.
export async function GET(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth) return new Response('unauthorized', { status: 401 });

  const url = new URL(req.url);
  const channel = url.searchParams.get('channel');
  if (!channel) {
    return new Response('missing channel', { status: 400 });
  }

  // Puntual: traer un solo mensaje por id. Usado por la UI cuando el SSE
  // anuncia un id nuevo y necesita hidratar el contenido.
  const wantedId = url.searchParams.get('id');
  if (wantedId) {
    const row = await db.query.messages.findFirst({
      where: and(
        eq(schema.messages.id, wantedId),
        eq(schema.messages.channelSlug, channel),
      ),
    });
    return NextResponse.json({ messages: row ? [row] : [] });
  }

  const limit = Math.min(
    Number(url.searchParams.get('limit') ?? 50),
    200,
  );
  const before = url.searchParams.get('before');

  let beforeAt: Date | null = null;
  if (before) {
    const row = await db.query.messages.findFirst({
      where: eq(schema.messages.id, before),
    });
    if (row) beforeAt = row.createdAt;
  }

  const rows = await db.query.messages.findMany({
    where: beforeAt
      ? and(
          eq(schema.messages.channelSlug, channel),
          lt(schema.messages.createdAt, beforeAt),
        )
      : eq(schema.messages.channelSlug, channel),
    orderBy: desc(schema.messages.createdAt),
    limit,
  });

  return NextResponse.json({ messages: rows.reverse() });
}

// POST /api/messages
// Body: { channel, content, payload?, replyTo? }
// Persists the message, indexes its mentions, and lets the LISTEN/NOTIFY
// trigger kick the fan-out worker. We also fire a best-effort in-process
// fan-out so dev (without the worker running) still delivers.
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

  const channel = await db.query.channels.findFirst({
    where: eq(schema.channels.slug, parsed.data.channel),
  });
  if (!channel) return new Response('channel not found', { status: 404 });

  const id = nanoid(16);
  const mentioned = extractMentions(parsed.data.content);

  await db.insert(schema.messages).values({
    id,
    channelSlug: parsed.data.channel,
    senderHandle: auth.handle,
    content: parsed.data.content,
    payload: parsed.data.payload ?? null,
    replyTo: parsed.data.replyTo ?? null,
  });

  if (mentioned.length > 0) {
    await db
      .insert(schema.mentions)
      .values(mentioned.map((handle) => ({ messageId: id, handle })))
      .onConflictDoNothing();
  }

  // Best-effort: dev path triggers fan-out inline. In prod the worker takes
  // over via LISTEN/NOTIFY. If both run, sync_log upserts are idempotent.
  if (process.env.FAMILY_INLINE_FANOUT === '1') {
    const { fanOutMessage } = await import(
      '@/lib/dispatcher/webhook-fanout'
    );
    void fanOutMessage(id).catch((err) =>
      console.error('inline fanout failed:', err),
    );
  }

  return NextResponse.json({ id }, { status: 201 });
}
