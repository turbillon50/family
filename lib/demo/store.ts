import { EventEmitter } from 'node:events';

// =============================================================================
// In-memory store for the demo mode (FAMILY_DEMO_MODE=1).
// =============================================================================
// Mirrors the shape of the Postgres rows so the route handlers and the SSE
// stream don't care whether they're talking to Neon or to this map. The
// store is a process-local singleton; in dev with `next dev` it persists
// across requests but resets when the dev server restarts.
//
// Not production. Not a database. Not a queue. Just enough to let Luí see
// the chat working without Neon.

export interface Agent {
  handle: string;
  displayName: string;
  role: string;
  kind: 'human' | 'agent';
  accentColor: string;
  endpointUrl: string | null;
  createdAt: Date;
}

export interface Channel {
  slug: string;
  name: string;
  purpose: string;
  ownerHandle: string | null;
  appendOnly: number;
  createdAt: Date;
}

export interface Message {
  id: string;
  channelSlug: string;
  senderHandle: string;
  content: string;
  payload: Record<string, unknown> | null;
  replyTo: string | null;
  createdAt: Date;
}

export interface Mention {
  messageId: string;
  handle: string;
}

export interface PresenceRow {
  handle: string;
  status: string;
  note: string | null;
  updatedAt: Date;
}

export interface AgentSyncLogRow {
  messageId: string;
  agentHandle: string;
  state: 'pending' | 'delivered' | 'acked' | 'failed';
  attempts: number;
  lastError: string | null;
  externalRef: string | null;
  deliveredAt: Date | null;
  ackedAt: Date | null;
  updatedAt: Date;
}

// ---------------------------------------------------------------------------

class DemoStore {
  readonly agents = new Map<string, Agent>();
  readonly channels = new Map<string, Channel>();
  readonly messages = new Map<string, Message>();
  readonly mentions = new Map<string, Mention[]>();
  readonly presence = new Map<string, PresenceRow>();
  readonly syncLog = new Map<string, AgentSyncLogRow>();
  readonly events = new EventEmitter();

  constructor() {
    this.events.setMaxListeners(200);
  }

  syncKey(messageId: string, handle: string): string {
    return `${messageId}::${handle}`;
  }

  emitMessage(m: Message): void {
    this.events.emit('message', {
      id: m.id,
      channel: m.channelSlug,
      sender: m.senderHandle,
      created_at: m.createdAt.toISOString(),
    });
  }
}

// Reuse across hot reloads in dev so the seed + any new messages survive.
const globalAny = globalThis as unknown as { __familyDemoStore?: DemoStore };

export function getDemoStore(): DemoStore {
  if (!globalAny.__familyDemoStore) {
    globalAny.__familyDemoStore = new DemoStore();
  }
  return globalAny.__familyDemoStore;
}
