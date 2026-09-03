import { NextResponse } from 'next/server';
import { buscarLote, reenfileirarErros } from '@/lib/lotes/fila';

/**
 * Devolve os itens `erro` do lote pra fila (plano 026, f2c3 — "repetir só o que falhou").
 * Depois disso o chamador volta a bater em `/processar` até `status: "concluido"`.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lote = await buscarLote(id);
  if (!lote) return NextResponse.json({ erro: 'lote não encontrado' }, { status: 404 });

  const { reenfileirados } = await reenfileirarErros(id);
  const atual = await buscarLote(id);
  return NextResponse.json({ reenfileirados, lote: atual });
}
