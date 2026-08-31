# Plan 001: Baseline de verificação + harness de testes de token e mutação

> **Instruções ao executor**: siga cada passo em ordem, rode cada comando de verificação e
> confirme o resultado esperado antes de avançar. Se algo em "STOP conditions" ocorrer, pare
> e reporte — não improvise. Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check**: este repo NÃO é git. Antes de editar, compare os trechos de "Current state"
> (com `file:line`) contra o arquivo vivo; divergiu → STOP e reporte.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: tests
- **Planned at**: sem git (2026-08-28)

## Why this matters

O único comando de teste hoje é `npm run verificar` (`node --experimental-strip-types
scripts/verificar-ficha.mjs`), que cobre SÓ lógica pura (`model.ts`, `catalogo-tipos.ts`,
`tags.ts`, `perguntas.ts`, `ia-tipos.ts`, `loja.ts`). **Zero cobertura** sobre o caminho
crítico: refresh/rotação do token (uso único), as rotas que mutam anúncios reais (titulo,
ficha, descrição, fotos, catálogo) e a leitura/escrita em Supabase. Um bug aí altera anúncio
de verdade (ou queima o `refresh_token` compartilhado com os robôs) sem nenhuma rede de
regressão. Este plano cria o baseline que os planos 002, 006, 012, 013 e 015 exigem.

## Current state

- `scripts/verificar-ficha.mjs` — o único teste; roda com `npm run verificar`; usa
  `--experimental-strip-types` e importa `.ts` via strip-types. Re-implementa lógica de
  produção em vez de importá-la (ex.: `ler` re-implementa o leitor de erro do ML; `grudar`
  re-implementa `grudarBlocos` de `ia.ts`; `sincronizar` re-implementa o sync do FichaForm).
- `src/lib/ml/client.ts` — `mlFetch` aceita `RequestInit` e chama `fetch` global:
  `client.ts:136` `fetch(path..., { ...init, headers, cache })`. É a unidade a testar
  (refresh antes de expirar em `validToken` `client.ts:102`; retry 401 + re-rotar em
  `client.ts:151`; `saveTokens` em `client.ts:83` grava na MESMA linha de `contas`).
- `src/lib/supabase.ts` — `db()` exporta um cliente Supabase `createClient` (service_role).
- `src/lib/ml/oauth.ts` — `refreshAccessToken(refresh_token)` faz o POST de refresh.
- Rotas de mutação (hoje sem teste): `src/app/api/itens/[id]/route.ts` (PUT atributos +
  log), `src/app/api/titulo/[id]/route.ts` (fallback `family_name`/title),
  `src/app/api/descricao/[id]/route.ts` (PUT + gate `temOrigem`),
  `src/app/api/imagens/[id]/route.ts` (pipeline sharp), `src/app/api/catalogo/[id]/vincular/route.ts`.

Comandos atuais: `npm run verificar` (smoke), `npm run build` (typecheck indireto),
`npm run dev`. Sem `tsc --noEmit` dedicado (ver plano 009).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke atual | `npm run verificar` | exit 0, todos os asserts passam |
| Instalar dev dep | `npm install --save-dev vitest` | exit 0 |
| Rodar testes novos | `npx vitest run` | exit 0, N testes passam |
| Build (sanity) | `npm run build` | exit 0 |

## Suggested executor toolkit

- Skill `test-driven-development` (RED-GREEN-REFACTOR) se disponível no ambiente.

## Scope

**In scope** (arquivos que você pode criar/editar):
- `scripts/verificar-ficha.mjs` (deixe como está — não regrida)
- `tests/ml-client.test.ts` (criar)
- `tests/token-flow.test.ts` (criar)
- `tests/helpers/mockenv.ts` (criar) — helpers de mock para `fetch`, `db`, `env`, relógio
- `src/lib/supabase.ts` (apenas se necessário exportar uma maneira de injetar o cliente;
  preferencialmente não tocar — ver passo 1)
- `package.json` (adicionar scripts de teste + devDependency vitest)

**Out of scope**:
- NÃO alterar `src/lib/ml/client.ts` além do mínimo para testabilidade (e apenas se o passo 1
  exigir; prefira mock em vez de mudar produção).
- NÃO alterar as rotas de API (isso é do 013).
- NÃO criar repositório git.

## Git workflow

Não é repo git. Não faça commits/PRs. Aplique as mudanças no diretório de trabalho.

## Steps

### Step 1: habilitar injeção do cliente Supabase (mínimo necessário)

