# Plan 023: Login de cliente com RLS de verdade (f1c4)

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se um "STOP condition" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo tem `.git` (`github.com/LivioRS/Checkup_Anuncios`). Compare os trechos
> abaixo com `file:line` contra o arquivo vivo antes de editar.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MEDIUM-ALTA — primeiro uso de Supabase Auth do repo e a primeira RLS policy de
  verdade em produção (até aqui `clientes`/`contas_ml_clientes` têm RLS ligado mas zero policy —
  só `service_role` acessava). Uma policy errada pode: (a) fechar demais e ninguém loga, ou (b)
  abrir demais e um cliente vê linha de outro. Este plano verifica (b) na mão, contra o projeto
  Supabase real, antes de declarar pronto — não só escreve o SQL às cegas.
- **Depends on**: 021 (tabelas existem, RLS ligado sem policy), 022 (`contas_ml_clientes` já tem
  dado real fluindo pelo adapter `clientAccounts.ts`).
- **Category**: feature/auth (kanban "Do Anúncio ao Portal", Fase 1, card 4 — f1c4)
- **Planned at**: 2026-09-03.

## Why this matters

f1c4 do quadro: **"Login por cliente com RLS — PANEL_PASSWORD sai; entra Supabase Auth com
isolamento de dados por conta, linha a linha."**

Três lugares do repo já apontam pra este card como o dono do escopo, e concordam entre si:

- `supabase/schema.sql` (comentário da tabela `clientes`): *"A policy de verdade (auth.uid() =
  clientes.auth_user_id) é trabalho do card f1c4 (login por cliente), quando existir Supabase
  Auth de verdade pra testar."*
- `README.md`: *"Falta só o login de cliente de verdade (f1c4), que adiciona Supabase Auth e a
  policy de RLS — hoje as duas tabelas têm RLS ligado e zero policy, só `service_role` acessa."*
- `src/app/clientes/page.tsx`: *"Cadastro de cliente ainda é manual (SQL no Supabase) — a tela de
  cadastro é trabalho do card f1c4."*

**Decisão de escopo (leitura do card à luz desses três apontamentos):** "PANEL_PASSWORD sai" no
texto do card não significa apagar a senha única do painel administrativo do Livio — ela continua
protegendo `/`, `/clientes` etc., sem substituto pedido em nenhum lugar do roteiro, e o
`PRODUCT.md` deixa explícito que esse painel é de uso pessoal do Livio ("Livio, sozinho"). O que
sai é a dependência dessa MESMA senha compartilhada para o **lado do cliente**: hoje não existe
lado do cliente nenhum (cadastro é SQL manual, não tem login). Este plano cria:

1. Cadastro e login de cliente de verdade, com Supabase Auth (`auth.users`), num namespace novo
   `/portal/*` — sem relação com `/clientes` (que continua a tela de administração do Livio,
   atrás do `painel` de sempre).
2. As RLS policies reais em `clientes` e `contas_ml_clientes`, amarradas a
   `auth.uid() = clientes.auth_user_id`, substituindo o "só service_role acessa" de hoje.
3. Uma tela `/portal/painel` mínima que prova a policy funciona: lê os dados **com a sessão do
   próprio cliente** (não com `db()`/service_role) e só pode devolver a linha dele.

Isso é trabalho de "Fase 1: preparar o motor multi-cliente" — prova que o mecanismo de
autenticação + isolamento funciona ponta a ponta. A experiência completa e pública do portal
(f3c1–f3c5: assinatura, subdomínio próprio, seleção de anúncios em lote) é Fase 3, depois que as
Fases 1–2 existirem. `/portal/painel` aqui é deliberadamente simples — é a prova de RLS, não o
produto final.

## Current state

- `src/middleware.ts:1-52` — gate único por `PANEL_PASSWORD`/cookie `painel` (HMAC, ver
  `src/lib/crypto.ts`), aplicado a toda rota exceto a lista pública (`ehRotaPublica`). Não sabe
  nada de Supabase Auth.
- `supabase/schema.sql:81-117` — `clientes` e `contas_ml_clientes` com `enable row level
  security` e **zero policy**: só `service_role` (via `db()`) consegue ler/gravar.
