import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { GET as listarPendentes } from '../src/app/api/anuncios/pendentes/route';
import { POST as ativar } from '../src/app/api/anuncios/pendentes/[id]/ativar/route';
import { POST as encerrar } from '../src/app/api/anuncios/pendentes/[id]/encerrar/route';

/** Tela "Pendentes" — lista anúncios pausados de todas as contas; ativar é sempre clique do usuário. */

const HORA = 60 * 60 * 1000;

function conta(over: Record<string, unknown> = {}) {
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
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  process.env.ML_CLIENT_ID = 'test-client';
  process.env.ML_CLIENT_SECRET = 'test-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  injetarCliente(null);
  delete process.env.ML_SELLER_ID_PADRAO;
});

describe('GET /api/anuncios/pendentes', () => {
  it('lista os pausados de cada conta cadastrada', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes('/items/search') && u.includes('status=paused')) {
          return responseBody({ paging: { limit: 50, offset: 0, total: 2 }, results: ['MLB1', 'MLB2'] });
        }
        if (u.includes('/items?') && u.includes('ids=MLB1') && u.includes('MLB2')) {
          return responseBody([
            { code: 200, body: { id: 'MLB1', title: 'Guitarra A', status: 'paused', permalink: 'https://x/MLB1' } },
            { code: 200, body: { id: 'MLB2', title: 'Guitarra B', status: 'paused', permalink: 'https://x/MLB2' } },
          ]);
        }
        throw new Error(`inesperado: ${u}`);
      }),
    );

    const res = await listarPendentes();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.contas).toHaveLength(1);
    expect(json.contas[0].seller_id).toBe('2490900');
    expect(json.contas[0].itens).toEqual([
      { id: 'MLB1', titulo: 'Guitarra A', status: 'paused', permalink: 'https://x/MLB1' },
      { id: 'MLB2', titulo: 'Guitarra B', status: 'paused', permalink: 'https://x/MLB2' },
    ]);
  });

  it('sem nada pausado, devolve lista vazia sem quebrar', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (String(url).includes('/items/search')) {
          return responseBody({ paging: { limit: 50, offset: 0, total: 0 }, results: [] });
        }
        throw new Error('inesperado');
      }),
    );

    const res = await listarPendentes();
    const json = await res.json();
    expect(json.contas[0].itens).toEqual([]);
  });

  it('conta cujo ML falha não derruba as demais — vem com erro isolado', async () => {
    injetarCliente(
      () => makeFakeSupabase({ contas: [conta(), conta({ id: 2, seller_id: '111', apelido: 'OUTRA' })] }).client as never,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        const u = String(url);
        if (u.includes('/users/111/items/search')) {
          return new Response(JSON.stringify({ message: 'invalid_token' }), { status: 401 });
        }
        if (u.includes('/items/search')) {
          return responseBody({ paging: { limit: 50, offset: 0, total: 0 }, results: [] });
        }
        throw new Error(`inesperado: ${u}`);
      }),
    );

    const res = await listarPendentes();
    const json = await res.json();
    expect(res.status).toBe(200);
    const outra = json.contas.find((c: { seller_id: string }) => c.seller_id === '111');
    expect(outra.erro).toBeTruthy();
    expect(outra.itens).toEqual([]);
    const shinnishi = json.contas.find((c: { seller_id: string }) => c.seller_id === '2490900');
    expect(shinnishi.erro).toBeNull();
  });
});

describe('POST /api/anuncios/pendentes/[id]/ativar', () => {
  it('ativa (PUT status=active) e registra a escrita', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [conta()] });
    injetarCliente(() => client as never);
    let putBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/items/MLB1') && (!init || init.method === undefined)) {
          return responseBody({ id: 'MLB1', seller_id: 2490900, status: 'paused' });
        }
        if (u.endsWith('/items/MLB1') && init?.method === 'PUT') {
          putBody = JSON.parse(String(init.body));
          return responseBody({ id: 'MLB1', status: 'active' });
        }
        throw new Error(`inesperado: ${u} ${init?.method}`);
      }),
    );

    const res = await ativar(new Request('http://local', { method: 'POST' }), {
      params: Promise.resolve({ id: 'MLB1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, status: 'active' });
    expect(putBody).toEqual({ status: 'active' });

    const log = writes.find((w) => w.table === 'ficha_edits' && w.kind === 'insert');
    expect(log).toBeTruthy();
  });

  it('anúncio de conta não cadastrada: 403, não ativa', async () => {
    // Uma conta cadastrada CONSEGUE ler o item (não dá 401), mas o seller_id do item não
    // bate com nenhuma linha de `contas` — é aí que garantirDono recusa com 403.
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responseBody({ id: 'MLB9', seller_id: 999999, status: 'paused' })),
    );

    const res = await ativar(new Request('http://local', { method: 'POST' }), {
      params: Promise.resolve({ id: 'MLB9' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/anuncios/pendentes/[id]/encerrar', () => {
  it('encerra (PUT status=closed) e registra a escrita — não é DELETE', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [conta()] });
    injetarCliente(() => client as never);
    let putBody: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/items/MLB5') && (!init || init.method === undefined)) {
          return responseBody({ id: 'MLB5', seller_id: 2490900, status: 'paused' });
        }
        if (u.endsWith('/items/MLB5') && init?.method === 'PUT') {
          putBody = JSON.parse(String(init.body));
          return responseBody({ id: 'MLB5', status: 'closed' });
        }
        throw new Error(`inesperado: ${u} ${init?.method}`);
      }),
    );

    const res = await encerrar(new Request('http://local', { method: 'POST' }), {
      params: Promise.resolve({ id: 'MLB5' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, status: 'closed' });
    expect(putBody).toEqual({ status: 'closed' });

    const log = writes.find((w) => w.table === 'ficha_edits' && w.kind === 'insert');
    expect(log).toBeTruthy();
    expect((log!.payload as Record<string, unknown>).payload).toEqual({ status: 'closed' });
  });

  it('anúncio de conta não cadastrada: 403, não encerra', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responseBody({ id: 'MLB6', seller_id: 999999, status: 'paused' })),
    );

    const res = await encerrar(new Request('http://local', { method: 'POST' }), {
      params: Promise.resolve({ id: 'MLB6' }),
    });
    expect(res.status).toBe(403);
  });

  it('propaga a recusa do ML com o corpo cru', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.endsWith('/items/MLB7') && (!init || init.method === undefined)) {
          return responseBody({ id: 'MLB7', seller_id: 2490900, status: 'paused' });
        }
        if (u.endsWith('/items/MLB7') && init?.method === 'PUT') {
          return new Response(JSON.stringify({ message: 'has active questions' }), { status: 400 });
        }
        throw new Error('inesperado');
      }),
    );

    const res = await encerrar(new Request('http://local', { method: 'POST' }), {
      params: Promise.resolve({ id: 'MLB7' }),
    });
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.body.message).toBe('has active questions');
  });
});
