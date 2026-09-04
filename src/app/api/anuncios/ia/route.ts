import { assistenteIa, type CorpoIa } from '@/lib/anuncios/assistente';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Assistente de IA pro anúncio FORA do catálogo (planos 030/032). Não fala com o ML — só com o
 * modelo de linguagem. Wrapper fino sobre `assistenteIa` (núcleo em
 * `src/lib/anuncios/assistente.ts` desde o plano 034, pra a rota espelho do portal reusar).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CorpoIa;
  return assistenteIa(body);
}
