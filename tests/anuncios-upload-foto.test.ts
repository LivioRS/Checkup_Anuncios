import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { POST as uploadFoto } from '../src/app/api/anuncios/upload-foto/route';

/**
 * Sobe foto do computador pro ML antes do anúncio existir (complemento do plano 029 —
 * até aqui só aceitava URL já hospedada). Devolve o `picture_id` que a tela de criação
 * usa em `pictures[].id`.
 */

const HORA = 60 * 60 * 1000;

function conta() {
  return {
    id: 1,
    seller_id: '2490900',
    apelido: 'SHINNISHI',
    org: null,
    access_token: 'tok-valido',
    refresh_token: 'refresh-A',
    access_expira_em: new Date(Date.now() + 6 * HORA).toISOString(),
  };
}

function pngFake(nome = 'foto.png', bytes = 10) {
  return new File([new Uint8Array(bytes)], nome, { type: 'image/png' });
}

beforeEach(() => {
  process.env.ML_CLIENT_ID = 'test-client';
  process.env.ML_CLIENT_SECRET = 'test-secret';
});

afterEach(() => {
  vi.unstubAllGlobals();
  injetarCliente(null);
});

describe('POST /api/anuncios/upload-foto', () => {
  it('sobe a foto e devolve o picture_id do ML', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    let auth: string | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).endsWith('/pictures/items/upload') && init?.method === 'POST') {
          auth = (init.headers as Record<string, string>)?.Authorization ?? null;
          return new Response(JSON.stringify({ id: 'PIC123' }), { status: 200 });
        }
        throw new Error(`inesperado: ${url}`);
      }),
    );

    const form = new FormData();
    form.append('seller_id', '2490900');
    form.append('file', pngFake());

    const res = await uploadFoto(new Request('http://local', { method: 'POST', body: form }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ ok: true, id: 'PIC123' });
    expect(auth).toBe('Bearer tok-valido');
  });

  it('recusa sem seller_id', async () => {
    const form = new FormData();
    form.append('file', pngFake());
    const res = await uploadFoto(new Request('http://local', { method: 'POST', body: form }));
    expect(res.status).toBe(400);
  });

  it('recusa sem arquivo', async () => {
    const form = new FormData();
    form.append('seller_id', '2490900');
    const res = await uploadFoto(new Request('http://local', { method: 'POST', body: form }));
    expect(res.status).toBe(400);
  });

  it('recusa arquivo que não é imagem', async () => {
    const form = new FormData();
    form.append('seller_id', '2490900');
    form.append('file', new File([new Uint8Array(4)], 'doc.pdf', { type: 'application/pdf' }));
    const res = await uploadFoto(new Request('http://local', { method: 'POST', body: form }));
    const json = await res.json();
    expect(res.status).toBe(400);
    expect(json.erro).toMatch(/imagem/i);
  });

  it('propaga a recusa do ML (ex.: token inválido) com o corpo cru', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [conta()] }).client as never);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'invalid_token' }), { status: 401 })),
    );

    const form = new FormData();
    form.append('seller_id', '2490900');
    form.append('file', pngFake());

    const res = await uploadFoto(new Request('http://local', { method: 'POST', body: form }));
    const json = await res.json();
    expect(res.status).toBe(401);
    expect(json.body.message).toBe('invalid_token');
  });

  it('sem conta cadastrada pro seller_id, devolve 401', async () => {
    injetarCliente(() => makeFakeSupabase({ contas: [] }).client as never);
    const form = new FormData();
    form.append('seller_id', '999999');
    form.append('file', pngFake());
    const res = await uploadFoto(new Request('http://local', { method: 'POST', body: form }));
    expect(res.status).toBe(401);
  });
});
