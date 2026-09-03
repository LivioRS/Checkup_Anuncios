# Plan 029: Criar anúncio fora do catálogo (produto sem PDP / lançamento)

> **Instruções ao executor**: siga cada passo, rode cada verificação. STOP condition = pare e
> reporte. Atualize `plans/README.md` ao terminar.
>
> **Drift check**: repo tem `.git` (`github.com/LivioRS/Checkup_Anuncios`). Confira os trechos
> `file:line` contra o arquivo vivo antes de editar.

## Status

- **Priority**: P1 · **Effort**: L · **Risk**: MÉDIA — cria anúncio de verdade no ML. Mesmo
  invariante do plano 019 (nasce PAUSADO, nunca ativo sozinho; toda tentativa logada). O caminho
  do catálogo (`/api/anuncios`) **não é tocado** — rota nova, isolada.
- **Depends on**: 019 (fluxo de criação rápida + tabela `anuncio_criacoes` + invariante do
  "pausado"). Independente da Fase 3.
- **Category**: feature (era o "fallback de criação sem correspondência no catálogo" listado em
  `plans/README.md` → "Findings considered and rejected", adiado do 019 pro "próximo número
  livre").
- **Planned at**: 2026-09-03.

## Why this matters

O `/criar` de hoje só cria anúncio **vinculado a um produto de catálogo** (`catalog_listing:
true` + `catalog_product_id`). O ML preenche título, fotos e ficha a partir da PDP. Produto que
**não tem PDP** — um lançamento, um item de nicho, algo que o catálogo do ML ainda não
cadastrou — não passa por esse fluxo: o "Nada encontrado no catálogo" hoje é beco sem saída
("publique pelo caminho manual de sempre").

Este plano abre o caminho "avulso": o vendedor informa tudo (título, categoria, preço, marca,
modelo, GTIN ou motivo de não ter, garantia, fotos por URL, tipo de anúncio, descrição) e o
painel cria o anúncio de marketplace direto, pausado.

## Current state

- `src/app/api/anuncios/route.ts` — `POST` cria SÓ catálogo. Payload fixo `{ catalog_listing:
  true, catalog_product_id, price, currency_id: 'BRL', available_quantity, condition, status:
  'paused' }`. Depois do create, se a resposta não vier `paused`, faz `PUT {status:'paused'}`.
  Loga tudo em `anuncio_criacoes` via `registrarCriacaoAnuncio`. 4 testes em
  `tests/anuncios.test.ts` fixam esse comportamento.
- `src/lib/auditoria.ts` — `registrarCriacaoAnuncio({ sellerId, marca?, modelo?, codigo?,
  catalogProductId, payload, status, itemId?, response })`. `catalogProductId` é `string` no
  tipo, mas a coluna `anuncio_criacoes.catalog_product_id` é **nullable**.
- `src/app/api/catalogo/buscar/route.ts` — `GET` só-leitura, busca produto de catálogo por
  marca+modelo(+gtin). Nada equivalente pra descobrir CATEGORIA de um produto avulso.
- `src/lib/ml/attributes.ts` — `getCategoryAttributes(categoryId)` (lista atributos da
  categoria, com `value_max_length`, `tags`), `getTechnicalSpecsInput(categoryId)`.
- `src/app/criar/CriarAnuncio.tsx` (~300 linhas, `'use client'`) — o form do catálogo.
- `supabase/schema.sql` — `anuncio_criacoes` já serve; nada a migrar.

## Desenho

### 1. Rota nova `POST /api/anuncios/avulso` (não mexer em `/api/anuncios`)

Corpo:

```ts
{
  seller_id: string;
  titulo: string;
  category_id: string;         // o vendedor informa ou usa o "sugerir" (passo 2)
  valor: number | string;
  quantidade: number | string;
  condicao: 'new' | 'used';
  marca: string;
  modelo: string;
  gtin?: string;               // vazio => manda EMPTY_GTIN_REASON
  garantia?: { tipo: 'vendedor' | 'fabrica' | 'nenhuma'; tempo?: string }; // ex tempo: "90 dias"
  fotos: string[];             // URLs, >= 1
  listing_type_id?: 'gold_special' | 'gold_pro';  // default gold_special
  descricao?: string;          // vira POST /items/{id}/description depois do create
}
```

Validação (400 antes de qualquer chamada ao ML): `seller_id`, `titulo` (>= 10 chars, <= 60),
`category_id` (regex `^ML[A-Z]\d+$`), `valor > 0`, `quantidade >= 1` inteiro, `condicao` em
`{new, used}`, `marca`/`modelo` não vazios, `fotos` com >= 1 URL http(s) válida,
`listing_type_id` em `{gold_special, gold_pro}` se presente.

Payload pro ML (`POST /items`):

```ts
{
  title, category_id,
  price, currency_id: 'BRL', available_quantity, buying_mode: 'buy_it_now',
  listing_type_id: body.listing_type_id ?? 'gold_special',
  condition,
  pictures: fotos.map((source) => ({ source })),
  sale_terms: garantiaParaSaleTerms(body.garantia),   // [] se 'nenhuma'
  attributes: [
    { id: 'BRAND', value_name: marca },
    { id: 'MODEL', value_name: modelo },
    ...(gtin ? [{ id: 'GTIN', value_name: gtin }]
             : [{ id: 'EMPTY_GTIN_REASON', value_name: 'Não possui código universal de produto' }]),
  ],
  status: 'paused',   // mesma precaução do 019
}
```

`garantiaParaSaleTerms`: `vendedor` → `[{id:'WARRANTY_TYPE',value_name:'Garantia do vendedor'},
{id:'WARRANTY_TIME',value_name: tempo || '90 dias'}]`; `fabrica` → `WARRANTY_TYPE` "Garantia de
fábrica" + tempo; `nenhuma` → `[{id:'WARRANTY_TYPE',value_name:'Sem garantia'}]`.

Depois do create — **mesma sequência do 019**:
1. se `criado.status !== 'paused'` e tem `criado.id` → `PUT /items/{id} {status:'paused'}`.
2. se `descricao` não vazia → `POST /items/{id}/description { plain_text: limparParaDescricao(descricao) }`
   (best-effort: falha aqui NÃO derruba o sucesso — o anúncio já existe pausado; registrar o erro).
3. `registrarCriacaoAnuncio({ ..., catalogProductId: '' , codigo: gtin, payload, status, itemId,
   response })` — `catalog_product_id` vai `null` no banco (coluna nullable; passar `''` e
   `registrarCriacaoAnuncio` grava `params.catalogProductId` — ver STEP 3 pra ajustar o tipo).
4. Resposta: `{ ok: true, criado: { ...criado, status: 'paused' } }` ou o erro cru do ML
   (mesma forma do 019), e o caso crítico "criado mas pausa falhou" → 502 com aviso.

### 2. Rota nova `GET /api/anuncios/categoria?q=<titulo>` (só leitura)

`comConta(seller_id)` → `mlFetch('/sites/MLB/domain_discovery/search?limit=3&q=' + encode(q))`
→ devolve `[{ domain_id, domain_name, category_id, category_name }]`. O UI usa pra sugerir a
`category_id` a partir do título. Sem `seller_id`? Pode rodar sem conta (endpoint é público),
mas manter o `comConta` por consistência com `/api/catalogo/buscar` — aceitar `seller_id`
opcional e cair pro escopo padrão se faltar.

### 3. `src/lib/auditoria.ts` — `catalogProductId` opcional

Trocar `catalogProductId: string` por `catalogProductId?: string | null` no tipo de
`registrarCriacaoAnuncio`, e `catalog_product_id: params.catalogProductId ?? null` no insert. O
caminho do catálogo (019) continua passando a string; o avulso passa `undefined`. Zero mudança
de comportamento pro 019 (o teste do 019 checa `catalog_product_id` só no payload do ML, não na
linha gravada — confirmar).

### 4. UI — `/criar` ganha um seletor de modo

- `src/app/criar/page.tsx` — sem mudança de dados (já passa `contas`).
- `src/app/criar/CriarAnuncio.tsx` — no topo, um toggle: **"Do catálogo"** (fluxo atual) /
  **"Fora do catálogo"**. Estado `modo`. Quando `modo === 'avulso'`, renderiza
  `<CriarAvulso contas={contas} />` e esconde o resto.
- `src/app/criar/CriarAvulso.tsx` (novo, `'use client'`): form com conta, título, categoria
  (input + botão "sugerir pelo título" → `GET /api/anuncios/categoria`), preço, quantidade,
  condição, marca, modelo, GTIN (opcional), garantia (select tipo + input tempo), fotos
  (textarea de URLs, uma por linha), tipo de anúncio (select), descrição (textarea opcional).
  Botão "Criar anúncio (fica pausado)" → `POST /api/anuncios/avulso`. Reusa `descreverErro` e o
  bloco "Resultado" no mesmo formato de `CriarAnuncio`. Copiar os helpers, não fatorar agora.
- `src/app/criar/page.tsx` texto de introdução: mencionar os dois modos.

### 5. Testes (`tests/anuncios-avulso.test.ts`)

Com `injetarCliente` + fake supabase (`contas`, `anuncio_criacoes`) + `fetch` stub:

1. **payload certo**: monta `POST /items` com `pictures: [{source}]`, `attributes` com
   BRAND/MODEL, `EMPTY_GTIN_REASON` quando sem GTIN, `GTIN` quando com, `listing_type_id` default
   `gold_special`, `status: 'paused'`, `sale_terms` conforme garantia. **Nunca** manda
   `catalog_listing`.
2. **nunca ativa sozinho**: se o ML devolver `status: 'active'`, faz `PUT {status:'paused'}`
   antes de responder `ok`; resposta traz `status: 'paused'`.
3. **descrição**: se `descricao` presente, faz `POST /items/{id}/description` depois do create;
   se esse POST falhar, a resposta ainda é `ok: true` (best-effort) mas o `response` gravado em
   `anuncio_criacoes` registra o erro da descrição.
4. **falha no create**: ML recusa (400) → devolve o erro + grava a falha em `anuncio_criacoes`
   com `item_id: null`, `status: 400`, `catalog_product_id: null`.
5. **validação antes do ML**: título curto / sem fotos / categoria malformada → 400 sem chamar
   `fetch`.
6. **regressão do 019**: `tests/anuncios.test.ts` roda junto e continua **100% verde**.

## STOP conditions

- Se `tests/anuncios.test.ts` (catálogo, plano 019) mudar de comportamento → PARE.
- Se o create avulso puder responder `ok` com o anúncio **não** pausado → PARE (é o invariante).
- Não implementar variações, dimensões/peso de frete, upload de imagem (só URL), nem form
  dinâmico de atributos por categoria — ver "Out of scope".

## Out of scope (follow-ups, não neste plano)

- **Atributos obrigatórios por categoria além de BRAND/MODEL/GTIN**: algumas categorias exigem
  mais (voltagem, cor, etc.). O MVP manda o mínimo; se o ML recusar por atributo faltando, o
  erro cru volta pro vendedor (que completa no ML). Um form dinâmico lendo
  `getTechnicalSpecsInput` é um plano próprio.
- **Variações** (tamanho/cor) — o anúncio sai sem variação.
- **Frete**: o MVP não manda `shipping` (o ML aplica o default da conta/categoria). Dimensões,
  peso, ME2 vs. custom, frete grátis — follow-up.
- **Upload de imagem**: só URL de foto já hospedada. Subir arquivo (via `/pictures`) é outro card.
- **Editar/publicar pelo painel**: continua "nasce pausado, ativa manualmente no ML".

## Git workflow

Branch a partir da `main`. Commit + push + PR próprio. Independe das branches da Fase 3.
