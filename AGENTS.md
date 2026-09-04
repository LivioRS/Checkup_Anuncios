# AGENTS.md — Invariantes obrigatórias para agentes

Este arquivo documenta as regras que **qualquer agente** (ou desenvolvedor) deve seguir ao trabalhar neste repositório. Não são sugestões; são invariantes que, se quebradas, causam bugs reais em produção.

---

## 1. Refresh token do Mercado Livre é de uso único

- O `refresh_token` do ML **só pode ser usado uma vez**. Cada renovação grava o par novo (`access_token` + `refresh_token`) na **mesma linha** da tabela `contas`.
- **NUNCA** guarde o token em outro lugar (arquivo, outra tabela, variável de ambiente, cache externo). Se dois processos renovarem o mesmo token, um recebe `invalid_grant` e derruba o outro.
- O painel **centraliza** o refresh em `src/lib/ml/client.ts` (`refrescarUmaVez` com dedup por `seller_id`). Não crie rotas paralelas que chamem `/oauth/token`.
- A mesma invariante vale para `contas_ml_clientes` (tabela do portal multi-cliente, plano 021):
  cada renovação grava o par novo na mesma linha dessa tabela, nunca em `contas`, e vice-versa.
- **`seller_id` nunca pode existir em `contas` E `contas_ml_clientes` ao mesmo tempo.** São
  universos diferentes — `contas` é das lojas próprias que os robôs operam, `contas_ml_clientes`
  é dos clientes terceiros do portal. Um seller_id nas duas tabelas ao mesmo tempo derrubaria o
  refresh_token de um lado quando o outro renovasse.
- **Desde o plano 022 (card f1c3), essa checagem roda em runtime**, não só é documentada:
  `src/lib/ml/clientAccounts.ts` (`salvarConexaoCliente`) confere `contas` antes de gravar em
  `contas_ml_clientes`, e rejeita (`ConflitoDeContaError`) se o `seller_id` já pertence aos
  robôs ou a outro cliente do portal. Não grave em `contas_ml_clientes` por fora dessa função.
- O app do Mercado Livre do portal (`ML_CLIENT_ID_PORTAL`/`ML_CLIENT_SECRET_PORTAL`) é
  **separado** do app dos robôs (`ML_CLIENT_ID`/`ML_CLIENT_SECRET`) — cada app do ML só aceita 1
  `redirect_uri` cadastrado, e o portal precisa do próprio. Ver `.env.example`.
- **Desde o plano 028 (f3c2), `src/lib/ml/client.ts` serve os DOIS universos com um pipeline
  só.** O `AsyncLocalStorage` (`escopo`) carrega `universo: 'robos' | 'cliente'`; `comConta`
  entra no universo dos robôs (`contas`), `comContaCliente(clienteId, sellerId, fn)` no do
  portal (`contas_ml_clientes`). `refrescarUmaVez` ramifica por `universo`: robôs →
  `refreshAccessToken` + `saveTokens`; cliente → `refreshAccessTokenPortal` + `saveTokensCliente`
  (credenciais do app do portal, grava na linha de `contas_ml_clientes`). O dedup `refreshEmVoo`
  é chaveado por `${universo}:${sellerId}` — nunca cruza os dois. **Não** crie um `mlFetch`
  paralelo pro cliente: o motor (§11) reusa este mesmo. Um segundo pipeline de refresh divergente
  reintroduz exatamente a corrida que o §1 existe pra impedir.

---

## 1b. RLS de `clientes`/`contas_ml_clientes` é real desde o plano 023 (card f1c4)

- As duas tabelas têm policy de verdade (não só `enable row level security` sem policy):
  `auth.uid() = clientes.auth_user_id`, e `contas_ml_clientes` restrita via join nessa mesma
  coluna. Ver bloco no fim de `supabase/schema.sql`.
- **NUNCA** dê `insert`/`delete` pra role `authenticated` em `clientes`. A única via de criação
  de linha é `criarRegistroCliente` (`src/lib/portal/cadastro.ts`), com `service_role` — chamada
  só depois que o Supabase Auth já confirmou a criação do `auth.users` correspondente
  (`/api/portal/completar-cadastro`). Um `insert` liberado pra `authenticated` permitiria a um
  cliente se atribuir o `auth_user_id` de outra pessoa.
- `/clientes` (admin, atrás do `PANEL_PASSWORD`) continua usando `db()`/`service_role` — RLS não
  o afeta (service_role sempre ignora RLS). `/portal/*` é o namespace do cliente final, sessão
  via Supabase Auth (`src/lib/supabase/browser.ts`/`server.ts`), sem relação com
  `PANEL_PASSWORD`/cookie `painel`.

---

## 1c. Chamada ao ML fora de clique humano sempre passa por `comConta` (plano 024, card f2c1)

- `getAccount()` (`src/lib/ml/client.ts`) resolve a conta "ativa" a partir de um escopo
  (`AsyncLocalStorage`) ou do `ML_SELLER_ID_PADRAO`. Um clique de usuário abrindo `/itens/[id]`
  sempre passa pelo escopo certo; **o worker de lote (`/api/lote/[id]/processar`) não** — ele
  processa itens de vários lotes/contas fora de qualquer navegação, então **sempre** envolve a
  chamada em `comConta(lote.seller_id, () => ...)`. Chamar `mlFetch`/`carregarDiagnostico` fora
  de `comConta` num contexto de worker arrisca pegar a conta errada (a de `ML_SELLER_ID_PADRAO`,
  não a do lote).
- `MlError` (`src/lib/ml/client.ts`) carrega `status` — o worker usa isso pra distinguir `429`
  (rate-limit: item volta pra fila) de erro de verdade (item isolado como `erro`, resto do lote
  continua). Não pare o lote inteiro por causa de um item.

