import { NextResponse } from 'next/server';
import { syncAckBodySchema } from '@/lib/types';
import { authenticate } from '@/lib/auth/token';
import { listAcks, recordAck } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync-ack — agent confirms it persisted the message in its DB.
export async function POST(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth || auth.kind !== 'agent') {
    return new Response('unauthorized', { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const parsed = syncAckBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  if (parsed.data.agent !== auth.handle) {
    return new Response('agent mismatch', { status: 403 });
  }

  await recordAck(parsed.data.messageId, parsed.data.agent, {
    externalRef: parsed.data.externalRef ?? null,
    error: parsed.data.error ?? null,
  });
  return NextResponse.json({ ok: true });
}

// GET /api/sync-ack?messageId=<id> — audit.
export async function GET(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth) return new Response('unauthorized', { status: 401 });

  const url = new URL(req.url);
  const messageId = url.searchParams.get('messageId');
  if (!messageId) return new Response('missing messageId', { status: 400 });

  const syncs = await listAcks(messageId);
  return NextResponse.json({ syncs });
}
