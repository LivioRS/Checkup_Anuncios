import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assinarState,
  verificarState,
  buildAuthorizationUrl,
  exchangeCodeForToken,
} from '../src/lib/ml/oauth';

beforeEach(() => {
  process.env.PANEL_HMAC_SECRET = 'segredo-teste';
  process.env.ML_CLIENT_ID_PORTAL = 'portal-client';
  process.env.ML_CLIENT_SECRET_PORTAL = 'portal-secret';
  process.env.ML_REDIRECT_URI_PORTAL = 'https://portal.exemplo.com/api/oauth/ml/callback';
});

afterEach(() => {
  delete process.env.PANEL_HMAC_SECRET;
  delete process.env.PANEL_PASSWORD;
  delete process.env.ML_CLIENT_ID_PORTAL;
  delete process.env.ML_CLIENT_SECRET_PORTAL;
  delete process.env.ML_REDIRECT_URI_PORTAL;
  vi.unstubAllGlobals();
});

describe('state assinado do OAuth do portal', () => {
  it('roundtrip: assina e verifica, cliente_id bate; origem default é admin', async () => {
    const state = await assinarState(42);
    expect(await verificarState(state)).toEqual({ clienteId: 42, origem: 'admin' });
  });

  it('carrega a origem "portal" no roundtrip (plano 027, f3c1)', async () => {
    const state = await assinarState(7, 'portal');
    expect(await verificarState(state)).toEqual({ clienteId: 7, origem: 'portal' });
  });

  it('rejeita state adulterado (assinatura trocada)', async () => {
    const state = await assinarState(42, 'portal');
    const [clienteId, origem, exp] = state.split('.');
    const adulterado = `${clienteId}.${origem}.${exp}.${'0'.repeat(64)}`;
    expect(await verificarState(adulterado)).toBeNull();
  });

  it('rejeita se a origem for trocada depois de assinada (a HMAC cobre a origem)', async () => {
    const state = await assinarState(42, 'admin');
    const [clienteId, , exp, sig] = state.split('.');
    expect(await verificarState(`${clienteId}.portal.${exp}.${sig}`)).toBeNull();
  });

  it('rejeita state expirado', async () => {
    const agora = Date.now();
    const state = await assinarState(42, 'admin', agora - 60 * 60 * 1000); // assinado 1h atrás
    expect(await verificarState(state, agora)).toBeNull();
  });

  it('rejeita state malformado (inclusive o formato antigo de 3 partes)', async () => {
    expect(await verificarState('')).toBeNull();
    expect(await verificarState('sem-pontos')).toBeNull();
    expect(await verificarState('a.b')).toBeNull();
    expect(await verificarState('42.9999999999999.deadbeef')).toBeNull();
  });

  it('dois cliente_id diferentes geram states diferentes e não se cruzam', async () => {
    const a = await assinarState(1, 'portal');
    const b = await assinarState(2, 'admin');
    expect(await verificarState(a)).toEqual({ clienteId: 1, origem: 'portal' });
    expect(await verificarState(b)).toEqual({ clienteId: 2, origem: 'admin' });
  });
});

describe('buildAuthorizationUrl', () => {
  it('usa client_id/redirect_uri do PORTAL, nunca os dos robôs', async () => {
    process.env.ML_CLIENT_ID = 'robo-client';
    const state = await assinarState(1);
    const url = new URL(buildAuthorizationUrl(state));
    expect(url.origin).toBe('https://auth.mercadolivre.com.br');
    expect(url.pathname).toBe('/authorization');
    expect(url.searchParams.get('client_id')).toBe('portal-client');
    expect(url.searchParams.get('redirect_uri')).toBe('https://portal.exemplo.com/api/oauth/ml/callback');
    expect(url.searchParams.get('state')).toBe(state);
    delete process.env.ML_CLIENT_ID;
  });
});

describe('exchangeCodeForToken', () => {
  it('manda grant_type/redirect_uri/credenciais do portal certos no POST', async () => {
    let corpoEnviado: URLSearchParams | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.mercadolibre.com/oauth/token');
      corpoEnviado = new URLSearchParams(init?.body as string);
      return new Response(
        JSON.stringify({
          access_token: 'tok-novo',
          token_type: 'Bearer',
          expires_in: 21600,
          scope: 'read',
          user_id: 999888,
          refresh_token: 'refresh-novo',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const token = await exchangeCodeForToken('codigo-abc');

    expect(token.access_token).toBe('tok-novo');
    expect(token.user_id).toBe(999888);
    expect(corpoEnviado!.get('grant_type')).toBe('authorization_code');
    expect(corpoEnviado!.get('code')).toBe('codigo-abc');
    expect(corpoEnviado!.get('client_id')).toBe('portal-client');
    expect(corpoEnviado!.get('client_secret')).toBe('portal-secret');
    expect(corpoEnviado!.get('redirect_uri')).toBe('https://portal.exemplo.com/api/oauth/ml/callback');
  });

  it('lança erro claro quando o ML recusa o código', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'code inválido' }), {
        status: 400,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(exchangeCodeForToken('codigo-invalido')).rejects.toThrow(/invalid_grant/);
  });
});