`db()` em `src/lib/supabase.ts:7` cria um client cacheado. Para testar `mlFetch` sem tocar
num Supabase real, exponha um ponto de substituição. Adicione ao `src/lib/supabase.ts`:

```ts
type ClienteFactory = () => SupabaseClient;
let fabrica: ClienteFactory | null = null;
export function injetarCliente(f: ClienteFactory | null) { fabrica = f; }
export function db(): SupabaseClient {
  if (fabrica) return fabrica();
  if (!cached) { cached = createClient(env.supabaseUrl, env.supabaseServiceKey, {...}); }
  return cached;
}
```

**Verify**: `npx vitest run` → ainda não há testes, exit 0; `npm run verificar` → exit 0
(comportamento atual inalterado).

### Step 2: criar um mock de `db` para os testes

Em `tests/helpers/mockenv.ts`, crie um cliente Supabase falso com `.from().select()`,
`.from().update().eq()`, `.from().insert()` que você controla por caso de teste (retorne
linhas de `contas` configuráveis). Use `injetarCliente(falso)` no `beforeEach` e restaure com
`injetarCliente(null)` no `afterEach`.

**Verify**: o mock compila (sem erros de tipo ao importar `@supabase/supabase-js` tipos).

### Step 3: testar o fluxo de token em `mlFetch`

Crie `tests/token-flow.test.ts` cobrindo, com `globalThis.fetch` mockado e relógio mockado
(`vi.useFakeTimers`):
1. `validToken` retorna token sem refresh quando `access_expira_em` está > 10 min à frente.
2. Token a < 10 min de expirar dispara `refreshAccessToken`; `saveTokens` grava o par novo; a
   requisição usa o token novo.
3. Resposta 401 → retry: re-refresca e re-tenta UMA vez com o token novo.
4. `saveTokens` atualiza na MESMA linha (assert na chamada `.eq('seller_id', X)` e no shape do
   update: `access_token`, `refresh_token`, `access_expira_em`, `atualizado_em`).

Use `client.ts:102` (`validToken`) e `client.ts:149-160` (retry 401) como referência do
comportamento a não quebrar.

**Verify**: `npx vitest run` → 4+ testes passando cobrindo os casos acima.

### Step 4: testar `validToken` + `saveTokens` como unidades (se viável sem fetch)

Se `validToken`/`saveTokens` puderem ser exercitados sem rede (via mock de `db` + mock de
`oauth.refreshAccessToken`), adicione testes de unidade explícitos para a margem de 10 min e
para a atualização da linha. Não force; o essencial é o passo 3.

**Verify**: `npx vitest run` → testes novos passam.

### Step 5: `npm run verificar` continua passando (sem regressão)

**Verify**: `npm run verificar` → exit 0.

## Test plan

- Novos arquivos: `tests/token-flow.test.ts` (fluxo de refresh/retry/save) e helpers.
- Casos: refresh pré-expiração, retry pós-401, gravação na mesma linha, token válido sem
  refresh. Estrutura de mock: um `tests/helpers/mockenv.ts` com cliente falso e fetch mockado.
- Verificação: `npx vitest run` → todos passam, incluindo N testes novos.

## Done criteria

- [ ] `npx vitest run` exits 0 com testes novos de fluxo de token passando
- [ ] `npm run verificar` exits 0 (sem regressão no smoke existente)
- [ ] `npm run build` exits 0
- [ ] Nenhum arquivo fora do escopo foi modificado
- [ ] `plans/README.md` status do 001 = DONE

## STOP conditions

Pare e reporte se:

- O shape de `db()`/`mlFetch` mudou tanto que os trechos de "Current state" não batem mais
  com o arquivo vivo.
- Você precisar alterar o comportamento de produção de `client.ts` além de injeção trivial
  (ex.: refatorar `mlFetch` para `fetch` injetável): para e reporte, não force um redesenho
  no meio de um plano de teste.
- O mock do cliente Supabase não conseguir emular `.or()`/`.eq()`/`.update()` que o código
  usa (use `expect(...).not.toHaveBeenCalled()`/`toHaveBeenCalledWith` de forma pragmática).

## Maintenance notes

- Quando 013 consolidar as rotas de escrita, estenda este harness para as rotas de mutação
  (PUT titulo/descricao/ficha/fotos). Este plano cobre só token + base.
- Se `mlFetch` ganhar injeção de `fetch` no futuro, migre os mocks de `globalThis.fetch` para
  essa injeção.
- Um CI (fora de escopo) devia rodar `npm run verificar` + `vitest run` + `tsc --noEmit`.
