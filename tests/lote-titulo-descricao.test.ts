import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { POST as tituloPOST } from '../src/app/api/titulo/[id]/route';
import { POST as descricaoPOST } from '../src/app/api/descricao/[id]/route';
import { gerarPropostaTitulo } from '../src/lib/ml/titulo';
import { gerarPropostaDescricao } from '../src/lib/ml/descricao';
import { comConta } from '../src/lib/ml/client';
import { DIMENSOES } from '../src/lib/ia-tipos';
import { POST as loteCriarPOST } from '../src/app/api/lote/route';
import { POST as loteProcessarPOST } from '../src/app/api/lote/[id]/processar/route';
import { criarLote, buscarLote } from '../src/lib/lotes/fila';

/**
 * Plano 025 (f2c2) — rede de regressão do `POST` de `/titulo` e `/descricao`.
 *
 * Estas duas rotas não tinham teste nenhum antes deste plano. O `POST` de cada
 * uma foi extraído para uma função de motor (`gerarPropostaTitulo` /
 * `gerarPropostaDescricao`) para o worker de lote poder reusar a MESMA geração.
 * A STOP condition do plano é: o JSON devolvido pelo `POST` tem de ser idêntico
 * antes e depois da extração. Estes testes foram escritos contra o handler
 * ANTES da extração (rodaram verde), e continuam verdes depois — é essa
 * igualdade byte a byte que eles guardam.
 */

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

function claudeText(texto: string) {
  return responseBody({ content: [{ type: 'text', text: texto }] });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  process.env.ML_CLIENT_ID = 'test-client';
  process.env.ML_CLIENT_SECRET = 'test-secret';
  process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
  process.env.ML_SELLER_ID_PADRAO = '2490900';
  delete process.env.ANTHROPIC_MODEL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  injetarCliente(null);
});

/* ------------------------------------------------------------------ *
 * /api/titulo/[id] — POST
 * ------------------------------------------------------------------ */

const CAT_TITULO = 'MLB-CAT-TITULO-025';

const PLANO_TITULO_JSON = JSON.stringify({
  titulos: [
    { texto: 'Fone de Ouvido Bluetooth XYZ-100 Sem Fio', motivo: 'puxa o termo de volume', termos: ['fone bluetooth'] },
    { texto: 'Fone Bluetooth XYZ-100 para Academia e Corrida', motivo: 'cauda longa', termos: ['fone academia'] },
    { texto: 'Fone de Ouvido Sem Fio XYZ-100 Bluetooth 5.3', motivo: 'equilibrio', termos: ['bluetooth 5.3'] },
  ],
  modelo: { base: 'XYZ-100', termos: ['bluetooth', 'sem fio'], motivo: 'modelo real', risco: null },
  descartados: [{ termo: 'cabo p2', motivo: 'este produto nao tem cabo' }],
});

function fetchTitulo(itemId: string, over: { catalogListing?: boolean } = {}) {
  return vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('api.anthropic.com')) return claudeText(PLANO_TITULO_JSON);
    if (u.includes(`/trends/MLB/${CAT_TITULO}`)) {
      return responseBody([{ keyword: 'fone bluetooth' }, { keyword: 'headset gamer' }, { keyword: 'fone academia' }]);
    }
    if (u.includes(`/categories/${CAT_TITULO}/attributes`)) {
      return responseBody([{ id: 'MODEL', name: 'Modelo', value_type: 'string', value_max_length: 80 }]);
    }
    if (u.includes(`/items/${itemId}`)) {
      return responseBody({
        id: itemId,
        title: 'Fone XYZ',
        category_id: CAT_TITULO,
        site_id: 'MLB',
        seller_id: 2490900,
        catalog_listing: over.catalogListing ?? false,
        attributes: [
          { id: 'MODEL', name: 'Modelo', value_id: '123', value_name: 'XYZ-100 old' },
          { id: 'BRAND', name: 'Marca', value_id: '456', value_name: 'XYZ' },
          { id: 'COLOR', name: 'Cor', value_id: '-1', value_name: 'Preto' },
        ],
      });
    }
    throw new Error(`chamada inesperada (titulo): ${u}`);
  });
}