- `src/lib/supabase.ts` — só expõe `db()` (service_role, servidor). Não existe cliente Supabase
  para o browser nem para ler sessão de usuário autenticado.
- `src/lib/env.ts:15-20` — `supabaseUrl`/`supabaseServiceKey`, sem chave anônima/publicável.
- `package.json` — só `@supabase/supabase-js`; falta `@supabase/ssr` (pacote oficial do Supabase
  pra sessão via cookie em App Router do Next — sem ele não dá pra ler sessão em Server
  Component/middleware de forma correta).
- Projeto Supabase real conectado (via MCP): `vcxweutjmmycajnulkak` ("Chckup_Anuncios",
  `us-west-2`, Postgres 17, `ACTIVE_HEALTHY`) — mesmo projeto do `schema.sql` (tabelas batem:
  `contas`, `ficha_edits`, `loja_blocos`, `anuncio_criacoes`, `clientes`, `contas_ml_clientes`,
  todas com RLS ligado). Uso o MCP do Supabase pra aplicar a migração e testar a policy de
  verdade nesta sessão — não só escrevo SQL pro Livio rodar depois.

## Commands you will need

```bash
cd checkup-anuncio
npm install @supabase/ssr
npm run build && npm run lint && npm run verificar && npm test
```

## Scope

**In scope:**

- Migração SQL: coluna `clientes.auth_user_id` + policies reais em `clientes` e
  `contas_ml_clientes` (aplicada de verdade no projeto via MCP do Supabase, e também anexada ao
  `supabase/schema.sql` como registro/histórico, mesmo padrão dos planos 020/021).
- `src/lib/supabase/browser.ts` e `src/lib/supabase/server.ts` — clientes Supabase via
  `@supabase/ssr` (browser com chave anônima; servidor lendo cookies do request, escopo por
  sessão do usuário, não service_role).
- `src/lib/portal/cadastro.ts` (adapter novo) — grava a linha em `clientes` depois que o
  Supabase Auth já criou o `auth.users` (client-side); recusa duplicata de `auth_user_id`/email.
- Rotas `/portal/cadastro`, `/portal/login`, `/portal/painel`, `/api/portal/completar-cadastro`,
  `/api/portal/logout`.
- `src/middleware.ts` — ramo novo pra `/portal/*`: ignora o gate de `PANEL_PASSWORD` (não faz
  sentido pro cliente final) e passa a sessão do Supabase Auth adiante/redireciona pro login.
- Variáveis novas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client-side,
  chave anônima — não é segredo, é feita pra ir no bundle do browser).
- Testes (`tests/`) pro adapter `cadastro.ts` (mock do Supabase fake de sempre).
- Verificação manual da RLS via `execute_sql` do MCP do Supabase (dois usuários simulados,
  confirma que um não vê a linha do outro) — documentada no "Status do 023" do
  `plans/README.md`, já que `vitest`/mock não testa policy de Postgres de verdade.
- `AGENTS.md`, `README.md`, `plans/README.md`.

**Out of scope (fica pra Fase 3, f3c1–f3c5):**

- Verificação de e-mail, recuperação de senha, "esqueci minha senha".
- Botão "conectar Mercado Livre" dentro do `/portal/painel` (o fluxo OAuth de `oauth.ts` já
  existe desde o 022, mas plugar no lado do cliente autenticado é trabalho de Fase 3 — aqui a
  tela só LÊ, via RLS, as conexões que o Livio já colocou manualmente pra aquele cliente).
- Plano/cobrança, subdomínio próprio, visual definitivo do portal.
- Convite/onboarding administrativo (o Livio criar a conta pelo cliente) — este plano é
  self-service (o próprio cliente se cadastra em `/portal/cadastro`); se o modelo de negócio
  precisar ser só-convite, é decisão de Fase 3, não deste plano.

## Git workflow

Mesmo desvio dos planos 020/021/022: sem `device_bash` nesta sessão, não dá pra rodar
`git checkout -b`/commit/PR no dispositivo do Livio. Os arquivos são editados aqui, verificados,
e entregues via `device_commit_files` direto nos caminhos do repo — sem branch nem PR. Registro
do desvio na seção "Status do 023" do `plans/README.md`, mesmo padrão dos três planos anteriores.

