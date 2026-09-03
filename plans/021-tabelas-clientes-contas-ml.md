# Plan 021: Tabelas novas — `clientes` e `contas_ml_clientes` (tokens isolados dos robôs)

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se um "STOP condition" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo tem `.git` (`github.com/LivioRS/Checkup_Anuncios`). Compare os trechos
> abaixo com `file:line` contra o arquivo vivo antes de editar.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW — migração aditiva pura (2 tabelas novas), não toca `contas` nem em nenhuma
  tabela/rota/tela existente. Zero arquivo `.ts`/`.tsx` editado.
- **Depends on**: nenhum plano anterior bloqueia (020 é o mesmo espírito de preparo, não uma
  dependência técnica).
- **Category**: feature/schema (kanban "Do Anúncio ao Portal", Fase 1, card 2 — f1c2)
- **Planned at**: 2026-09-02.

## Why this matters

f1c2 do quadro: **"Novas tabelas, tokens isolados — `clientes` e `contas_ml_clientes` ficam fora
da `contas` compartilhada com os robôs — o refresh_token do ML é de uso único, não dá pra
arriscar colisão."**

Decisões tomadas com o usuário nesta sessão:
- **Mesmo projeto Supabase** (não cria projeto novo agora) — as tabelas novas entram ao lado de
  `contas`, isoladas por serem tabelas próprias (mesmo padrão de `ficha_edits`/`anuncio_criacoes`
  hoje: RLS ligado, só `service_role` acessa).
- **RLS ligado, sem policy ainda** — a policy de verdade (`auth.uid()` ↔ `clientes`) é trabalho do
  f1c4 (login por cliente), que é quando existe Supabase Auth de verdade para testar de ponta a
  ponta. Escrever a policy antes disso seria regra não testável.

Este plano **não** escreve nenhum código TypeScript (`src/lib/...`) para ler/gravar essas
tabelas: hoje elas não têm nenhum consumidor (nem UI, nem rota). O card f1c3 (OAuth de verdade) é
quem vai gravar tokens ali pela primeira vez — os helpers de acesso nascem junto com ele, testados
contra o uso real, em vez de código morto sem chamador escrito por antecipação aqui.

## Current state

**Confirmado via `mcp__Supabase__list_tables` nesta sessão** (não confiar só no `schema.sql` do
repo — ver discrepância abaixo):

- Projeto Supabase ativo: `vcxweutjmmycajnulkak` ("Chckup_Anuncios", criado 2026-08-31,
  `us-west-2`). Contém hoje: `contas` (2 linhas), `ficha_edits` (0), `loja_blocos` (0),
  `anuncio_criacoes` (0).
- `public.contas` (a que este plano **isola**, não altera): `id bigint pk`, `seller_id text
  unique`, `apelido text`, `observacao text`, `refresh_token text`, `access_token text`,
  `access_expira_em timestamptz`, `atualizado_em timestamptz default now()`, `org text`,
  `created_at timestamptz default now()`. Bate exatamente com o tipo `MlAccount` de
  `src/lib/ml/client.ts:16-24`.
- `src/lib/ml/client.ts:38-148` — `comConta`, `contaDoAnuncio`, `listarContas`, `getAccount`,
  `saveTokens`, `refrescarUmaVez` — todo o multi-tenant *atual*, funciona só sobre `contas`. Não
  editado por este plano; é o que o f1c3 vai espelhar para as contas de cliente.
- `AGENTS.md §1` — invariante do refresh_token de uso único: precisa passar a valer também para
  `contas_ml_clientes` (adicionada neste plano).

**Duas discrepâncias encontradas, fora do escopo deste plano (só registro, não conserto aqui):**

- `.env.example:14` mostra `SUPABASE_URL=https://szrrrnelgozeizmbtivm.supabase.co`, mas o projeto
  Supabase vivo (confirmado por dado real em `contas` batendo com o código) é
  `vcxweutjmmycajnulkak` — refs diferentes. `.env.example` parece desatualizado desde a criação do
  projeto `Chckup_Anuncios` (2026-08-31). Não mexo nisso aqui; sinalizado para o Livio conferir
  qual `.env.local` real está em uso.
