# Implementation Plans

Gerado pela skill `improve` em 2026-08-28 sobre `checkup-anuncio` (Next.js 15 App Router,
TypeScript, Supabase + API Mercado Livre + Anthropic + sharp).

> **Nota sobre este repo**: não é um repositório git (não há `.git`), então os planos não
> estampam SHA de commit e o "drift check" do template não se aplica via git. Em vez disso,
> cada executor deve confirmar visualmente que os trechos de "Current state" continuam batendo
> com o arquivo vivo antes de editar (os trechos trazem referências `file:line`). Não crie um
> repositório git como parte destes planos.
>
> **Atualização 2026-09-01**: o repo agora tem `.git` e remoto no GitHub
> (`github.com/LivioRS/Checkup_Anuncios`) — confirme o estado atual antes de assumir que a nota
> acima ainda vale; o plano 019 já assume git normal (branch + commit + PR).

Execute na ordem abaixo, respeitando dependências. Leia o plano inteiro antes de começar,
obedeça às STOP conditions e atualize a coluna Status quando terminar.

## Execution order & status

| Plan | Título | Prio | Esf. | Depende de | Status |
|------|--------|------|------|-----------|--------|
| 001  | Baseline de verificação + harness de testes de token/mutação | P1 | L | — | DONE |
| 002  | Corrigir corrida do refresh de token (uso único) | P1 | M | 001 | DONE |
| 003  | Endurecer auth do painel (open redirect + cookie + rate-limit) | P1 | M | — | DONE |
| 004  | Limitar download/decodificação de imagem antes do sharp | P2 | S | — | DONE |
| 005  | Sanitizar termo de busca no filtro PostgREST (investigar) | P2 | S | — | DONE |
| 006  | Memoizar conta por request + reusar item no check-up | P2 | M | 001 | DONE |
| 007  | Paralelizar diagnóstico/baixas de imagem | P2 | S | — | DONE |
| 008  | Tornar cache de categoria efetivo sob force-dynamic | P2 | M | 006 | DONE |
| 009  | Corrigir lint + adicionar script typecheck | P2 | S | — | DONE |
| 010  | Colapsar arquivos-env/gitignore duplicados + alinhar seller padrão | P3 | S | — | DONE |
| 011  | Atualizar README para o código + adicionar AGENTS.md | P3 | S | — | DONE |
| 012  | Extrair um único utilitário de normalização de texto | P3 | S | 001 | DONE |
| 013  | Consolidar guarda de dono + log `ficha_edits` das rotas de escrita | P3 | M | 001, 011 | IN PROGRESS |
| 014  | Podar/redigir payloads de erro antes de devolver ao cliente | P3 | S | — | TODO |
| 015  | Extrair formatadores compartilhados da god page | P3 | M | 001 | TODO |
| 016  | Tela de histórico/auditoria sobre `ficha_edits` (spike) | P2 | M | 013 | TODO |
| 017  | Fechar o loop de `tags_novas.significado` na UI (spike) | P3 | M | — | TODO |
| 018  | Worklist local "por fazer" sobre `repricer_status_ml` (spike) | P3 | M | — | TODO |
| 019  | Criação rápida de anúncio via catálogo (multi-cliente) | P1 | L | — | DONE |
| 020  | Marcar e proteger a fronteira do motor de análise (prep multi-cliente, kanban "Do Anúncio ao Portal" f1c1) | P1 | S | — | DONE |
| 021  | Tabelas novas `clientes`/`contas_ml_clientes`, tokens isolados dos robôs (kanban "Do Anúncio ao Portal" f1c2) | P1 | S | — | DONE |
| 022  | OAuth do Mercado Livre de verdade pro portal, app separado dos robôs (kanban "Do Anúncio ao Portal" f1c3) | P1 | M | 020, 021 | DONE |
| 023  | Login de cliente com RLS de verdade, Supabase Auth em `/portal/*` (kanban "Do Anúncio ao Portal" f1c4) | P1 | L | 021, 022 | DONE |
| 024  | Fila e worker assíncrono pra operações em lote (kanban "Do Anúncio ao Portal" f2c1) | P1 | M | 020 | DONE |
| 025  | Estender o lote pra título/descrição, só geração — gravação continua manual/revisada (kanban "Do Anúncio ao Portal" f2c2) | P1 | M | 024 | DONE |
| 026  | Tela de progresso do lote — criar/acompanhar pela UI, tique-taque, "repetir o que falhou" (kanban "Do Anúncio ao Portal" f2c3) | P1 | M | 024, 025 | DONE (branch `feat/f2c3-tela-progresso-lote`) |
| 027  | Roteiro da Fase 3 (portal público) + f3c0 (bug middleware) + f3c1 (cliente conecta a própria conta ML) | P1 | L | 022, 023 | ROTEIRO + f3c0/f3c1 DONE; f3c2 DONE (028); f3c3+ aguardam decisões |
| 028  | Camada de token pra conta ML de cliente do portal — `comContaCliente`, refresh de uso único em `contas_ml_clientes` (kanban Fase 3, f3c2) | P1 | L | 027 | DONE (branch `feat/f3c2-token-cliente` — §1, NÃO mergear sem revisão) |
| 029  | Criar anúncio FORA do catálogo (produto sem PDP / lançamento) — era o fallback adiado do 019 | P1 | L | 019 | DONE (branch `feat/anuncio-fora-catalogo`) |
| 030  | IA no anúncio fora do catálogo — descrição, escolha de categoria e roteiro de fotos | P1 | M | 029 | DONE (branch `feat/029-ia-avulso`) |
| 031  | Provedor de IA plugável — OpenRouter OU Anthropic direto (sem plano próprio, mudança pequena) | P2 | S | — | DONE (branch `feat/openrouter-provider`) |
| 032  | Enriquecer a ficha do anúncio avulso SEM agente — GTIN→catálogo (determinístico) + visão de um tiro sobre foto da etiqueta. Veredito do LLM Council. | P1 | M | 029, 030 | DONE (Partes A+B; branch `feat/032-ficha-gtin`. Parte C fora de escopo por decisão.) |
| 033  | Rascunho de anúncio por IA — roteamento GTIN→catálogo, botão "Preencher com IA", ficha buscada no site do fabricante (web). 2 vereditos do LLM Council + decisão do Livio. | P1 | L | 029–032 | DONE (Partes A+B+C+D; branch `feat/033-rascunho-ia`) |
| 034  | Levar "criar anúncio" (019, 029–033) pro portal do cliente — rotas `/api/portal/anuncios/**` via `comContaCliente`, página `/portal/criar` | P1 | L | 027, 028 | DONE (branch `feat/034-portal-anuncios`, empilhado em 027+028 rebasados — §1, NÃO mergear 028 sem revisão) |

## Dependency notes

- **001 primeiro**: os refactors mais arriscados (002, 006, 012, 013, 015) exigem rede de
  regressão — o `npm run verificar` atual não cobre token, refresh, nem as rotas de mutação.
  Plano 002 (corrida do token) e 001 (testes de token) devem andar juntos; 002 depende de 001.
