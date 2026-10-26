import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Bob Time Machine — Decision Intelligence',
  description: 'Continuous Causal Governance and Decision Drift Detection',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#06080F] font-sans antialiased text-white">
        {children}
      </body>
    </html>
  );
}
