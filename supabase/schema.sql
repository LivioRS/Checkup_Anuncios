-- Painel de Ficha Técnica — Mercado Livre
-- Rode no SQL Editor do projeto dashboard-mercadolivre.
--
-- O painel NÃO cria tabela de tokens: ele usa a `contas` que já existe
-- (seller_id, access_token, refresh_token, access_expira_em), a mesma dos robôs.
-- O refresh_token do ML é de uso único, então precisa haver um único lugar guardando.
--
-- A busca por texto usa a `repricer_status_ml` (seller_id, item_id, titulo, sku),
-- que também já existe. Nada disso é criado aqui.
--
-- A única tabela nova é o log do que o painel gravou no ML.

create table if not exists public.ficha_edits (
  id           bigserial primary key,
  seller_id    text,
  item_id      text not null,
  category_id  text,
  payload      jsonb not null,   -- o que foi enviado no PUT
  before       jsonb,            -- valores anteriores dos atributos tocados
  status       int,              -- HTTP de resposta do ML
  response     jsonb,            -- corpo da resposta (erro ou item)
  created_at   timestamptz not null default now()
);

create index if not exists ficha_edits_item_idx on public.ficha_edits (item_id, created_at desc);

-- Acessada só pelo servidor com a service_role key.
-- RLS ligado + nenhuma policy = ninguém acessa com a anon key.
alter table public.ficha_edits enable row level security;

-- Blocos fixos da loja: preenchidos uma vez e anexados a toda descrição gerada.
create table if not exists public.loja_blocos (
  seller_id   text primary key,
  sobre       text,
  garantia    text,
  atualizado_em timestamptz not null default now()
);

alter table public.loja_blocos enable row level security;

-- Tags que o ML devolveu e o dicionário ainda não explica.
-- O painel registra sozinho toda vez que encontra uma; a coluna `significado`
-- fica vazia até alguém estudar o que ela faz. `vezes` e `visto_em` dizem se
-- vale a pena investigar: tag que aparece muito rende mais que tag de uma vez.
create table if not exists public.tags_novas (
  nome          text not null,
  tipo          text not null check (tipo in ('anuncio', 'vendedor')),
  vezes         int  not null default 1,
  exemplo_item  text,
  significado   text,
  primeiro_em   timestamptz not null default now(),
  visto_em      timestamptz not null default now(),
  primary key (nome, tipo)
);

alter table public.tags_novas enable row level security;

-- Log de tentativas de criação de anúncio via catálogo (plano 019).
-- Diferente de `ficha_edits`, que exige `item_id` de anúncio já existente: aqui
-- a tentativa pode falhar antes de o ML devolver um item_id, então o log é
-- centrado no payload enviado, não num anúncio que talvez nem exista.
create table if not exists public.anuncio_criacoes (
  id                  bigserial primary key,
  seller_id           text not null,
  marca               text,
  modelo              text,
  codigo              text,
  catalog_product_id  text,
  payload             jsonb not null,
  status              int,
  item_id             text,
  response            jsonb,
  created_at          timestamptz not null default now()
);

alter table public.anuncio_criacoes enable row level security;

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
-- RLS com policy de verdade desde o plano 023 (card f1c4) — ver bloco no fim do arquivo.

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

