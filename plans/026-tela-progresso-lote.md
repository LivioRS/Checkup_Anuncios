# Plan 026: Tela de progresso do lote (f2c3)

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se um "STOP condition" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo tem `.git` (`github.com/LivioRS/Checkup_Anuncios`). Compare os trechos
> abaixo com `file:line` contra o arquivo vivo antes de editar.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: BAIXA — tudo é UI nova (`/lote`, `/lote/[id]`) e dois endpoints novos. Nada que já
  existe passa a depender disto; o worker (`/api/lote/[id]/processar`) e a fila (`fila.ts`) já
  estavam prontos desde os planos 024/025. O único acréscimo em código existente é 1 link no
  `layout.tsx` e 2 funções novas em `fila.ts` (sem tocar nas que já existem).
- **Depends on**: 024 (fila/worker) e 025 (`lotes.tipo` + geração de título/descrição).
- **Category**: feature/UI (kanban "Do Anúncio ao Portal", Fase 2, card 3 — f2c3)
- **Planned at**: 2026-09-03.

## Why this matters

f2c3 do quadro: **"Tela de progresso — barra de progresso, botão 'repetir só o que falhou'."**

Hoje o lote só existe via `curl`: `POST /api/lote` cria, `POST /api/lote/[id]/processar` roda um
item por chamada, e alguém precisa ficar repetindo a chamada até `status: "concluido"`. Sem tela,
o recurso dos planos 024/025 é inutilizável na prática. Este card fecha o loop: uma tela que
cria o lote, faz o "tique-taque" sozinha (chama `/processar` em intervalo) e mostra o resultado
item a item, com um botão pra re-enfileirar só os que deram `erro`.

## Current state

- `src/lib/lotes/fila.ts` — `criarLote`, `buscarLote` (devolve `LoteComContagens`: lote +
  `contagens` por status), `proximosPendentes` (SELECT + marca `processando`, loop `update` por
  `id`), `marcarConcluido`/`marcarErro`/`marcarParaRetentar`, `fecharSeCompleto`. **Não** existe
  função pra listar os itens com `resultado`/`erro`, nem pra re-enfileirar os `erro`.
- `src/app/api/lote/route.ts` — `POST` cria (aceita `seller_id`, `item_ids`, `tipo`).
- `src/app/api/lote/[id]/route.ts` — `GET` devolve `buscarLote` (só contagens, sem itens).
- `src/app/api/lote/[id]/processar/route.ts` — `POST` processa `CONCORRENCIA_PADRAO` (=1) item
  pendente e devolve o `buscarLote` atualizado.
- UI: páginas são Server Components que passam dados a um `'use client'` filho que faz `fetch`
  nas rotas `/api/*` (padrão de `src/app/criar/`). Componentes compartilhados em
  `src/components/ui.tsx`: `Secao`, `Selo`, `Medidor` (anel SVG — serve de barra de progresso),
  `Stat`. Classes CSS em `globals.css`: `card`, `btn primary`/`btn pequeno`, `campo`/`rot`/`ctrl`,
  `grid k2`, `rolagem`, `tabela`, `sub`, `vazio`. Nav em `src/app/layout.tsx` (`<nav>` com 3
  links).

## Desenho

### 1. `fila.ts` — duas funções novas (não tocar nas existentes)

- `listarItensDoLote(loteId): Promise<LoteItem[]>` — `select('id, lote_id, item_id, status,
  tentativas, resultado, erro').eq('lote_id', loteId)`. Sem filtro de status, sem marcar nada.
- `reenfileirarErros(loteId): Promise<{ reenfileirados: number }>` — SELECT dos itens
  `status = 'erro'` do lote, depois `for` com `update({ status: 'pendente', tentativas: 0, erro:
  null }).eq('id', item.id)` (mesmo padrão do `proximosPendentes` — o fake de teste e o repo já
  usam loop por `id`, não `update` multi-linha). Se re-enfileirou ≥ 1, também
  `update({ status: 'em_andamento' }).eq('id', loteId)` na tabela `lotes`. Devolve a contagem.

### 2. Endpoints novos

- `GET /api/lote/[id]/itens` — `{ itens: LoteItem[] }` via `listarItensDoLote`. 404 se
  `buscarLote` devolver null.
- `POST /api/lote/[id]/reenfileirar` — chama `reenfileirarErros`, devolve
  `{ reenfileirados, lote: <buscarLote atualizado> }`. 404 se lote não existe.

### 3. Página `/lote` (criar)

Server Component `src/app/lote/page.tsx`: `listarContas()` (igual `criar/page.tsx`), trata falha/
lista vazia igual. Passa `contas` pro client `CriarLote`.

`src/app/lote/CriarLote.tsx` (`'use client'`):
- `select` de conta (igual `CriarAnuncio`), `select` de `tipo`
  (`diagnostico` | `titulo` | `descricao`), `textarea` de item_ids (um por linha; ignora linhas
  vazias e espaços).
