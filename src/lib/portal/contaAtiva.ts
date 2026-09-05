import 'server-only';
import { db } from '../supabase';
import { comContaCliente } from '../ml/client';

/**
 * Adapter (AGENTS.md §11) — resolve, a partir da sessão Supabase do CLIENTE logado em `/portal/*`,
 * qual conexão do Mercado Livre (`contas_ml_clientes`) usar nas rotas de criação de anúncio do
 * portal (plano 034). Livre pra importar Supabase, mesma categoria de
 * `src/lib/portal/cadastro.ts` e `src/lib/ml/clientAccounts.ts`.
 *
 * Regras que este módulo garante (STOP conditions do plano 034):
 * - o `seller_id` que vem do corpo/query de uma rota do portal NUNCA é usado direto — só serve
 *   pra escolher ENTRE as conexões do próprio cliente, e ainda assim é validado contra elas;
 * - o ML é sempre chamado por `comContaCliente` (universo do portal), nunca por `comConta`
 *   (universo dos robôs);
 * - a leitura de `clientes`/`contas_ml_clientes` é feita por `db()` (service_role) mas SEMPRE
 *   filtrada por `auth_user_id`/`cliente_id` da sessão — o mesmo recorte que a RLS faria.
 */

export type ContaAtivaCliente = {
  clienteId: number;
  sellerId: string;
  apelido: string | null;
};

export type ErroContaCliente = 'sem_sessao' | 'sem_conexao' | 'seller_alheio';

/**
 * Como a sessão é resolvida em `auth.users.id`. Em produção lê o cookie via `supabaseServidor()`
 * (import dinâmico — assim quem só importa este módulo não puxa `next/headers`). Nos testes,
 * `injetarResolvedorDeSessao` troca por uma função fixa (mesmo padrão de `injetarCliente`).
 */
type ResolvedorDeSessao = () => Promise<string | null>;
let resolvedorInjetado: ResolvedorDeSessao | null = null;

/** Testes: injeta o `auth.users.id` da "sessão". `null` restaura o comportamento normal. */
export function injetarResolvedorDeSessao(f: ResolvedorDeSessao | null): void {
  resolvedorInjetado = f;
}

