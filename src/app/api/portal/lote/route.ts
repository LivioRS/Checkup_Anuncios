import { NextResponse } from 'next/server';
import { criarLote, ehTipoLote, TIPOS_LOTE } from '@/lib/lotes/fila';
import { resolverContaDoClienteLogado, respostaErroConta } from '@/lib/portal/contaAtiva';

/**
 * Espelho de `POST /api/lote` pro CLIENTE do portal (plano 035, f3c3). `seller_id` é resolvido
 * pela sessão (`resolverContaDoClienteLogado`) — nunca vem do corpo. O lote nasce com
 * `cliente_id` do cliente logado.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const itemIds = Array.isArray(body?.item_ids) ? body.item_ids.map(String) : [];
  const tipo = body?.tipo ?? 'diagnostico';
  const pedido = String(body?.seller_id ?? '').trim() || undefined;

  if (itemIds.length === 0) {
    return NextResponse.json({ erro: 'item_ids precisa ter pelo menos um item' }, { status: 400 });
  }
  if (!ehTipoLote(tipo)) {
    return NextResponse.json(
      { erro: `tipo inválido: use um de ${TIPOS_LOTE.join(', ')}` },
      { status: 400 },
    );
  }

  const r = await resolverContaDoClienteLogado(pedido);
  if ('erro' in r) {
    const { status, mensagem } = respostaErroConta(r.erro);
    return NextResponse.json({ erro: mensagem }, { status });
  }

  try {
    const { loteId } = await criarLote({
      sellerId: r.conta.sellerId,
      itemIds,
      tipo,
      clienteId: r.conta.clienteId,
    });
    return NextResponse.json({ lote_id: loteId }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : 'falha ao criar lote' },
      { status: 500 },
    );
  }
}
