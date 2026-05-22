import { subscribe } from '@/lib/pubsub/listen-notify';
import { authenticate } from '@/lib/auth/token';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET /api/stream?channel=lounge
// Server-Sent Events stream. Pushes one event per new message in the channel
// (or for all channels if `channel` is omitted). The browser EventSource
// reconnects automatically; we don't need to do anything special on close.
export async function GET(req: Request): Promise<Response> {
  const auth = authenticate(req);
  if (!auth) return new Response('unauthorized', { status: 401 });

  const url = new URL(req.url);
  const wanted = url.searchParams.get('channel');

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const write = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      write('ready', { since: new Date().toISOString() });

      const unsubscribe = await subscribe((evt) => {
        if (wanted && evt.channel !== wanted) return;
        write('message', evt);
      });

      // Heartbeat every 25s so intermediaries (Vercel edge, Cloudflare, etc.)
      // don't kill the connection thinking it's idle.
      const beat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* connection already gone */
        }
      }, 25_000);

      const close = () => {
        clearInterval(beat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      req.signal.addEventListener('abort', close);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
    },
  });
}
