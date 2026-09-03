import 'server-only';
import { db } from '../supabase';

/**
 * Adapter (AGENTS.md §11) — fila de operações em lote (plano 024, card f2c1). Livre pra
 * importar Supabase, mesma categoria de `clientAccounts.ts`/`cadastro.ts`.
 *
 * Depois de `TETO_TENTATIVAS` respostas 429 (rate-limit) seguidas, um item para de ser
 * retentado e vira `erro` — evita um item problemático manter o lote "em_andamento" pra sempre.
 */
export const TETO_TENTATIVAS = 5;

/**
 * Tipo de operação do lote (plano 025, f2c2). O worker despacha por este valor:
 * `diagnostico` → `carregarDiagnostico` (plano 024); `titulo`/`descricao` → só
 * GERAM a proposta (guardada em `lote_itens.resultado`), nunca gravam no ML — a
 * gravação continua manual/revisada, um anúncio por vez, pelo `PUT` das rotas.
 */
export const TIPOS_LOTE = ['diagnostico', 'titulo', 'descricao'] as const;
export type TipoLote = (typeof TIPOS_LOTE)[number];

export function ehTipoLote(v: unknown): v is TipoLote {
  return typeof v === 'string' && (TIPOS_LOTE as readonly string[]).includes(v);
}

export type StatusLoteItem = 'pendente' | 'processando' | 'concluido' | 'erro';

export type LoteItem = {
  id: number;
  lote_id: string;
  item_id: string;
  status: StatusLoteItem;
  tentativas: number;
  resultado: unknown;
  erro: string | null;
};

export type Lote = {
  id: string;
  seller_id: string;
  total_itens: number;
  status: 'em_andamento' | 'concluido';
  tipo: TipoLote;
};

export type LoteComContagens = Lote & {
  contagens: Record<StatusLoteItem, number>;
};

export async function criarLote(input: {
  sellerId: string;
  itemIds: string[];
  tipo?: TipoLote;
}): Promise<{ loteId: string }> {
  if (input.itemIds.length === 0) throw new Error('Lote precisa de pelo menos um item.');

  // Gera o id aqui (em vez de depender do `default gen_random_uuid()` + `.select()` de volta)
  // pra não precisar de um round-trip extra só pra saber o id — a coluna aceita uuid escrito
  // pelo cliente do mesmo jeito que aceitaria o gerado pelo banco.
  const loteId = crypto.randomUUID();

  const cliente = db();
  const { error: erroLote } = await cliente
    .from('lotes')
    .insert({
      id: loteId,
      seller_id: input.sellerId,
      total_itens: input.itemIds.length,
      tipo: input.tipo ?? 'diagnostico',
    });
  if (erroLote) throw new Error(`Falha ao criar lote: ${erroLote.message}`);

  const { error: erroItens } = await cliente
    .from('lote_itens')
    .insert(input.itemIds.map((item_id) => ({ lote_id: loteId, item_id })));
  if (erroItens) throw new Error(`Falha ao criar itens do lote: ${erroItens.message}`);

  return { loteId };
}

export async function buscarLote(loteId: string): Promise<LoteComContagens | null> {
  const cliente = db();
  const { data: loteRows, error: erroLote } = await cliente
    .from('lotes')
    .select('id, seller_id, total_itens, status, tipo')
    .eq('id', loteId)
    .limit(1);
  if (erroLote) throw new Error(`Falha ao buscar lote: ${erroLote.message}`);
  const bruto = loteRows?.[0] as (Omit<Lote, 'tipo'> & { tipo?: unknown }) | undefined;
  if (!bruto) return null;
  // Lote antigo (pré-025) pode não ter `tipo`; o default do banco é 'diagnostico'.
  const lote: Lote = { ...bruto, tipo: ehTipoLote(bruto.tipo) ? bruto.tipo : 'diagnostico' };

  const { data: itens, error: erroItens } = await cliente
    .from('lote_itens')
    .select('status')
    .eq('lote_id', loteId);
  if (erroItens) throw new Error(`Falha ao buscar itens do lote: ${erroItens.message}`);

  const contagens: Record<StatusLoteItem, number> = {
    pendente: 0,
    processando: 0,
    concluido: 0,
    erro: 0,
  };
  for (const it of (itens ?? []) as { status: StatusLoteItem }[]) {
    contagens[it.status] = (contagens[it.status] ?? 0) + 1;
  }

  return { ...lote, contagens };
}

