import 'server-only';
import { db } from './supabase';

/**
 * Adapter (AGENTS.md §11) — lê os blocos fixos da loja (`loja_blocos`): o texto
 * "Sobre a loja" e "Garantia" que o painel gruda no fim de toda descrição gerada.
 *
 * Fica fora do motor (`src/lib/ml/descricao.ts`) de propósito: o motor recebe
 * esta função por injeção (`carregarBlocos`), para continuar sem import de
 * Supabase. Usado pela rota `/api/descricao/[id]` e pelo worker de lote
 * (`/api/lote/[id]/processar`, plano 025).
 */
export async function lerBlocosDaLoja(
  sellerId?: string,
): Promise<{ sobre?: string; garantia?: string }> {
  if (!sellerId) return {};
  const { data } = await db()
    .from('loja_blocos')
    .select('sobre, garantia')
    .eq('seller_id', sellerId)
    .maybeSingle();
  return { sobre: data?.sobre ?? undefined, garantia: data?.garantia ?? undefined };
}
