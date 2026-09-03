# Plan 033: Rascunho de anúncio por IA — roteamento por GTIN, preenchimento automático e ficha da web

> **Instruções ao executor**: siga cada passo na ordem, rode cada verificação. STOP condition =
> pare e reporte. Atualize a linha deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo tem `.git`. Implemente a partir de `feat/032-ficha-gtin` (tem os planos
> 029–032) ou de `main` se já mergeado.

## Origem: 2 vereditos do LLM Council + decisão do Livio

O Livio quer "colocar só o básico e a IA preencher tudo". Os conselhos apontaram, e ele
confirmou o escopo:

- **SIM**: a IA preenche categoria, marca, modelo, ficha (inclusive buscando specs no site do
  fabricante) e descrição — tudo marcado "sugerido pela IA — conferir", revisado antes de
  publicar (a pausa obrigatória).
- **NÃO**: foto automática (gerada por IA, raspada do fabricante, ou "trazida" pra passar por
  ferramenta de imagem). O ML exige foto REAL do produto; foto sintética/de terceiro é risco de
  moderação + direito autoral + reclamação do comprador, e o anúncio nasce na conta do cliente.
- **NÃO**: publicação automática. Fica sempre pausado.
- **Achado dos conselhos**: o exemplo que motivou tudo (Ibanez KIKO300) é bug de **roteamento**
  — produto consagrado com GTIN quase sempre já tem página de catálogo no ML, e o modo "Do
  catálogo" já traz título + fotos reais + ficha com digitação ~zero. Consertar o roteamento
  resolve a maior parte do incômodo sem IA.

## Status

- **Priority**: P1 (Parte A) / P1 (B) / P2 (C) · **Effort**: L · **Risk**: MÉDIA — cria anúncio
  de verdade; mesmo invariante do 019/029 (nasce pausado, tudo logado). Partes A/B/D só ADICIONAM
  ao form; a Parte C traz dependência externa nova (provedor de busca web) atrás de env var.
- **Depends on**: 029, 030, 031, 032.
- **Category**: feature.
- **Planned at**: 2026-09-03.

## Parte A — Roteamento por GTIN → catálogo (prioridade; "a primeira coisa")

Quando, no modo "Fora do catálogo", o Livio informa um GTIN que **resolve pra um produto de
catálogo do ML**, o painel oferece trocar pro modo "Do catálogo" (que traz tudo pronto).

- `CriarAvulso.tsx`: quando `buscarFichaGtin()` (plano 032) devolver `achado: true` **e**
  `produto_id`, mostrar um aviso destacado no topo da seção Ficha:
  *"Este produto tem página no catálogo do ML (`{produto_id}`). O modo 'Do catálogo' traz
  título, fotos reais e ficha prontos."* + botão **"Ir pro modo Do catálogo"**.
- `CriarModos.tsx`: guarda `prefill: { marca?; modelo?; codigo?; sellerId? } | null`. `CriarAvulso`
  recebe `onTrocarParaCatalogo(dados)`; ao chamar, `CriarModos` faz `setModo('catalogo')` +
  `setPrefill(dados)`.
- `CriarAnuncio.tsx`: aceita `prefill?: { marca?; modelo?; codigo?; sellerId? }` e inicializa os
  `useState` a partir dele. Em `CriarModos`, renderizar `<CriarAnuncio key={chaveDoPrefill} ... />`
  pra remontar com o estado inicial novo na troca.
- Sem mudança de rota; reusa `GET /api/anuncios/ficha-por-gtin` (032).

### Testes A
- (componente não tem teste no repo — validação manual). Só garantir que `CriarAnuncio` com
  `prefill` inicializa os campos e que `npm run build`/`lint` passam.

## Parte B — Botão "Preencher com IA" (rascunho de uma vez)

Um botão só que, a partir do **título** (+ gtin/marca/modelo se já tiver), preenche categoria,
marca, modelo, ficha e descrição — cada campo marcado "sugerido pela IA — conferir".

- `POST /api/anuncios/rascunho` (rota nova): corpo `{ seller_id?, titulo, gtin?, marca?, modelo? }`.
  Orquestra **em paralelo**, cada peça da sua fonte:
  - categoria → mesma lógica de `/api/anuncios/categoria` (domain_discovery + escolha por IA).
  - marca+modelo → `perguntarAoClaude(promptMarcaModelo(titulo))` → `{ marca, modelo }` (se o
    corpo já trouxe, mantém o do corpo).
  - ficha → se `gtin`: `buscarProdutos({gtin})` (determinístico); senão e se houver provedor de
    busca web configurado (Parte C): `fichaDaWeb(...)`; senão: `[]`.
  - descrição → `perguntarAoClaude(promptDescricaoNova(...))`.
  - devolve `{ category_id, category_nome, marca, modelo, atributos: {id?,nome,valor}[],
    descricao, fontes_ficha: string[] }`. Cada peça que falhar volta vazia (best-effort — nunca
    derruba a resposta inteira).
- `src/lib/ia.ts`: `promptMarcaModelo(titulo)` → JSON `{"marca":"...","modelo":"..."}`;
  `lerMarcaModelo(bruto)`.
- `CriarAvulso.tsx`: botão **"Preencher com IA"** no topo (seção 1), habilitado com título ≥ 10
  chars. Ao voltar, preenche `categoryId`, `marca`, `modelo`, `fichaDaFoto`/`fichaGtin` (a lista
  de atributos sugeridos, com o mesmo mecanismo de checkbox do 032), `descricao`. Um `<Selo
  nivel="atencao">` "preenchido pela IA — confira tudo antes de publicar" fixo enquanto houver
  campo sugerido.
