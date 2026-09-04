# Plan 027: Roteiro da Fase 3 — portal público multi-cliente

> **Este arquivo é um ROTEIRO, não um card único.** Fase 3 = "o portal vira produto": o cliente
> final entra, conecta a própria conta do Mercado Livre e usa o motor de análise/lote em cima
> dos anúncios dele, sem o Livio no meio. Depende de decisões de produto (abaixo) e mexe na
> camada de token, que é a mais perigosa do repo (AGENTS.md §1). Por isso: **pesquisado e
> desenhado, nada implementado** — cada card vira um plano `028+` próprio quando for a vez.
>
> **Drift check**: repo tem `.git` (`github.com/LivioRS/Checkup_Anuncios`). Estado lido em
> 2026-09-03, depois do merge do PR #1 (planos 019–025) e do PR do f2c3 (plano 026).

## Onde a Fase 1 e 2 deixaram

Já existe (planos 020–026):

- **`/portal/*`** — namespace do cliente final, gate por Supabase Auth no `middleware.ts`
  (`tratarRotaPortal`), separado do `PANEL_PASSWORD` do painel do Livio. Páginas: `login`,
  `cadastro` (self-service, 2 passos), `painel` (mínimo — só prova que a RLS isola por
  `auth.uid()`).
- **`clientes` / `contas_ml_clientes`** — tabelas isoladas de `contas` (robôs). RLS de verdade:
  `authenticated` só faz `select` da própria linha (via `auth_user_id` / join). Escrita só por
  `service_role` (`src/lib/portal/cadastro.ts`, `src/lib/ml/clientAccounts.ts`).
- **OAuth do ML pro portal** — app separado (`ML_CLIENT_ID_PORTAL` etc.), fluxo
  `authorization_code` em `src/lib/ml/oauth.ts` (`buildAuthorizationUrl`,
  `exchangeCodeForToken`, `assinarState`/`verificarState` — `state` HMAC, janela 10 min,
  payload = `cliente_id`). Rotas `/api/oauth/ml/authorize?cliente_id=N` → ML →
  `/api/oauth/ml/callback` → `salvarConexaoCliente` → redireciona pra `/clientes`.
- **Fila de lote** (`lotes`/`lote_itens`, `/api/lote*`, tela `/lote`) — hoje amarrada às contas
  dos ROBÔS (`comConta` + `getAccount` leem a tabela `contas`). `lotes` tem `seller_id`, **não**
  tem `cliente_id`. RLS ligada, **zero policy** (só `service_role`).
- **Motor de análise** (`carregarDiagnostico`, `gerarPropostaTitulo`, `gerarPropostaDescricao`,
  `attributes.ts`, …) — não importa Supabase (AGENTS.md §11), mas usa `mlFetch`/`getAccount`/
  `comConta` de `src/lib/ml/client.ts`, que **só** conhece a tabela `contas`.

## O buraco central

**Não existe caminho pra rodar o motor no nome de um cliente do portal.** `client.ts`
(`getAccount`, `validToken`, `refrescarUmaVez`, `saveTokens`, o dedup `refreshEmVoo`) é todo
escrito sobre `contas`. Pra Fase 3, um segundo universo de contas (`contas_ml_clientes`) precisa
do MESMO tratamento de refresh_token de uso único (AGENTS.md §1) — senão a renovação de token de
cliente vira corrida e derruba a conexão dele.

Esse é o card técnico que destrava todo o resto. Os outros cards são UI ou decisão de produto.

## Cards propostos (ordem sugerida)

### f3c0 — BUG achado na pesquisa: `/api/portal/*` cai no gate errado do middleware

`src/middleware.ts` faz `if (pathname.startsWith('/portal')) return tratarRotaPortal(req)`. Mas
`/api/portal/completar-cadastro` e `/api/portal/logout` **não** começam com `/portal` (começam
com `/api`), então caem no gate do `PANEL_PASSWORD`. Em produção, com `PANEL_PASSWORD` setado e
sem cookie `painel` (um cliente puro do portal nunca tem esse cookie), o POST de logout e o de
completar-cadastro são redirecionados (302) pra `/login` — logout falha calado, e o cadastro
self-service quebra no passo 2. Provavelmente não pegou antes porque o "fluxo de browser de
verdade" do plano 023 nunca foi testado (está lá nas STOP conditions do 023).

