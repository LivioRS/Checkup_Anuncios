import { NextResponse } from 'next/server';
import { ML_API } from '@/lib/env';
import { exchangeCodeForToken, verificarState, type OrigemOAuth } from '@/lib/ml/oauth';
import { salvarConexaoCliente, ConflitoDeContaError } from '@/lib/ml/clientAccounts';

/**
 * Callback do fluxo `authorization_code` (plano 022, card f1c3; origem `portal` no plano 027,
 * f3c1). O ML redireciona o navegador pra cá com `code`+`state` (ou `error`, se o usuário
 * negar). Nunca usa `next`/redirect vindo do usuário — o destino é `/clientes` (admin) ou
 * `/portal/painel` (cliente logado), decidido pelo `state` ASSINADO, sem risco de open redirect.
 */
function paginaRetorno(req: Request, origem: OrigemOAuth, aviso: string): NextResponse {
  const destino = origem === 'portal' ? '/portal/painel' : '/clientes';
  const url = new URL(destino, req.url);
  url.searchParams.set('aviso', aviso);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Sem `state` verificado ainda, o erro inicial só pode voltar pro admin — é o fluxo antigo.
  const erroMl = url.searchParams.get('error');
  if (erroMl) return paginaRetorno(req, 'admin', `ml_negou:${erroMl}`);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return paginaRetorno(req, 'admin', 'faltando_code_ou_state');

  const verificado = await verificarState(state);
  if (!verificado) return paginaRetorno(req, 'admin', 'state_invalido');
  const { clienteId, origem } = verificado;

  let token;
  try {
    token = await exchangeCodeForToken(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 80) : 'erro desconhecido';
    return paginaRetorno(req, origem, `troca_falhou:${msg}`);
  }

  // Prova real de que o token funciona, e dá um apelido melhor que o seller_id cru pra exibir.
  // Não bloqueia a conexão se isso falhar — é só uma comodidade de exibição.
  let apelido: string | null = null;
  try {
    const res = await fetch(`${ML_API}/users/me`, {
      headers: { Authorization: `Bearer ${token.access_token}`, accept: 'application/json' },
      cache: 'no-store',
    });
    if (res.ok) {
      const json = (await res.json()) as { nickname?: string };
      apelido = json.nickname ?? null;
    }
  } catch {
    // silencioso — ver comentário acima
  }

  try {
    await salvarConexaoCliente({
      cliente_id: clienteId,
      seller_id: String(token.user_id),
      access_token: token.access_token,
      refresh_token: token.refresh_token,
      expires_in: token.expires_in,
      apelido,
    });
  } catch (e) {
    if (e instanceof ConflitoDeContaError) {
      return paginaRetorno(req, origem, `conflito:${e.message.slice(0, 140)}`);
    }
    throw e;
  }

  return paginaRetorno(req, origem, 'conectado');
}
