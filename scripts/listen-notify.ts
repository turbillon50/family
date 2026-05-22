/**
 * Long-running worker: subscribes to the Postgres `family_bus` channel and
 * fans every new message out to the agents' webhooks.
 *
 * Run as a separate process (a Railway service, a Vercel cron is NOT enough
 * because Vercel functions are short-lived):
 *
 *   npm run bus:listen
 *
 * It performs three jobs per NOTIFY:
 *   1. Read the message + its mentions from Postgres.
 *   2. Determine the recipient set (mentioned agents, or — if the channel
 *      has no mention — every agent except the sender).
 *   3. POST the payload to each agent's /family-incoming endpoint with
 *      retry/backoff, recording outcomes in agent_sync_log.
 *
 * The HTTP transport, retry policy, and ACK contract are documented in
 * docs/AGENT_INTEGRATION.md.
 */
import { Client } from 'pg';
import { fanOutMessage } from '../lib/dispatcher/webhook-fanout';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error('DATABASE_URL(_UNPOOLED) not set');
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query('LISTEN family_bus');

  console.log('listening on family_bus…');

  client.on('notification', (msg) => {
    if (msg.channel !== 'family_bus' || !msg.payload) return;
    try {
      const payload = JSON.parse(msg.payload) as {
        id: string;
        channel: string;
        sender: string;
      };
      void fanOutMessage(payload.id).catch((err) => {
        console.error(`fan-out failed for ${payload.id}:`, err);
      });
    } catch (err) {
      console.error('bad notify payload:', msg.payload, err);
    }
  });

  client.on('error', (err) => {
    console.error('pg client error:', err);
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('listen worker failed:', err);
  process.exit(1);
});