**Correção** (pequena, isolada — pode virar um plano curto sozinho, ou entrar no f3c1):

```ts
// middleware(), antes do gate do PANEL_PASSWORD:
if (pathname.startsWith('/portal') || pathname.startsWith('/api/portal')) {
  return tratarRotaPortal(req);
}
```

E em `tratarRotaPortal`, quando não há `user`: se `pathname.startsWith('/api/')` → responder
`401` JSON (não redirect); senão manter o redirect pra `/portal/login`. `/api/portal/logout` e
`/api/portal/completar-cadastro` já rodam com a sessão Supabase setada pelo browser, então
passam.

### f3c1 — Cliente conecta a própria conta ML pelo portal (sem o Livio)

Hoje o "Conectar conta" sai da tela ADMIN `/clientes` (atrás do `PANEL_PASSWORD`) e confia num
`?cliente_id=N` na query — o que, exposto ao cliente, deixaria o cliente A conectar uma conta na
linha do cliente B.

- `GET /api/portal/ml/conectar` — lê a sessão Supabase, resolve `clientes.id` do próprio usuário
  (query com o cliente RLS-scoped → só devolve a linha dele), assina o `state` com esse id (e um
  campo `origem: 'portal'`), redireciona pro ML. **Sem query param de cliente_id.**
- `assinarState`/`verificarState` (`oauth.ts`) ganham o campo `origem` (`'portal'` | `'admin'`).
  Retrocompatível: state sem `origem` = `'admin'`.
- `/api/oauth/ml/callback` — mesmo callback (o ML só aceita 1 `redirect_uri` por app), mas ao
  fim redireciona pra `/portal/painel?aviso=...` quando `origem === 'portal'`, senão `/clientes`
  como hoje.
- `/portal/painel` — botão "Conectar conta do Mercado Livre" → `/api/portal/ml/conectar`; lê
  `?aviso=` e mostra o `Selo` (reusar o mapa de `AVISOS` de `/clientes`, extraído pra um módulo
  compartilhado).
- Depende do f3c0 (senão `/api/portal/ml/conectar` cai no gate errado).
- Teste: `assinarState`/`verificarState` com `origem` (roundtrip + retrocompat), e a rota
  `conectar` resolvendo `cliente_id` da sessão (mock do cliente Supabase).

### f3c2 — Camada de token pra `contas_ml_clientes` (o card técnico central)

Espelho de `src/lib/ml/client.ts` pra o universo do portal. **Não** reescrever `client.ts` —
criar um paralelo (`src/lib/ml/clientPortal.ts`?) ou generalizar `client.ts` pra receber "qual
tabela" via o escopo do `comConta`. Precisa de:

- `getContaCliente(clienteId)` — lê `contas_ml_clientes` (service_role; ou o cliente RLS-scoped
  se a chamada nasce de uma request do portal).
- `validTokenCliente` / `refrescarUmaVezCliente` — MESMO dedup `refreshEmVoo` por `seller_id`,
  MESMA regra de gravar o par novo na mesma linha (`salvarConexaoCliente` já faz o update).
  AGENTS.md §1 vale igual aqui.
- `comContaCliente(clienteId, fn)` / um `mlFetch` que use o token do cliente.
- Como o motor (§11) só fala com `client.ts`: a saída limpa é o `AsyncLocalStorage` do
  `comConta` carregar não só `sellerId` mas "de qual universo" — aí `getAccount`/`mlFetch`
  despacham. Decisão de design a fechar no plano do card.
- Teste pesado: refresh concorrente roda 1x, 401 → 1 retry, par novo na mesma linha de
  `contas_ml_clientes` — os mesmos testes de `tests/token-flow.test.ts`, adaptados.
