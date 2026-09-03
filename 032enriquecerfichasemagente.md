# Plan 032: Enriquecer a ficha do anúncio fora do catálogo — sem agente

> **Instruções ao executor**: siga cada passo na ordem, rode cada verificação e confirme o
> resultado esperado. Se um "STOP condition" ocorrer, pare e reporte — não improvise. Atualize a
> linha deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo tem `.git` (`github.com/LivioRS/Checkup_Anuncios`). Compare os trechos
> `file:line` abaixo com o arquivo vivo antes de editar. As Partes A/B tocam código que hoje
> vive no branch `feat/029-ia-avulso` (planos 029/030) — implemente a partir dele (ou de `main`
> se o 029/030 já tiver sido mergeado).

## Origem: veredito do LLM Council (2026-09-03)

A pergunta era "vale ter um agente de IA sempre disponível, com ferramentas (buscar imagem no
site do fabricante, enriquecer ficha, buscar dados na web)?". Veredito do conselho: **não agora.**

- O exemplo carro-chefe — imagem do site do fabricante — é **provavelmente proibido**: o ML
  exige foto REAL do produto e penaliza foto idêntica à de catálogo/fabricante; e há exposição
  de direito autoral. Independe da tecnologia.
- **Sem gargalo comprovado** (um usuário, contas próprias, volume baixo). Não há número.
- Contradiz o princípio de produto **"IA assiste, não decide sozinha"**.
- "Agente sempre disponível" é ilusão no Vercel Hobby — sempre acionado por request.
- O problema real ("anexar ficha técnica confiável a um rascunho") se resolve na ordem de menor
  custo, sem agente:
  1. **Determinístico**: GTIN → API de catálogo do ML → ficha estruturada, validada contra a
     API de atributos da categoria. Zero IA, zero scraping.
  2. **Visão de um tiro só**: o Livio já tem o produto na mão (senão não tem foto) → fotografa a
     etiqueta de especificação / manual / caixa → uma chamada de visão devolve JSON pra ele
     revisar. Mantém o humano como fonte.
  3. **Só depois, com dor medida**: ferramenta de busca web mínima. NÃO neste plano.

Este plano implementa **Parte A** (determinístico, é "a primeira coisa a fazer") e **Parte B**
(visão de um tiro). **Parte C fica registrada como fora de escopo, com as condições pra retomar.**

## Status

- **Priority**: P1 (Parte A) / P2 (Parte B) · **Effort**: M · **Risk**: BAIXA — só ADICIONA
  ao fluxo do plano 029; `/api/anuncios/avulso` só ganha um campo opcional; nada existente muda
  de comportamento.
- **Depends on**: 029 (form + rotas do anúncio avulso), 030 (`/api/anuncios/ia`, provedor de IA),
  031 (OpenRouter). Independe da Fase 3.
- **Category**: feature.
- **Planned at**: 2026-09-03.

## Current state (confirmar `file:line` antes de editar)

- `src/lib/ml/catalogo.ts` — `buscarProdutos({ site, gtin, q, domainId?, limite? })` →
  `{ resultados: ResultadoBusca[], via }`. `ResultadoBusca` tem `id, name, status, domain_id,
  attributes: AtributoProduto[] {id,name,value_id,value_name}, pictures: {url}[]`. **Não tem
  `category_id`** (só `domain_id`). `produtoDeCatalogo(id)` → `/products/{id}` →
  `ProdutoCatalogo` (mesmos campos + `main_features`, `short_description`).
- `src/lib/ml/attributes.ts` — `getCategoryAttributes(categoryId)` → `CategoryAttribute[]`
  (`id, name, value_type, value_max_length?, tags?: Record<string,boolean>` — `tags.required`
  marca obrigatório).
- `src/app/api/anuncios/avulso/route.ts` (029) — `POST`; monta
  `attributes: [{id:'BRAND',value_name:marca},{id:'MODEL',value_name:modelo}, gtin ?
  {id:'GTIN',value_name:gtin} : {id:'EMPTY_GTIN_REASON',value_name:'...'}]`. Loga em
  `anuncio_criacoes`.
