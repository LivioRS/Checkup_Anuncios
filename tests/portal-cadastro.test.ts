import { afterEach, describe, expect, it } from 'vitest';
import { makeFakeSupabase } from './helpers/supabase-fake';
import { injetarCliente } from '../src/lib/supabase';
import { criarRegistroCliente, ClienteJaCadastradoError } from '../src/lib/portal/cadastro';

afterEach(() => {
  injetarCliente(null);
});

function entradaBase(over: Partial<Parameters<typeof criarRegistroCliente>[0]> = {}) {
  return {
    authUserId: 'user-1',
    email: 'novo@exemplo.com',
    nome: 'Novo Cliente',
    ...over,
  };
}

describe('criarRegistroCliente', () => {
  it('cria a linha nova em clientes, amarrada ao auth_user_id', async () => {
    const { client, writes } = makeFakeSupabase({ clientes: [] });
    injetarCliente(() => client as never);

    await criarRegistroCliente(entradaBase());

    const ins = writes.find((w) => w.table === 'clientes' && w.kind === 'insert');
    expect(ins).toBeDefined();
    const payload = ins!.payload as Record<string, unknown>;
    expect(payload.auth_user_id).toBe('user-1');
    expect(payload.email).toBe('novo@exemplo.com');
    expect(payload.status).toBe('ativo');
  });

  it('rejeita quando o auth_user_id já tem cadastro', async () => {
    const { client, writes } = makeFakeSupabase({
      clientes: [{ id: 1, auth_user_id: 'user-1', email: 'ja@exemplo.com' }],
    });
    injetarCliente(() => client as never);

    await expect(criarRegistroCliente(entradaBase())).rejects.toBeInstanceOf(
      ClienteJaCadastradoError,
    );
    expect(writes.filter((w) => w.kind === 'insert')).toHaveLength(0);
  });

  it('rejeita quando já existe QUALQUER cliente com e-mail cadastrado (checagem via ilike)', async () => {
    const { client, writes } = makeFakeSupabase({
      clientes: [{ id: 1, auth_user_id: 'outro-user', email: 'duplicado@exemplo.com' }],
    });
    injetarCliente(() => client as never);

    await expect(
      criarRegistroCliente(entradaBase({ authUserId: 'user-2' })),
    ).rejects.toBeInstanceOf(ClienteJaCadastradoError);
    expect(writes.filter((w) => w.kind === 'insert')).toHaveLength(0);
  });
});
