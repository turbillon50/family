import { NextResponse } from 'next/server';
import { HUMAN_COOKIE } from '@/lib/auth/token';
import { isDemoMode } from '@/lib/repo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// In demo mode, any non-empty token is accepted and the cookie carries the
// fixed "demo" string — keeps the auth path identical so the rest of the
// stack doesn't branch on demo vs prod.
const DEMO_TOKEN = 'demo';

// POST /api/session
// Body: { token: string }
// Validates the human token and, if it matches FAMILY_HUMAN_TOKEN, drops an
// httpOnly cookie so Luí stays signed in. No DB write — the only "session"
// is the cookie itself.
export async function POST(req: Request): Promise<Response> {
  let body: { token?: unknown };
  try {
    body = (await req.json()) as { token?: unknown };
  } catch {
    return new Response('invalid json', { status: 400 });
  }

  const token = typeof body.token === 'string' ? body.token : '';

  const expected = isDemoMode()
    ? DEMO_TOKEN
    : process.env.FAMILY_HUMAN_TOKEN;

  if (!expected) {
    return new Response('FAMILY_HUMAN_TOKEN not configured', { status: 503 });
  }

  // Demo: accept any non-empty token, store the fixed cookie value.
  const effective = isDemoMode() ? (token ? DEMO_TOKEN : '') : token;

  if (effective.length !== expected.length || effective !== expected) {
    return new Response('invalid token', { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(HUMAN_COOKIE, effective, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

// DELETE /api/session — logout.
export async function DELETE(): Promise<Response> {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(HUMAN_COOKIE);
  return res;
}
