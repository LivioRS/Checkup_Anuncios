import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { lerEscolhaCategoria, lerRoteiroFotos, lerFichaDaFoto, temIA } from '../src/lib/ia';
import { GET as categoriaGET } from '../src/app/api/anuncios/categoria/route';
import { POST as iaPOST } from '../src/app/api/anuncios/ia/route';

/** Plano 030 — IA no anúncio fora do catálogo: descrição, escolha de categoria, roteiro de fotos. */

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

function claude(texto: string) {
  return responseBody({ content: [{ type: 'text', text: texto }] });
}

beforeEach(() => {
  process.env.ML_CLIENT_ID = 'c';
  process.env.ML_CLIENT_SECRET = 's';
});

afterEach(() => {
  vi.unstubAllGlobals();
  injetarCliente(null);
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
});

describe('lerEscolhaCategoria', () => {
  it('aceita id que está na lista de válidos', () => {
    const r = lerEscolhaCategoria('{"category_id":"MLB1","motivo":"é isso"}', ['MLB1', 'MLB2']);
    expect(r).toEqual({ category_id: 'MLB1', motivo: 'é isso' });
  });
  it('rejeita id fora da lista (anti-alucinação)', () => {
    expect(lerEscolhaCategoria('{"category_id":"MLB999","motivo":"x"}', ['MLB1', 'MLB2'])).toBeNull();
  });
  it('tolera cercas de código', () => {
    const r = lerEscolhaCategoria('```json\n{"category_id":"MLB2","motivo":""}\n```', ['MLB1', 'MLB2']);
    expect(r?.category_id).toBe('MLB2');
  });
});

describe('lerRoteiroFotos', () => {
  it('parseia a lista de fotos', () => {
    const r = lerRoteiroFotos('{"fotos":[{"titulo":"Capa","descricao":"fundo branco"},{"titulo":"Verso"}]}');
    expect(r).toEqual([
      { titulo: 'Capa', descricao: 'fundo branco' },
      { titulo: 'Verso', descricao: '' },
    ]);
  });
  it('vazio quando ilegível', () => {
    expect(lerRoteiroFotos('não é json')).toEqual([]);
  });
});

describe('GET /api/anuncios/categoria — escolha por IA', () => {
  function stubDomain(anthropicText: string | null) {
    return vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/domain_discovery/search')) {
        return responseBody([
          { category_id: 'MLB1743', category_name: 'Pedais', domain_name: 'Pedais de Efeito' },
          { category_id: 'MLB1748', category_name: 'Amplificadores', domain_name: 'Amplificadores' },
        ]);
      }
      if (u.includes('api.anthropic.com') && anthropicText !== null) return claude(anthropicText);
      throw new Error(`inesperado: ${u}`);
    });
  }

  it('com ANTHROPIC_API_KEY: devolve `escolha` apontando um id da lista', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal('fetch', stubDomain('{"category_id":"MLB1743","motivo":"é um pedal de efeito"}'));

    const res = await categoriaGET(new Request('http://local/api/anuncios/categoria?q=pedal+overdrive&seller_id=2490900'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sugestoes).toHaveLength(2);
    expect(json.escolha).toEqual({ category_id: 'MLB1743', motivo: 'é um pedal de efeito' });
  });

  it('sem ANTHROPIC_API_KEY: `escolha` é null e as sugestões continuam', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal('fetch', stubDomain(null));

    const res = await categoriaGET(new Request('http://local/api/anuncios/categoria?q=pedal+overdrive&seller_id=2490900'));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.escolha).toBeNull();
    expect(json.sugestoes).toHaveLength(2);
  });

  it('IA que devolve id inválido não vira escolha', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal('fetch', stubDomain('{"category_id":"MLB9999","motivo":"chutei"}'));

    const res = await categoriaGET(new Request('http://local/api/anuncios/categoria?q=x+y+z&seller_id=2490900'));
    const json = await res.json();
    expect(json.escolha).toBeNull();
  });
});

describe('POST /api/anuncios/ia', () => {
  it('acao "descricao": devolve { sugestao } limpa (sem HTML)', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => claude('<p>Descrição do produto</p>\n\nSegundo parágrafo.')));

    const res = await iaPOST(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({ acao: 'descricao', titulo: 'Pedal Overdrive XYZ', marca: 'XYZ', modelo: 'OD-1' }),
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.sugestao).toBe('Descrição do produto\n\nSegundo parágrafo.');
  });

  it('acao "roteiro-fotos": devolve { fotos }', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => claude('{"fotos":[{"titulo":"Capa","descricao":"fundo branco"}]}')),
    );

    const res = await iaPOST(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({ acao: 'roteiro-fotos', titulo: 'Pedal Overdrive XYZ' }),
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.fotos).toEqual([{ titulo: 'Capa', descricao: 'fundo branco' }]);
  });

  it('acao inválida e título curto → 400 sem chamar a IA', async () => {
    const fetchMock = vi.fn(async () => claude('x'));
    vi.stubGlobal('fetch', fetchMock);

    const r1 = await iaPOST(new Request('http://local', { method: 'POST', body: JSON.stringify({ acao: 'nada', titulo: 'Produto XYZ' }) }));
    const r2 = await iaPOST(new Request('http://local', { method: 'POST', body: JSON.stringify({ acao: 'descricao', titulo: 'ab' }) }));
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem nenhuma chave de IA → 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => claude('x')));
    const res = await iaPOST(
      new Request('http://local', { method: 'POST', body: JSON.stringify({ acao: 'descricao', titulo: 'Pedal Overdrive XYZ' }) }),
    );
    expect(res.status).toBe(503);
  });
});