const CORPO_TITULO_ESPERADO = {
  plano: {
    titulos: [
      { texto: 'Fone de Ouvido Bluetooth XYZ-100 Sem Fio', motivo: 'puxa o termo de volume', termos: ['fone bluetooth'] },
      { texto: 'Fone Bluetooth XYZ-100 para Academia e Corrida', motivo: 'cauda longa', termos: ['fone academia'] },
      { texto: 'Fone de Ouvido Sem Fio XYZ-100 Bluetooth 5.3', motivo: 'equilibrio', termos: ['bluetooth 5.3'] },
    ],
    modelo: { base: 'XYZ-100', termos: ['bluetooth', 'sem fio'], motivo: 'modelo real', risco: null },
    descartados: [{ termo: 'cabo p2', motivo: 'este produto nao tem cabo' }],
  },
  atual: 'Fone XYZ',
  modeloAtual: 'XYZ-100 old',
  limiteModelo: 80,
  podeGravar: true,
  catalogo: false,
};

describe('POST /api/titulo/[id] — geração de proposta (regressão da extração)', () => {
  it('devolve o plano de título com o mesmo shape de sempre', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal('fetch', fetchTitulo('MLB-TIT-1'));

    const res = await tituloPOST(new Request('http://local/api/titulo/MLB-TIT-1', { method: 'POST' }), params('MLB-TIT-1'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual(CORPO_TITULO_ESPERADO);
  });

  it('422 quando a categoria não publica tendências', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes(`/trends/MLB/${CAT_TITULO}`)) return responseBody([]);
        if (u.includes(`/items/MLB-TIT-2`)) {
          return responseBody({ id: 'MLB-TIT-2', title: 'Fone XYZ', category_id: CAT_TITULO, site_id: 'MLB', seller_id: 2490900 });
        }
        throw new Error(`chamada inesperada: ${u}`);
      }),
    );

    const res = await tituloPOST(new Request('http://local/api/titulo/MLB-TIT-2', { method: 'POST' }), params('MLB-TIT-2'));
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json).toEqual({ erro: `O Mercado Livre não publica tendências para a categoria ${CAT_TITULO}.` });
  });

  it('gerarPropostaTitulo (motor) devolve o mesmo corpo que o handler', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal('fetch', fetchTitulo('MLB-TIT-3'));

    const item = { id: 'MLB-TIT-3', title: 'Fone XYZ', category_id: CAT_TITULO, site_id: 'MLB', seller_id: 2490900, catalog_listing: false, attributes: [
      { id: 'MODEL', name: 'Modelo', value_id: '123', value_name: 'XYZ-100 old' },
      { id: 'BRAND', name: 'Marca', value_id: '456', value_name: 'XYZ' },
      { id: 'COLOR', name: 'Cor', value_id: '-1', value_name: 'Preto' },
    ] };

    const r = await comConta('2490900', () => gerarPropostaTitulo(item as never, { temConta: true }));

    expect(r.status).toBe(200);
    expect(r.corpo).toEqual(CORPO_TITULO_ESPERADO);
  });
});

/* ------------------------------------------------------------------ *
 * /api/descricao/[id] — POST
 * ------------------------------------------------------------------ */

const CAT_DESC = 'MLB-CAT-DESC-025';

function fetchDescricao(itemId: string, claudeReplies: string[]) {
  const fila = [...claudeReplies];
  return vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes('api.anthropic.com')) return claudeText(fila.shift() ?? '');
    if (u.includes(`/items/${itemId}/description`)) return responseBody({ plain_text: 'descricao atual do anuncio' });
    if (u.includes(`/reviews/item/${itemId}`)) return responseBody({ reviews: [] });
    if (u.includes('/questions/search')) return responseBody({ questions: [] });
    if (u.includes(`/trends/MLB/${CAT_DESC}`)) return responseBody([{ keyword: 'fone bluetooth' }]);
    if (u.includes(`/categories/${CAT_DESC}/attributes`)) {
      return responseBody([{ id: 'BRAND', name: 'Marca', value_type: 'string' }]);
    }
    if (u.includes(`/items/${itemId}`)) {
      return responseBody({
        id: itemId,
        title: 'Fone XYZ',
        category_id: CAT_DESC,
        site_id: 'MLB',
        seller_id: 2490900,
        attributes: [{ id: 'BRAND', name: 'Marca', value_id: '456', value_name: 'XYZ' }],
        pictures: [{ id: 'p1' }, { id: 'p2' }],
      });
    }
    throw new Error(`chamada inesperada (descricao): ${u}`);
  });
}

const NOTAS_JSON = JSON.stringify(
  Object.fromEntries(DIMENSOES.map((d) => [d.chave, { nota: 8, observacao: 'ok' }])),
);

const NOTAS_ESPERADAS = Object.fromEntries(DIMENSOES.map((d) => [d.chave, { nota: 8, observacao: 'ok' }]));

