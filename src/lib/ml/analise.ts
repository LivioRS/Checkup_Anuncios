import { mlFetch, getAccount, MlError, type MlAccount } from './client';
import { blocoPorPosicao, CACHE_TENDENCIAS, type Termo } from './tendencias';
import type { Pergunta } from './perguntas';
import type { Item } from './model';

/**
 * Diagnóstico completo de um anúncio.
 * Cada bloco é independente: se um endpoint falhar (permissão, 404, item novo
 * demais para ter métrica), os outros continuam aparecendo na tela.
 */

/* ---------------------------------------------------------------- *
 * Qualidade oficial — /performance  (substituiu /health)
 * ---------------------------------------------------------------- */

export type Performance = {
  entity_type?: string;
  entity_id?: string;
  score?: number; // 0-100
  level?: string;
  level_wording?: string; // MLB: Básica | Satisfatória | Profissional
  calculated_at?: string;
  buckets?: {
    key?: string;
    title?: string;
    status?: string; // PENDING | COMPLETED
    score?: number;
    variables?: {
      key?: string; // PICTURES, TECHNICAL_SPECIFICATIONS_MAIN, TITLE, GTIN, FREE_SHIPPING...
      title?: string;
      status?: string;
      score?: number;
      rules?: {
        key?: string;
        status?: string;
        progress?: number;
        mode?: string; // OPPORTUNITY = ganho possível | WARNING = está tirando pontos
        wordings?: { title?: unknown; label?: unknown; link?: string };
      }[];
    }[];
  }[];
};

/* ---------------------------------------------------------------- *
 * Reputação de compra, opiniões, moderação
 * ---------------------------------------------------------------- */

export type PurchaseExperience = {
  // Vários desses campos vêm como objeto ({ text: "..." }) em alguns anúncios.
  reputation?: { color?: string; text?: unknown; value?: number };
  status?: { id?: string };
  title?: unknown;
  subtitles?: unknown[];
  metrics_details?: {
    problems?: Record<string, unknown>;
    distribution?: Record<string, unknown>;
  };
};

export type Reviews = {
  rating_average?: number;
  stars?: number;
  rating_levels?: {
    one_star?: number;
    two_star?: number;
    three_star?: number;
    four_star?: number;
    five_star?: number;
  };
  paging?: { total?: number; total_pageable?: number };
  reviews?: { title?: string; content?: string; rate?: number; date_created?: string }[];
};

export type Moderacao = {
  name?: string;
  id?: string;
  date_created?: string;
  evidences?: { text_matched?: string; section_name?: string }[];
  wordings?: { type?: string; value?: unknown; title?: unknown }[];
};

export type Infracao = {
  id?: string;
  date_created?: string;
  related_item_id?: string;
  filter_subgroup?: string;
  reason?: unknown;
  remedy?: unknown;
};

/* ---------------------------------------------------------------- *
 * Números e tarifas
 * ---------------------------------------------------------------- */

export type Visitas = {
  total_visits?: number;
  results?: { date?: string; total?: number }[];
};

export type Tarifas = {
  listing_fee_amount?: number;
  sale_fee_amount?: number;
  sale_fee_details?: {
    fixed_fee?: number;
    percentage_fee?: number;
    gross_amount?: number;
  };
  listing_type_name?: string;
  listing_exposure?: string;
};

export type Descricao = { plain_text?: string; text?: string; last_updated?: string };

export type Frete = {
  coverage?: {
    all_country?: { list_cost?: number; currency_id?: string; billable_weight?: number };
    discount?: { rate?: number; type?: string; promoted_amount?: number };
  };
};

export type Vendedor = {
  id?: number;
  nickname?: string;
  registration_date?: string;
  permalink?: string;
  tags?: string[];
  seller_reputation?: {
    level_id?: string; // ex.: "5_green"
    power_seller_status?: string; // platinum | gold | silver
    transactions?: {
      period?: string;
      total?: number;
      completed?: number;
      canceled?: number;
      ratings?: { positive?: number; negative?: number; neutral?: number };
    };
    /** Reclamações, atrasos e cancelamentos: cada um com valor absoluto e taxa. */
    metrics?: {
      claims?: { period?: string; rate?: number; value?: number };
      delayed_handling_time?: { period?: string; rate?: number; value?: number };
      cancellations?: { period?: string; rate?: number; value?: number };
      sales?: { period?: string; completed?: number };
    };
  };
  status?: { list?: { allow?: boolean } };
};

export type DiagnosticoImagem = {
  picture_id: string;
  url?: string;
  size?: string;
  /** Texto legível de cada apontamento. Vazio = imagem sem problema. */
  problemas: string[];
  /**
   * Identificadores técnicos do que o ML apontou: white_background,
   * minimum_size, text_logo, watermark. É por aqui que o painel decide se
   * pode oferecer o fundo branco — em vez de assumir que toda foto precisa.
   */
  nomes: string[];
  erro?: string;
};

