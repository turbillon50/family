import { nanoid } from 'nanoid';
import { and, asc, desc, eq, lt } from 'drizzle-orm';

import type { AgentHandle } from './types';
import { ensureSeeded } from './demo/seed';
import { getDemoStore } from './demo/store';

// =============================================================================
// Repository layer.
// =============================================================================
// Every API route goes through this module so we have exactly two
// implementations to keep in sync: Neon (default) and in-memory demo
// (when FAMILY_DEMO_MODE=1).
//
// In demo mode we don't touch the DB at all — useful for previews, local
// onboarding before Neon is wired, and screenshots.

export function isDemoMode(): boolean {
  if (process.env.FAMILY_DEMO_MODE === '1') return true;
  // Safety net: in any environment without a database wired up (typical for
  // first-time Vercel previews), fall back to the in-memory store rather
  // than crash. The login page still surfaces the demo banner.
  if (!process.env.DATABASE_URL) {
    if (!warnedAutoDemo) {
      console.warn(
        '[family] DATABASE_URL not set — running in demo mode (in-memory).',
      );
      warnedAutoDemo = true;
    }
    return true;
  }
  return false;
}

let warnedAutoDemo = false;

// ---- Public types returned to routes / UI ----------------------------------

export interface RepoMessage {
  id: string;
  channelSlug: string;
  senderHandle: string;
  content: string;
  payload: Record<string, unknown> | null;
  replyTo: string | null;
  createdAt: string;
}

export interface RepoChannel {
  slug: string;
  name: string;
  purpose: string;
  ownerHandle: string | null;
  appendOnly: number;
  createdAt: string;
}

export interface RepoAgent {
  handle: string;
  displayName: string;
  role: string;
  kind: 'human' | 'agent';
  accentColor: string;
  endpointUrl: string | null;
  createdAt: string;
}

export interface RepoPresence {
  handle: string;
  status: string;
  note: string | null;
  updatedAt: string | null;
}

export interface RepoSyncLogRow {
  messageId: string;
  agentHandle: string;
  state: 'pending' | 'delivered' | 'acked' | 'failed';
  attempts: number;
  lastError: string | null;
  externalRef: string | null;
  deliveredAt: string | null;
  ackedAt: string | null;
  updatedAt: string;
}

// ---- Channels --------------------------------------------------------------

export async function listChannels(): Promise<RepoChannel[]> {
  if (isDemoMode()) {
    ensureSeeded();
    return [...getDemoStore().channels.values()]
      .sort((a, b) => a.slug.localeCompare(b.slug))
      .map(serializeChannel);
  }
  const { db, schema } = await loadDb();
  const rows = await db
    .select()
    .from(schema.channels)
    .orderBy(asc(schema.channels.slug));
  return rows.map(serializeChannel);
}

// ---- Agents + presence -----------------------------------------------------

export async function listAgentsWithPresence(): Promise<
  Array<RepoAgent & { presence: RepoPresence }>
> {
  if (isDemoMode()) {
    ensureSeeded();
    const s = getDemoStore();
    return [...s.agents.values()].map((a) => {
      const p = s.presence.get(a.handle);
      return {
        ...serializeAgent(a),
        presence: p
          ? {
              handle: p.handle,
              status: p.status,
              note: p.note,
              updatedAt: p.updatedAt.toISOString(),
            }
          : { handle: a.handle, status: 'offline', note: null, updatedAt: null },
      };
    });
  }

  const { db, schema } = await loadDb();
  const agentRows = await db.select().from(schema.agents);
  const presenceRows = await db.select().from(schema.presence);
  const pMap = new Map(presenceRows.map((p) => [p.handle, p]));
  return agentRows.map((a) => {
    const p = pMap.get(a.handle);
    return {
      ...serializeAgent(a),
      presence: p
        ? {
            handle: p.handle,
            status: p.status,
            note: p.note,
            updatedAt: p.updatedAt.toISOString(),
          }
        : { handle: a.handle, status: 'offline', note: null, updatedAt: null },
    };
  });
}

// ---- Messages --------------------------------------------------------------

