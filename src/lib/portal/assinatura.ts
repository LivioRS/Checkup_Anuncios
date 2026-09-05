import 'server-only';
import { db } from '../supabase';

/**
 * Adapter (AGENTS.md §11) — trial + assinatura do cliente do portal (plano 036, f3c6). Livre
 * pra importar Supabase, mesma categoria de `contaAtiva.ts`/`cadastro.ts`.
 */
export const TRIAL_DIAS = 7;

export type Assinatura = {
  id: number;
  clienteId: number;
  mpPreapprovalId: string | null;
  status: 'pendente' | 'authorized' | 'paused' | 'cancelled';
  valorCentavos: number | null;
};

/** `criadoEm` é `clientes.criado_em` (ISO) — os primeiros `TRIAL_DIAS` dias contam a partir daí. */
export function emTrial(criadoEm: string, agora = Date.now()): boolean {
  const inicio = new Date(criadoEm).getTime();
  if (!Number.isFinite(inicio)) return false;
  const fimTrial = inicio + TRIAL_DIAS * 24 * 60 * 60 * 1000;
  return agora < fimTrial;
}

/** A assinatura mais recente do cliente, se houver. */
export async function assinaturaDoCliente(clienteId: number): Promise<Assinatura | null> {
  const { data, error } = await db()
    .from('assinaturas')
    .select('id, cliente_id, mp_preapproval_id, status, valor_centavos')
    .eq('cliente_id', clienteId)
    .order('id', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Supabase: ${error.message}`);
  const row = data?.[0] as
    | { id: number; cliente_id: number; mp_preapproval_id: string | null; status: Assinatura['status']; valor_centavos: number | null }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    clienteId: row.cliente_id,
    mpPreapprovalId: row.mp_preapproval_id,
    status: row.status,
    valorCentavos: row.valor_centavos,
  };
}

/** Liberado pra criar anúncio/lote: em trial OU tem assinatura `authorized`. */
export async function clienteLiberado(clienteId: number, clienteCriadoEm: string): Promise<boolean> {
  if (emTrial(clienteCriadoEm)) return true;
  const assinatura = await assinaturaDoCliente(clienteId);
  return assinatura?.status === 'authorized';
}

/** Grava o preapproval recém-criado no MP (status `pendente` até o webhook confirmar). */
export async function registrarInicioAssinatura(input: {
  clienteId: number;
  preapprovalId: string;
  valorCentavos: number;
}): Promise<void> {
  const { error } = await db().from('assinaturas').insert({
    cliente_id: input.clienteId,
    mp_preapproval_id: input.preapprovalId,
    status: 'pendente',
    valor_centavos: input.valorCentavos,
  });
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/**
 * Atualiza pelo `mp_preapproval_id` (webhook — plano 036). Silenciosamente não faz nada se não
 * achar a linha: um preapproval que não é nosso (ou de ambiente de teste) não deve virar erro
 * 500 pro Mercado Pago ficar retentando pra sempre.
 */
export async function atualizarStatusAssinatura(
  preapprovalId: string,
  status: Assinatura['status'],
): Promise<void> {
  const { error } = await db()
    .from('assinaturas')
    .update({ status, atualizado_em: new Date().toISOString() })
    .eq('mp_preapproval_id', preapprovalId);
  if (error) throw new Error(`Supabase: ${error.message}`);
}
