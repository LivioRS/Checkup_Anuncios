import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { injetarResolvedorDeSessao } from '../src/lib/portal/contaAtiva';
import { POST as loteCriarPortal } from '../src/app/api/portal/lote/route';
import { GET as loteGetPortal } from '../src/app/api/portal/lote/[id]/route';
import { POST as loteProcessarPortal } from '../src/app/api/portal/lote/[id]/processar/route';
import { POST as loteReenfileirarPortal } from '../src/app/api/portal/lote/[id]/reenfileirar/route';

/**
 * Plano 035 (f3c3) — lote no portal. STOP conditions travadas aqui: sem sessão → 401; lote de
 * OUTRO cliente (ou dos robôs) → 404, sem processar nada; o worker roda em `comContaCliente`
 * (token do CLIENTE), nunca `comConta`; o lote nasce com `cliente_id` da sessão.
 */

const HORA = 60 * 60 * 1000;

function conexao(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    cliente_id: 7,
    seller_id: 'S1',
    apelido: 'LOJA_CLIENTE',
    access_token: 'tok-cliente',
    refresh_token: 'refresh-cli',
    access_expira_em: new Date(Date.now() + 6 * HORA).toISOString(),
    conectado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
    ...over,
  };
}

function baseDeDados(over: Record<string, unknown[]> = {}) {
  return {
    clientes: [{ id: 7, auth_user_id: 'auth-uid-1', email: 'c@x.com', status: 'ativo', criado_em: new Date().toISOString() }],
    contas_ml_clientes: [conexao()],
    lotes: [],
    lote_itens: [],
    ...over,
  };
}

function responseBody(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
}

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  process.env.ML_CLIENT_ID = 'robo-client';
  process.env.ML_CLIENT_SECRET = 'robo-secret';
  process.env.ML_CLIENT_ID_PORTAL = 'portal-client';
  process.env.ML_CLIENT_SECRET_PORTAL = 'portal-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  injetarCliente(null);
  injetarResolvedorDeSessao(null);
});

describe('POST /api/portal/lote', () => {
  it('sem sessão → 401', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve(null));
    injetarCliente(() => makeFakeSupabase(baseDeDados()).client as never);

    const res = await loteCriarPortal(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({ item_ids: ['MLB1'], tipo: 'diagnostico' }),
      }),
    );
    expect(res.status).toBe(401);
  });

  it('com sessão: cria o lote com cliente_id e seller_id da conexão (seller_id do corpo ignorado)', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    const { client, writes } = makeFakeSupabase(baseDeDados());
    injetarCliente(() => client as never);

    // Sem `seller_id` no corpo: a rota usa a única conexão do cliente.
    const res = await loteCriarPortal(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({
          item_ids: ['MLB1', 'MLB2'],
          tipo: 'diagnostico',
        }),
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.lote_id).toBeTruthy();

    const insLote = writes.find((w) => w.table === 'lotes' && w.kind === 'insert');
    const payload = insLote!.payload as Record<string, unknown>;
    expect(payload.cliente_id).toBe(7);
    expect(payload.seller_id).toBe('S1');
  });

  it('seller_id do corpo apontando pra conexão de OUTRO cliente → 409 sem criar o lote', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    const { client, writes } = makeFakeSupabase(baseDeDados());
    injetarCliente(() => client as never);

    const res = await loteCriarPortal(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({
          seller_id: 'S-DE-OUTRO-CLIENTE',
          item_ids: ['MLB1'],
          tipo: 'diagnostico',
        }),
      }),
    );
    expect(res.status).toBe(409);
    expect(writes.filter((w) => w.table === 'lotes')).toHaveLength(0);
  });
});