async function authUserIdDaSessao(): Promise<string | null> {
  if (resolvedorInjetado) return resolvedorInjetado();
  const { supabaseServidor } = await import('../supabase/server');
  const supabase = await supabaseServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

type ClienteInfo = { id: number; criadoEm: string };

/**
 * `status !== 'ativo'` (plano 036, f3c4) devolve `null` aqui — mesmo efeito de "sem cadastro".
 * Um cliente `suspenso`/`cancelado` some das rotas do portal por inteiro, não só das de
 * criação: `clienteLogadoId`/`resolverContaDoClienteLogado`/`conexoesDoClienteLogado` chamam
 * esta função por baixo, então o gate vale pra tudo sem precisar editar cada rota.
 */
async function clienteInfoPorAuthUserId(authUserId: string): Promise<ClienteInfo | null> {
  const { data, error } = await db()
    .from('clientes')
    .select('id, criado_em, status')
    .eq('auth_user_id', authUserId)
    .limit(1);
  if (error) throw new Error(`Supabase: ${error.message}`);
  const row = data?.[0] as { id: number; criado_em: string; status: string } | undefined;
  if (!row || row.status !== 'ativo') return null;
  return { id: row.id, criadoEm: row.criado_em };
}

async function clienteIdPorAuthUserId(authUserId: string): Promise<number | null> {
  const info = await clienteInfoPorAuthUserId(authUserId);
  return info?.id ?? null;
}

async function conexoesPorClienteId(clienteId: number): Promise<ContaAtivaCliente[]> {
  const { data, error } = await db()
    .from('contas_ml_clientes')
    .select('seller_id, apelido')
    .eq('cliente_id', clienteId)
    .not('access_token', 'is', null)
    .order('id');
  if (error) throw new Error(`Supabase: ${error.message}`);
  return (data ?? []).map((r) => {
    const row = r as { seller_id: string | number; apelido: string | null };
    return { clienteId, sellerId: String(row.seller_id), apelido: row.apelido ?? null };
  });
}

/** `clientes.id` do usuário logado (sem exigir conexão ML). `null` = não autenticado / sem cadastro. */
export async function clienteLogadoId(): Promise<number | null> {
  const authUserId = await authUserIdDaSessao();
  if (!authUserId) return null;
  return clienteIdPorAuthUserId(authUserId);
}

/** `{id, criadoEm}` do cliente logado — `criadoEm` alimenta o cálculo de trial (plano 036). */
export async function clienteLogadoInfo(): Promise<ClienteInfo | null> {
  const authUserId = await authUserIdDaSessao();
  if (!authUserId) return null;
  return clienteInfoPorAuthUserId(authUserId);
}

/** Todas as conexões ML do cliente logado — pra dropdown quando ele tem mais de uma. */
export async function conexoesDoClienteLogado(): Promise<ContaAtivaCliente[]> {
  const clienteId = await clienteLogadoId();
  if (!clienteId) return [];
  return conexoesPorClienteId(clienteId);
}

/**
 * UMA conexão: a de `sellerId` se ele for passado E pertencer ao cliente logado; senão a
 * primeira. `null` quando não há sessão/cadastro, ou quando `sellerId` foi pedido mas não é do
 * cliente (nunca "cai" numa conta alheia).
 */
export async function contaAtivaDoClienteLogado(sellerId?: string): Promise<ContaAtivaCliente | null> {
  const conexoes = await conexoesDoClienteLogado();
  if (conexoes.length === 0) return null;
  if (sellerId) return conexoes.find((c) => c.sellerId === sellerId) ?? null;
  return conexoes[0];
}

type EscopoDoCliente = {
  conta: ContaAtivaCliente;
  /** Roda `fn` dentro de `comContaCliente(clienteId, sellerId, fn)`. */
  executar: <T>(fn: () => Promise<T>) => Promise<T>;
};

/**
 * Resolve a conta ativa e devolve um executor (NÃO roda nada ainda) — pros handlers que montam
 * a resposta em volta da chamada ao ML. `seller_id` opcional = "qual das minhas conexões".
 */
export async function resolverContaDoClienteLogado(
  sellerId?: string,
): Promise<EscopoDoCliente | { erro: ErroContaCliente }> {
  const authUserId = await authUserIdDaSessao();
  if (!authUserId) return { erro: 'sem_sessao' };
  const clienteId = await clienteIdPorAuthUserId(authUserId);
  if (!clienteId) return { erro: 'sem_conexao' };
  const conexoes = await conexoesPorClienteId(clienteId);
  if (conexoes.length === 0) return { erro: 'sem_conexao' };

  let conta: ContaAtivaCliente | undefined;
  if (sellerId) {
    conta = conexoes.find((c) => c.sellerId === sellerId);
    if (!conta) return { erro: 'seller_alheio' };
  } else {
    conta = conexoes[0];
  }

  return {
    conta,
    executar: (fn) => comContaCliente(conta!.clienteId, conta!.sellerId, fn),
  };
}

/**
 * Açúcar sobre `resolverContaDoClienteLogado` que já roda `fn` no escopo do cliente. Devolve
 * `{ conta, resultado }` ou `{ erro }` — o handler traduz o erro em 401 (`sem_sessao`) ou 409
 * (`sem_conexao`/`seller_alheio`).
 */
export async function comContaDoClienteLogado<T>(
  sellerId: string | undefined,
  fn: () => Promise<T>,
): Promise<{ conta: ContaAtivaCliente; resultado: T } | { erro: ErroContaCliente }> {
  const r = await resolverContaDoClienteLogado(sellerId);
  if ('erro' in r) return r;
  const resultado = await r.executar(fn);
  return { conta: r.conta, resultado };
}

/** HTTP + mensagem padrão pra cada erro de resolução — usado por todas as rotas do portal. */
export function respostaErroConta(erro: ErroContaCliente): { status: number; mensagem: string } {
  if (erro === 'sem_sessao') {
    return { status: 401, mensagem: 'Faça login no portal para continuar.' };
  }
  if (erro === 'seller_alheio') {
    return { status: 409, mensagem: 'Essa conta do Mercado Livre não é sua.' };
  }
  return {
    status: 409,
    mensagem: 'Conecte uma conta do Mercado Livre no seu painel antes de criar anúncios.',
  };
}
