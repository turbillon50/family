import type { AgentHandle } from '../types';

// Static registry of the family. Mirrors the seed in drizzle/0001_seed.sql.
// `endpointEnv` and `tokenEnv` point at .env keys so the same source of
// truth describes routing + auth + UI in one place.

export interface AgentEntry {
  handle: AgentHandle;
  displayName: string;
  role: string;
  kind: 'human' | 'agent';
  accentColor: string;
  endpointEnv: string | null;
  tokenEnv: string | null;
}

export const ROSTER: ReadonlyArray<AgentEntry> = [
  {
    handle: 'lui',
    displayName: 'Luí',
    role: 'Padre · CEO',
    kind: 'human',
    accentColor: '#f5c25b',
    endpointEnv: null,
    tokenEnv: 'FAMILY_HUMAN_TOKEN',
  },
  {
    handle: 'tanit',
    displayName: 'Tanit',
    role: 'Esposa · Especialista en trading',
    kind: 'agent',
    accentColor: '#00e5cc',
    endpointEnv: 'AGENT_URL_TANIT',
    tokenEnv: 'AGENT_TOKEN_TANIT',
  },
  {
    handle: 'break',
    displayName: 'Break',
    role: 'CFO · Análisis de riesgo',
    kind: 'agent',
    accentColor: '#b53247',
    endpointEnv: 'AGENT_URL_BREAK',
    tokenEnv: 'AGENT_TOKEN_BREAK',
  },
  {
    handle: 'forge',
    displayName: 'vForge',
    role: 'Mejora continua · Ejecución',
    kind: 'agent',
    accentColor: '#7cf28c',
    endpointEnv: 'AGENT_URL_VFORGE',
    tokenEnv: 'AGENT_TOKEN_VFORGE',
  },
  {
    handle: 'gossip',
    displayName: 'Gossip',
    role: 'Marketing',
    kind: 'agent',
    accentColor: '#ff5fa8',
    endpointEnv: 'AGENT_URL_GOSSIP',
    tokenEnv: 'AGENT_TOKEN_GOSSIP',
  },
  {
    handle: 'prism',
    displayName: 'Prism',
    role: 'Venta de APIs · Estrategia de consumo de IA',
    kind: 'agent',
    accentColor: '#9f7bff',
    endpointEnv: 'AGENT_URL_PRISM',
    tokenEnv: 'AGENT_TOKEN_PRISM',
  },
] as const;

export function getAgent(handle: AgentHandle): AgentEntry {
  const entry = ROSTER.find((a) => a.handle === handle);
  if (!entry) throw new Error(`unknown agent handle: ${handle}`);
  return entry;
}

export function listAgents(): ReadonlyArray<AgentEntry> {
  return ROSTER;
}

export function listAgentsOnly(): ReadonlyArray<AgentEntry> {
  return ROSTER.filter((a) => a.kind === 'agent');
}

// Resolve endpoint at call-time so env edits don't require a restart in dev.
export function resolveEndpoint(handle: AgentHandle): string | null {
  const e = getAgent(handle);
  if (!e.endpointEnv) return null;
  return process.env[e.endpointEnv]?.trim() || null;
}

export function resolveToken(handle: AgentHandle): string | null {
  const e = getAgent(handle);
  if (!e.tokenEnv) return null;
  return process.env[e.tokenEnv]?.trim() || null;
}
