'use client';

import { useEffect, useState } from 'react';
import { AgentAvatar } from './AgentAvatar';
import { formatTime } from '@/lib/utils';

interface MessageRow {
  id: string;
  channelSlug: string;
  senderHandle: string;
  content: string;
  payload: Record<string, unknown> | null;
  replyTo: string | null;
  createdAt: string;
}

interface AgentMeta {
  handle: string;
  displayName: string;
  accentColor: string;
}

export function MessageList({
  messages,
  loading,
}: {
  messages: MessageRow[];
  loading: boolean;
}) {
  const [agents, setAgents] = useState<Map<string, AgentMeta>>(new Map());

  useEffect(() => {
    fetch('/api/agents')
      .then((r) => r.json())
      .then((j: { agents: AgentMeta[] }) => {
        const map = new Map<string, AgentMeta>();
        for (const a of j.agents ?? []) map.set(a.handle, a);
        setAgents(map);
      })
      .catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex-1 px-6 py-6 text-sm text-[var(--muted)]">
        Cargando hilo…
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 px-6 py-6 text-sm text-[var(--muted)]">
        Aún no se ha dicho nada aquí. Empieza tú, Luí.
      </div>
    );
  }

  return (
    <ol className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
      {messages.map((m) => {
        const meta = agents.get(m.senderHandle);
        const color = meta?.accentColor ?? '#94a3b8';
        const display = meta?.displayName ?? m.senderHandle;
        return (
          <li key={m.id} className="flex gap-3 items-start">
            <AgentAvatar
              handle={m.senderHandle}
              displayName={display}
              color={color}
              size={32}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span
                  className="font-semibold text-sm"
                  style={{ color }}
                >
                  {display}
                </span>
                <span className="text-[10px] text-[var(--muted)]">
                  {formatTime(m.createdAt)}
                </span>
              </div>
              <p className="text-sm text-[var(--fg)]/90 whitespace-pre-wrap break-words leading-relaxed">
                {renderWithMentions(m.content, agents)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function renderWithMentions(
  content: string,
  agents: Map<string, AgentMeta>,
): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(@[a-zA-Z][a-zA-Z0-9_-]{1,31})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      parts.push(content.slice(last, m.index));
    }
    const raw = m[1];
    if (!raw) {
      last = m.index + m[0].length;
      continue;
    }
    const handle = raw.slice(1).toLowerCase();
    const meta = agents.get(handle);
    if (meta) {
      parts.push(
        <span
          key={`m-${key++}`}
          className="rounded px-1 font-medium"
          style={{ color: meta.accentColor, backgroundColor: `${meta.accentColor}1a` }}
        >
          @{meta.displayName}
        </span>,
      );
    } else {
      parts.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return parts;
}
