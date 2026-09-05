import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Nome/logo da loja no portal (plano 036, f3c5 — branding simples, sem subdomínio). O cliente
 * só atualiza a PRÓPRIA linha — o `update` usa o cliente Supabase DA SESSÃO (RLS-scoped, mesmo
 * padrão de `/portal/painel`), não `db()`/service_role, então nem precisa filtrar por id: a
 * policy já restringe a `auth.uid() = auth_user_id`.
 */
export async function PUT(req: Request) {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ erro: 'Faça login no portal para continuar.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const nomeLoja = String((body as { nome_loja?: unknown }).nome_loja ?? '').trim().slice(0, 80) || null;
  const logoUrlBruta = (body as { logo_url?: unknown }).logo_url;
  const logoUrlTexto = String(logoUrlBruta ?? '').trim();
  if (logoUrlTexto && !/^https?:\/\/\S+$/i.test(logoUrlTexto)) {
    return NextResponse.json({ erro: 'logo_url deve ser uma URL http/https (ou vazio).' }, { status: 400 });
  }

  const { error } = await supabase
    .from('clientes')
    .update({ nome_loja: nomeLoja, logo_url: logoUrlTexto || null })
    .eq('auth_user_id', user.id);
  if (error) {
    return NextResponse.json({ erro: `Falha ao salvar: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, nome_loja: nomeLoja, logo_url: logoUrlTexto || null });
}