- **006 antes de 008**: o cache de categoria (008) depende da conta ser resolvida/memoizada
  uma vez por request (006), para a chave do cache poder ser por-conta.
- **013 antes de 016**: a tela de histórico (016) lê `ficha_edits`; consolidar o helper de
  escrita (013) primeiro garante um formato único de log que 016 consome.
- **001/011 antes de 013**: 013 mexe no comportamento documentado; 011 fixa a documentação
  que 013 deve preservar.
- **019 é independente dos demais**: usa `comConta`/`listarContas`/`buscarProdutos` já prontos;
  não depende de 013 porque cria uma tabela de log própria (`anuncio_criacoes`) em vez de
  reusar `ficha_edits` (que exige `item_id` de um anúncio já existente).

## Findings considered and rejected

- **REJEITADO — "testar o copy" (TEST-02 tautologias em `verificar-ficha.mjs`) como plano
  próprio**: será tratado como parte de 001 (o harness novo substitui a duplicação de lógica
  por imports reais). Não é um plano separado.
- **REJEITADO — split completo da god page `itens/[id]/page.tsx` (DEBT-06 integral)**: o plano
  015 limita-se a extrair os formatadores/helpers compartilhados (menor risco). Decompor a
  tela em componentes por seção fica como follow-up explícito dentro de 015, não num plano
  próprio, porque exige caracterização visual prévia em massa (fora do escopo read-only).
- **REJEITADO — `next` 15.5 vs React 19 exact-pin**: pinagem intencional; risco de upgrade
  baixo. Não é finding.
- **REJEITADO — chamada Anthropic via fetch em vez de SDK**: intencional e documentado no
  README ("Claude opcional"); o que importa é o formato de erro divergente, coberto em 014.
- **REJEITADO — resposta 503/erro raw do ML (CORR-02 parte "ML error body") como plano de
  segurança separado**: coberto em 014 (podagem de erro), sem plano próprio.
- **REJEITADO — fallback de criação de anúncio sem correspondência no catálogo como parte do
  019**: escopo mínimo viável primeiro (só catálogo); vira um plano novo se o usuário quiser depois
  de validar o caminho rápido — **nota (2026-09-02)**: o número 020 já foi usado pelo plano da
  fronteira do motor de análise (kanban "Do Anúncio ao Portal", Fase 1); este fallback usa o
  próximo número livre quando for retomado.

## Status do 019 (2026-09-01, concluído)

Steps 0-5 implementados. Migração `anuncio_criacoes` aplicada e verificada em `list_tables`.
`npx vitest run`: 18/18 (incluindo os 3 testes exigidos pelo Test plan — GTIN, payload/status
nunca "active", log de sucesso e falha em `anuncio_criacoes`).

O gate completo do AGENTS.md passa limpo no repo inteiro:

- `npx tsc --noEmit` — sem erros.
- `npm run lint` — sem erros (só warnings pré-existentes de `no-unused-vars` em arquivos fora
  do escopo do 019, sem relação com esta mudança).
- `npm run build` — build de produção completo, incluindo as rotas novas (`/criar`,
  `/api/anuncios`, `/api/catalogo/buscar`).
- `node --experimental-strip-types scripts/verificar-ficha.mjs` — OK.

Nesta mesma passada também foram corrigidos, com autorização explícita do Livio, os problemas
pré-existentes fora do escopo do 019 que antes bloqueavam `build`/`lint` no repo inteiro
(provavelmente resíduo do 013 "IN PROGRESS" ou de outra sessão em andamento):

- `src/app/api/titulo/[id]/route.ts`: removida duplicação de `type Travado` e da função
  `ehErroDeCampoDoTitulo`; `item?.[chave] ?? null` em vez de indexação que podia estourar em
  `item` nulo; `atributos` tipado em vez de `any[]`; a chamada a `perguntarAoClaude` agora passa
  por `promptTitulo(...)` (estava chamando com o objeto de contexto cru — bug real, a função
  builder do prompt era importada e nunca usada).
- `src/app/api/descricao/[id]/route.ts`: import faltando de `donoDoAnuncio`; `valor: a.value_name
  ?? ''` para bater com o tipo `AtributoResumo`.
- `src/app/api/imagens/[id]/route.ts`: guarda de `conta` nula (403) antes de usar; `?? null` no
  fallback de `origem` da imagem.
- `src/app/api/itens/[id]/route.ts`: `payload`/`antes` de `registrarEscrita` embrulhados em
  objeto (`{ attributes }`) para bater com `EscritaPayload`/`EscritaAntes`; removida variável
  morta `categoryId`.
- `src/lib/ia-tipos.ts`, `src/lib/ml/catalogo-tipos.ts`, `src/lib/ml/origem.ts`,
  `src/lib/ml/perguntas.ts`, `src/lib/ml/tendencias.ts`: imports relativos terminam em `.ts`
  porque `scripts/verificar-ficha.mjs` roda via `node --experimental-strip-types`, que exige a
  extensão literal nesses imports — mantidos como estavam, e adicionado
  `"allowImportingTsExtensions": true` no `tsconfig.json` (válido porque `noEmit: true` já
  estava setado) para o `tsc` parar de rejeitar (`TS5097`).
- `eslint.config.mjs`: reescrito para registrar só os dois plugins de fato usados no repo
  (`@next/eslint-plugin-next`, `eslint-plugin-react-hooks`) e as duas regras referenciadas pelos
  `eslint-disable-next-line` já existentes (`@next/next/no-img-element`,
  `react-hooks/exhaustive-deps`) — sem adotar o preset completo do `eslint-config-next`, que
  arrasta um monte de regras não usadas por este repo e gerava uma cascata de erros novos e não
  relacionados em arquivos antigos.
- `src/lib/auditoria.ts`: `import { db } from '../supabase'` → `'./supabase'` (caminho errado,
  não existe `src/supabase.ts`).

Nada disso mudou comportamento visível do painel — só corrigiu erro de tipo/lint e um bug real
de "prompt nunca usado" no título. Ainda vale conferir com quem estiver tocando o 013 se essas
correções batem com a direção que aquele refactor está tomando.

## Status do 020 (2026-09-02, concluído)

Steps 1-6 implementados exatamente como planejado — mudança só em `eslint.config.mjs`,
`README.md`, `AGENTS.md` e `plans/README.md`; nenhum arquivo de código/comportamento tocado.

- Bloco `no-restricted-imports` em `eslint.config.mjs` cobrindo os 12 arquivos motor
  (`src/lib/ml/{model,analise,attributes,catalogo,catalogo-tipos,tags,tendencias,perguntas,
  origem}.ts`, `src/lib/{normalizar,ia,ia-tipos}.ts`), barrando `../supabase`/`./supabase`/
  `@/lib/supabase`.
- Teste negativo feito em 2 arquivos (um em `src/lib/ml/`, um em `src/lib/` direto —
  `model.ts` e `ia-tipos.ts`): import de Supabase adicionado manualmente, `npm run lint` falhou
  com a mensagem customizada nos dois, depois revertido (`diff` confirmou zero sobra) e o lint
  voltou a passar limpo.
