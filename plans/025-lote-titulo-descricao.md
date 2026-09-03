# Plan 025: Estender o lote pra título e descrição, só geração (f2c2)

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se um "STOP condition" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo tem `.git` (`github.com/LivioRS/Checkup_Anuncios`). Compare os trechos
> abaixo com `file:line` contra o arquivo vivo antes de editar.
>
> **Status desta passada: pesquisado e desenhado, NÃO implementado** — ver "Por que parei antes
> de implementar" no fim deste arquivo.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: ALTA — `/api/titulo/[id]` e `/api/descricao/[id]` são as rotas que o Livio mais usa
  hoje, de verdade, em anúncios reais. Não tenho como testar ponta-a-ponta contra a API do ML
  nesta sessão (sem `ML_CLIENT_ID`/tokens aqui) — só `build`/`lint`/`test` (mocks). Um bug sutil
  na extração passaria pelo gate e só apareceria quando o Livio usasse a ferramenta de verdade.
- **Depends on**: 024 (mecanismo de fila/worker já existe e já processa um `tipo` de operação —
  este plano generaliza o `tipo` em vez de criar fila nova).
- **Category**: feature (kanban "Do Anúncio ao Portal", Fase 2, card 2 — f2c2)
- **Planned at**: 2026-09-03.

## Why this matters

f2c2 do quadro: **"Rotas de diagnóstico em lote — Adaptar `/diagnostico`, `/titulo`,
`/descricao` pra aceitar lista de itens, com retry isolado por anúncio."**

`/diagnostico` já está coberto — o worker do plano 024 (f2c1) processa lote chamando
`carregarDiagnostico`, a mesma função que `/itens/[id]` usa pra um anúncio só. Falta `/titulo` e
`/descricao`.

**Diferença importante que este plano descobriu ao ler as duas rotas**: diferente do
diagnóstico (só leitura), `/titulo` e `/descricao` são um fluxo em DOIS passos — `POST` só
**sugere** (chama o Claude, devolve 1-3 propostas, não grava nada); `PUT` **grava** de verdade no
anúncio, só depois que alguém (o Livio) olhou a sugestão e decidiu aplicar. Isso é decisão de
produto, não acidente: `PRODUCT.md` descreve o diferencial como "reescrita **assistida** por
Claude", e o `podeGravar`/fluxo de confirmação em duas etapas existe pra isso.

**Decisão de escopo tomada nesta pesquisa**: o lote em massa deste plano cobre só o `POST`
(gerar sugestão pra N anúncios de uma vez, guardando o resultado em `lote_itens.resultado`) —
**não** o `PUT` (gravar). Escrever título/descrição gerados por IA em dezenas de anúncios reais
sem um humano olhar cada um antes é uma mudança de comportamento do produto (hoje é sempre
revisado, sempre um clique por vez), não só uma questão técnica de "aceitar lista de itens". Não
tomei essa decisão sozinho por conta própria: é do tipo que decidi da forma mais conservadora
(mantém o hábito atual — sempre revisado) e documento aqui pro Livio confirmar ou trocar. Se ele
quiser um modo "aplicar tudo sem revisar", é uma troca pequena depois de ele decidir, não deste
plano.

## Current state

- `src/app/api/titulo/[id]/route.ts` — `POST` (linhas 22-96) gera até 3 propostas de título +
  sugestão de `MODEL`, tudo inline no handler (busca tendências, atributos da categoria, chama
  `perguntarAoClaude`, interpreta com `lerPlanoTitulo`). `PUT` (linhas 110-244) grava de verdade,
  com toda a lógica de fallback `family_name`/`title` e diagnóstico de "por que travou" quando dá
  erro de campo. Não vou tocar no `PUT`.
- `src/app/api/descricao/[id]/route.ts` — mesmo formato: `POST` gera (via `montarContexto` +
  `promptNotas`/`promptMelhoria`, dois passe de Claude — nota da descrição atual, depois
  melhoria), `PUT` grava. 222 linhas, mais complexo que título (dois prompts em sequência, mais
  contexto: perguntas reais, avaliações, origem do produto).
