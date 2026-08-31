/* ------------------------------------------------------------------ *
 * Tipos crus da API
 * ------------------------------------------------------------------ */

export type ValueType = 'string' | 'number' | 'number_unit' | 'boolean' | 'list';

export type AttrValue = {
  id?: string | null;
  name?: string | null;
  metadata?: Record<string, unknown> | null;
};

/** GET /categories/{id}/attributes — aqui `tags` é um OBJETO. */
export type CategoryAttribute = {
  id: string;
  name: string;
  value_type: ValueType;
  value_max_length?: number;
  tags?: Record<string, boolean>;
  type?: string;
  values?: AttrValue[];
  suggested_values?: AttrValue[];
  allowed_units?: { id: string; name: string }[];
  default_unit?: string;
  attribute_group_id?: string;
  attribute_group_name?: string;
  hint?: string;
  tooltip?: string;
};

/** GET /categories/{id}/technical_specs/input — aqui `tags` é um ARRAY de strings. */
export type SpecsInput = {
  groups?: {
    id: string;
    label: string;
    relevance?: number;
    components?: {
      component: string; // COMBO | TEXT_INPUT | ...
      label?: string;
      ui_config?: { allow_custom_value?: boolean; allow_filtering?: boolean };
      attributes?: {
        id: string;
        name: string;
        value_type: ValueType;
        value_max_length?: number;
        tags?: string[];
        values?: AttrValue[];
        hierarchy?: string;
        relevance?: number;
      }[];
    }[];
  }[];
};

/** Atributo como vem dentro do item. */
export type ItemAttribute = {
  id: string;
  name?: string;
  value_id?: string | null;
  value_name?: string | null;
  values?: AttrValue[] | null;
  value_struct?: unknown;
};

export type Item = {
  id: string;
  title: string;
  category_id: string;
  status?: string;
  sub_status?: string[];
  permalink?: string;
  thumbnail?: string;
  condition?: string;
  site_id?: string;
  /** Domínio do ML (MLB-HEADPHONES etc.) — filtra a busca de catálogo. */
  domain_id?: string | null;
  catalog_product_id?: string | null;
  /** Anúncios de catálogo criados a partir deste — a prova do vínculo. */
  item_relations?: { id?: string; variation_id?: number; stock_relation?: number }[] | null;
  /** Variações do anúncio: o vínculo com catálogo é um por variação. */
  variations?: {
    id: number;
    attribute_combinations?: { id?: string; name?: string; value_name?: string | null }[];
  }[];
  attributes?: ItemAttribute[];
  tags?: string[];
  // usados pelo diagnóstico
  seller_id?: number;
  user_product_id?: string | null;
  /**
   * Nome da família no modelo de User Products. Quando existe, é ELE que manda
   * no título: o ML recusa PUT em `title` com BODY_INVALID_FIELDS e manda
   * alterar o family_name, que sincroniza para todos os itens do mesmo UP.
   */
  family_name?: string | null;
  price?: number;
  currency_id?: string;
  listing_type_id?: string;
  available_quantity?: number;
  sold_quantity?: number;
  date_created?: string;
  pictures?: {
    id: string;
    url?: string;
    secure_url?: string;
    size?: string;
    max_size?: string;
    /** Campo que a API devolve na prática, mas não está na documentação pública. */
    quality?: number | string;
  }[];
  shipping?: {
    mode?: string;
    logistic_type?: string;
    free_shipping?: boolean;
    tags?: string[];
  };
  catalog_listing?: boolean;
  seller_address?: {
    city?: { name?: string };
    state?: { name?: string; id?: string };
    country?: { name?: string };
    address_line?: string;
  };
};

/* ------------------------------------------------------------------ *
 * Identificação do que foi colado na busca
 * ------------------------------------------------------------------ */

export type Alvo =
  | { tipo: 'item'; id: string }
  | { tipo: 'produto'; id: string }
  | { tipo: 'user_product'; id: string };

const PREFIXO = '(ML[ABCMUV]|MCO|MCR|MRD|MEC|MSV|MGT|MHN|MNI|MPA|MPY|MPE|CBT)';

/**
 * Descobre o que o usuário colou. Três casos que aparecem no dia a dia:
 *
 *  1. Link da página de catálogo com o anúncio no filtro — é o link que o
 *     navegador mostra ao clicar num anúncio dentro do catálogo:
 *     .../p/MLB2106826254?pdp_filters=item_id%3AMLB7478831254
 *     O que vale aqui é o item_id (MLB7478831254), não o da URL.
 *  2. Link de catálogo puro (.../p/MLB...): é um PRODUTO, não um anúncio.
 *     Produto não tem ficha para o vendedor preencher — devolvemos tipo
 *     'produto' para a tela poder explicar em vez de dar 404.
 *  3. Link ou código de User Product (MLBU…, .../up/MLBU…): é o "produto do
 *     vendedor", que pode ter mais de um anúncio pendurado nele (preços e
 *     parcelamentos diferentes). Devolvemos tipo 'user_product' para a tela
 *     perguntar ao ML quais anúncios pertencem a ele.
 *  4. Código solto, com hífen, ou link normal do anúncio.
 */
