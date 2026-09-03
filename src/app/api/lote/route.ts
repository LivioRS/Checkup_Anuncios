import { NextResponse } from 'next/server';
import { criarLote, ehTipoLote, TIPOS_LOTE } from '@/lib/lotes/fila';

/**
 * Cria um lote a partir de `seller_id` + lista de `item_ids` (plano 024, card f2c1).
 * `tipo` (plano 025, f2c2): 'diagnostico' (default, compatível com o 024), 'titulo' ou
 * 'descricao' — decide o que o worker roda em cada item. Nenhum tipo grava no ML.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const sellerId = String(body?.seller_id ?? '').trim();
  const itemIds = Array.isArray(body?.item_ids) ? body.item_ids.map(String) : [];
  const tipo = body?.tipo ?? 'diagnostico';

  if (!sellerId) {
    return NextResponse.json({ erro: 'seller_id é obrigatório' }, { status: 400 });
  }
  if (itemIds.length === 0) {
    return NextResponse.json({ erro: 'item_ids precisa ter pelo menos um item' }, { status: 400 });
  }
  if (!ehTipoLote(tipo)) {
    return NextResponse.json(
      { erro: `tipo inválido: use um de ${TIPOS_LOTE.join(', ')}` },
      { status: 400 },
    );
  }

  try {
    const { loteId } = await criarLote({ sellerId, itemIds, tipo });
    return NextResponse.json({ lote_id: loteId }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { erro: e instanceof Error ? e.message : 'falha ao criar lote' },
      { status: 500 },
    );
  }
}
