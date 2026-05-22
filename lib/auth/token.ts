import type { AgentHandle } from '../types';
import { getAgent, resolveToken } from '../agents/registry';

// =============================================================================
// Auth — bearer tokens per agent + a session cookie for Luí.
// =============================================================================
// Family does not run an OIDC stack on purpose: the trust circle is small
// (Luí + 5 agents) and rotating a token is faster than re-issuing keys.
// Every agent gets its own AGENT_TOKEN_* — leaked tokens revoke independently.

export const HUMAN_COOKIE = 'family_session';

export interface AuthedAs {
  handle: AgentHandle;
  kind: 'human' | 'agent';
}

/**
 * Reads a Bearer token and matches it against the static roster.
 * Returns the agent it belongs to, or null.
 */
export function authFromBearer(authHeader: string | null): AuthedAs | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return null;
  const token = match[1].trim();
  if (!token) return null;

  for (const handle of ['tanit', 'break', 'forge', 'gossip', 'prism'] as const) {
    const expected = resolveToken(handle);
    if (expected && timingSafeEqual(token, expected)) {
      return { handle, kind: getAgent(handle).kind };
    }
  }
  return null;
}

/**
 * Reads the session cookie and validates it against FAMILY_HUMAN_TOKEN
 * (or the fixed "demo" value when FAMILY_DEMO_MODE=1).
 * Luí's UI sets this cookie httpOnly after he submits the token once.
 */
export function authFromCookie(cookieHeader: string | null): AuthedAs | null {
  if (!cookieHeader) return null;
  const expected =
    process.env.FAMILY_DEMO_MODE === '1'
      ? 'demo'
      : process.env.FAMILY_HUMAN_TOKEN;
  if (!expected) return null;

  const parts = cookieHeader.split(/;\s*/);
  for (const p of parts) {
    const [k, ...rest] = p.split('=');
    if (k === HUMAN_COOKIE) {
      const value = decodeURIComponent(rest.join('='));
      if (timingSafeEqual(value, expected)) {
        return { handle: 'lui', kind: 'human' };
      }
    }
  }
  return null;
}

/**
 * Combined helper: try cookie first (browser), then bearer (agent).
 */
export function authenticate(req: Request): AuthedAs | null {
  return (
    authFromCookie(req.headers.get('cookie')) ??
    authFromBearer(req.headers.get('authorization'))
  );
}

// Constant-time string compare. Native `===` would be timing-leaky for tokens.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
