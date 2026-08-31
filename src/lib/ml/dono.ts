import 'server-only';
import { mlFetch, contaDoAnuncio, listarContas, comConta, type MlAccount } from './client';
import type { Item } from './model';

/**
 * Abre um anúncio descobrindo sozinho qual conta consegue lê-lo.
 *
 * Existe um nó aqui: para saber de quem é o anúncio é preciso lê-lo, mas o
 * Mercado Livre recusa (403) a leitura de item que não é do token usado. A
 * saída é tentar com a conta padrão e, se ela for barrada, percorrer as demais
 * contas cadastradas — a primeira que conseguir ler é a dona.
 */
export class SemAcesso extends Error {
  constructor(
    public itemId: string,
    public contasTentadas: string[],
  ) {
    super(
      `O Mercado Livre recusou a leitura de ${itemId} com todas as contas cadastradas: ${contasTentadas.join(', ')}.`,
    );
  }
}

/**
 * Última tentativa antes de desistir: o multiget.
 *
 * `/items?ids=` responde num envelope com código por item e devolve o que é
 * público — em vários casos ele entrega um anúncio de terceiro que o
 * `/items/{id}` recusa com 403. Não é a mesma coisa que ler o anúncio inteiro:
 * vem menos campo, e é por isso que quem chama precisa saber que é parcial.
 */
async function tentarPublico(itemId: string): Promise<Item | null> {
  try {
    const res = await mlFetch<{ code: number; body: Item }[]>(
      `/items?ids=${encodeURIComponent(itemId)}`,
    );
    const linha = Array.isArray(res) ? res[0] : null;
    return linha?.code === 200 && linha.body?.id ? linha.body : null;
  } catch {
    return null;
  }
}

export async function abrirAnuncio(
  itemId: string,
  opts: { internos?: boolean } = {},
): Promise<{ item: Item; conta: MlAccount | null; parcial?: boolean }> {
  const sufixo = opts.internos ? '?include_internal_attributes=true' : '';
  const caminho = `/items/${itemId}${sufixo}`;

  // 1. Tentativa com a conta padrão. Cobre o caso comum sem chamada extra.
  try {
    const item = await mlFetch<Item>(caminho);
    return { item, conta: await contaDoAnuncio(item.seller_id) };
  } catch (primeiroErro) {
    // 2. Barrado: procura entre as contas cadastradas qual consegue ler.
    const contas = await listarContas().catch(() => []);
    const tentadas: string[] = [];
    for (const c of contas) {
      tentadas.push(c.apelido ?? c.seller_id);
      try {
        const item = await comConta(c.seller_id, () => mlFetch<Item>(caminho));
        return { item, conta: await contaDoAnuncio(item.seller_id) };
      } catch {
        // Não é dessa conta: tenta a próxima.
      }
    }
    // 3. Nenhuma conta abriu. Antes de desistir, tenta o que é público.
    const publico = await tentarPublico(itemId);
    if (publico) return { item: publico, conta: null, parcial: true };

    // Dizer QUAIS contas foram tentadas transforma um 403 seco em diagnóstico.
    if (tentadas.length) throw new SemAcesso(itemId, tentadas);
    throw primeiroErro;
  }
}

/**
 * Confere se o token guardado em cada linha de `contas` pertence mesmo àquele
 * seller_id. Um token válido, porém de OUTRO usuário, é a causa mais comum de
 * 403 num anúncio que sabidamente é seu — e é invisível sem essa checagem.
 */
export async function conferirTokens(): Promise<
  { linha: string; sellerId: string; tokenDe: string | null; confere: boolean; erro?: string }[]
> {
  const contas = await listarContas().catch(() => []);
  const saida = [];
  for (const c of contas) {
    try {
      const me = await comConta(c.seller_id, () =>
        mlFetch<{ id?: number; nickname?: string }>('/users/me'),
      );
      const tokenDe = me?.id != null ? String(me.id) : null;
      saida.push({
        linha: c.apelido ?? c.seller_id,
        sellerId: String(c.seller_id),
        tokenDe,
        confere: tokenDe === String(c.seller_id),
      });
    } catch (e) {
      saida.push({
        linha: c.apelido ?? c.seller_id,
        sellerId: String(c.seller_id),
        tokenDe: null,
        confere: false,
        erro: e instanceof Error ? e.message.slice(0, 120) : String(e),
      });
    }
  }
  return saida;
}

/** Igual ao acima, mas devolve só a conta — para as rotas que gravam. */
export async function donoDoAnuncio(
  itemId: string,
): Promise<{ item: Item | null; conta: MlAccount | null }> {
  try {
    return await abrirAnuncio(itemId);
  } catch {
    return { item: null, conta: null };
  }
}
