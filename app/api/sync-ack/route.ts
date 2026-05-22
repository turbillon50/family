import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { syncAckBodySchema } from '@/lib/types';
import { authenticate } from '@/lib/auth/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/sync-ack
// Body: { messageId, agent, externalRef?, error? }
//
// Called by each agent AFTER it has persisted the message into its own
// private database (tanit_chat for Tanit, etc.). The bearer token must
// belong to the same agent it claims to be ACKing for — no impersonation.
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

  const ok = !parsed.data.error;

  await db
    .insert(schema.agentSyncLog)
    .values({
      messageId: parsed.data.messageId,
      agentHandle: parsed.data.agent,
      state: ok ? 'acked' : 'failed',
      attempts: 1,
      lastError: parsed.data.error ?? null,
      externalRef: parsed.data.externalRef ?? null,
      ackedAt: ok ? new Date() : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.agentSyncLog.messageId, schema.agentSyncLog.agentHandle],
      set: {
        state: ok ? 'acked' : 'failed',
        lastError: parsed.data.error ?? null,
        externalRef: parsed.data.externalRef ?? null,
        ackedAt: ok ? new Date() : undefined,
        updatedAt: new Date(),
      },
    });

  // Confirm receipt back to the agent.
  return NextResponse.json({ ok: true });
}

// GET /api/sync-ack?messageId=<id>
// Lets Luí audit a message: which agents have it in their own DB?
export async function GET(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth) return new Response('unauthorized', { status: 401 });

  const url = new URL(req.url);
  const messageId = url.searchParams.get('messageId');
  if (!messageId) return new Response('missing messageId', { status: 400 });

  const rows = await db.query.agentSyncLog.findMany({
    where: eq(schema.agentSyncLog.messageId, messageId),
  });

  return NextResponse.json({ syncs: rows });
}