export function parseItemId(input: string): Alvo | null {
  let texto = input.trim();
  try {
    texto = decodeURIComponent(texto);
  } catch {
    /* URL malformada: seguimos com o texto cru */
  }
  texto = texto.toUpperCase();

  const doFiltro = texto.match(new RegExp(`ITEM_ID\\s*[:=]\\s*${PREFIXO}\\s*-?\\s*(\\d{6,})`));
  if (doFiltro) return { tipo: 'item', id: `${doFiltro[1]}${doFiltro[2]}` };

  const doCatalogo = texto.match(new RegExp(`/P/${PREFIXO}\\s*-?\\s*(\\d{6,})`));
  if (doCatalogo) return { tipo: 'produto', id: `${doCatalogo[1]}${doCatalogo[2]}` };

  // User Product: mesmo prefixo do site + "U" + número (MLBU4897802206)
  const doUserProduct = texto.match(new RegExp(`\\b${PREFIXO}U\\s*-?\\s*(\\d{6,})\\b`));
  if (doUserProduct) return { tipo: 'user_product', id: `${doUserProduct[1]}U${doUserProduct[2]}` };

  const solto = texto.match(new RegExp(`\\b${PREFIXO}\\s*-?\\s*(\\d{6,})\\b`));
  if (solto) return { tipo: 'item', id: `${solto[1]}${solto[2]}` };

  return null;
}

/* ------------------------------------------------------------------ *
 * Modelo de formulário
 * ------------------------------------------------------------------ */

export type Field = {
  id: string;
  name: string;
  valueType: ValueType;
  /** Obrigatório para publicar (bloqueia o PUT/POST). */
  required: boolean;
  /** Obrigatório só na ficha técnica: não bloqueia, mas derruba exposição. */
  requiredForSpecs: boolean;
  conditional: boolean;
  /** Não aparece no fluxo de venda do ML, mas pode ser carregado via API. */
  hidden: boolean;
  /** fixed / inferred / read_only: o ML preenche, o vendedor não altera. */
  readOnly: boolean;
  readOnlyReason?: string;
  multivalued: boolean;
  maxLength?: number;
  values: AttrValue[];
  suggested: AttrValue[];
  allowedUnits: { id: string; name: string }[];
  defaultUnit?: string;
  allowCustomValue: boolean;
  component?: string;
  hint?: string;
  current: { value_id: string | null; value_name: string | null };
  isNA: boolean;
  filled: boolean;
};

export type FieldGroup = { id: string; label: string; fields: Field[] };

export type Ficha = {
  item: Item;
  groups: FieldGroup[];
  stats: {
    total: number;
    filled: number;
    pct: number;
    missingRequired: string[]; // ids obrigatórios para publicar
    missingSpecs: string[]; // ids exigidos pela ficha técnica
    incompleteSpecsTag: boolean;
  };
};

export type FichaStats = Ficha['stats'];

export const READONLY_TAGS = ['read_only', 'others', 'restricted_values', 'inferred', 'fixed'];

/* ------------------------------------------------------------------ *
 * Montagem da ficha
 * ------------------------------------------------------------------ */