- `README.md` ganhou a seção "Motor de análise vs. camada de conta (prep multi-cliente)".
- `AGENTS.md` ganhou a §11 com a mesma invariante.
- Gate completo do AGENTS.md, rodado numa cópia integral do repo (mesmo `package-lock.json`,
  `npm install` limpo):
  - `npm run lint` — mesmos warnings pré-existentes de sempre (`no-unused-vars` em arquivos fora
    de escopo), zero erro novo.
  - `npm run typecheck` (`tsc --noEmit`) — limpo.
  - `npm run build` — build de produção completo, sem mudança nas rotas.
  - `npm run verificar` — OK, mesma saída de sempre.
  - `npm test` — 18/18 (mesmos testes do 019, nenhum novo — este plano não mexeu em runtime).

## Status do 021 (2026-09-02, concluído)

Migração aplicada no projeto vivo `vcxweutjmmycajnulkak` via `mcp__Supabase__apply_migration`
(`clientes_e_contas_ml_clientes`) e confirmada em `list_tables` (verbose): as duas tabelas, RLS
`true` nas duas, FK `contas_ml_clientes.cliente_id → clientes.id`, índices únicos em
`clientes.email` (case-insensitive) e `contas_ml_clientes.seller_id`.

Teste de integridade rodado via `execute_sql`: inserido 1 cliente + 1 conta ML de teste,
confirmado o vínculo, depois `delete` do cliente confirmou `on delete cascade` de verdade
(0 linhas restantes nas duas tabelas). `supabase/schema.sql` do repo atualizado com a mesma
migração (fonte versionada). `AGENTS.md §1` estendido com a invariante de `seller_id` nunca
coincidir entre `contas` e `contas_ml_clientes`. `README.md` ganhou nota na seção "Motor de
análise vs. camada de conta".

Zero arquivo `.ts`/`.tsx` tocado — gate do AGENTS.md rodado como no-op de confirmação
(`npm run build`/`lint`/`verificar`/`test`, todos exit 0, mesma saída do baseline do 020).

**Duas discrepâncias encontradas durante a auditoria do projeto Supabase vivo, registradas para o
Livio decidir se viram plano — não corrigidas aqui:**

- `.env.example` aponta `SUPABASE_URL=https://szrrrnelgozeizmbtivm.supabase.co`, mas o projeto
  Supabase realmente em uso (confirmado por dado real batendo com o código) é
  `vcxweutjmmycajnulkak` ("Chckup_Anuncios", criado 2026-08-31). Refs diferentes — vale conferir
  qual `.env.local` está de fato configurado.
- `tags_novas` está definida em `supabase/schema.sql` mas **não existe** no projeto vivo. Como
  `src/lib/ml/tags-novas.ts` grava/lê essa tabela dentro de um `try/catch` que engole erro, é
  possível que o dicionário de tags desconhecidas não esteja gravando nada em produção hoje.

## Status do 022 (2026-09-03, concluído)

Steps 1-6 implementados como planejado. Arquivos novos: `src/lib/ml/clientAccounts.ts` (adapter),
`src/app/api/oauth/ml/authorize/route.ts`, `src/app/api/oauth/ml/callback/route.ts`,
`src/app/clientes/page.tsx`, `tests/oauth-state.test.ts`, `tests/client-accounts.test.ts`.
Editados: `src/lib/env.ts` (3 getters novos), `src/lib/ml/oauth.ts` (`buildAuthorizationUrl`,
`exchangeCodeForToken`, `assinarState`/`verificarState` — `refreshAccessToken` intocado),
`.env.example`, `AGENTS.md §1`, `README.md`.

`salvarConexaoCliente` (`clientAccounts.ts`) aplica em runtime a não-colisão de `seller_id` entre
`contas` e `contas_ml_clientes` (antes só documentada no AGENTS.md desde o 021) — rejeita com
`ConflitoDeContaError` tanto quando o seller já é robô quanto quando já pertence a outro cliente
do portal. Nenhuma rota nova entra em `ehRotaPublica`; `/clientes`,
`/api/oauth/ml/authorize` e `/api/oauth/ml/callback` ficam atrás da mesma senha única do painel
de hoje, sem nenhuma mudança no `middleware.ts`.

Testes novos: roundtrip/adulteração/expiração/malformado do `state` assinado (5), URL de
autorização usa credenciais do portal e não dos robôs (1), corpo do POST de troca de código
correto + erro do ML propagado (2), `salvarConexaoCliente` nos 4 ramos — novo, reconexão,
colisão com `contas`, colisão com outro cliente (4), `listarClientesComConexoes` (1). Suíte
inteira: **31/31** (18 baseline + 13 novos), 5 arquivos de teste.

Gate completo rodado numa cópia integral do repo (mesmo `package-lock.json`, `npm install`
limpo):

- `npx tsc --noEmit` — limpo (precisou anotar `hexParaBytes` como `Uint8Array<ArrayBuffer>` em
  `oauth.ts`, mesmo ajuste que `crypto.ts` já tinha por causa de um alerta de tipo do
  `crypto.subtle.verify` nesta versão do TS/lib.dom — não é regressão, é o mesmo padrão já
  existente no arquivo irmão).
- `npm run lint` — mesmos warnings pré-existentes de sempre (`no-unused-vars` fora do escopo),
  zero erro novo.
- `npm run build` — build de produção completo; as três rotas novas aparecem na tabela de rotas
  (`/clientes`, `/api/oauth/ml/authorize`, `/api/oauth/ml/callback`).
- `npm run verificar` — OK, mesma saída de sempre.
- `npm test` — 31/31.

**Não** foi criado nenhum app no DevCenter do Mercado Livre nem preenchida nenhuma credencial
real — `ML_CLIENT_ID_PORTAL`/`ML_CLIENT_SECRET_PORTAL`/`ML_REDIRECT_URI_PORTAL` ficam vazias no
`.env.local` do Livio até ele registrar o app e decidir o `redirect_uri`/estratégia de teste
local (túnel HTTPS) — ver "Maintenance notes" do plano 022. O teste manual de ponta a ponta
(clicar em "Conectar" de verdade) depende disso e não foi feito nesta passada.

**Desvio do plano**: o "Git workflow" descrito no 022 (branch + commit + PR) não foi seguido —
como nas passadas 020/021, as mudanças foram escritas e enviadas direto pra árvore de trabalho no
dispositivo do Livio (sem uma ferramenta de shell no dispositivo disponível nesta sessão pra
rodar `git`). Registrado aqui para o Livio decidir se quer organizar isso em branch/PR manualmente
depois.

## Status do 023 (2026-09-03, concluído)

**Arquivos criados**: `src/lib/supabase/browser.ts`, `src/lib/supabase/server.ts`,
`src/lib/portal/cadastro.ts`, `src/app/portal/login/page.tsx`, `src/app/portal/cadastro/page.tsx`,
`src/app/portal/painel/page.tsx`, `src/app/api/portal/completar-cadastro/route.ts`,
`src/app/api/portal/logout/route.ts`, `tests/portal-cadastro.test.ts`,
`plans/023-login-cliente-rls.md`.