describe('POST /api/descricao/[id] — geração (regressão da extração)', () => {
  it('acao "analisar" devolve notas + geral + atual', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()], loja_blocos: [] }).client as never);
    vi.stubGlobal('fetch', fetchDescricao('MLB-DSC-1', [NOTAS_JSON]));

    const res = await descricaoPOST(
      new Request('http://local/api/descricao/MLB-DSC-1', { method: 'POST', body: JSON.stringify({ acao: 'analisar' }) }),
      params('MLB-DSC-1'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ notas: NOTAS_ESPERADAS, geral: 8, atual: 'descricao atual do anuncio' });
  });

  it('acao "analisar" com JSON ilegível devolve 502', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()], loja_blocos: [] }).client as never);
    vi.stubGlobal('fetch', fetchDescricao('MLB-DSC-2', ['isto nao e json']));

    const res = await descricaoPOST(
      new Request('http://local/api/descricao/MLB-DSC-2', { method: 'POST', body: JSON.stringify({ acao: 'analisar' }) }),
      params('MLB-DSC-2'),
    );
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json).toEqual({ erro: 'Não consegui interpretar a resposta da análise.', bruto: 'isto nao e json' });
  });

  it('acao default ("melhorar") devolve sugestao + atual + usouBlocos + blocos', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()], loja_blocos: [] }).client as never);
    vi.stubGlobal('fetch', fetchDescricao('MLB-DSC-3', ['Texto final da descricao.\n\nSegundo paragrafo.']));

    const res = await descricaoPOST(
      new Request('http://local/api/descricao/MLB-DSC-3', { method: 'POST', body: JSON.stringify({}) }),
      params('MLB-DSC-3'),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      sugestao: 'Texto final da descricao.\n\nSegundo paragrafo.',
      atual: 'descricao atual do anuncio',
      usouBlocos: false,
      blocos: {},
    });
  });

  it('gerarPropostaDescricao (motor) devolve o mesmo corpo que o handler (melhorar)', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()], loja_blocos: [] }).client as never);
    vi.stubGlobal('fetch', fetchDescricao('MLB-DSC-4', ['Texto final da descricao.\n\nSegundo paragrafo.']));

    const item = {
      id: 'MLB-DSC-4',
      title: 'Fone XYZ',
      category_id: CAT_DESC,
      site_id: 'MLB',
      seller_id: 2490900,
      attributes: [{ id: 'BRAND', name: 'Marca', value_id: '456', value_name: 'XYZ' }],
      pictures: [{ id: 'p1' }, { id: 'p2' }],
    };

    const r = await gerarPropostaDescricao({
      itemId: 'MLB-DSC-4',
      item: item as never,
      donaSellerId: '2490900',
      loja: 'Ponto Musical',
      body: {},
      carregarBlocos: async () => ({}),
    });

    expect(r.status).toBe(200);
    expect(r.corpo).toEqual({
      sugestao: 'Texto final da descricao.\n\nSegundo paragrafo.',
      atual: 'descricao atual do anuncio',
      usouBlocos: false,
      blocos: {},
    });
  });
});

/* ------------------------------------------------------------------ *
 * Fila de lote — coluna `tipo` (plano 025)
 * ------------------------------------------------------------------ */

