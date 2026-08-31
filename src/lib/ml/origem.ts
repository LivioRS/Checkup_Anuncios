import { normalizar } from '../normalizar.ts';
import type { CategoryAttribute, Item } from './model';

/**
 * A origem do produto na ficha técnica.
 *
 * O ML não usa um id único para isso: dependendo da categoria vem ORIGIN,
 * COUNTRY_OF_ORIGIN, MADE_IN. Por isso a busca é por id conhecido E por nome
 * do atributo — categoria nova com nome "País de origem" continua sendo pega.
 */
const IDS = new Set([
  'ORIGIN',
  'COUNTRY_OF_ORIGIN',
  'MADE_IN',
  'MANUFACTURING_COUNTRY',
  'PRODUCT_ORIGIN',
]);

function pareceOrigem(id: string, nome?: string): boolean {
  if (IDS.has(id)) return true;
  const n = normalizar(nome ?? '', { removerPontuacao: true, removerConectivos: false });
  return n.includes('origem') || n.includes('pais de fabric') || n.includes('fabricado em');
}

export type Origem = {
  /** A categoria tem campo de origem? Se não tiver, não há o que exigir. */
  existe: boolean;
  id: string | null;
  nome: string;
  valor: string | null;
  /** Marcado como "não se aplica" — para origem, isso não vale como preenchido. */
  na: boolean;
};

export function origemDoItem(item: Item, catAttrs: CategoryAttribute[] = []): Origem {
  const doCatalogo = catAttrs.find((a) => pareceOrigem(a.id, a.name));
  const doItem = (item.attributes ?? []).find((a) => pareceOrigem(a.id, a.name));

  const id = doCatalogo?.id ?? doItem?.id ?? null;
  const nome = doCatalogo?.name ?? doItem?.name ?? 'Origem';

  // Sem o atributo na categoria E sem ele no item, não existe campo de origem.
  if (!id) return { existe: false, id: null, nome, valor: null, na: false };

  const na = doItem?.value_id === '-1';

  /**
   * O valor pode chegar de duas formas: como texto (`value_name`) ou só como
   * `value_id`, quando o atributo é lista. Ler apenas o texto fazia o painel
   * dizer "vazio" num campo que você tinha acabado de preencher — porque o que
   * voltou foi o id. Aqui o id é resolvido contra os valores da categoria.
   */
  let valor: string | null = null;
  if (!na) {
    if (doItem?.value_name?.trim()) {
      valor = doItem.value_name.trim();
    } else if (doItem?.value_id) {
      const daLista = (doCatalogo?.values ?? []).find((v) => v.id === doItem.value_id);
      valor = daLista?.name?.trim() || null;
    }
  }

  return { existe: true, id, nome, valor, na };
}

/**
 * Pode publicar a descrição?
 *
 * Origem é informação obrigatória para o comprador — e é o tipo de campo que
 * fica em branco para sempre se ninguém for cobrado. A cobrança acontece aqui,
 * na hora de publicar, e aponta para a ficha: é lá que o dado tem de morar,
 * não escrito no meio do texto da descrição.
 */
export function origemPendente(o: Origem): boolean {
  return o.existe && !o.valor;
}