- Botão "Criar e acompanhar" → `POST /api/lote` `{ seller_id, item_ids, tipo }` →
  `router.push('/lote/' + json.lote_id)`. Erro: mostra `descreverErro` (helper igual ao de
  `CriarAnuncio` — copiar, não importar de lá).
- Aviso fixo na tela: **"Título e descrição só GERAM a proposta — nada é gravado no anúncio.
  A gravação continua manual, um a um."** (deixa a decisão de produto do plano 025 visível).

### 4. Página `/lote/[id]` (acompanhar)

Server Component `src/app/lote/[id]/page.tsx`: `buscarLote(id)` + `listarItensDoLote(id)` pro
estado inicial (404 → `<Secao>` "lote não encontrado"). Passa pro client `AcompanharLote`.

`src/app/lote/[id]/AcompanharLote.tsx` (`'use client'`):
- Estado: `lote` (com `contagens`), `itens`, `rodando` (bool), `erro`.
- **Tique-taque**: `useEffect` que, enquanto `lote.status !== 'concluido'` e `rodando`, chama
  `POST /api/lote/[id]/processar`, atualiza `lote` com a resposta, e re-busca
  `GET /api/lote/[id]/itens`; agenda a próxima com `setTimeout(~900ms)`. `rodando` começa
  `true` se o lote está `em_andamento`. Botão "Pausar"/"Retomar" alterna `rodando`. Limpa o
  timeout no cleanup do effect (sem corrida ao desmontar).
- **Progresso**: `<Medidor rotulo="concluídos" valor={concluido} max={total} sufixo="" />` +
  fileira de `<Selo>` por status (`pendente`, `processando`, `concluido` nível bom, `erro` nível
  crítico). Texto "X de Y processados".
- **Tabela de itens** (`rolagem`/`tabela`): `item_id` (link pra `/itens/<id>` quando fizer
  sentido), `status` (`Selo`), e um `<details>` "resultado" que mostra:
  - tipo `diagnostico` → `<pre>` com `JSON.stringify(resultado, null, 2)` (cru; formatar bonito
    é fora de escopo — o dado já é o mesmo do `/itens/[id]/diagnostico`).
  - tipo `titulo` → lista `resultado.plano.titulos[].texto` + `resultado.plano.modelo?.base`.
  - tipo `descricao` → `<pre>` com `resultado.sugestao` (texto puro).
  - `erro` → o texto do `erro` num `Selo nivel="critico"` + `<pre>`.
- **Reenfileirar**: se `contagens.erro > 0`, botão "Reenfileirar os {n} que falharam" →
  `POST /api/lote/[id]/reenfileirar` → aplica a resposta e liga `rodando`.
- Link "novo lote" → `/lote`.

### 5. `layout.tsx` — 1 link novo no `<nav>`: `<Link href="/lote">Lote</Link>`.

### 6. Testes (`tests/lote-tela.test.ts`)

- `listarItensDoLote` devolve todos os itens do lote (fake supabase).
- `reenfileirarErros`: só os `erro` voltam a `pendente` com `tentativas: 0`; `concluido` fica
  intocado; `lotes.status` volta a `em_andamento`; devolve a contagem certa; lote sem `erro`
  devolve `{ reenfileirados: 0 }` e **não** escreve em `lotes`.
- `GET /api/lote/[id]/itens` — 200 com `{ itens }`; 404 pra lote inexistente.
- `POST /api/lote/[id]/reenfileirar` — 200 com `{ reenfileirados, lote }`; 404 pra inexistente.
- **Não** testa o componente React (o repo não tem React Testing Library; padrão do repo é testar
  lógica/rotas). O "tique-taque" é exercitado só manualmente.

## STOP conditions

- Se `npm run build`/`lint`/`verificar`/`test` não passar → não está pronto.
- Se `reenfileirarErros` precisar de `update` multi-linha (o fake não suporta) → usar o loop por
  `id`, não mudar o fake.
- Não tocar em `criarLote`/`buscarLote`/`proximosPendentes`/`processar` — este card só ADICIONA.

## Out of scope

- Seleção de anúncios por busca/checkbox (colar item_ids num textarea basta pro f2c3; a seleção
  rica é Fase 3 / portal).
- Relatório exportável (CSV/planilha) — é o f2c4.
- Formatar bonito o `resultado` de diagnóstico — a tela `/itens/[id]/diagnostico` já faz isso pra
  um anúncio; reaproveitar aqui é trabalho à parte.
- Concorrência > 1 no worker, cron, WebSocket/SSE pra progresso ao vivo — `setTimeout` + re-fetch
  é suficiente e não muda o worker.
- RLS por cliente em `lotes`/`lote_itens` — só quando o portal (Fase 3) disparar lote.

## Git workflow

Branch a partir do branch do 025 (`feat/do-anuncio-ao-portal-f1-f2`) ou de `main` se o PR do 025
já tiver mergeado. Commit + push + PR próprio, dependente do PR do 025 se ainda aberto.
