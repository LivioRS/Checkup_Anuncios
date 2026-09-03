import 'server-only';
import { mlFetch, comConta, getAccount } from './client';
import { getCategoryAttributes } from './attributes';
import { agruparPerguntas } from './perguntas';
import { tendenciasDaCategoria, perguntasDoAnuncio } from './analise';
import { origemDoItem } from './origem';
import type { Item } from './model';
import {
  perguntarAoClaude,
  limparParaDescricao,
  grudarBlocos,
  promptNotas,
  promptMelhoria,
  lerNotas,
  notaGeral,
  type AtributoResumo,
  type ContextoAnuncio,
  type Notas,
} from '../ia';

/**
 * Motor da proposta de descrição (AGENTS.md §11 — não importa Supabase; o único
 * acesso a `loja_blocos` entra por `carregarBlocos`, injetado por quem chama).
 *
 * É o corpo do `POST` de `src/app/api/descricao/[id]/route.ts` movido sem
 * reescrever, para o worker de lote (plano 025, f2c2) reusar a MESMA geração.
 * A rota virou wrapper fino: resolve a conta dona (`abrirAnuncio`), passa
 * `lerBlocosDaLoja` como `carregarBlocos`, e converte `{ status, corpo }` em
 * `NextResponse`.
 *
 * `POST` só pensa (analisa a descrição atual ou devolve uma sugestão nova). Quem
 * grava no ML é o `PUT` da rota — revisado, um anúncio por vez.
 */

export async function textoAtual(itemId: string): Promise<string> {
  try {
    const d = await mlFetch<{ plain_text?: string }>(`/items/${itemId}/description`);
    return d.plain_text ?? '';
  } catch {
    return '';
  }
}

export async function montarContexto(itemId: string, item: Item): Promise<ContextoAnuncio> {
  const descricao = await textoAtual(itemId);

  let atributos: AtributoResumo[] = [];
  try {
    const catAttrs = await getCategoryAttributes(item.category_id);
    const nomes = new Map(catAttrs.map((a) => [a.id, a.name]));
    atributos = (item.attributes ?? [])
      .filter((a) => a.value_name && a.value_id !== '-1')
      .map((a) => ({ nome: nomes.get(a.id) ?? a.name ?? a.id, valor: a.value_name ?? '' }));
  } catch {
    /* segue sem ficha */
  }

  let opinioes: string[] = [];
  try {
    const r = await mlFetch<{ reviews?: { title?: string; content?: string }[] }>(
      `/reviews/item/${itemId}`,
    );
    opinioes = (r.reviews ?? [])
      .map((o) => [o.title, o.content].filter(Boolean).join(' — '))
      .filter((t) => t.length > 15)
      .slice(0, 8);
  } catch {
    /* item sem opiniões */
  }

  const perguntas = agruparPerguntas(await perguntasDoAnuncio(itemId)).slice(0, 15);

  let termosBuscados: string[] = [];
  try {
    const termos = await tendenciasDaCategoria(item.category_id, item.site_id ?? 'MLB');
    termosBuscados = termos.map((t) => t.keyword);
  } catch {
    /* categoria sem tendências publicadas */
  }

  return {
    titulo: item.title,
    categoria: item.category_id,
    atributos,
    descricao,
    opinioes,
    fotos: (item.pictures ?? []).length,
    perguntas,
    termosBuscados,
    loja: '',
  };
}

export type EntradaPropostaDescricao = {
  itemId: string;
  item: Item;
  /** `seller_id` da conta dona do anúncio (ou undefined se anúncio de terceiro). */
  donaSellerId: string | undefined;
  /** Nome de vitrine — hoje o motor não usa (montarContexto zera `loja`); mantido para paridade. */
  loja: string;
  body: {
    acao?: string;
    notas?: Notas;
    fontes?: string;
    blocos?: { sobre?: string; garantia?: string };
    origem?: string;
  };
  /** Lê os blocos fixos da loja (`loja_blocos`). Injetado — o motor não fala com o Supabase. */
  carregarBlocos: (sellerId?: string) => Promise<{ sobre?: string; garantia?: string }>;
};

export type ResultadoPropostaDescricao = {
  status: number;
  corpo: Record<string, unknown>;
};

export async function gerarPropostaDescricao(
  entrada: EntradaPropostaDescricao,
): Promise<ResultadoPropostaDescricao> {
  const { itemId, item, donaSellerId, body, carregarBlocos } = entrada;

  const contexto = await comConta(donaSellerId, () => montarContexto(itemId, item));
  contexto.fontes = body.fontes;

  const catAttrs = await comConta(donaSellerId, () =>
    getCategoryAttributes(item.category_id).catch(() => []),
  );
  const origem = origemDoItem(item, catAttrs);
  const contextoComOrigem = {
    ...contexto,
    origem: origem.valor ?? ((body.origem ?? '').trim() || undefined),
  };

  if (body.acao === 'analisar') {
    const bruto = await perguntarAoClaude(promptNotas(contextoComOrigem), 2000);
    const notas = lerNotas(bruto);
    if (!notas) {
      return {
        status: 502,
        corpo: {
          erro: 'Não consegui interpretar a resposta da análise.',
          bruto: bruto.slice(0, 500),
        },
      };
    }
    return { status: 200, corpo: { notas, geral: notaGeral(notas), atual: contexto.descricao } };
  }

  const conta = await getAccount().catch(() => null);

  const daTela = body.blocos ?? {};
  const salvos = await carregarBlocos(conta?.seller_id);
  const blocos = {
    sobre: (daTela.sobre ?? '').trim() || salvos.sobre,
    garantia: (daTela.garantia ?? '').trim() || salvos.garantia,
  };
  const bruto = await perguntarAoClaude(
    promptMelhoria(contextoComOrigem, body.notas ?? null, blocos),
    4000,
  );

  return {
    status: 200,
    corpo: {
      sugestao: grudarBlocos(limparParaDescricao(bruto), blocos),
      atual: contexto.descricao,
      usouBlocos: !!(blocos.sobre || blocos.garantia),
      blocos,
    },
  };
}
