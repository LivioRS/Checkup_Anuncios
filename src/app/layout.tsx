import './globals.css';
import type { Metadata, Viewport } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Check-up de Anúncio',
  description: 'Check-up, correção e melhoria dos anúncios do Mercado Livre',
  manifest: '/manifest.json',
  icons: {
    icon: '/icons/icon-512.png',
    apple: '/icons/icon-512.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#2a78d6',
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
              <Link href="/criar">Criar anúncio</Link>
              <Link href="/produto">Sobre o produto</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
