import { NextResponse } from 'next/server';
import { ML_API } from '@/lib/env';
import { exchangeCodeForToken, verificarState } from '@/lib/ml/oauth';
import { salvarConexaoCliente, ConflitoDeContaError } from '@/lib/ml/clientAccounts';

/**
 * Callback do fluxo `authorization_code` (plano 022, card f1c3). O ML redireciona o navegador
 * pra cá com `code`+`state` (ou `error`, se o usuário negar). Nunca usa `next`/redirect vindo do
 * usuário — o destino final é sempre `/clientes`, fixo, sem risco de open redirect.
 */
function paginaClientes(req: Request, aviso: string): NextResponse {
  const url = new URL('/clientes', req.url);
  url.searchParams.set('aviso', aviso);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  const url = new URL(req.url);

  const erroMl = url.searchParams.get('error');
  if (erroMl) return paginaClientes(req, `ml_negou:${erroMl}`);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return paginaClientes(req, 'faltando_code_ou_state');

  const clienteId = await verificarState(state);
  if (clienteId === null) return paginaClientes(req, 'state_invalido');

  let token;
  try {
    token = await exchangeCodeForToken(code);
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 80) : 'erro desconhecido';
    return paginaClientes(req, `troca_falhou:${msg}`);
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
      return paginaClientes(req, `conflito:${e.message.slice(0, 140)}`);
    }
    throw e;
  }

  return paginaClientes(req, 'conectado');
}
