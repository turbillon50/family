import { z } from 'zod';

// =============================================================================
// Wire contracts shared by client + API routes + agent webhooks.
// =============================================================================
// All inbound bodies are validated with these schemas. Anything that doesn't
// parse is rejected with 400 — agents must respect the contract or they
// fall out of sync.

export const agentHandleSchema = z.enum([
  'lui',
  'tanit',
  'break',
  'forge',
  'gossip',
  'prism',
]);
export type AgentHandle = z.infer<typeof agentHandleSchema>;

export const senderKindSchema = z.enum(['human', 'agent']);
export type SenderKind = z.infer<typeof senderKindSchema>;

// ---- Inbound: Luí or an agent sends a new message to the chat --------------

export const postMessageBodySchema = z.object({
  channel: z.string().min(1).max(64),
  content: z.string().min(1).max(8000),
  payload: z.record(z.unknown()).optional(),
  replyTo: z.string().optional(),
});
export type PostMessageBody = z.infer<typeof postMessageBodySchema>;

// ---- Outbound: Family pushes a message to an agent --------------------------
// The agent's /family-incoming MUST accept this shape (see docs).

export const familyIncomingSchema = z.object({
  messageId: z.string(),
  channel: z.string(),
  sender: agentHandleSchema,
  senderKind: senderKindSchema,
  content: z.string(),
  payload: z.record(z.unknown()).nullable(),
  replyTo: z.string().nullable(),
  createdAt: z.string(),
  mentions: z.array(agentHandleSchema),
  // The agent should ACK by calling POST /api/sync-ack with this nonce, so
  // Family can confirm "the message is now in your private DB".
  ackUrl: z.string().url(),
});
export type FamilyIncoming = z.infer<typeof familyIncomingSchema>;

// ---- Inbound: agent confirms it persisted the message ----------------------

export const syncAckBodySchema = z.object({
  messageId: z.string(),
  agent: agentHandleSchema,
  externalRef: z.string().optional(),
  error: z.string().optional(),
});
export type SyncAckBody = z.infer<typeof syncAckBodySchema>;

// ---- Inbound: presence heartbeat -------------------------------------------

export const presenceHeartbeatSchema = z.object({
  status: z.enum(['online', 'busy', 'away', 'offline']).default('online'),
  note: z.string().max(140).optional(),
});
export type PresenceHeartbeat = z.infer<typeof presenceHeartbeatSchema>;

// ---- Outbound: SSE event the browser receives ------------------------------

export type StreamEvent =
  | { type: 'message'; channel: string; messageId: string }
  | { type: 'presence'; handle: AgentHandle; status: string };
