import { fichaDaWeb, type CorpoFichaWeb } from '@/lib/anuncios/assistente';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Ficha técnica buscada no site do fabricante (plano 033, Parte C). NÃO fala com o ML. Wrapper
 * fino sobre `fichaDaWeb` (núcleo em `src/lib/anuncios/assistente.ts` desde o plano 034, pra a
 * rota espelho do portal reusar).
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CorpoFichaWeb;
  return fichaDaWeb(body);
}
