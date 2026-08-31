# Plan 012: Extrair um único utilitário de normalização de texto

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se "STOP conditions" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 001 (rede de regressão via `npm run verificar`)
- **Category**: tech-debt
- **Planned at**: sem git (2026-08-28)

## Why this matters

Cinco módulos re-implementam a normalização de acentos/minúsculas
(`normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()`) com deltas sutis entre si:
- `src/lib/ml/tendencias.ts:33` `normalizar`
- `src/lib/ia-tipos.ts:77` `palavras` (comentário "Mesma normalização das tendências")
- `src/lib/ml/perguntas.ts:23` `nucleo`
- `src/lib/ml/catalogo-tipos.ts:77` `norm`
- `src/lib/ml/origem.ts:21` (inlined em `pareceOrigem`)

Semântica de "repete" / "bate" / "é origem" diverge por arquivo; corrigir normalização exige
editar 5 lugares. Unificar num único utilitário reduz drift e concentra a correção.

## Current state

- `src/lib/ml/tendencias.ts:33-37`:
  `normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()` e split.
- `src/lib/ia-tipos.ts:77-90` `palavras(texto)` — mesma normalização + particionamento.
- `src/lib/ml/perguntas.ts:23` `nucleo(texto): Set<string>` — mesma base.
- `src/lib/ml/catalogo-tipos.ts:77` `norm = (v?) => ...NFD...toLowerCase()` (+trim).
- `src/lib/ml/origem.ts:18-25` `pareceOrigem` → inlined NFD + toLowerCase (`n.includes(...)`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 (cobre essas funções parcialmente) |
| Build | `npm run build` | exit 0 |
| Testes | `npx vitest run` | exit 0 (se 001 aplicado) |

## Scope

**In scope**: os 5 arquivos acima + um novo módulo `src/lib/normalizar.ts` (criar).
**Out of scope**: mudar o comportamento de normalização (preserve exatamente o que cada
chamada faz hoje — apenas centralize o código); NÃO tocar em `ia.ts`.

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: criar `src/lib/normalizar.ts`

Crie um único utilitário que cubra os usos atuais, com opções:

```ts
export function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
// e, se necessário para os call sites, variantes:
export function normalizarPalavras(texto: string): string[] { ... }
export function removerPontuacao(s: string): string { ... }
```

**Verify**: `npm run build` → exit 0.

### Step 2: fazer os 5 módulos delegarem

- `tendencias.ts:33` `normalizar` → delega para `normalizar` do novo módulo.
- `ia-tipos.ts:77` `palavras` → usa `normalizar` do novo módulo (mantendo o particionamento
  local se existir; se houver diferenças de pontuação/conectivos, preserve via opções).
- `perguntas.ts:23` `nucleo` → delega.
- `catalogo-tipos.ts:77` `norm` → delega (+ trim local).
- `origem.ts:21` inlined → chama `normalizar` do novo módulo.

Preserve o comportamento EXATO de cada um (não "unifique por fora" mudando regra); centralize
apenas a chamada comum.

**Verify**: `npm run verificar` → exit 0 (garante que o smoke — que exercita `catalogo-tipos`,
`perguntas`, `ia-tipos`, `tendencias`-feito — continua passando).

### Step 3: smoke + testes

**Verify**: `npm run verificar` → exit 0; `npx vitest run` (se 001) → passando.

## Test plan

- Se 001 aplicado, teste puro de `normalizar` (acentos → sem acento, maiúsculas → minúsculas,
  pontuação conforme a opção usada).
- Verificação: `npx vitest run` (se 001) + `npm run verificar` + `npm run build`.

## Done criteria

- [ ] Os 5 call sites usam `normalizar`/helper do novo módulo (nenhum `normalize('NFD')` no
      `src/lib` fora do util) — `grep -rn "NFD" src/lib` só em `normalizar.ts`
- [ ] `npm run verificar` passa (comportamento preservado)
- [ ] `npm run build` passa
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] `plans/README.md` status do 012 = DONE

## STOP conditions

Pare e reporte se:

- Um call site depender de uma diferença de comportamento (ex.: um remove pontuação e outro
  não, e removê-la muda resultado de teste): preserve via opção, não "unifique" mudando a regra.
- O smoke `verificar` quebra por comportamento sutil — reporte, não force.

## Maintenance notes

- Futuras mudanças de normalização (ex.: tratar conectivos) ficam num lugar só.
- `palavras`/`nucleo`/`norm` podem divergir legítimamente (tipos de uso); os comentários de
  cada caller devem explicar a opção usada.
