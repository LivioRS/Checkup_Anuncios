# Plan 017: Fechar o loop de `tags_novas.significado` na UI (spike)

> **Instruções ao executor**: este é um plano de **design/spike** (DIR-02). Investigar e
> prototipar o mecanismo; definir a API; listar questões em aberto. Ao terminar, atualize a
> linha deste plano em `plans/README.md`.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW (bookkeeping, sem side-effect destrutivo)
- **Depends on**: none
- **Category**: direction
- **Planned at**: sem git (2026-08-28)

## Why this matters

A tabela `tags_novas` registra tags desconhecidas (`type/vezes/item`) e `significado` "fica
vazia até alguém estudar o que ela faz" (schema). `src/lib/ml/tags-novas.ts` lê
`listarDesconhecidas` (com `significado`), mas nada no app a escreve — a curadoria é manual
(estudar a tabela, editar um TS a dedo) e exige deploy. O check-up já renderiza a lista de
"tags a estudar" (`page.tsx:1007,1000`). Fechar o loop: anotar o significado na própria UI.

## Current state

- `src/lib/ml/tags-novas.ts` — `registrarDesconhecidas`/`listarDesconhecidas` lê de
  `tags_novas`; `significado` nunca é escrito por código.
- `supabase/schema.sql` — coluna `significado` (vazia até estudo manual).
- `src/app/itens/[id]/page.tsx:128` chama `registrarDesconhecidas`; `:1000/1007` renderiza a
  lista de desconhecidas.
- Dicionário fixo em `src/lib/ml/tags.ts` ("89 tags de anúncio + 27 de vendedor").

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope (spike)

**In scope (investigar/prototipar)**:
- Rota POST p/ gravar `significado` numa linha de `tags_novas` (protótipo)
- Affordance inline "anotar significado" na lista de desconhecidas (protótipo)

**Out of scope**:
- Importar automático das anotadas para `tags.ts` (follow-up opcional)
- Migração/curadoria em massa

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: definir a API (design)

`POST /api/tags/desconhecidas` com `{ id, significado }` (ou `{ chave, significado }`),
validando autoria/segurança (rota sob o middleware; sem escrever `significado` vazio).
Anote questões em aberto (identificação única por linha; quem pode anotar).

**Verify**: contrato documentado.

### Step 2: prototipar rota + gravação

Rota server-only que faz `.from('tags_novas').update({ significado }).eq(id, ...)` num subset
escopado (ex.: por `seller_id`/tipo). Best-effort como os outros inserts.

**Verify**: `npm run build` → exit 0; chamada manual grava `significado`.

### Step 3: prototipar o affordance na UI

Em `page.tsx`/componente da lista de desconhecidas, adicione um mini-input "significado" +
salvar, alimentado pela rota. Preserve a lista existente.

**Verify**: anota um significado em dev e a linha persiste (recarrega mostra).

### Step 4: smoke + decisões

**Verify**: `npm run verificar` → exit 0. Registre no README do `plans` as questões em aberto
(identificador da tag, promoção para `tags.ts`).

## Test plan

- Se 001 aplicado, teste da rota com `db` mockado (`update significado` por id, rejeita vazio).
- Verificação: `npx vitest run` (se aplicável) + `npm run build` + `npm run verificar`.

## Done criteria (spike)

- [ ] Contrato da API documentado; rota protótipo grava `significado`
- [ ] UI permite anotar significado e persiste (sem quebrar a lista existente)
- [ ] Questões em aberto listadas (identificador, promoção a `tags.ts`)
- [ ] `npm run build` e `npm run verificar` passam
- [ ] `plans/README.md` status do 017 = DONE (spike)

## STOP conditions

Pare e reporte se:

- A identificação de uma linha de `tags_novas` não for estável (sem PK claro para `update`):
  reporte e proponha a chave correta em vez de assumir.
- Precisar tocar em `tags.ts` (dicionário fixo) — isso é follow-up, fora do spike.

## Maintenance notes

- Um follow-up pode importar as anotadas para `tags.ts` (automatizar a curadoria).
- O fluxo é bookkeeping: erros de gravação não devem derrubar a página (best-effort).