describe('GET /api/portal/lote/[id]', () => {
  it('lote de outro cliente → 404 (mesma mensagem de "não existe")', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    injetarCliente(
      () =>
        makeFakeSupabase(
          baseDeDados({
            lotes: [{ id: 'L-ALHEIO', seller_id: 'S-OUTRO', total_itens: 1, status: 'em_andamento', tipo: 'diagnostico', cliente_id: 99 }],
          }),
        ).client as never,
    );

    const res = await loteGetPortal(new Request('http://local'), params('L-ALHEIO'));
    expect(res.status).toBe(404);
  });

  it('lote do próprio cliente → 200', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    injetarCliente(
      () =>
        makeFakeSupabase(
          baseDeDados({
            lotes: [{ id: 'L-MEU', seller_id: 'S1', total_itens: 1, status: 'em_andamento', tipo: 'diagnostico', cliente_id: 7 }],
          }),
        ).client as never,
    );

    const res = await loteGetPortal(new Request('http://local'), params('L-MEU'));
    expect(res.status).toBe(200);
  });
});

describe('POST /api/portal/lote/[id]/processar', () => {
  it('lote de outro cliente → 404 sem processar nenhum item', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    injetarCliente(
      () =>
        makeFakeSupabase(
          baseDeDados({
            lotes: [{ id: 'L-ALHEIO', seller_id: 'S-OUTRO', total_itens: 1, status: 'em_andamento', tipo: 'diagnostico', cliente_id: 99 }],
            lote_itens: [{ id: 1, lote_id: 'L-ALHEIO', item_id: 'MLB1', status: 'pendente', tentativas: 0 }],
          }),
        ).client as never,
    );
    const fetchMock = vi.fn(async () => responseBody({}));
    vi.stubGlobal('fetch', fetchMock);

    const res = await loteProcessarPortal(new Request('http://local', { method: 'POST' }), params('L-ALHEIO'));
    expect(res.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lote do cliente: processa o item com o token do CLIENTE (comContaCliente), não dos robôs', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    const { client, writes } = makeFakeSupabase(
      baseDeDados({
        lotes: [{ id: 'L-MEU', seller_id: 'S1', total_itens: 1, status: 'em_andamento', tipo: 'diagnostico', cliente_id: 7 }],
        lote_itens: [{ id: 1, lote_id: 'L-MEU', item_id: 'MLB-P1', status: 'pendente', tentativas: 0 }],
      }),
    );
    injetarCliente(() => client as never);

    let auth: string | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes('/items/MLB-P1') && !u.includes('/items/MLB-P1/')) {
          auth = (init?.headers as Record<string, string>)?.Authorization;
          return responseBody({ id: 'MLB-P1', title: 'X', category_id: 'MLB1', seller_id: 'S1' });
        }
        // Todo o resto do diagnóstico pode falhar: cada bloco é isolado.
        return responseBody({ message: 'sem dados' }, 404);
      }),
    );

    const res = await loteProcessarPortal(new Request('http://local', { method: 'POST' }), params('L-MEU'));
    const atual = await res.json();

    expect(res.status).toBe(200);
    expect(atual.status).toBe('concluido');
    // Token da conexão do cliente (`contas_ml_clientes`), não de `contas` (robôs).
    expect(auth).toBe('Bearer tok-cliente');
    // `/oauth/token` NÃO foi chamado — token do cliente estava válido.
    const chamadas = (fetch as unknown as { mock: { calls: [string][] } }).mock.calls;
    expect(chamadas.some(([u]) => String(u).includes('/oauth/token'))).toBe(false);

    const upItem = writes.find(
      (w) => w.table === 'lote_itens' && w.kind === 'update' && (w.payload as Record<string, unknown>).status === 'concluido',
    );
    expect(upItem).toBeDefined();
  });
});

describe('POST /api/portal/lote/[id]/reenfileirar', () => {
  it('sem sessão → 401', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve(null));
    injetarCliente(() => makeFakeSupabase(baseDeDados()).client as never);

    const res = await loteReenfileirarPortal(new Request('http://local', { method: 'POST' }), params('QUALQUER'));
    expect(res.status).toBe(401);
  });

  it('lote de outro cliente → 404', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    injetarCliente(
      () =>
        makeFakeSupabase(
          baseDeDados({
            lotes: [{ id: 'L-ALHEIO', seller_id: 'S-OUTRO', total_itens: 1, status: 'em_andamento', tipo: 'diagnostico', cliente_id: 99 }],
          }),
        ).client as never,
    );

    const res = await loteReenfileirarPortal(new Request('http://local', { method: 'POST' }), params('L-ALHEIO'));
    expect(res.status).toBe(404);
  });
});
