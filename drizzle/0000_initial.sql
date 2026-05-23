-- =============================================================================
-- Family Multi-Chat — initial schema
-- =============================================================================
-- Generated to mirror lib/db/schema.ts. Idempotent: safe to re-run.

-- Postgres doesn't support CREATE TYPE IF NOT EXISTS, so we wrap each in a
-- DO block that catches duplicate_object — gives us true idempotency.
DO $$ BEGIN
  CREATE TYPE "sender_kind" AS ENUM ('human', 'agent');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "sync_state" AS ENUM ('pending', 'delivered', 'acked', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "agents" (
  "handle"        text PRIMARY KEY,
  "display_name"  text NOT NULL,
  "role"          text NOT NULL,
  "kind"          "sender_kind" NOT NULL,
  "accent_color"  text NOT NULL,
  "endpoint_url"  text,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "channels" (
  "slug"          text PRIMARY KEY,
  "name"          text NOT NULL,
  "purpose"       text NOT NULL,
  "owner_handle"  text REFERENCES "agents"("handle") ON DELETE SET NULL,
  "append_only"   integer NOT NULL DEFAULT 0,
  "created_at"    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "messages" (
  "id"             text PRIMARY KEY,
  "channel_slug"   text NOT NULL REFERENCES "channels"("slug") ON DELETE CASCADE,
  "sender_handle"  text NOT NULL REFERENCES "agents"("handle") ON DELETE RESTRICT,
  "content"        text NOT NULL,
  "payload"        jsonb,
  "reply_to"       text,
  "created_at"     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "messages_channel_created_idx"
  ON "messages"("channel_slug", "created_at");
CREATE INDEX IF NOT EXISTS "messages_sender_idx"
  ON "messages"("sender_handle");

CREATE TABLE IF NOT EXISTS "mentions" (
  "message_id"  text NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "handle"      text NOT NULL REFERENCES "agents"("handle") ON DELETE CASCADE,
  PRIMARY KEY ("message_id", "handle")
);

CREATE INDEX IF NOT EXISTS "mentions_handle_idx" ON "mentions"("handle");

CREATE TABLE IF NOT EXISTS "agent_sync_log" (
  "message_id"    text NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "agent_handle"  text NOT NULL REFERENCES "agents"("handle") ON DELETE CASCADE,
  "state"         "sync_state" NOT NULL DEFAULT 'pending',
  "attempts"      integer NOT NULL DEFAULT 0,
  "last_error"    text,
  "external_ref"  text,
  "delivered_at"  timestamptz,
  "acked_at"      timestamptz,
  "updated_at"    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("message_id", "agent_handle")
);

CREATE INDEX IF NOT EXISTS "sync_log_agent_state_idx"
  ON "agent_sync_log"("agent_handle", "state");

CREATE TABLE IF NOT EXISTS "presence" (
  "handle"      text PRIMARY KEY REFERENCES "agents"("handle") ON DELETE CASCADE,
  "status"      text NOT NULL DEFAULT 'online',
  "note"        text,
  "updated_at"  timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- LISTEN/NOTIFY trigger — every insert into messages publishes on `family_bus`.
-- The worker in scripts/listen-notify.ts forwards each payload as an SSE event
-- and kicks off the webhook fan-out to the agents.
-- =============================================================================

CREATE OR REPLACE FUNCTION family_bus_notify() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify(
    'family_bus',
    json_build_object(
      'id', NEW.id,
      'channel', NEW.channel_slug,
      'sender', NEW.sender_handle,
      'created_at', NEW.created_at
    )::text
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS family_bus_messages ON "messages";
CREATE TRIGGER family_bus_messages
  AFTER INSERT ON "messages"
  FOR EACH ROW EXECUTE FUNCTION family_bus_notify();