- `supabase/schema.sql` define `tags_novas`, mas essa tabela **não aparece** em
  `list_tables` do projeto vivo — `src/lib/ml/tags-novas.ts:35-64` grava/lê nela dentro de um
  `try/catch` que engole erro silenciosamente, então hoje o dicionário de tags desconhecidas
  provavelmente não está gravando nada em produção. Não é deste plano; registrado para virar
  achado de um plano futuro se o Livio confirmar que é bug real.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Migração | `mcp__Supabase__apply_migration` (project `vcxweutjmmycajnulkak`) | migração aplicada |
| Verificação de schema | `mcp__Supabase__list_tables` (verbose) | `clientes` e `contas_ml_clientes` aparecem com as colunas certas |
| Prova de FK/cascade | `mcp__Supabase__execute_sql` (insert de teste + delete) | cascade funciona; nada sobra |
| Gate (sem mudança de código, deve ser no-op) | `npm run build`/`lint`/`verificar`/`test` | exit 0 |

## Scope

**In scope**:
- Migração SQL: tabelas `clientes` e `contas_ml_clientes` (definição abaixo), aplicada em
  `supabase/schema.sql` (arquivo do repo) **e** via `apply_migration` no projeto vivo.
- Invariante nova no `AGENTS.md §1` (refresh_token de uso único vale para `contas_ml_clientes`
  também) + nota de que `seller_id` nunca pode existir em `contas` **e**
  `contas_ml_clientes` ao mesmo tempo.
- Nota curta na seção "Motor de análise vs. camada de conta" do `README.md` dizendo que as
  tabelas existem mas ainda não têm código lendo/gravando (isso é f1c3/f1c4).
- Prova de integridade: inserir uma linha de teste em `clientes` + `contas_ml_clientes`, confirmar
  `on delete cascade`, apagar tudo antes de terminar.

**Out of scope** (explicitamente):
- Qualquer módulo `src/lib/...` novo para ler/gravar essas tabelas — sem chamador ainda.
- Fluxo OAuth, registro de app no DevCenter, redirect URI (f1c3).
- Supabase Auth, login por cliente, policy de RLS de verdade (f1c4) — RLS fica ligado sem policy,
  mesmo padrão de `ficha_edits`/`anuncio_criacoes`.