**Arquivos editados**: `src/middleware.ts` (ramo `/portal/*` separado do gate de
`PANEL_PASSWORD`), `src/lib/env.ts`, `.env.example` (variáveis novas +
correção do `SUPABASE_URL` — ver abaixo), `supabase/schema.sql` (coluna `auth_user_id` +
policies), `package.json`/`package-lock.json` (`@supabase/ssr` 0.12.5), `AGENTS.md`, `README.md`.

**Migração aplicada de verdade, não só escrita**: usei o MCP do Supabase conectado nesta sessão
(projeto `vcxweutjmmycajnulkak`, "Chckup_Anuncios" — confirmado como o projeto real deste repo:
`list_tables` bateu exatamente com `supabase/schema.sql`, incluindo `contas` com as 2 contas reais
dos robôs) para rodar `alter table`/`create policy` via `apply_migration`. Depois **verifiquei a
RLS na mão** contra o banco real: criei dois `auth.users` de teste + duas linhas em `clientes`
vinculadas a cada um, mais uma conexão em `contas_ml_clientes` pra um deles, e rodei `select`
simulando `set local role authenticated; set local request.jwt.claims = '{"sub":"<uid>"}'` pra
cada usuário e pra `role anon`. Resultado: usuário A só via a própria linha de `clientes` (nunca a
de B), usuário B idem (nunca via a conexão ML de A em `contas_ml_clientes`), e a sessão anônima
não via nenhuma linha. Todos os dados de teste foram apagados (`delete`) depois — banco real
ficou limpo, sem sobra.

**Correção lateral, não pedida no plano mas descoberta ao mexer no Supabase**: o `SUPABASE_URL`
em `.env.example` apontava pra `szrrrnelgozeizmbtivm.supabase.co`, que não é o projeto real deste
repo (esse dado já estava sinalizado como pendente desde o plano 021). Corrigido pra
`vcxweutjmmycajnulkak.supabase.co`, confirmado via `list_tables` do MCP do Supabase. Não mexi no
`.env.local` real do Livio (não tenho acesso a ele) — só no template.

**Resultado da verificação**:

- `npm run build` — passou; rotas novas (`/portal/login`, `/portal/cadastro`, `/portal/painel`,
  `/api/portal/completar-cadastro`, `/api/portal/logout`) aparecem na tabela de rotas; nenhum
  warning novo (só os pré-existentes, não relacionados a este plano).
- `npm run lint` — zero erro novo.
- `npm run verificar` — OK, mesma saída de sempre.
- `npm test` — 34/34 (31 de antes + 3 novos de `tests/portal-cadastro.test.ts`).

**Não verificado nesta passada** (fica pro Livio, mesma natureza do teste manual do OAuth no
022): o fluxo de browser de verdade (`signUp`/`signInWithPassword`, cookies de sessão através do
`@supabase/ssr`) depende de abrir a aplicação num navegador — não aconteceu nesta sessão. Também
não sei se o projeto Supabase tem confirmação de e-mail ligada por padrão; se estiver, o cadastro
self-service em `/portal/cadastro` vai parar no aviso "confirme seu e-mail" em vez de logar
direto — ver STOP conditions do plano 023.

**Desvio do plano**: mesmo motivo dos planos 020/021/022 — sem `device_bash` nesta sessão, não
rodei o "Git workflow" (branch/commit/PR). Arquivos enviados direto pra árvore de trabalho no
dispositivo do Livio, na pasta reconectada nesta sessão
(`E:\ShinCode\Trabalho\App\checkup-anuncio_1\checkup-anuncio`).

## Status do 024 (2026-09-03, concluído)

**Arquivos criados**: `src/lib/lotes/fila.ts`, `src/app/api/lote/route.ts`,
`src/app/api/lote/[id]/route.ts`, `src/app/api/lote/[id]/processar/route.ts`,
`tests/lotes.test.ts`, `plans/024-fila-worker-lote.md`.

**Arquivos editados**: `tests/helpers/supabase-fake.ts` (o fake não suportava `.insert(array)` —
só gravava uma linha, espalhando os índices do array como chaves; corrigido pra gravar uma linha
por elemento, necessário pra testar `criarLote` inserindo vários `lote_itens` de uma vez),
`AGENTS.md`, `README.md`.

**Pesquisa que definiu o desenho**: confirmei ao vivo (`vercel.com/docs/cron-jobs/usage-and-pricing`)
que o plano Hobby da Vercel (o que este repo usa, por `README.md`) só permite cron **1x por dia**,
impreciso em até 59 min — inviável pra processar lote em minutos. Por isso o worker
(`/api/lote/[id]/processar`) é pensado pra ser chamado repetidamente por quem inicia o lote (a
tela de progresso do f2c3), não por um cron — decisão registrada no plano com a fonte. Também
procurei um número oficial de rate-limit da API do ML e não achei um documentado publicamente
(só menção genérica a `429`); por isso o desenho é defensivo (concorrência 1, backoff via
`marcarParaRetentar`) em vez de mirar um número que eu não conseguiria confirmar.

**Migração aplicada de verdade**: `lotes`/`lote_itens` criadas via `mcp__Supabase__apply_migration`
no projeto real (`vcxweutjmmycajnulkak`), mesmo padrão do plano 023. RLS ligada, zero policy
(só `service_role`/admin acessa por enquanto — igual `ficha_edits`/`anuncio_criacoes`).

**Resultado da verificação**:

- `npm run build` — passou; `/api/lote`, `/api/lote/[id]`, `/api/lote/[id]/processar` aparecem
  na tabela de rotas.
- `npm run lint` — zero erro novo.
- `npm run verificar` — OK, mesma saída de sempre.
- `npm test` — 45/45 (34 de antes + 11 novos de `tests/lotes.test.ts`).

**Não verificado nesta passada**: chamar o worker de verdade contra a API do ML — não tenho
`ML_CLIENT_ID`/tokens de conta neste ambiente. Fica pro Livio, depois do deploy, criar um lote
pequeno (2-3 anúncios reais) via `curl -X POST` e chamar `/processar` repetidas vezes até ver
`status: "concluido"` — mesma natureza do teste manual do OAuth (022) e do login (023). Sem UI
própria ainda (fica pro f2c3); testar hoje é só via chamada HTTP direta.

**Desvio do plano**: mesmo motivo dos planos 020-023 — sem `device_bash`, sem branch/commit/PR;
arquivos enviados direto pra `E:\ShinCode\Trabalho\App\checkup-anuncio_1\checkup-anuncio`.

## Status do 025 (2026-09-03, concluído)

Implementado seguindo o "Desenho" do plano. Escopo confirmado como o desenho propõe: o lote
**só gera** proposta de título/descrição (guardada em `lote_itens.resultado`); a gravação no ML
continua manual e revisada, um anúncio por vez, pelo `PUT` das rotas — mudança de comportamento
de produto (aplicar em massa sem revisão) fica pro Livio pedir explicitamente se quiser.

