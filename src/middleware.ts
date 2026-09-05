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
  // O Mercado Pago chama isto direto (plano 036) — autenticado por `x-signature`, não por
  // cookie. Não começa com `/portal`/`/api/portal`, então cairia no gate do PANEL_PASSWORD
  // sem esta exceção (mesmo motivo do f3c0 pro `/api/portal/*`).
  if (pathname === '/api/webhooks/mercadopago') return true;
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

  // Rota de API do portal sem sessão: 401, não redirect (o chamador é `fetch`, não o navegador).
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ erro: 'não autenticado' }, { status: 401 });
  }

  const url = req.nextUrl.clone();
  url.pathname = '/portal/login';
  return NextResponse.redirect(url);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // `/portal/*` (páginas) E `/api/portal/*` (rotas que o portal chama) seguem a sessão Supabase,
  // não o `PANEL_PASSWORD`. Sem este `/api/portal`, `completar-cadastro` e `logout` caíam no
  // gate do painel e eram redirecionados pra `/login` (plano 027, f3c0).
  if (pathname.startsWith('/portal') || pathname.startsWith('/api/portal')) {
    return tratarRotaPortal(req);
  }
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