- Corrigir a discrepância do `.env.example` ou investigar `tags_novas` ausente (ver "Current
  state" — só registro).
- Qualquer tela no painel atual — ele não usa essas tabelas.

## Git workflow

Branch feature (`feat/021-tabelas-clientes` ou similar) + commit normal + PR, como o 019/020.

## Steps

### Step 1: migração SQL

Adicionar ao final de `supabase/schema.sql`:

```sql
-- Clientes do portal novo (multi-cliente) — Fase 1 do quadro "Do Anúncio ao Portal", card f1c2.
-- Isolado de `contas`: aqui entram vendedores terceiros que contratam o portal, nunca as contas
-- próprias (Ponto Musical, Irmãos Brothers etc.) que os robôs operam.
create table if not exists public.clientes (
  id            bigserial primary key,
  nome          text not null,
  email         text not null,
  status        text not null default 'ativo' check (status in ('ativo','suspenso','cancelado')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create unique index if not exists clientes_email_idx on public.clientes (lower(email));

alter table public.clientes enable row level security;
-- RLS ligado, sem policy: só service_role acessa, igual ficha_edits/anuncio_criacoes hoje.
-- A policy de verdade (auth.uid() = clientes.auth_user_id) é trabalho do card f1c4 (login por
-- cliente), quando existir Supabase Auth de verdade pra testar.

-- Contas do Mercado Livre que cada cliente do portal conectou.
-- MESMA invariante da `contas` (AGENTS.md §1): o refresh_token do ML é de uso único — cada
-- renovação grava o par novo NESTA MESMA linha, nunca em outro lugar. `seller_id` é único aqui
-- E nunca pode coincidir com um `seller_id` já presente em `contas` (são universos de contas
-- diferentes: robôs vs. clientes do portal).
create table if not exists public.contas_ml_clientes (
  id                bigserial primary key,
  cliente_id        bigint not null references public.clientes(id) on delete cascade,
  seller_id         text not null,
  apelido           text,
  access_token      text,
  refresh_token     text,
  access_expira_em  timestamptz,
  conectado_em      timestamptz not null default now(),
  atualizado_em     timestamptz not null default now()
);

create unique index if not exists contas_ml_clientes_seller_idx on public.contas_ml_clientes (seller_id);
create index if not exists contas_ml_clientes_cliente_idx on public.contas_ml_clientes (cliente_id);

alter table public.contas_ml_clientes enable row level security;
```

Aplicar via `mcp__Supabase__apply_migration` no projeto `vcxweutjmmycajnulkak`.

**Verify**: `mcp__Supabase__list_tables` (verbose) mostra `clientes` e `contas_ml_clientes` com as
colunas acima, RLS `true` nas duas, e os índices únicos.

### Step 2: prova de integridade (FK/cascade)

Via `mcp__Supabase__execute_sql`:
1. Insere 1 linha de teste em `clientes` (nome/email óbvios, ex. `'__teste_021__'`).
2. Insere 1 linha em `contas_ml_clientes` apontando pro `cliente_id` acima, `seller_id` de
   teste que não colida com nada real.
3. Confirma os dois `select`.
4. `delete from clientes where nome = '__teste_021__'` e confirma (via `select`) que a linha de
   `contas_ml_clientes` correspondente sumiu junto (cascade).
5. Confirma que não sobrou nenhuma linha de teste em nenhuma das duas tabelas.

**Verify**: cascade confirmado; zero linha de teste sobrando ao final.

### Step 3: `AGENTS.md` — estender §1

Adicionar ao final da §1 (refresh token de uso único) a extensão da invariante para
`contas_ml_clientes`, e a regra de não colisão de `seller_id` entre as duas tabelas.

### Step 4: `README.md`

Nota curta na seção "Motor de análise vs. camada de conta (prep multi-cliente)" (criada no plano
020): as tabelas `clientes`/`contas_ml_clientes` existem desde o plano 021, mas ainda sem código
lendo/gravando — isso é f1c3 (OAuth) e f1c4 (login).

### Step 5: `plans/README.md`

Linha 021 na tabela de execução, status DONE ao terminar, com a nota das duas discrepâncias
encontradas (para não se perderem).

### Step 6: gate

**Verify**: `npm run build`, `npm run lint`, `npm run verificar`, `npm test` — todos exit 0
(esperado: no-op, já que nenhum `.ts`/`.tsx` foi tocado — só prova que nada quebrou por acidente).

## Test plan

- `list_tables` confirma schema exato das duas tabelas novas (colunas, tipos, PK, unique, RLS).
- Teste de integridade do Step 2 prova `on delete cascade` de verdade, não só na definição.
- Gate do AGENTS.md roda limpo (no-op esperado).

## Done criteria

- [ ] `clientes` e `contas_ml_clientes` existem no projeto `vcxweutjmmycajnulkak`, confirmadas via
      `list_tables`.
- [ ] `supabase/schema.sql` do repo tem a migração (fonte de verdade versionada).
- [ ] Teste de integridade (Step 2) rodado e limpo (zero linha de teste sobrando).
- [ ] `AGENTS.md §1` estendido.
- [ ] `README.md` tem a nota das tabelas novas.
- [ ] `plans/README.md` linha 021 = DONE, com as duas discrepâncias registradas.
- [ ] `npm run build`, `npm run lint`, `npm run verificar`, `npm test` passam (no-op).

## STOP conditions

Pare e reporte se:

- `seller_id` de teste (ou, mais grave, algum dado real futuro) colidir entre `contas` e
  `contas_ml_clientes` — trava a invariante nova do AGENTS.md, não force a migração adiante.
- O projeto Supabase vivo não for `vcxweutjmmycajnulkak` (confirme de novo com
  `list_projects`/`list_tables` antes de aplicar, não confie só neste texto se o tempo tiver
  passado) — se o Livio confirmar que o app aponta para outro projeto (a discrepância do
  `.env.example` sugerida acima), pare e pergunte antes de aplicar a migração no lugar errado.
- `apply_migration` falhar por qualquer motivo — reporte o erro exato, não tente contornar.

## Maintenance notes

- O card f1c3 (OAuth de verdade) é quem cria os primeiros helpers TypeScript sobre
  `contas_ml_clientes` (espelhando `client.ts`) — espera-se que nasçam já sabendo que `seller_id`
  não pode colidir com `contas`.
- O card f1c4 (login por cliente) é quem adiciona `auth_user_id` a `clientes` (ou tabela de
  vínculo) e a policy de RLS de verdade — este plano deixou o terreno pronto (RLS ligado) mas não
  a policy.
- Revisitar a discrepância do `.env.example` e a ausência de `tags_novas` no projeto vivo — nenhum
  dos dois é urgente, mas os dois merecem um plano próprio se confirmados como problema real.
