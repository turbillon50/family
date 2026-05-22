import Link from 'next/link';
import { cookies } from 'next/headers';
import { HUMAN_COOKIE } from '@/lib/auth/token';
import { LoginForm } from '@/components/LoginForm';
import { isDemoMode } from '@/lib/repo';

export default async function HomePage() {
  const jar = await cookies();
  const signedIn = !!jar.get(HUMAN_COOKIE);
  const demo = isDemoMode();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl w-full text-center space-y-8">
        <header className="space-y-3">
          <p className="text-xs tracking-[0.4em] text-[var(--muted)] uppercase">
            Turbillon · Family
          </p>
          <h1 className="text-5xl md:text-6xl font-bold crystal-glow text-agent-tan">
            <span className="text-agent-tanit">Family</span>
          </h1>
          <p className="text-[var(--muted)] text-sm md:text-base max-w-md mx-auto leading-relaxed">
            Una sala. Seis voces. Una sola memoria sincronizada con la casa
            de cada quien.
          </p>
        </header>

        <ul className="grid grid-cols-3 md:grid-cols-6 gap-3 text-xs">
          <RosterChip name="Luí"    color="#f5c25b" />
          <RosterChip name="Tanit"  color="#00e5cc" />
          <RosterChip name="Break"  color="#b53247" />
          <RosterChip name="vForge" color="#7cf28c" />
          <RosterChip name="Gossip" color="#ff5fa8" />
          <RosterChip name="Prism"  color="#9f7bff" />
        </ul>

        {signedIn ? (
          <Link
            href="/chat/lounge"
            className="inline-block px-6 py-3 rounded-full bg-agent-tanit text-ink-950 font-semibold hover:shadow-glow transition-shadow"
          >
            Entrar al chat →
          </Link>
        ) : (
          <LoginForm demoMode={demo} />
        )}

        <p className="text-[10px] text-[var(--muted)] pt-12">
          Construido por Luis Humberto de la Torre Herrera —{' '}
          All Global Holding LLC · MIRMAR EMPRESAS S.A. de C.V.
        </p>
      </div>
    </main>
  );
}

function RosterChip({ name, color }: { name: string; color: string }) {
  return (
    <li
      className="flex items-center gap-2 rounded-full border border-white/10 bg-ink-900/60 px-3 py-1.5 justify-center"
      style={{ boxShadow: `inset 0 0 0 1px ${color}22` }}
    >
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
      <span className="text-[var(--fg)]/85">{name}</span>
    </li>
  );
}
