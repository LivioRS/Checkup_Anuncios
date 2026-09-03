import { afterEach, describe, expect, it } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import {
  criarLote,
  proximosPendentes,
  marcarConcluido,
  marcarErro,
  marcarParaRetentar,
  fecharSeCompleto,
  buscarLote,
  TETO_TENTATIVAS,
  type LoteItem,
} from '../src/lib/lotes/fila';

afterEach(() => {
  injetarCliente(null);
});

describe('criarLote', () => {
  it('cria o lote e uma linha por item em lote_itens', async () => {
    const { client, writes } = makeFakeSupabase({ lotes: [], lote_itens: [] });
    injetarCliente(() => client as never);

    const { loteId } = await criarLote({ sellerId: '177795203', itemIds: ['MLB1', 'MLB2', 'MLB3'] });

    expect(loteId).toBeTruthy();
    const insLote = writes.find((w) => w.table === 'lotes' && w.kind === 'insert');
    expect(insLote).toBeDefined();
    expect((insLote!.payload as Record<string, unknown>).total_itens).toBe(3);

    const insItens = writes.find((w) => w.table === 'lote_itens' && w.kind === 'insert');
    expect(insItens).toBeDefined();
    expect(insItens!.payload as unknown[]).toHaveLength(3);
  });

  it('rejeita lista vazia', async () => {
    const { client } = makeFakeSupabase({ lotes: [], lote_itens: [] });
    injetarCliente(() => client as never);
    await expect(criarLote({ sellerId: '1', itemIds: [] })).rejects.toThrow();
  });
});

describe('proximosPendentes', () => {
  it('respeita o limite e marca os escolhidos como processando', async () => {
    const { client } = makeFakeSupabase({
      lote_itens: [
        { id: 1, lote_id: 'L1', item_id: 'MLB1', status: 'pendente', tentativas: 0 },
        { id: 2, lote_id: 'L1', item_id: 'MLB2', status: 'pendente', tentativas: 0 },
        { id: 3, lote_id: 'L1', item_id: 'MLB3', status: 'pendente', tentativas: 0 },
      ],
    });
    injetarCliente(() => client as never);

    const itens = await proximosPendentes('L1', 2);
    expect(itens).toHaveLength(2);
  });
});

describe('marcarConcluido / marcarErro', () => {
  it('grava resultado e limpa erro em marcarConcluido', async () => {
    const { client, writes } = makeFakeSupabase({
      lote_itens: [{ id: 1, lote_id: 'L1', item_id: 'MLB1', status: 'processando' }],
    });
    injetarCliente(() => client as never);

    await marcarConcluido(1, { titulo: 'ok' });

    const upd = writes.find((w) => w.table === 'lote_itens' && w.kind === 'update');
    expect((upd!.payload as Record<string, unknown>).status).toBe('concluido');
  });

  it('grava a mensagem de erro em marcarErro', async () => {
    const { client, writes } = makeFakeSupabase({
      lote_itens: [{ id: 1, lote_id: 'L1', item_id: 'MLB1', status: 'processando' }],
    });
    injetarCliente(() => client as never);

    await marcarErro(1, 'ML 500 em /items/MLB1');

    const upd = writes.find((w) => w.table === 'lote_itens' && w.kind === 'update');
    expect((upd!.payload as Record<string, unknown>).status).toBe('erro');
    expect((upd!.payload as Record<string, unknown>).erro).toBe('ML 500 em /items/MLB1');
  });
});

describe('marcarParaRetentar', () => {
  const itemBase: LoteItem = {
    id: 1,
    lote_id: 'L1',
    item_id: 'MLB1',
    status: 'processando',
    tentativas: 0,
    resultado: null,
    erro: null,
  };

  it('volta pra pendente e soma 1 em tentativas, abaixo do teto', async () => {
    const { client, writes } = makeFakeSupabase({ lote_itens: [{ ...itemBase }] });
    injetarCliente(() => client as never);

    await marcarParaRetentar({ ...itemBase, tentativas: 1 });

    const upd = writes.find((w) => w.table === 'lote_itens' && w.kind === 'update');
    expect((upd!.payload as Record<string, unknown>).status).toBe('pendente');
    expect((upd!.payload as Record<string, unknown>).tentativas).toBe(2);
  });

  it('vira erro ao atingir o teto de tentativas', async () => {
    const { client, writes } = makeFakeSupabase({ lote_itens: [{ ...itemBase }] });
    injetarCliente(() => client as never);

    await marcarParaRetentar({ ...itemBase, tentativas: TETO_TENTATIVAS - 1 });

    const upd = writes.find((w) => w.table === 'lote_itens' && w.kind === 'update');
    expect((upd!.payload as Record<string, unknown>).status).toBe('erro');
  });
});

describe('fecharSeCompleto', () => {
  it('fecha o lote quando não sobra pendente/processando', async () => {
    const { client, writes } = makeFakeSupabase({
      lotes: [{ id: 'L1', status: 'em_andamento' }],
      lote_itens: [
        { lote_id: 'L1', status: 'concluido' },
        { lote_id: 'L1', status: 'erro' },
      ],
    });
    injetarCliente(() => client as never);

    await fecharSeCompleto('L1');

    const upd = writes.find((w) => w.table === 'lotes' && w.kind === 'update');
    expect((upd!.payload as Record<string, unknown>).status).toBe('concluido');
  });

  it('não fecha enquanto sobra pendente ou processando', async () => {
    const { client, writes } = makeFakeSupabase({
      lotes: [{ id: 'L1', status: 'em_andamento' }],
      lote_itens: [
        { lote_id: 'L1', status: 'concluido' },
        { lote_id: 'L1', status: 'pendente' },
      ],
    });
    injetarCliente(() => client as never);

    await fecharSeCompleto('L1');

    expect(writes.find((w) => w.table === 'lotes' && w.kind === 'update')).toBeUndefined();
  });
});

describe('buscarLote', () => {
  it('devolve o lote com contagens por status', async () => {
    const { client } = makeFakeSupabase({
      lotes: [{ id: 'L1', seller_id: '177795203', total_itens: 3, status: 'em_andamento' }],
      lote_itens: [
        { lote_id: 'L1', status: 'concluido' },
        { lote_id: 'L1', status: 'pendente' },
        { lote_id: 'L1', status: 'pendente' },
      ],
    });
    injetarCliente(() => client as never);

    const lote = await buscarLote('L1');
    expect(lote?.contagens).toEqual({ pendente: 2, processando: 0, concluido: 1, erro: 0 });
  });

  it('devolve null quando o lote não existe', async () => {
    const { client } = makeFakeSupabase({ lotes: [], lote_itens: [] });
    injetarCliente(() => client as never);
    expect(await buscarLote('inexistente')).toBeNull();
  });
});
