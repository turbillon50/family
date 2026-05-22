import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  primaryKey,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';

// =============================================================================
// Enums
// =============================================================================

export const senderKindEnum = pgEnum('sender_kind', ['human', 'agent']);
export const syncStateEnum = pgEnum('sync_state', [
  'pending',
  'delivered',
  'acked',
  'failed',
]);

// =============================================================================
// agents — the family roster
// =============================================================================
// Seeded once with the six members. The handle is the @mention key in chat.
// `endpoint_url` is read at boot from env (see lib/agents/registry.ts) and
// mirrored here so the UI can render presence + the bus can route fan-out
// without touching env on every request.

export const agents = pgTable('agents', {
  handle: text('handle').primaryKey(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull(),
  kind: senderKindEnum('kind').notNull(),
  accentColor: text('accent_color').notNull(),
  endpointUrl: text('endpoint_url'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// =============================================================================
// channels — like Slack rooms
// =============================================================================

export const channels = pgTable('channels', {
  slug: text('slug').primaryKey(),
  name: text('name').notNull(),
  purpose: text('purpose').notNull(),
  ownerHandle: text('owner_handle').references(() => agents.handle, {
    onDelete: 'set null',
  }),
  appendOnly: integer('append_only').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// =============================================================================
// messages — the canonical hilo
// =============================================================================
// id is a nanoid so it's URL-safe and stable across replicas.
// content stays as plain text + an optional structured payload (jsonb) for
// rich attachments (a trade snapshot from Tanit, a risk report from Break...).

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey(),
    channelSlug: text('channel_slug')
      .notNull()
      .references(() => channels.slug, { onDelete: 'cascade' }),
    senderHandle: text('sender_handle')
      .notNull()
      .references(() => agents.handle, { onDelete: 'restrict' }),
    content: text('content').notNull(),
    payload: jsonb('payload'),
    replyTo: text('reply_to'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    byChannelAt: index('messages_channel_created_idx').on(
      t.channelSlug,
      t.createdAt,
    ),
    bySender: index('messages_sender_idx').on(t.senderHandle),
  }),
);

// =============================================================================
// mentions — @agente lookups, denormalized for fast fan-out
// =============================================================================
// One row per (message, mentioned_handle). The webhook fan-out reads this
// when a new message lands to know who to notify with high priority.

export const mentions = pgTable(
  'mentions',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    handle: text('handle')
      .notNull()
      .references(() => agents.handle, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.handle] }),
    byHandle: index('mentions_handle_idx').on(t.handle),
  }),
);

// =============================================================================
// agent_sync_log — proof that every agent has the message in its own DB
// =============================================================================
// Every (message, agent) pair gets a row. State transitions:
//   pending → delivered → acked            (happy path)
//   pending → delivered → failed           (agent 4xx)
//   pending → failed                       (transport error after max retries)
// The agent's ACK carries an `external_ref` — the row id in the agent's own
// database — so Luí can audit "this message landed in Tanit's tanit_chat as
// row #1234".

export const agentSyncLog = pgTable(
  'agent_sync_log',
  {
    messageId: text('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    agentHandle: text('agent_handle')
      .notNull()
      .references(() => agents.handle, { onDelete: 'cascade' }),
    state: syncStateEnum('state').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    externalRef: text('external_ref'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    ackedAt: timestamp('acked_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.messageId, t.agentHandle] }),
    byAgentState: index('sync_log_agent_state_idx').on(t.agentHandle, t.state),
  }),
);

// =============================================================================
// presence — who's online right now
// =============================================================================
// Each agent (and Luí) heartbeats every N seconds via POST /api/presence.
// Stale rows (older than ~60s) render as offline in the UI.

export const presence = pgTable('presence', {
  handle: text('handle')
    .primaryKey()
    .references(() => agents.handle, { onDelete: 'cascade' }),
  status: text('status').notNull().default('online'),
  note: text('note'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
});

// =============================================================================
// inferred row types
// =============================================================================

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;

export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;

export type Mention = typeof mentions.$inferSelect;
export type AgentSyncLogRow = typeof agentSyncLog.$inferSelect;
export type Presence = typeof presence.$inferSelect;
