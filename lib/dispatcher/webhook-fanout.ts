import { and, eq, sql as drizzleSql } from 'drizzle-orm';
import { db, schema } from '../db/client';
import type { AgentHandle, FamilyIncoming } from '../types';
import {
  listAgentsOnly,
  resolveEndpoint,
  resolveToken,
} from '../agents/registry';

// =============================================================================
// Fan-out: send a freshly-inserted message to every relevant agent.
// =============================================================================
// Called from:
//   - scripts/listen-notify.ts (the long-running worker, via pg_notify)
//   - POST /api/messages (best-effort sync kick — see route for rationale)
//
// Each (message, agent) pair gets a row in agent_sync_log. Failure to deliver
// is parked there and an out-of-process retry script (TODO) can re-attempt.
// We do NOT block the API response on fan-out.

const DEFAULT_TIMEOUT_MS = Number(process.env.DELIVERY_TIMEOUT_MS ?? 15000);

export async function fanOutMessage(messageId: string): Promise<void> {
  const row = await db.query.messages.findFirst({
    where: eq(schema.messages.id, messageId),
  });
  if (!row) {
    console.warn(`[fanout] message ${messageId} not found, skipping`);
    return;
  }

  const mentionRows = await db.query.mentions.findMany({
    where: eq(schema.mentions.messageId, messageId),
  });
  const mentioned = new Set<AgentHandle>(
    mentionRows.map((m) => m.handle as AgentHandle),
  );

  // Recipient policy:
  //   - If anyone is mentioned, deliver to that set (plus author for ACK
  //     consistency? — no: the author already has the row in Family's DB,
  //     they will pull from /api/messages if needed).
  //   - Otherwise, deliver to every agent except the sender.
  const recipients = listAgentsOnly()
    .filter((a) =>
      mentioned.size > 0 ? mentioned.has(a.handle) : a.handle !== row.senderHandle,
    )
    .map((a) => a.handle);

  if (recipients.length === 0) return;

  // Pre-create sync_log rows in 'pending' state so even if we crash, the
  // retry script knows what's outstanding.
  for (const handle of recipients) {
    await db
      .insert(schema.agentSyncLog)
      .values({ messageId, agentHandle: handle, state: 'pending' })
      .onConflictDoNothing();
  }

  const ackUrl = `${publicBaseUrl()}/api/sync-ack`;
  const body: FamilyIncoming = {
    messageId: row.id,
    channel: row.channelSlug,
    sender: row.senderHandle as AgentHandle,
    senderKind: row.senderHandle === 'lui' ? 'human' : 'agent',
    content: row.content,
    payload: (row.payload as Record<string, unknown> | null) ?? null,
    replyTo: row.replyTo ?? null,
    createdAt: row.createdAt.toISOString(),
    mentions: [...mentioned],
    ackUrl,
  };

  await Promise.allSettled(
    recipients.map((handle) => deliverTo(handle, body)),
  );
}

async function deliverTo(
  handle: AgentHandle,
  body: FamilyIncoming,
): Promise<void> {
  const endpoint = resolveEndpoint(handle);
  const token = resolveToken(handle);

  if (!endpoint) {
    await markFailed(handle, body.messageId, 'endpoint not configured');
    return;
  }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        'x-family-message-id': body.messageId,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      await markFailed(
        handle,
        body.messageId,
        `agent responded ${res.status}`,
      );
      return;
    }

    await db
      .update(schema.agentSyncLog)
      .set({
        state: 'delivered',
        deliveredAt: new Date(),
        attempts: drizzleSql`${schema.agentSyncLog.attempts} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.agentSyncLog.messageId, body.messageId),
          eq(schema.agentSyncLog.agentHandle, handle),
        ),
      );
  } catch (err) {
    const reason =
      err instanceof Error ? err.message : 'unknown transport error';
    await markFailed(handle, body.messageId, reason);
  } finally {
    clearTimeout(t);
  }
}

async function markFailed(
  handle: AgentHandle,
  messageId: string,
  reason: string,
): Promise<void> {
  const maxAttempts = Number(process.env.DELIVERY_MAX_ATTEMPTS ?? 5);
  await db
    .update(schema.agentSyncLog)
    .set({
      state: drizzleSql`CASE WHEN ${schema.agentSyncLog.attempts} + 1 >= ${maxAttempts} THEN 'failed'::sync_state ELSE 'pending'::sync_state END`,
      attempts: drizzleSql`${schema.agentSyncLog.attempts} + 1`,
      lastError: reason,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(schema.agentSyncLog.messageId, messageId),
        eq(schema.agentSyncLog.agentHandle, handle),
      ),
    );
}

function publicBaseUrl(): string {
  // Vercel exposes VERCEL_URL; otherwise expect FAMILY_PUBLIC_URL or fall
  // back to localhost (dev).
  const fromEnv =
    process.env.FAMILY_PUBLIC_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    'http://localhost:3000';
  return fromEnv.replace(/\/+$/, '');
}
