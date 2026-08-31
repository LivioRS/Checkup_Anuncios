# Plan 006: Memoizar conta por request + reusar item no check-up

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se "STOP conditions" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 001 (rede de regressão)
- **Category**: perf
- **Planned at**: sem git (2026-08-28)

## Why this matters

Custo mensurável por check-up:
1. **`contas` relida por chamada** — `client.ts:131` chama `getAccount()` a cada `mlFetch`;
   o check-up (~10–13 chamadas em `analise.ts:221-310`) gera ~13–15 SELECTs Supabase na mesma
   linha, sem valor (a conta já é conhecida no limite do request).
2. **Item lido até 3×** — `page.tsx:101` (`getItem`), `analise.ts:208` (raw `mlFetch /items`)
   e `dono.ts:53` (`abrirAnuncio` já leu) leem o mesmo `/items/{id}`; cada leitura = 1 round-trip
   ML + 1 validação de token.

## Current state

- `src/lib/ml/client.ts:70-80` `getAccount()` — SELECT em `contas` (sem memoização).
- `src/lib/ml/client.ts:131` `const conta = await getAccount();` dentro de `mlFetch`.
- `src/lib/ml/analise.ts:203-209` `carregarDiagnostico` faz
  `const item = await mlFetch<Item>(\`/items/${itemId}\`)` e `const conta = await getAccount();`.
- `src/app/itens/[id]/page.tsx:101` `getItem(id, { internos: true })` (via `attributes.ts:35`).
- `src/lib/ml/dono.ts:44-76` `abrirAnuncio` já resolveu `item` e `conta`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Testes | `npx vitest run` | exit 0 (do 001) |
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/lib/ml/client.ts` (memoizar `getAccount` por request)
- `src/lib/ml/analise.ts` (aceitar/reusar item e conta)
- `src/app/itens/[id]/page.tsx` (passar item/conta em vez de re-ler)

**Out of scope**:
- `dono.ts`/`getItem` unificação profunda (DEBT-04); aqui só o reuso do item já resolvido.
- NÃO alterar `mlFetch`/`MlError` shape.

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: memoizar `getAccount` por request

Use o mesmo mecanismo de escopo já existente. O projeto já usa `AsyncLocalStorage` em
`client.ts:36-40` (`escopo`, `comConta`). Como a conta pode mudar após refresh, **invalide a
memoização após `saveTokens`**. Ex. aproximado (adaptado ao fluxo):

```ts
import { cache } from 'react'; // ou um Map por async scope
// Dentro do escopo do request, cache a chamada a getAccount:
const getAccountMemo = cache(async () => getAccountOriginal());
```

Mantenha a semântica: `mlFetch` usa a conta do request; se o refresh acontecer, a conta nova
vem de `saveTokens` re-consulta. Documente o ponto exato de invalidar.

**Verify**: `npm run build` → exit 0; sem mudança de comportamento nas chamadas.

### Step 2: `carregarDiagnostico` aceita item/conta opcionais

Mude a assinatura para receber o item já resolvido (e a conta), evitando o re-read e o
`getAccount` interno:

```ts
export async function carregarDiagnostico(
  itemId: string,
  opts: { ehMinha?: boolean; item?: Item; conta?: MlAccount | null } = {},
): Promise<Diagnostico> {
  const item = opts.item ?? await mlFetch<Item>(`/items/${itemId}`);
  const conta = opts.conta ?? await getAccount();
  ...
}
```

O restante do corpo (linhas 210-331) permanece igual; `infracoes`/`vendas`/`frete` já usam
`conta`.

**Verify**: `npm run build` → exit 0; `npx vitest run` → passando (se testes existenciais
cobrirem `carregarDiagnostico`, atualize).

### Step 3: `page.tsx` passa o item/conta já resolvidos

Em `src/app/itens/[id]/page.tsx`, o fluxo já chama `abrirAnuncio`/`getItem`. Passe o `item` e
`conta` resultantes para `carregarDiagnostico` em vez de deixá-lo reler. Veja `page.tsx:101` e
o ponto que monta o diagnóstico (~linha 128). Garanta que o caso "é meu" passe `ehMinha` e os
valores resolvidos.

**Verify**: página de check-up abre sem erro em dev (`npm run dev` + abrir um item).

### Step 4: smoke

**Verify**: `npm run verificar` → exit 0.

## Test plan

- Se 001 aplicado: estender `token-flow.test.ts` para garantir que `getAccount` memoizado não
  muda quantas vezes `saveTokens` roda (continua correto após refresh).
- Verificação: `npx vitest run` + `npm run verificar` + `npm run build`.

## Done criteria

- [ ] `mlFetch` não re-executa SELECT `contas` por chamada dentro do mesmo request (1×)
- [ ] `carregarDiagnostico` não re-lê `/items/{id}` quando recebe `item`
- [ ] Refresh segue invalidando a memoização corretamente (teste do 001 passa)
- [ ] `npm run build`, `npm run verificar` e `npx vitest run` passam
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] `plans/README.md` status do 006 = DONE

## STOP conditions

Pare e reporte se:

- A memoização por request quebrar o refresh de token (token velho permanecendo): ajuste a
  invalidação, não remova a memoização inteira.
- Precisar tocar em `dono.ts`/`getItem` para além do reuso (DEBT-04 está fora; reporte).

## Maintenance notes

- 008 (cache de categoria) depende de a conta estar memoizada por request para chavear o cache
  por-conta — faça 006 antes de 008.
- A unificação profunda de `getItem`/`abrirAnuncio` (DEBT-04) continua em aberto como follow-up.
