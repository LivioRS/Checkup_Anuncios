import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { lerMarcaModelo, lerFichaDaWeb } from '../src/lib/ia';
import { POST as rascunhoPOST } from '../src/app/api/anuncios/rascunho/route';
import { POST as fichaWebPOST } from '../src/app/api/anuncios/ficha-web/route';

/** Plano 033 — "Preencher com IA" (rascunho) + ficha do site da marca (web). */

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

function rb(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
}
function claude(texto: string) {
  return rb({ content: [{ type: 'text', text: texto }] });
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
  delete process.env.WEB_SEARCH_API_KEY;
  delete process.env.WEB_SEARCH_PROVIDER;
});

describe('lerMarcaModelo / lerFichaDaWeb', () => {
  it('lerMarcaModelo parseia e tolera cercas', () => {
    expect(lerMarcaModelo('```json\n{"marca":"Ibanez","modelo":"KIKO300"}\n```')).toEqual({
      marca: 'Ibanez',
      modelo: 'KIKO300',
    });
    expect(lerMarcaModelo('lixo')).toEqual({ marca: '', modelo: '' });
  });
  it('lerFichaDaWeb respeita modelo_confere:false', () => {
    expect(lerFichaDaWeb('{"modelo_confere":false,"atributos":[{"nome":"x","valor":"y"}]}')).toEqual({
      modeloConfere: false,
      atributos: [{ nome: 'x', valor: 'y' }],
    });
  });
});

describe('POST /api/anuncios/ficha-web', () => {
  function stub(anthropicText: string) {
    return vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('api.tavily.com/search')) {
        return rb({
          results: [
            { url: 'https://ibanez.com/kiko300', title: 'KIKO300', raw_content: 'Escala 648mm. Captadores DiMarzio. Made in Japan.' },
          ],
        });
      }
      if (u.includes('api.anthropic.com')) return claude(anthropicText);
      throw new Error(`inesperado: ${u}`);
    });
  }

  it('devolve { atributos, fontes } quando o modelo confere', async () => {
    process.env.WEB_SEARCH_API_KEY = 'tvly-test';
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.stubGlobal('fetch', stub('{"modelo_confere":true,"atributos":[{"nome":"Escala","valor":"648mm"}]}'));

    const res = await fichaWebPOST(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({ titulo: 'Guitarra Ibanez KIKO300 Made in Japan', marca: 'Ibanez', modelo: 'KIKO300' }),
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.atributos).toEqual([{ nome: 'Escala', valor: '648mm' }]);
    expect(json.fontes).toEqual(['https://ibanez.com/kiko300']);
  });

  it('modelo_confere:false → atributos vazio + aviso', async () => {
    process.env.WEB_SEARCH_API_KEY = 'tvly-test';
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.stubGlobal('fetch', stub('{"modelo_confere":false,"atributos":[]}'));

    const res = await fichaWebPOST(
      new Request('http://local', { method: 'POST', body: JSON.stringify({ titulo: 'Guitarra Ibanez KIKO300' }) }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.atributos).toEqual([]);
    expect(json.aviso).toMatch(/outro modelo/i);
  });

  it('sem WEB_SEARCH_API_KEY → 503', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => rb({})));
    const res = await fichaWebPOST(
      new Request('http://local', { method: 'POST', body: JSON.stringify({ titulo: 'Guitarra Ibanez KIKO300' }) }),
    );
    expect(res.status).toBe(503);
  });

  it('título curto e sem marca+modelo → 400', async () => {
    const fetchMock = vi.fn(async () => rb({}));
    vi.stubGlobal('fetch', fetchMock);
    const res = await fichaWebPOST(new Request('http://local', { method: 'POST', body: JSON.stringify({ titulo: 'ab' }) }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/anuncios/rascunho', () => {
  it('monta o rascunho: categoria + marca/modelo + ficha por GTIN + descrição', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    process.env.ANTHROPIC_API_KEY = 'k';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/domain_discovery/search')) {
          return rb([
            { category_id: 'MLB1743', category_name: 'Guitarras', domain_name: 'Guitarras' },
            { category_id: 'MLB1748', category_name: 'Amplificadores', domain_name: 'Amps' },
          ]);
        }
        if (u.includes('/products/search')) {
          return rb({ results: [{ id: 'MLB9', attributes: [{ id: 'STRINGS', name: 'Cordas', value_name: '6' }] }] });
        }
        if (u.includes('api.anthropic.com')) {
          // Roteia pela intenção do prompt (as 3 chamadas rodam em paralelo, ordem não é fixa).
          const prompt = JSON.parse(String(init?.body)).messages[0].content as string;
          if (/MARCA e o MODELO/i.test(prompt)) return claude('{"marca":"Ibanez","modelo":"KIKO300"}');
          if (/classifica produtos em categorias/i.test(prompt)) return claude('{"category_id":"MLB1743","motivo":"guitarra"}');
          return claude('Descrição gerada.');
        }
        throw new Error(`inesperado: ${u}`);
      }),
    );

    const res = await rascunhoPOST(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({
          seller_id: '2490900',
          titulo: 'Guitarra Ibanez KIKO300 Made in Japan',
          gtin: '7891234567890',
        }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.category_id).toBe('MLB1743');
    expect(json.marca).toBe('Ibanez');
    expect(json.modelo).toBe('KIKO300');
    expect(json.atributos).toEqual([{ nome: 'Cordas', valor: '6' }]);
    expect(json.descricao).toBe('Descrição gerada.');
  });

  it('peça que falha volta vazia sem derrubar o resto', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes('/domain_discovery/search')) return new Response(null, { status: 500 }); // categoria falha
        if (u.includes('/products/search')) return rb({ results: [] }); // sem ficha
        if (u.includes('api.anthropic.com')) return claude('{"marca":"Ibanez","modelo":"KIKO300"}');
        throw new Error(`inesperado: ${u}`);
      }),
    );

    const res = await rascunhoPOST(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({ seller_id: '2490900', titulo: 'Guitarra Ibanez KIKO300 Made in Japan', gtin: '7891234567890' }),
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.category_id).toBe('');
    expect(json.atributos).toEqual([]);
    expect(json.marca).toBe('Ibanez');
  });

  it('título com menos de 10 chars → 400', async () => {
    const fetchMock = vi.fn(async () => rb({}));
    vi.stubGlobal('fetch', fetchMock);
    const res = await rascunhoPOST(new Request('http://local', { method: 'POST', body: JSON.stringify({ titulo: 'curto' }) }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
