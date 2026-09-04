import 'server-only';
import { buscarLote, type LoteComContagens } from './fila';

/**
 * Adapter (AGENTS.md §11) — confere se um lote pertence ao cliente logado antes de qualquer
 * rota do portal (`/api/portal/lote/**`, plano 035) ler ou processar. `null` cobre os dois casos
 * "não existe" e "é de outro cliente/dos robôs" de propósito — a rota devolve 404 nos dois, pra
 * não confirmar pra um cliente que um `lote_id` alheio existe.
 */
export async function loteDoCliente(
  loteId: string,
  clienteId: number,
): Promise<LoteComContagens | null> {
  const lote = await buscarLote(loteId);
  if (!lote || lote.cliente_id !== clienteId) return null;
  return lote;
}
