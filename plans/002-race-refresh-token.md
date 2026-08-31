# Plan 002: Corrigir corrida do refresh de token (uso único) e reuso de refresh_token queimado

> **Instruções ao executor**: siga cada passo em ordem, rode cada comando de verificação e
> confirme o resultado esperado antes de avançar. Se algo em "STOP conditions" ocorrer, pare
> e reporte — não improvise. Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check**: repo NÃO é git. Compare os trechos de "Current state" (com `file:line`)
> contra o arquivo vivo antes de editar; divergiu → STOP e reporte.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 001 (os testes de token do 001 servem de rede de regressão)
- **Category**: bug / security
- **Planned at**: sem git (2026-08-28)

## Why this matters

O `refresh_token` do Mercado Livre é **de uso único** por client_id + usuário (documentado no
README e no comentário de `client.ts:8-10`). Hoje `mlFetch` dispara refresh concorrentemente:
aproximadamente 10 chamadas do check-up (`analise.ts:221` `Promise.all`) passam por
`validToken` ao mesmo tempo; e o retry de 401 (`client.ts:151`) re-faz refresh com o
`refresh_token` do snapshot `conta` — que já pode ter sido rotacionado por outro in-flight.
Resultado: `invalid_grant` esporádico em check-up de item próprio, exatamente no pior momento
(expiração do token a cada ~6h), e risco de queimar o token compartilhado com os robôs.

## Current state

- `src/lib/ml/client.ts:149` `let res = await run(await validToken(conta));` — `validToken`
  (`client.ts:102`) refresca se faltar < 10 min (`margemMs`) e grava.
- `src/lib/ml/client.ts:151-160` — retry 401: `const t = await
  refreshAccessToken(conta.refresh_token)` usa o `conta` ORIGINAL (snapshot), que pode guardar
  um `refresh_token` já consumido por `validToken`/por outro `mlFetch` concorrente.
- `src/lib/ml/analise.ts:221-310` — `Promise.all` de ~10 `mlFetch` (via `soDono`/`tentar`) —
  todos lendo a mesma `conta` e podendo refrescar em paralelo.
- `src/lib/ml/client.ts:83-100` `saveTokens` grava o par novo na mesma linha (`.eq('seller_id')`).
- Não há mutex/dedup em memória: `client.ts` não tem cache de refresh em flight.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Testes token | `npx vitest run` | exit 0 (do 001) |
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/lib/ml/client.ts` (a lógica de refresh: `validToken`, retry 401 e um dedup novo)

**Out of scope**:
- `analise.ts` / `dono.ts` (não mexa na orquestração das chamadas aqui — apenas no ponto de
  refresh dentro de `mlFetch`).
- NÃO alterar `oauth.ts` (a chamada `refreshAccessToken`).
- NÃO criar repositório git.

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: introduzir um refresh single-flight por seller_id

Em `src/lib/ml/client.ts`, adicione um cache de promessas em flight:

```ts
// Chave: seller_id. Evita refrescar o mesmo refresh_token de uso único em paralelo.
const refreshEmVoo = new Map<string, Promise<{ access_token: string }>>();

async function refrescarUmaVez(conta: MlAccount): Promise<{ access_token: string }> {
  const chave = String(conta.seller_id);
  const naVoo = refreshEmVoo.get(chave);
  if (naVoo) return naVoo;
  const p = (async () => {
    const t = await refreshAccessToken(conta.refresh_token);
    await saveTokens({ seller_id: conta.seller_id, access_token: t.access_token, refresh_token: t.refresh_token, expires_in: t.expires_in });
    return { access_token: t.access_token };
  })().finally(() => refreshEmVoo.delete(chave));
  refreshEmVoo.set(chave, p);
  return p;
}
```

**Verify**: `npm run build` (typecheck) → exit 0.

### Step 2: usar `refrescarUmaVez` em `validToken` e no retry 401

- Em `validToken` (`client.ts:107`), troque o par `refreshAccessToken`+`saveTokens` por
  `const t = await refrescarUmaVez(conta); return t.access_token;`.
- No retry 401 (`client.ts:152-158`), troque o bloco de refresh+save por
  `const t = await refrescarUmaVez(conta); res = await run(t.access_token);`.

Isso garante que, mesmo com N `mlFetch` concorrentes, só UM refresh roda por seller e o token
novo é reusado por todos.

**Verify**: `npx vitest run` → os testes do 001 seguem passando (incluindo "401 → retry
refresca uma vez"). Adicione um caso: 2+ chamadas concorrentes ao `mlFetch` quando o token
está expirado → `refreshAccessToken` (mockado) é chamado UMA vez.

### Step 3: garantir que o snapshot `conta` reflita o token novo após refresh

Após `validToken`/retry, a requisição já usa o `access_token` retornado. Confirme que o
`conta` usado nas chamadas seguintes do mesmo request não re-use um token velho. Se `mlFetch`
precisar re-ler a conta após refresh, faça-o: `conta = await getAccount()` após o refresh no
retry/validToken, OU dependa do merge-back do token na variável local. Prefira não re-consultar
o banco (plano 006 memoiza a conta); basta atualizar a referência local.

**Verify**: `npx vitest run` → ainda passando; se você mudou a semântica, atualize os testes
de Step 2 para refletir.

### Step 4: rodar smoke

**Verify**: `npm run verificar` → exit 0.

## Test plan

- Estender `tests/token-flow.test.ts`: caso de **refresh concorrente** (2+ chamadas, token
  expirado) → `refreshAccessToken` chamado exatamente 1×; e caso de **401 após refresh
  recente** → não re-refresca com token queimado (reusa o da flight).
- Verificação: `npx vitest run` → todos passam.

## Done criteria

- [ ] `npx vitest run` exits 0, incluindo o caso de refresh concorrente (1× só)
- [ ] `npm run verificar` exits 0
- [ ] `npm run build` exits 0
- [ ] `client.ts` não re-refresca o `refresh_token` queimado no retry 401
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] `plans/README.md` status do 002 = DONE

## STOP conditions

Pare e reporte se:

- O refactor exigir mudar a assinatura pública de `mlFetch`/`validToken` que outros módulos
  usam (fora do escopo).
- O teste de 001 que você usa como rede não existir ainda (002 só deve ser executado após
  001; se 001 estiver pendente, reporte a dependência).
- Descobrir que o dedup por Map global causa vazamento entre requests (requests diferentes
  com AsyncLocalStorage/`comConta` distintos): vaze também a chave ou esvazie o Map no início
  de cada request top-level se necessário.

## Maintenance notes

- O Map `refreshEmVoo` é em-memory por instância serverless; sob concorrência entre *instâncias*
  (não apenas threads do mesmo processo), ainda há risco residual entre instâncias — mitigado
  por re-tentar o refresh do token recém-salvo se `invalid_grant` ocorrer. Considere registrar
  isso num follow-up.
- Ao centralizar o refresh dos robôs + painel (decisão do README), este dedup deve passar a
  ser o ponto único.