**Arquivos criados**: `src/lib/ml/titulo.ts` (`gerarPropostaTitulo` — motor), `src/lib/ml/descricao.ts`
(`gerarPropostaDescricao` + `montarContexto` + `textoAtual` — motor), `src/lib/lojaBlocos.ts`
(`lerBlocosDaLoja` — adapter; injetado no motor de descrição para ele não importar Supabase),
`tests/lote-titulo-descricao.test.ts`.

**Arquivos editados**: `src/app/api/titulo/[id]/route.ts` e `src/app/api/descricao/[id]/route.ts`
(o `POST` virou wrapper fino sobre a função de motor; `PUT` **intocado**), `src/lib/lotes/fila.ts`
(`TipoLote`/`TIPOS_LOTE`/`ehTipoLote`, `criarLote` aceita `tipo`, `buscarLote` seleciona e
normaliza `tipo`), `src/app/api/lote/route.ts` (`POST` aceita e valida `tipo`),
`src/app/api/lote/[id]/processar/route.ts` (worker despacha por `lote.tipo`),
`tests/helpers/supabase-fake.ts` (fake ganhou `.maybeSingle()`, que `lerBlocosDaLoja` usa e o
fake ainda não suportava), `eslint.config.mjs` (titulo.ts/descricao.ts entram na lista de motor
do `no-restricted-imports`), `supabase/schema.sql`, `README.md`, `AGENTS.md §11`.

**Regressão do `POST` (STOP condition do plano)**: os 5 testes de rota de
`tests/lote-titulo-descricao.test.ts` foram escritos e rodados verde contra os handlers **antes**
da extração (numa cópia temporária sem os imports de motor), e continuam verdes depois — os
valores esperados foram derivados lendo o handler original. Mais 2 testes provam que
`gerarPropostaTitulo`/`gerarPropostaDescricao` devolvem o mesmo `corpo` que a rota. O JSON do
`POST` de `/titulo` e `/descricao` é idêntico byte a byte ao de antes.

**Gate completo do AGENTS.md** (rodado no repo, `npm install` primeiro — faltava `@supabase/ssr`
instalado de verdade):

- `npm run build` — build de produção completo; `/api/lote/[id]/processar` e as rotas de sempre
  na tabela de rotas; typecheck (`tsc --noEmit`) limpo.
- `npm run lint` — zero erro. Warnings de `no-unused-vars`: os mesmos pré-existentes, **menos 4**
  (a limpeza de imports mortos em `/api/titulo/[id]/route.ts`); nenhum warning novo.
- `npm run verificar` — OK, mesma saída de sempre.
- `npm test` — **58/58** (45 de antes + 13 novos de `tests/lote-titulo-descricao.test.ts`:
  regressão do `POST`, motor, `tipo` na fila, e despacho do worker por tipo — inclusive o ramo
  `diagnostico` seguindo idêntico ao 024).

**Migração aplicada no banco real** (`vcxweutjmmycajnulkak`, 2026-09-03): a ferramenta de
migração do Supabase (`mcp__Supabase__apply_migration`) foi bloqueada pelo classificador de
permissão desta sessão (DDL em produção), então o SQL abaixo foi entregue e rodado pelo Livio no
SQL Editor do Supabase. Confirmado via `list_tables`: `public.lotes.tipo` — `text`, default
`'diagnostico'`, check `in ('diagnostico','titulo','descricao')`. `lotes`/`lote_itens` (do 024)
seguem com 0 linhas.

```sql
alter table public.lotes add column if not exists tipo text not null default 'diagnostico';
alter table public.lotes drop constraint if exists lotes_tipo_check;
alter table public.lotes add constraint lotes_tipo_check check (tipo in ('diagnostico','titulo','descricao'));
```

**Não verificado nesta passada** (mesma natureza dos planos 022-024): chamar o worker de verdade
contra a API do ML com `tipo: 'titulo'`/`'descricao'` — sem `ML_CLIENT_ID`/tokens neste ambiente.
Fica pro Livio, depois de aplicar a migração e fazer deploy: criar um lote pequeno com
`tipo` novo via `POST /api/lote` e chamar `/processar` até `status: "concluido"`, conferindo o
`resultado` de cada `lote_item`.

**Desvio do plano**: o "Git workflow" foi seguido desta vez — há `git` real nesta sessão. As
mudanças pendentes na árvore de trabalho (planos 020-024, escritos mas nunca commitados) e o
plano 025 foram organizados em branch + commit + PR.

## Status do 029 (2026-09-03, concluído)

Era o "fallback de criação sem correspondência no catálogo" listado em "Findings considered and
rejected" (adiado do 019). O `/criar` agora tem dois modos: **Do catálogo** (019, intocado) e
**Fora do catálogo** (novo) — pra produto sem PDP no ML (lançamento, nicho).

**Arquivos criados**: `src/app/api/anuncios/avulso/route.ts` (`POST` — cria item de marketplace:
`title`/`category_id`/`price`/`pictures[source]`/`attributes` BRAND+MODEL+GTIN-ou-EMPTY_GTIN_REASON/
`sale_terms` da garantia/`listing_type_id`; **mesmo invariante do 019** — nasce `paused`, PUT de
pausa se o ML ignorar, tudo logado em `anuncio_criacoes` com `catalog_product_id: null`;
descrição opcional via `PUT /items/{id}/description` best-effort depois do create),
`src/app/api/anuncios/categoria/route.ts` (`GET` só-leitura — `domain_discovery` do ML sugere
`category_id` pelo título), `src/app/criar/CriarModos.tsx` (toggle dos dois modos),
`src/app/criar/CriarAvulso.tsx` (form do modo avulso), `tests/anuncios-avulso.test.ts`.

**Arquivos editados**: `src/lib/auditoria.ts` (`registrarCriacaoAnuncio.catalogProductId` virou
opcional — `?? null` no insert; o 019 continua passando a string, comportamento idêntico),
`src/app/criar/page.tsx` (renderiza `CriarModos` em vez de `CriarAnuncio` direto).
**`src/app/api/anuncios/route.ts` (catálogo) NÃO foi tocado.**

**Gate completo (AGENTS.md)**: `build` / `lint` / `verificar` / `test` — verdes, **64/64**
(58 + 6 novos: payload avulso correto e sem `catalog_listing`; GTIN quando informado; ML devolve
"active" → PUT pausa; descrição best-effort loga erro sem derrubar o sucesso; create recusado
loga a falha com `item_id`/`catalog_product_id` null; validação antes do ML).
`tests/anuncios.test.ts` (catálogo, 019) roda junto e **continua 100% verde**.

**Fora de escopo (follow-ups)**: form dinâmico de atributos obrigatórios por categoria além de
BRAND/MODEL/GTIN (se o ML recusar por atributo faltando, o erro cru volta pro vendedor);
variações; `shipping` (dimensões/peso/frete grátis — hoje o ML aplica o default da conta);
upload de arquivo de imagem (só URL). Detalhado no fim de `plans/029-anuncio-fora-do-catalogo.md`.

**Não testado**: criar um anúncio avulso de verdade contra o ML — sem `ML_CLIENT_ID`/token neste
ambiente (mesma natureza do teste manual pendente do 019).

**Desvio do plano**: branch `feat/anuncio-fora-catalogo` a partir da `main` + commit + push + PR.

