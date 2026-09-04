import { NextResponse } from 'next/server';
import { loteDoCliente } from '@/lib/lotes/autorizacao';
import { clienteLogadoId } from '@/lib/portal/contaAtiva';

/**
 * Espelho de `GET /api/lote/[id]` pro CLIENTE do portal (plano 035). Sem sessão → 401; lote
 * inexistente OU de outro cliente/dos robôs → 404 (mesma mensagem — não revela qual dos dois).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const clienteId = await clienteLogadoId();
  if (!clienteId) {
    return NextResponse.json({ erro: 'Faça login no portal para continuar.' }, { status: 401 });
  }
  const lote = await loteDoCliente(id, clienteId);
  if (!lote) return NextResponse.json({ erro: 'lote não encontrado' }, { status: 404 });
  return NextResponse.json(lote);
}
