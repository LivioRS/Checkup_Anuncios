import { NextResponse } from 'next/server';
import { comConta } from '@/lib/ml/client';
import { criarAnuncioCatalogo, type CriarCatalogoBody } from '@/lib/anuncios/catalogo';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Cria um anúncio vinculado a um produto de catálogo — passo 2 do fluxo de criação rápida
 * (plano 019). Wrapper fino sobre `criarAnuncioCatalogo` (núcleo em `src/lib/anuncios/catalogo.ts`
 * desde o plano 034, pra a rota espelho do portal reusar). Escopo: universo dos ROBÔS
 * (`seller_id` do corpo, `comConta`).
 *
 * Invariante permanente (AGENTS.md): criação de anúncio NUNCA publica ativo sozinho — ver o
 * núcleo. Toda tentativa é logada em `anuncio_criacoes`.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CriarCatalogoBody;
  return criarAnuncioCatalogo(body, async (b) => {
    const sellerId = String(b.seller_id ?? '').trim();
    if (!sellerId) return NextResponse.json({ erro: 'Falta seller_id.' }, { status: 400 });
    return { sellerId, executar: (fn) => comConta(sellerId, fn) };
  });
}