export async function getMessageById(
  channelSlug: string,
  id: string,
): Promise<RepoMessage | null> {
  if (isDemoMode()) {
    ensureSeeded();
    const m = getDemoStore().messages.get(id);
    if (!m || m.channelSlug !== channelSlug) return null;
    return serializeMessage(m);
  }
  const { db, schema } = await loadDb();
  const row = await db.query.messages.findFirst({
    where: and(
      eq(schema.messages.id, id),
      eq(schema.messages.channelSlug, channelSlug),
    ),
  });
  return row ? serializeMessage(row) : null;
}

export async function listMessages(
  channelSlug: string,
  opts: { limit: number; beforeId?: string },
): Promise<RepoMessage[]> {
  if (isDemoMode()) {
    ensureSeeded();
    const s = getDemoStore();
    let rows = [...s.messages.values()]
      .filter((m) => m.channelSlug === channelSlug)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    if (opts.beforeId) {
      const before = s.messages.get(opts.beforeId);
      if (before) {
        rows = rows.filter((m) => m.createdAt < before.createdAt);
      }
    }
    return rows.slice(-opts.limit).map(serializeMessage);
  }

  const { db, schema } = await loadDb();
  let beforeAt: Date | null = null;
  if (opts.beforeId) {
    const row = await db.query.messages.findFirst({
      where: eq(schema.messages.id, opts.beforeId),
    });
    if (row) beforeAt = row.createdAt;
  }
  const rows = await db.query.messages.findMany({
    where: beforeAt
      ? and(
          eq(schema.messages.channelSlug, channelSlug),
          lt(schema.messages.createdAt, beforeAt),
        )
      : eq(schema.messages.channelSlug, channelSlug),
    orderBy: desc(schema.messages.createdAt),
    limit: opts.limit,
  });
  return rows.reverse().map(serializeMessage);
}

export interface CreateMessageInput {
  channelSlug: string;
  senderHandle: AgentHandle;
  content: string;
  payload?: Record<string, unknown> | null;
  replyTo?: string | null;
  mentions: AgentHandle[];
}

export async function createMessage(
  input: CreateMessageInput,
): Promise<{ id: string }> {
  const id = nanoid(16);

  if (isDemoMode()) {
    ensureSeeded();
    const s = getDemoStore();
    if (!s.channels.has(input.channelSlug)) {
      throw new Error(`channel ${input.channelSlug} not found`);
    }
    const message = {
      id,
      channelSlug: input.channelSlug,
      senderHandle: input.senderHandle,
      content: input.content,
      payload: input.payload ?? null,
      replyTo: input.replyTo ?? null,
      createdAt: new Date(),
    };
    s.messages.set(id, message);
    if (input.mentions.length > 0) {
      s.mentions.set(
        id,
        input.mentions.map((handle) => ({ messageId: id, handle })),
      );
    }
    s.emitMessage(message);
    return { id };
  }

  const { db, schema } = await loadDb();
  await db.insert(schema.messages).values({
    id,
    channelSlug: input.channelSlug,
    senderHandle: input.senderHandle,
    content: input.content,
    payload: input.payload ?? null,
    replyTo: input.replyTo ?? null,
  });
  if (input.mentions.length > 0) {
    await db
      .insert(schema.mentions)
      .values(input.mentions.map((handle) => ({ messageId: id, handle })))
      .onConflictDoNothing();
  }
  return { id };
}

export async function channelExists(slug: string): Promise<boolean> {
  if (isDemoMode()) {
    ensureSeeded();
    return getDemoStore().channels.has(slug);
  }
  const { db, schema } = await loadDb();
  const row = await db.query.channels.findFirst({
    where: eq(schema.channels.slug, slug),
  });
  return !!row;
}

// ---- Presence --------------------------------------------------------------

export async function setPresence(
  handle: AgentHandle,
  status: string,
  note: string | null,
): Promise<void> {
  if (isDemoMode()) {
    ensureSeeded();
    getDemoStore().presence.set(handle, {
      handle,
      status,
      note,
      updatedAt: new Date(),
    });
    return;
  }
  const { db, schema } = await loadDb();
  await db
    .insert(schema.presence)
    .values({ handle, status, note })
    .onConflictDoUpdate({
      target: schema.presence.handle,
      set: { status, note, updatedAt: new Date() },
    });
}

