'use client';

import { useEffect, useState } from 'react';
import { AgentAvatar } from './AgentAvatar';

interface AgentRow {
  handle: string;
  displayName: string;
  role: string;
  kind: 'human' | 'agent';
  accentColor: string;
  endpointConfigured: boolean | null;
  presence: { status: string; note: string | null; updatedAt: string | null };
}

export function AgentRoster() {
  const [agents, setAgents] = useState<AgentRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/agents')
        .then((r) => r.json())
        .then((j: { agents: AgentRow[] }) => {
          if (!cancelled) setAgents(j.agents ?? []);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 20_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return (
    <div className="px-3 py-3">
      <p className="text-[10px] tracking-[0.3em] text-[var(--muted)] uppercase mb-2">
        Familia
      </p>
      <ul className="space-y-1.5">
        {agents.map((a) => {
          const online = a.presence.status === 'online';
          return (
            <li
              key={a.handle}
              className="flex items-center gap-2 text-xs"
              title={a.role}
            >
              <AgentAvatar
                handle={a.handle}
                color={a.accentColor}
                displayName={a.displayName}
                size={20}
              />
              <span className="truncate flex-1">{a.displayName}</span>
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{
                  backgroundColor: online ? a.accentColor : '#334155',
                  boxShadow: online ? `0 0 6px ${a.accentColor}` : 'none',
                }}
                aria-label={online ? 'en línea' : 'fuera'}
              />
              {a.kind === 'agent' && a.endpointConfigured === false && (
                <span
                  title="endpoint no configurado"
                  className="text-[10px] text-amber-400"
                >
                  ⚠
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
