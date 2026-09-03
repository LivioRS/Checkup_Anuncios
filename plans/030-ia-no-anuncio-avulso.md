# Plan 030: IA no anúncio fora do catálogo — descrição, categoria e roteiro de fotos

> Extensão do plano 029. Stack sobre `feat/anuncio-fora-catalogo`.
> Drift check: repo tem `.git` (`github.com/LivioRS/Checkup_Anuncios`).

## Status

- **Priority**: P1 · **Effort**: M · **Risk**: BAIXA — só adiciona botões de IA no form do 029;
  nenhuma rota existente muda comportamento, e tudo tem fallback quando não há `ANTHROPIC_API_KEY`.
- **Depends on**: 029 (o form avulso + as rotas `/api/anuncios/avulso` e `/api/anuncios/categoria`).
- **Category**: feature.
- **Planned at**: 2026-09-03.

## Decisão de produto (o Livio confirmou)

- **Descrição por IA**: sim — reusa o Claude que o painel já usa.
- **Categoria por IA**: o preditor do próprio ML (`domain_discovery`) continua sendo a fonte dos
  `category_id` VÁLIDOS; o Claude escolhe o melhor da lista + explica. Sem chave da Anthropic, cai
  pro `domain_discovery` cru (comportamento do 029).
- **Imagens por IA = roteiro de fotos** (o Livio escolheu "Briefing de fotos"). O ML exige foto
  REAL do produto — imagem gerada por IA viola a política deles e engana o comprador. Então a IA
  **não gera imagem**: escreve o roteiro do que fotografar (capa fundo branco, ângulos, detalhes,
  escala, em uso). O vendedor tira as fotos reais e cola as URLs, como no 029.

## Current state

- `src/lib/ia.ts` (motor, sem Supabase) — `perguntarAoClaude`, `temIA()`, `limparParaDescricao`,
  `promptMelhoria`/`promptTitulo`/`promptNotas`, `lerNotas`. É aqui que entram os builders/readers
  novos.
- `src/app/api/anuncios/categoria/route.ts` (029) — `GET ?q=` → `domain_discovery` → `{ sugestoes }`.
- `src/app/criar/CriarAvulso.tsx` (029) — form; já tem "Sugerir pelo título" pra categoria,
  textarea de URLs de foto, textarea de descrição.

## Desenho

### 1. `src/lib/ia.ts` — builders + readers novos (motor, JSON puro)

- `promptDescricaoNova({ titulo, marca, modelo, categoria?, temFotos })` → texto da descrição.
  Mesmas regras do `promptMelhoria` (texto simples puro, proibido inventar, FAQ, "Principais
  características"), mas input enxuto (produto ainda não existe: sem ficha, sem perguntas reais,
  sem avaliações). Deixa claro no prompt: "baseie-se SÓ em título/marca/modelo; se um dado não
  aparece, não escreva sobre ele".
- `promptEscolhaCategoria(titulo, candidatos: {category_id, category_name}[])` → JSON
  `{"category_id":"<um dos da lista>","motivo":"1 frase"}`. O prompt LISTA os `category_id`
  válidos e proíbe responder fora da lista.
- `lerEscolhaCategoria(bruto, idsValidos: string[])` → `{ category_id, motivo } | null` — parseia
  tolerando cercas de código; **descarta se o `category_id` não estiver em `idsValidos`**.
- `promptRoteiroFotos({ titulo, marca, modelo, categoria? })` → JSON
  `{"fotos":[{"titulo":"...","descricao":"..."}]}` (5 a 8 itens: capa fundo branco, frente,
  verso, detalhe de material/acabamento, escala/tamanho, em uso, o que acompanha).
- `lerRoteiroFotos(bruto)` → `{ titulo, descricao }[]` (vazio se ilegível).

### 2. `POST /api/anuncios/ia` (rota nova)

`body: { acao: 'descricao' | 'roteiro-fotos', titulo, marca?, modelo?, category_id?,
category_nome?, tem_fotos?: boolean }`.

