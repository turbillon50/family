'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm({ demoMode = false }: { demoMode?: boolean }) {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? 'Token inválido.' : 'No pude entrar.');
        return;
      }
      router.push('/chat/lounge');
      router.refresh();
    } catch {
      setError('Sin conexión.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-sm flex flex-col gap-3 items-stretch"
    >
      <label className="text-xs text-[var(--muted)] text-left tracking-wider uppercase">
        Tu palabra para entrar, Luí
      </label>
      <input
        type="password"
        autoComplete="current-password"
        value={token}
        onChange={(e) => setToken(e.target.value)}
        className="rounded-xl bg-ink-900 border border-white/10 px-4 py-3 outline-none focus:border-agent-tanit/60 focus:shadow-glow text-sm"
        placeholder={demoMode ? 'cualquier palabra · estás en demo' : '••••••••••'}
      />
      <button
        type="submit"
        disabled={pending || token.length === 0}
        className="rounded-xl bg-agent-tanit text-ink-950 font-semibold py-3 disabled:opacity-40 hover:shadow-glow transition-shadow"
      >
        {pending ? 'Entrando…' : 'Abrir la casa'}
      </button>
      {demoMode && (
        <p className="text-[10px] text-agent-tanit/70 text-center">
          Modo demo activo · sin Neon, datos en memoria
        </p>
      )}
      {error && (
        <p className="text-xs text-agent-break/90 text-center">{error}</p>
      )}
    </form>
  );
}
