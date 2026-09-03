# Plan 022: OAuth do Mercado Livre de verdade para contas de cliente (f1c3)

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se um "STOP condition" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo tem `.git` (`github.com/LivioRS/Checkup_Anuncios`). Compare os trechos
> abaixo com `file:line` contra o arquivo vivo antes de editar.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM — primeiro código que lê/grava em `contas_ml_clientes` e o primeiro fluxo
  OAuth `authorization_code` do repo (hoje só existe `refresh_token`). Não toca `contas` nem o
  fluxo dos robôs. O ponto de atenção real é a invariante "seller_id nunca em `contas` E
  `contas_ml_clientes`" (AGENTS.md §1) — este plano é quem primeiro a **aplica em runtime**, não
  só documenta.
- **Depends on**: 021 (tabelas `clientes`/`contas_ml_clientes` já existem, RLS ligado sem
  policy) e 020 (fronteira motor/adapter — os arquivos novos deste plano são "adapter", livres
  pra importar Supabase).
- **Category**: feature/auth (kanban "Do Anúncio ao Portal", Fase 1, card 3 — f1c3)
- **Planned at**: 2026-09-03.

## Why this matters

f1c3 do quadro: **"OAuth do Mercado Livre de verdade — Tela 'conectar sua conta', redirect URI,
app registrado no DevCenter — hoje o painel evita isso de propósito."**

Hoje `src/lib/ml/oauth.ts` só tem `refreshAccessToken` — o painel nunca fez o fluxo de
autorização (`authorization_code`); quem autoriza são os robôs do `dashboard-ml-bot`, fora deste
repo. Pra clientes terceiros conectarem a própria conta ML ao portal, o painel precisa, pela
primeira vez, redirecionar pro `/authorization` do ML, receber o `code` de volta, trocar por
tokens, e gravar em `contas_ml_clientes` — não em `contas`.

Decisões tomadas com o usuário nesta sessão:

- **App do ML novo, dedicado ao portal** — não reaproveita o `checkup-anuncios`
  (`client_id 2475515893628993`) que os robôs usam. Cada app do ML só aceita um `redirect_uri`
  cadastrado por vez (confirmado na documentação oficial: "The redirect_uri has to match exactly
  what is registered in your application settings... the URL cannot contain variable
  information" — mismatch dá `redirect_uri_error`); reaproveitar o app dos robôs faria o
  `redirect_uri` do portal colidir com o deles se algum dia precisarem de authorization_code
  também. Isolamento total de app segue a mesma lógica já adotada em `contas` vs.
  `contas_ml_clientes` (021) e motor vs. adapter (020).
- **Codar agora com placeholder, registrar depois** — cadastrar o app no DevCenter é uma ação
  manual com login de desenvolvedor do Livio; eu não consigo fazer isso. O código sai pronto
  atrás de três variáveis de ambiente novas (`ML_CLIENT_ID_PORTAL`, `ML_CLIENT_SECRET_PORTAL`,
  `ML_REDIRECT_URI_PORTAL`), hoje vazias — o Livio registra o app e preenche o `.env.local`
  quando quiser, sem eu tocar em código de novo. Testes automatizados (mock de fetch/Supabase)
  não dependem disso; só o teste manual de ponta a ponta (clicar em "Conectar" de verdade)
  depende do app estar registrado com um `redirect_uri` alcançável por HTTPS (localhost puro
  provavelmente não funciona — ver STOP conditions).

Este plano **não** cria login de cliente nem tela pública de cadastro (isso é f1c4, que também
adiciona a policy de RLS de verdade). A tela de "conectar conta" fica atrás da MESMA senha única
do painel de hoje (`PANEL_PASSWORD`/cookie `painel`) — é uma tela de administração pro Livio
testar a conexão com clientes que ele mesmo cadastra por SQL, não o portal público da Fase 3.

## Current state

- `src/lib/ml/oauth.ts:1-38` — só `refreshAccessToken` (grant `refresh_token`). Nenhuma função de
  `authorization_code` existe.
- `src/lib/env.ts:1-26` — `env.clientId`/`env.clientSecret` leem `ML_CLIENT_ID`/`ML_CLIENT_SECRET`
  (app dos robôs). Nenhuma variável "portal" existe ainda.
- `src/lib/ml/client.ts:16-114` — o padrão de adapter que este plano espelha para
  `contas_ml_clientes`: tipo de conta, busca por `seller_id`, `saveTokens` (update na mesma
  linha). Este plano cria o equivalente para clientes; **não edita `client.ts`**.
- `src/lib/crypto.ts:1-76` — primitivas HMAC/Web Crypto já prontas (`sha256Hex`, `igualSegura`,
  padrão `payload.assinatura`) usadas hoje pra assinar o cookie de sessão do painel
  (`assinarSessao`/`verificarSessao`). Este plano reusa o MESMO padrão pra assinar o `state` do
  OAuth (não reusa as funções em si, que são específicas do cookie — cria duas novas irmãs em
  `oauth.ts`, mesma técnica).
- `src/lib/supabase.ts:13-25` — `db()`, cliente `service_role`, único ponto de acesso ao Supabase.
- `src/middleware.ts:16-23` — `ehRotaPublica` só libera `/login`, `/api/panel-login`, `/produto`,
  estáticos. Qualquer rota nova (`/clientes`, `/api/clientes`, `/api/oauth/ml/*`) já nasce atrás
  da senha por padrão — **nenhuma mudança no middleware é necessária**.
- `src/app/api/panel-login/route.ts:1-64` — padrão de rate-limit por IP e `caminhoSeguro` contra
  open redirect (AGENTS.md §7); referência de estilo, não é tocado por este plano (o callback do
  ML não aceita `next` arbitrário do usuário — redireciona sempre pra `/clientes`, fixo).
- `supabase/schema.sql:97-117` (plano 021) — `contas_ml_clientes`: `cliente_id`, `seller_id`
  (unique), `access_token`, `refresh_token`, `access_expira_em`, `apelido`. RLS ligado, sem
  policy — só `service_role` acessa, que é como este plano acessa (via `db()`, servidor).
- `.env.example:1-11` — variáveis do app dos robôs (`ML_CLIENT_ID`, `ML_CLIENT_SECRET`,
  `ML_SELLER_ID_PADRAO`). Este plano adiciona uma seção nova, separada, pro app do portal.
- **Confirmado via documentação oficial do Mercado Livre** (`developers.mercadolivre.com.br`,
  `global-selling.mercadolibre.com`) nesta sessão: `redirect_uri` precisa bater EXATAMENTE com o
  cadastrado no app (sem parte variável), erro é `redirect_uri_error` em caso de divergência.
  Formato confirmado:
  `GET https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=$APP_ID&redirect_uri=$URL`
  e `POST https://api.mercadolibre.com/oauth/token` com
  `grant_type=authorization_code&code=$CODE&redirect_uri=$URL` (mesmo formulário que
  `refreshAccessToken` já usa pro grant de refresh).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Gate completo | `npm run build && npm run lint && npm run verificar && npm test` | exit 0 |
| Testes só deste plano | `npx vitest run tests/oauth-portal.test.ts` (nome definido no Step 5) | novos testes passam |
| Confirmar schema (sem alterar) | `mcp__Supabase__list_tables` (verbose, projeto `vcxweutjmmycajnulkak`) | `contas_ml_clientes`/`contas` como no plano 021 |

## Scope

**In scope**:

- `src/lib/env.ts`: getters novos `clientIdPortal`, `clientSecretPortal`, `redirectUriPortal`
  (lendo `ML_CLIENT_ID_PORTAL`, `ML_CLIENT_SECRET_PORTAL`, `ML_REDIRECT_URI_PORTAL`), com erro
  claro se ausentes (mesmo padrão de `req()` já existente).
- `src/lib/ml/oauth.ts`: três funções novas —
  - `buildAuthorizationUrl(state: string): string` — monta a URL de `/authorization` com
    `client_id`/`redirect_uri` do portal.
  - `exchangeCodeForToken(code: string): Promise<TokenResponse>` — grant `authorization_code`
    (reusa o tipo `TokenResponse` já existente).
  - `assinarState(clienteId: number)` / `verificarState(state, agora?)` — HMAC do `cliente_id` +
    expiração curta (10 min — é só o tempo de ida-e-volta no navegador), mesma técnica de
    `crypto.ts` (`crypto.subtle`), pra o callback saber pra qual cliente é a conexão sem confiar
    em nada que venha só da query string do usuário.
- `src/lib/ml/clientAccounts.ts` (novo — "adapter", livre pra importar Supabase, mesma categoria
  de `client.ts`/`items.ts`/`dono.ts`/`tags-novas.ts` no AGENTS.md §11):
  - `listarClientesComConexoes()` — join simples `clientes` + `contas_ml_clientes`, pra tela
    admin listar quem já conectou o quê.
  - `salvarConexaoCliente(input)` — grava/atualiza a linha de `contas_ml_clientes`. **Aplica a
    invariante do AGENTS.md §1 em runtime**: antes de gravar, confere se o `seller_id` já existe
    em `contas` (rejeita com erro claro se sim — é uma conta de robô, não pode virar conta de
    cliente) e se já existe em `contas_ml_clientes` associado a OUTRO `cliente_id` (rejeita — uma
    conta ML não pode pertencer a dois clientes ao mesmo tempo). Upsert por `seller_id` quando é
    o mesmo cliente reconectando.
- Rotas novas (todas atrás da senha do painel — nenhuma entra em `ehRotaPublica`):
  - `GET /clientes` (`src/app/clientes/page.tsx`) — lista `clientes` (cadastrados hoje só via SQL
    no Supabase, igual ao teste do plano 021 — criar cliente pela UI é f1c4/fora de escopo) com
    suas conexões ML, e um link "Conectar conta Mercado Livre" por cliente sem conexão.
  - `GET /api/oauth/ml/authorize?cliente_id=` — assina o `state`, redireciona (302) pro
    `/authorization` do ML.
  - `GET /api/oauth/ml/callback` — recebe `code`+`state`, valida o `state`, troca o `code` por
    token, chama `GET /users/me` do ML com o `access_token` novo (prova real de que o token
    funciona — usa o `nickname` devolvido como `apelido`), grava via `salvarConexaoCliente`,
    redireciona pra `/clientes` (sempre fixo — nunca usa `next` do usuário, não há open-redirect
    possível aqui).
- `.env.example`: seção nova "Aplicação do Mercado Livre — portal (cliente)" com as 3 variáveis,
  comentário explicando que é um app **separado** do dos robôs e por quê, e nota que o
  `redirect_uri` cadastrado no DevCenter precisa bater exatamente com
  `ML_REDIRECT_URI_PORTAL`.
- `AGENTS.md §11` (ou nota na §1): registrar que `clientAccounts.ts` é quem aplica em runtime a
  não-colisão de `seller_id` entre `contas` e `contas_ml_clientes` — antes só documentado, agora
  também código.
- `README.md`: atualizar a nota da seção "Motor de análise vs. camada de conta" — `contas_ml_clientes`
  agora tem código lendo/gravando (f1c3); login de cliente de verdade continua f1c4.
- Testes (`vitest`): exchange de código (mock `fetch`), assinatura/verificação de `state`
  (roundtrip, adulterado, expirado), `salvarConexaoCliente` (mock Supabase via `injetarCliente`)
  cobrindo os três casos — sucesso, `seller_id` já em `contas` (rejeita), `seller_id` já em
  `contas_ml_clientes` de outro cliente (rejeita).

**Out of scope** (explicitamente):

- Cadastro de cliente pela UI (`POST /api/clientes` ou formulário) — clientes de teste continuam
  entrando via SQL/Supabase Studio, como no plano 021. Fica pra f1c4 ou um plano dedicado.
- Login/autenticação de cliente, Supabase Auth, policy de RLS de verdade em `clientes`/
  `contas_ml_clientes` — tudo isso é f1c4.
- Registro do app no DevCenter — ação manual do Livio, fora do meu alcance.
- Refresh de token pra contas de cliente (`refrescarUmaVez`/`mlFetch` equivalente) — só existe
  motivo pra renovar quando o portal de fato **usa** a API em nome do cliente (diagnóstico,
  Fase 2). Este plano só conecta e prova que o token funciona uma vez (`/users/me`); o token pode
  vencer sem problema até Fase 2 existir.
- Desconectar/revogar uma conta já conectada — sem UI de remoção neste plano.
- Deploy do portal num domínio real / decidir o `redirect_uri` final — o Livio decide isso quando
  registrar o app; o código só precisa que a variável exista e bata com o que foi cadastrado.
- Qualquer mudança visual além de reusar os componentes/tokens já existentes (`Selo`, `Secao`,
  `.btn`, `.card` de `globals.css`/`ui.tsx` — o mesmo sistema documentado em `DESIGN.md`).

## Git workflow

Branch feature (`feat/022-oauth-portal-cliente` ou similar) + commit normal + PR, como
019/020/021.

## Steps

### Step 1: variáveis de ambiente do app do portal

`src/lib/env.ts` — adicionar `clientIdPortal`, `clientSecretPortal`, `redirectUriPortal` (mesmo
padrão `req()` das existentes). `.env.example` — nova seção com as 3 variáveis vazias e o
comentário explicando o isolamento de app.

**Verify**: `npx tsc --noEmit` limpo; importar qualquer um dos três getters sem as env vars
setadas lança o erro claro de sempre (`Variável de ambiente ausente: ...`), igual ao
comportamento já existente pras variáveis dos robôs.

### Step 2: `oauth.ts` — authorization_code + state assinado

Adicionar `buildAuthorizationUrl`, `exchangeCodeForToken`, `assinarState`, `verificarState` em
`src/lib/ml/oauth.ts`, ao lado de `refreshAccessToken` (não editar a função existente).
`verificarState` retorna o `cliente_id` decodificado quando válido, `null` quando
adulterado/expirado/malformado — o chamador decide o que fazer com `null` (não lança).

**Verify**: teste unitário cobre roundtrip (assina, verifica, `cliente_id` bate), adulteração
(muda 1 char da assinatura → `null`), expiração (`agora` passado além da janela → `null`).

### Step 3: `clientAccounts.ts` — adapter de `contas_ml_clientes`

Novo arquivo `src/lib/ml/clientAccounts.ts`. `salvarConexaoCliente` faz, nesta ordem: (1) confere
`seller_id` em `contas` — se existir, rejeita; (2) confere `seller_id` em `contas_ml_clientes` —
se existir com `cliente_id` diferente, rejeita; se existir com o MESMO `cliente_id`, é
reconexão — upsert; se não existir, insere. `listarClientesComConexoes` faz o join pra tela.

**Verify**: testes com `injetarCliente` cobrindo os 3 ramos de `salvarConexaoCliente` (sucesso
novo, sucesso reconexão, rejeição por colisão com `contas`, rejeição por colisão com outro
cliente — 4 casos ao todo).

### Step 4: rotas — listar, autorizar, callback

- `src/app/clientes/page.tsx`: lista via `listarClientesComConexoes()`, reusa `Secao`/`Selo` de
  `@/components/ui` e as classes de `globals.css` (`.card`, `.tabela`, `.btn`) — mesmo sistema
  visual do resto do painel, sem CSS novo.
- `src/app/api/oauth/ml/authorize/route.ts`: lê `cliente_id` da query, `assinarState`, redireciona
  302 pra `buildAuthorizationUrl(state)`. `cliente_id` ausente ou não-numérico → 400.
- `src/app/api/oauth/ml/callback/route.ts`: lê `code`+`state`+`error` da query (ML manda `error`
  quando o usuário nega autorização — trata como redirecionamento de volta com aviso, não como
  exceção). `verificarState` → 400 se `null`. `exchangeCodeForToken` → `GET /users/me` com o
  token novo → `salvarConexaoCliente` → redireciona pra `/clientes` (fixo) com um parâmetro de
  aviso (`?conectado=1` ou `?erro=...`) pra tela mostrar feedback.

**Verify**: `npm run build` compila as três rotas sem erro; `npm run lint` limpo.

### Step 5: testes

`tests/oauth-portal.test.ts` (ou dividido, ex. `tests/oauth-state.test.ts` +
`tests/client-accounts.test.ts` — seguir a convenção de nomes já usada em `tests/`). Cobre Steps
2 e 3 (listados acima) mais um teste de integração leve da troca de código (mock de `fetch`
devolvendo um `TokenResponse` válido, confirma que `exchangeCodeForToken` manda o `grant_type`,
`redirect_uri` e credenciais certos no corpo do POST).

**Verify**: `npx vitest run` — todos os testes novos passam, nenhum teste existente quebra
(baseline: 18/18 antes deste plano).

### Step 6: `AGENTS.md`, `README.md`, `plans/README.md`, gate

Atualizações de documentação descritas em Scope. Rodar o gate completo.

**Verify**: `npm run build && npm run lint && npm run verificar && npm test` — todos exit 0.

## Test plan

- Roundtrip de `state`: assina com `cliente_id=42`, verifica, confirma que volta `42`.
- `state` adulterado (1 char trocado na assinatura) → `verificarState` retorna `null`.
- `state` expirado (janela de 10 min estourada) → `null`.
- `exchangeCodeForToken`: mock de `fetch` confirma `grant_type=authorization_code`,
  `redirect_uri` igual ao configurado, `client_id`/`client_secret` do portal (não os dos robôs).
- `salvarConexaoCliente`: 4 casos (novo, reconexão, colisão com `contas`, colisão com outro
  cliente em `contas_ml_clientes`) — mock via `injetarCliente`.
- Gate completo do AGENTS.md limpo, testes existentes (18) continuam passando.

## Done criteria

- [ ] `env.ts` tem os 3 getters novos; `.env.example` documenta o app separado do portal.
- [ ] `oauth.ts` tem `buildAuthorizationUrl`, `exchangeCodeForToken`, `assinarState`,
      `verificarState`, sem alterar `refreshAccessToken`.
- [ ] `clientAccounts.ts` existe, aplica a não-colisão de `seller_id` em runtime (não só
      documentada).
- [ ] `/clientes`, `/api/oauth/ml/authorize`, `/api/oauth/ml/callback` existem, atrás da senha do
      painel (nenhuma entrada nova em `ehRotaPublica`).
- [ ] Testes novos cobrem os casos do Test plan; suíte inteira passa.
- [ ] `AGENTS.md`, `README.md`, `plans/README.md` atualizados.
- [ ] Gate completo (`build`/`lint`/`verificar`/`test`) exit 0.
- [ ] **Não** foi criado nenhum app no DevCenter nem preenchida nenhuma credencial real — as 3
      variáveis novas ficam vazias no `.env.local` do Livio até ele registrar o app.

## STOP conditions

Pare e reporte se:

- Alguma rota nova precisar entrar em `ehRotaPublica` pra funcionar — não deveria (o fluxo todo
  roda dentro da sessão já autenticada do painel); se acontecer, é sinal de que o desenho está
  errado, não ajuste o middleware sem entender por quê.
- `salvarConexaoCliente` for chamado num caminho onde a checagem de colisão com `contas` pode ser
  contornada (ex.: um código futuro chamando o `db()` direto em vez desta função) — isso quebra a
  invariante do AGENTS.md §1. Pare e sinalize, não corrija escondido.
- Precisar decidir HTTPS local (ngrok/túnel) pra testar de ponta a ponta — não é algo que eu
  resolvo sozinho; documente a necessidade e pergunte ao Livio como ele quer testar quando chegar
  a hora (o gate automatizado roda inteiro sem precisar disso, só o teste manual real depende).
- O ML devolver formato de resposta diferente do documentado (`TokenResponse`,
  `/users/me`) durante teste manual real — reporte o formato exato recebido, não invente campo.

## Maintenance notes

- Cadastro de cliente pela UI e login de cliente de verdade (Supabase Auth + policy de RLS) são
  f1c4 — este plano deixou `clientes`/`contas_ml_clientes` com o primeiro código real em cima,
  mas a tela `/clientes` continua atrás da senha única do painel (admin/teste), não é o portal
  público.
- `refrescarUmaVez`/`mlFetch` equivalente pra contas de cliente nasce só quando existir consumo
  real da API em nome do cliente — Fase 2 do kanban (operações em lote). Até lá o token pode
  vencer sem problema.
- Quando o Livio registrar o app no DevCenter: preencher as 3 variáveis no `.env.local`,
  cadastrar o `redirect_uri` EXATO (sem parte variável — confirmado pela documentação oficial) e
  decidir como testar localmente (túnel HTTPS) ou só validar num deploy real.
- Revisitar as duas discrepâncias já registradas no Status do 021 (`.env.example` com
  `SUPABASE_URL` desatualizada; `tags_novas` ausente no projeto vivo) — nenhuma bloqueia este
  plano, mas continuam pendentes.
