import { NextResponse } from 'next/server';
import { buscarLote, listarItensDoLote } from '@/lib/lotes/fila';

/** Itens do lote com `resultado`/`erro` — a tela de progresso (plano 026, f2c3) lê daqui. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lote = await buscarLote(id);
  if (!lote) return NextResponse.json({ erro: 'lote não encontrado' }, { status: 404 });
  const itens = await listarItensDoLote(id);
  return NextResponse.json({ itens });
}