- `src/app/api/anuncios/categoria/route.ts` (029/030) — `GET ?q=` → `domain_discovery` +
  escolha por IA → `{ sugestoes, escolha }`.
- `src/app/api/anuncios/ia/route.ts` (030) — `POST { acao: 'descricao' | 'roteiro-fotos', ... }`.
- `src/lib/ia.ts` (030/031) — `perguntarAoClaude(prompt, maxTokens)` só TEXTO; escolhe provedor
  (OpenRouter se `OPENROUTER_API_KEY`, senão Anthropic). `temIA()`.
- `src/app/criar/CriarAvulso.tsx` (029/030) — form; tem `gtin`, `marca`, `modelo`, `categoryId`,
  botões de IA. Não tem nada de "atributos extras".
- `anuncio_criacoes` (schema) — `payload jsonb`, `response jsonb`, `codigo text`. Serve pro log.

---

## Parte A — Enriquecimento determinístico por GTIN (prioridade)

### A1. Rota nova `GET /api/anuncios/ficha-por-gtin` (só leitura)

`?gtin=<código>&seller_id=<opcional>`.

- valida `gtin` (8–14 dígitos) → 400 se inválido.
- `comConta(sellerId, ...)` se `sellerId`, senão escopo padrão (igual `/api/anuncios/categoria`).
- `buscarProdutos({ site: 'MLB', gtin, limite: 3 })`.
- pega o **primeiro** resultado com `id` e `attributes`. Se nenhum → `{ achado: false }`.
- devolve:
  ```ts
  {
    achado: true,
    produto_id: p.id,
    titulo_sugerido: p.name ?? null,
    domain_id: p.domain_id ?? null,
    atributos: (p.attributes ?? [])
      .filter((a) => a.id && a.value_name && a.value_id !== '-1')
      .map((a) => ({ id: a.id, nome: a.name ?? a.id, valor: a.value_name })),
  }
  ```
- **NÃO** devolver `p.pictures`. As imagens do produto de catálogo são do fabricante/ML — não
  podem virar as fotos do anúncio do vendedor (regra do ML + direito autoral, ver veredito).
  Se quiser, devolver `tem_fotos_catalogo: (p.pictures?.length ?? 0) > 0` só como informação.
- erro do ML → status do `MlError`, `{ erro }`.

### A2. `POST /api/anuncios/avulso` aceita `atributos_extra`

Corpo ganha `atributos_extra?: { id: string; value_name: string }[]` (opcional).

- validar: array de objetos com `id` string não vazio e `value_name` string não vazio; ignorar
  o resto; teto de 40 itens.
- **descartar** qualquer `atributos_extra` com `id` em `{'BRAND','MODEL','GTIN',
  'EMPTY_GTIN_REASON'}` (esses o handler já monta a partir de `marca`/`modelo`/`gtin` —
  o campo do form vence).
- montar `attributes` = `[BRAND, MODEL, GTIN|EMPTY_GTIN_REASON, ...atributos_extra dedup por id]`.
- o resto do handler (invariante do pausado, log, descrição) **sem mudança**.

### A3. `CriarAvulso.tsx` — botão "Buscar ficha pelo código"

- na seção "2. Ficha", ao lado do campo GTIN: botão **"Buscar ficha pelo código"**, habilitado
  quando `gtin.trim().length >= 8`.
- ao clicar → `GET /api/anuncios/ficha-por-gtin?gtin=<gtin>&seller_id=<sellerId>`.
  - `achado: false` → `<small className="vazio">Nada no catálogo do ML pra esse código —
    preencha a ficha na mão ou use "Extrair ficha da foto".</small>`.
  - `achado: true`:
    - se `titulo` estiver vazio e vier `titulo_sugerido` → oferecer botão "usar este título".
    - se `categoryId` vazio e vier `domain_id` → chamar a rota de categoria já existente com o
      `titulo_sugerido` pra popular a sugestão (reusar `sugerirCategoria`).
    - guardar `atributos` num estado `fichaGtin: {id,nome,valor}[]` e renderizar uma lista com
      checkbox por atributo (todos marcados por padrão). Um `<Selo>` "N atributos do catálogo".
