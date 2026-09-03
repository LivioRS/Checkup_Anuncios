import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { GET as fichaGtinGET } from '../src/app/api/anuncios/ficha-por-gtin/route';
import { POST as criarAvulso } from '../src/app/api/anuncios/avulso/route';

/** Plano 032, Parte A — enriquecimento determinístico da ficha por GTIN. */

const HORA = 60 * 60 * 1000;

function conta() {
  return {
    id: 1,
    seller_id: '2490900',
    apelido: 'X',
    org: null,
    access_token: 'tok',
    refresh_token: 'r',
    access_expira_em: new Date(Date.now() + 6 * HORA).toISOString(),
  };
}

function responseBody(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  process.env.ML_CLIENT_ID = 'c';
  process.env.ML_CLIENT_SECRET = 's';
});

afterEach(() => {
  vi.unstubAllGlobals();
  injetarCliente(null);
});

describe('GET /api/anuncios/ficha-por-gtin', () => {
  it('devolve os atributos do produto de catálogo — e NUNCA as imagens', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(String(url)).toContain('product_identifier=7891234567890');
        return responseBody({
          results: [
            {
              id: 'MLB99',
              name: 'Pedal Overdrive XYZ OD-1',
              domain_id: 'MLB-GUITAR_PEDALS',
              pictures: [{ url: 'https://fabricante/foto.jpg' }],
              attributes: [
                { id: 'BRAND', name: 'Marca', value_name: 'XYZ' },
                { id: 'VOLTAGE', name: 'Voltagem', value_name: '9V' },
                { id: 'COLOR', name: 'Cor', value_id: '-1', value_name: 'Preto' },
              ],
            },
          ],
        });
      }),
    );

    const res = await fichaGtinGET(
      new Request('http://local/api/anuncios/ficha-por-gtin?gtin=7891234567890&seller_id=2490900'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.achado).toBe(true);
    expect(json.titulo_sugerido).toBe('Pedal Overdrive XYZ OD-1');
    expect(json.domain_id).toBe('MLB-GUITAR_PEDALS');
    // atributo com value_id '-1' é descartado; imagens nunca aparecem no corpo.
    expect(json.atributos).toEqual([
      { id: 'BRAND', nome: 'Marca', valor: 'XYZ' },
      { id: 'VOLTAGE', nome: 'Voltagem', valor: '9V' },
    ]);
    expect(json).not.toHaveProperty('pictures');
    expect(JSON.stringify(json)).not.toContain('fabricante/foto.jpg');
  });

  it('achado:false quando o catálogo não tem o código', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal('fetch', vi.fn(async () => responseBody({ results: [] })));

    const res = await fichaGtinGET(
      new Request('http://local/api/anuncios/ficha-por-gtin?gtin=00000000000000&seller_id=2490900'),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.achado).toBe(false);
  });

  it('gtin inválido → 400 sem chamar o ML', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    const fetchMock = vi.fn(async () => responseBody({ results: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await fichaGtinGET(new Request('http://local/api/anuncios/ficha-por-gtin?gtin=123'));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/anuncios/avulso — atributos_extra', () => {
  function corpo(over: Record<string, unknown> = {}) {
    return {
      seller_id: '2490900',
      titulo: 'Pedal de Guitarra Overdrive XYZ OD-1',
      category_id: 'MLB9999',
      valor: 349.9,
      quantidade: 3,
      condicao: 'new',
      marca: 'XYZ',
      modelo: 'OD-1',
      fotos: ['https://x/1.jpg'],
      garantia: { tipo: 'vendedor', tempo: '1 ano' },
      ...over,
    };
  }

  it('mescla os extras DEPOIS de BRAND/MODEL/GTIN, descarta reservados e dedup por id', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()], anuncio_criacoes: [] }).client as never);
    let enviado: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/items') && init?.method === 'POST') {
          enviado = JSON.parse(String(init.body));
          return responseBody({ id: 'MLB1', status: 'paused' });
        }
        throw new Error('inesperado');
      }),
    );

    await criarAvulso(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify(
          corpo({
            gtin: '7891234567890',
            atributos_extra: [
              { id: 'VOLTAGE', value_name: '9V' },
              { id: 'BRAND', value_name: ' tentativa de sobrescrever ' }, // reservado → descartado
              { id: 'VOLTAGE', value_name: '12V' }, // dedup → ignorado (VOLTAGE já entrou)
              { id: '  ', value_name: 'x' }, // id vazio → ignorado
            ],
          }),
        ),
      }),
    );

    expect(enviado!.attributes).toEqual([
      { id: 'BRAND', value_name: 'XYZ' },
      { id: 'MODEL', value_name: 'OD-1' },
      { id: 'GTIN', value_name: '7891234567890' },
      { id: 'VOLTAGE', value_name: '9V' },
    ]);
  });

  it('sem atributos_extra o payload é idêntico ao de antes', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()], anuncio_criacoes: [] }).client as never);
    let enviado: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/items') && init?.method === 'POST') {
          enviado = JSON.parse(String(init.body));
          return responseBody({ id: 'MLB2', status: 'paused' });
        }
        throw new Error('inesperado');
      }),
    );

    await criarAvulso(new Request('http://local', { method: 'POST', body: JSON.stringify(corpo()) }));
    expect(enviado!.attributes).toEqual([
      { id: 'BRAND', value_name: 'XYZ' },
      { id: 'MODEL', value_name: 'OD-1' },
      { id: 'EMPTY_GTIN_REASON', value_name: 'Não possui código universal de produto' },
    ]);
  });

  it('grava origem_ficha no log de anuncio_criacoes', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [conta()], anuncio_criacoes: [] });
    injetarCliente(() => client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/items') && init?.method === 'POST') {
          return responseBody({ id: 'MLB3', status: 'paused' });
        }
        throw new Error('inesperado');
      }),
    );

    await criarAvulso(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify(corpo({ atributos_extra: [{ id: 'VOLTAGE', value_name: '9V' }], origem_ficha: 'gtin' })),
      }),
    );

    const log = writes.find((w) => w.table === 'anuncio_criacoes' && w.kind === 'insert');
    const resp = (log!.payload as Record<string, unknown>).response as Record<string, unknown>;
    expect(resp.origem_ficha).toBe('gtin');
    expect(resp.atributos_extra).toBe(1);
  });
});
