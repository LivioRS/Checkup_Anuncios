import { NextResponse } from 'next/server';
import { supabaseServidor } from '@/lib/supabase/server';
import { assinarState, buildAuthorizationUrl } from '@/lib/ml/oauth';

/**
 * "Conectar conta do Mercado Livre" a partir do `/portal/painel` do CLIENTE logado (plano 027,
 * card f3c1). Diferente de `/api/oauth/ml/authorize` (admin, `?cliente_id=N` na query): aqui o
 * `cliente_id` sai da SESSÃO Supabase — o cliente não escolhe em nome de quem conectar. O
 * `state` é assinado com `origem: 'portal'` pra o callback saber voltar pra cá, não pra
 * `/clientes`.
 */
export async function GET(req: Request) {
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/portal/login', req.url));
  }

  // Query com o cliente RLS-scoped: a policy só devolve a linha do próprio usuário.
  const { data: rows } = await supabase.from('clientes').select('id').limit(1);
  const clienteId = (rows?.[0] as { id: number } | undefined)?.id;
  if (!clienteId) {
    return NextResponse.redirect(new URL('/portal/painel?aviso=sem_cadastro', req.url));
  }

  const state = await assinarState(clienteId, 'portal');
  return NextResponse.redirect(buildAuthorizationUrl(state));
}
