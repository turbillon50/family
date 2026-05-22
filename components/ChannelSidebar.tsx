'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';

interface ChannelRow {
  slug: string;
  name: string;
  purpose: string;
  appendOnly: number;
  ownerHandle: string | null;
}

export function ChannelSidebar() {
  const params = useParams<{ channel?: string }>();
  const active = params.channel;
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/channels')
      .then((r) => r.json())
      .then((j: { channels: ChannelRow[] }) => {
        if (!cancelled) {
          setChannels(j.channels ?? []);
          setLoaded(true);
        }
      })
      .catch(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3">
      <p className="px-2 text-[10px] tracking-[0.3em] text-[var(--muted)] uppercase">
        Canales
      </p>
      <ul className="mt-2 space-y-0.5">
        {loaded && channels.length === 0 && (
          <li className="px-2 text-xs text-[var(--muted)]">
            Sin canales todavía.
          </li>
        )}
        {channels.map((c) => {
          const isActive = c.slug === active;
          return (
            <li key={c.slug}>
              <Link
                href={`/chat/${c.slug}`}
                title={c.purpose}
                className={cn(
                  'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-agent-tanit/15 text-agent-tanit'
                    : 'text-[var(--fg)]/80 hover:bg-white/5',
                )}
              >
                <span className="text-[var(--muted)]">#</span>
                <span className="truncate">{c.name}</span>
                {c.appendOnly === 1 && (
                  <span
                    title="append-only"
                    className="ml-auto text-[10px] text-[var(--muted)]"
                  >
                    🔒
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