- Sem chave de IA → a rota devolve o que der (ex.: só categoria via domain_discovery) e um aviso.

### Testes B
- `POST /api/anuncios/rascunho`: com mocks, devolve `{ category_id, marca, modelo, atributos,
  descricao }`; peça que falha volta vazia sem derrubar o resto; sem IA → categoria ainda vem do
  domain_discovery.
- `lerMarcaModelo`: parseia, tolera cercas, `{marca:'',modelo:''}` se ilegível.

## Parte C — Ficha técnica buscada no site do fabricante (web)

- `src/lib/web/busca.ts` (adapter novo, `server-only`): `buscarNaWeb(query, opts?)` — atrás de
  env var. Provedor via `WEB_SEARCH_PROVIDER` (`tavily` default) + `WEB_SEARCH_API_KEY`.
  - `tavily`: `POST https://api.tavily.com/search` `{ api_key, query, max_results: 3,
    include_raw_content: true }` → devolve `[{ url, title, content, raw_content? }]`.
  - `temBuscaWeb()` → `!!process.env.WEB_SEARCH_API_KEY`.
  - sem chave → lança (a rota traduz pra 503).
- `POST /api/anuncios/ficha-web` (rota nova): `{ titulo, marca?, modelo? }`. Monta a query
  (`${marca} ${modelo} especificações ficha técnica` ou `${titulo} especificações`), chama
  `buscarNaWeb`, junta o texto dos 2-3 resultados, **uma** chamada `perguntarAoClaude(
  promptFichaDaWeb(textos, {titulo,marca,modelo}))` → `lerFichaDaWeb` → `{ atributos:
  {nome,valor}[], fontes: string[] }`. Cada atributo = SUGESTÃO ("conferir").
  - `promptFichaDaWeb`: "abaixo estão trechos de páginas da web sobre este produto. Extraia SÓ
    especificações FACTUAIS que apareçam no texto (medida, material, capacidade, compatibilidade,
    país de origem, o que acompanha). NÃO invente. NÃO copie frases inteiras — só o par
    campo:valor. Se as páginas parecerem de OUTRO modelo, devolva lista vazia." → JSON
    `{"atributos":[{"nome":"...","valor":"..."}],"modelo_confere":true|false}`.
  - se `modelo_confere: false` → devolver `{ atributos: [], aviso: 'as páginas encontradas
    parecem ser de outro modelo' }`.
- `CriarAvulso.tsx`: botão **"Buscar ficha no site da marca (IA)"** na seção Ficha — habilitado
  com título ≥ 5. Renderiza a lista `{nome,valor}` + as URLs de fonte, com aviso "specs da web —
  confira antes de publicar; a descrição é reescrita, não copiada".
- `.env.example`: `WEB_SEARCH_PROVIDER=tavily` + `WEB_SEARCH_API_KEY=` com comentário (chave em
  https://tavily.com — plano free serve pra testar).

### Testes C
- `POST /api/anuncios/ficha-web`: com `WEB_SEARCH_API_KEY` + mocks (Tavily + Claude) →
  `{ atributos, fontes }`; `modelo_confere:false` → `{ atributos: [], aviso }`; sem
  `WEB_SEARCH_API_KEY` → 503; sem chave de IA → 503.
- `lerFichaDaWeb`: parseia, respeita `modelo_confere`.

## Parte D — Padronizar a foto real (reuso do que já existe)

**Nada de código novo de imagem.** No bloco "Resultado" do `CriarAvulso.tsx`, quando o anúncio
é criado com sucesso, além do link do anúncio, um link **"padronizar as fotos"** →
`/itens/{id}/fotos` (a tela que já faz quadrado/fundo branco/redimensionar pra anúncio
existente — o anúncio recém-criado já tem `id`). A foto continua sendo a que o Livio subiu.

## STOP conditions

- Se `tests/anuncios-avulso.test.ts`, `tests/anuncios.test.ts`, `tests/anuncios-ia.test.ts` ou
  `tests/anuncios-ficha-gtin.test.ts` mudarem de comportamento → PARE.
- Se qualquer parte fizer o anúncio publicar sem revisão, ou preencher `pictures` com imagem
  que não seja URL informada pelo Livio → PARE.
- Se a Parte C copiar texto de descrição do fabricante em vez de reescrever, ou preencher
  atributo sem `modelo_confere` → PARE.
- Se o texto extraído da web for injetado num prompt sem isolamento (é conteúdo não confiável —
  risco de prompt injection): trate os trechos como dados entre delimitadores no prompt, nunca
  como instrução.

## Out of scope

- Publicação automática / score de confiança / entrada em lote (a "fábrica de anúncios" — foi o
  maior ponto cego apontado pelo conselho).
- Geração/transformação/scraping de imagem de produto.
- Preencher os `attributes` do ML automaticamente a partir do texto da web/foto sem o Livio
  confirmar o mapeamento `id`.
- Loop de agente / múltiplas iterações. Cada botão é uma chamada (ou um punhado em paralelo).

## Gate obrigatório (AGENTS.md)

```
npm run build
npm run lint
npm run verificar
npm test
```

## Git workflow

Branch `feat/033-rascunho-ia` a partir de `feat/032-ficha-gtin`. Commit por Parte (A, B, C, D)
ou dois PRs (A+D primeiro — entrega valor sem dependência; B+C depois). Push + PR.
