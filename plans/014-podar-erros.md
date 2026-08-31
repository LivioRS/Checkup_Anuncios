# Plan 014: Podar/redigir payloads de erro antes de devolver ao cliente

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se "STOP conditions" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security (low-med confidence) / correctness
- **Planned at**: sem git (2026-08-28)

## Why this matters

Várias rotas ecoam o payload de erro bruto (do ML, da Anthropic, do sharp) de volta ao
cliente, podendo vazar detalhes internos da API e comportamento do modelo. Exemplos:
- `src/app/api/descricao/[id]/route.ts:69` — em falha de parse do Claude, devolve
  `bruto.slice(0,500)` (saída raw do modelo).
- `src/app/api/itens/[id]/route.ts:74` e `titulo/[id]/route.ts` — ecoam `body` (erro do ML).
- `src/app/api/imagens/[id]/route.ts:130,164` — ecoam `upJson` / corpo do erro.

Isso não é uma vulnerabilidade grave (dados não-sensíveis do ML), mas expõe contratos
internos e facilita enumeração.

## Current state

- `src/lib/ml/client.ts:165` `throw new MlError(res.status, body, ...)` — `body` guarda payload.
- `src/app/api/imagens/[id]/route.ts:129-131`:
  ```ts
  if (!up.ok || !upJson?.id) return NextResponse.json({ erro: 'falha no upload', body: upJson }, { status: up.status || 502 });
  ```
  e `:161-164` catch → `{ erro: 'não consegui corrigir a imagem', body: corpo }`.
- `src/app/api/descricao/[id]/route.ts:69` → `bruto.slice(0,500)` na resposta de erro.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `src/app/api/descricao/[id]/route.ts`
- `src/app/api/itens/[id]/route.ts`
- `src/app/api/titulo/[id]/route.ts`
- `src/app/api/imagens/[id]/route.ts`

**Out of scope**:
- `src/lib/ml/client.ts` (o `MlError.body` pode permanecer; só pare de ECOÁ-LO na resposta).
- NÃO registrar segredos; NÃO mudar o comportamento de sucesso.

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: criar um redator de erro reutilizável

Adicione uma função (ex.: em `src/lib/erro-ui.ts` ou dentro de um módulo comum) que reduz a
um subconjunto seguro:

```ts
export function erroAoSeguro(e: unknown): { message?: string; status?: number } {
  if (e instanceof MlError) return { message: e.message, status: e.status };
  if (e instanceof Error) return { message: e.message };
  return { message: 'erro desconhecido' };
}
```

**Verify**: `npm run build` → exit 0.

### Step 2: aplicar nas rotas

- Em `descricao/[id]/route.ts:69`, em vez de `bruto.slice(0,500)`, devolva uma mensagem
  genérica (ex.: `'não consegui interpretar a resposta da IA'`); a saída raw só vai para log
  server-side, nunca para o cliente.
- Em `itens/[id]/route.ts:74`, `titulo/[id]/route.ts`, `imagens/[id]/route.ts:130,164`:
  devolva `{ erro: <mensagem segura> }` (use `erroAoSeguro`), sem `body`/`upJson`/`corpo` bruto.

**Verify**: `npm run build` → exit 0.

### Step 3: smoke

**Verify**: `npm run verificar` → exit 0.

## Test plan

- Se 001 aplicado, teste puro de `erroAoSeguro` (MlError → message+status; Error → message;
  unknown → mensagem genérica; nunca expõe `body`).
- Verificação: `npx vitest run` (se 001) + `npm run build` + `npm run verificar`.

## Done criteria

- [ ] Nenhuma rota devolve `body`/`bruto`/`upJson`/`corpo` do erro na resposta ao cliente
- [ ] `grep -rn "slice(0,500)\|body: upJson\|body: corpo" src/app/api` sem matches (para os
      casos tratados)
- [ ] `npm run build` e `npm run verificar` passam
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] `plans/README.md` status do 014 = DONE

## STOP conditions

Pare e reporte se:

- Algum cliente/UI depender do `body` do erro (verifique `src/app`/`src/components` que leiam
  `e.body` na resposta): se precisar de algum campo, exponha-o de forma explícita/segura, não
  o payload bruto.
- Precisar tocar em `client.ts` para além de não-ecoar (fora de escopo).

## Maintenance notes

- Logue o payload completo server-side para diagnóstico (com request id se adicionado
  futuramente), mas nunca na resposta.
- Se uma rota realmente precisar de detalhe ao cliente, defina um contrato explícito de erro.
