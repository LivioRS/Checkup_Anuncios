import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { verificarSessao } from './lib/crypto';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

/**
 * Rotas que ficam de fora da senha: a de login (óbvio), e um punhado de
 * caminhos que precisam responder sem cookie por natureza — a página de
 * apresentação do produto (feita pra ser mostrada a quem ainda não tem
 * acesso) e os arquivos estáticos que o Android/PWA exige poder buscar sem
 * sessão (manifest, ícones, e sobretudo o assetlinks.json do TWA, que o
 * Chrome busca direto, sem cookie nenhum).
 */
function ehRotaPublica(pathname: string): boolean {
  if (pathname === '/login' || pathname === '/api/panel-login') return true;
  if (pathname === '/produto') return true;
  if (pathname === '/manifest.json') return true;
  if (pathname.startsWith('/icons/')) return true;
  if (pathname.startsWith('/.well-known/')) return true;
  return false;
}

/**
 * `/portal/*` (plano 023, card f1c4) é o namespace do CLIENTE final — não tem nada a ver com o
 * `PANEL_PASSWORD` do painel administrativo do Livio. Sessão via Supabase Auth (cookies geridos
 * por `@supabase/ssr`), não HMAC. `/portal/login` e `/portal/cadastro` ficam públicas dentro
 * deste namespace; o resto exige sessão.
 */
async function tratarRotaPortal(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  let resposta = NextResponse.next({ request: req });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value));
          resposta = NextResponse.next({ request: req });
          cookiesToSet.forEach(({ name, value, options }) => resposta.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user || pathname === '/portal/login' || pathname === '/portal/cadastro') {
    return resposta;
  }

  const url = req.nextUrl.clone();
  url.pathname = '/portal/login';
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith('/portal')) return tratarRotaPortal(req);
  if (ehRotaPublica(pathname)) return NextResponse.next();

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
