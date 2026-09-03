# Plan 028: Camada de token pra conta ML de cliente do portal (f3c2)

> **Instruções ao executor**: siga cada passo, rode cada verificação. STOP condition = pare e
> reporte. Atualize `plans/README.md` ao terminar.
>
> **Risco: ALTO.** Mexe no pipeline de token do `client.ts` — a invariante AGENTS.md §1
> (`refresh_token` do ML é de uso único). Um bug aqui derruba silenciosamente o token de um
> cliente em produção. O guarda-costas é `tests/token-flow.test.ts` continuar 100% verde (o
> caminho dos robôs não pode mudar) + testes novos espelhando os mesmos comportamentos pro
> caminho do cliente.

## Status

- **Priority**: P1 · **Effort**: L · **Risk**: ALTA
- **Depends on**: 022 (OAuth portal), 023 (RLS/sessão), 027 (f3c1 — o cliente já conecta a conta)
- **Category**: feature/infra (kanban "Do Anúncio ao Portal", Fase 3, card f3c2)
- **Planned at**: 2026-09-03.

## Decisões de produto tomadas (o Livio delegou: "escolha as melhores práticas")

- **Escopo do cliente (decisão #4)**: um cliente do portal opera SÓ nas contas ML que ele mesmo
  conectou via OAuth (`contas_ml_clientes` com `cliente_id` dele). Nunca as contas dos robôs.
- **Escrita (decisão #5)**: no portal, título/descrição continuam **só geração** — a gravação no
  ML é revisada, um anúncio por vez (mesma decisão do plano 025 pro lote). "Aplicar em massa"
  não entra.
- Cadastro por convite (#1), cobrança depois (#2), branding = campo em `clientes` sem subdomínio
  (#3) — recomendações registradas no `plans/027`, viram f3c4/f3c5/f3c6, não são deste plano.

## Por que estender o `client.ts`, não duplicar

O motor (`carregarDiagnostico`, `gerarPropostaTitulo`, …) chama `mlFetch`/`getAccount` de
`./client`. Se o caminho do cliente for um `mlFetchCliente` paralelo, o motor **não** dá pra
reusar sem refatorar dezenas de funções — o que anula o trabalho de fronteira da Fase 1.

Então: **um pipeline só**. O `AsyncLocalStorage` (`escopo`) de `client.ts` passa a carregar
`universo: 'robos' | 'cliente'` (+ `clienteId`). `getAccount`/`refrescarUmaVez` ramificam por
`universo`. `mlFetch` fica **intocado** (ele só chama `getAccount`/`validToken`). Duas
implementações divergentes de refresh seriam o pesadelo do §1 — por isso, uma só.

## Current state (confirmar `file:line` antes de editar)

- `src/lib/ml/client.ts`:
  - `escopo = new AsyncLocalStorage<{ sellerId?: string; contaCache?: MlAccount | null }>()`
  - `comConta(sellerId, fn)` → `escopo.run({ sellerId, contaCache: null }, fn)`
  - `getAccount()` — scope.sellerId ‖ `ML_SELLER_ID_PADRAO`, query `contas`, cache no escopo
  - `validToken(conta)` — margem 10 min → `refrescarUmaVez(conta.seller_id)`
  - `refrescarUmaVez(sellerId)` — dedup `refreshEmVoo: Map<string, Promise<void>>` →
    `getAccount()` → `refreshAccessToken(refresh_token)` → `saveTokens(...)` → `getAccount()`
  - `saveTokens(...)` — `update('contas').eq('seller_id', …)` + `invalidarContaCache()`
  - `mlFetch` — `getAccount` → `validToken` → fetch → 401 → `refrescarUmaVez` → 1 retry
- `src/lib/ml/oauth.ts` — `refreshAccessToken(refreshToken)` usa `env.clientId`/`env.clientSecret`
  (ROBÔS). `exchangeCodeForToken` já usa `env.clientIdPortal`/`env.clientSecretPortal`.
- `src/lib/ml/clientAccounts.ts` — `salvarConexaoCliente` faz o insert/update de
  `contas_ml_clientes` no fluxo de conexão (não no refresh).
- `contas_ml_clientes` colunas: `id, cliente_id, seller_id, apelido, access_token,
  refresh_token, access_expira_em, conectado_em, atualizado_em`.

## Desenho

### 1. `oauth.ts` — `refreshAccessTokenPortal(refreshToken)`

Cópia de `refreshAccessToken` trocando `env.clientId`/`env.clientSecret` por
`env.clientIdPortal`/`env.clientSecretPortal`. (Não parametrizar a existente — manter o diff do
caminho dos robôs em zero.)

### 2. `client.ts` — escopo com `universo`

- `escopo` type: `{ sellerId?: string; contaCache?: MlAccount | null; universo?: 'robos' |
  'cliente'; clienteId?: number }`.
- `comConta` inalterado (universo `undefined` ⇒ tratado como `'robos'`).
- Novo `comContaCliente(clienteId: number, sellerId: string, fn)` →
  `escopo.run({ universo: 'cliente', clienteId, sellerId, contaCache: null }, fn)`. `sellerId`
  é obrigatório aqui (o cliente pode ter mais de uma conexão; quem chama diz qual).
- `getAccount()`:
  - `store?.universo === 'cliente'` → query `contas_ml_clientes` `.eq('cliente_id',
    store.clienteId).eq('seller_id', store.sellerId).not('access_token','is',null).limit(1)`.
    Mapear pro shape `MlAccount` (`org: null`). Cachear no escopo. Se não achar → `null` (quem
    chama trata: 403/aviso).
  - senão → comportamento atual.
- `refrescarUmaVez(sellerId)`:
  - lê `store?.universo`. Chave do dedup: `${universo}:${sellerId}` (seller_id nunca coincide
    entre os dois universos pelo §1, mas o prefixo deixa explícito).
  - universo `cliente` → `refreshAccessTokenPortal(atual.refresh_token)` + `saveTokensCliente(...)`.
  - universo `robos` → como hoje.
- `saveTokensCliente({ seller_id, access_token, refresh_token, expires_in })` — novo, ao lado de
  `saveTokens`: `update('contas_ml_clientes').eq('seller_id', …)` com o trio + `atualizado_em`,
  depois `invalidarContaCache()`. **Grava o par novo na MESMA linha** (§1).
- `validToken` e `mlFetch` — **sem mudança**.
- Comentário no topo do arquivo explicando que agora ele serve os dois universos, e por quê
  (motor reusável).

### 3. Nada de rota/UI neste card

Só a camada. Quem usa (`/api/portal/lote`, páginas do portal) é o f3c3. Um teste de fumaça
opcional: `comContaCliente(1, 'MLBSELLER', () => mlFetch('/items/X'))` num teste, com fake
`contas_ml_clientes`, provando que sai o token do cliente.

## Testes (`tests/token-cliente.test.ts`) — espelho do `token-flow.test.ts`

Com `injetarCliente` + fake `contas_ml_clientes` e `fetch` stub:

1. token válido (futuro) ⇒ usa direto, sem `/oauth/token`, sem escrita.
2. token vencido ⇒ 1 chamada a `/oauth/token` **com `client_id` do PORTAL** (assert no corpo),
   par novo gravado na MESMA linha de `contas_ml_clientes` (`filter.col === 'seller_id'`),
   requisição ao ML usa o token novo.
3. 401 do ML ⇒ refresh + 1 retry, mesma linha.
4. refresh concorrente (N chamadas, token vencido) ⇒ **1** `/oauth/token`, **1** update.
5. `getAccount` fora de `comContaCliente` (universo robôs) continua lendo `contas` — o caminho
   dos robôs não vazou pro outro universo.
6. `comConta` (robôs) dentro do mesmo processo de teste ⇒ `tests/token-flow.test.ts` **todo
   verde, sem alteração** (roda junto no `npm test`).

## STOP conditions

- Se qualquer teste de `tests/token-flow.test.ts` mudar de comportamento → PARE. O caminho dos
  robôs é intocável.
- Se o dedup `refreshEmVoo` não isolar os universos (um refresh de cliente reusando a promise de
  um robô, ou vice-versa) → PARE.
- Migração: este card **não** mexe no schema (só lê/grava colunas que já existem em
  `contas_ml_clientes`). `lotes.cliente_id` + policies são do f3c3.

## Git workflow

Branch a partir da `main` (ou empilhado no PR do 027 se ainda aberto). Commit + push + PR
próprio. **Não** mergear sem revisão humana — é §1.
