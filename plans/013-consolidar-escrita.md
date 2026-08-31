# Plan 013: Consolidar guarda de dono + log `ficha_edits` das rotas de escrita

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se "STOP conditions" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 001 (rede de regressão), 011 (docs atualizadas preservadas)
- **Category**: tech-debt
- **Planned at**: sem git (2026-08-28)

## Why this matters

Cinco rotas de escrita re-implementam a mesma guarda de dono e um log `ficha_edits` com shape
levemente diferente:
- `src/app/api/itens/[id]/route.ts` (PUT atributos) — guarda `donoDoAnuncio` + `log`
- `src/app/api/titulo/[id]/route.ts` — `registrar` (loga `MODEL`/`family_name`)
- `src/app/api/descricao/[id]/route.ts` — insert inline (trunca 8000)
- `src/app/api/imagens/[id]/route.ts` — insert inline (`imagem_nova`)
- `src/app/api/catalogo/[id]/vincular/route.ts` — guarda + insert

O formato do log deriva por arquivo; uma mudança no contrato (ex.: campo `antes`/`payload`)
toca 5 arquivos. Um helper único reduz drift e prepara a tela de histórico (016).

## Current state

Comum a todas:
- `donoDoAnuncio(id).catch(() => ({ item: null, conta: null }))` + se `!conta` → 403
  `'Este anúncio não é de nenhuma conta cadastrada — o painel só lê.'`
- insert best-effort em `ficha_edits` com `seller_id`, `item_id`, `payload`, `before`,
  `status` (nomes/campos variam).

Exemplos:
- `src/app/api/imagens/[id]/route.ts:56-62` (guarda) e `:140-152` (insert: `payload:
  { imagem_nova, posicao, modo }`, `before: { imagem_antiga, url }`).
- `src/app/api/itens/[id]/route.ts` (`src tree` mostra `.89`-linhas de guarda/log).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |
| Testes | `npx vitest run` | exit 0 (se 001) |

## Scope

**In scope**:
- `src/lib/auditoria.ts` (criar — `guardarEscrita`/`registrarEscrita` + talvez `donoOu403`)
- As 5 rotas de escrita acima (passar a usar os helpers)

**Out of scope**:
- Mudar o CONTEÚDO do que cada rota grava no `ficha_edits` (preserve os campos por todo —
  só centralize a mecânica). Se houver divergência legítima (descricao trunca 8000), preserve
  via opções do helper.
- NÃO mudar a mensagem 403 nem o comportamento de auth.

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: criar helpers em `src/lib/auditoria.ts`

Extraia as duas peças:
1. **Guarda de dono**: `donoOu403(id)` que roda `donoDoAnuncio` e, se não houver `conta`,
   lança/thrown um erro 403 com a mensagem padrão; as rotas capturam.
2. **Log de escrita**: `registrarEscrita(conta, itemId, payload, before, status)` que insere
   em `ficha_edits` best-effort (`.then(()=>{},()=>{})`), coluna `seller_id`.

**Verify**: `npm run build` → exit 0.

### Step 2: aplicar nas 5 rotas

Troque cada guarda e cada insert inline pelos helpers. Preserve:
- o campo `item_id` (coluna real é `item_id`, e o insert usa `item_id: id`).
- `payload`/`before` shape específico de cada rota (passe como argumentos).
- o truncamento de descricao (8000) — faça no caller ou via opção, não perca.
- o `status` (200).

**Verify**: `npm run build` → exit 0.

### Step 3: smoke + testes

**Verify**: `npm run verificar` → exit 0; `npx vitest run` (se 001, com testes dos helpers de
auditoria) → passando.

## Test plan

- Se 001 aplicado: teste puro de `registrarEscrita` (insert no `db` mockado com `seller_id`,
  `item_id`, payload/before; best-effort não lança quando falha).
- Verificação: `npx vitest run` (se 001) + `npm run verificar` + `npm run build`.

## Done criteria

- [ ] 5 rotas usam os helpers; nenhum insert `ficha_edits` inline restante
- [ ] Mensagem 403 padrão preservada em todas
- [ ] `payload`/`before`/`status` de cada rota preservados
- [ ] `npm run build` e `npm run verificar` passam
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] `plans/README.md` status do 013 = DONE

## STOP conditions

Pare e reporte se:

- Encontrar uma rota que não siga o padrão (guarda/log diferente) que precise de mudança de
  comportamento — preserve, não "consolide por fora".
- O helper não conseguir representar o shape de log de alguma rota (ex.: campos aninhados
  diferentes): use tipo `unknown`/pelo genérico do payload, não force um contrato rígido.

## Maintenance notes

- 016 (histórico) lê `ficha_edits`; tendo um formato consistente (via este plano), a tela
  consome um shape único.
- Qualquer nova rota de escrita deve usar `registrarEscrita`, não copiar insert.
