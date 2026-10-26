import type { Metadata } from 'next';
import './globals.css';

// The per-request CSP nonce (see src/proxy.ts) requires dynamic rendering.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bob Optimizer - Decision Intelligence and Usage Analytics',
  description: 'Replay why decisions were made and optimize how you use Bob, in one place.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-obsidian-950 font-sans antialiased text-white">{children}</body>
    </html>
  );
}
