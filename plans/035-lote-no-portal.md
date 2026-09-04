# Plan 035: Lote no portal do cliente (f3c3)

> **Instruções ao executor**: siga na ordem. STOP condition = pare e reporte. Atualize
> `plans/README.md` ao terminar. Gate obrigatório do AGENTS.md em tudo
> (`npm run build && npm run lint && npm run verificar && npm test`). Tem git de verdade —
> branch + commit + PR.

## O que é

O card f3c3 do roteiro da Fase 3 (`plans/027-fase-3-roteiro.md`): levar a operação em lote
(diagnóstico / geração de título / geração de descrição — planos 024–026) pro `/portal/*`,
rodando na conta ML que o **cliente** conectou (`contas_ml_clientes`, via `comContaCliente`,
plano 028), com as mesmas telas de criar/acompanhar do plano 026. Zero mudança no fluxo admin
(`/lote`).

## Pré-requisito

`feat/f2c3-tela-progresso-lote` (026) rebasado na `main` atual e verificado (feito nesta mesma
passada, empilhado sobre 027+028+034 já mergeados). Sem 026 mergeado não há tela pra espelhar —
o admin ainda cria lote só via `curl`.

## Migração

```sql
alter table public.lotes add column if not exists cliente_id bigint references public.clientes(id);
```

Aditiva, nullable — lote do admin (robôs) continua com `cliente_id null`.

**Sem policy de RLS nova** — decisão deliberada, não omissão. O roteiro (027) sugeria RLS de
`lotes`/`lote_itens` por `cliente_id`, mas o plano 034 já estabeleceu o padrão deste repo pra
tabela de log/estado do fluxo de criação: `anuncio_criacoes`/`ficha_edits` seguem
service_role-only (zero policy) porque **o portal lê/grava por rota, nunca direto** — a
ownership é garantida no handler (`db()` + filtro explícito por `cliente_id` da sessão), não no
banco. `lotes`/`lote_itens` entram na mesma categoria por consistência: nenhuma página do portal
lê essas tabelas com o cliente Supabase da sessão, só via `/api/portal/lote/**`. RLS por cliente
fica pra quando/se existir uma tela que leia direto (fora de escopo aqui, como em 034).

## Desenho

### 1. `src/lib/lotes/fila.ts`

- `criarLote` ganha `clienteId?: number` → grava `cliente_id: input.clienteId ?? null`.
- `Lote`/`LoteComContagens` ganham `cliente_id: number | null`; `buscarLote` seleciona a coluna.

### 2. `src/lib/lotes/autorizacao.ts` (novo, adapter)

```ts
export async function loteDoCliente(loteId: string, clienteId: number): Promise<LoteComContagens | null>
```

Busca o lote e devolve `null` se não existir OU se `cliente_id` não bater com o da sessão — as
4 rotas do portal (`GET [id]`, `GET [id]/itens`, `POST [id]/processar`, `POST [id]/reenfileirar`)
usam isso pra devolver 404 sem vazar se o id existe.

### 3. `src/lib/lotes/processarNucleo.ts` (novo, extraído do worker admin)

Núcleo do `POST /api/lote/[id]/processar` — a MESMA função `processarItem` (diagnóstico/título/
descrição) que hoje mora inline na rota. Assinatura:

```ts
export async function processarPassoDoLote(
  loteId: string,
  resolverEscopo: (lote: LoteComContagens) => NextResponse | (<T>(fn: () => Promise<T>) => Promise<T>),
): Promise<NextResponse>
```

Busca o lote, chama `resolverEscopo(lote)` — admin devolve `(fn) => comConta(lote.seller_id, fn)`
direto; portal já resolveu `clienteId` da sessão ANTES de chamar (assíncrono não cabe aqui) e
devolve `(fn) => comContaCliente(clienteId, lote.seller_id, fn)`, ou um `NextResponse` 404 se
`lote.cliente_id` não bater. Roda `proximosPendentes` + os itens dentro do escopo devolvido +
`fecharSeCompleto`, como hoje. `POST /api/lote/[id]/processar` (admin) vira wrapper fino.

### 4. Rotas novas `src/app/api/portal/lote/**`

| admin | portal | diferença |
|---|---|---|
| `POST /api/lote` | `POST /api/portal/lote` | `seller_id`/`clienteId` da sessão (`resolverContaDoClienteLogado`), não do corpo |
| `GET /api/lote/[id]` | `GET /api/portal/lote/[id]` | `loteDoCliente` — 404 se não é do cliente logado |
| `GET /api/lote/[id]/itens` | `GET /api/portal/lote/[id]/itens` | idem |
| `POST /api/lote/[id]/processar` | `POST /api/portal/lote/[id]/processar` | `processarPassoDoLote` com escopo do cliente |
| `POST /api/lote/[id]/reenfileirar` | `POST /api/portal/lote/[id]/reenfileirar` | `loteDoCliente` antes de reenfileirar |

Sem sessão → 401; lote de outro cliente ou inexistente → 404 (mesma mensagem — não revela se o
id existe).

### 5. Componentes (`src/app/lote/`)

`CriarLote`/`AcompanharLote` ganham prop `base` (default `/api/lote`) — troca as URLs literais de
fetch. `AcompanharLote` ganha `ferramentasInternas` (default `true`) — esconde o link do item pra
`/itens/{id}` (tela só-admin) quando renderizado no portal (mostra só o código, sem link).

### 6. Páginas do portal

- `src/app/portal/lote/page.tsx` — mesmo formato de `src/app/portal/criar/page.tsx` (sessão →
  `conexoesDoClienteLogado()`; 0 → "conecte uma conta"; ≥1 → `<CriarLote contas={...}
  base="/api/portal/lote" />`).
- `src/app/portal/lote/[id]/page.tsx` — busca via `loteDoCliente` com o clienteId da sessão
  (não `buscarLote` direto); 404 se não é do cliente. `<AcompanharLote ... base="/api/portal/lote"
  ferramentasInternas={false} />`.
- `/portal/painel`: link "Ver lotes" ao lado de "Criar anúncio" (quando há conexão).

## STOP conditions

- Se `tests/lotes.test.ts`/`tests/lote-tela.test.ts` (admin) mudarem de comportamento → PARE.
- Se uma rota portal aceitar `seller_id`/`lote_id` sem validar contra o cliente logado → PARE.
- Se o worker do portal chamar `comConta` (universo robôs) em vez de `comContaCliente` → PARE.

## Fora de escopo

- Tela de listagem "meus lotes" — nem o admin tem (só cria/acompanha um de cada vez).
- RLS por cliente em `lotes`/`lote_itens` (ver decisão acima).
- Item de lote apontando pra anúncio de outra conta: mesmo fallback de leitura pública que
  `abrirAnuncio`/`carregarDiagnostico` já fazem hoje pro admin — não é comportamento novo deste
  plano, e nunca expõe token de terceiro (só dado já público no ML).

## Git workflow

Branch a partir de `feat/034-portal-anuncios` (já com 027+028+034 mergeados) rebasada na `main`
atual, empilhada com `feat/f2c3-tela-progresso-lote` (026) rebasado. Commit por camada. Push + PR.
