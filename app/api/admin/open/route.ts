import { NextRequest, NextResponse } from 'next/server';
import { HUMAN_COOKIE } from '@/lib/auth/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEAM = 'luis-projects-48b011f9';

// GET /api/admin/open?vt=<VERCEL_TOKEN>
//
// Lee FAMILY_HUMAN_TOKEN del env runtime (NO lo modifica) y settea la cookie
// family_session para Luí. Redirige a /chat/lounge.
//
// Auth: vt válido contra Vercel API (si Vercel lo acepta, eres dueño).
export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const vt = url.searchParams.get('vt') ?? '';
  if (!vt) return new Response('missing vt', { status: 400 });

  // Validate vt against Vercel API
  const userCheck = await fetch(`https://api.vercel.com/v2/user?teamId=${TEAM}`, {
    headers: { authorization: `Bearer ${vt}` },
  });
  if (!userCheck.ok) {
    return new Response(`vt invalid (Vercel ${userCheck.status})`, { status: 401 });
  }

  const humanToken = process.env.FAMILY_HUMAN_TOKEN ?? '';
  if (!humanToken) {
    return new Response('FAMILY_HUMAN_TOKEN not configured in this deployment', { status: 503 });
  }

  const target = url.searchParams.get('to') ?? '/chat/lounge';
  const res = NextResponse.redirect(new URL(target, req.url), 302);
  res.cookies.set(HUMAN_COOKIE, humanToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