- no `criar()`, enviar `atributos_extra: fichaGtin.filter(marcado).map(({id,valor}) =>
  ({ id, value_name: valor }))`.

### A4. Testes (`tests/anuncios-ficha-gtin.test.ts`)

- `GET /api/anuncios/ficha-por-gtin`: com mock de `buscarProdutos` (via `fetch` stub em
  `/products/search?...product_identifier=`) devolvendo um produto com `attributes` →
  `{ achado: true, atributos: [...] }`, **sem `pictures` no corpo**; sem resultado →
  `{ achado: false }`; gtin inválido → 400.
- `POST /api/anuncios/avulso` com `atributos_extra`: o payload pro ML inclui os extras **depois**
  de BRAND/MODEL/GTIN; um `atributos_extra` com `id:'BRAND'` é **descartado**; dedup por `id`.
- Regressão: `tests/anuncios-avulso.test.ts` e `tests/anuncios.test.ts` seguem 100% verdes.

---

## Parte B — Extrair ficha de uma foto (visão, um tiro só)

### B1. `src/lib/ia.ts` — `perguntarComImagem`

Nova função **motor** (sem Supabase), ao lado de `perguntarAoClaude`:

```ts
export async function perguntarComImagem(
  prompt: string,
  imagemUrl: string,
  maxTokens = 1500,
): Promise<string>
```

- mesma escolha de provedor (`OPENROUTER_API_KEY` senão `ANTHROPIC_API_KEY` senão lança).
- **OpenRouter** (OpenAI-compat): `messages: [{ role: 'user', content: [ { type: 'text', text:
  prompt }, { type: 'image_url', image_url: { url: imagemUrl } } ] }]`.
- **Anthropic**: `messages: [{ role: 'user', content: [ { type: 'text', text: prompt },
  { type: 'image', source: { type: 'url', url: imagemUrl } } ] }]` (a API aceita `source.type:
  'url'`; se o executor confirmar que a versão em uso não aceita URL, baixar a imagem e mandar
  `source: { type: 'base64', media_type, data }` — respeitar o teto de 15 MB do AGENTS.md §8).
- ler a resposta como `perguntarAoClaude` faz pra cada provedor.
- `imagemUrl` tem de ser `https?://` (validar; senão lança).

### B2. `src/lib/ia.ts` — prompt + reader

- `promptFichaDaFoto()` → instrui: "você recebe a foto de uma etiqueta de especificação / manual
  / caixa de um produto. Extraia SÓ o que está LEGÍVEL na imagem. Não complete, não deduza, não
  invente. Devolva JSON `{"titulo_sugerido":"...","atributos":[{"nome":"...","valor":"..."}]}`.
  Se um campo não está legível, não inclua."
- `lerFichaDaFoto(bruto)` → `{ tituloSugerido?: string; atributos: {nome,valor}[] }` — tolera
  cercas de código; `[]` se ilegível.

### B3. `POST /api/anuncios/ia` — nova `acao: 'ficha-da-foto'`

- corpo ganha `foto_url?: string` (obrigatório pra essa ação).
- valida `acao` e `foto_url` (`https?://`) → 400.
- `perguntarComImagem(promptFichaDaFoto(), foto_url, 1500)` → `lerFichaDaFoto` →
  `{ titulo_sugerido, atributos }`.
- sem chave de IA → 503 (igual às outras ações).
- **Importante**: a resposta é SUGESTÃO pro Livio revisar e mapear — os `atributos` vêm como
  `{nome,valor}` (texto livre), NÃO como `{id}` do ML. O Livio decide o que usar. "IA assiste,
  não decide."

### B4. `CriarAvulso.tsx` — "Extrair ficha da foto"

- na seção "2. Ficha": campo "URL de uma foto da etiqueta / manual / caixa" + botão
  **"Extrair ficha da foto"** (habilitado com uma URL http válida).
