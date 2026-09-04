import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lerBuscaEan } from '../src/lib/ia';
import { POST as buscarEanPOST } from '../src/app/api/anuncios/buscar-ean/route';

/** Busca de EAN/GTIN na web (IA) — complemento do plano 029. NÃO fala com o ML. */

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
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.WEB_SEARCH_API_KEY;
  delete process.env.WEB_SEARCH_PROVIDER;
});

describe('lerBuscaEan', () => {
  it('parseia o EAN e tolera cercas de código', () => {
    expect(lerBuscaEan('```json\n{"ean":"4549763352750","fonte_texto":"EAN: 4549763352750"}\n```')).toEqual({
      ean: '4549763352750',
      fonteTexto: 'EAN: 4549763352750',
    });
  });
  it('ean:null vira null, não string vazia', () => {
    expect(lerBuscaEan('{"ean":null}')).toEqual({ ean: null, fonteTexto: '' });
  });
  it('lixo sem JSON não quebra', () => {
    expect(lerBuscaEan('desculpe, não encontrei nada')).toEqual({ ean: null, fonteTexto: '' });
  });
  it('só dígitos — descarta formatação que a IA tenha colado junto', () => {
    expect(lerBuscaEan('{"ean":"454-9763-352750"}').ean).toBe('4549763352750');
  });
});

describe('POST /api/anuncios/buscar-ean', () => {
  function stub(anthropicText: string) {
    return vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('api.tavily.com/search')) {
        return rb({
          results: [{ url: 'https://ibanez.com/kiko300', title: 'KIKO300', raw_content: 'EAN: 4549763352750' }],
        });
      }
      if (u.includes('api.anthropic.com')) return claude(anthropicText);
      throw new Error(`inesperado: ${u}`);
    });
  }

  it('devolve { ean, fontes } quando acha um código com checksum válido', async () => {
    process.env.WEB_SEARCH_API_KEY = 'tvly-test';
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.stubGlobal('fetch', stub('{"ean":"4549763352750","fonte_texto":"EAN: 4549763352750"}'));

    const res = await buscarEanPOST(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({ titulo: 'Guitarra Ibanez KIKO300 Made in Japan', marca: 'Ibanez', modelo: 'KIKO300' }),
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ean).toBe('4549763352750');
    expect(json.fontes).toEqual(['https://ibanez.com/kiko300']);
  });

  it('checksum errado: NÃO devolve o número, mesmo que a IA tenha achado um', async () => {
    process.env.WEB_SEARCH_API_KEY = 'tvly-test';
    process.env.ANTHROPIC_API_KEY = 'k';
    // 4549763308381 tem dígito verificador errado (deveria terminar em 2) — checksum pega
    // mesmo quando a IA "confia" no número.
    vi.stubGlobal('fetch', stub('{"ean":"4549763308381"}'));

    const res = await buscarEanPOST(
      new Request('http://local', { method: 'POST', body: JSON.stringify({ titulo: 'Guitarra X', marca: 'X', modelo: 'Y' }) }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ean).toBeNull();
    expect(json.aviso).toMatch(/dígito verificador/i);
  });

  it('ean:null (produto sem código, ex.: spot model) → aviso, sem quebrar', async () => {
    process.env.WEB_SEARCH_API_KEY = 'tvly-test';
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.stubGlobal('fetch', stub('{"ean":null}'));

    const res = await buscarEanPOST(
      new Request('http://local', { method: 'POST', body: JSON.stringify({ titulo: 'Guitarra RGV250 SV', marca: 'Ibanez', modelo: 'RGV250 SV' }) }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ean).toBeNull();
    expect(json.aviso).toBeTruthy();
  });

  it('sem WEB_SEARCH_API_KEY → 503', async () => {
    process.env.ANTHROPIC_API_KEY = 'k';
    vi.stubGlobal('fetch', vi.fn(async () => rb({})));
    const res = await buscarEanPOST(
      new Request('http://local', { method: 'POST', body: JSON.stringify({ titulo: 'Guitarra Ibanez KIKO300' }) }),
    );
    expect(res.status).toBe(503);
  });

  it('título curto e sem marca+modelo → 400, não chama nada', async () => {
    const fetchMock = vi.fn(async () => rb({}));
    vi.stubGlobal('fetch', fetchMock);
    const res = await buscarEanPOST(new Request('http://local', { method: 'POST', body: JSON.stringify({ titulo: 'ab' }) }));
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nada encontrado na web → aviso, sem chamar a IA', async () => {
    process.env.WEB_SEARCH_API_KEY = 'tvly-test';
    process.env.ANTHROPIC_API_KEY = 'k';
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('api.tavily.com/search')) return rb({ results: [] });
      throw new Error('não deveria chamar a IA sem páginas');
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await buscarEanPOST(
      new Request('http://local', { method: 'POST', body: JSON.stringify({ titulo: 'Guitarra Ibanez KIKO300' }) }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.ean).toBeNull();
    expect(json.aviso).toMatch(/nada encontrado/i);
  });
});
