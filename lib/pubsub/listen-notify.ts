import { Client } from 'pg';
import { isDemoMode } from '../repo';
import { getDemoStore } from '../demo/store';

// =============================================================================
// In-process subscriber for the SSE route.
// =============================================================================
// Production: subscribes once to Postgres `family_bus` (LISTEN/NOTIFY) and
// fans every NOTIFY out to per-request SSE listeners.
//
// Demo mode (FAMILY_DEMO_MODE=1): subscribes to the in-memory EventEmitter
// inside the demo store. No Postgres needed.

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
  if (isDemoMode()) {
    // The demo store emits directly; we just bridge into our local listener
    // set when the first subscribe happens.
    if (!client) {
      const store = getDemoStore();
      const bridge = (event: BusEvent) => {
        for (const l of listeners) {
          try {
            l(event);
          } catch (err) {
            console.error('listener threw:', err);
          }
        }
      };
      store.events.on('message', bridge);
      // Sentinel so we don't attach the bridge twice.
      client = { __demoBridge: true } as unknown as Client;
    }
    return;
  }

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
