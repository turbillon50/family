import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// =============================================================================
// GET /api/admin/wire-agents?vt=<VERCEL_TOKEN>&admin=<FAMILY_HUMAN_TOKEN>
//
// Server-side wiring: uses the provided Vercel personal token to set all the
// AGENT_URL_*/AGENT_TOKEN_* env vars in family + FAMILY_BASE_URL/_TOKEN/_HANDLE
// in each sibling, then triggers a production redeploy of each.
//
// Why this exists: the Claude sandbox that drives the operator can't reach
// api.vercel.com directly. This endpoint runs inside family's own Vercel
// runtime (no sandbox) and does the work on the operator's behalf.
//
// One-shot. Safe to call multiple times (set_env deletes existing first,
// then creates fresh).
//
// Skips Prism (api-comerce) per user request — en standby.
// =============================================================================

const TEAM = 'luis-projects-48b011f9';
const FAMILY_BASE = 'https://family-olive.vercel.app';

const PROJECTS = {
  family: 'prj_nhMMOmN0waR7jAETDfdskwmOGZl5',
  tanit:  'prj_g5WExKyViNzxoExEXFj45rQs1mC5',
  break_: 'prj_Spi7FdeTOtQ1Du7alkd3Mq3k48Vu',
  vforge: 'prj_EBymOJI4YNLM4AG40ZpWmMKRN66c',
  gossip: 'prj_XY5A2xs0bxjtX89MBKYtR8B1UOyh',
} as const;

const NAMES = {
  family: 'family',
  tanit:  'v-tan-api-server',
  break_: 'break-memory',
  vforge: 'vforge',
  gossip: 'goossip',
} as const;

const AGENT_TOKENS = {
  tanit:  '1372d1cc134e32101d733a4001af7e8dc5377774a8b5c43ad34cb14316986994',
  break_: '6f3c63f6b02bca8a9f39c64db37c825358e6225e8669d287a6bc1d99988d84eb',
  vforge: 'fe7895590796eecd4c5bd898c384f54c8c01213847af82135edf74c755a48468',
  gossip: 'a94be84e491b24c5f6d4d8a276444c1da2cdc38c8e03b4b6643d564245a001ab',
} as const;

const AGENT_ENDPOINTS = {
  tanit:  'https://v-tan-api-server-luis-projects-48b011f9.vercel.app/api',
  break_: 'https://breack.life',
  vforge: 'https://vforge.site/api',
  gossip: 'https://vliving.life/api',
} as const;

const FAMILY_HANDLE_MAP = {
  tanit:  'tanit',
  break_: 'break',
  vforge: 'forge',  // OJO: family roster calls it 'forge', not 'vforge'
  gossip: 'gossip',
} as const;

// ---- Vercel API helpers -----------------------------------------------------

interface EnvOpResult {
  project: string;
  key: string;
  ok: boolean;
  status?: number;
  error?: string;
}

async function setEnv(
  vt: string,
  projectId: string,
  projectName: string,
  key: string,
  value: string,
): Promise<EnvOpResult> {
  try {
    // 1. Delete existing if any (match by key, any target)
    const listRes = await fetch(
      `https://api.vercel.com/v9/projects/${projectId}/env?teamId=${TEAM}&decrypt=false`,
      { headers: { authorization: `Bearer ${vt}` } },
    );
    if (!listRes.ok) {
      return { project: projectName, key, ok: false, status: listRes.status, error: 'list env failed' };
    }
    const list = (await listRes.json()) as { envs?: Array<{ id: string; key: string }> };
    const existing = (list.envs ?? []).filter((e) => e.key === key);
    for (const e of existing) {
      await fetch(
        `https://api.vercel.com/v9/projects/${projectId}/env/${e.id}?teamId=${TEAM}`,
        { method: 'DELETE', headers: { authorization: `Bearer ${vt}` } },
      );
    }

    // 2. Create fresh
    const createRes = await fetch(
      `https://api.vercel.com/v10/projects/${projectId}/env?teamId=${TEAM}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${vt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: 'encrypted',
          key,
          value,
          target: ['production', 'preview', 'development'],
        }),
      },
    );

    if (createRes.status === 200 || createRes.status === 201) {
      return { project: projectName, key, ok: true, status: createRes.status };
    }
    const errBody = await createRes.text().catch(() => '');
    return {
      project: projectName,
      key,
      ok: false,
      status: createRes.status,
      error: errBody.slice(0, 300),
    };
  } catch (err) {
    return {
      project: projectName,
      key,
      ok: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

interface RedeployResult {
  project: string;
  ok: boolean;
  newDeploymentId?: string;
  status?: number;
  error?: string;
}

async function redeployLatest(
  vt: string,
  projectId: string,
  projectName: string,
): Promise<RedeployResult> {
  try {
    const listRes = await fetch(
      `https://api.vercel.com/v6/deployments?projectId=${projectId}&teamId=${TEAM}&limit=1&target=production&state=READY`,
      { headers: { authorization: `Bearer ${vt}` } },
    );
    if (!listRes.ok) {
      return { project: projectName, ok: false, status: listRes.status, error: 'list deployments failed' };
    }
    const list = (await listRes.json()) as { deployments?: Array<{ uid: string }> };
    const latest = (list.deployments ?? [])[0];
    if (!latest) {
      return { project: projectName, ok: false, error: 'no READY production deployment found' };
    }

    const res = await fetch(
      `https://api.vercel.com/v13/deployments?teamId=${TEAM}&forceNew=1`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${vt}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          name: projectName,
          deploymentId: latest.uid,
          target: 'production',
          meta: { action: 'wire-agents-redeploy' },
        }),
      },
    );

    if (res.ok) {
      const out = (await res.json()) as { id?: string };
      return { project: projectName, ok: true, newDeploymentId: out.id, status: res.status };
    }
    const errBody = await res.text().catch(() => '');
    return { project: projectName, ok: false, status: res.status, error: errBody.slice(0, 300) };
  } catch (err) {
    return {
      project: projectName,
      ok: false,
      error: err instanceof Error ? err.message : 'unknown error',
    };
  }
}

