import { NextResponse } from 'next/server';
import { listarItensDoLote } from '@/lib/lotes/fila';
import { loteDoCliente } from '@/lib/lotes/autorizacao';
import { clienteLogadoId } from '@/lib/portal/contaAtiva';

/** Espelho de `GET /api/lote/[id]/itens` pro CLIENTE do portal (plano 035). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clienteId = await clienteLogadoId();
  if (!clienteId) {
    return NextResponse.json({ erro: 'Faça login no portal para continuar.' }, { status: 401 });
  }
  const lote = await loteDoCliente(id, clienteId);
  if (!lote) return NextResponse.json({ erro: 'lote não encontrado' }, { status: 404 });

  const itens = await listarItensDoLote(id);
  return NextResponse.json({ itens });
}
