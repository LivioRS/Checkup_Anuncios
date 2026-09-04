import { NextResponse } from 'next/server';
import { comConta } from '@/lib/ml/client';
import { buscarCatalogo } from '@/lib/anuncios/consultas';

export const dynamic = 'force-dynamic';

/**
 * Busca candidato de catálogo por marca+modelo(+código) — SOMENTE LEITURA (passo 1 do plano 019).
 * Wrapper fino sobre `buscarCatalogo` (núcleo em `src/lib/anuncios/consultas.ts` desde o plano
 * 034, pra a rota espelho do portal reusar). Escopo: universo dos ROBÔS (`seller_id`
 * obrigatório).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sellerId = (url.searchParams.get('seller_id') ?? '').trim();
  const marca = (url.searchParams.get('marca') ?? '').trim();
  const modelo = (url.searchParams.get('modelo') ?? '').trim();
  const codigo = (url.searchParams.get('codigo') ?? '').trim();

  if (!sellerId) {
    return NextResponse.json({ erro: 'Falta seller_id.' }, { status: 400 });
  }
  return comConta(sellerId, () => buscarCatalogo({ marca, modelo, codigo }));
}
