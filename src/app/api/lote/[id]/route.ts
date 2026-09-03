import { NextResponse } from 'next/server';
import { buscarLote } from '@/lib/lotes/fila';

/** Estado atual do lote — contagem de itens por status (plano 024, card f2c1). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lote = await buscarLote(id);
  if (!lote) return NextResponse.json({ erro: 'lote não encontrado' }, { status: 404 });
  return NextResponse.json(lote);
}
