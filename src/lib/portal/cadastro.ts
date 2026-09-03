import 'server-only';
import { db } from '../supabase';

/**
 * Adapter (AGENTS.md §11) — grava em `clientes` depois que o Supabase Auth já criou o
 * `auth.users` correspondente (plano 023, card f1c4). Livre pra importar Supabase, mesma
 * categoria de `src/lib/ml/clientAccounts.ts`.
 *
 * A tabela `clientes` NÃO tem policy de `insert` pra `authenticated` de propósito — só
 * `service_role` (aqui, via `db()`) grava linha nova. Isso evita que um cliente autenticado
 * insira uma linha arbitrária ou se atribua o `auth_user_id` de outra pessoa.
 */

export class ClienteJaCadastradoError extends Error {
  constructor(motivo: 'auth_user_id' | 'email') {
    super(
      motivo === 'auth_user_id'
        ? 'Este usuário já tem um cadastro de cliente.'
        : 'Já existe um cliente com este e-mail.',
    );
    this.name = 'ClienteJaCadastradoError';
  }
}

export type NovoRegistroCliente = {
  authUserId: string;
  email: string;
  nome: string;
};

export async function criarRegistroCliente(input: NovoRegistroCliente): Promise<void> {
  const cliente = db();

  const { data: porAuthUserId, error: erroBusca1 } = await cliente
    .from('clientes')
    .select('id')
    .eq('auth_user_id', input.authUserId)
    .limit(1);
  if (erroBusca1) throw new Error(`Falha ao checar cadastro existente: ${erroBusca1.message}`);
  if (porAuthUserId?.[0]) throw new ClienteJaCadastradoError('auth_user_id');

  // `.ilike` (case-insensitive) espelha o índice único `lower(email)` do schema — o fake de
  // teste não simula o filtro (só a checagem de "existe alguma linha"), então esta parte da
  // deduplicação por e-mail depende do índice único do Postgres como rede de segurança real.
  const { data: porEmail, error: erroBusca2 } = await cliente
    .from('clientes')
    .select('id')
    .ilike('email', input.email)
    .limit(1);
  if (erroBusca2) throw new Error(`Falha ao checar e-mail existente: ${erroBusca2.message}`);
  if (porEmail?.[0]) throw new ClienteJaCadastradoError('email');

  const { error: erroInsert } = await cliente.from('clientes').insert({
    nome: input.nome,
    email: input.email,
    status: 'ativo',
    auth_user_id: input.authUserId,
  });
  if (erroInsert) throw new Error(`Falha ao criar registro de cliente: ${erroInsert.message}`);
}