export function buildFicha(
  item: Item,
  catAttrs: CategoryAttribute[],
  specs: SpecsInput,
  opts: { includeHidden?: boolean } = {},
): Ficha {
  const current = new Map<string, ItemAttribute>();
  for (const a of item.attributes ?? []) current.set(a.id, a);

  // Ordem e agrupamento vêm da ficha técnica; metadados de valor vêm de /attributes.
  const specsIndex = new Map<
    string,
    { groupId: string; groupLabel: string; component: string; allowCustom: boolean; tags: string[] }
  >();
  for (const g of specs.groups ?? []) {
    for (const c of g.components ?? []) {
      for (const a of c.attributes ?? []) {
        specsIndex.set(a.id, {
          groupId: g.id,
          groupLabel: g.label,
          component: c.component,
          allowCustom: c.ui_config?.allow_custom_value ?? false,
          tags: a.tags ?? [],
        });
      }
    }
  }

  const condicao = item.condition ?? 'new';
  const isNew = condicao === 'new';
  const byId = new Map(catAttrs.map((a) => [a.id, a]));
  const groups = new Map<string, FieldGroup>();
  const order: string[] = [];

  const pushField = (groupId: string, groupLabel: string, field: Field) => {
    if (!groups.has(groupId)) {
      groups.set(groupId, { id: groupId, label: groupLabel, fields: [] });
      order.push(groupId);
    }
    groups.get(groupId)!.fields.push(field);
  };

  const makeField = (attr: CategoryAttribute): Field | null => {
    const tags = attr.tags ?? {};
    const spec = specsIndex.get(attr.id);
    const specTags = spec?.tags ?? [];

    const readOnlyTag = READONLY_TAGS.find((t) => tags[t]);
    const hidden = !!tags.hidden || !!tags.vip_hidden;
    const requiredForListing = !!tags.required || (isNew && !!tags.new_required);
    // Exigido pela ficha técnica / catálogo: não bloqueia o PUT, mas custa exposição.
    const requiredForSpecs =
      specTags.includes('required') ||
      specTags.includes('catalog_required') ||
      !!tags.catalog_required ||
      !!tags.catalog_listing_required;

    // O critério é um só: dá para o vendedor preencher?
    //
    // Fica de fora apenas o BLOQUEADO — fixed, inferred, read_only, others,
    // restricted_values — que é o ML quem preenche e o vendedor não altera.
    //
    // Oculto NÃO é sinônimo de bloqueado: ele só não aparece no fluxo padrão do
    // ML, mas aceita valor pela API e conta como informação para o comprador.
    // Escondê-lo daria a impressão falsa de ficha completa.
    if (!opts.includeHidden && readOnlyTag) return null;

    // GRADING (Excelente / Bom / Aceitável) é o grau do catálogo de
    // recondicionados: só existe quando ITEM_CONDITION é "refurbished". Num
    // anúncio novo, qualquer valor — inclusive N/A — volta como
    // "GRADING has invalid attribute values" e derruba o PUT inteiro.
    if (attr.id === 'GRADING' && condicao !== 'refurbished') return null;

    const cur = current.get(attr.id);
    const isNA = cur?.value_id === '-1';
    const filled = !!cur && !isNA && (!!cur.value_id || !!cur.value_name);

    return {
      id: attr.id,
      name: attr.name,
      valueType: attr.value_type,
      required: requiredForListing,
      requiredForSpecs,
      conditional: !!tags.conditional_required,
      hidden,
      readOnly: !!readOnlyTag,
      readOnlyReason: readOnlyTag,
      multivalued: !!tags.multivalued,
      maxLength: attr.value_max_length,
      values: attr.values ?? [],
      suggested: attr.suggested_values ?? [],
      allowedUnits: attr.allowed_units ?? [],
      defaultUnit: attr.default_unit,
      allowCustomValue: spec?.allowCustom ?? (attr.suggested_values?.length ? true : false),
      component: spec?.component,
      hint: attr.hint ?? attr.tooltip,
      current: { value_id: cur?.value_id ?? null, value_name: cur?.value_name ?? null },
      isNA,
      filled,
    };
  };

  const usados = new Set<string>();

  // 1) na ordem da ficha técnica
  for (const g of specs.groups ?? []) {
    for (const c of g.components ?? []) {
      for (const a of c.attributes ?? []) {
        const attr = byId.get(a.id) ?? {
          id: a.id,
          name: a.name,
          value_type: a.value_type,
          value_max_length: a.value_max_length,
          values: a.values,
          tags: Object.fromEntries((a.tags ?? []).map((t) => [t, true])),
        };
        if (usados.has(a.id)) continue;
        const f = makeField(attr as CategoryAttribute);
        usados.add(a.id);
        if (f) pushField(g.id, g.label || 'Ficha técnica', f);
      }
    }
  }

  // 2) o que sobrou de /attributes
  for (const attr of catAttrs) {
    if (usados.has(attr.id)) continue;
    const f = makeField(attr);
    usados.add(attr.id);
    if (!f) continue;
    const gid = attr.attribute_group_id || 'OTHERS';
    pushField(gid, attr.attribute_group_name || 'Outros atributos', f);
  }

  const contam = order.flatMap((id) => groups.get(id)!.fields).filter((f) => !f.readOnly);
  const filled = contam.filter((f) => f.filled || f.isNA).length;

  return {
    item,
    groups: order.map((id) => groups.get(id)!),
    stats: {
      total: contam.length,
      filled,
      pct: contam.length ? Math.round((filled / contam.length) * 100) : 100,
      missingRequired: contam.filter((f) => f.required && !f.filled).map((f) => f.id),
      missingSpecs: contam
        .filter((f) => f.requiredForSpecs && !f.required && !f.filled && !f.isNA)
        .map((f) => f.id),
      incompleteSpecsTag: (item.tags ?? []).includes('incomplete_technical_specs'),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Payload de escrita
 * ------------------------------------------------------------------ */

export type OutAttribute = {
  id: string;
  value_id?: string | null;
  value_name?: string | null;
};

/**
 * Regras da doc do ML:
 *  - boolean  -> é obrigatório mandar o value_id (242085 = Sim, 242084 = Não)
 *  - list     -> mandar value_id; valor fora da lista vai em value_name
 *  - number_unit -> value_name no formato "28 L"
 *  - N/A      -> value_id "-1" e value_name null (se value_name vier preenchido, o ML ignora)
 *  - limpar   -> value_id null e value_name null
 */
export function normalizeOut(field: Field, raw: OutAttribute): OutAttribute {
  if (raw.value_id === '-1') return { id: field.id, value_id: '-1', value_name: null };
  if (!raw.value_id && !raw.value_name) return { id: field.id, value_id: null, value_name: null };
  if (field.valueType === 'boolean') return { id: field.id, value_id: raw.value_id ?? null };
  if (raw.value_id) return { id: field.id, value_id: raw.value_id, value_name: raw.value_name ?? null };
  return { id: field.id, value_name: (raw.value_name ?? '').trim() };
}
