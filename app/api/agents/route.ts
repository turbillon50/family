import { NextResponse } from 'next/server';
import { resolveEndpoint } from '@/lib/agents/registry';
import { authenticate } from '@/lib/auth/token';
import { listAgentsWithPresence } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/agents — roster + live presence + endpoint configured?
export async function GET(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth) return new Response('unauthorized', { status: 401 });

  const rows = await listAgentsWithPresence();
  const now = Date.now();

  const agents = rows.map((a) => {
    const updatedAt = a.presence.updatedAt
      ? new Date(a.presence.updatedAt).getTime()
      : 0;
    const stale = !updatedAt || now - updatedAt > 60_000;
    return {
      handle: a.handle,
      displayName: a.displayName,
      role: a.role,
      kind: a.kind,
      accentColor: a.accentColor,
      endpointConfigured:
        a.kind === 'human' ? null : !!resolveEndpoint(a.handle as never),
      presence: {
        status: !stale ? a.presence.status : 'offline',
        note: a.presence.note,
        updatedAt: a.presence.updatedAt,
      },
    };
  });

  return NextResponse.json({ agents });
}
