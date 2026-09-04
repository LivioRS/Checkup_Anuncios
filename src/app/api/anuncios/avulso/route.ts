import { NextResponse } from 'next/server';
import { comConta } from '@/lib/ml/client';
import { criarAnuncioAvulso, type CriarAvulsoBody } from '@/lib/anuncios/avulso';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cria um anúncio de marketplace FORA do catálogo (plano 029) — wrapper fino sobre
 * `criarAnuncioAvulso` (o núcleo mora em `src/lib/anuncios/avulso.ts` desde o plano 034, pra a
 * rota espelho do portal reusar a MESMA lógica). Aqui o escopo é o universo dos ROBÔS: o
 * `seller_id` vem do corpo e a chamada ao ML roda em `comConta(sellerId)`.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CriarAvulsoBody;
  return criarAnuncioAvulso(body, async (b) => {
    const sellerId = String(b.seller_id ?? '').trim();
    if (!sellerId) return NextResponse.json({ erro: 'Falta seller_id.' }, { status: 400 });
    return { sellerId, executar: (fn) => comConta(sellerId, fn) };
  });
}