- **Risco ALTO** — é a invariante §1. Card que mais precisa de revisão humana antes de mergear.

### f3c3 — Lote e motor no nome do cliente + RLS de `lotes`/`lote_itens`

- Coluna `lotes.cliente_id bigint references clientes(id)` (nullable — lote dos robôs continua
  com `cliente_id null`).
- Policies: `authenticated` faz `select`/`insert` de `lotes`/`lote_itens` só quando o
  `cliente_id` (via join) casa com `auth.uid()` — mesmo padrão do plano 023.
- `POST /api/portal/lote` — cria lote com `cliente_id` da sessão e `seller_id` de uma conexão
  do próprio cliente. O worker roda o item dentro de `comContaCliente(...)` (f3c2).
- Páginas `/portal/lote` e `/portal/lote/[id]` — versão da tela do plano 026 pro cliente
  (mesmos componentes, fonte de dados RLS-scoped).
- Seleção de anúncios: MVP = colar códigos (igual `/lote`); busca/checkbox rica fica pra depois.
- Depende de f3c1 + f3c2.

### f3c4 — Cadastro: self-service vs. convite + estados de conta

- Decisão de produto (ver abaixo). Hoje o cadastro é self-service aberto
  (`/portal/cadastro`). Se for só-convite: o Livio cria o `clientes` + manda um link/senha; a
  página de cadastro vira "aceitar convite".
- `clientes.status` (`ativo`/`suspenso`/`cancelado`) já existe mas **nada checa** — um cliente
  `suspenso` ainda entra. Um gate no `tratarRotaPortal` (ou nas rotas do portal) que barra
  status ≠ `ativo`.

### f3c5 — Branding / subdomínio por cliente

- Decisão de produto (ver abaixo). Escopo varia MUITO: de "logo + nome da loja no topo do
  portal" (barato, só um campo em `clientes` + leitura no layout) a "subdomínio próprio
  `cliente.checkup.app` com wildcard DNS + certificado" (infra, fora do que dá pra fazer só em
  código).

### f3c6 — Cobrança / assinatura

- Decisão de produto (ver abaixo). Provavelmente um provedor externo (Stripe/Pagar.me) +
  webhook mexendo em `clientes.status`. Card grande, independente do resto — pode vir por
  último.

## Decisões de produto que eu preciso de você antes de virar plano

1. **Cadastro**: self-service aberto (qualquer um cria conta) ou só-convite (você cria o
   cliente, ele recebe link)? Isso muda o f3c4 inteiro.
2. **Cobrança**: entra na Fase 3 ou fica pra depois de ter os primeiros clientes reais usando de
   graça? Se entra: qual provedor?
3. **Branding**: MVP é só "nome/logo da loja no topo do portal", ou você quer subdomínio
   próprio por cliente desde já? (o segundo puxa infra de DNS/cert, não é só código).
4. **Quem opera o quê**: o cliente do portal roda diagnóstico/título/descrição SÓ nos anúncios
   da conta ML que ele conectou, certo? (confirmação — muda a modelagem de permissão).
5. **Escrita**: no portal do cliente, título/descrição continuam "só gera, gravação manual um a
   um" (como o plano 025 decidiu pro lote), ou o cliente pode aplicar? (mudança de produto).

## Ordem sugerida

```
f3c0 (bug middleware)  ──►  f3c1 (conectar conta)  ──►  f3c2 (token layer)  ──►  f3c3 (lote/RLS)
                                                                                    │
f3c4 (cadastro/status) ◄────────────────────────────────────────────────────────────┤
f3c5 (branding)         ◄───────────────────────────────────────────────────────────┤
f3c6 (cobrança)         ◄───────────────────────────────────────────────────────────┘
   (f3c4/5/6 dependem das decisões acima, não de f3c3)
```

f3c0 e f3c1 dá pra fazer já (mecânico, baixo risco). f3c2 é o gargalo e o de maior risco. f3c4–6
esperam suas respostas.
