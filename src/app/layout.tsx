import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Check-up de Anúncio',
  description: 'Check-up, correção e melhoria dos anúncios do Mercado Livre',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="marca" style={{ color: 'var(--tinta)' }}>
              <span className="ponto" />
              Check-up de Anúncio
            </Link>
            <nav>
              <Link href="/">Buscar anúncio</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
