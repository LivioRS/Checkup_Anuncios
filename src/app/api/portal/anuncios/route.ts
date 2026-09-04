import { NextResponse } from 'next/server';
import { criarAnuncioCatalogo, type CriarCatalogoBody } from '@/lib/anuncios/catalogo';
import { resolverContaDoClienteLogado, respostaErroConta } from '@/lib/portal/contaAtiva';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Espelho de `POST /api/anuncios` (criar anúncio do catálogo, plano 019) pro CLIENTE do portal
 * (plano 034). Mesmo núcleo (`criarAnuncioCatalogo`); o ML é chamado com o token da conexão
 * `contas_ml_clientes` do cliente logado. `seller_id` do corpo é IGNORADO como fonte de verdade
 * (só escolhe entre as conexões do próprio cliente, e é validado).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CriarCatalogoBody;
  return criarAnuncioCatalogo(body, async (b) => {
    const pedido = String(b.seller_id ?? '').trim() || undefined;
    const r = await resolverContaDoClienteLogado(pedido);
    if ('erro' in r) {
      const { status, mensagem } = respostaErroConta(r.erro);
      return NextResponse.json({ erro: mensagem }, { status });
    }
    return { sellerId: r.conta.sellerId, clienteId: r.conta.clienteId, executar: r.executar };
  });
}
