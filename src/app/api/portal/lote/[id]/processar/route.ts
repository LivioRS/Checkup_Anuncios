import { NextResponse } from 'next/server';
import { comContaCliente } from '@/lib/ml/client';
import { processarPassoDoLote } from '@/lib/lotes/processarNucleo';
import { clienteLogadoId } from '@/lib/portal/contaAtiva';

/**
 * Espelho de `POST /api/lote/[id]/processar` pro CLIENTE do portal (plano 035). Mesmo núcleo
 * (`processarPassoDoLote`); os itens rodam em `comContaCliente(clienteId, lote.seller_id, …)` —
 * nunca `comConta`. Lote de outro cliente/dos robôs → 404 antes de processar qualquer item.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: loteId } = await params;
  const clienteId = await clienteLogadoId();
  if (!clienteId) {
    return NextResponse.json({ erro: 'Faça login no portal para continuar.' }, { status: 401 });
  }

  return processarPassoDoLote(loteId, (lote) => {
    if (lote.cliente_id !== clienteId) {
      return NextResponse.json({ erro: 'lote não encontrado' }, { status: 404 });
    }
    return (fn) => comContaCliente(clienteId, lote.seller_id, fn);
  });
}
