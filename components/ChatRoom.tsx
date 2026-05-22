'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

interface MessageRow {
  id: string;
  channelSlug: string;
  senderHandle: string;
  content: string;
  payload: Record<string, unknown> | null;
  replyTo: string | null;
  createdAt: string;
}

interface ChannelMeta {
  slug: string;
  name: string;
  purpose: string;
  appendOnly: number;
  ownerHandle: string | null;
}

export function ChatRoom({ channel }: { channel: string }) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [meta, setMeta] = useState<ChannelMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Initial load + channel meta.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      fetch(`/api/messages?channel=${encodeURIComponent(channel)}&limit=100`)
        .then((r) => r.json())
        .catch(() => ({ messages: [] })),
      fetch('/api/channels')
        .then((r) => r.json())
        .catch(() => ({ channels: [] })),
    ]).then(([msgs, chans]) => {
      if (cancelled) return;
      setMessages((msgs.messages ?? []) as MessageRow[]);
      const found = (chans.channels as ChannelMeta[]).find(
        (c) => c.slug === channel,
      );
      setMeta(found ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [channel]);

  // Subscribe to SSE for this channel. Each event carries an id; we fetch
  // the full row (cheaper than embedding it in the notify payload).
  useEffect(() => {
    const url = `/api/stream?channel=${encodeURIComponent(channel)}`;
    const es = new EventSource(url);

    const onMessage = (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { id: string; channel: string };
        if (data.channel !== channel) return;
        fetch(
          `/api/messages?channel=${encodeURIComponent(channel)}&id=${encodeURIComponent(data.id)}`,
        )
          .then((r) => r.json())
          .then((j: { messages: MessageRow[] }) => {
            const incoming = j.messages.find((m) => m.id === data.id);
            if (!incoming) return;
            setMessages((prev) => {
              if (prev.some((m) => m.id === incoming.id)) return prev;
              return [...prev, incoming];
            });
          })
          .catch(() => {});
      } catch {
        /* ignore malformed */
      }
    };

    es.addEventListener('message', onMessage);
    return () => {
      es.removeEventListener('message', onMessage);
      es.close();
    };
  }, [channel]);

  // Scroll-to-bottom on new messages.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Heartbeat presence every 30s so the roster shows Luí online.
  useEffect(() => {
    const beat = () => {
      void fetch('/api/presence', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'online' }),
      });
    };
    beat();
    const t = setInterval(beat, 30_000);
    return () => clearInterval(t);
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (!content.trim()) return;
      const optimistic: MessageRow = {
        id: `local-${Date.now()}`,
        channelSlug: channel,
        senderHandle: 'lui',
        content,
        payload: null,
        replyTo: null,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimistic]);

      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, content }),
      });

      if (!res.ok) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === optimistic.id
              ? { ...m, content: `${content}  ⚠ (no se envió)` }
              : m,
          ),
        );
      }
    },
    [channel],
  );

  return (
    <>
      <header className="px-6 py-3 border-b border-white/5 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">
          <span className="text-[var(--muted)]">#</span>
          {meta?.name ?? channel}
        </h2>
        {meta && (
          <p className="text-xs text-[var(--muted)] truncate">{meta.purpose}</p>
        )}
        {meta?.appendOnly === 1 && (
          <span className="ml-auto text-[10px] text-[var(--muted)] tracking-widest uppercase">
            append-only
          </span>
        )}
      </header>

      <MessageList messages={messages} loading={loading} />
      <div ref={bottomRef} />

      <MessageInput onSend={send} channelName={meta?.name ?? channel} />
    </>
  );
}
