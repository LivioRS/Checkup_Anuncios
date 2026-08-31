# Plan 009: Corrigir lint + adicionar script typecheck

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se "STOP conditions" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: sem git (2026-08-28)

## Why this matters

`package.json:9` roda `"lint": "next lint"`, mas **não há `eslint` nem `eslint-config-next`**
nas devDependencies e nenhum config file (`.eslintrc*`/`eslint.config.*`). `next lint` é
deprecado no Next 15 (removido no 16) e falha/interage sem eslint instalado — então
`npm run lint` não roda. E não há script `typecheck` (`tsc --noEmit` só roda indiretamente via
`next build`). Resultado: nenhuma verificação estática de um-comando confiável.

## Current state

- `package.json` devDependencies: `@types/node`, `@types/react`, `@types/react-dom`, `typescript`.
  Sem `eslint`/`eslint-config-next`. Scripts: `dev`, `build`, `start`, `lint` (`next lint`),
  `verificar`.
- `tsconfig.json` — Next 15 padrão (com `noEmit` implícito via `next build`; verifique se
  `noEmit` está presente para `tsc --noEmit` funcionar).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Instalar | `npm install --save-dev eslint eslint-config-next` | exit 0 |
| Lint | `npm run lint` (após ajuste) | exit 0 (ou baseline documentado) |
| Typecheck | `npm run typecheck` | exit 0 |

## Scope

**In scope**: `package.json`, `eslint.config.mjs` (criar), `tsconfig.json` (só se `noEmit`
faltar para `tsc --noEmit`), possível `.eslintignore`.
**Out of scope**: regras de código dos arquivos grandes (não corrija o backlog aqui; o lint
deve rodar e reportar, não necessariamente zerar — documente o baseline no Done criteria).

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: adicionar eslint + config flat

`npm install --save-dev eslint eslint-config-next` e criar `eslint.config.mjs`:

```js
import { FlatCompat } from '@eslint/eslintrc';
// ou use a config flat do next: eslint-config-next/core-web-vitals
export default [
  ...,
  { ignores: ['.next/**', 'node_modules/**'] },
];
```

Use a forma que a sua versão do `eslint-config-next` suporta (`core-web-vitals`). Se a
instalação pedir interativamente, escolha "next/core-web-vitals" + TS.

**Verify**: `npx eslint . --help` não falha (config válida).

### Step 2: trocar o script `lint`

Em `package.json`, mude `"lint": "next lint"` para `"lint": "eslint ."`.

**Verify**: `npm run lint` → executa (pode reportar warnings/erros do backlog — documente o
baseline no Done criteria; NÃO peça para zerar tudo neste plano).

### Step 3: adicionar `typecheck`

Adicione `"typecheck": "tsc --noEmit"` aos scripts e confirme que `tsconfig.json` não emite
(fica implícito). Se `tsc --noEmit` acusar erros que não são resolvidos fácil, documente-os no
baseline; o objetivo é o comando existir e ser acionável.

**Verify**: `npm run typecheck` → exit 0 ou lista documentada de erros preexistentes.

### Step 4: smoke + build

**Verify**: `npm run verificar` → exit 0; `npm run build` → exit 0.

## Test plan

- Sem testes novos (é DX). Verificação: os três comandos `lint`, `typecheck`, `verificar`,
  `build`.

## Done criteria

- [ ] `npm run lint` roda (não falha por config ausente); baseline de warnings/erros documentado
- [ ] `npm run typecheck` existe e é acionável (`tsc --noEmit`)
- [ ] `npm run build` e `npm run verificar` passam
- [ ] Nenhum arquivo de `src/` fora de escopo foi modificado
- [ ] `plans/README.md` status do 009 = DONE

## STOP conditions

Pare e reporte se:

- A versão do Next/eslint exigir config que conflita com TS 5.7 (ajuste a config, não o código).
- `tsc --noEmit` revelar uma montanha de erros preexistentes que precisam de arquivos de
  escopo amplo: documente o baseline e não "corrija de passagem" fora do escopo.

## Maintenance notes

- Quando o backlog de lint for resolvido, endureça `eslint . --max-warnings=0` num CI.
- `next lint` some no Next 16; a migração para `eslint .` (feita aqui) já o prepara.
