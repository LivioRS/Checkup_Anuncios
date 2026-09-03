import { NextResponse } from 'next/server';
import { assinarState, buildAuthorizationUrl } from '@/lib/ml/oauth';

/**
 * Ponto de entrada do "Conectar conta Mercado Livre" (plano 022, card f1c3). Roda atrás da
 * senha do painel (nenhuma rota nova entra em `ehRotaPublica`). Assina o `state` com o
 * `cliente_id` e redireciona pro `/authorization` do app do PORTAL.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const clienteIdRaw = url.searchParams.get('cliente_id');
  const clienteId = Number(clienteIdRaw);
  if (!clienteIdRaw || !Number.isFinite(clienteId) || clienteId <= 0) {
    return NextResponse.json({ erro: 'cliente_id inválido ou ausente' }, { status: 400 });
  }

  const state = await assinarState(clienteId);
  return NextResponse.redirect(buildAuthorizationUrl(state));
}
