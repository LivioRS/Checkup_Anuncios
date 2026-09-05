import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { injetarResolvedorDeSessao } from '../src/lib/portal/contaAtiva';
import { emTrial, clienteLiberado, TRIAL_DIAS } from '../src/lib/portal/assinatura';
import { POST as avulsoPortal } from '../src/app/api/portal/anuncios/avulso/route';
import { POST as webhookMp } from '../src/app/api/webhooks/mercadopago/route';

/**
 * Plano 036 (f3c6) — trial de 7 dias + paywall nas rotas de criação + webhook do Mercado Pago.
 * STOP conditions travadas aqui: notificação sem `x-signature` válida NUNCA toca o banco;
 * cliente fora do trial e sem assinatura `authorized` → 402 antes de chamar o ML.
 */

const DIA_MS = 24 * 60 * 60 * 1000;

function iso(deltaMs: number) {
  return new Date(Date.now() + deltaMs).toISOString();
}

function responseBody(json: unknown, status = 200) {
  return new Response(JSON.stringify(json), { status, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
  process.env.ML_CLIENT_ID_PORTAL = 'portal-client';
  process.env.ML_CLIENT_SECRET_PORTAL = 'portal-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  injetarCliente(null);
  injetarResolvedorDeSessao(null);
  delete process.env.MERCADOPAGO_ACCESS_TOKEN;
  delete process.env.MERCADOPAGO_WEBHOOK_SECRET;
});

describe('emTrial', () => {
  it('true durante os primeiros 7 dias', () => {
    expect(emTrial(iso(-1 * DIA_MS))).toBe(true);
    expect(emTrial(iso(-(TRIAL_DIAS - 1) * DIA_MS))).toBe(true);
  });

  it('false depois de 7 dias', () => {
    expect(emTrial(iso(-(TRIAL_DIAS + 1) * DIA_MS))).toBe(false);
  });
});

describe('clienteLiberado', () => {
  it('em trial: liberado mesmo sem nenhuma assinatura', async () => {
    injetarCliente(() => makeFakeSupabase({ assinaturas: [] }).client as never);
    expect(await clienteLiberado(1, iso(-1 * DIA_MS))).toBe(true);
  });

  it('fora do trial, sem assinatura: bloqueado', async () => {
    injetarCliente(() => makeFakeSupabase({ assinaturas: [] }).client as never);
    expect(await clienteLiberado(1, iso(-(TRIAL_DIAS + 1) * DIA_MS))).toBe(false);
  });

  it('fora do trial, assinatura authorized: liberado', async () => {
    injetarCliente(
      () =>
        makeFakeSupabase({
          assinaturas: [{ id: 1, cliente_id: 1, mp_preapproval_id: 'PA1', status: 'authorized', valor_centavos: 9700 }],
        }).client as never,
    );
    expect(await clienteLiberado(1, iso(-(TRIAL_DIAS + 1) * DIA_MS))).toBe(true);
  });

  it('fora do trial, assinatura cancelled: bloqueado', async () => {
    injetarCliente(
      () =>
        makeFakeSupabase({
          assinaturas: [{ id: 1, cliente_id: 1, mp_preapproval_id: 'PA1', status: 'cancelled', valor_centavos: 9700 }],
        }).client as never,
    );
    expect(await clienteLiberado(1, iso(-(TRIAL_DIAS + 1) * DIA_MS))).toBe(false);
  });
});

describe('POST /api/portal/anuncios/avulso — paywall (plano 036)', () => {
  function baseDeDados(clienteOver: Record<string, unknown> = {}) {
    return {
      clientes: [{ id: 7, auth_user_id: 'auth-uid-1', email: 'c@x.com', status: 'ativo', criado_em: iso(-(TRIAL_DIAS + 1) * DIA_MS), ...clienteOver }],
      contas_ml_clientes: [
        {
          id: 1,
          cliente_id: 7,
          seller_id: 'S1',
          apelido: 'LOJA',
          access_token: 'tok-cliente',
          refresh_token: 'r',
          access_expira_em: iso(6 * 60 * 60 * 1000),
        },
      ],
      anuncio_criacoes: [],
      assinaturas: [] as unknown[],
    };
  }

  it('fora do trial, sem assinatura → 402 sem chamar o ML', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    injetarCliente(() => makeFakeSupabase(baseDeDados()).client as never);
    const fetchMock = vi.fn(async () => responseBody({}));
    vi.stubGlobal('fetch', fetchMock);

    const res = await avulsoPortal(new Request('http://local', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(402);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('em trial (cliente recém-criado) → passa do gate (chega a validar o corpo)', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    injetarCliente(() => makeFakeSupabase(baseDeDados({ criado_em: iso(-1 * DIA_MS) })).client as never);

    // corpo vazio: passa o paywall, mas falha na validação de campos (400) — prova que NÃO foi
    // bloqueado em 402 (o gate roda antes da validação do corpo).
    const res = await avulsoPortal(new Request('http://local', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(400);
  });

  it('fora do trial, com assinatura authorized → passa do gate', async () => {
    injetarResolvedorDeSessao(() => Promise.resolve('auth-uid-1'));
    const dados = {
      ...baseDeDados(),
      assinaturas: [{ id: 1, cliente_id: 7, mp_preapproval_id: 'PA1', status: 'authorized', valor_centavos: 9700 }],
    };
    injetarCliente(() => makeFakeSupabase(dados).client as never);

    const res = await avulsoPortal(new Request('http://local', { method: 'POST', body: '{}' }));
    expect(res.status).toBe(400); // passou do 402, caiu na validação de campos
  });
});

describe('POST /api/webhooks/mercadopago', () => {
  async function assinar(manifesto: string, segredo: string): Promise<string> {
    const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifesto));
    return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function header(dataId: string, requestId: string, segredo: string, ts = '1700000000') {
    const manifesto = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const v1 = await assinar(manifesto, segredo);
    return `ts=${ts},v1=${v1}`;
  }

  beforeEach(() => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'token-mp';
    process.env.MERCADOPAGO_WEBHOOK_SECRET = 'segredo-webhook';
  });

  it('assinatura inválida → 401, nunca toca o banco', async () => {
    const { client, writes } = makeFakeSupabase({ assinaturas: [{ id: 1, cliente_id: 7, mp_preapproval_id: 'PA1', status: 'pendente', valor_centavos: 9700 }] });
    injetarCliente(() => client as never);
    const fetchMock = vi.fn(async () => responseBody({}));
    vi.stubGlobal('fetch', fetchMock);

    const req = new Request('http://local/api/webhooks/mercadopago?type=subscription_preapproval&data.id=PA1', {
      method: 'POST',
      headers: { 'x-signature': 'ts=1,v1=lixo', 'x-request-id': 'r1' },
      body: JSON.stringify({ type: 'subscription_preapproval', data: { id: 'PA1' } }),
    });
    const res = await webhookMp(req);
    expect(res.status).toBe(401);
    expect(writes).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('assinatura válida + subscription_preapproval: confirma o status na API do MP e atualiza a linha', async () => {
    const { client, writes } = makeFakeSupabase({
      assinaturas: [{ id: 1, cliente_id: 7, mp_preapproval_id: 'PA1', status: 'pendente', valor_centavos: 9700 }],
    });
    injetarCliente(() => client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(String(url)).toContain('/preapproval/PA1');
        return responseBody({ status: 'authorized', external_reference: '7' });
      }),
    );

    const xSignature = await header('PA1', 'r1', 'segredo-webhook');
    const req = new Request('http://local/api/webhooks/mercadopago?type=subscription_preapproval&data.id=PA1', {
      method: 'POST',
      headers: { 'x-signature': xSignature, 'x-request-id': 'r1' },
      body: JSON.stringify({ type: 'subscription_preapproval', data: { id: 'PA1' } }),
    });
    const res = await webhookMp(req);
    expect(res.status).toBe(200);

    const upd = writes.find((w) => w.table === 'assinaturas' && w.kind === 'update');
    expect(upd).toBeDefined();
    expect((upd!.payload as Record<string, unknown>).status).toBe('authorized');
  });

  it('tópico que não interessa → 200 sem tocar o banco', async () => {
    const { client, writes } = makeFakeSupabase({ assinaturas: [] });
    injetarCliente(() => client as never);
    const fetchMock = vi.fn(async () => responseBody({}));
    vi.stubGlobal('fetch', fetchMock);

    const xSignature = await header('PAY1', 'r1', 'segredo-webhook');
    const req = new Request('http://local/api/webhooks/mercadopago?type=payment&data.id=PAY1', {
      method: 'POST',
      headers: { 'x-signature': xSignature, 'x-request-id': 'r1' },
      body: JSON.stringify({ type: 'payment', data: { id: 'PAY1' } }),
    });
    const res = await webhookMp(req);
    expect(res.status).toBe(200);
    expect(writes).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