-- Fila de operações em lote — Fase 2 do quadro "Do Anúncio ao Portal", card f2c1 (plano 024).
-- Criadas no projeto real via MCP do Supabase naquele plano; versionadas aqui a partir do 025.
-- RLS ligada, zero policy: só service_role/admin acessa (igual `ficha_edits`/`anuncio_criacoes`).
-- O worker (/api/lote/[id]/processar) NÃO é cron (Vercel Hobby = 1x/dia); quem inicia o lote
-- repete a chamada até `status = 'concluido'`. Nenhum tipo de lote grava no ML — só lê/gera.
create table if not exists public.lotes (
  id            uuid primary key default gen_random_uuid(),
  seller_id     text not null,
  total_itens   int  not null,
  status        text not null default 'em_andamento' check (status in ('em_andamento','concluido')),
  -- Plano 025 (f2c2): tipo de operação. O worker despacha por este valor.
  -- 'diagnostico' (default) mantém compatibilidade com os lotes do plano 024.
  tipo          text not null default 'diagnostico' check (tipo in ('diagnostico','titulo','descricao')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.lote_itens (
  id            bigserial primary key,
  lote_id       uuid not null references public.lotes(id) on delete cascade,
  item_id       text not null,
  status        text not null default 'pendente' check (status in ('pendente','processando','concluido','erro')),
  tentativas    int  not null default 0,
  resultado     jsonb,
  erro          text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.lotes enable row level security;
alter table public.lote_itens enable row level security;

-- Migração incremental do 025 sobre um banco que já tem `lotes` do 024 (sem a coluna `tipo`):
--   alter table public.lotes add column if not exists tipo text not null default 'diagnostico';
--   alter table public.lotes drop constraint if exists lotes_tipo_check;
--   alter table public.lotes add constraint lotes_tipo_check check (tipo in ('diagnostico','titulo','descricao'));

-- Card f1c4 (plano 023): login de cliente de verdade — Supabase Auth + RLS. Aplicado no projeto
-- real via MCP do Supabase nesta sessão (não só escrito aqui) e verificado na mão com dois
-- usuários de teste: um não enxergava a linha do outro nem a conexão ML alheia, e a sessão
-- anônima não enxergava nada (detalhe em plans/023-login-cliente-rls.md e "Status do 023" em
-- plans/README.md).
alter table public.clientes
  add column if not exists auth_user_id uuid references auth.users(id);

create unique index if not exists clientes_auth_user_id_idx
  on public.clientes (auth_user_id) where auth_user_id is not null;

-- Sem policy de insert/delete pra `authenticated` em `clientes` de propósito: só service_role
-- (via `criarRegistroCliente` em src/lib/portal/cadastro.ts) grava linha nova — evita que um
-- cliente autenticado insira linha arbitrária ou se atribua o auth_user_id de outra pessoa.
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

-- Plano 034: "criar anúncio" no portal do cliente. Os logs de criação/escrita ganham
-- `cliente_id` (aditivo, nullable — o fluxo admin dos robôs continua gravando `cliente_id` null;
-- só o portal preenche). RLS dessas tabelas segue service_role-only (zero policy), como no admin:
-- o portal lê/grava por rota, nunca direto. Aplicar no banco real via SQL Editor do Supabase
-- (a ferramenta de migração do MCP fica bloqueada nesta sessão).
alter table public.anuncio_criacoes
  add column if not exists cliente_id bigint references public.clientes(id);
alter table public.ficha_edits
  add column if not exists cliente_id bigint references public.clientes(id);

-- Plano 035: lote no portal do cliente (f3c3). Mesma decisão do 034 — service_role-only, zero
-- policy nova: `lotes`/`lote_itens` continuam sem RLS, ownership garantida no handler
-- (`src/lib/lotes/autorizacao.ts`), não no banco, porque o portal só lê/grava por rota.
alter table public.lotes
  add column if not exists cliente_id bigint references public.clientes(id);

-- Plano 036: gate de status (f3c4) + branding simples (f3c5) + cobrança via Mercado Pago (f3c6).
alter table public.clientes add column if not exists nome_loja text;
alter table public.clientes add column if not exists logo_url text;

-- Sem RLS nova (mesmo padrão de 034/035): service_role-only, ownership garantida na rota.
create table if not exists public.assinaturas (
  id                 bigserial primary key,
  cliente_id         bigint not null references public.clientes(id) on delete cascade,
  mp_preapproval_id  text unique,
  status             text not null default 'pendente'
                       check (status in ('pendente','authorized','paused','cancelled')),
  valor_centavos     bigint,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now()
);
create index if not exists assinaturas_cliente_idx on public.assinaturas (cliente_id);
alter table public.assinaturas enable row level security;
