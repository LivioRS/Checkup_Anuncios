# Plan 010: Colapsar arquivos env/gitignore duplicados + alinhar seller padrão

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se "STOP conditions" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line`/nominal contra o repo.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: sem git (2026-08-28)

## Why this matters

Raiz tem arquivos duplicados que causam drift e onboarding errado:
- `.env.example` (com `ANTHROPIC_API_KEY`/`MODEL`) **e** `env-local-exemplo.txt` (sem as vars
  Anthropic e com prosa antiga) — quem copia o `.txt` perde o Claude silenciosamente.
- `.gitignore` e `gitignore.txt` byte-idênticos.
- `ML_SELLER_ID_PADRAO` divergente: `.env.example:11` = `471489691` vs `README.md` = `177795203`.

## Current state

- Arquivos na raiz: `.env.example`, `env-local-exemplo.txt`, `.gitignore`, `gitignore.txt`.
- `src/lib/env.ts:env` requer `ML_CLIENT_ID, ML_CLIENT_SECRET, SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, PANEL_PASSWORD`; `ANTHROPIC_*` são opcionais (lidos em `ia.ts`).
- README documenta env vars (incl. `ML_SELLER_ID_PADRAO=177795203`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope** (arquivos na raiz):
- `env-local-exemplo.txt` (deletar)
- `gitignore.txt` (deletar)
- `.env.example` (ajustar `ML_SELLER_ID_PADRAO` para o valor decidido)
- `.gitignore` (manter; o `gitignore.txt` é cópia)
- `README.md` (alinhar o valor do seller, se necessário — tocado também no 011)

**Out of scope**:
- Qualquer `.env*` real (não existente no repo).
- `src/lib/env.ts` (não mude a lógica).

## Git workflow

Não é repo git. Sem commits/PRs. (Apagar arquivos = `Remove-Item` no diretório de trabalho.)

## Steps

### Step 1: decidir o `ML_SELLER_ID_PADRAO`

Confirme com o dono qual é o valor correto (`.env.example` = `471489691` ou README =
`177795203`). Se não puder confirmar, use o valor do **README** (fonte de onboarding) e
documente. Escolha UMA fonte de verdade.

**Verify**: registro da decisão (valor + porquê) no plano ou README do `plans/`.

### Step 2: deletar duplicatas

`Remove-Item env-local-exemplo.txt; Remove-Item gitignore.txt` na raiz do repo.

**Verify**: os dois arquivos não existem mais; `.gitignore` e `.env.example` permanecem.

### Step 3: alinhar `.env.example`

Garanta que o `.env.example` tenha TODAS as vars que o app usa (incl. `ANTHROPIC_API_KEY`,
`ANTHROPIC_MODEL`) e o `ML_SELLER_ID_PADRAO` decidido no Step 1. Mantenha placeholders sem
valores reais (nunca copie segredo).

**Verify**: `Get-Content .env.example` mostra as vars completas; nada de valor de produção.

### Step 4: smoke

**Verify**: `npm run verificar` → exit 0.

## Test plan

- Sem testes novos. Verificação: `npm run build` + `npm run verificar`.

## Done criteria

- [ ] `env-local-exemplo.txt` e `gitignore.txt` removidos
- [ ] Um único `ML_SELLER_ID_PADRAO` em `env.example` + README (decisão documentada)
- [ ] `.env.example` cobre todas as vars usadas (incl. `ANTHROPIC_*`), sem valores reais
- [ ] `npm run build` e `npm run verificar` passam
- [ ] `plans/README.md` status do 010 = DONE

## STOP conditions

Pare e reporte se:

- Não conseguir decidir o `ML_SELLER_ID_PADRAO` (sem dono para confirmar e os dois diferem):
  reporte e NÃO adivinhe no código — apenas no `.env.example`/README, marcando o conflito.
- Descobrir que algum processo (script) referencia `env-local-exemplo.txt`/`gitignore.txt`.

## Maintenance notes

- Mantenha `.env.example` como única fonte de env example; atualize-o junto com qualquer env
  nova que `src/lib/env.ts` ou `ia.ts` adicionarem.
