import { Client } from 'pg';

// =============================================================================
// In-process LISTEN/NOTIFY subscriber for the dev server's SSE route.
// =============================================================================
// Vercel functions are short-lived, so the production path uses
// scripts/listen-notify.ts as a separate worker that pushes events into
// Postgres (which the SSE route then polls). In dev / Node runtime, the SSE
// endpoint can attach this subscriber directly.
//
// The subscriber lives across multiple SSE connections to avoid one pg client
// per browser tab.

type Listener = (payload: BusEvent) => void;

export interface BusEvent {
  id: string;
  channel: string;
  sender: string;
  created_at: string;
}

let client: Client | null = null;
let connecting: Promise<void> | null = null;
const listeners = new Set<Listener>();

async function ensureConnected(): Promise<void> {
  if (client) return;
  if (connecting) return connecting;

  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL(_UNPOOLED) not set');

  connecting = (async () => {
    const c = new Client({ connectionString: url });
    await c.connect();
    await c.query('LISTEN family_bus');
    c.on('notification', (msg) => {
      if (msg.channel !== 'family_bus' || !msg.payload) return;
      try {
        const event = JSON.parse(msg.payload) as BusEvent;
        for (const l of listeners) {
          try {
            l(event);
          } catch (err) {
            console.error('listener threw:', err);
          }
        }
      } catch (err) {
        console.error('bad bus payload:', msg.payload, err);
      }
    });
    c.on('error', (err) => {
      console.error('bus client error, reconnecting…', err);
      client = null;
      connecting = null;
    });
    client = c;
  })();

  await connecting;
}

export async function subscribe(fn: Listener): Promise<() => void> {
  await ensureConnected();
  listeners.add(fn);
  return () => listeners.delete(fn);
}
