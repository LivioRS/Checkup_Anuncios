import { comConta } from '@/lib/ml/client';
import { fichaPorGtin } from '@/lib/anuncios/consultas';

export const dynamic = 'force-dynamic';

/**
 * Enriquecimento DETERMINÍSTICO da ficha por GTIN (plano 032, Parte A) — SOMENTE LEITURA. Wrapper
 * fino sobre `fichaPorGtin` (núcleo em `src/lib/anuncios/consultas.ts` desde o plano 034). Nunca
 * devolve as imagens do produto de catálogo (veredito do LLM Council — ver
 * `plans/032-enriquecer-ficha-sem-agente.md`).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const gtin = (url.searchParams.get('gtin') ?? '').trim();
  const sellerId = (url.searchParams.get('seller_id') ?? '').trim();
  return sellerId ? comConta(sellerId, () => fichaPorGtin(gtin)) : fichaPorGtin(gtin);
}