## Status do 030 (2026-09-03, concluído)

IA no fluxo do 029, a pedido do Livio. Decisão de produto (o Livio confirmou por
`AskUserQuestion`): **imagens por IA = roteiro de fotos**, não geração de imagem — o ML exige
foto real do produto; imagem gerada por IA viola a política deles e engana o comprador.

**Arquivos criados**: `src/app/api/anuncios/ia/route.ts` (`POST { acao: 'descricao' |
'roteiro-fotos', titulo, marca?, modelo?, category_id?, category_nome?, tem_fotos? }` — só fala
com o Claude, não com o ML; sem `ANTHROPIC_API_KEY` devolve 503), `tests/anuncios-ia.test.ts`.

**Arquivos editados**:
- `src/lib/ia.ts` (motor, sem Supabase): `promptDescricaoNova` (descrição de produto que ainda
  não existe — input enxuto, proíbe inventar), `promptEscolhaCategoria` + `lerEscolhaCategoria`
  (o Claude escolhe UM `category_id` de uma LISTA fixa — a do `domain_discovery` — e
  `lerEscolhaCategoria` descarta id fora da lista, anti-alucinação), `promptRoteiroFotos` +
  `lerRoteiroFotos`.
- `src/app/api/anuncios/categoria/route.ts` (029): depois do `domain_discovery`, se
  `temIA()` e houver > 1 candidato, o Claude escolhe o melhor → `{ sugestoes, escolha }`.
  Best-effort: Claude falhando NÃO derruba a resposta (STOP condition do plano). Compatível —
  quem consumia `{ sugestoes }` continua.
- `src/app/criar/CriarAvulso.tsx`: botão "IA recomenda: MLBxxx — <motivo>" na categoria; botão
  "Roteiro de fotos (IA)" que lista o que fotografar (com o aviso "a IA não gera as fotos");
  botão "Gerar com IA" na descrição (confirma antes de sobrescrever texto digitado).

**Gate completo (AGENTS.md)**: `build` / `lint` / `verificar` / `test` — verdes, **76/76**
(64 + 12 novos). `tests/anuncios-avulso.test.ts` e `tests/anuncios.test.ts` seguem 100% verdes.

**Não testado**: contra o Claude/ML de verdade — sem `ANTHROPIC_API_KEY`/`ML_CLIENT_ID` neste
ambiente. Fica pro Livio depois do deploy: abrir `/criar` → "Fora do catálogo", pôr um título,
clicar em "Sugerir pelo título" (checa a escolha da IA), "Roteiro de fotos (IA)" e "Gerar com
IA" na descrição.

**Desvio do plano**: branch `feat/029-ia-avulso` empilhado sobre `feat/anuncio-fora-catalogo` +
commit + push + PR.

## Status do 032 (2026-09-03, concluído — Partes A+B)

Executado o plano 032 (derivado do veredito do LLM Council: **não** construir agente com
ferramentas; atacar "anexar ficha confiável a um rascunho" na ordem de menor custo).

**Parte A — determinístico por GTIN**:
- `src/app/api/anuncios/ficha-por-gtin/route.ts` (nova, `GET`, só leitura): GTIN →
  `buscarProdutos` → `{ achado, titulo_sugerido, domain_id, atributos: {id,nome,valor}[] }`.
  **Nunca devolve as imagens do produto de catálogo** (veredito: são do fabricante/ML, não
  podem virar as fotos do anúncio).
- `src/app/api/anuncios/avulso/route.ts`: corpo aceita `atributos_extra` — mesclados DEPOIS de
  BRAND/MODEL/GTIN, sem os reservados, dedup por id, teto 40. `origem_ficha` gravado no
  `response` de `anuncio_criacoes` (medição pra Parte C).
- `CriarAvulso.tsx`: botão "Buscar ficha pelo código" → lista de atributos com checkbox →
  entram como `atributos_extra`. "Usar título sugerido" quando o título está vazio.

**Parte B — ficha de uma foto (visão, um tiro)**:
- `src/lib/ia.ts`: `perguntarComImagem(prompt, imagemUrl, maxTokens)` — mesmo despacho de
  provedor; bloco de imagem em formato OpenRouter (`image_url`) ou Anthropic (`image`
  `source.type:'url'`). `perguntarViaAnthropic`/`perguntarViaOpenRouter` passaram a aceitar
  `content: unknown` (string ou blocos) — **caminho de texto byte-idêntico** ao de antes.
  `promptFichaDaFoto` + `lerFichaDaFoto`.
- `POST /api/anuncios/ia` ganhou `acao: 'ficha-da-foto'` (`foto_url` obrigatório, http; senão
  400; sem chave → 503). Devolve `{ titulo_sugerido, atributos: {nome,valor}[] }` — **sugestão
  pro Livio revisar**, não preenche os `attributes` do ML sozinho.
- `CriarAvulso.tsx`: campo "URL de uma foto da etiqueta/manual/caixa" + botão "Extrair ficha da
  foto (IA)" → lista `{nome,valor}` com aviso "confira antes de usar".

**Parte C (busca web / loop de agente)**: NÃO implementada — fora de escopo por decisão. Só
retomar com baseline medido (`origem_ficha`) + Partes A/B insuficientes + decisão explícita.

**Gate completo (AGENTS.md)**: `build` / `lint` / `verificar` / `test` — verdes, **90/90**
(11 novos: `tests/anuncios-ficha-gtin.test.ts` + `ficha-da-foto`/`lerFichaDaFoto` em
`tests/anuncios-ia.test.ts`). `tests/anuncios-avulso.test.ts` e `tests/anuncios.test.ts`
seguem 100% verdes (STOP condition).

**Não testado**: contra o ML/IA de verdade — sem `ML_CLIENT_ID`/`OPENROUTER_API_KEY` neste
ambiente. Teste manual: `/criar` → "Fora do catálogo" → pôr um GTIN real → "Buscar ficha pelo
código"; e "Extrair ficha da foto" com a URL de uma foto de etiqueta.

**Desvio do plano**: branch `feat/032-ficha-gtin` empilhado sobre `feat/openrouter-provider`
(que tem o plano doc) + commit + push + PR.

## Status do 033 (2026-09-03, concluído — Partes A+B+C+D)

Origem: o Livio pediu "coloco só o básico e a IA preenche tudo, nada manual". Dois vereditos do
LLM Council + a decisão dele fecharam o escopo: **IA preenche categoria/marca/modelo/ficha
(inclusive buscando no site do fabricante)/descrição — tudo como sugestão revisável**; **foto e
publicação continuam manuais** (regra do ML: foto real; o anúncio nasce na conta do cliente).

- **Parte A — roteamento GTIN→catálogo** (o achado central dos conselhos): `CriarAvulso.tsx`
  detecta quando o GTIN resolve pra um produto de catálogo (`produto_id` do
  `/api/anuncios/ficha-por-gtin`) e oferece "Ir pro modo Do catálogo" levando marca/modelo/código.
  `CriarModos.tsx` guarda `prefill`; `CriarAnuncio.tsx` aceita `prefill`.
