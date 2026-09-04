import { NextResponse } from 'next/server';
import { fichaPorGtin } from '@/lib/anuncios/consultas';
import { resolverContaDoClienteLogado, respostaErroConta } from '@/lib/portal/contaAtiva';

export const dynamic = 'force-dynamic';

/**
 * Espelho de `GET /api/anuncios/ficha-por-gtin` pro CLIENTE do portal (plano 034). A busca por
 * GTIN no catálogo do ML roda com o token da conexão do cliente logado.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const gtin = (url.searchParams.get('gtin') ?? '').trim();
  const pedido = (url.searchParams.get('seller_id') ?? '').trim() || undefined;

  const r = await resolverContaDoClienteLogado(pedido);
  if ('erro' in r) {
    const { status, mensagem } = respostaErroConta(r.erro);
    return NextResponse.json({ erro: mensagem }, { status });
  }
  return r.executar(() => fichaPorGtin(gtin));
}
