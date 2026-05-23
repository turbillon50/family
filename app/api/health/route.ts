import { NextResponse } from 'next/server';
import { listAgents } from '@/lib/agents/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/health
//
// Public diagnostic endpoint (no auth). Reveals only WHICH env vars are
// configured, never their values. Useful to debug 401s and "agent
// endpoint not configured" errors without spelunking through Vercel UI.
//
// Safe to expose publicly: returns booleans + the agent roster (which is
// already hardcoded in lib/agents/registry and visible to anyone logged in).
export async function GET(): Promise<Response> {
  const env = process.env;

  const agentEndpoints = listAgents()
    .filter((a) => a.kind === 'agent')
    .map((a) => ({
      handle: a.handle,
      tokenEnvVar: a.tokenEnv,
      tokenConfigured: !!(a.tokenEnv && (env[a.tokenEnv] ?? '').trim()),
      endpointEnvVar: a.endpointEnv,
      endpointConfigured: !!(a.endpointEnv && (env[a.endpointEnv] ?? '').trim()),
      endpointValue:
        a.endpointEnv && env[a.endpointEnv] ? (env[a.endpointEnv] as string) : null,
    }));

  return NextResponse.json({
    ok: true,
    version: '0.1.0',
    runtime: 'nodejs',
    timestamp: new Date().toISOString(),
    deploy: {
      vercelEnv: env.VERCEL_ENV ?? null,
      vercelUrl: env.VERCEL_URL ?? null,
      gitCommitSha: env.VERCEL_GIT_COMMIT_SHA ?? null,
      gitCommitRef: env.VERCEL_GIT_COMMIT_REF ?? null,
    },
    config: {
      databaseUrlConfigured: !!(env.DATABASE_URL ?? '').trim(),
      databaseUrlUnpooledConfigured: !!(env.DATABASE_URL_UNPOOLED ?? '').trim(),
      humanTokenConfigured: !!(env.FAMILY_HUMAN_TOKEN ?? '').trim(),
      demoMode: env.FAMILY_DEMO_MODE === '1',
      alwaysOnline: env.FAMILY_ALWAYS_ONLINE === '1',
      inlineFanout: env.FAMILY_INLINE_FANOUT === '1',
      publicUrl: env.FAMILY_PUBLIC_URL ?? null,
      deliveryMaxAttempts: Number(env.DELIVERY_MAX_ATTEMPTS ?? 5),
      deliveryTimeoutMs: Number(env.DELIVERY_TIMEOUT_MS ?? 15000),
    },
    agents: agentEndpoints,
    diagnostics: {
      readyForHumanLogin: !!(env.FAMILY_HUMAN_TOKEN ?? '').trim() || env.FAMILY_DEMO_MODE === '1',
      readyForFanout: agentEndpoints.every((a) => a.endpointConfigured && a.tokenConfigured),
      missingForFanout: agentEndpoints
        .filter((a) => !a.endpointConfigured || !a.tokenConfigured)
        .map((a) => ({
          handle: a.handle,
          missing: [
            ...(!a.endpointConfigured ? [a.endpointEnvVar] : []),
            ...(!a.tokenConfigured ? [a.tokenEnvVar] : []),
          ],
        })),
    },
  });
}
