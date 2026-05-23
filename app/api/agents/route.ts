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

  // Modo presentación: cuando vForge aún no ha levantado los webhooks reales
  // de los hermanos, los queremos ver "online" en el roster para que se
  // conozcan en la sala — aunque su /family-incoming no esté configurado
  // todavía (eso se sigue señalando con `endpointConfigured: false`).
  const forceOnline = process.env.FAMILY_ALWAYS_ONLINE === '1';

  const agents = rows.map((a) => {
    const updatedAt = a.presence.updatedAt
      ? new Date(a.presence.updatedAt).getTime()
      : 0;
    const stale = !updatedAt || now - updatedAt > 60_000;

    // Si el hermano tiene un heartbeat reciente respetamos su status real
    // (incluido 'busy' / 'away'). Sólo cuando está stale Y el flag está
    // activo lo presentamos como online de cortesía.
    const status = !stale
      ? a.presence.status
      : forceOnline && a.kind === 'agent'
        ? 'online'
        : 'offline';

    return {
      handle: a.handle,
      displayName: a.displayName,
      role: a.role,
      kind: a.kind,
      accentColor: a.accentColor,
      endpointConfigured:
        a.kind === 'human' ? null : !!resolveEndpoint(a.handle as never),
      presence: {
        status,
        note: a.presence.note,
        updatedAt: a.presence.updatedAt,
      },
    };
  });

  return NextResponse.json({ agents });
}
