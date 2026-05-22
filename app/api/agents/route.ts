import { NextResponse } from 'next/server';
import { db, schema } from '@/lib/db/client';
import { listAgents, resolveEndpoint } from '@/lib/agents/registry';
import { authenticate } from '@/lib/auth/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/agents — roster + live presence + endpoint configured?
export async function GET(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth) return new Response('unauthorized', { status: 401 });

  const presenceRows = await db.select().from(schema.presence);
  const presenceMap = new Map(presenceRows.map((p) => [p.handle, p]));

  const now = Date.now();
  const roster = listAgents().map((a) => {
    const p = presenceMap.get(a.handle);
    const isStale = p
      ? now - new Date(p.updatedAt).getTime() > 60_000
      : true;
    return {
      handle: a.handle,
      displayName: a.displayName,
      role: a.role,
      kind: a.kind,
      accentColor: a.accentColor,
      endpointConfigured: a.kind === 'human' ? null : !!resolveEndpoint(a.handle),
      presence: {
        status: p && !isStale ? p.status : 'offline',
        note: p?.note ?? null,
        updatedAt: p?.updatedAt ?? null,
      },
    };
  });

  return NextResponse.json({ agents: roster });
}
