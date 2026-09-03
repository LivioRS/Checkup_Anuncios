# Plan 034: Levar "criar anúncio" (029–033) pro portal do cliente

> **Instruções ao executor**: siga na ordem. STOP condition = pare e reporte. Atualize
> `plans/README.md` ao terminar. Gate obrigatório do AGENTS.md em tudo
> (`npm run build && npm run lint && npm run verificar && npm test`). Tem git de verdade —
> branch + commit + PR.

## O que é

Hoje o fluxo de criação de anúncio (`/criar` → "Do catálogo" / "Fora do catálogo" + IA + ficha
por GTIN + ficha da web + roteamento — planos 019, 029–033) roda **só no painel admin**, atrás
do `PANEL_PASSWORD`, operando nas contas dos ROBÔS (tabela `contas`, via `comConta`).

Este plano replica o mesmo fluxo dentro de `/portal/*` para o **cliente logado**, operando na
conta ML que **ele** conectou (`contas_ml_clientes`, via `comContaCliente`). Zero mudança no
fluxo admin.

## Pré-requisitos (fazer ANTES)

1. **Mergear o plano 027** (`feat/fase3-conectar-conta`) — traz o **f3c0** (o `middleware.ts`
   passa a rotear `/api/portal/*` pelo gate de sessão, não pelo `PANEL_PASSWORD`; sem isso as
   rotas novas deste plano caem no gate errado) e o **f3c1** (o cliente já consegue conectar
   uma conta ML pelo `/portal/painel`). Rebasar na `main` atual primeiro.
2. **Mergear o plano 028** (`feat/f3c2-token-cliente`) — traz `comContaCliente(clienteId,
   sellerId, fn)` + `contaDoCliente` + `saveTokensCliente` em `src/lib/ml/client.ts`. **É §1 —
   revisar com calma antes.** Rebasar na `main` atual primeiro.
3. Confirmar que o portal funciona de ponta a ponta: app do ML do portal registrado no
   DevCenter, `ML_CLIENT_ID_PORTAL`/`SECRET`/`REDIRECT_URI_PORTAL` no `.env.local`, um cliente
   de teste criado (`clientes` + `auth.users`) com uma conexão em `contas_ml_clientes`
   (dívida de verificação dos planos 022/023). Sem isso, este plano compila e passa nos testes
   com mock, mas não dá pra testar no navegador.

## Migração

```sql
alter table public.anuncio_criacoes add column if not exists cliente_id bigint references public.clientes(id);
alter table public.ficha_edits add column if not exists cliente_id bigint references public.clientes(id);
```

Aditivo, nullable — o fluxo admin continua gravando `cliente_id null`. Entregar o SQL pro Livio
rodar no SQL Editor do Supabase (a ferramenta de migração do MCP fica bloqueada) e anexar em
`supabase/schema.sql`.

## Desenho

### 1. Adapter novo: `src/lib/portal/contaAtiva.ts`

```ts
import 'server-only';
// resolve, a partir da sessão Supabase, a conexão ML ativa do cliente logado.
export type ContaAtivaCliente = { clienteId: number; sellerId: string; apelido: string | null };

// Lista as conexões do cliente logado (pra dropdown quando ele tem mais de uma).
export async function conexoesDoClienteLogado(): Promise<ContaAtivaCliente[]>
// Resolve UMA conexão: a de `sellerId` se passado e pertencer ao cliente, senão a primeira.
export async function contaAtivaDoClienteLogado(sellerId?: string): Promise<ContaAtivaCliente | null>
// Açúcar: roda `fn` dentro de `comContaCliente(clienteId, sellerId, fn)`.
export async function comContaDoClienteLogado<T>(sellerId: string | undefined, fn: () => Promise<T>): Promise<{ conta: ContaAtivaCliente; resultado: T } | { erro: 'sem_sessao' | 'sem_conexao' | 'seller_alheio' }>
```

- Sessão via `supabaseServidor()` (`src/lib/supabase/server.ts`) → `clientes.id` do usuário
  (query RLS-scoped, igual `/portal/painel`).
