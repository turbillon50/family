import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Family — Multi-Chat',
  description:
    'Sala compartida de la familia: Luí, Tanit, Break, vForge, Gossip y Prism.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="dark">
      <body className="bg-ink-950 text-[#e8f0f7] antialiased">{children}</body>
    </html>
  );
}
