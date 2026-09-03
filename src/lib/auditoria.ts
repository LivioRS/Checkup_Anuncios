import { getAccount } from './ml/client';
import { db } from './supabase';
import { MlError } from './ml/client';
import { comConta } from './ml/client';
import type { MlAccount } from './ml/client';
import type { Item } from './ml/model';

export type EscritaPayload = Record<string, unknown>;
export type EscritaAntes = Record<string, unknown> | null;
/** Só o que `registrarEscrita`/`registrarCriacaoAnuncio` realmente usam da conta. */
type ContaMinima = { seller_id: string };

/**
 * Verifica se o anúncio pertence a uma conta cadastrada.
 * Lança 403 se não for dono.
 */
export async function garantirDono(
  itemId: string,
  opts: { internos?: boolean } = {},
): Promise<{ item: Item; conta: MlAccount }> {
  const { abrirAnuncio } = await import('./ml/dono');
  const { conta } = await abrirAnuncio(itemId, opts);
  if (!conta) {
    throw new MlError(403, null, 'Este anúncio não é de nenhuma conta cadastrada — o painel só lê.');
  }
  const item = await comConta(conta.seller_id, async () => {
    const { mlFetch } = await import('./ml/client');
    const sufixo = opts.internos ? '?include_internal_attributes=true' : '';
    return mlFetch<Item>(`/items/${itemId}${sufixo}`);
  });
  return { item, conta };
}

/**
 * Registra uma escrita na tabela `ficha_edits` (best-effort).
 * Não lança erro se falhar — apenas loga internamente.
 */
export async function registrarEscrita(params: {
  conta: ContaMinima;
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
 * Registra uma tentativa de criação de anúncio via catálogo na tabela
 * `anuncio_criacoes` (best-effort). Diferente de `registrarEscrita`: aqui não
 * existe "dono" nem `item_id` garantido antes da resposta do ML — a tentativa
 * pode falhar antes de existir um anúncio, e mesmo assim precisa ser logada
 * (plano 019: toda tentativa, sucesso ou falha, sempre).
 */
export async function registrarCriacaoAnuncio(params: {
  sellerId: string;
  marca?: string | null;
  modelo?: string | null;
  codigo?: string | null;
  /** String no fluxo de catálogo (plano 019); ausente no anúncio avulso (plano 029). */
  catalogProductId?: string | null;
  payload: unknown;
  status: number;
  itemId?: string | null;
  response: unknown;
}): Promise<void> {
  try {
    await db()
      .from('anuncio_criacoes')
      .insert({
        seller_id: params.sellerId,
        marca: params.marca ?? null,
        modelo: params.modelo ?? null,
        codigo: params.codigo ?? null,
        catalog_product_id: params.catalogProductId ?? null,
        payload: params.payload,
        status: params.status,
        item_id: params.itemId ?? null,
        response: params.response,
      })
      .then(
        () => {},
        () => {},
      );
  } catch {
    // best-effort: log nunca derruba a resposta principal
  }
}

/**
 * Helper combinado: garante dono + executa ação + registra log.
 * Usado pelas rotas de escrita.
 */
export async function executarComEscrita<T>(params: {
  itemId: string;
  opts?: { internos?: boolean };
  acao: (
    conta: MlAccount,
    item: Item,
  ) => Promise<{ payload: EscritaPayload; antes: EscritaAntes; status: number; resultado: T }>;
}): Promise<T> {
  const { item, conta } = await garantirDono(params.itemId, params.opts);
  const { payload, antes, status, resultado } = await params.acao(conta, item);
  await registrarEscrita({ conta, itemId: params.itemId, payload, antes, status });
  return resultado;
}