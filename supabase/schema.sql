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
