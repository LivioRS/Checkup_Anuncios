# Plan 005: Sanitizar termo de busca no filtro PostgREST (investigar)

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
- **Category**: security (baixa confiança — investigar antes de aplicar fix)
- **Planned at**: sem git (2026-08-28)

## Why this matters

`src/lib/ml/items.ts:38` monta um filtro PostgREST (`or`) com o termo do usuário embutido em
string. PostgREST interpreta a expressão do `or()` como uma gramática; um termo com caracteres
especiais (`%`, `,`, `(`, `)`) pode alargar o predicado. Está escopado por
`.eq('seller_id', conta.seller_id)` (`items.ts:37`), então o vazamento cross-tenant é limitado
— mas é dado do usuário entrando em sintaxe de interpretador. Este plano é de baixa confiança:
confirme a exploração antes de assumir o fix.

## Current state

- `src/lib/ml/items.ts:34-39`:
  ```ts
  const { data, error } = await db()
    .from('repricer_status_ml')
    .select('item_id, titulo, sku')
    .eq('seller_id', conta.seller_id)
    .or(`titulo.ilike.%${termo}%,sku.ilike.%${termo}%,item_id.ilike.%${termo}%`)
    .limit(limit);
  ```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**: `src/lib/ml/items.ts` (função `buscarAnuncios`).
**Out of scope**: busca da API do ML (já usa `URLSearchParams` com escape); `dono.ts`; outras.

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: investigar a gramática do `or()` e a exploração (sem código ainda)

Antes de aplicar fix, **confirme** (com o inspector do Supabase ou um console PostgREST) como
o `or()` trata caracteres especiais no valor. Teste termos como `a,b`, `a) or (seller_id.eq.0`,
`%`, `(`. Documente o resultado (bate na confiança do finding). Se não houver exploração
funcional (ex.: PostgREST escapa valores de `ilike`), registre como REJEITADO no README e
pare — é isso que o plano manda: investigar primeiro.

**Verify**: anotação no arquivo de plano ou no README sobre o resultado da sondagem.

### Step 2: se houver exploração, sanitizar o termo

Troque a montagem em string por um valor limpo: remova/escape wildcards e caracteres que
PostgREST interprete. Ex. mínimo:

```ts
const limpo = termo.replace(/[%_,()]/g, '').trim();
if (!limpo) { /* termo vazio → volta [] em vez de varrer tudo */ return []; }
```

E monte o `or()` com esse `limpo`. Evite `%` no valor (o `ilike` com `%termo%` já é o
wildcard que você quer; o problema são os `%`/`,`/`(`/`)` *dentro* do termo).

**Verify**: `npm run build` → exit 0.

### Step 3: smoke

**Verify**: `npm run verificar` → exit 0.

## Test plan

- Se 001 estiver aplicado, adicionar teste puro da função de sanitização (termo com `(`, `)`,
  `,`, `%` → limpo; termo só-de-símbolos → vazio/[]).
- Verificação: `npx vitest run` (se 001) + `npm run build` + `npm run verificar`.

## Done criteria

- [ ] Sondagem da gramática do `or()` documentada (confirmou ou refutou a exploração)
- [ ] Se confirma: termo sanitizado e `%termo%` montado com o valor limpo
- [ ] `npm run build` e `npm run verificar` passam
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] `plans/README.md` status do 005 = DONE ou REJECTED (com um-linha de motivo)

## STOP conditions

Pare e reporte se:

- A sondagem mostrar que a exploração não existe (então REJECT com uma linha, não force fix).
- Sanitizar quebrar buscas legítimas com acento/espaço (ajuste a lista de caracteres).

## Maintenance notes

- Prefira, no futuro, evitar `or()` com string e usar filtros estruturados/`textSearch` se o
  Supabase suportar, em vez de montar expressão.