/** Pega até `limite` itens pendentes e já marca como `processando` (evita corrida entre chamadas). */
export async function proximosPendentes(loteId: string, limite: number): Promise<LoteItem[]> {
  const cliente = db();
  const { data, error } = await cliente
    .from('lote_itens')
    .select('id, lote_id, item_id, status, tentativas, resultado, erro')
    .eq('lote_id', loteId)
    .eq('status', 'pendente')
    .limit(limite);
  if (error) throw new Error(`Falha ao buscar itens pendentes: ${error.message}`);

  const itens = (data ?? []) as LoteItem[];
  for (const item of itens) {
    const { error: erroUpdate } = await cliente
      .from('lote_itens')
      .update({ status: 'processando' })
      .eq('id', item.id);
    if (erroUpdate) throw new Error(`Falha ao marcar item como processando: ${erroUpdate.message}`);
  }
  return itens;
}

export async function marcarConcluido(itemDbId: number, resultado: unknown): Promise<void> {
  const { error } = await db()
    .from('lote_itens')
    .update({ status: 'concluido', resultado, erro: null })
    .eq('id', itemDbId);
  if (error) throw new Error(`Falha ao marcar item concluído: ${error.message}`);
}

export async function marcarErro(itemDbId: number, mensagem: string): Promise<void> {
  const { error } = await db()
    .from('lote_itens')
    .update({ status: 'erro', erro: mensagem })
    .eq('id', itemDbId);
  if (error) throw new Error(`Falha ao marcar item com erro: ${error.message}`);
}

/** 429: volta pra `pendente` até o teto de tentativas; depois disso vira `erro`. */
export async function marcarParaRetentar(item: LoteItem): Promise<void> {
  const tentativas = item.tentativas + 1;
  if (tentativas >= TETO_TENTATIVAS) {
    await marcarErro(item.id, `excedeu ${TETO_TENTATIVAS} tentativas por rate-limit (429)`);
    return;
  }
  const { error } = await db()
    .from('lote_itens')
    .update({ status: 'pendente', tentativas })
    .eq('id', item.id);
  if (error) throw new Error(`Falha ao reagendar item: ${error.message}`);
}

/** Se não sobra `pendente`/`processando`, marca o lote como `concluido`. */
export async function fecharSeCompleto(loteId: string): Promise<void> {
  const cliente = db();
  const { data, error } = await cliente
    .from('lote_itens')
    .select('status')
    .eq('lote_id', loteId);
  if (error) throw new Error(`Falha ao checar itens do lote: ${error.message}`);

  const aberto = (data ?? []).some(
    (it) => (it as { status: StatusLoteItem }).status === 'pendente' || (it as { status: StatusLoteItem }).status === 'processando',
  );
  if (aberto) return;

  const { error: erroUpdate } = await cliente
    .from('lotes')
    .update({ status: 'concluido' })
    .eq('id', loteId);
  if (erroUpdate) throw new Error(`Falha ao fechar lote: ${erroUpdate.message}`);
}

/** Todos os itens do lote, com `resultado`/`erro` — pra tela de progresso (plano 026). */
export async function listarItensDoLote(loteId: string): Promise<LoteItem[]> {
  const { data, error } = await db()
    .from('lote_itens')
    .select('id, lote_id, item_id, status, tentativas, resultado, erro')
    .eq('lote_id', loteId);
  if (error) throw new Error(`Falha ao listar itens do lote: ${error.message}`);
  return (data ?? []) as LoteItem[];
}

/**
 * Devolve os itens `erro` do lote pra fila (`pendente`, `tentativas` zerado, `erro` limpo) e
 * reabre o lote se algum voltou. Loop por `id` (mesmo padrão de `proximosPendentes`) em vez de
 * `update` multi-linha — é o que o cliente Supabase deste repo e o fake de teste suportam.
 */
export async function reenfileirarErros(loteId: string): Promise<{ reenfileirados: number }> {
  const cliente = db();
  const { data, error } = await cliente
    .from('lote_itens')
    .select('id, lote_id, item_id, status, tentativas, resultado, erro')
    .eq('lote_id', loteId)
    .eq('status', 'erro');
  if (error) throw new Error(`Falha ao buscar itens com erro: ${error.message}`);

  const itens = (data ?? []) as LoteItem[];
  for (const item of itens) {
    const { error: erroUpdate } = await cliente
      .from('lote_itens')
      .update({ status: 'pendente', tentativas: 0, erro: null })
      .eq('id', item.id);
    if (erroUpdate) throw new Error(`Falha ao reenfileirar item: ${erroUpdate.message}`);
  }

  if (itens.length > 0) {
    const { error: erroLote } = await cliente
      .from('lotes')
      .update({ status: 'em_andamento' })
      .eq('id', loteId);
    if (erroLote) throw new Error(`Falha ao reabrir o lote: ${erroLote.message}`);
  }

  return { reenfileirados: itens.length };
}
