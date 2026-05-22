import { NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth/token';
import { listChannels } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth) return new Response('unauthorized', { status: 401 });

  const channels = await listChannels();
  return NextResponse.json({ channels });
}
