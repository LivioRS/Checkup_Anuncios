import { comConta } from '@/lib/ml/client';
import { sugerirCategoria } from '@/lib/anuncios/consultas';

export const dynamic = 'force-dynamic';

/**
 * Sugere `category_id` a partir do título do produto (plano 029) — SOMENTE LEITURA. Wrapper fino
 * sobre `sugerirCategoria` (núcleo em `src/lib/anuncios/consultas.ts` desde o plano 034, pra a
 * rota espelho do portal reusar). Se vier `seller_id`, roda no escopo dos robôs; senão cai no
 * `ML_SELLER_ID_PADRAO`.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const sellerId = (url.searchParams.get('seller_id') ?? '').trim();
  return sellerId ? comConta(sellerId, () => sugerirCategoria(q)) : sugerirCategoria(q);
}