## Steps

### Step 1: dependência e variáveis de ambiente

- `npm install @supabase/ssr`.
- `src/lib/env.ts`: adicionar `supabaseAnonKey` (server, `req('SUPABASE_ANON_KEY')` — usada só
  pra montar o cliente do browser a partir de código servidor quando precisar, ex. testes) — mas
  o valor que realmente importa pro browser é lido direto de
  `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY`/`NEXT_PUBLIC_SUPABASE_URL` (Next.js só expõe pro
  bundle client variáveis com esse prefixo; não passam pelo `env.ts` de servidor).
- `.env.example`: nova seção "Supabase Auth — portal do cliente (plano 023 / card f1c4)" com
  `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (mesma URL do projeto, chave
  ANÔNIMA — não a `service_role` — pego o valor real via MCP do Supabase e já deixo preenchido,
  já que não é segredo, foi feita pra ir no browser).

### Step 2: migração SQL (coluna + policies), aplicada de verdade

`supabase/schema.sql` ganha um bloco novo ao final, e o mesmo SQL é aplicado ao projeto
`vcxweutjmmycajnulkak` via `mcp__Supabase__apply_migration`:

```sql
-- Card f1c4 (plano 023): login de cliente de verdade — Supabase Auth + RLS.
alter table public.clientes
  add column if not exists auth_user_id uuid references auth.users(id);

create unique index if not exists clientes_auth_user_id_idx
  on public.clientes (auth_user_id) where auth_user_id is not null;

drop policy if exists "cliente vê a própria linha" on public.clientes;
create policy "cliente vê a própria linha" on public.clientes
  for select to authenticated
  using (auth.uid() = auth_user_id);

drop policy if exists "cliente atualiza a própria linha" on public.clientes;
create policy "cliente atualiza a própria linha" on public.clientes
  for update to authenticated
  using (auth.uid() = auth_user_id)
  with check (auth.uid() = auth_user_id);

drop policy if exists "cliente vê as próprias conexões ml" on public.contas_ml_clientes;
create policy "cliente vê as próprias conexões ml" on public.contas_ml_clientes
  for select to authenticated
  using (
    exists (
      select 1 from public.clientes c
      where c.id = contas_ml_clientes.cliente_id
        and c.auth_user_id = auth.uid()
    )
  );
