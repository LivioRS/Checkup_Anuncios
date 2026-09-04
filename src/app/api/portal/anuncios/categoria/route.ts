import { NextResponse } from 'next/server';
import { sugerirCategoria } from '@/lib/anuncios/consultas';
import { resolverContaDoClienteLogado, respostaErroConta } from '@/lib/portal/contaAtiva';

export const dynamic = 'force-dynamic';

/**
 * Espelho de `GET /api/anuncios/categoria` pro CLIENTE do portal (plano 034). O
 * `domain_discovery` do ML roda com o token da conexão do cliente logado (`comContaCliente`).
 * `seller_id` da query só escolhe entre as conexões do próprio cliente.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const pedido = (url.searchParams.get('seller_id') ?? '').trim() || undefined;

  const r = await resolverContaDoClienteLogado(pedido);
  if ('erro' in r) {
    const { status, mensagem } = respostaErroConta(r.erro);
    return NextResponse.json({ erro: mensagem }, { status });
  }
  return r.executar(() => sugerirCategoria(q));
}
