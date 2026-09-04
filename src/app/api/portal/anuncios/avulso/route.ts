import { NextResponse } from 'next/server';
import { criarAnuncioAvulso, type CriarAvulsoBody } from '@/lib/anuncios/avulso';
import { resolverContaDoClienteLogado, respostaErroConta } from '@/lib/portal/contaAtiva';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Espelho de `POST /api/anuncios/avulso` pro CLIENTE do portal (plano 034). Mesmo núcleo
 * (`criarAnuncioAvulso`); a diferença é o escopo: o ML é chamado com o token da conexão
 * `contas_ml_clientes` do cliente logado (`comContaCliente`), NUNCA com o dos robôs.
 *
 * `seller_id` no corpo é IGNORADO como fonte de verdade — só serve pra escolher entre as
 * conexões do próprio cliente, e é validado contra elas (`seller_alheio` → 409). O `sellerId`
 * real e o `cliente_id` do log vêm da sessão.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CriarAvulsoBody;
  return criarAnuncioAvulso(body, async (b) => {
    const pedido = String(b.seller_id ?? '').trim() || undefined;
    const r = await resolverContaDoClienteLogado(pedido);
    if ('erro' in r) {
      const { status, mensagem } = respostaErroConta(r.erro);
      return NextResponse.json({ erro: mensagem }, { status });
    }
    return { sellerId: r.conta.sellerId, clienteId: r.conta.clienteId, executar: r.executar };
  });
}
