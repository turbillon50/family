import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { presenceHeartbeatSchema } from '@/lib/types';
import { authenticate } from '@/lib/auth/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/presence
// Heartbeat from any roster member. Body: { status, note? }.
// Stale rows (older than 60s) read as offline in /api/agents.
export async function POST(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth) return new Response('unauthorized', { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = presenceHeartbeatSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'bad request', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  await db
    .insert(schema.presence)
    .values({
      handle: auth.handle,
      status: parsed.data.status,
      note: parsed.data.note ?? null,
    })
    .onConflictDoUpdate({
      target: schema.presence.handle,
      set: {
        status: parsed.data.status,
        note: parsed.data.note ?? null,
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}
