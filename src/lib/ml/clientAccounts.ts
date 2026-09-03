import 'server-only';
import { db } from '../supabase';

/**
 * Adapter de `contas_ml_clientes` (plano 021/022) — camada de conta, livre pra importar
 * Supabase (AGENTS.md §11), assim como `client.ts`/`items.ts`/`dono.ts`/`tags-novas.ts`.
 *
 * Espelha o padrão de `client.ts` sobre `contas`, mas para as contas ML dos clientes do portal.
 * Aplica em runtime a invariante do AGENTS.md §1: `seller_id` nunca pode existir em `contas`
 * (robôs) E `contas_ml_clientes` (portal) ao mesmo tempo, e uma conta ML não pode pertencer a
 * dois clientes do portal ao mesmo tempo — antes só documentada, agora também código.
 */

export type ConexaoCliente = {
  seller_id: string;
  apelido: string | null;
  conectado_em: string;
};

export type ClienteComConexoes = {
  id: number;
  nome: string;
  email: string;
  status: string;
  conexoes: ConexaoCliente[];
};

/** Lançado quando `seller_id` colide com `contas` (robôs) ou com outro cliente do portal. */
export class ConflitoDeContaError extends Error {}

/**
 * Grava (ou atualiza, se for o mesmo cliente reconectando) a conexão ML de um cliente do
 * portal. Ordem das checagens importa: primeiro `contas` (robôs), depois `contas_ml_clientes`
 * (outro cliente) — ambas antes de qualquer escrita.
 */
export async function salvarConexaoCliente(input: {
  cliente_id: number;
  seller_id: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  apelido?: string | null;
}): Promise<void> {
  const { data: robos, error: erroRobos } = await db()
    .from('contas')
    .select('id')
    .eq('seller_id', input.seller_id)
    .limit(1);
  if (erroRobos) throw new Error(`Supabase: ${erroRobos.message}`);
  if (robos && robos.length > 0) {
    throw new ConflitoDeContaError(
      `seller_id ${input.seller_id} já é uma conta operada pelos robôs (tabela contas) — não pode virar conta de cliente do portal.`,
    );
  }

  const { data: existentes, error: erroExistente } = await db()
    .from('contas_ml_clientes')
    .select('id, cliente_id')
    .eq('seller_id', input.seller_id)
    .limit(1);
  if (erroExistente) throw new Error(`Supabase: ${erroExistente.message}`);
  const existente = existentes?.[0] as { id: number; cliente_id: number } | undefined;

  if (existente && existente.cliente_id !== input.cliente_id) {
    throw new ConflitoDeContaError(
      `seller_id ${input.seller_id} já está conectado a outro cliente do portal (cliente_id ${existente.cliente_id}).`,
    );
  }

  const access_expira_em = new Date(Date.now() + input.expires_in * 1000).toISOString();
  const agora = new Date().toISOString();

  if (existente) {
    const { error } = await db()
      .from('contas_ml_clientes')
      .update({
        access_token: input.access_token,
        refresh_token: input.refresh_token,
        access_expira_em,
        apelido: input.apelido ?? null,
        atualizado_em: agora,
      })
      .eq('seller_id', input.seller_id);
    if (error) throw new Error(`Supabase: ${error.message}`);
    return;
  }

  const { error } = await db()
    .from('contas_ml_clientes')
    .insert({
      cliente_id: input.cliente_id,
      seller_id: input.seller_id,
      apelido: input.apelido ?? null,
      access_token: input.access_token,
      refresh_token: input.refresh_token,
      access_expira_em,
      conectado_em: agora,
      atualizado_em: agora,
    });
  if (error) throw new Error(`Supabase: ${error.message}`);
}

/** Lista clientes com as conexões ML de cada um — join do lado do código (2 selects simples). */
export async function listarClientesComConexoes(): Promise<ClienteComConexoes[]> {
  const { data: clientes, error: erroClientes } = await db()
    .from('clientes')
    .select('id, nome, email, status')
    .order('id');
  if (erroClientes) throw new Error(`Supabase: ${erroClientes.message}`);

  const { data: conexoes, error: erroConexoes } = await db()
    .from('contas_ml_clientes')
    .select('cliente_id, seller_id, apelido, conectado_em');
  if (erroConexoes) throw new Error(`Supabase: ${erroConexoes.message}`);

  return (clientes ?? []).map((c: { id: number; nome: string; email: string; status: string }) => ({
    ...c,
    conexoes: (conexoes ?? []).filter(
      (x: { cliente_id: number }) => x.cliente_id === c.id,
    ) as ConexaoCliente[],
  }));
}