---

## 2. `db()` só roda no servidor (service_role)

- `src/lib/supabase.ts` cria o cliente com `service_role`. **NUNCA** importe `db()` em componentes client (`"use client"`).
- Se precisar de dados no client, crie uma rota API (`src/app/api/.../route.ts`) que use `db()` e retorne JSON.

---

## 3. Verificação antes de declarar pronto

Antes de declarar uma tarefa como concluída, **rode os três comandos** e confirme que todos passam:

```bash
npm run build       # compila + typecheck
npm run lint        # eslint (regras base + TS)
npm run verificar   # testes de lógica pura
npm test            # vitest (fluxo de token, crypto)
```

Se algum falhar, **não diga que terminou**. Corrija até passar.

---

## 4. Lint e typecheck são obrigatórios

- `npm run lint` roda ESLint (regras base + TS). Não commite código que gere erros.
- `npm run typecheck` (`tsc --noEmit`) deve passar sem erros.
- Warnings de `@typescript-eslint/no-unused-vars` são aceitáveis; erros não.

---

## 5. Testes: comportamento, não implementação

- Testes em `tests/` usam mocks de `fetch` e do cliente Supabase via `injetarCliente`.
- Teste o **comportamento** (ex.: "refresh concorrente roda 1 vez"), não a implementação.
- Nunca re-implementem lógica de produção no teste (o `verificar-ficha.mjs` antigo fazia isso — não repita).

---

## 6. Segredos: nunca no código, nunca no log, nunca na resposta

- `ML_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `PANEL_PASSWORD`, `PANEL_HMAC_SECRET` **só em `.env.local`** (nunca commitado).
- Rotas de erro **não ecoam** payloads brutos do ML/Claude/sharp ao cliente (`src/app/api/.../route.ts` usam `erroAoSeguro`).
- O cookie `painel` é HMAC assinado (`exp.sig`), não `sha256(senha)` puro.

---

## 7. Rate-limit e open redirect

- `/api/panel-login` tem rate-limit por IP (10 req / 15 min). Não remova.
- Parâmetro `next` só aceita caminho relativo (`/...`). URLs absolutas são bloqueadas.
- Comparação de senha usa `compararSenha` (hash + timing-safe). Não use `===` direto.

---

## 8. Imagens: teto de bytes e pixels

- `src/app/api/imagens/[id]/route.ts` aplica teto de **15 MB** (`Content-Length` + body) e **8192² pixels** no `sharp` (`limitInputPixels`).
- Não aumente esses limites sem justificar por escrito.

---

## 9. Cache de categoria: TTL 24 h por seller

- `src/lib/ml/attributes.ts` usa cache em memória com TTL 24 h, chaveado por `seller_id:categoryId`.
- Não use `revalidate: 86400` no `fetch` (ignorado sob `force-dynamic`).

---

## 10. Comandos de verificação (roteiro obrigatório)

```bash
# Tudo junto — rode antes de abrir PR / declarar pronto
npm run build       # compila + typecheck (tsc --noEmit)
npm run lint        # eslint (regras base + TS)
npm run verificar   # node --experimental-strip-types scripts/verificar-ficha.mjs
npm test            # vitest run (12 testes: token flow + crypto)
```

Se **qualquer um** falhar → a tarefa **não está pronta**.

---

## 11. Motor de análise não importa Supabase direto

- Os arquivos listados como "motor" em `README.md` (seção "Motor de análise vs. camada de
  conta") — `src/lib/ml/model.ts`, `analise.ts`, `attributes.ts`, `catalogo.ts`,
  `catalogo-tipos.ts`, `tags.ts`, `tendencias.ts`, `perguntas.ts`, `origem.ts`, `titulo.ts`,
  `descricao.ts`, `src/lib/normalizar.ts`, `ia.ts`, `ia-tipos.ts` — **NÃO** podem importar
  `db()`/`../supabase` diretamente. Eles recebem dados prontos via parâmetro/opts, ou usam as
  funções já exportadas de `src/lib/ml/client.ts` (`mlFetch`, `getAccount`, `comConta`).
- `src/lib/ml/titulo.ts` e `descricao.ts` (plano 025, f2c2) são a geração de proposta de
  título/descrição, extraída dos handlers `POST` de `/api/titulo/[id]` e `/api/descricao/[id]`
  para o worker de lote (`/api/lote/[id]/processar`) reusar a MESMA lógica. `descricao.ts` lê
  `loja_blocos` só por uma função `carregarBlocos` injetada por quem chama (`lerBlocosDaLoja` em
  `src/lib/lojaBlocos.ts`, que é adapter) — o arquivo de motor não importa Supabase. O `POST`
  dessas rotas virou wrapper fino; o JSON devolvido tem de continuar idêntico ao de antes da
  extração (rede de regressão em `tests/lote-titulo-descricao.test.ts`).
- Isso existe para o dia em que o portal novo (Fase 3 do quadro "Do Anúncio ao Portal") precisar
  reaproveitar essa lógica sem duplicar: esses arquivos devem poder virar um pacote compartilhado
  só com um `git mv` + ajuste de import, sem caçar acesso escondido a Supabase antes.
- A regra é mecânica: `eslint.config.mjs` tem um bloco `no-restricted-imports` para esses
  arquivos — `npm run lint` falha se algum deles importar Supabase. Arquivo novo que for
  genuinamente "motor" entra nessa lista e na seção do README no mesmo PR que o cria.
- `src/lib/ml/client.ts`, `items.ts`, `dono.ts` e `tags-novas.ts` continuam livres para importar
  Supabase — são a camada "adapter", amarrada à tabela `contas` de hoje (ver README para o porquê
  de cada um ficar de fora por enquanto).