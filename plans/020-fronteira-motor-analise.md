# Plan 020: Marcar e proteger a fronteira do motor de análise (prep multi-cliente)

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se um "STOP condition" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo tem `.git` (`github.com/LivioRS/Checkup_Anuncios`). Compare os trechos
> abaixo com `file:line` contra o arquivo vivo antes de editar — pode ter mudado desde que este
> plano foi escrito.
>
> **Nota sobre o número 020**: o plano 019 mencionava, no "Out of scope", um possível "plano 020"
> para o fallback de criação de anúncio sem catálogo. Esse plano nunca chegou a ser criado (só
> citado em prosa). Este arquivo usa o número 020 para o item **f1c1 do quadro "Do Anúncio ao
> Portal"** (Fase 1 — preparar o motor multi-cliente), não para aquele fallback. Se o fallback for
> retomado depois, use o próximo número livre.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — não move nenhum arquivo, não muda comportamento em produção; só adiciona uma
  regra de lint e documentação.
- **Depends on**: nenhum plano anterior bloqueia.
- **Category**: tech-debt / prep para feature (kanban "Do Anúncio ao Portal", Fase 1, card 1)
- **Planned at**: 2026-09-02, commit HEAD no momento da escrita (confirme `git log -1` antes de
  editar — o drift check normal já cobre isso).

## Why this matters

O quadro "Do Anúncio ao Portal" (roteiro para transformar a ferramenta interna de check-up em
dois produtos multi-cliente) tem como primeiro card da Fase 1: **"Extrair o motor de análise —
lib/ml e lib/ia viram um pacote interno, reaproveitado pela ferramenta atual e pelo portal novo —
sem duplicar lógica já testada."**

Decisão tomada com o usuário nesta sessão: **não** criar `packages/`/monorepo agora. Hoje existe
**um único consumidor** (o painel atual) — o portal novo (Fase 3 do quadro) ainda não existe como
código. Mover pastas e mexer em `tsconfig.json`/`vitest.config.ts`/`eslint.config.mjs`/build da
Vercel sem um segundo consumidor para validar o corte é risco sem ganho imediato.

O que vale fazer agora — e é exatamente o que este plano faz — é **auditar e travar a fronteira**:
confirmar quais arquivos de `src/lib/ml` e `src/lib/ia*.ts` já são "motor" puro (sem tocar
Supabase, prontos para virar pacote sem edição) e quais são "adapter" (amarrados à tabela `contas`
compartilhada com os robôs do dashboard-mercadolivre). Sem essa marcação, o dia em que a Fase 3
começar de verdade, alguém vai ter que caçar import escondido de `db()` em cada arquivo antes de
poder mover algo — este plano faz essa caçada uma vez, documenta o resultado, e usa uma regra de
ESLint para impedir que a fronteira regrida silenciosamente.

## Current state

Auditoria feita nesta sessão (`grep -rn "supabase" --include=*.ts src/lib`), conferida arquivo por
arquivo:

**Já são "motor" — sem import de `db()`/`../supabase`, prontos para virar pacote sem edição:**

- `src/lib/ml/model.ts` — puro: `buildFicha`, `parseItemId`, `normalizeOut`. Zero I/O.
- `src/lib/ml/analise.ts:1,203-331` — usa `mlFetch`/`getAccount`/`MlError` importados de
  `./client` (não `db()` direto). `carregarDiagnostico` aceita `conta`/`item` via `opts`.
- `src/lib/ml/attributes.ts:1,42-51` — mesma coisa: `mlFetch`/`getAccount` de `./client`, cache
  em memória por processo.
- `src/lib/ml/catalogo.ts` — sem import de Supabase (confirmado por grep).
- `src/lib/ml/catalogo-tipos.ts` — puro (tipos + `norm`).
- `src/lib/ml/tags.ts` — puro (dicionário de 89+27 tags + `desconhecidas`).
- `src/lib/ml/tendencias.ts` — puro (pós plano 012, delega para `src/lib/normalizar.ts`).
- `src/lib/ml/perguntas.ts` — puro (agrupamento).
- `src/lib/ml/origem.ts` — puro (comparação de texto).
- `src/lib/normalizar.ts` — puro (utilitário central do plano 012).
- `src/lib/ia.ts:1` — `'server-only'`, mas sem Supabase: só `fetch` direto à API da Anthropic e
  montagem de prompt.
- `src/lib/ia-tipos.ts` — puro (tipos + `montarModelo`/`lerPlanoTitulo`/`grudarBlocos`/etc.).

**Ficam de fora — "adapter" (amarrados a `db()`/tabela do painel atual), fora de escopo deste
plano:**

