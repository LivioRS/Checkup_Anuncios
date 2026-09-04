import { comConta } from '@/lib/ml/client';
import { processarPassoDoLote } from '@/lib/lotes/processarNucleo';

/**
 * Worker do lote (plano 024, card f2c1; estendido no 025, f2c2) — processa um punhado de itens
 * pendentes por chamada e devolve o estado atual. Não é um cron: a Vercel no plano Hobby só
 * permite cron 1x/dia (ver "Why this matters" do plano 024), então quem faz o "tique-taque" é o
 * chamador — repetindo a chamada a este endpoint enquanto o lote não estiver `concluido`. O
 * progresso fica salvo no banco, então parar de chamar só pausa, não perde nada.
 *
 * Wrapper fino sobre `processarPassoDoLote` (núcleo em `src/lib/lotes/processarNucleo.ts` desde
 * o plano 035, pra a rota espelho do portal reusar). Escopo: universo dos ROBÔS (`comConta`).
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: loteId } = await params;
  return processarPassoDoLote(loteId, (lote) => (fn) => comConta(lote.seller_id, fn));
}