- ao clicar → `POST /api/anuncios/ia { acao: 'ficha-da-foto', foto_url }`.
- renderizar a lista `{nome, valor}` retornada num bloco "sugestão da foto — confira antes de
  usar", com um `<textarea>` ou campos editáveis. O Livio copia pro campo certo / adiciona como
  atributo extra manualmente. **Não** preencher `attributes` do ML automaticamente a partir
  disso (os `id` do ML não vêm da foto).
- se vier `titulo_sugerido` e o título estiver vazio → botão "usar".

### B5. Testes (`tests/anuncios-ia.test.ts` — adicionar)

- `perguntarComImagem` via OpenRouter: o corpo enviado tem `content` array com `text` +
  `image_url`; via Anthropic: `content` com `text` + `image` (`source.type: 'url'`).
- `POST /api/anuncios/ia { acao: 'ficha-da-foto', foto_url }` com mock → `{ atributos, titulo_sugerido }`.
- `foto_url` ausente ou não-http → 400. Sem chave → 503.
- `lerFichaDaFoto`: parseia `{atributos:[...]}`; `[]` se ilegível.

---

## Parte C — NÃO implementar (registrar como plano futuro)

Ferramenta de busca web (`buscarWeb` + `lerPagina`) + eventual loop de agente. Só retomar
quando **todas** forem verdade:

1. **Baseline medido**: X anúncios avulsos/mês em que a ficha ficou incompleta **depois** das
   Partes A e B (contável via `anuncio_criacoes`, ver "Medição" abaixo).
2. Partes A e B em uso e comprovadamente insuficientes pra esses X.
3. Decisão explícita do Livio, ciente do custo de token variável e da manutenção de scraper.

Se retomado: NÃO um "agente sempre disponível". Uma rota `/api/anuncios/enriquecer-web` que faz
`buscarWeb → abrir 2-3 páginas → 1 chamada de extração → rascunho pro Livio`, rodando no modelo
de step do worker de lote (`/api/lote/[id]/processar`), com **teto rígido de tokens por execução**
e log por execução. Loop (se algum dia) = máximo 5 iterações, orçamento fixo. Provedor de busca:
escolher um (Brave Search / Serper / Tavily), chave em `.env.local`.

## Medição (fazer junto da Parte A)

No `/api/anuncios/avulso`, no objeto `response` gravado em `anuncio_criacoes`, incluir
`origem_ficha`: `'manual' | 'gtin' | 'foto' | 'gtin+foto'` (derivado de: veio `atributos_extra`?
o form marcou que usou a foto?). Um campo simples no corpo do POST (`origem_ficha` mandado pelo
`CriarAvulso.tsx`) já basta. Isso dá, em 1 mês, o número que a Parte C exige.

## Gate obrigatório (AGENTS.md)

```
npm run build       # compila + typecheck
npm run lint        # zero erro (warnings no-unused-vars pré-existentes ok)
npm run verificar
npm test            # todos verdes, incluindo os testes novos e a regressão do 029/030
```

## STOP conditions

- Se `tests/anuncios-avulso.test.ts` ou `tests/anuncios.test.ts` mudarem de comportamento → PARE.
- Se a Parte A puser as **imagens do produto de catálogo** como fotos do anúncio → PARE (viola a
  regra de foto real; o veredito do conselho é explícito).
- Se a Parte B preencher `attributes` do ML **automaticamente** a partir do texto da foto (sem o
  Livio mapear `id`) → PARE ("IA assiste, não decide").
- Se `perguntarComImagem` precisar de mudança no fluxo de provedor que afete `perguntarAoClaude`
  (texto) → PARE e isole.

## Out of scope

- Upload de arquivo de imagem (Partes A/B usam URL, igual ao resto do 029).
- Preencher `category_id` com 100% de confiança a partir do `domain_id` do produto de catálogo —
  usar a sugestão via `domain_discovery` (já existe) e deixar o Livio confirmar.
- Variações, frete, atributos condicionais (`conditional_required`).
- Qualquer busca na web / scraping (Parte C).

## Git workflow

Branch a partir de `feat/029-ia-avulso` (ou `main` se 029/030 já mergeado). Commit + push + PR.
Parte A e Parte B podem ser dois commits (ou dois PRs) — A é a prioridade e entrega valor
sozinha.