export type Diagnostico = {
  item: Item;
  performance?: Performance;
  experiencia?: PurchaseExperience;
  reviews?: Reviews;
  moderacao?: Moderacao;
  infracoes: Infracao[];
  visitas?: Visitas;
  vendas?: { pedidos: number; janelaDias: number };
  tarifas?: Tarifas;
  frete?: Frete;
  descricao?: Descricao;
  vendedor?: Vendedor;
  erros: Record<string, string>;
};

/* ---------------------------------------------------------------- *
 * Coleta
 * ---------------------------------------------------------------- */

async function tentar<T>(
  erros: Record<string, string>,
  chave: string,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof MlError) {
      // 404 aqui é normal: item novo ainda não tem métrica, anúncio sem moderação etc.
      erros[chave] = e.status === 404 ? 'sem dados para este anúncio' : `HTTP ${e.status}`;
    } else {
      erros[chave] = e instanceof Error ? e.message : String(e);
    }
    return undefined;
  }
}

const JANELA_DIAS = 150; // teto da API de visitas

export async function carregarDiagnostico(
  itemId: string,
  opts: { ehMinha?: boolean; item?: Item; conta?: MlAccount | null } = {},
): Promise<Diagnostico> {
  const erros: Record<string, string> = {};
  const item = opts.item ?? await mlFetch<Item>(`/items/${itemId}`);
  const conta = opts.conta ?? await getAccount();
  const upId = item.user_product_id ?? null;

  // Anúncio de terceiro: nota de qualidade, moderação, infrações, vendas e
  // frete exigem ser o dono. Nem tentamos — evita chamada certa de dar 401 e
  // deixa claro na tela por que o bloco não veio.
  const minha = opts.ehMinha !== false;
  const soDono = <T>(chave: string, fn: () => Promise<T>) =>
    minha
      ? tentar(erros, chave, fn)
      : Promise.resolve(((erros[chave] = 'só o dono do anúncio vê isso'), undefined));

  const [
    performance,
    experiencia,
    reviews,
    moderacao,
    infracoesRaw,
    visitas,
    vendas,
    tarifas,
    frete,
    descricao,
    vendedor,
  ] = await Promise.all([
    // Itens migrados para User Product respondem pela rota UP
    soDono('performance', () =>
      upId
        ? mlFetch<Performance>(`/user-product/${upId}/performance`)
        : mlFetch<Performance>(`/item/${itemId}/performance`),
    ),
    soDono('experiencia', () =>
      upId
        ? mlFetch<PurchaseExperience>(
            `/reputation/user_products/${upId}/purchase_experience/integrators?locale=pt_BR`,
          )
        : mlFetch<PurchaseExperience>(
            `/reputation/items/${itemId}/purchase_experience/integrators?locale=pt_BR`,
          ),
    ),
    tentar(erros, 'reviews', () => mlFetch<Reviews>(`/reviews/item/${itemId}`)),
    // O id de moderação é o id do item + "-ITM"
    soDono('moderacao', () =>
      mlFetch<Moderacao>(`/moderations/last_moderation/${itemId}-ITM`),
    ),
    soDono('infracoes', () =>
      conta
        ? mlFetch<{ results?: Infracao[] }>(
            `/moderations/infractions/${conta.seller_id}?language=PT&limit=20&sort=date_created_desc`,
          )
        : Promise.resolve({ results: [] }),
    ),
    // Visitas: 1 item por chamada e no máximo 150 dias
    tentar(erros, 'visitas', () =>
      mlFetch<Visitas>(`/items/${itemId}/visits/time_window?last=${JANELA_DIAS}&unit=day`),
    ),
    soDono('vendas', async () => {
      if (!conta) return { pedidos: 0, janelaDias: JANELA_DIAS };
      const desde = new Date(Date.now() - JANELA_DIAS * 864e5).toISOString().slice(0, 19) + '.000-00:00';
      const p = new URLSearchParams({
        seller: conta.seller_id,
        item: itemId,
        'order.date_created.from': desde,
        limit: '1',
      });
      const r = await mlFetch<{ paging?: { total?: number } }>(`/orders/search?${p.toString()}`);
      return { pedidos: r.paging?.total ?? 0, janelaDias: JANELA_DIAS };
    }),
    tentar(erros, 'tarifas', () => {
      if (!item.price || !item.listing_type_id) throw new Error('item sem preço ou tipo de anúncio');
      // logistic_type e shipping_mode são obrigatórios na prática: sem eles,
      // a taxa fixa retornada não bate com a que o ML realmente cobra.
      const p = new URLSearchParams({
        price: String(item.price),
        category_id: item.category_id,
        currency_id: item.currency_id ?? 'BRL',
        listing_type_id: item.listing_type_id,
      });
      if (item.shipping?.logistic_type) p.set('logistic_type', item.shipping.logistic_type);
      if (item.shipping?.mode) p.set('shipping_mode', item.shipping.mode);
      return mlFetch<Tarifas>(`/sites/MLB/listing_prices?${p.toString()}`);
    }),
    // Custo de frete que o vendedor paga, simulado para 1 unidade
    soDono('frete', () => {
      if (!conta) throw new Error('sem conta');
      const p = new URLSearchParams({
        item_id: itemId,
        free_shipping: String(!!item.shipping?.free_shipping),
        verbose: 'true',
      });
      return mlFetch<Frete>(`/users/${conta.seller_id}/shipping_options/free?${p.toString()}`);
    }),
    tentar(erros, 'descricao', () => mlFetch<Descricao>(`/items/${itemId}/description`)),
    // Sempre o vendedor do anúncio aberto — se for de terceiro, é o dele.
    tentar(erros, 'vendedor', () =>
      item.seller_id
        ? mlFetch<Vendedor>(`/users/${item.seller_id}`)
        : conta
          ? mlFetch<Vendedor>(`/users/${conta.seller_id}`)
          : Promise.resolve({} as Vendedor),
    ),
  ]);

  const infracoes = ((infracoesRaw as { results?: Infracao[] } | undefined)?.results ?? []).filter(
    (i) => !i.related_item_id || i.related_item_id === itemId,
  );

  return {
    item,
    performance,
    experiencia,
    reviews,
    moderacao,
    infracoes,
    visitas,
    vendas,
    tarifas,
    frete,
    descricao,
    vendedor,
    erros,
  };
}