- `src/lib/ml/client.ts:4,45,57,78,103` — `import { db } from '../supabase'`. É o coração do
  multi-tenant *atual*: `contaDoAnuncio`, `listarContas`, `getAccount`, `saveTokens`, todos batendo
  na tabela `contas` compartilhada com os robôs (AGENTS.md §1). Vira a base do que os cards f1c2
  (tabelas novas) e f1c3 (OAuth de verdade) do quadro vão adaptar — não mexe aqui.
- `src/lib/ml/items.ts:2,45` — `import { db } from '../supabase'`. `buscarAnuncios` consulta
  `repricer_status_ml` diretamente (busca local antes de cair na API do ML).
- `src/lib/ml/dono.ts:1-2` — não importa `db()` diretamente, mas `abrirAnuncio` percorre
  `listarContas()`/`comConta()` (de `./client`) tentando cada conta cadastrada até achar a dona do
  anúncio. Esse padrão faz sentido quando várias contas dividem um único login (hoje); num mundo
  com RLS por cliente (f1c4), cada cliente só teria a própria conta visível, então o "percorrer
  todas" não se aplica do mesmo jeito. **Não mexe aqui** — fica marcado como pergunta em aberto
  para quando a Fase 1 tiver as tabelas novas.
- `src/lib/ml/tags-novas.ts:2,36,72` — `import { db } from '../supabase'`. Grava em `tags_novas`,
  uma tabela **sem coluna de cliente/seller** (é um dicionário global de tags do ML, não por
  conta — ver `supabase/schema.sql:45-54`). Comportamento que faz sentido continuar compartilhado
  entre clientes (o significado de uma tag do ML não muda por seller), mas onde esse dado mora no
  mundo multi-projeto (Fase 1 card 2) é pergunta em aberto, não resolvida aqui.

**Infra, fora de discussão (não é "motor" nem candidato a virar pacote sozinho):**
`src/lib/supabase.ts`, `src/lib/env.ts`, `src/lib/crypto.ts`, `src/lib/auditoria.ts`,
`src/lib/loja.ts` (puro, mas específico do painel — textos de loja).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Lint | `npm run lint` | exit 0 |
| Typecheck + build | `npm run build` | exit 0 |
| Smoke | `npm run verificar` | exit 0 |
| Testes | `npm test` | exit 0 |

## Scope

**In scope**:
- Bloco novo em `eslint.config.mjs` restringindo `../supabase` / `./supabase` / `@/lib/supabase`
  nos 12 arquivos "motor" listados acima (`no-restricted-imports`, regra `error`).
- Seção nova no `README.md` ("Motor de análise vs. camada de conta") documentando a fronteira:
  os 12 arquivos motor, os 4 adapter/híbridos e por quê, e o que muda quando a Fase 3 nascer.
- Novo item no `AGENTS.md` (§11) citando essa invariante e como ela é checada (`npm run lint`).
- Linha do 020 em `plans/README.md`.

**Out of scope** (explicitamente, para não crescer o plano):
- Criar `packages/`, mover qualquer arquivo, mexer em `tsconfig.json`/`vitest.config.ts`/
  `next.config.mjs`.
- Mudar comportamento de `client.ts`, `items.ts`, `dono.ts` ou `tags-novas.ts`.
- Resolver a pergunta em aberto sobre `tags_novas`/`dono.ts` no mundo multi-cliente — só registrar
  que existe.
- Tabelas novas, OAuth, login por cliente — isso é f1c2/f1c3/f1c4, planos futuros.

## Git workflow

Branch feature (`feat/020-fronteira-motor-analise` ou similar) + commits normais + PR, como o
019 já fez. Não commitar `.env.local`.

## Steps

### Step 1: bloco de `no-restricted-imports` em `eslint.config.mjs`

Adicionar um novo objeto no array exportado por `eslint.config.mjs`, depois do bloco existente de
regras, restringindo os 12 arquivos motor:

```js
{
  files: [
    'src/lib/ml/model.ts',
    'src/lib/ml/analise.ts',
    'src/lib/ml/attributes.ts',
    'src/lib/ml/catalogo.ts',
    'src/lib/ml/catalogo-tipos.ts',
    'src/lib/ml/tags.ts',
    'src/lib/ml/tendencias.ts',
    'src/lib/ml/perguntas.ts',
    'src/lib/ml/origem.ts',
    'src/lib/normalizar.ts',
    'src/lib/ia.ts',
    'src/lib/ia-tipos.ts',
  ],
  rules: {
    'no-restricted-imports': ['error', {
      paths: [
        { name: '../supabase', message: 'Este arquivo é "motor" (ver README, seção "Motor de análise vs. camada de conta") — não pode importar Supabase direto. Receba os dados prontos via parâmetro/opts.' },
        { name: './supabase', message: 'Este arquivo é "motor" — não pode importar Supabase direto (ver README).' },
        { name: '@/lib/supabase', message: 'Este arquivo é "motor" — não pode importar Supabase direto (ver README).' },
      ],
    }],
  },
},
```

