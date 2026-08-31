import { NextResponse } from 'next/server';
import { assinarSessao, compararSenha } from '@/lib/crypto';

/** Só aceita caminho relativo de MESMA origem. Bloqueia `//host`, `https://...`, `javascript:` etc. */
function caminhoSeguro(next: unknown): string {
  const raw = String(next ?? '');
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/';
  try {
    const u = new URL(raw, 'http://localhost');
    // Se o caminho carrega um host próprio, cai fora.
    if (u.hostname !== 'localhost') return '/';
    return raw.startsWith('/') ? raw : '/';
  } catch {
    return '/';
  }
}

// Rate-limit em memória por IP. Basta para desacelerar brute-force nesta escala.
const tentativas = new Map<string, { count: number; resetAt: number }>();
const MAX_TENTATIVAS = 10;
const JANELA_MS = 15 * 60 * 1000; // 15 min

function ipDoReq(req: Request): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? req.headers.get('x-real-ip')
    ?? 'local';
}

function permitido(ip: string): boolean {
  const agora = Date.now();
  const t = tentativas.get(ip);
  if (!t || t.resetAt <= agora) {
    tentativas.set(ip, { count: 0, resetAt: agora + JANELA_MS });
    return true;
  }
  t.count += 1;
  return t.count <= MAX_TENTATIVAS;
}

export async function POST(req: Request) {
  const ip = ipDoReq(req);
  if (!permitido(ip)) {
    return NextResponse.json({ erro: 'tentativas demais; aguarde um pouco' }, { status: 429 });
  }

  const form = await req.formData();
  const senha = String(form.get('senha') ?? '');
  const next = caminhoSeguro(form.get('next'));
  const esperada = process.env.PANEL_PASSWORD ?? '';

  if (!esperada || !(await compararSenha(senha, esperada))) {
    return NextResponse.redirect(new URL('/login?erro=1', req.url), 303);
  }

  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set('painel', await assinarSessao(esperada), {
    httpOnly: true,
    sameSite: 'lax',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}