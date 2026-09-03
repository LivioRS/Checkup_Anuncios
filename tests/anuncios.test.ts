import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { buscarProdutos } from '../src/lib/ml/catalogo';
import { POST as criarAnuncio } from '../src/app/api/anuncios/route';

const HORA = 60 * 60 * 1000;

function conta(over: Partial<{ seller_id: string; access_expira_em: string | null }> = {}) {
  return {
    id: 1,
    seller_id: '2490900',
    apelido: 'SHINNISHI',
    org: null,
    access_token: 'tok-valido',
    refresh_token: 'refresh-A',
    access_expira_em: new Date(Date.now() + 6 * HORA).toISOString(),
    ...over,
  };
}

function responseBody(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function bodyCriar(over: Record<string, unknown> = {}) {
  return {
    seller_id: '2490900',
    catalog_product_id: 'MLB123456',
    valor: 199.9,
    quantidade: 3,
    condicao: 'new',
    marca: 'Marca',
    modelo: 'Modelo X',
    codigo: '7891234567890',
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

describe('buscarProdutos — prioridade de GTIN', () => {
  it('tenta por GTIN antes de cair para texto quando `codigo` é passado', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);

    const chamadas: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      chamadas.push(String(url));
      if (String(url).includes('product_identifier=')) {
        return responseBody({ results: [{ id: 'MLB1', name: 'Achado por GTIN' }] });
      }
      return responseBody({ results: [{ id: 'MLB2', name: 'Achado por texto' }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { resultados, via } = await buscarProdutos({
      site: 'MLB',
      gtin: '7891234567890',
      q: 'marca modelo',
    });

    expect(via).toBe('gtin');
    expect(resultados[0]?.id).toBe('MLB1');
    // GTIN é tentado antes da busca por texto.
    expect(chamadas[0]).toContain('product_identifier=');
  });

  it('cai para busca por texto quando o GTIN não acha nada', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('product_identifier=')) {
        return responseBody({ results: [] });
      }
      return responseBody({ results: [{ id: 'MLB2', name: 'Achado por texto' }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const { resultados, via } = await buscarProdutos({
      site: 'MLB',
      gtin: '0000000000000',
      q: 'marca modelo',
    });

    expect(via).toBe('texto');
    expect(resultados[0]?.id).toBe('MLB2');
  });
});

describe('POST /api/anuncios', () => {
  it('monta o payload certo, nunca manda status "active", e grava sucesso em anuncio_criacoes', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [conta()] });
    injetarCliente(() => client as never);

    let payloadEnviado: Record<string, unknown> | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/items') && init?.method === 'POST') {
        payloadEnviado = JSON.parse(String(init.body));
        // Simula o ML aceitando o campo status já na criação.
        return responseBody({ id: 'MLB999', status: 'paused', permalink: 'https://x/MLB999' });
      }
      throw new Error(`chamada inesperada: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://local/api/anuncios', {
      method: 'POST',
      body: JSON.stringify(bodyCriar()),
    });
    const res = await criarAnuncio(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.criado.status).toBe('paused');

    expect(payloadEnviado).toMatchObject({
      catalog_listing: true,
      catalog_product_id: 'MLB123456',
      price: 199.9,
      available_quantity: 3,
      condition: 'new',
      status: 'paused',
    });
    expect(payloadEnviado).not.toMatchObject({ status: 'active' });

    const gravado = writes.find((w) => w.table === 'anuncio_criacoes' && w.kind === 'insert');
    expect(gravado).toBeDefined();
    const payloadGravado = gravado!.payload as Record<string, unknown>;
    expect(payloadGravado.item_id).toBe('MLB999');
    expect(payloadGravado.status).toBe(200);
    expect(payloadGravado.seller_id).toBe('2490900');
  });

  it('se o ML ignorar `status` no create (devolve "active"), pausa com um PUT antes de responder sucesso', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [conta()] });
    injetarCliente(() => client as never);

    let putChamado: { url: string; body: unknown } | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/items') && init?.method === 'POST') {
        return responseBody({ id: 'MLB998', status: 'active' });
      }
      if (u.includes('/items/MLB998') && init?.method === 'PUT') {
        putChamado = { url: u, body: JSON.parse(String(init.body)) };
        return responseBody({ id: 'MLB998', status: 'paused' });
      }
      throw new Error(`chamada inesperada: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://local/api/anuncios', {
      method: 'POST',
      body: JSON.stringify(bodyCriar()),
    });
    const res = await criarAnuncio(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.criado.status).toBe('paused');
    expect(putChamado).not.toBeNull();
    expect((putChamado as unknown as { body: unknown })?.body).toEqual({ status: 'paused' });

    const gravado = writes.find((w) => w.table === 'anuncio_criacoes' && w.kind === 'insert');
    const resp = (gravado!.payload as Record<string, unknown>).response as Record<string, unknown>;
    expect(resp.pausado).toBe(true);
  });

  it('se o create falhar, devolve o erro e grava a falha em anuncio_criacoes (sem item_id)', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [conta()] });
    injetarCliente(() => client as never);

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/items') && init?.method === 'POST') {
        return new Response(JSON.stringify({ message: 'invalid catalog_product_id' }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`chamada inesperada: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://local/api/anuncios', {
      method: 'POST',
      body: JSON.stringify(bodyCriar()),
    });
    const res = await criarAnuncio(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.erro).toBeDefined();

    const gravado = writes.find((w) => w.table === 'anuncio_criacoes' && w.kind === 'insert');
    expect(gravado).toBeDefined();
    const payloadGravado = gravado!.payload as Record<string, unknown>;
    expect(payloadGravado.item_id).toBeNull();
    expect(payloadGravado.status).toBe(400);
  });

  it('valida entrada antes de chamar o ML (condição inválida)', async () => {
    const { client } = makeFakeSupabase({ contas: [conta()] });
    injetarCliente(() => client as never);
    const fetchMock = vi.fn(async () => {
      throw new Error('não deveria chamar o ML');
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://local/api/anuncios', {
      method: 'POST',
      body: JSON.stringify(bodyCriar({ condicao: 'reformado' })),
    });
    const res = await criarAnuncio(req);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