```

Sem policy de `insert`/`delete` pra `authenticated` em `clientes` de propósito — a linha só é
criada pelo servidor com `service_role` (via `criarRegistroCliente`, Step 3), depois que o
Supabase Auth já confirmou a criação do usuário. Isso evita que um cliente autenticado insira
linha arbitrária ou se atribua a `auth_user_id` de outro.

### Step 3: `src/lib/supabase/browser.ts` e `server.ts` + `src/lib/portal/cadastro.ts`

- `browser.ts`: `createBrowserClient` do `@supabase/ssr`, usa `NEXT_PUBLIC_SUPABASE_URL` +
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Usado só em Client Components (`/portal/cadastro`,
  `/portal/login`).
- `server.ts`: `createServerClient` do `@supabase/ssr`, lendo/gravando cookies via
  `next/headers` (`cookies()`), com a chave anônima (não service_role — as queries feitas com
  esse cliente respeitam RLS pela sessão do usuário, é esse o ponto). Uma função
  `clienteAutenticado()` que devolve o `user` da sessão ou `null`.
- `src/lib/portal/cadastro.ts` (adapter, livre pra importar `db()` — mesma categoria de
  `clientAccounts.ts`):
  - `export class ClienteJaCadastradoError extends Error {}`
  - `criarRegistroCliente({ authUserId, email, nome }): Promise<void>` — confere se já existe
    `clientes` com esse `auth_user_id` ou `email` (case-insensitive, já tem índice único em
    `lower(email)`); se sim, lança `ClienteJaCadastradoError`; senão insere
    `{ nome, email, status: 'ativo', auth_user_id: authUserId }`.

### Step 4: rotas `/portal/*`

- `src/app/portal/cadastro/page.tsx` (Client Component): formulário nome/email/senha. No submit:
  `supabase.auth.signUp({ email, password })` (cliente browser) → se deu sessão (confirmação de
  e-mail desligada por padrão em projeto novo, então normalmente já vem sessão) → `fetch('/api/
  portal/completar-cadastro', { method:'POST', body: JSON.stringify({ nome }) })` → redireciona
  pra `/portal/painel`. Erros do `signUp` (email já em uso, senha fraca) mostrados na tela.
- `src/app/api/portal/completar-cadastro/route.ts` (POST): lê o usuário autenticado via
  `server.ts` (cookies da própria requisição); 401 se não houver sessão; chama
  `criarRegistroCliente({ authUserId: user.id, email: user.email, nome })`; 409 +
  mensagem se `ClienteJaCadastradoError`.
- `src/app/portal/login/page.tsx` (Client Component): formulário email/senha →
  `supabase.auth.signInWithPassword(...)` → redireciona pra `/portal/painel`.
- `src/app/portal/painel/page.tsx` (Server Component): usa `server.ts` pra pegar `user`; sem
  sessão → `redirect('/portal/login')`. Com sessão, consulta `clientes` (RLS: só a própria linha)
  e `contas_ml_clientes` pelo `cliente_id` achado (RLS: só linhas daquele cliente) **usando o
  cliente Supabase da sessão, não `db()`** — é essa consulta que prova a policy funciona em
  produção, não só no papel.
- `src/app/api/portal/logout/route.ts` (POST): `supabase.auth.signOut()` no cliente `server.ts`,
  redireciona pra `/portal/login`.

### Step 5: `middleware.ts` — ramo `/portal/*`

Reescrever `ehRotaPublica`/fluxo principal pra: se `pathname` começa com `/portal`, pular
totalmente o gate de `PANEL_PASSWORD` (esse namespace não é do Livio) e, em vez disso, chamar
`@supabase/ssr`'s middleware helper (`createServerClient` + `supabase.auth.getUser()`) pra
renovar a sessão e decidir redirecionar pra `/portal/login` quando não autenticado — exceto em
`/portal/login` e `/portal/cadastro`, que ficam públicas dentro do namespace `/portal`. Fora de
`/portal/*`, comportamento idêntico ao de hoje (gate por `PANEL_PASSWORD`).

### Step 6: testes, verificação manual de RLS, docs, gate

- `tests/portal-cadastro.test.ts`: `criarRegistroCliente` — insere linha nova; rejeita
  `auth_user_id` duplicado; rejeita e-mail duplicado (usa `makeFakeSupabase`, mesmo padrão de
  `tests/client-accounts.test.ts`).
- Verificação manual da RLS contra o projeto real via `mcp__Supabase__execute_sql`: criar dois
  usuários `auth.users` de teste (ou reaproveitar via `auth.uid()` simulado com
  `set local role authenticated; set local "request.jwt.claims" = ...`), confirmar que a consulta
  de um `clientes`/`contas_ml_clientes` não devolve linha do outro, e que sem sessão (`role
  anon`) a consulta não devolve nada. Resultado documentado no "Status do 023".
- `AGENTS.md`: nova invariante (ou extensão da seção 1) documentando que `clientes`/
  `contas_ml_clientes` agora têm RLS ativa de verdade, e que a única via de `insert` em
  `clientes` é `criarRegistroCliente` (service_role) — nunca client-side.
- `README.md`: atualizar o parágrafo "Tabelas do portal" (hoje diz "falta só o login de cliente
  de verdade (f1c4)") pra refletir que existe.
- `plans/README.md`: linha `023` na tabela + seção "Status do 023".
- Gate completo: `npm run build && npm run lint && npm run verificar && npm test`.

## Test plan

1. `npm test` — `tests/portal-cadastro.test.ts` cobrindo `criarRegistroCliente` (insert simples,
   rejeição por `auth_user_id` duplicado, rejeição por e-mail duplicado).
2. `npm run build` — confirma que `@supabase/ssr` compila em Server/Client Components sem
   vazar `service_role` pro bundle do browser (só a chave anônima entra no client bundle).
3. `npm run lint` — `clientAccounts.ts`/`cadastro.ts` continuam livres pra importar Supabase
   (adapter); nenhum arquivo "motor" foi tocado.
4. Verificação manual via MCP do Supabase (`execute_sql`) contra o projeto real: confirma que a
   policy de `clientes`/`contas_ml_clientes` isola por `auth.uid()` — dois clientes de teste, cada
   um só vê a própria linha, e sessão anônima não vê nenhuma.
5. Não dá pra testar o fluxo de browser (`signUp`/`signInWithPassword` de verdade, cookies de
   sessão) sem abrir a tela num navegador de verdade — fica como STOP condition/pendência pro
   Livio testar manualmente (ver abaixo), igual o teste ponta-a-ponta do OAuth no plano 022.

## Done criteria

- [ ] `@supabase/ssr` instalado; `npm run build` passa.
- [ ] Migração aplicada de verdade no projeto Supabase (`clientes.auth_user_id` existe; as três
      policies existem) e também registrada em `supabase/schema.sql`.
- [ ] `src/lib/supabase/browser.ts`, `server.ts`, `src/lib/portal/cadastro.ts` criados.
- [ ] Rotas `/portal/cadastro`, `/portal/login`, `/portal/painel`,
      `/api/portal/completar-cadastro`, `/api/portal/logout` criadas.
- [ ] `middleware.ts` trata `/portal/*` separado do gate de `PANEL_PASSWORD`.
- [ ] `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` documentadas em `.env.example`
      com valor real preenchido (não é segredo).
- [ ] Testes novos passam; suíte inteira (`npm test`) sem regressão.
- [ ] RLS verificada na mão contra o projeto real (não só escrita) — resultado no "Status do
      023".
- [ ] `AGENTS.md`, `README.md`, `plans/README.md` atualizados.
- [ ] Gate completo (`build && lint && verificar && test`) verde.
- [ ] Kanban (`PROGRESSO_CONHECIDO`) atualizado com `f1c4: true`.

## STOP conditions

- Se a verificação manual de RLS mostrar um cliente enxergando linha de outro: **parar, não
  seguir pro resto do plano** — é o pior cenário possível aqui (vazamento de dado entre
  clientes). Reportar exatamente a policy e a query que vazaram.
- Se `apply_migration` falhar contra o projeto real (ex. conflito de nome de policy, permissão):
  parar e reportar o erro exato — não tentar contornar com `service_role` bypassando RLS "só pra
  funcionar".
- Teste ponta-a-ponta real (abrir `/portal/cadastro` num navegador, criar conta, logar) depende
  de rodar a aplicação — não acontece nesta sessão (sem servidor Next rodando/exposto). Fica
  como verificação manual pendente do Livio, igual o teste do fluxo OAuth do plano 022.
- Se o projeto Supabase tiver confirmação de e-mail LIGADA por padrão (não confirmado ainda —
  ver Step 4), `signUp` não devolve sessão imediata e `/api/portal/completar-cadastro` falharia
  com 401 logo após o cadastro. Se for o caso: documentar como limitação conhecida (usuário
  precisa confirmar e-mail antes de logar) em vez de tentar desligar a confirmação por conta
  própria — é configuração do projeto, decisão do Livio.

## Maintenance notes

- A RLS de `clientes`/`contas_ml_clientes` agora é reforçada pelo Postgres, não só pelo código —
  mesmo um bug em `criarRegistroCliente` ou nas rotas não vaza dado entre clientes, porque a
  consulta em `/portal/painel` roda com a sessão do próprio usuário, não com `service_role`.
- `/clientes` (admin, atrás do `PANEL_PASSWORD`) continua usando `db()`/service_role — não é
  afetado pela RLS nova (service_role sempre ignora RLS). As duas telas coexistem: `/clientes` é
  o Livio administrando; `/portal/*` é o cliente final.
- Se o modelo de negócio da Fase 3 precisar de convite (o Livio cria a conta, não o cliente),
  trocar `criarRegistroCliente` de "chamado depois de um `signUp` client-side" para "chamado a
  partir de `auth.admin.createUser` no servidor" é uma troca pontual — a policy de RLS e o resto
  do fluxo não mudam.
