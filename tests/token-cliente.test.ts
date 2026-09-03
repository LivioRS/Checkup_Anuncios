import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { mlFetch, comContaCliente, comConta } from '../src/lib/ml/client';

/**
 * Plano 028 (f3c2) — espelho de `token-flow.test.ts` para o universo do PORTAL
 * (`contas_ml_clientes`). Mesmos comportamentos do §1: refresh de uso único, dedup de refresh
 * concorrente, 1 retry em 401 — só que com as credenciais do app do portal e gravando na linha
 * de `contas_ml_clientes`. O caminho dos robôs (`token-flow.test.ts`) roda junto no `npm test` e
 * tem de continuar 100% verde.
 */

const HORA = 60 * 60 * 1000;

function conexao(over: Partial<{ access_expira_em: string | null; seller_id: string; cliente_id: number }> = {}) {
  return {
    id: 1,
    cliente_id: 7,
    seller_id: 'S1',
    apelido: 'LOJA_CLIENTE',
    access_token: 'tok-velho',
    refresh_token: 'refresh-A',
    access_expira_em: new Date(Date.now() + 6 * HORA).toISOString(),
    conectado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    ...over,
  };
}

function responseBody(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
}

const TOKEN_NOVO = {
  access_token: 'tok-novo',
  token_type: 'Bearer',
  expires_in: 21600,
  scope: 'read',
  user_id: 999,
  refresh_token: 'refresh-B',
};

beforeEach(() => {
  process.env.ML_CLIENT_ID = 'robo-client';
  process.env.ML_CLIENT_SECRET = 'robo-secret';
  process.env.ML_CLIENT_ID_PORTAL = 'portal-client';
  process.env.ML_CLIENT_SECRET_PORTAL = 'portal-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  injetarCliente(null);
});

describe('fluxo de token do universo cliente (contas_ml_clientes)', () => {
  it('token válido: usa direto, sem /oauth/token e sem escrita', async () => {
    const { client, writes } = makeFakeSupabase({ contas_ml_clientes: [conexao()] });
    injetarCliente(() => client as never);

    const fetchMock = vi.fn(async (url: string) => {
      expect(String(url)).toContain('/items/MLB1');
      return responseBody({ id: 'MLB1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await comContaCliente(7, 'S1', () => mlFetch<{ id: string }>('/items/MLB1'));

    expect(r.id).toBe('MLB1');
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/oauth/token'))).toBe(false);
    expect(writes).toHaveLength(0);
  });

  it('token vencido: renova com credenciais do PORTAL e grava o par novo na mesma linha', async () => {
    const vencido = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { client, writes } = makeFakeSupabase({
      contas_ml_clientes: [conexao({ access_expira_em: vencido })],
    });
    injetarCliente(() => client as never);

    let corpoOAuth: URLSearchParams | null = null;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/oauth/token')) {
        corpoOAuth = new URLSearchParams(String(init?.body));
        return responseBody(TOKEN_NOVO);
      }
      expect((init?.headers as Record<string, string>)?.['Authorization']).toBe('Bearer tok-novo');
      return responseBody({ id: 'MLB1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await comContaCliente(7, 'S1', () => mlFetch<{ id: string }>('/items/MLB1'));
    expect(r.id).toBe('MLB1');

    // Credenciais do app do PORTAL, não as dos robôs.
    expect(corpoOAuth!.get('client_id')).toBe('portal-client');
    expect(corpoOAuth!.get('client_secret')).toBe('portal-secret');
    expect(corpoOAuth!.get('grant_type')).toBe('refresh_token');

    const upd = writes.find((w) => w.kind === 'update');
    expect(upd!.table).toBe('contas_ml_clientes');
    expect(upd!.filter).toEqual({ col: 'seller_id', val: 'S1' });
    const payload = upd!.payload as Record<string, string>;
    expect(payload.access_token).toBe('tok-novo');
    expect(payload.refresh_token).toBe('refresh-B');
  });

  it('401 do ML: renova e re-tenta UMA vez', async () => {
    const { client, writes } = makeFakeSupabase({ contas_ml_clientes: [conexao()] });
    injetarCliente(() => client as never);

    let chamadasItem = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/oauth/token')) return responseBody(TOKEN_NOVO);
      chamadasItem += 1;
      if (chamadasItem === 1) return new Response(null, { status: 401 });
      expect((init?.headers as Record<string, string>)?.['Authorization']).toBe('Bearer tok-novo');
      return responseBody({ id: 'MLB1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const r = await comContaCliente(7, 'S1', () => mlFetch<{ id: string }>('/items/MLB1'));
    expect(r.id).toBe('MLB1');
    expect(chamadasItem).toBe(2);
    expect(writes.filter((w) => w.kind === 'update')).toHaveLength(1);
  });

  it('refresh concorrente: N chamadas com token vencido geram UMA renovação e UMA gravação', async () => {
    const vencido = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { client, writes } = makeFakeSupabase({
      contas_ml_clientes: [conexao({ access_expira_em: vencido })],
    });
    injetarCliente(() => client as never);

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/oauth/token')) return responseBody(TOKEN_NOVO);
      expect((init?.headers as Record<string, string>)?.['Authorization']).toBe('Bearer tok-novo');
      return responseBody({ id: 'MLB1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b, c] = await comContaCliente(7, 'S1', () =>
      Promise.all([
        mlFetch<{ id: string }>('/items/MLB1'),
        mlFetch<{ id: string }>('/items/MLB1'),
        mlFetch<{ id: string }>('/items/MLB1'),
      ]),
    );
    expect([a.id, b.id, c.id]).toEqual(['MLB1', 'MLB1', 'MLB1']);
    expect(fetchMock.mock.calls.filter(([u]) => String(u).includes('/oauth/token'))).toHaveLength(1);
    expect(writes.filter((w) => w.kind === 'update')).toHaveLength(1);
  });

  it('sem escopo de cliente, getAccount continua no universo dos robôs (não vaza)', async () => {
    // `contas` tem uma linha; `contas_ml_clientes` também. Sem `comContaCliente`, tem de ler `contas`.
    const { client } = makeFakeSupabase({
      contas: [
        {
          id: 1,
          seller_id: 'ROBO1',
          apelido: 'ROBO',
          org: null,
          access_token: 'tok-robo',
          refresh_token: 'r',
          access_expira_em: new Date(Date.now() + 6 * HORA).toISOString(),
        },
      ],
      contas_ml_clientes: [conexao()],
    });
    injetarCliente(() => client as never);

    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>)?.['Authorization']).toBe('Bearer tok-robo');
      return responseBody({ id: 'MLB1' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await comConta('ROBO1', () => mlFetch('/items/MLB1'));
    expect(fetchMock).toHaveBeenCalled();
  });
});
