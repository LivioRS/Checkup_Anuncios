import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { mlFetch, MlError } from '../src/lib/ml/client';

const HORA = 60 * 60 * 1000;

function conta(over: Partial<{ access_expira_em: string | null; seller_id: string; refresh_token: string }>) {
  return {
    id: 1,
    seller_id: '123',
    apelido: 'A',
    org: null,
    access_token: 'tok-velho',
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

beforeEach(() => {
  process.env.ML_CLIENT_ID = 'test-client';
  process.env.ML_CLIENT_SECRET = 'test-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  injetarCliente(null);
  vi.useRealTimers();
});

describe('fluxo de token do mlFetch', () => {
  it('usa o token sem refresh quando ainda não expira em 10 min', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [conta({})] });
    injetarCliente(() => client as never);

    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain('/items/MLB1');
      return responseBody({ id: 'MLB1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await mlFetch<any>('/items/MLB1');

    expect(r.id).toBe('MLB1');
    // Nenhuma chamada ao OAuth nem escrita de tokens.
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/oauth/token'))).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('refresca quando o token expira em menos de 10 min; grava o par novo na mesma linha e usa o novo token', async () => {
    const expiraEmBreve = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // já venceu
    const { client, writes } = makeFakeSupabase({ contas: [conta({ access_expira_em: expiraEmBreve })] });
    injetarCliente(() => client as never);

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/oauth/token')) {
        return responseBody({
          access_token: 'tok-novo',
          token_type: 'Bearer',
          expires_in: 21600,
          scope: 'read',
          user_id: 123,
          refresh_token: 'refresh-B',
        });
      }
      const auth = (init?.headers as Record<string, string>)?.['Authorization'];
      expect(auth).toBe('Bearer tok-novo');
      return responseBody({ id: 'MLB1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await mlFetch<any>('/items/MLB1');

    expect(r.id).toBe('MLB1');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/oauth/token'))).toHaveLength(1);

    // saveTokens gravou o par novo na MESMA linha (seller_id 123).
    const upd = writes.find((w) => w.kind === 'update');
    expect(upd).toBeDefined();
    expect(upd!.filter).toEqual({ col: 'seller_id', val: '123' });
    const payload = upd!.payload as Record<string, string>;
    expect(payload.access_token).toBe('tok-novo');
    expect(payload.refresh_token).toBe('refresh-B');
    expect(payload.access_expira_em).toBeDefined();
  });

  it('refresca e re-tenta UMA vez quando o servidor responde 401, mesmo com token válido', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [conta({})] }); // token válido (futuro)
    injetarCliente(() => client as never);

    let chamadasItems = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/oauth/token')) {
        return responseBody({
          access_token: 'tok-a-pois-401',
          token_type: 'Bearer',
          expires_in: 21600,
          scope: 'read',
          user_id: 123,
          refresh_token: 'refresh-C',
        });
      }
      chamadasItems += 1;
      if (chamadasItems === 1) return new Response(null, { status: 401 });
      const auth = (init?.headers as Record<string, string>)?.['Authorization'];
      expect(auth).toBe('Bearer tok-a-pois-401');
      return responseBody({ id: 'MLB1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await mlFetch<any>('/items/MLB1');

    expect(r.id).toBe('MLB1');
    expect(chamadasItems).toBe(2);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/oauth/token'))).toHaveLength(1);
    expect(writes.some((w) => w.kind === 'update')).toBe(true);
  });

  it('lança MlError com status quando a re-tentativa também falha', async () => {
    const { client } = makeFakeSupabase({ contas: [conta({})] });
    injetarCliente(() => client as never);

    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/oauth/token')) {
        return responseBody({
          access_token: 't',
          token_type: 'Bearer',
          expires_in: 21600,
          scope: 'read',
          user_id: 123,
          refresh_token: 'r',
        });
      }
      return new Response('{"mensagem":"nope"}', { status: 400 });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(mlFetch('/items/MLB1')).rejects.toBeInstanceOf(MlError);
    await expect(mlFetch('/items/MLB1')).rejects.toMatchObject({ status: 400 });
  });

  it('refresh concorrente: N chamadas com token expirado geram UMA renovação', async () => {
    const expiraEmBreve = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // vencido
    const { client, writes } = makeFakeSupabase({ contas: [conta({ access_expira_em: expiraEmBreve })] });
    injetarCliente(() => client as never);

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/oauth/token')) {
        return responseBody({
          access_token: 'tok-unicoparalelo',
          token_type: 'Bearer',
          expires_in: 21600,
          scope: 'read',
          user_id: 123,
          refresh_token: 'refresh-PARALELO',
        });
      }
      // Todas as chamadas reais ao ML devem usar o token novo.
      const auth = (init?.headers as Record<string, string>)?.['Authorization'];
      expect(auth).toBe('Bearer tok-unicoparalelo');
      return responseBody({ id: 'MLB1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [r1, r2, r3] = await Promise.all([
      mlFetch<any>('/items/MLB1'),
      mlFetch<any>('/items/MLB1'),
      mlFetch<any>('/items/MLB1'),
    ]);

    expect(r1.id).toBe('MLB1');
    expect(r2.id).toBe('MLB1');
    expect(r3.id).toBe('MLB1');
    // Só UMA renovação de token (1 chamada OAuth) e UMA gravação do par novo.
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/oauth/token'))).toHaveLength(1);
    expect(writes.filter((w) => w.kind === 'update')).toHaveLength(1);
  });
});