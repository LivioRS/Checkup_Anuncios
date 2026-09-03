import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { POST as criarAvulso } from '../src/app/api/anuncios/avulso/route';

/** Plano 029 — criar anúncio FORA do catálogo. Mesmo invariante do 019: nasce pausado, tudo logado. */

const HORA = 60 * 60 * 1000;

function conta() {
  return {
    id: 1,
    seller_id: '2490900',
    apelido: 'SHINNISHI',
    org: null,
    access_token: 'tok-valido',
    refresh_token: 'refresh-A',
    access_expira_em: new Date(Date.now() + 6 * HORA).toISOString(),
  };
}

function responseBody(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
}

function corpo(over: Record<string, unknown> = {}) {
  return {
    seller_id: '2490900',
    titulo: 'Pedal de Guitarra Overdrive XYZ Tube Screamer',
    category_id: 'MLB9999',
    valor: 349.9,
    quantidade: 5,
    condicao: 'new',
    marca: 'XYZ',
    modelo: 'TS-9',
    fotos: ['https://http2.mlstatic.com/foto1.jpg', 'not-a-url', 'https://x/foto2.jpg'],
    garantia: { tipo: 'vendedor', tempo: '1 ano' },
    ...over,
  };
}

beforeEach(() => {
  process.env.ML_CLIENT_ID = 'test-client';
  process.env.ML_CLIENT_SECRET = 'test-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  injetarCliente(null);
});

describe('POST /api/anuncios/avulso', () => {
  it('monta o payload de item avulso certo e nunca manda catalog_listing', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [conta()], anuncio_criacoes: [] });
    injetarCliente(() => client as never);

    let enviado: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/items') && init?.method === 'POST') {
        enviado = JSON.parse(String(init.body));
        return responseBody({ id: 'MLB111', status: 'paused', permalink: 'https://x/MLB111' });
      }
      throw new Error(`inesperado: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await criarAvulso(new Request('http://local', { method: 'POST', body: JSON.stringify(corpo()) }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.criado.status).toBe('paused');

    expect(enviado).toMatchObject({
      title: 'Pedal de Guitarra Overdrive XYZ Tube Screamer',
      category_id: 'MLB9999',
      price: 349.9,
      currency_id: 'BRL',
      available_quantity: 5,
      buying_mode: 'buy_it_now',
      listing_type_id: 'gold_special',
      condition: 'new',
      status: 'paused',
    });
    expect(enviado).not.toHaveProperty('catalog_listing');
    // URL inválida é descartada; sobram 2 fotos.
    expect((enviado!.pictures as unknown[])).toEqual([
      { source: 'https://http2.mlstatic.com/foto1.jpg' },
      { source: 'https://x/foto2.jpg' },
    ]);
    expect(enviado!.attributes).toEqual([
      { id: 'BRAND', value_name: 'XYZ' },
      { id: 'MODEL', value_name: 'TS-9' },
      { id: 'EMPTY_GTIN_REASON', value_name: 'Não possui código universal de produto' },
    ]);
    expect(enviado!.sale_terms).toEqual([
      { id: 'WARRANTY_TYPE', value_name: 'Garantia do vendedor' },
      { id: 'WARRANTY_TIME', value_name: '1 ano' },
    ]);

    const log = writes.find((w) => w.table === 'anuncio_criacoes' && w.kind === 'insert');
    expect((log!.payload as Record<string, unknown>).catalog_product_id).toBeNull();
    expect((log!.payload as Record<string, unknown>).item_id).toBe('MLB111');
  });

  it('manda GTIN quando informado', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()], anuncio_criacoes: [] }).client as never);
    let enviado: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/items') && init?.method === 'POST') {
          enviado = JSON.parse(String(init.body));
          return responseBody({ id: 'MLB222', status: 'paused' });
        }
        throw new Error('inesperado');
      }),
    );

    await criarAvulso(new Request('http://local', { method: 'POST', body: JSON.stringify(corpo({ gtin: '7891234567890' })) }));
    expect(enviado!.attributes).toContainEqual({ id: 'GTIN', value_name: '7891234567890' });
    expect(enviado!.attributes).not.toContainEqual(
      expect.objectContaining({ id: 'EMPTY_GTIN_REASON' }),
    );
  });

  it('se o ML devolver "active", pausa com um PUT antes de responder ok', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()], anuncio_criacoes: [] }).client as never);
    let putBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/items') && init?.method === 'POST') return responseBody({ id: 'MLB333', status: 'active' });
        if (u.includes('/items/MLB333') && init?.method === 'PUT') {
          putBody = JSON.parse(String(init.body));
          return responseBody({ id: 'MLB333', status: 'paused' });
        }
        throw new Error(`inesperado: ${u}`);
      }),
    );

    const res = await criarAvulso(new Request('http://local', { method: 'POST', body: JSON.stringify(corpo()) }));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.criado.status).toBe('paused');
    expect(putBody).toEqual({ status: 'paused' });
  });

  it('descrição: grava via PUT /description; se falhar, ainda responde ok e loga o erro', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [conta()], anuncio_criacoes: [] });
    injetarCliente(() => client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/items') && init?.method === 'POST') return responseBody({ id: 'MLB444', status: 'paused' });
        if (u.includes('/items/MLB444/description')) return new Response('{"message":"bad desc"}', { status: 400 });
        throw new Error(`inesperado: ${u}`);
      }),
    );

    const res = await criarAvulso(
      new Request('http://local', { method: 'POST', body: JSON.stringify(corpo({ descricao: 'Texto da descrição do produto.' })) }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.erroDescricao).toBeTruthy();

    const log = writes.find((w) => w.table === 'anuncio_criacoes' && w.kind === 'insert');
    const resp = (log!.payload as Record<string, unknown>).response as Record<string, unknown>;
    expect(resp.erroDescricao).toBeTruthy();
  });

  it('create recusado: devolve o erro e loga a falha (item_id null, catalog_product_id null)', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [conta()], anuncio_criacoes: [] });
    injetarCliente(() => client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/items') && init?.method === 'POST') {
          return new Response(JSON.stringify({ message: 'category_id inválido' }), { status: 400 });
        }
        throw new Error('inesperado');
      }),
    );

    const res = await criarAvulso(new Request('http://local', { method: 'POST', body: JSON.stringify(corpo()) }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.erro).toBeDefined();

    const log = writes.find((w) => w.table === 'anuncio_criacoes' && w.kind === 'insert');
    expect((log!.payload as Record<string, unknown>).item_id).toBeNull();
    expect((log!.payload as Record<string, unknown>).status).toBe(400);
    expect((log!.payload as Record<string, unknown>).catalog_product_id).toBeNull();
  });

  it('valida antes de chamar o ML: título curto, sem foto, categoria malformada', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()], anuncio_criacoes: [] }).client as never);
    const fetchMock = vi.fn(async () => {
      throw new Error('não deveria chamar o ML');
    });
    vi.stubGlobal('fetch', fetchMock);

    for (const over of [{ titulo: 'curto' }, { fotos: [] }, { category_id: '123' }]) {
      const res = await criarAvulso(new Request('http://local', { method: 'POST', body: JSON.stringify(corpo(over)) }));
      expect(res.status).toBe(400);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