- **Parte B — `POST /api/anuncios/rascunho`** (rota nova): do título (+gtin/marca/modelo) monta
  `{ category_id, marca, modelo, atributos, descricao }` — categoria via `domain_discovery`+IA,
  marca/modelo via `promptMarcaModelo`, ficha via GTIN (determinístico) OU web (Parte C),
  descrição via `promptDescricaoNova`. **Best-effort**: cada peça que falha volta vazia. Botão
  "Preencher com IA" + banner fixo "confira tudo".
- **Parte C — `POST /api/anuncios/ficha-web`** + `src/lib/web/busca.ts` (`buscarNaWeb` via
  Tavily, atrás de `WEB_SEARCH_API_KEY`). Busca → junta 2-3 páginas → 1 chamada
  `promptFichaDaWeb` (trechos entre delimitadores, tratados como dado — anti prompt-injection) →
  só specs FACTUAIS; `modelo_confere:false` → devolve vazio + aviso. Botão "Buscar ficha no site
  da marca (IA)" + lista com fontes. `.env.example` ganhou `WEB_SEARCH_PROVIDER`/`WEB_SEARCH_API_KEY`.
- **Parte D — sem código de imagem**: o bloco "Resultado" do sucesso ganhou um link
  "Padronizar as fotos" → `/itens/{id}/fotos` (a tela que já faz quadrado/fundo branco pra
  anúncio existente; o recém-criado já tem `id`).

**Fora de escopo (foi o maior ponto cego apontado pelo conselho)**: publicação automática, score
de confiança, entrada em lote ("fábrica de anúncios"); geração/scraping/transformação de imagem
de produto; preencher `attributes` do ML a partir de texto da web/foto sem o Livio mapear o `id`.

**Gate completo (AGENTS.md)**: `build` / `lint` / `verificar` / `test` — verdes, **99/99**
(9 novos em `tests/anuncios-rascunho.test.ts` — `ficha-web` nos 4 ramos, `rascunho` com ficha por
GTIN + best-effort + validação, `lerMarcaModelo`/`lerFichaDaWeb`). Regressão de 029/030/032
intocada.

**Não testado**: contra ML/IA/Tavily de verdade — sem chaves neste ambiente. Pro Livio: pôr
`OPENROUTER_API_KEY` (já tem) e criar chave Tavily grátis em https://tavily.com, `WEB_SEARCH_API_KEY`
no `.env.local`. Aí `/criar` → Fora do catálogo → título → "Preencher com IA".

**Desvio do plano**: branch `feat/033-rascunho-ia` empilhado sobre `feat/032-ficha-gtin`.
Parte A commitada separada (`f91e06d`); B+C+D num commit. Push + PR.

## Status do 027 (2026-09-03) — roteiro da Fase 3 + f3c0 + f3c1

`plans/027-fase-3-roteiro.md` é um **roteiro**, não um card: quebra a Fase 3 (portal público) em
f3c0–f3c6, separa o mecânico do que depende de decisão de produto sua, e registra o buraco
central (não existe caminho pra rodar o motor no nome de um cliente do portal — `client.ts` só
conhece a tabela `contas`). **f3c2+ não foram implementados** — aguardam suas respostas às 5
decisões de produto no fim do roteiro.

Implementados nesta passada os dois cards mecânicos e de baixo risco:

**f3c0 — bug do middleware** (achado na pesquisa): `/api/portal/completar-cadastro` e
`/api/portal/logout` não começam com `/portal`, então caíam no gate do `PANEL_PASSWORD` e eram
redirecionados (302) pra `/login` — logout falhava calado e o cadastro self-service quebrava no
passo 2 em produção. Provável razão de não ter pego antes: o "fluxo de browser de verdade" do
plano 023 nunca foi testado (STOP condition do 023). Correção: `middleware()` roteia
`/portal/*` **e** `/api/portal/*` por `tratarRotaPortal`; sem sessão numa rota `/api/`, responde
`401` JSON em vez de redirect.

**f3c1 — cliente conecta a própria conta ML pelo portal**:
- `src/lib/ml/oauth.ts` — `assinarState(clienteId, origem, agora)` e `verificarState` agora
  carregam `origem: 'admin' | 'portal'` no `state` assinado (HMAC cobre a origem). O ML só
  aceita 1 `redirect_uri` por app, então os dois pontos de partida dividem o mesmo callback e é
  o `state` que diz pra onde voltar. Formato do state mudou de 3 pra 4 partes — state antigo em
  voo vira inválido (janela de 10 min, usuário só clica de novo).
- `src/app/api/portal/ml/conectar/route.ts` (novo) — lê o `cliente_id` da **sessão Supabase**
  (query RLS-scoped, sem `?cliente_id=` na query como a rota admin), assina com `origem:'portal'`.
- `src/app/api/oauth/ml/callback/route.ts` — redireciona pra `/portal/painel` ou `/clientes`
  conforme `origem`. `paginaClientes` → `paginaRetorno(req, origem, aviso)`.
- `src/lib/portal/avisosOauth.ts` (novo) — mapa de `?aviso=` extraído de `/clientes`, agora
  compartilhado com `/portal/painel`.
- `src/app/portal/painel/page.tsx` — botão "Conectar conta do Mercado Livre" + leitura do
  `?aviso=`.

**Gate completo (AGENTS.md)**: `npm run build` / `lint` / `verificar` / `test` — verdes,
**64/64** testes (58 na `main` + 6 novos: `verificarState` com `origem`, e o callback
redirecionando por `origem` nos 4 ramos). `tests/oauth-state.test.ts` atualizado pro novo
contrato de `verificarState` (retorna `{ clienteId, origem }`).

**Não testado unitariamente** (dependem de `next/headers`/`NextRequest`, que o repo não mocka —
mesma limitação dos testes de `/portal/*` do plano 023): `/api/portal/ml/conectar` e o gate do
`middleware.ts`. Ficam pro teste manual no browser, junto com o resto do fluxo do portal que o
plano 023 também deixou pendente.

**Desvio do plano**: branch `feat/fase3-conectar-conta` a partir da `main` (já com o PR #1
mergeado) + commit + push + PR.

## Status do 028 (2026-09-03, DONE — §1, não mergear sem revisão)