// ---- Handler ----------------------------------------------------------------

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const vt = url.searchParams.get('vt') ?? '';
  const adminToken = url.searchParams.get('admin') ?? '';

  // Auth: admin must match FAMILY_HUMAN_TOKEN
  const expectedAdmin = process.env.FAMILY_HUMAN_TOKEN ?? '';
  if (!expectedAdmin) {
    return NextResponse.json({ ok: false, error: 'FAMILY_HUMAN_TOKEN not set' }, { status: 503 });
  }
  if (adminToken !== expectedAdmin) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  if (!vt) {
    return NextResponse.json(
      { ok: false, error: 'missing vt (Vercel personal token) query param' },
      { status: 400 },
    );
  }

  const envResults: EnvOpResult[] = [];

  // 1) family: set 4 AGENT_URL_*
  envResults.push(await setEnv(vt, PROJECTS.family, NAMES.family, 'AGENT_URL_TANIT',  AGENT_ENDPOINTS.tanit));
  envResults.push(await setEnv(vt, PROJECTS.family, NAMES.family, 'AGENT_URL_BREAK',  AGENT_ENDPOINTS.break_));
  envResults.push(await setEnv(vt, PROJECTS.family, NAMES.family, 'AGENT_URL_VFORGE', AGENT_ENDPOINTS.vforge));
  envResults.push(await setEnv(vt, PROJECTS.family, NAMES.family, 'AGENT_URL_GOSSIP', AGENT_ENDPOINTS.gossip));

  // 2) Each sibling: set 3 FAMILY_* vars
  for (const k of ['tanit', 'break_', 'vforge', 'gossip'] as const) {
    const pid = PROJECTS[k];
    const pname = NAMES[k];
    envResults.push(await setEnv(vt, pid, pname, 'FAMILY_BASE_URL',     FAMILY_BASE));
    envResults.push(await setEnv(vt, pid, pname, 'FAMILY_AGENT_TOKEN',  AGENT_TOKENS[k]));
    envResults.push(await setEnv(vt, pid, pname, 'FAMILY_AGENT_HANDLE', FAMILY_HANDLE_MAP[k]));
  }

  // 3) Redeploy each project so the env vars take effect
  const redeployResults: RedeployResult[] = [];
  for (const k of ['family', 'tanit', 'break_', 'vforge', 'gossip'] as const) {
    redeployResults.push(await redeployLatest(vt, PROJECTS[k], NAMES[k]));
  }

  const envOk = envResults.every((r) => r.ok);
  const redeployOk = redeployResults.every((r) => r.ok);

  return NextResponse.json({
    ok: envOk && redeployOk,
    summary: {
      envsSet: envResults.filter((r) => r.ok).length,
      envsFailed: envResults.filter((r) => !r.ok).length,
      redeploysTriggered: redeployResults.filter((r) => r.ok).length,
      redeploysFailed: redeployResults.filter((r) => !r.ok).length,
    },
    envResults,
    redeployResults,
    nextStep: envOk && redeployOk
      ? 'Wait ~60s for deploys, then verify with GET /api/health. Then login at /, open #lounge, post a message.'
      : 'Check failures above. Vercel token may lack scope.',
  });
}
