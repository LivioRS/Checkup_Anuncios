# Plan 007: Paralelizar diagnóstico e baixas de imagem

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se "STOP conditions" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: MED (preservar isolamento de erro por foto)
- **Depends on**: none
- **Category**: perf
- **Planned at**: sem git (2026-08-28)

## Why this matters

`diagnosticarImagens` (`src/lib/ml/analise.ts:349`) itera as fotos com `await` dentro de um
`for`, fazendo **um round-trip por foto em série**. Um anúncio com ~6 fotos paga 6 RTTs
consecutivos antes de a página renderizar (a página espera em `page.tsx:131`). O custo
"1 chamada por foto" é documentado e intencional; a **serialidade** não é — as chamadas são
independentes e podem rodar em paralelo.

## Current state

- `src/lib/ml/analise.ts:345-364+`:
  ```ts
  export async function diagnosticarImagens(item: Item): Promise<DiagnosticoImagem[]> {
    const fotos = item.pictures ?? [];
    const saida: DiagnosticoImagem[] = [];
    for (const [i, foto] of fotos.entries()) {
      const base = { picture_id: foto.id, url: ..., size: ... };
      try {
        const r = await mlFetch(...POST /moderations/pictures/diagnostic...);
        // preenche saida[i]
      } catch { /* isola erro da foto */ }
    }
    return saida;
  }
  ```
- `src/app/api/imagens/[id]/route.ts:86` também baixa cada imagem em série dentro de um `for`
  no POST (não no GET); o paralelismo principal é o GET do diagnóstico.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**: `src/lib/ml/analise.ts` (`diagnosticarImagens`).
**Out of scope**: `src/app/api/imagens/[id]/route.ts` (download em série do POST — deixe aqui;
não confunda com o diagnóstico).

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: `Promise.allSettled` preservando a ordem

Troque o `for` com `await` por um mapeamento paralelo que mantém a mesma ordem de saída e o
mesmo isolamento de erro por foto:

```ts
const saida = await Promise.all(
  fotos.map(async (foto) => {
    const base: DiagnosticoImagem = { picture_id: foto.id, url: foto.secure_url ?? foto.url, size: foto.max_size ?? foto.size, problemas: [], nomes: [] };
    try {
      const r = await mlFetch<RespostaDiagnostico>('/moderations/pictures/diagnostic', {
        method: 'POST',
        body: JSON.stringify({ picture_id: foto.id, context: {...} }),
      });
      // preenche base.problemas/nomes a partir de r.diagnostics
    } catch { /* deixa base com arrays vazios — mesmo comportamento atual de erro isolado */ }
    return base;
  }),
);
return saida;
```

Mantém a ordem (`fotos.map` preserva índice) e não derruba a função se uma foto falhar.

**Verify**: `npm run build` → exit 0.

### Step 2: smoke

**Verify**: `npm run verificar` → exit 0.

## Test plan

- Se 001 aplicado: teste de que `diagnosticarImagens` devolve um item por foto na mesma ordem,
  mesmo com uma foto lançando erro (paralelismo com isolamento).
- Verificação: `npx vitest run` (se 001) + `npm run build` + `npm run verificar`.

## Done criteria

- [ ] Diagnóstico de N fotos roda em paralelo (não N× serial)
- [ ] Saída preserva a ordem das fotos e o isolamento de erro por foto
- [ ] `npm run build` e `npm run verificar` passam
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] `plans/README.md` status do 007 = DONE

## STOP conditions

Pare e reporte se:

- O limite de concorrência do ML exigir throttle (se o ML rejeitar muitas chamadas em paralelo,
  introduza um batch pequeno — ex. 5) e reporte o ajuste.
- Você precisar tocar no POST `imagens/[id]/route.ts` (fora de escopo).

## Maintenance notes

- Não use `Promise.all` puro (uma falha derruba tudo); `allSettled`/try-catch por foto é o
  contrato aqui.
- O download serial no POST de `imagens/[id]` pode ser paralelizado num follow-up se o
  download de múltiplas fotos num único request se tornar comum.