describe('provedor de IA — OpenRouter', () => {
  it('temIA() é true só com OPENROUTER_API_KEY', () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    expect(temIA()).toBe(true);
  });

  it('acao "descricao" via OpenRouter: usa o endpoint e o formato OpenAI-compatível', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    process.env.OPENROUTER_MODEL = 'anthropic/claude-3.5-sonnet';

    let alvo: { url: string; auth?: string; body: Record<string, unknown> } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        alvo = {
          url: String(url),
          auth: (init?.headers as Record<string, string>)?.Authorization,
          body: JSON.parse(String(init?.body)),
        };
        return responseBody({ choices: [{ message: { content: 'Descrição gerada pela OpenRouter.' } }] });
      }),
    );

    const res = await iaPOST(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({ acao: 'descricao', titulo: 'Pedal Overdrive XYZ', marca: 'XYZ' }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.sugestao).toBe('Descrição gerada pela OpenRouter.');
    expect(alvo!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(alvo!.auth).toBe('Bearer sk-or-test');
    expect(alvo!.body.model).toBe('anthropic/claude-3.5-sonnet');
    expect(alvo!.body.messages).toEqual([{ role: 'user', content: expect.any(String) }]);
  });

  it('OpenRouter tem precedência quando as duas chaves estão setadas', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    process.env.OPENROUTER_MODEL = 'test/model';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain('openrouter.ai');
      return responseBody({ choices: [{ message: { content: 'ok' } }] });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await iaPOST(
      new Request('http://local', { method: 'POST', body: JSON.stringify({ acao: 'descricao', titulo: 'Pedal Overdrive XYZ' }) }),
    );
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.every(([u]) => !String(u).includes('api.anthropic.com'))).toBe(true);
  });
});

describe('lerFichaDaFoto', () => {
  it('parseia titulo_sugerido + atributos, tolera cercas', () => {
    const r = lerFichaDaFoto('```json\n{"titulo_sugerido":"Pedal OD-1","atributos":[{"nome":"Voltagem","valor":"9V"},{"nome":"Peso"}]}\n```');
    expect(r.tituloSugerido).toBe('Pedal OD-1');
    expect(r.atributos).toEqual([
      { nome: 'Voltagem', valor: '9V' },
      { nome: 'Peso', valor: '' },
    ]);
  });
  it('vazio quando ilegível', () => {
    expect(lerFichaDaFoto('sem json')).toEqual({ tituloSugerido: '', atributos: [] });
  });
});

describe('POST /api/anuncios/ia — acao "ficha-da-foto"', () => {
  it('manda a imagem no formato OpenRouter e devolve { atributos, titulo_sugerido }', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    process.env.OPENROUTER_MODEL = 'test/model';
    let corpo: Record<string, unknown> | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        expect(String(url)).toContain('openrouter.ai');
        corpo = JSON.parse(String(init?.body));
        return responseBody({
          choices: [{ message: { content: '{"titulo_sugerido":"Pedal","atributos":[{"nome":"Voltagem","valor":"9V"}]}' } }],
        });
      }),
    );

    const res = await iaPOST(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({ acao: 'ficha-da-foto', foto_url: 'https://x/etiqueta.jpg' }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ titulo_sugerido: 'Pedal', atributos: [{ nome: 'Voltagem', valor: '9V' }] });
    const content = (corpo!.messages as { content: unknown }[])[0].content as { type: string }[];
    expect(content.map((c) => c.type)).toEqual(['text', 'image_url']);
  });

  it('foto_url ausente ou não-http → 400 sem chamar a IA', async () => {
    process.env.OPENROUTER_API_KEY = 'sk-or-test';
    const fetchMock = vi.fn(async () => responseBody({}));
    vi.stubGlobal('fetch', fetchMock);

    const r1 = await iaPOST(new Request('http://local', { method: 'POST', body: JSON.stringify({ acao: 'ficha-da-foto' }) }));
    const r2 = await iaPOST(new Request('http://local', { method: 'POST', body: JSON.stringify({ acao: 'ficha-da-foto', foto_url: 'ftp://x/y.jpg' }) }));
    expect(r1.status).toBe(400);
    expect(r2.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem chave de IA → 503', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => responseBody({})));
    const res = await iaPOST(
      new Request('http://local', { method: 'POST', body: JSON.stringify({ acao: 'ficha-da-foto', foto_url: 'https://x/y.jpg' }) }),
    );
    expect(res.status).toBe(503);
  });
});
