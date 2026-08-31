import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ML_API } from '../env';
import { db } from '../supabase';
import { refreshAccessToken } from './oauth';

/**
 * Os tokens ficam na tabela `contas`, a MESMA que os robôs do dashboard-ml-bot usam.
 * Isso é obrigatório, não é preferência: o refresh_token do ML é de uso único por
 * client_id + usuário, então dois lugares guardando o token derrubariam um ao outro.
 *
 * contas: id, seller_id, apelido, observacao, criado_em, refresh_token,
 *         atualizado_em, access_token, access_expira_em, org
 */

export type MlAccount = {
  id: number;
  seller_id: string;
  apelido: string | null;
  org: string | null;
  access_token: string;
  refresh_token: string;
  access_expira_em: string | null;
};

const CAMPOS = 'id, seller_id, apelido, org, access_token, refresh_token, access_expira_em';

/**
 * Conta usada nas chamadas do bloco atual.
 *
 * O painel não pede para você escolher a conta: ele lê o anúncio, olha o
 * seller_id e, se for de uma das contas cadastradas, passa a usar o token dela.
 * Anúncio de terceiro continua abrindo com o token que houver — o ML entrega o
 * que é público e recusa o resto, e a tela avisa quais blocos ficaram de fora.
 */
const escopo = new AsyncLocalStorage<{ sellerId?: string; contaCache?: MlAccount | null }>();

export function comConta<T>(sellerId: string | undefined, fn: () => Promise<T>): Promise<T> {
  return escopo.run({ sellerId, contaCache: null }, fn);
}

/** Procura nas contas cadastradas a dona daquele seller_id. */
export async function contaDoAnuncio(sellerId?: number | string | null): Promise<MlAccount | null> {
  if (sellerId === undefined || sellerId === null) return null;
  const { data, error } = await db()
    .from('contas')
    .select(CAMPOS)
    .eq('seller_id', String(sellerId))
    .not('access_token', 'is', null)
    .limit(1);
  if (error) return null;
  return (data?.[0] as MlAccount | undefined) ?? null;
}

/** Contas do ML disponíveis (as que têm token). */
export async function listarContas(): Promise<Pick<MlAccount, 'id' | 'seller_id' | 'apelido' | 'org'>[]> {
  const { data, error } = await db()
    .from('contas')
    .select('id, seller_id, apelido, org')
    .not('access_token', 'is', null)
    .order('id');
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data ?? [];
}

/**
 * Conta ativa: a do escopo (dona do anúncio aberto), senão a de
 * ML_SELLER_ID_PADRAO, senão a primeira com token.
 * Memoizada por request via `escopo` para evitar múltiplas consultas à `contas`.
 */
export async function getAccount(): Promise<MlAccount | null> {
  const store = escopo.getStore();
  if (store?.contaCache) return store.contaCache;

  const escolhida =
    store?.sellerId || process.env.ML_SELLER_ID_PADRAO || null;

  let q = db().from('contas').select(CAMPOS).not('access_token', 'is', null);
  if (escolhida) q = q.eq('seller_id', escolhida);

  const { data, error } = await q.order('id').limit(1);
  if (error) throw new Error(`Supabase: ${error.message}`);
  const conta = (data?.[0] as MlAccount | undefined) ?? null;

  if (store) store.contaCache = conta;
  return conta;
}

/** Invalida o cache da conta no escopo atual (chamado após saveTokens). */
function invalidarContaCache(): void {
  const store = escopo.getStore();
  if (store) store.contaCache = null;
}

/** Grava o par novo na MESMA linha de `contas`, para os robôs continuarem válidos. */
export async function saveTokens(input: {
  seller_id: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}) {
  const access_expira_em = new Date(Date.now() + input.expires_in * 1000).toISOString();
  const { error } = await db()
    .from('contas')
    .update({
      access_token: input.access_token,
      refresh_token: input.refresh_token,
      access_expira_em,
      atualizado_em: new Date().toISOString(),
    })
    .eq('seller_id', input.seller_id);
  if (error) throw new Error(`Supabase: ${error.message}`);
  invalidarContaCache();
}

/**
 * O refresh_token do ML é de USO ÚNICO. Se duas chamadas de um mesmo request
 * refrescarem em paralelo com o mesmo token guardado, uma queima a outra
 * (`invalid_grant`). Este dedup garante que só UMA renovação roda por seller_id
 * por vez — as demais esperam a mesma promessa e reusam o token novo.
 *
 * Sempre re-lê a linha de `contas` antes de renovar: um snapshot passado pode
 * guardar um refresh_token que outra chamada já consumiu.
 */
const refreshEmVoo = new Map<string, Promise<void>>();

async function refrescarUmaVez(sellerId: string): Promise<string> {
  const chave = String(sellerId);
  let p = refreshEmVoo.get(chave);
  if (!p) {
    p = (async () => {
      const atual = await getAccount();
      if (!atual) throw new MlError(401, null, 'Nenhuma conta do Mercado Livre com token em `contas`.');
      const t = await refreshAccessToken(atual.refresh_token);
      await saveTokens({
        seller_id: atual.seller_id,
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_in: t.expires_in,
      });
    })().finally(() => refreshEmVoo.delete(chave));
    refreshEmVoo.set(chave, p);
  }
  await p;
  const renovada = await getAccount();
  if (!renovada) throw new MlError(401, null, 'Conta sumiu após refresh.');
  return renovada.access_token;
}

async function validToken(conta: MlAccount): Promise<string> {
  const margemMs = 10 * 60 * 1000; // renova 10 min antes de expirar
  const expira = conta.access_expira_em ? new Date(conta.access_expira_em).getTime() : 0;
  if (expira - margemMs > Date.now()) return conta.access_token;

  return refrescarUmaVez(conta.seller_id);
}

export class MlError extends Error {
  constructor(
    public status: number,
    public body: unknown,
    message: string,
  ) {
    super(message);
  }
}

type FetchOpts = RequestInit & { revalidate?: number };

/** Chamada autenticada à API do ML, com refresh automático e 1 retry em 401. */
export async function mlFetch<T = unknown>(path: string, opts: FetchOpts = {}): Promise<T> {
  const conta = await getAccount();
  if (!conta) throw new MlError(401, null, 'Nenhuma conta do Mercado Livre com token em `contas`.');

  const { revalidate, ...init } = opts;
  const run = async (token: string) =>
    fetch(path.startsWith('http') ? path : `${ML_API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        accept: 'application/json',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
      ...(revalidate !== undefined
        ? { next: { revalidate } }
        : { cache: 'no-store' as RequestCache }),
    });

  let res = await run(await validToken(conta));

  if (res.status === 401) {
    const t = await refrescarUmaVez(conta.seller_id);
    res = await run(t);
  }

  const text = await res.text();
  const body = text ? safeJson(text) : null;
  if (!res.ok) {
    throw new MlError(res.status, body, `ML ${res.status} em ${path}: ${text.slice(0, 600)}`);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
