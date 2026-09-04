import { comConta } from '@/lib/ml/client';
import { montarRascunho } from '@/lib/anuncios/consultas';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * "Preencher com IA" (plano 033, Parte B) — do TÍTULO monta um rascunho (categoria + marca +
 * modelo + ficha + descrição), cada peça best-effort, tudo como SUGESTÃO. Wrapper fino sobre
 * `montarRascunho` (núcleo em `src/lib/anuncios/consultas.ts` desde o plano 034). Não cria nada
 * no ML, não publica.
 */
type Corpo = { seller_id?: string; titulo?: string; gtin?: string; marca?: string; modelo?: string };

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Corpo;
  const sellerId = String(body.seller_id ?? '').trim();
  const input = {
    titulo: String(body.titulo ?? '').trim(),
    gtin: String(body.gtin ?? '').trim(),
    marca: String(body.marca ?? '').trim(),
    modelo: String(body.modelo ?? '').trim(),
  };
  return sellerId ? comConta(sellerId, () => montarRascunho(input)) : montarRascunho(input);
}
