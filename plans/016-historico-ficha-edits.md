# Plan 016: Tela de histórico/auditoria sobre `ficha_edits` (spike)

> **Instruções ao executor**: este é um **plano de design/spike** da direção DIR-01: investigar
> e prototipar, NÃO construir a tela final completa. Defina a API, liste questões em aberto,
> prototipe o mínimo para validar. Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (rota de leitura; sem efeito colateral)
- **Depends on**: 013 (log `ficha_edits` consolidado/consistente)
- **Category**: direction
- **Planned at**: sem git (2026-08-28)

## Why this matters

O painel grava em anúncios reais e mantém um log `ficha_edits` de tudo que gravou — mas o log é
**write-only**: nenhum código o lê. O índice `(item_id, created_at desc)` já existe em
`supabase/schema.sql`. O dono das lojas não consegue ver "o que mudou no meu anúncio e quando"
sem abrir o console do Supabase. Uma tela de histórico fecha esse loop e ajuda a depurar a
concorrência com os robôs (README "Limitações conhecidas").

## Current state

- `ficha_edits` é inserido em: `src/app/api/itens/[id]/route.ts`, `descricao/[id]/route.ts`,
  `catalogo/[id]/vincular/route.ts`, `imagens/[id]/route.ts`, `titulo/[id]/route.ts` — nunca
  `.select`'d.
- `supabase/schema.sql` — índice `(item_id, created_at desc)`.
- Após 013, o formato do log estará consolidado (`seller_id`, `item_id`, `payload`, `before`,
  `status`, `created_at`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope (spike)

**In scope (investigar/prototipar)**:
- Rota GET `/api/historico?item_id=...` (protótipo) → últimos `ficha_edits` do item
- Painel mínimo "Já corrigido" em `src/app/itens/[id]/` (protótipo funcional)

**Out of scope**:
- Backfill/migração de dados; paginação completa; autorização avançada (já coberta pelo
  middleware/`dono`).

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: definir a API (design)

Decida o shape: `GET /api/historico?item_id=MLB123` → `{ itens: [{ created_at, payload,
before, status, seller_id }] }`, ordenado `created_at desc`, limit 20. Anote questões em
aberto (ex.: se expor `seller_id`/dados de `before` brutos ao cliente — considere redigir).

**Verify**: contrato documentado no plano/README.

### Step 2: prototipar a rota

Rota server-only que lê `ficha_edits` filtrando por `item_id`, ordenando `created_at desc`,
limit 20, garantindo que o item pertence a uma conta (reusa `donoDoAnuncio`/guarda do 013).

**Verify**: `npm run build` → exit 0; chamada manual devolve os últimos registros do item.

### Step 3: prototipar a UI

Em `src/app/itens/[id]/`, adicione uma pequena seção "Já corrigido" (tabela criada/status/
resumo do payload), alimentada pela rota. Sem mexer no layout existente além de adicionar a
seção.

**Verify**: abre o item em dev e mostra o histórico (ou estado vazio) sem quebrar a página.

### Step 4: smoke + registrar decisões

**Verify**: `npm run verificar` → exit 0. Atualize o README do `plans`/AGENTS sobre o shape do
log consumido.

## Test plan

- Se 001/013 aplicados: teste da rota com `db` mockado (filtra por item_id, ordena desc,
  limita 20).
- Verificação: `npx vitest run` (se aplicável) + `npm run build` + `npm run verificar`.

## Done criteria (spike)

- [ ] Contrato da API documentado; rota protótipo lê `ficha_edits` por item
- [ ] UI "Já corrigido" funciona (ou estado vazio) sem quebrar `page.tsx`
- [ ] Questões em aberto listadas (redação de `before`, paginação, permissões)
- [ ] `npm run build` e `npm run verificar` passam
- [ ] `plans/README.md` status do 016 = DONE (spike)

## STOP conditions

Pare e reporte se:

- 013 não for aplicado (a consolidação do log é pré-requisito p/ shape consistente) — reporte
  a dependência.
- Precisar migrar dados do `ficha_edits` (fora de escopo de spike).

## Maintenance notes

- A tela final (não-spike) deve decidir paginação e se mostra `before`/payload completos ou
  resumidos.
- Este painel de histórico é onde os "corrigidos" dos robôs vs painel podem ser comparados
  (depuração da concorrência).
