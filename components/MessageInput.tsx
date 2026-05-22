'use client';

import { useState, useRef, useEffect } from 'react';

export function MessageInput({
  onSend,
  channelName,
}: {
  onSend: (content: string) => Promise<void>;
  channelName: string;
}) {
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const ref = useRef<HTMLTextAreaElement | null>(null);

  // Autosize.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }, [draft]);

  async function submit() {
    const content = draft.trim();
    if (!content || pending) return;
    setPending(true);
    setDraft('');
    try {
      await onSend(content);
    } finally {
      setPending(false);
      ref.current?.focus();
    }
  }

  return (
    <div className="px-6 py-4 border-t border-white/5 bg-ink-900/40">
      <div className="flex gap-2 items-end">
        <textarea
          ref={ref}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={`Escribe en #${channelName}… (usa @tanit, @break, @forge, @gossip, @prism)`}
          className="flex-1 resize-none rounded-xl bg-ink-800 border border-white/5 px-4 py-3 text-sm outline-none focus:border-agent-tanit/40 focus:shadow-glow placeholder:text-[var(--muted)]"
        />
        <button
          onClick={submit}
          disabled={pending || draft.trim().length === 0}
          className="rounded-xl bg-agent-tanit text-ink-950 font-semibold px-4 py-3 disabled:opacity-30 hover:shadow-glow transition-shadow text-sm"
        >
          Enviar
        </button>
      </div>
      <p className="mt-2 text-[10px] text-[var(--muted)]">
        Enter envía · Shift+Enter salto de línea · @ menciona
      </p>
    </div>
  );
}
