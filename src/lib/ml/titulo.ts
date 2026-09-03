import 'server-only';
import { getCategoryAttributes } from './attributes';
import { tendenciasDaCategoria } from './analise';
import { cruzarComTitulo } from './tendencias';
import { perguntarAoClaude, promptTitulo, lerPlanoTitulo } from '../ia';
import type { Item } from './model';

/**
 * Motor da proposta de título (AGENTS.md §11 — não importa Supabase).
 *
 * É literalmente o corpo do `POST` de `src/app/api/titulo/[id]/route.ts`, movido
 * para cá sem reescrever, para o worker de lote (plano 025, f2c2) poder gerar a
 * MESMA proposta que a tela gera para um anúncio só. A rota virou um wrapper
 * fino que só converte `{ status, corpo }` em `NextResponse`.
 *
 * `POST` só pensa: devolve 1-3 títulos + uma sugestão de MODEL. Não grava nada —
 * a gravação continua no `PUT` da rota, revisada, um anúncio por vez.
 *
 * Roda sempre dentro de um `comConta(...)` (quem chama abre o escopo): a leitura
 * de tendências e atributos da categoria usa o token da conta dona do anúncio.
 */

export type ResultadoPropostaTitulo = {
  status: number;
  corpo: Record<string, unknown>;
};

export async function gerarPropostaTitulo(
  item: Item,
  opts: { temConta: boolean },
): Promise<ResultadoPropostaTitulo> {
  const termos = await tendenciasDaCategoria(item.category_id, item.site_id ?? 'MLB').catch(
    () => [],
  );
  if (!termos.length) {
    return {
      status: 422,
      corpo: {
        erro: `O Mercado Livre não publica tendências para a categoria ${item.category_id}.`,
      },
    };
  }

  const atributos: { nome: string; valor: string }[] = [];
  let modeloAtual: string | null = null;
  let limiteModelo: number | null = null;
  try {
    const catAttrs = await getCategoryAttributes(item.category_id);
    limiteModelo = catAttrs.find((a) => a.id === 'MODEL')?.value_max_length ?? null;
    const nomes = new Map(catAttrs.map((a) => [a.id, a.name]));
    for (const a of item.attributes ?? []) {
      if (!a.value_name || a.value_id === '-1') continue;
      if (a.id === 'MODEL') modeloAtual = a.value_name;
      atributos.push({ nome: (nomes.get(a.id) ?? a.name ?? a.id) as string, valor: a.value_name });
    }
  } catch {
    /* ignore */
  }

  const { dentro } = cruzarComTitulo(item.title ?? '', termos);
  const porBloco = (b: string) => termos.filter((t) => t.bloco === b).map((t) => t.keyword);

  const bruto = await perguntarAoClaude(
    promptTitulo({
      titulo: item.title ?? '',
      categoria: item.category_id,
      atributos,
      modeloAtual,
      emAlta: porBloco('crescimento'),
      maisBuscadas: porBloco('buscadas'),
      populares: porBloco('populares'),
      jaNoTitulo: dentro.map((t) => t.keyword),
      limiteModelo: limiteModelo ?? 60,
    }),
    3000,
  );

  const plano = lerPlanoTitulo(bruto);
  if (!plano) {
    return {
      status: 502,
      corpo: { erro: 'Não consegui interpretar a resposta.', bruto: bruto.slice(0, 500) },
    };
  }

  return {
    status: 200,
    corpo: {
      plano,
      atual: item.title ?? '',
      modeloAtual,
      limiteModelo,
      podeGravar: opts.temConta && !item.catalog_listing,
      catalogo: !!item.catalog_listing,
    },
  };
}