O Livio delegou as 5 decisões de produto do roteiro ("escolha as melhores práticas"). As
tomadas e usadas neste plano: **#4** — cliente opera só nas contas ML que ele conectou
(`contas_ml_clientes` com o `cliente_id` dele); **#5** — no portal, título/descrição continuam
"só geração", gravação revisada um a um (igual plano 025). As outras (#1 convite-only, #2
cobrança depois, #3 branding sem subdomínio) viram f3c4/f3c5/f3c6 — registradas no `plans/027`.

**Um pipeline de token só.** `src/lib/ml/client.ts` agora serve os dois universos: o `escopo`
(`AsyncLocalStorage`) carrega `universo: 'robos' | 'cliente'`. `comConta` = robôs (`contas`);
`comContaCliente(clienteId, sellerId, fn)` = portal (`contas_ml_clientes`). `getAccount` e
`refrescarUmaVez` ramificam; `mlFetch`/`validToken` intocados. Motivo de não duplicar num
`mlFetchCliente`: o motor (§11) chama `mlFetch` daqui e precisa funcionar pros dois sem
refatoração; dois refresh divergentes reintroduziriam a corrida do §1.

**Arquivos**: `src/lib/ml/oauth.ts` (+ `refreshAccessTokenPortal` — cópia do refresh dos robôs
com credenciais do app do portal), `src/lib/ml/client.ts` (`comContaCliente`, `contaDoCliente`,
`saveTokensCliente`, ramos de `universo` em `getAccount`/`refrescarUmaVez`, dedup chaveado por
`${universo}:${sellerId}`), `AGENTS.md §1`, `plans/README.md`. `tests/token-cliente.test.ts`
(novo, 5 testes — espelho do `token-flow.test.ts`: token válido; renova com credenciais do
PORTAL e grava na linha de `contas_ml_clientes`; 401 → 1 retry; refresh concorrente = 1
renovação + 1 gravação; sem escopo de cliente `getAccount` continua nos robôs).

**Gate completo (AGENTS.md)**: `build` / `lint` / `verificar` / `test` — verdes, **69/69**
(64 + 5 novos). `tests/token-flow.test.ts` (caminho dos robôs) roda junto e **continua 100%
verde, sem alteração** — era a STOP condition principal.

**Nada de schema neste card.** `lotes.cliente_id` + policies de RLS de `lotes`/`lote_itens` +
as rotas/telas `/portal/lote*` são o f3c3, que depende desta revisão.

**Não testado**: chamar o ML de verdade com um token de cliente real — sem `ML_CLIENT_ID_PORTAL`
nem conexão de cliente neste ambiente (mesma natureza do teste manual pendente dos planos
022/023/027).

**Desvio do plano**: branch `feat/f3c2-token-cliente` empilhado sobre `feat/fase3-conectar-conta`
+ commit + push + PR. **Não mergear sem revisão humana — é o §1.**

## Status do 034 (2026-09-03, DONE — branch `feat/034-portal-anuncios`)

O fluxo de criação de anúncio (catálogo + fora do catálogo + IA + ficha por GTIN/foto/web,
planos 019/029–033) agora roda dentro de `/portal/*` pro cliente logado, operando na conexão ML
que **ele** conectou (`contas_ml_clientes`, via `comContaCliente`). Zero mudança no fluxo admin.

**Pré-requisitos (feitos nesta passada)**: `feat/fase3-conectar-conta` (027) e
`feat/f3c2-token-cliente` (028) rebasados na `main` atual (`1c6f06f`, já com os PRs #7/#8). O
rebase só teve conflito de documentação (`plans/README.md`), resolvido preservando as duas
árvores. **028 é §1 — continua exigindo revisão humana antes de mergear**; `feat/034-portal-anuncios`
está empilhado sobre ele. Os merges na `main` não foram feitos aqui (convenção de PR do repo +
`origin/main` em movimento por outra sessão).

**Adapter novo** — `src/lib/portal/contaAtiva.ts`: resolve a conexão ativa do cliente logado
(sessão Supabase → `clientes.id` → `contas_ml_clientes`), **sempre** validando o `seller_id`
pedido contra as conexões do próprio cliente (`seller_alheio` → 409; `sem_sessao` → 401;
`sem_conexao` → 409). `resolverContaDoClienteLogado` devolve um executor que embrulha a chamada
ao ML em `comContaCliente` — nunca `comConta`. Seam de teste `injetarResolvedorDeSessao`.

**Refactor** — o corpo dos handlers admin de `/api/anuncios{,/avulso,/categoria,/ficha-por-gtin,
/rascunho,/ia,/ficha-web}` e `/api/catalogo/buscar` saiu pra funções puras em
`src/lib/anuncios/{avulso,catalogo,consultas,assistente}.ts`. A única variação entre admin e
portal é "abrir escopo" (`comConta` × `comContaCliente`); payload, invariante de nascer `paused`
+ PUT de pausa e o log em `anuncio_criacoes` são um só. `tests/anuncios*.test.ts` (admin)
**100% verdes, sem alteração** — era a STOP condition.

**Rotas novas** — `src/app/api/portal/anuncios/**` (8): `route.ts` (catálogo), `avulso`,
`categoria`, `ficha-por-gtin`, `catalogo/buscar`, `rascunho` (ML via `comContaCliente`); `ia`,
`ficha-web` (não batem no ML — só gate de sessão). `seller_id` do corpo/query nunca é a
identidade — só escolhe entre as conexões do cliente, e é validado.

**Componentes** — `CriarModos`/`CriarAnuncio`/`CriarAvulso` ganharam `base` (default
`/api/anuncios`) e `baseCatalogo` (default `/api/catalogo`); o portal passa
`/api/portal/anuncios` e `/api/portal/anuncios/catalogo`. `ferramentasInternas={false}` no
portal esconde o link "Padronizar as fotos" (tela `/itens/*`, só admin).

**Página** — `src/app/portal/criar/page.tsx` (0 conexões → "Conecte uma conta do ML primeiro"
com link pra `/api/portal/ml/conectar`; ≥1 → `CriarModos`). `/portal/painel` ganhou o botão
"Criar anúncio".

**Migração** (aditiva, nullable — entregar ao Livio pro SQL Editor; MCP de migração bloqueado):

```sql
alter table public.anuncio_criacoes add column if not exists cliente_id bigint references public.clientes(id);
alter table public.ficha_edits add column if not exists cliente_id bigint references public.clientes(id);
```

`registrarCriacaoAnuncio`/`registrarEscrita` ganharam `clienteId?` opcional → `cliente_id` no
insert (admin passa `undefined` → null). RLS dessas tabelas segue service_role-only, como no
admin (fora de escopo: RLS por cliente — só quando houver tela de histórico do cliente).

**Gate completo (AGENTS.md)**, rodado no worktree com `node_modules` do repo:
`npm run build` / `lint` / `typecheck` / `verificar` / `test` — verdes, **120/120**
(8 novos em `tests/portal-anuncios.test.ts`: `contaAtiva` isolado nos 3 erros; rota avulso do
portal — 401 sem sessão sem tocar o ML, caminho feliz com token do CLIENTE + `cliente_id` no
log + `seller_id` do corpo ignorado, 409 pra seller de outro cliente; gate de sessão de
categoria/ia). `tests/anuncios*.test.ts` e `tests/token-*.test.ts` intocados.

**Não testado** (mesma natureza dos planos 022–033): fluxo de navegador de verdade — depende de
`ML_CLIENT_ID_PORTAL` + um cliente de teste com conexão em `contas_ml_clientes` no ambiente.

**Fora de escopo** (do plano): lote no portal (f3c3), RLS por cliente de
`anuncio_criacoes`/`ficha_edits`, branding do portal (f3c5), escrita de título/descrição em
lote (segue a decisão do 025).

**Desvio do plano**: os merges de 027/028 na `main` não foram feitos (ver acima); ficam pro
Livio via PR, com 028 revisado à mão por ser §1.
