import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { assinarState } from '../src/lib/ml/oauth';
import { GET as callbackGET } from '../src/app/api/oauth/ml/callback/route';

/**
 * Plano 027 (f3c1) — o callback do OAuth volta pra `/clientes` (admin) ou `/portal/painel`
 * (cliente logado) conforme a `origem` ASSINADA no `state`. Um `state` inválido cai no fluxo
 * admin (o antigo), sem vazar destino escolhido pelo usuário.
 *
 * `/api/portal/ml/conectar` e o gate do `middleware.ts` (f3c0) não têm teste unitário aqui —
 * dependem de `next/headers`/`NextRequest`, que o repo não mocka; ficam pro teste manual.
 */

function tokenResponse(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  process.env.PANEL_HMAC_SECRET = 'segredo-teste';
  process.env.ML_CLIENT_ID_PORTAL = 'portal-client';
  process.env.ML_CLIENT_SECRET_PORTAL = 'portal-secret';
  process.env.ML_REDIRECT_URI_PORTAL = 'https://portal.exemplo.com/api/oauth/ml/callback';
});

afterEach(() => {
  injetarCliente(null);
  vi.unstubAllGlobals();
  delete process.env.PANEL_HMAC_SECRET;
  delete process.env.ML_CLIENT_ID_PORTAL;
  delete process.env.ML_CLIENT_SECRET_PORTAL;
  delete process.env.ML_REDIRECT_URI_PORTAL;
});

function stubFluxoFeliz() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/oauth/token')) {
        return tokenResponse({
          access_token: 'tok',
          token_type: 'Bearer',
          expires_in: 21600,
          scope: 'read',
          user_id: 555,
          refresh_token: 'ref',
        });
      }
      if (u.includes('/users/me')) return tokenResponse({ nickname: 'LOJA_TESTE' });
      throw new Error(`chamada inesperada: ${u}`);
    }),
  );
}

describe('GET /api/oauth/ml/callback — retorno por origem (f3c1)', () => {
  it('origem "portal" volta pra /portal/painel?aviso=conectado', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [], contas_ml_clientes: [] }).client as never);
    stubFluxoFeliz();

    const state = await assinarState(5, 'portal');
    const req = new Request(`http://local/api/oauth/ml/callback?code=abc&state=${encodeURIComponent(state)}`);
    const res = await callbackGET(req);

    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/portal/painel');
    expect(loc).toContain('aviso=conectado');
  });

  it('origem "admin" volta pra /clientes?aviso=conectado', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [], contas_ml_clientes: [] }).client as never);
    stubFluxoFeliz();

    const state = await assinarState(9, 'admin');
    const req = new Request(`http://local/api/oauth/ml/callback?code=abc&state=${encodeURIComponent(state)}`);
    const res = await callbackGET(req);

    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/clientes');
    expect(loc).toContain('aviso=conectado');
  });

  it('state inválido cai no fluxo admin com aviso state_invalido', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [], contas_ml_clientes: [] }).client as never);

    const req = new Request('http://local/api/oauth/ml/callback?code=abc&state=lixo.invalido');
    const res = await callbackGET(req);

    const loc = res.headers.get('location') ?? '';
    expect(loc).toContain('/clientes');
    expect(loc).toContain('aviso=state_invalido');
  });

  it('ML negou (error na query) volta pro admin sem tentar trocar código', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [], contas_ml_clientes: [] }).client as never);
    const fetchMock = vi.fn(async () => {
      throw new Error('não deveria chamar o ML');
    });
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://local/api/oauth/ml/callback?error=access_denied');
    const res = await callbackGET(req);

    expect(res.headers.get('location') ?? '').toContain('/clientes');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
