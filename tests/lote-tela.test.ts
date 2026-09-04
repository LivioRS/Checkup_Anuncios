import { afterEach, describe, expect, it } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { listarItensDoLote, reenfileirarErros } from '../src/lib/lotes/fila';
import { GET as itensGET } from '../src/app/api/lote/[id]/itens/route';
import { POST as reenfileirarPOST } from '../src/app/api/lote/[id]/reenfileirar/route';

/** Plano 026 (f2c3) — endpoints e helpers da tela de progresso do lote. */

afterEach(() => {
  injetarCliente(null);
});

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('listarItensDoLote', () => {
  it('devolve todos os itens do lote, sem filtrar por status', async () => {
    const { client } = makeFakeSupabase({
      lote_itens: [
        { id: 1, lote_id: 'L1', item_id: 'MLB1', status: 'concluido', tentativas: 0, resultado: { ok: 1 }, erro: null },
        { id: 2, lote_id: 'L1', item_id: 'MLB2', status: 'erro', tentativas: 5, resultado: null, erro: 'boom' },
        { id: 3, lote_id: 'OUTRO', item_id: 'MLB9', status: 'pendente', tentativas: 0, resultado: null, erro: null },
      ],
    });
    injetarCliente(() => client as never);

    const itens = await listarItensDoLote('L1');
    expect(itens.map((i) => i.item_id).sort()).toEqual(['MLB1', 'MLB2']);
  });
});

describe('reenfileirarErros', () => {
  it('devolve só os itens erro pra pendente (tentativas 0, erro limpo) e reabre o lote', async () => {
    const { client, writes } = makeFakeSupabase({
      lotes: [{ id: 'L1', seller_id: '2490900', total_itens: 3, status: 'concluido', tipo: 'titulo' }],
      lote_itens: [
        { id: 1, lote_id: 'L1', item_id: 'MLB1', status: 'concluido', tentativas: 0 },
        { id: 2, lote_id: 'L1', item_id: 'MLB2', status: 'erro', tentativas: 5, erro: 'boom' },
        { id: 3, lote_id: 'L1', item_id: 'MLB3', status: 'erro', tentativas: 3, erro: 'nope' },
      ],
    });
    injetarCliente(() => client as never);

    const r = await reenfileirarErros('L1');
    expect(r).toEqual({ reenfileirados: 2 });

    const updItens = writes.filter((w) => w.table === 'lote_itens' && w.kind === 'update');
    expect(updItens).toHaveLength(2);
    for (const u of updItens) {
      expect(u.payload).toMatchObject({ status: 'pendente', tentativas: 0, erro: null });
    }

    const updLote = writes.find((w) => w.table === 'lotes' && w.kind === 'update');
    expect((updLote!.payload as Record<string, unknown>).status).toBe('em_andamento');

    // O item que já estava concluído não foi tocado.
    expect(updItens.some((u) => u.filter?.val === 1)).toBe(false);
  });

  it('lote sem itens erro: reenfileirados 0 e nada escrito em lotes', async () => {
    const { client, writes } = makeFakeSupabase({
      lotes: [{ id: 'L2', seller_id: '2490900', total_itens: 1, status: 'concluido', tipo: 'diagnostico' }],
      lote_itens: [{ id: 1, lote_id: 'L2', item_id: 'MLB1', status: 'concluido', tentativas: 0 }],
    });
    injetarCliente(() => client as never);

    const r = await reenfileirarErros('L2');
    expect(r).toEqual({ reenfileirados: 0 });
    expect(writes.some((w) => w.table === 'lotes')).toBe(false);
  });
});

describe('GET /api/lote/[id]/itens', () => {
  it('200 com { itens } quando o lote existe', async () => {
    const { client } = makeFakeSupabase({
      lotes: [{ id: 'L1', seller_id: '2490900', total_itens: 1, status: 'em_andamento', tipo: 'titulo' }],
      lote_itens: [{ id: 1, lote_id: 'L1', item_id: 'MLB1', status: 'pendente', tentativas: 0 }],
    });
    injetarCliente(() => client as never);

    const res = await itensGET(new Request('http://local'), params('L1'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.itens).toHaveLength(1);
    expect(json.itens[0].item_id).toBe('MLB1');
  });

  it('404 quando o lote não existe', async () => {
    const { client } = makeFakeSupabase({ lotes: [], lote_itens: [] });
    injetarCliente(() => client as never);

    const res = await itensGET(new Request('http://local'), params('sumido'));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/lote/[id]/reenfileirar', () => {
  it('200 com { reenfileirados, lote } e o lote volta a em_andamento', async () => {
    const { client } = makeFakeSupabase({
      lotes: [{ id: 'L1', seller_id: '2490900', total_itens: 2, status: 'concluido', tipo: 'titulo' }],
      lote_itens: [
        { id: 1, lote_id: 'L1', item_id: 'MLB1', status: 'concluido', tentativas: 0 },
        { id: 2, lote_id: 'L1', item_id: 'MLB2', status: 'erro', tentativas: 5, erro: 'boom' },
      ],
    });
    injetarCliente(() => client as never);

    const res = await reenfileirarPOST(new Request('http://local', { method: 'POST' }), params('L1'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.reenfileirados).toBe(1);
    expect(json.lote.status).toBe('em_andamento');
    expect(json.lote.contagens.pendente).toBe(1);
  });

  it('404 quando o lote não existe', async () => {
    const { client } = makeFakeSupabase({ lotes: [], lote_itens: [] });
    injetarCliente(() => client as never);

    const res = await reenfileirarPOST(new Request('http://local', { method: 'POST' }), params('sumido'));
    expect(res.status).toBe(404);
  });
});
