import { NextResponse } from 'next/server';
import { presenceHeartbeatSchema } from '@/lib/types';
import { authenticate } from '@/lib/auth/token';
import { setPresence } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  await setPresence(auth.handle, parsed.data.status, parsed.data.note ?? null);
  return NextResponse.json({ ok: true });
}
