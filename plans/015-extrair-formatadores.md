# Plan 015: Extrair formatadores compartilhados da god page

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se "STOP conditions" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (só extração de formatadores; NÃO decompor a página inteira aqui)
- **Depends on**: 001 (rede de regressão)
- **Category**: tech-debt
- **Planned at**: sem git (2026-08-28)

## Why this matters

`src/app/itens/[id]/page.tsx` (1084 linhas) carrega ~11 fontes de dados e define formatadores
locais (`txt`, `brl`, `num`, `pct`, `nivelPorNota`). `src/app/itens/[id]/catalogo/Explorador.tsx:12`
re-implementa seu próprio formatador de moeda. Regras de formatação ficam duplicadas e
divergem. Este plano **não** decompõe a página (isso fica como follow-up); só extrai os
formatadores/helpers compartilhados para um módulo comum — passo de menor risco que desbloqueia
a decomposição futura.

## Current state

- `src/app/itens/[id]/page.tsx` — formatadores `txt()`, `brl()`, `num()`, `pct()`,
  `nivelPorNota()` perto do topo; usados por todo o corpo.
- `src/app/itens/[id]/catalogo/Explorador.tsx:12` — `price.toLocaleString('pt-BR', { currency: 'BRL', ... })`.
- `src/components/ui.tsx` — componente de UI; local natural para helpers de formatação.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |
| Testes | `npx vitest run` | exit 0 (se 001) |

## Scope

**In scope**:
- `src/lib/format.ts` (criar — `txt`, `brl`, `num`, `pct`, `nivelPorNota`)
- `src/app/itens/[id]/page.tsx` (usar o módulo, removendo as definições locais)
- `src/app/itens/[id]/catalogo/Explorador.tsx` (usar `brl` do módulo)

**Out of scope**:
- NÃO decompor `page.tsx` em componentes por seção (follow-up registrado no maintenance).
- NÃO alterar a UI/estilo dos componentes.

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: criar `src/lib/format.ts`

Mova as definições de `page.tsx` para lá, preservando a assinatura/semântica EXATA:

```ts
export function txt(v: unknown): string { ... }        // como em page.tsx
export function brl(v: number): string { ... }          // Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})
export function num(v: number): string { ... }
export function pct(v: number): string { ... }
export function nivelPorNota(nota: number): string { ... }
```

**Verify**: `npm run build` → exit 0.

### Step 2: `page.tsx` importa do módulo e remove as definições locais

Substitua as definições locais por imports de `src/lib/format`. Confirme que nenhum outro
local de `page.tsx` redefina (não deixe duplicata).

**Verify**: `npm run build` → exit 0; `npm run verificar` → exit 0.

### Step 3: `Explorador.tsx` usa `brl` do módulo

Troque a formatação inline de `Explorador.tsx:12` por `brl(...)` do módulo.

**Verify**: `npm run build` → exit 0.

### Step 4: smoke + testes

**Verify**: `npm run verificar` → exit 0; `npx vitest run` (se 001, com testes puros de
`format.ts`) → passando.

## Test plan

- Se 001 aplicado, teste puro de `format.ts` (brl/num/pct/txt/nivelPorNota com exemplos fixos).
- Verificação: `npx vitest run` (se 001) + `npm run verificar` + `npm run build`.

## Done criteria

- [ ] `src/lib/format.ts` existe; `page.tsx` e `Explorador.tsx` o usam
- [ ] Nenhuma definição duplicada de formatação restante no `page.tsx` (grep por `Intl.` no
      `src/app` retorna só o módulo comum, exceto uso legítimo)
- [ ] `npm run build`, `npm run verificar` (e `npx vitest run` se 001) passam
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] `plans/README.md` status do 015 = DONE

## STOP conditions

Pare e reporte se:

- `nivelPorNota`/formatadores tiverem lógica de domínio que dependa de estado da página (e não
  só do valor): então mova junto o que for função pura e deixe o resto; não force UI no módulo.
- A extração exigir tocar em componentes de UI além de `Explorador` (fora de escopo).

## Maintenance notes

- Follow-up (fora deste plano): decompor `page.tsx` por seção (performance, reviews, tarifas,
  fotos, tags) usando os formatadores extraídos + testes de caracterização visuais.
- Mantenha `format.ts` puro e sem imports de server-only para poder testar de quick.
