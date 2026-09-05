import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import {
  injetarResolvedorDeSessao,
  conexoesDoClienteLogado,
  resolverContaDoClienteLogado,
} from '../src/lib/portal/contaAtiva';
import { POST as avulsoPortal } from '../src/app/api/portal/anuncios/avulso/route';
import { GET as categoriaPortal } from '../src/app/api/portal/anuncios/categoria/route';
import { POST as iaPortal } from '../src/app/api/portal/anuncios/ia/route';

/**
 * Plano 034 — rotas espelho de criação de anúncio no PORTAL. O que estes testes travam (STOP
 * conditions): sem sessão → 401; `seller_id` do corpo NUNCA vira a conta usada (só escolhe entre
 * as conexões do próprio cliente, senão 409); o ML é chamado com o token do CLIENTE
 * (`comContaCliente` → `contas_ml_clientes`), nunca com o dos robôs; o log leva `cliente_id`.
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
    anuncio_criacoes: [],
    ...over,
  };
}

function responseBody(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
}

function corpoAvulso(over: Record<string, unknown> = {}) {
  return {
    // `seller_id` do corpo é ruído de propósito — a rota tem de ignorar como fonte de verdade.
    seller_id: 'SELLER-DO-CORPO',
    titulo: 'Pedal de Guitarra Overdrive XYZ Tube Screamer',
    category_id: 'MLB9999',
    valor: 349.9,
    quantidade: 5,
    condicao: 'new',
    marca: 'XYZ',
    modelo: 'TS-9',
    fotos: ['https://http2.mlstatic.com/foto1.jpg'],
    garantia: { tipo: 'vendedor', tempo: '1 ano' },
    ...over,
  };
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

describe('contaAtiva — resolução da conexão do cliente logado', () => {
  it('sem sessão: conexões vazias e resolver devolve sem_sessao', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve(null));
    injetarCliente(() => makeFakeSupabase(baseDeDados()).client as never);

    expect(await conexoesDoClienteLogado()).toEqual([]);
    expect(await resolverContaDoClienteLogado()).toEqual({ erro: 'sem_sessao' });
  });

  it('sessão sem cadastro de cliente: sem_conexao', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-DESCONHECIDO'));
    injetarCliente(() => makeFakeSupabase(baseDeDados()).client as never);

    expect(await resolverContaDoClienteLogado()).toEqual({ erro: 'sem_conexao' });
  });

  it('sessão + 1 conexão: resolve a conexão certa; seller_id alheio → seller_alheio', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    injetarCliente(() => makeFakeSupabase(baseDeDados()).client as never);

    const ok = await resolverContaDoClienteLogado('S1');
    expect('erro' in ok).toBe(false);
    if (!('erro' in ok)) {
      expect(ok.conta).toEqual({ clienteId: 7, sellerId: 'S1', apelido: 'LOJA_CLIENTE' });
    }

    expect(await resolverContaDoClienteLogado('OUTRO-SELLER')).toEqual({ erro: 'seller_alheio' });
  });
});

describe('POST /api/portal/anuncios/avulso', () => {
  it('sem sessão → 401 e nunca chama o ML', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve(null));
    injetarCliente(() => makeFakeSupabase(baseDeDados()).client as never);
    const fetchMock = vi.fn(async () => responseBody({}));
    vi.stubGlobal('fetch', fetchMock);

    const res = await avulsoPortal(
      new Request('http://local', { method: 'POST', body: JSON.stringify(corpoAvulso()) }),
    );
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('com sessão + 1 conexão: ML chamado com o token do CLIENTE, seller_id do corpo ignorado, log com cliente_id', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    const { client, writes } = makeFakeSupabase(baseDeDados());
    injetarCliente(() => client as never);

    let auth: string | undefined;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/items') && init?.method === 'POST') {
        auth = (init.headers as Record<string, string>)?.Authorization;
        return responseBody({ id: 'MLB111', status: 'paused', permalink: 'https://x/MLB111' });
      }
      throw new Error(`inesperado: ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    // Sem `seller_id` no corpo: a rota usa a única conexão do cliente.
    const res = await avulsoPortal(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify(corpoAvulso({ seller_id: undefined })),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    // Token da conexão do cliente (`contas_ml_clientes`), não de `contas`.
    expect(auth).toBe('Bearer tok-cliente');
    // `/oauth/token` NÃO foi chamado — token do cliente estava válido.
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/oauth/token'))).toBe(false);

    const log = writes.find((w) => w.table === 'anuncio_criacoes' && w.kind === 'insert');
    const payload = log!.payload as Record<string, unknown>;
    expect(payload.cliente_id).toBe(7);
    expect(payload.seller_id).toBe('S1'); // da sessão — nunca "SELLER-DO-CORPO"
    expect(payload.item_id).toBe('MLB111');
  });

  it('seller_id do corpo apontando pra conexão de OUTRO cliente → 409 sem chamar o ML', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    injetarCliente(() => makeFakeSupabase(baseDeDados()).client as never);
    const fetchMock = vi.fn(async () => responseBody({}));
    vi.stubGlobal('fetch', fetchMock);

    const res = await avulsoPortal(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify(corpoAvulso({ seller_id: 'S-DE-OUTRO-CLIENTE' })),
      }),
    );
    expect(res.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('rotas portal só-leitura / IA — gate de sessão', () => {
  it('GET /api/portal/anuncios/categoria sem sessão → 401', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve(null));
    injetarCliente(() => makeFakeSupabase(baseDeDados()).client as never);

    const res = await categoriaPortal(new Request('http://local/x?q=pedal+overdrive'));
    expect(res.status).toBe(401);
  });

  it('POST /api/portal/anuncios/ia sem sessão → 401 (não precisa nem de conexão ML)', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve(null));
    injetarCliente(() => makeFakeSupabase(baseDeDados()).client as never);

    const res = await iaPortal(
      new Request('http://local', {
        method: 'POST',
        body: JSON.stringify({ acao: 'descricao', titulo: 'Pedal Overdrive XYZ' }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
