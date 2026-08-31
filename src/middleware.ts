import { NextResponse, type NextRequest } from 'next/server';
import { verificarSessao } from './lib/crypto';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/login' || pathname === '/api/panel-login') return NextResponse.next();

  const senha = process.env.PANEL_PASSWORD;

  /**
   * Sem senha: em desenvolvimento passa direto, em produção NÃO passa.
   *
   * Este painel grava em anúncio de verdade. Um deploy público sem senha, por
   * esquecimento de variável, deixaria qualquer um com o link alterando título,
   * ficha e descrição das contas. Falhar fechado é a única opção defensável —
   * quem esquecer a variável vê a tela de bloqueio, não o painel.
   */
  if (!senha) {
    if (process.env.NODE_ENV !== 'production') return NextResponse.next();
    return new NextResponse(
      'PANEL_PASSWORD não está configurada. O painel fica bloqueado até definir a senha nas variáveis de ambiente.',
      { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } },
    );
  }

  const cookie = req.cookies.get('painel')?.value;
  const valido = await verificarSessao(cookie, senha);
  if (valido) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.searchParams.set('next', pathname);
  return NextResponse.redirect(url);
}