// ---- Sync log --------------------------------------------------------------

export async function recordAck(
  messageId: string,
  agentHandle: AgentHandle,
  result: { externalRef?: string | null; error?: string | null },
): Promise<void> {
  const ok = !result.error;
  if (isDemoMode()) {
    ensureSeeded();
    const s = getDemoStore();
    s.syncLog.set(s.syncKey(messageId, agentHandle), {
      messageId,
      agentHandle,
      state: ok ? 'acked' : 'failed',
      attempts: 1,
      lastError: result.error ?? null,
      externalRef: result.externalRef ?? null,
      deliveredAt: null,
      ackedAt: ok ? new Date() : null,
      updatedAt: new Date(),
    });
    return;
  }
  const { db, schema } = await loadDb();
  await db
    .insert(schema.agentSyncLog)
    .values({
      messageId,
      agentHandle,
      state: ok ? 'acked' : 'failed',
      attempts: 1,
      lastError: result.error ?? null,
      externalRef: result.externalRef ?? null,
      ackedAt: ok ? new Date() : null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.agentSyncLog.messageId, schema.agentSyncLog.agentHandle],
      set: {
        state: ok ? 'acked' : 'failed',
        lastError: result.error ?? null,
        externalRef: result.externalRef ?? null,
        ackedAt: ok ? new Date() : undefined,
        updatedAt: new Date(),
      },
    });
}

export async function listAcks(messageId: string): Promise<RepoSyncLogRow[]> {
  if (isDemoMode()) {
    ensureSeeded();
    const out: RepoSyncLogRow[] = [];
    for (const row of getDemoStore().syncLog.values()) {
      if (row.messageId === messageId) {
        out.push({
          ...row,
          deliveredAt: row.deliveredAt?.toISOString() ?? null,
          ackedAt: row.ackedAt?.toISOString() ?? null,
          updatedAt: row.updatedAt.toISOString(),
        });
      }
    }
    return out;
  }
  const { db, schema } = await loadDb();
  const rows = await db.query.agentSyncLog.findMany({
    where: eq(schema.agentSyncLog.messageId, messageId),
  });
  return rows.map((r) => ({
    ...r,
    deliveredAt: r.deliveredAt ? r.deliveredAt.toISOString() : null,
    ackedAt: r.ackedAt ? r.ackedAt.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

// ---- Internals -------------------------------------------------------------

async function loadDb() {
  const mod = await import('./db/client');
  return { db: mod.db, schema: mod.schema };
}

function serializeChannel(c: {
  slug: string;
  name: string;
  purpose: string;
  ownerHandle: string | null;
  appendOnly: number;
  createdAt: Date;
}): RepoChannel {
  return {
    slug: c.slug,
    name: c.name,
    purpose: c.purpose,
    ownerHandle: c.ownerHandle,
    appendOnly: c.appendOnly,
    createdAt: c.createdAt.toISOString(),
  };
}

function serializeAgent(a: {
  handle: string;
  displayName: string;
  role: string;
  kind: 'human' | 'agent';
  accentColor: string;
  endpointUrl: string | null;
  createdAt: Date;
}): RepoAgent {
  return {
    handle: a.handle,
    displayName: a.displayName,
    role: a.role,
    kind: a.kind,
    accentColor: a.accentColor,
    endpointUrl: a.endpointUrl,
    createdAt: a.createdAt.toISOString(),
  };
}

function serializeMessage(m: {
  id: string;
  channelSlug: string;
  senderHandle: string;
  content: string;
  payload: unknown;
  replyTo: string | null;
  createdAt: Date;
}): RepoMessage {
  return {
    id: m.id,
    channelSlug: m.channelSlug,
    senderHandle: m.senderHandle,
    content: m.content,
    payload:
      m.payload && typeof m.payload === 'object'
        ? (m.payload as Record<string, unknown>)
        : null,
    replyTo: m.replyTo,
    createdAt: m.createdAt.toISOString(),
  };
}
