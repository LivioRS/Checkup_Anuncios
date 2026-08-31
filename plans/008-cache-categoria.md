# Plan 008: Tornar o cache de categoria efetivo sob force-dynamic (verificar antes)

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se "STOP conditions" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW/MED
- **Depends on**: 006 (conta memoizada por request, p/ chavear o cache por-conta)
- **Category**: perf
- **Planned at**: sem git (2026-08-28)

## Why this matters

O README promete "*Outro anúncio da mesma categoria = 1 (categoria fica em cache 24 h)*".
Hoje isso só vale se o Next Data Cache sobreviver a `force-dynamic`, o que é improvável: todas
as páginas/rotas são `export const dynamic = 'force-dynamic'` (`page.tsx:14`, `ficha/page.tsx:14`,
`descricao/page.tsx:10`, `api/descricao/route.ts:25`, `api/titulo/route.ts:17`), então o
`revalidate: 86400` do `fetch` em `attributes.ts:12,18` (`client.ts:144-146` seta
`next: { revalidate }`) é re-emitido a cada abertura. Além disso, a chave do cache ignora a
`Authorization`, então poderia servir dados de categoria de outra conta. Verifique antes de
fixar: o custo adicional só é "real" se o cache hoje não persistir.

## Current state

- `src/lib/ml/attributes.ts:10-25`:
  ```ts
  export function getCategoryAttributes(categoryId: string) {
    return mlFetch<CategoryAttribute[]>(`/categories/${categoryId}/attributes`, { revalidate: 86400 });
  }
  export async function getTechnicalSpecsInput(categoryId: string): Promise<SpecsInput> {
    return await mlFetch<SpecsInput>(`/categories/${categoryId}/technical_specs/input`, { revalidate: 86400 });
  }
  ```
- `src/lib/ml/client.ts:134-147` `mlFetch` — quando `revalidate` definido, seta
  `next: { revalidate }`; senão `cache: 'no-store'`. Toda página consumidora é `force-dynamic`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |
| Sonda de cache | (probe manual/rota) | ver passo 2 |

## Scope

**In scope**: `src/lib/ml/attributes.ts` (+ talvez `client.ts` p/ expor chave) e o mecanismo
de cache por-categoria.
**Out of scope**: mudar `force-dynamic` nas páginas (decisão de arquitetura; preserve).

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: sondar se o cache persiste hoje

Antes de qualquer fix, **meça**: faça duas requisições consecutivas abrindo anúncios da mesma
categoria e observe (logs / contagem de chamadas ao ML/`/categories/...`) se a segunda
requisição re-busca `/categories/{id}/attributes`. Se já cacheia, este plano pode virar
"verificar e documentar" (marcar DONE ou REJECTED). Registre o resultado.

**Verify**: anotação do resultado da sonda (cacheia ou não).

### Step 2: se não persiste, implementar cache explícito por-categoria e por-conta

Adicione um cache TTL em memória no módulo, chaveado por `categoryId` + `seller_id` (conta),
respeitando o `AsyncLocalStorage`/`comConta` já existente. Use `import { cache } from 'react'`
com TTL próprio, ou um `Map` com `Date.now()`:

```ts
const cacheAttrs = new Map<string, { ts: number; data: unknown }>();
const TTL = 86400_000;
export async function getCategoryAttributes(categoryId: string) {
  const conta = await getAccount();
  const chave = `${conta?.seller_id ?? 'anon'}:${categoryId}`;
  const hit = cacheAttrs.get(chave);
  if (hit && Date.now() - hit.ts < TTL) return hit.data as CategoryAttribute[];
  const data = await mlFetch<CategoryAttribute[]>(`/categories/${categoryId}/attributes`, { cache: 'no-store' });
  cacheAttrs.set(chave, { ts: Date.now(), data });
  return data;
}
```

Aplique o mesmo para `getTechnicalSpecsInput`. (Se `getAccount` já for memoizado por request
via 006, isso é barato por request.)

**Verify**: `npm run build` → exit 0; a segunda abertura da mesma categoria não re-busca
(`/categories/...`).

### Step 3: smoke

**Verify**: `npm run verificar` → exit 0.

## Test plan

- Se 006/001 aplicados, teste do cache: 2ª chamada à mesma categoria não chama `mlFetch`
  (count de fetch mockado) até passar o TTL.
- Verificação: `npx vitest run` (se aplicável) + `npm run build` + `npm run verificar`.

## Done criteria

- [ ] Sonda documentada (cache atual persiste ou não)
- [ ] Se não persistia: cache explícito TTL por `categoryId`+`seller_id` (não compartilha
      entre contas)
- [ ] 2ª abertura da mesma categoria não re-emite `/categories/...`
- [ ] `npm run build` e `npm run verificar` passam
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] `plans/README.md` status do 008 = DONE ou REJECTED (1-linha de motivo)

## STOP conditions

Pare e reporte se:

- A sonda mostrar que o cache já persiste (então possivelmente REJECT e documente — não force).
- O `Map` em memória por instância serverless não ser o suficiente (múltiplas instâncias):
  registre como limitação e sugira cache externo como follow-up.
- Precisar mudar `force-dynamic` (out of scope).

## Maintenance notes

- Cache em memória é por instância; sob múltiplas instâncias serverless o efeito é parcial.
- A chave precisa da conta para não servir dados de outra conta (o README documenta o painel
  multicona).
