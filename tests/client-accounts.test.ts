import { afterEach, describe, expect, it } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import {
  salvarConexaoCliente,
  listarClientesComConexoes,
  ConflitoDeContaError,
} from '../src/lib/ml/clientAccounts';

afterEach(() => {
  injetarCliente(null);
});

function entradaBase(over: Partial<Parameters<typeof salvarConexaoCliente>[0]> = {}) {
  return {
    cliente_id: 1,
    seller_id: '555000',
    access_token: 'tok-cliente',
    refresh_token: 'refresh-cliente',
    expires_in: 21600,
    apelido: 'LOJA_TESTE',
    ...over,
  };
}

describe('salvarConexaoCliente', () => {
  it('conecta uma conta nova: insere em contas_ml_clientes', async () => {
    const { client, writes } = makeFakeSupabase({ contas: [], contas_ml_clientes: [] });
    injetarCliente(() => client as never);

    await salvarConexaoCliente(entradaBase());

    const ins = writes.find((w) => w.table === 'contas_ml_clientes' && w.kind === 'insert');
    expect(ins).toBeDefined();
    const payload = ins!.payload as Record<string, unknown>;
    expect(payload.cliente_id).toBe(1);
    expect(payload.seller_id).toBe('555000');
    expect(payload.access_token).toBe('tok-cliente');
  });

  it('reconexão do MESMO cliente: atualiza a linha existente em vez de inserir', async () => {
    const { client, writes } = makeFakeSupabase({
      contas: [],
      contas_ml_clientes: [{ id: 10, cliente_id: 1, seller_id: '555000', apelido: 'antigo' }],
    });
    injetarCliente(() => client as never);

    await salvarConexaoCliente(entradaBase({ access_token: 'tok-renovado' }));

    expect(writes.find((w) => w.kind === 'insert')).toBeUndefined();
    const upd = writes.find((w) => w.table === 'contas_ml_clientes' && w.kind === 'update');
    expect(upd).toBeDefined();
    expect((upd!.payload as Record<string, unknown>).access_token).toBe('tok-renovado');
  });

  it('rejeita quando seller_id já existe em `contas` (conta de robô)', async () => {
    const { client, writes } = makeFakeSupabase({
      contas: [{ id: 1, seller_id: '555000' }],
      contas_ml_clientes: [],
    });
    injetarCliente(() => client as never);

    await expect(salvarConexaoCliente(entradaBase())).rejects.toBeInstanceOf(ConflitoDeContaError);
    expect(writes.filter((w) => w.table === 'contas_ml_clientes')).toHaveLength(0);
  });

  it('rejeita quando seller_id já está conectado a OUTRO cliente do portal', async () => {
    const { client, writes } = makeFakeSupabase({
      contas: [],
      contas_ml_clientes: [{ id: 10, cliente_id: 2, seller_id: '555000', apelido: 'de outro cliente' }],
    });
    injetarCliente(() => client as never);

    await expect(salvarConexaoCliente(entradaBase({ cliente_id: 1 }))).rejects.toBeInstanceOf(
      ConflitoDeContaError,
    );
    expect(writes.filter((w) => w.kind === 'update' || w.kind === 'insert')).toHaveLength(0);
  });
});

describe('listarClientesComConexoes', () => {
  it('junta clientes com suas conexões (join do lado do código)', async () => {
    const { client } = makeFakeSupabase({
      clientes: [
        { id: 1, nome: 'Cliente A', email: 'a@exemplo.com', status: 'ativo' },
        { id: 2, nome: 'Cliente B', email: 'b@exemplo.com', status: 'ativo' },
      ],
      contas_ml_clientes: [
        { cliente_id: 1, seller_id: '555000', apelido: 'LOJA_A', conectado_em: '2026-01-01' },
      ],
    });
    injetarCliente(() => client as never);

    const resultado = await listarClientesComConexoes();

    expect(resultado).toHaveLength(2);
    expect(resultado[0].conexoes).toEqual([
      { cliente_id: 1, seller_id: '555000', apelido: 'LOJA_A', conectado_em: '2026-01-01' },
    ]);
    expect(resultado[1].conexoes).toEqual([]);
  });
});
