import { NextResponse } from 'next/server';
import { HUMAN_COOKIE } from '@/lib/auth/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
  const expected = process.env.FAMILY_HUMAN_TOKEN;

  if (!expected) {
    return new Response('FAMILY_HUMAN_TOKEN not configured', { status: 503 });
  }

  if (token.length !== expected.length || token !== expected) {
    return new Response('invalid token', { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(HUMAN_COOKIE, token, {
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