- Conexões: `contas_ml_clientes` do `cliente_id` — pode ler pela sessão (RLS já libera `select`)
  ou por `db()` service_role; padronizar com o que `/portal/painel` já faz (sessão).
- **`sellerId` sempre validado contra as conexões do cliente** — nunca confiar no corpo/query.

### 2. Parametrizar os componentes de criação (`src/app/criar/`)

Adicionar prop `base?: string` (default `'/api/anuncios'`) em `CriarModos`, `CriarAnuncio`,
`CriarAvulso`. Trocar TODA URL literal `fetch('/api/anuncios/...')` /
`fetch('/api/catalogo/buscar?...')` por `` `${base}/...` `` (o portal passa
`base="/api/portal/anuncios"` e a busca de catálogo vira `${base}/catalogo/buscar`).

- `CriarAnuncio`: `buscar()` → `${base}/catalogo/buscar`; `criar()` → `${base}` (POST). (No admin
  `base='/api/anuncios'` → `/api/anuncios` como hoje; a busca hoje é `/api/catalogo/buscar` —
  criar um alias `GET /api/anuncios/catalogo/buscar` que reexporta, OU aceitar
  `base='/api/catalogo'` só pra busca. Detalhe a fechar no Step 2; o mais limpo é o portal ter
  `/api/portal/anuncios/catalogo/buscar` e o admin manter `/api/catalogo/buscar` via um
  `baseCatalogo` prop separado, default `/api/catalogo`.)
- `CriarAvulso`: `sugerirCategoria`, `buscarFichaGtin`, `chamarIa`, `preencherComIa`,
  `buscarFichaWeb`, `criar` — todas usam `${base}/...`.
- **Nada de comportamento novo** no admin: só a URL fica parametrizável. Rodar os testes de
  `tests/anuncios*.test.ts` (que batem nas rotas admin diretamente, não nos componentes) →
  continuam iguais.

### 3. Rotas do portal: `src/app/api/portal/anuncios/**`

Espelho fino de cada rota de `src/app/api/anuncios/**`, com 3 diferenças mecânicas:

| rota admin | rota portal | diferença |
|---|---|---|
| `POST /api/anuncios` (catálogo) | `POST /api/portal/anuncios/catalogo` | ML via `comContaCliente`; `seller_id` da sessão; log com `cliente_id` |
| `POST /api/anuncios/avulso` | `POST /api/portal/anuncios/avulso` | idem |
| `GET /api/anuncios/categoria` | `GET /api/portal/anuncios/categoria` | ML via `comContaCliente` (ou sem conta, igual hoje) |
| `GET /api/anuncios/ficha-por-gtin` | `GET /api/portal/anuncios/ficha-por-gtin` | ML via `comContaCliente` |
| `POST /api/anuncios/rascunho` | `POST /api/portal/anuncios/rascunho` | as partes que batem no ML via `comContaCliente` |
| `POST /api/anuncios/ia` | `POST /api/portal/anuncios/ia` | **não bate no ML** — só sessão-gate + mesma lógica |
| `POST /api/anuncios/ficha-web` | `POST /api/portal/anuncios/ficha-web` | idem |
| `GET /api/catalogo/buscar` | `GET /api/portal/anuncios/catalogo/buscar` | ML via `comContaCliente` |

Padrão de cada handler portal:

```ts
const r = await comContaDoClienteLogado(sellerIdOpcional, async () => { /* mesma lógica */ });
if ('erro' in r) return 401/409 conforme r.erro;  // sem_sessao=401, sem_conexao/seller_alheio=409
// r.conta.sellerId é o seller de verdade; nunca o do corpo.
```

Pra evitar duplicar 200 linhas por rota: extrair o **corpo** de cada handler admin pra uma
função pura reaproveitável (como o plano 025 fez com `gerarPropostaTitulo`), e o handler
(admin e portal) vira um wrapper que só resolve a conta e chama. Fazer isso pelo menos pra
`avulso` (a maior). Pras menores, copiar é aceitável — decidir caso a caso, sem duplicar
lógica de negócio de verdade.