/* ---------------------------------------------------------------- *
 * Diagnóstico de imagens (sob demanda: 1 chamada por foto)
 * ---------------------------------------------------------------- */

type RespostaDiagnostico = {
  diagnostics?: {
    picture_type?: string;
    action?: string; // 'diagnostic' = tem problema | 'empty' = ok
    detections?: { name?: string; wordings?: { value?: string }[] }[];
  }[];
};

export async function diagnosticarImagens(item: Item): Promise<DiagnosticoImagem[]> {
  const fotos = item.pictures ?? [];

  return Promise.all(
    fotos.map(async (foto, i) => {
      const base: DiagnosticoImagem = {
        picture_id: foto.id,
        url: foto.secure_url ?? foto.url,
        size: foto.max_size ?? foto.size,
        problemas: [],
        nomes: [],
      };
      try {
        const r = await mlFetch<RespostaDiagnostico>('/moderations/pictures/diagnostic', {
          method: 'POST',
          body: JSON.stringify({
            picture_id: foto.id,
            context: {
              category_id: item.category_id,
              title: item.title,
              picture_type: i === 0 ? 'thumbnail' : 'other',
            },
          }),
        });
        for (const d of r.diagnostics ?? []) {
          if (d.action !== 'diagnostic') continue;
          for (const det of d.detections ?? []) {
            const texto = det.wordings?.[0]?.value ?? det.name ?? 'problema não identificado';
            if (!base.problemas.includes(texto)) base.problemas.push(texto);
            if (det.name && !base.nomes.includes(det.name)) base.nomes.push(det.name);
          }
        }
      } catch (e) {
        base.erro = e instanceof MlError ? `HTTP ${e.status}` : String(e);
      }
      return base;
    }),
  );
}

/**
 * Palavras buscadas na categoria (/trends). Ver src/lib/ml/tendencias.ts para
 * o significado dos três blocos e o cruzamento com o título.
 */
export async function tendenciasDaCategoria(
  categoryId: string,
  site = 'MLB',
): Promise<Termo[]> {
  const bruto = await mlFetch<{ keyword?: string; url?: string }[]>(
    `/trends/${site}/${encodeURIComponent(categoryId)}`,
    { revalidate: CACHE_TENDENCIAS },
  );
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((t) => t?.keyword)
    .map((t, i) => ({ keyword: t.keyword as string, url: t.url, bloco: blocoPorPosicao(i), posicao: i + 1 }));
}

/**
 * Perguntas reais feitas neste anúncio. Só o dono enxerga; em anúncio de
 * terceiro volta vazio. Ver src/lib/ml/perguntas.ts para o agrupamento.
 */
type RespostaPerguntas = {
  total?: number;
  questions?: {
    text?: string;
    date_created?: string;
    status?: string;
    answer?: { text?: string; status?: string } | null;
  }[];
};

export async function perguntasDoAnuncio(itemId: string, limite = 40): Promise<Pergunta[]> {
  try {
    const r = await mlFetch<RespostaPerguntas>(
      `/questions/search?item_id=${encodeURIComponent(itemId)}&api_version=4&limit=${limite}`,
    );
    return (r.questions ?? [])
      // Pergunta banida ou apagada não representa dúvida real de comprador.
      .filter((q) => q.text && q.status !== 'DELETED' && q.status !== 'BANNED')
      .map((q) => ({
        texto: (q.text ?? '').trim(),
        resposta:
          q.answer?.status === 'ACTIVE' && q.answer.text?.trim() ? q.answer.text.trim() : null,
        data: q.date_created,
      }))
      .filter((q) => q.texto.length > 3);
  } catch {
    return [];
  }
}