**Verify**: `npm run lint` → exit 0 (nenhum dos 12 arquivos viola a regra hoje, conforme
auditoria do "Current state").

### Step 2: teste negativo da regra (e reverter)

Adicione temporariamente `import { db } from '../supabase';` no topo de
`src/lib/ml/model.ts`, rode `npm run lint`, confirme que falha citando a mensagem do Step 1, e
reverta a linha antes de seguir.

**Verify**: `npm run lint` falha com a violação esperada; depois de reverter, `npm run lint` volta
a passar.

### Step 3: seção nova no `README.md`

Adicionar, depois da seção "Encaixe com o que já existe" (ou antes de "Estrutura"), uma seção
"Motor de análise vs. camada de conta (prep multi-cliente)" com:
- A lista dos 12 arquivos motor e por que são portáveis.
- A lista de `client.ts`/`items.ts`/`dono.ts`/`tags-novas.ts` como adapter/híbrido, com uma frase
  cada sobre o motivo.
- Uma frase final: "`npm run lint` barra qualquer import de Supabase nos arquivos motor —
  ver `eslint.config.mjs`."

**Verify**: leitura visual; nenhum comando novo.

### Step 4: `AGENTS.md` §11

Adicionar uma seção nova (numerada 11, depois da atual §10) citando a invariante: arquivos listados
como "motor" em `README.md` não importam Supabase; a regra é mecânica via `npm run lint`.

**Verify**: leitura visual.

### Step 5: `plans/README.md`

Adicionar linha `020` na tabela de execução (Prio P1, Esf S, Depende de —, Status TODO → DONE ao
terminar) e, se fizer sentido, uma nota de dependência dizendo que os cards f1c2/f1c3/f1c4 do
quadro "Do Anúncio ao Portal" devem manter os arquivos adapter fora da lista motor do Step 1 (ou
adicioná-los lá, se algum deles for reescrito para não depender mais de `db()` direto).

### Step 6: gate completo

**Verify**: `npm run build`, `npm run lint`, `npm run verificar`, `npm test` — todos exit 0.
Atualize `plans/README.md` (linha 020 → DONE).

## Test plan

- `npm run lint` limpo com a regra nova aplicada (nenhuma violação real hoje).
- Teste negativo do Step 2 prova que a regra funciona de verdade (não é só config morta).
- `npm run build` + `npm run verificar` + `npm test` inalterados (mudança é só lint + docs, sem
  tocar em runtime).

## Done criteria

- [ ] `eslint.config.mjs` tem o bloco `no-restricted-imports` cobrindo os 12 arquivos motor.
- [ ] Teste negativo (Step 2) confirmado e revertido.
- [ ] `README.md` tem a seção "Motor de análise vs. camada de conta".
- [ ] `AGENTS.md` tem a §11 nova.
- [ ] `plans/README.md` linha 020 = DONE.
- [ ] `npm run build`, `npm run lint`, `npm run verificar`, `npm test` passam.

## STOP conditions

Pare e reporte se:

- `npm run lint` acusar uma violação **existente** que a auditoria do "Current state" não previu
  (import escondido de Supabase em algum dos 12 arquivos motor, via re-export de outro módulo,
  por exemplo) — não edite o arquivo motor para "resolver" isso sozinho; isso muda escopo (viraria
  um plano de refactor, não de marcação de fronteira). Reporte e pare.
- O glob de `files` no ESLint flat config não bater com o esperado (ex.: por causa de como o
  `eslint.config.mjs` resolve caminhos relativos) — confirme rodando o teste negativo do Step 2 em
  pelo menos 2 arquivos diferentes (um em `src/lib/ml/`, um em `src/lib/` direto, ex.
  `ia-tipos.ts`) antes de declarar pronto.

## Maintenance notes

- Qualquer arquivo novo que for genuinamente "motor" (lógica de análise/IA que não depende de qual
  cliente está logado) deve entrar na lista do Step 1 e na seção nova do README no mesmo PR que o
  cria — não depois.
- Quando a Fase 1 tiver os cards f1c2 (tabelas novas)/f1c3 (OAuth real)/f1c4 (login por cliente)
  resolvidos, revisitar `dono.ts` e `tags-novas.ts`: nesse ponto dá para decidir se eles entram na
  lista motor (com o comportamento adaptado) ou continuam adapter definitivamente.
- Quando a Fase 3 (portal novo) começar a ser codada de fato, os 12 arquivos motor são o ponto de
  partida natural para extrair para um pacote compartilhado — a expectativa deste plano é que essa
  extração seja um `git mv` + ajuste de imports, sem precisar reescrever lógica.
