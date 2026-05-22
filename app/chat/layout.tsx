import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { HUMAN_COOKIE } from '@/lib/auth/token';
import { ChannelSidebar } from '@/components/ChannelSidebar';
import { AgentRoster } from '@/components/AgentRoster';

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jar = await cookies();
  if (!jar.get(HUMAN_COOKIE)) {
    redirect('/');
  }

  return (
    <div className="h-screen flex bg-ink-950 text-[var(--fg)]">
      <aside className="w-60 shrink-0 border-r border-white/5 bg-ink-900/60 flex flex-col">
        <header className="px-4 py-4 border-b border-white/5">
          <p className="text-[10px] tracking-[0.35em] text-[var(--muted)] uppercase">
            Turbillon
          </p>
          <h1 className="text-lg font-bold crystal-glow text-agent-tanit">
            Family
          </h1>
        </header>
        <ChannelSidebar />
        <div className="mt-auto border-t border-white/5">
          <AgentRoster />
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">{children}</main>
    </div>
  );
}
