/**
 * Tipos e regras puras do catálogo.
 *
 * Fica separado de catalogo.ts de propósito: aquele arquivo chama a API e
 * arrasta o cliente do ML junto, o que impede tanto o teste em Node quanto o
 * import por um componente de tela. Aqui não há import de nada.
 */
import { normalizar } from '../normalizar.ts';
import type { Item } from './model';

export type AtributoProduto = {
  id?: string;
  name?: string;
  value_id?: string | null;
  value_name?: string | null;
};

export type BuyBoxWinner = {
  item_id?: string;
  seller_id?: number;
  price?: number;
  currency_id?: string;
  condition?: string;
  listing_type_id?: string;
  official_store_id?: number | null;
  shipping?: { free_shipping?: boolean; logistic_type?: string; mode?: string };
  seller?: { reputation_level_id?: string | null };
  tags?: string[];
};

export type ProdutoCatalogo = {
  id?: string;
  name?: string;
  family_name?: string;
  status?: string;
  domain_id?: string;
  permalink?: string;
  pictures?: { id?: string; url?: string; secure_url?: string }[] | null;
  attributes?: AtributoProduto[] | null;
  main_features?: { text?: string; type?: string }[] | null;
  short_description?: { type?: string; content?: string } | null;
  parent_id?: string | null;
  children_ids?: string[] | null;
  settings?: { listing_strategy?: string; exclusive?: boolean; content?: string } | null;
  buy_box_winner?: BuyBoxWinner | null;
  buy_box_winner_price_range?: {
    min?: { price?: number; currency_id?: string };
    max?: { price?: number; currency_id?: string };
  } | null;
  buy_box_activation_date?: string;
  date_created?: string;
};

export type ResultadoBusca = {
  id?: string;
  name?: string;
  status?: string;
  domain_id?: string;
  attributes?: AtributoProduto[];
  pictures?: { url?: string }[];
  children_ids?: string[];
  parent_id?: string;
  settings?: { listing_strategy?: string };
};

/* ------------------------------------------------------------------ *
 * Comparação de ficha: seu anúncio x o produto de catálogo
 * ------------------------------------------------------------------ */

export type LinhaComparacao = {
  id: string;
  nome: string;
  doCatalogo: string | null;
  doAnuncio: string | null;
  situacao: 'igual' | 'diferente' | 'falta' | 'extra';
};

// Wrapper que usa o normalizador compartilhado (remove pontuação + NFD + lower + trim)
function norm(v?: string | null): string {
  return normalizar(v ?? '', { removerPontuacao: true });
}

/**
 * Confronta a ficha do anúncio com a do produto de catálogo.
 *
 * Isto não é enfeite: a documentação do ML diz que o vendedor é responsável por
 * confirmar que o produto associado coincide, e que divergência gera reclamação,
 * cancelamento, queda de reputação e — nas palavras deles — inabilitação para
 * publicar em catálogo, podendo chegar a suspensão da conta. A tabela existe
 * para essa conferência ser feita de olho, antes.
 *
 * A comparação usa value_id quando os dois lados têm; senão compara o texto
 * normalizado. Atributo que só o anúncio tem entra como "extra" — não é
 * problema, o catálogo simplesmente não pede.
 */
export function compararFicha(item: Item, produto: ProdutoCatalogo): LinhaComparacao[] {
  const doAnuncio = new Map(
    (item.attributes ?? []).map((a) => [a.id, a] as const),
  );

  const linhas: LinhaComparacao[] = [];
  const vistos = new Set<string>();

  for (const a of produto.attributes ?? []) {
    if (!a.id) continue;
    vistos.add(a.id);
    const meu = doAnuncio.get(a.id);
    const valorCat = a.value_name ?? null;
    const valorMeu = meu?.value_id === '-1' ? null : (meu?.value_name ?? null);

    let situacao: LinhaComparacao['situacao'];
    if (!valorMeu) {
      situacao = 'falta';
    } else if (a.value_id && meu?.value_id) {
      situacao = a.value_id === meu.value_id ? 'igual' : 'diferente';
    } else {
      situacao = norm(valorCat) === norm(valorMeu) ? 'igual' : 'diferente';
    }

    linhas.push({
      id: a.id,
      nome: a.name ?? a.id,
      doCatalogo: valorCat,
      doAnuncio: valorMeu,
      situacao,
    });
  }

  for (const [id, a] of doAnuncio) {
    if (vistos.has(id) || a.value_id === '-1' || !a.value_name) continue;
    linhas.push({
      id,
      nome: a.name ?? id,
      doCatalogo: null,
      doAnuncio: a.value_name,
      situacao: 'extra',
    });
  }

  const ordem = { diferente: 0, falta: 1, igual: 2, extra: 3 } as const;
  return linhas.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.nome.localeCompare(b.nome));
}

/**
 * O produto está pronto para receber um anúncio?
 *
 * Duas regras da documentação, e as duas derrubam o opt-in se ignoradas:
 * só produto com status active aceita vínculo, e produto com children_ids
 * preenchido é PAI — genérico demais, nunca ativo, e o caminho é escolher um
 * dos filhos.
 */
export function prontoParaVincular(p: ProdutoCatalogo): {
  ok: boolean;
  motivo: string | null;
  ehPai: boolean;
} {
  const ehPai = !!(p.children_ids && p.children_ids.length > 0);
  if (ehPai) {
    return {
      ok: false,
      ehPai,
      motivo: `É um produto pai, que agrupa ${p.children_ids!.length} produtos específicos. Escolha um dos filhos — pai não pode ser comprado.`,
    };
  }
  if (p.status !== 'active') {
    return {
      ok: false,
      ehPai,
      motivo: `Está com status "${p.status ?? '—'}". Só produto ativo aceita vínculo.`,
    };
  }
  return { ok: true, motivo: null, ehPai };
}