describe('fila de lote — tipo de operação', () => {
  it('criarLote grava o `tipo` pedido em `lotes`', async () => {
    const { client, writes } = makeFakeSupabase({ lotes: [], lote_itens: [] });
    injetarCliente(() => client as never);

    await criarLote({ sellerId: '2490900', itemIds: ['MLB1', 'MLB2'], tipo: 'titulo' });

    const insLote = writes.find((w) => w.table === 'lotes' && w.kind === 'insert');
    expect((insLote!.payload as Record<string, unknown>).tipo).toBe('titulo');
  });

  it('criarLote sem `tipo` cai em "diagnostico" (compatível com o plano 024)', async () => {
    const { client, writes } = makeFakeSupabase({ lotes: [], lote_itens: [] });
    injetarCliente(() => client as never);

    await criarLote({ sellerId: '2490900', itemIds: ['MLB1'] });

    const insLote = writes.find((w) => w.table === 'lotes' && w.kind === 'insert');
    expect((insLote!.payload as Record<string, unknown>).tipo).toBe('diagnostico');
  });

  it('buscarLote devolve o `tipo`; lote antigo sem a coluna cai em "diagnostico"', async () => {
    const { client } = makeFakeSupabase({
      lotes: [
        { id: 'L1', seller_id: '2490900', total_itens: 1, status: 'em_andamento', tipo: 'descricao' },
        { id: 'L2', seller_id: '2490900', total_itens: 1, status: 'em_andamento' },
      ],
      lote_itens: [
        { lote_id: 'L1', status: 'pendente' },
        { lote_id: 'L2', status: 'pendente' },
      ],
    });
    injetarCliente(() => client as never);

    expect((await buscarLote('L1'))?.tipo).toBe('descricao');
    expect((await buscarLote('L2'))?.tipo).toBe('diagnostico');
  });

  it('POST /api/lote aceita `tipo` válido e rejeita inválido', async () => {
    const { client } = makeFakeSupabase({ lotes: [], lote_itens: [] });
    injetarCliente(() => client as never);

    const ok = await loteCriarPOST(
      new Request('http://local/api/lote', {
        method: 'POST',
        body: JSON.stringify({ seller_id: '2490900', item_ids: ['MLB1'], tipo: 'descricao' }),
      }),
    );
    expect(ok.status).toBe(201);

    const ruim = await loteCriarPOST(
      new Request('http://local/api/lote', {
        method: 'POST',
        body: JSON.stringify({ seller_id: '2490900', item_ids: ['MLB1'], tipo: 'preco' }),
      }),
    );
    expect(ruim.status).toBe(400);
  });
});

/* ------------------------------------------------------------------ *
 * Worker do lote — despacho por `tipo` (plano 025)
 * ------------------------------------------------------------------ */

describe('worker /api/lote/[id]/processar — despacho por tipo', () => {
  it('tipo "titulo": gera a proposta e grava em lote_itens.resultado (não toca no ML)', async () => {
    const { client, writes } = makeFakeSupabase({
      contas: [conta()],
      lotes: [{ id: 'LT', seller_id: '2490900', total_itens: 1, status: 'em_andamento', tipo: 'titulo' }],
      lote_itens: [{ id: 1, lote_id: 'LT', item_id: 'MLB-W1', status: 'pendente', tentativas: 0 }],
    });
    injetarCliente(() => client as never);
    vi.stubGlobal('fetch', fetchTitulo('MLB-W1'));

    const res = await loteProcessarPOST(new Request('http://local', { method: 'POST' }), params('LT'));
    const atual = await res.json();

    const upItem = writes.find((w) => w.table === 'lote_itens' && w.kind === 'update' && (w.payload as Record<string, unknown>).status === 'concluido');
    expect(upItem).toBeDefined();
    expect((upItem!.payload as Record<string, unknown>).resultado).toEqual(CORPO_TITULO_ESPERADO);

    // Nenhuma escrita na API do ML: toda chamada a mercadolibre.com é GET.
    const calls = (fetch as unknown as { mock: { calls: [string, RequestInit?][] } }).mock.calls;
    const escritasNoMl = calls.filter(
      ([u, init]) => String(u).includes('mercadolibre.com') && (init?.method ?? 'GET') !== 'GET',
    );
    expect(escritasNoMl).toHaveLength(0);

    expect(atual.tipo).toBe('titulo');
    expect(atual.status).toBe('concluido');
    expect(atual.contagens.concluido).toBe(1);
  });

  it('tipo "diagnostico": segue igual ao plano 024 (carregarDiagnostico → concluido)', async () => {
    const { client, writes } = makeFakeSupabase({
      contas: [conta()],
      lotes: [{ id: 'LD', seller_id: '2490900', total_itens: 1, status: 'em_andamento', tipo: 'diagnostico' }],
      lote_itens: [{ id: 1, lote_id: 'LD', item_id: 'MLB-W2', status: 'pendente', tentativas: 0 }],
    });
    injetarCliente(() => client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes('/items/MLB-W2') && !u.includes('/items/MLB-W2/')) {
          return responseBody({ id: 'MLB-W2', title: 'X', category_id: 'MLB1', seller_id: 2490900 });
        }
        // Todo o resto do diagnóstico pode falhar: cada bloco é isolado.
        return responseBody({ message: 'sem dados' }, 404);
      }),
    );

    const res = await loteProcessarPOST(new Request('http://local', { method: 'POST' }), params('LD'));
    const atual = await res.json();

    const upItem = writes.find((w) => w.table === 'lote_itens' && w.kind === 'update' && (w.payload as Record<string, unknown>).status === 'concluido');
    expect(upItem).toBeDefined();
    expect((upItem!.payload as Record<string, unknown>).resultado).toBeTruthy();
    expect(atual.status).toBe('concluido');
  });
});
