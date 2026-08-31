import { getAccount } from './ml/client';
import { db } from '../supabase';
import { MlError } from './ml/client';
import { comConta } from './ml/client';

export type EscritaPayload = Record<string, unknown>;
export type EscritaAntes = Record<string, unknown> | null;

/**
 * Verifica se o anúncio pertence a uma conta cadastrada.
 * Lança 403 se não for dono.
 */
export async function garantirDono(
  itemId: string,
  opts: { internos?: boolean } = {},
): Promise<{ item: any; conta: any }> {
  const { abrirAnuncio } = await import('./ml/dono');
  const { conta } = await abrirAnuncio(itemId, opts);
  if (!conta) {
    throw new MlError(403, null, 'Este anúncio não é de nenhuma conta cadastrada — o painel só lê.');
  }
  const item = await comConta(conta.seller_id, async () => {
    const { mlFetch } = await import('./ml/client');
    const sufixo = opts.internos ? '?include_internal_attributes=true' : '';
    return mlFetch(`/items/${itemId}${sufixo}`);
  });
  return { item, conta };
}

/**
 * Registra uma escrita na tabela `ficha_edits` (best-effort).
 * Não lança erro se falhar — apenas loga internamente.
 */
export async function registrarEscrita(params: {
  conta: any;
  itemId: string;
  payload: EscritaPayload;
  antes: EscritaAntes;
  status: number;
}): Promise<void> {
  try {
    await db()
      .from('ficha_edits')
      .insert({
        seller_id: params.conta.seller_id,
        item_id: params.itemId,
        payload: params.payload,
        before: params.antes,
        status: params.status,
      })
      .then(
        () => {},
        () => {},
      );
  } catch {
    // best-effort: não derruba a requisição principal
  }
}

/**
 * Helper combinado: garante dono + executa ação + registra log.
 * Usado pelas rotas de escrita.
 */
export async function executarComEscrita<T>(params: {
  itemId: string;
  opts?: { internos?: boolean };
  acao: (conta: any, item: any) => Promise<{ payload: any; antes: any; status: number; resultado: T }>;
}): Promise<T> {
  const { item, conta } = await garantirDono(params.itemId, params.opts);
  const { payload, antes, status, resultado } = await params.acao(conta, item);
  await registrarEscrita({ conta, itemId: params.itemId, payload, antes, status });
  return resultado;
}