- valida `acao` e `titulo` (>= 5 chars) → 400.
- `descricao` → `perguntarAoClaude(promptDescricaoNova(...), 4000)` →
  `{ sugestao: limparParaDescricao(bruto) }`.
- `roteiro-fotos` → `perguntarAoClaude(promptRoteiroFotos(...), 1500)` → `lerRoteiroFotos` →
  `{ fotos }`.
- sem `ANTHROPIC_API_KEY` → `perguntarAoClaude` lança; devolver 503
  `{ erro: 'Claude não configurado (ANTHROPIC_API_KEY).' }`.
- Não precisa de `comConta` (não chama o ML).

### 3. `GET /api/anuncios/categoria` — Claude escolhe o melhor

Depois de montar `sugestoes` do `domain_discovery`:

```ts
let escolha: { category_id: string; motivo: string } | null = null;
if (temIA() && sugestoes.length > 1) {
  try {
    const bruto = await perguntarAoClaude(
      promptEscolhaCategoria(q, sugestoes.map((s) => ({ category_id: s.category_id!, category_name: s.category_name ?? s.domain_name ?? '' }))),
      500,
    );
    escolha = lerEscolhaCategoria(bruto, sugestoes.map((s) => s.category_id!));
  } catch { /* segue sem escolha destacada */ }
}
return NextResponse.json({ sugestoes, escolha });
```

Compatível: quem já consome `{ sugestoes }` continua funcionando; `escolha` é opcional.

### 4. `CriarAvulso.tsx`

- **Categoria**: quando a resposta trouxer `escolha`, mostrar em destaque um botão
  "IA recomenda: `{category_id}` — `{motivo}`" que seta a categoria; a lista fica como
  alternativas (como hoje).
- **Fotos**: botão "Roteiro de fotos (IA)" → `POST /api/anuncios/ia {acao:'roteiro-fotos'}` →
  renderiza a lista `titulo`/`descricao` acima da textarea de URLs. Texto fixo: "a IA não gera
  as fotos — o ML exige foto real do produto; siga o roteiro e cole as URLs".
- **Descrição**: botão "Gerar com IA" → `POST /api/anuncios/ia {acao:'descricao'}` → preenche a
  textarea. Se já houver texto digitado, pedir confirmação antes de substituir (um segundo
  clique / um `window.confirm`).
- Todos os botões desabilitados enquanto `titulo.trim().length < 5`.

### 5. Testes (`tests/anuncios-ia.test.ts`)

- `lerEscolhaCategoria`: aceita `{category_id, motivo}` da lista; **rejeita id fora da lista**;
  tolera cercas ```` ```json ````.
- `lerRoteiroFotos`: parseia `{fotos:[...]}`; vazio se ilegível.
- `GET /api/anuncios/categoria`: com `ANTHROPIC_API_KEY` + mock do Claude devolvendo um id da
  lista → `escolha` preenchida; sem a chave → `escolha: null` e `sugestoes` intactas.
- `POST /api/anuncios/ia`: `acao:'descricao'` → `{ sugestao }` (passou por `limparParaDescricao`);
  `acao:'roteiro-fotos'` → `{ fotos: [...] }`; `acao` inválida / `titulo` curto → 400; sem chave
  → 503.
- Regressão: `tests/anuncios-avulso.test.ts` e `tests/anuncios.test.ts` seguem 100% verdes.

## STOP conditions

- Se `GET /api/anuncios/categoria` passar a FALHAR quando o Claude erra/estoura → PARE (o
  `domain_discovery` cru tem de continuar respondendo; a escolha da IA é best-effort).
- Nada de geração de imagem. Roteiro de fotos é texto.

## Out of scope

- Descrição por IA no fluxo avulso reusar o `montarContexto` do plano 025 (aquele exige um item
  já criado). Aqui é um prompt enxuto próprio.
- "Melhorar" a descrição depois (isso já é a tela `/itens/[id]/descricao`, no anúncio já criado).

## Git workflow

Branch `feat/029-ia-avulso` a partir de `feat/anuncio-fora-catalogo`. Commit + push + PR (ou
squash no PR do 029, a critério do Livio).