- **`seller_id` no corpo/query das rotas portal é IGNORADO** (a não ser como "qual das minhas
  conexões" — e mesmo aí, validado). Documentar no topo de cada rota.
- **Invariante do 019/029 continua**: anúncio nasce `paused`, PUT de pausa se o ML ignorar,
  tudo logado (agora com `cliente_id`).
- `registrarCriacaoAnuncio` / `registrarEscrita` (`src/lib/auditoria.ts`) ganham `clienteId?:
  number` opcional → `cliente_id` no insert (nullable; admin passa `undefined`).

### 4. Páginas do portal

- `src/app/portal/criar/page.tsx` (server component): `clienteAutenticado()` senão
  `redirect('/portal/login')`; `conexoesDoClienteLogado()`.
  - 0 conexões → tela "Conecte uma conta do Mercado Livre primeiro" + link pro
    `/api/portal/ml/conectar` (f3c1).
  - ≥1 → `<CriarModos base="/api/portal/anuncios" baseCatalogo="/api/portal/anuncios/catalogo"
    contas={conexoes.map(c => ({ id, seller_id: c.sellerId, apelido: c.apelido, org: null }))} />`.
- `src/app/portal/painel/page.tsx`: botão/link "Criar anúncio" → `/portal/criar` (só se tiver
  conexão).
- Nav do portal: se existir um layout/nav de `/portal/*`, adicionar "Criar anúncio"; senão,
  link no painel basta.

### 5. Testes

- `tests/portal-anuncios.test.ts`:
  - cada rota portal **sem sessão** → 401 (mock de `supabaseServidor`/`clienteAutenticado`
    devolvendo `null` — ver como `tests/portal-cadastro.test.ts` lida; se não der pra mockar a
    sessão, testar `contaAtiva.ts` isolado com o fake do Supabase + um cliente Supabase falso).
  - `POST /api/portal/anuncios/avulso` com sessão + 1 conexão: o ML é chamado com o token do
    **cliente** (`comContaCliente`), `seller_id` do corpo é ignorado, o log em `anuncio_criacoes`
    leva `cliente_id`. (Reusar o fake de `contas_ml_clientes` do `tests/token-cliente.test.ts`.)
  - `seller_id` do corpo apontando pra uma conexão de OUTRO cliente → 409, sem chamar o ML.
- `tests/anuncios-avulso.test.ts` + `tests/anuncios*.test.ts` (admin) → **100% verdes, sem
  alteração** (STOP condition).

## STOP conditions

- Se qualquer teste admin de `tests/anuncios*.test.ts` mudar de comportamento → PARE.
- Se uma rota portal aceitar `seller_id` do corpo sem validar contra as conexões do cliente →
  PARE (um cliente conectaria/gravaria na conta ML de outro).
- Se uma rota portal chamar `mlFetch`/`comConta` (universo robôs) em vez de `comContaCliente` →
  PARE (§1 + isolamento de cliente).
- Se o anúncio criado pelo portal puder nascer não-pausado → PARE.
- Sem os planos 027 e 028 mergeados/rebasados → PARE (dependência real).

## Out of scope

- Lote no portal (`/portal/lote*`) — é o f3c3 do `plans/027-fase-3-roteiro.md`, plano próprio.
- RLS de `anuncio_criacoes`/`ficha_edits` por cliente — hoje são service_role-only (zero policy),
  igual no admin; o portal lê/grava via rota, não direto. Entra quando/se o cliente for ver o
  próprio histórico (outra tela).
- Branding/nome de loja na tela do portal — f3c5.
- Escrita de título/descrição em lote no portal — segue a decisão do 025 (só geração).

## Git workflow

Branch a partir da `main` **depois** de 027 e 028 mergeados. Commit por camada (adapter →
componentes parametrizados → rotas portal → páginas). Push + PR.
