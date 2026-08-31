# Plan 018: Worklist local "por fazer" sobre `repricer_status_ml` (spike)

> **Instruções ao executor**: este é um plano de **design/spike** (DIR-03). Investigar e
> prototipar; definir a API; listar questões em aberto. Ao terminar, atualize a linha deste
> plano em `plans/README.md`.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW/MED (deve permanecer local-first: custo ML zero até abrir o item)
- **Depends on**: none
- **Category**: direction
- **Planned at**: sem git (2026-08-28)

## Why this matters

O painel é "um por vez" (README) e hoje a busca local por texto em `repricer_status_ml`
(`src/lib/ml/items.ts:34-40`) só dispara com uma consulta digitada. Não há uma visão de
"todos os meus anúncios" — o vendedor (5 lojas) abre anúncio a anúncio sem saber quais estão
"driftando"/nunca foram checados. Uma worklist local, barata (só a tabela `repricer_status_ml`
+ `ficha_edits`), daria prioridade por-clique sem quebrar o teto de custo ML do README.

## Current state

- `src/lib/ml/items.ts:28-53` `buscarAnuncios` — SELECT local em `repricer_status_ml`
  (item_id, titulo, sku) filtrado por `seller_id`, 0 chamadas ML; só cai na API se não achar.
- `src/app/page.tsx:27` — busca por texto.
- `ficha_edits` (via 013) guarda a data da última escrita por item.
- README: custo por ação ("Abra outro anúncio da mesma categoria = 1...").

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope (spike)

**In scope (investigar/prototipar)**:
- Rota GET que lista anúncios do vendedor a partir de `repricer_status_ml` (local, sem per-item
  fetch), com flag de "nunca checado"/última edição via `ficha_edits`
- Aba/tab na home com a worklist priorizada

**Out of scope**:
- Run de diagnóstico em lote (quebraria o "um por vez"/custo ML)
- Regras definitivas de "precisa atenção"

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: definir a API (design)

`GET /api/worklist?seller_id=<x>` (ou derivada do contexto) → lista local de `repricer_status_ml`
(item_id, titulo, sku) + `ultima_edicao` (left/`ficha_edits`) + flag `nunca_checado`. Sem
fetch ao ML por item. Anote questões em aberto (qual "needs attention" significa: nunca edito,
`incomplete_technical_specs`, drift de título).

**Verify**: contrato documentado.

### Step 2: prototipar a rota local-first

Rota server-only que lê `repricer_status_ml` (filtrado por conta/seller), faz join/enriquecimento
leve com `ficha_edits` (máx. 1 query extra agregada, nada per-item), cap em ~100 linhas.

**Verify**: `npm run build` → exit 0; chamada devolve lista sem chamar `/items`/ML.

### Step 3: prototipar a aba na home

Em `src/app/page.tsx`, adicione uma aba "Por fazer" que renderiza a worklist; cada linha é um
link pro check-up (custos ML só ao clicar). Sem quebrar a busca existente.

**Verify**: abre a home em dev e a aba lista os anúncios sem chamadas ML.

### Step 4: smoke + decisões

**Verify**: `npm run verificar` → exit 0. Registre no `plans/README.md` as questões em aberto
(definição de prioridade, paginação).

## Test plan

- Se 001 aplicado, teste da rota com `db` mockado (filtra por seller, enriquece com
  `ficha_edits` sem N+1).
- Verificação: `npx vitest run` (se aplicável) + `npm run build` + `npm run verificar`.

## Done criteria (spike)

- [ ] Contrato da API documentado; rota lista a worklist 100% local
- [ ] Aba "Por fazer" na home funciona sem custo ML (custo só ao clicar)
- [ ] Questões em aberto listadas (prioridade, paginação)
- [ ] `npm run build` e `npm run verificar` passam
- [ ] `plans/README.md` status do 018 = DONE (spike)

## STOP conditions

Pare e reporte se:

- A rota exigir um fetch ML por item para montar a lista (isso quebraria o custo/orçamento do
  README) — então a rota NÃO deve ser o caminho; reporte e reescope para puramente local.
- Precisar mudar o schema de `repricer_status_ml` (migração fora do spike).

## Maintenance notes

- Manter local-first é obrigatório; qualquer flag/"needs attention" real só ao abrir o item.
- Alimente a priorização com o que 016 (histórico) e as tags (017) expõem, se quiserem
  "o que mais importa".