- `src/lib/lotes/fila.ts` (plano 024) — `criarLote`/`proximosPendentes`/etc. não têm noção de
  "tipo de operação" ainda — o worker de hoje (`/api/lote/[id]/processar`) chama
  `carregarDiagnostico` incondicionalmente. Precisa de uma coluna `tipo` em `lotes` e um
  despacho no worker.

## Desenho (pra quando este plano for implementado)

1. **Migração**: `alter table public.lotes add column if not exists tipo text not null default
   'diagnostico' check (tipo in ('diagnostico','titulo','descricao'));` — aplicada via MCP do
   Supabase, igual aos planos 023/024, e anexada em `supabase/schema.sql`.
2. **Extrair a geração pra função reaproveitável**, sem mudar o comportamento do handler atual:
   - `src/lib/ml/titulo.ts` (motor novo, sem import de Supabase): `gerarPropostaTitulo(itemId):
     Promise<ResultadoPropostaTitulo>` — o corpo de hoje do `POST` de `/api/titulo/[id]`,
     literalmente movido (não reescrito), devolvendo um objeto de resultado em vez de
     `NextResponse` direto.
   - `src/app/api/titulo/[id]/route.ts`: `POST` fica um wrapper fino — chama
     `gerarPropostaTitulo` dentro de `comConta`, converte o resultado pra `NextResponse` com o
     mesmo status de hoje. **Teste de regressão obrigatório**: comparar o JSON devolvido antes e
     depois da extração pra um mesmo item (mock), byte a byte.
   - Mesma extração pra `src/lib/ml/descricao.ts` (`gerarPropostaDescricao`), a partir do `POST`
     de `/api/descricao/[id]`.
3. **Worker** (`/api/lote/[id]/processar/route.ts`): despacha por `lote.tipo` —
   `diagnostico` → `carregarDiagnostico` (já existe); `titulo` → `gerarPropostaTitulo`;
   `descricao` → `gerarPropostaDescricao`. Mesma lógica de 429/erro isolado do plano 024, sem
   mudança.
4. **`POST /api/lote`**: aceita `tipo` no corpo (default `'diagnostico'` por compatibilidade com
   o plano 024).
5. Testes: `gerarPropostaTitulo`/`gerarPropostaDescricao` com os mocks de `perguntarAoClaude`/
   `mlFetch` que já existem no repo (ver como `tests/` mocka hoje, se houver testes de
   `/titulo`/`/descricao` — se não houver, este plano é a primeira cobertura, o que por si só já
   é valor: hoje essas duas rotas não têm teste nenhum).
6. **Não mexer em nada do `PUT`** de nenhuma das duas rotas.

## STOP conditions

- Se o teste de regressão (JSON antes/depois da extração) não bater EXATAMENTE pro `POST`: parar
  — a extração introduziu uma diferença de comportamento numa rota que o Livio usa de verdade.
- Antes de implementar: confirmar com o Livio a decisão de escopo (geração em lote, gravação
  continua manual/revisada) — é mudança de produto, não só técnica.

## Por que parei antes de implementar

Task list desta sessão (overnight, sem o Livio disponível pra revisar em tempo real): fiz o
f1c4 (login/RLS) e o f2c1 (fila/worker, com a operação de diagnóstico de verdade) até o fim,
com gate completo verde e, no caso do f1c4, verificação ao vivo contra o banco real. Esses dois
tinham como eu verificar o resultado de forma forte (testes + Postgres real).

Este card (f2c2) mexe nas DUAS rotas que o Livio mais usa no dia a dia, sem eu ter como testar
contra a API do ML de verdade nesta sessão — o gate (`build`/`lint`/`test`) prova que não quebrei
nada que já tinha teste, mas essas rotas **não têm teste hoje**, então o gate não pega uma
regressão de comportamento no `POST`. Combinado com a decisão de escopo (geração em massa, sem
gravação automática) ser uma mudança de produto que vale confirmar, achei mais responsável deixar
isto pesquisado e desenhado — pronto pra implementar rápido — do que arriscar uma extração
silenciosa numa ferramenta que grava em anúncios reais, sem ninguém disponível pra notar se algo
saiu errado. Registrado aqui pro Livio decidir: (a) confirmar o escopo (geração em lote, sem
auto-gravação) e eu implemento na próxima sessão, ou (b) ele quer outro escopo.
