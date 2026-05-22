import { NextResponse } from 'next/server';
import { asc } from 'drizzle-orm';
import { db, schema } from '@/lib/db/client';
import { authenticate } from '@/lib/auth/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/channels — all channels in lexical order. The UI uses this for
// the sidebar.
export async function GET(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth) return new Response('unauthorized', { status: 401 });

  const rows = await db
    .select()
    .from(schema.channels)
    .orderBy(asc(schema.channels.slug));

  return NextResponse.json({ channels: rows });
}
