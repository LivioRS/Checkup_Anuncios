# RUNBOOK — colocar o portal do cliente no ar

> Passo a passo pra resolver as pendências de `PENDENCIAS-portal-fase3.md`. Faça **na ordem** —
> cada passo depende do anterior. Onde diz "confira", é um jeito de saber se o passo funcionou
> antes de seguir.
>
> Última revisão: 2026-09-05.

---

## Passo 0 — Mergear os PRs abertos (GitHub)

Três branches abertas, nesta ordem obrigatória:

1. **`feat/036-cobranca-portal`** — merge primeiro (é a base).
2. **`feat/037-acabamentos-portal`** — merge depois do 036 (está empilhado nele; se mergear
   antes, o GitHub mostra os commits do 036 junto).
3. **`docs/pendencias-portal`** — independente, pode mergear a qualquer momento (é só doc,
   inclusive este arquivo).

**Confira:** depois dos merges, `main` tem a pasta `src/lib/mercadopago/` e o arquivo
`src/app/api/webhooks/mercadopago/route.ts`.

---

## Passo 1 — Rodar as migrações no Supabase (SQL Editor)

Abra o projeto no Supabase → **SQL Editor** → **New query** → cole o bloco abaixo inteiro →
**Run**. É idempotente (`if not exists` em tudo) — pode rodar de novo sem quebrar nada.

```sql
-- === Portal Fase 3 — migrações acumuladas (planos 034, 035, 036) ===

-- Plano 034: cliente_id nos logs de criação/escrita (aditivo, nullable).
alter table public.anuncio_criacoes
  add column if not exists cliente_id bigint references public.clientes(id);
alter table public.ficha_edits
  add column if not exists cliente_id bigint references public.clientes(id);

-- Plano 035: cliente_id no lote.
alter table public.lotes
  add column if not exists cliente_id bigint references public.clientes(id);

-- Plano 036: branding + cobrança.
alter table public.clientes add column if not exists nome_loja text;
alter table public.clientes add column if not exists logo_url text;

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
```

**Confira:** rode isto e veja se devolve as 6 linhas esperadas —

```sql
select column_name from information_schema.columns
 where table_schema='public' and table_name='anuncio_criacoes' and column_name='cliente_id'
union all
select column_name from information_schema.columns
 where table_schema='public' and table_name='ficha_edits' and column_name='cliente_id'
union all
select column_name from information_schema.columns
 where table_schema='public' and table_name='lotes' and column_name='cliente_id'
union all
select column_name from information_schema.columns
 where table_schema='public' and table_name='clientes' and column_name in ('nome_loja','logo_url')
union all
select 'assinaturas' from information_schema.tables
 where table_schema='public' and table_name='assinaturas';
```

Deve listar: `cliente_id`, `cliente_id`, `cliente_id`, `nome_loja`, `logo_url`, `assinaturas`.

> **Nota:** algumas dessas colunas podem já existir de sessões passadas. O `if not exists` cuida
> disso — não precisa investigar antes, só rodar.

---

## Passo 2 — Registrar o app do Mercado Livre do portal

Só se ainda **não** existir um app do ML **separado** do dos robôs. (O do portal precisa do
próprio `redirect_uri` — cada app do ML aceita só 1.)

1. Entre em https://developers.mercadolivre.com.br/ → **Suas aplicações** → **Criar aplicação**.
2. Nome/descrição à vontade. Em **Redirect URI**, coloque a URL de produção do callback:
   `https://SEU-DOMINIO/api/oauth/ml/callback`
   (se for testar local antes, veja o Passo 6.1 sobre o túnel HTTPS).
3. Em **Scopes**, marque `read`, `write`, `offline_access`.
4. Anote o **App ID** (= `ML_CLIENT_ID_PORTAL`) e o **Secret Key** (= `ML_CLIENT_SECRET_PORTAL`).

**Confira:** você tem 3 valores pra usar no Passo 4 — `ML_CLIENT_ID_PORTAL`,
`ML_CLIENT_SECRET_PORTAL` e a URL do `ML_REDIRECT_URI_PORTAL` (a mesma do item 2 acima).

---

## Passo 3 — Criar a aplicação Mercado Pago + o webhook

1. Entre em https://www.mercadopago.com.br/developers/panel → **Suas integrações** → **Criar
   aplicação**.
   - Produto: **Assinaturas** (ou "Pagamentos on-line" — o importante é ter o token e o webhook).
2. Na aba **Credenciais de produção**, copie o **Access Token** (= `MERCADOPAGO_ACCESS_TOKEN`).
3. Na aba **Webhooks / Notificações**:
   - **URL**: `https://SEU-DOMINIO/api/webhooks/mercadopago`
   - **Eventos**: marque **`subscription_preapproval`** (é o único que o código processa).
     Pode marcar `subscription_authorized_payment` também — o código responde 200 e ignora, sem
     erro.
   - Salve. O MP mostra uma **Assinatura secreta** (secret) — copie (= `MERCADOPAGO_WEBHOOK_SECRET`).
4. **Preço do plano:** decida o valor mensal e guarde em **centavos** (ex.: R$ 149,90 →
   `14990`). Isso vira `MERCADOPAGO_PLANO_VALOR_CENTAVOS`. Sem definir, o código usa `9700`
   (R$ 97,00) como placeholder.

**Confira:** você tem `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` e um número pra
`MERCADOPAGO_PLANO_VALOR_CENTAVOS`.

> O webhook só recebe chamada de verdade **depois do deploy** (Passo 5) — o MP precisa alcançar
> a URL pública. Dá pra salvar a config agora mesmo assim.

---

## Passo 4 — Preencher as variáveis de ambiente

### 4.1 Local (`.env.local` na raiz do repo)

Adicione (ou confira) estas linhas — os nomes estão todos documentados no `.env.example`:

```bash
# Mercado Livre — app do PORTAL (separado do dos robôs)
ML_CLIENT_ID_PORTAL=...            # App ID do Passo 2
ML_CLIENT_SECRET_PORTAL=...        # Secret do Passo 2
ML_REDIRECT_URI_PORTAL=https://SEU-DOMINIO/api/oauth/ml/callback

# Mercado Pago — cobrança do portal
MERCADOPAGO_ACCESS_TOKEN=...       # Passo 3.2
MERCADOPAGO_WEBHOOK_SECRET=...     # Passo 3.3
MERCADOPAGO_PLANO_VALOR_CENTAVOS=14990   # o valor que você decidiu (em centavos)
```

Confira também que já estão preenchidas, de fases anteriores:
`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `PANEL_PASSWORD`, `PANEL_HMAC_SECRET`, `ML_CLIENT_ID`,
`ML_CLIENT_SECRET`.

### 4.2 Vercel (produção)

Projeto na Vercel → **Settings → Environment Variables** → adicione as **mesmas** 6 variáveis
novas do 4.1, no ambiente **Production** (e Preview, se usar). **Não** cole segredo no
código/commit.

**Confira:** `vercel env ls` (ou a tela) lista as 6 variáveis novas.

---

## Passo 5 — Deploy

Merge do 036/037 na `main` (Passo 0) + push → a Vercel faz o build. Ou `vercel --prod` na mão.

**Confira:** abra `https://SEU-DOMINIO/portal/login` — deve carregar a tela de login do portal
(não a de senha do painel admin). E `https://SEU-DOMINIO/api/webhooks/mercadopago` num navegador
deve responder algo tipo `{"erro":"..."}` com status 4xx (não um 404) — significa que a rota
existe e está fora do gate de senha.

---

## Passo 6 — Criar um cliente de teste

### 6.1 (Opcional) Testar local antes do deploy

Como o `redirect_uri` do ML tem que ser HTTPS público, pra testar na sua máquina você precisa de
um túnel:

```bash
# um terminal:
npm run dev
# outro terminal (instale antes: https://ngrok.com ou cloudflared):
ngrok http 3000
```

Pegue a URL `https://XXXX.ngrok-free.app`, e **temporariamente**:
- troque o `ML_REDIRECT_URI_PORTAL` no `.env.local` pra `https://XXXX.ngrok-free.app/api/oauth/ml/callback`
- troque o **Redirect URI** no painel do ML (Passo 2) pro mesmo valor
- troque a **URL do webhook** no MP (Passo 3) pra `https://XXXX.ngrok-free.app/api/webhooks/mercadopago`

Ao terminar o teste, volte tudo pra URL de produção.

### 6.2 Criar a conta

1. `https://SEU-DOMINIO/portal/cadastro` → preencha nome, e-mail, senha.
2. **Se o Supabase Auth estiver com "Confirm email" ligado** (Dashboard → Authentication →
   Providers → Email), o cadastro para em "confirme seu e-mail" e você tem que clicar no link do
   e-mail antes de logar. **Decisão pendente:** se quiser cadastro sem essa fricção, desligue o
   "Confirm email" no Supabase (aceitável pra começar; religa depois se virar problema de spam).
3. Logue em `https://SEU-DOMINIO/portal/login`.

**Confira:** no Supabase, `select id, email, status, criado_em from public.clientes order by id
desc limit 1;` mostra o cliente novo, `status = 'ativo'`.

---

## Passo 7 — Testar ponta a ponta (marque cada item)

Faça logado como o cliente de teste do Passo 6.

- [ ] **7.1 Conectar conta ML** — `/portal/painel` → "Conectar conta do Mercado Livre" →
  autoriza no ML → volta pro painel com aviso verde. Confira:
  `select seller_id, apelido from public.contas_ml_clientes where cliente_id = <id do teste>;`
  tem 1 linha.
- [ ] **7.2 Branding** — no painel, em "Nome e logo da loja", preencha e salve. Recarregue:
  a barra do topo do portal mostra o nome/logo.
- [ ] **7.3 Criar anúncio (dentro do trial)** — `/portal/criar` → modo "Do catálogo" ou "Fora do
  catálogo" → cria. O anúncio nasce **pausado** na conta ML do cliente (confira no Mercado Livre).
- [ ] **7.4 Lote (dentro do trial)** — `/portal/lote` → cola 2-3 códigos → "Diagnóstico" → cria →
  a tela seguinte enche a barra sozinha até "concluído".
- [ ] **7.5 Paywall** — force o fim do trial:
  `update public.clientes set criado_em = now() - interval '10 days' where id = <id do teste>;`
  Recarregue `/portal/criar` e `/portal/lote` → devem mostrar "período de teste encerrado" em vez
  do formulário. Um `POST` direto em `/api/portal/anuncios/avulso` deve dar **402**.
- [ ] **7.6 Assinar** — no painel, "Assinar agora" → cai no checkout do Mercado Pago → pague com
  [cartão de teste do MP](https://www.mercadopago.com.br/developers/pt/docs/checkout-api/additional-content/test-cards)
  → volta pro painel. Em segundos o webhook chega e o painel passa a mostrar "assinatura ativa".
  Confira: `select status from public.assinaturas where cliente_id = <id do teste> order by id
  desc limit 1;` → `authorized`. E `/portal/criar` volta a mostrar o formulário.
- [ ] **7.7 Cancelar** — no painel, "Cancelar assinatura" → confirma → painel volta pra "assine
  para continuar". `assinaturas.status` vira `cancelled`.
- [ ] **7.8 Gate de status** — `update public.clientes set status = 'suspenso' where id = <id do
  teste>;` → recarregue `/portal/painel`: o cliente some das rotas do portal (as consultas
  RLS-scoped não devolvem a linha dele). Volte pra `'ativo'` no fim.

> Ao terminar, apague os dados de teste: `delete from public.clientes where id = <id do teste>;`
> (o `on delete cascade` limpa `contas_ml_clientes`/`assinaturas`; `anuncio_criacoes`/`lotes`
> ficam com `cliente_id` órfão apontando pra nada — inofensivo, ou limpe à mão).

---

## Passo 8 — Decisões que ainda faltam (não bloqueiam o go-live)

| Decisão | Onde muda | Default hoje |
|---|---|---|
| Valor final da assinatura | `MERCADOPAGO_PLANO_VALOR_CENTAVOS` (env) | R$ 97,00 |
| Confirmar e-mail no cadastro | Supabase → Auth → Providers → Email | depende de como está o projeto |
| Header de branding em toda página vs. só no painel | já feito no plano 037 (toda página) | — |
| Cadastro só-convite | decidido: **fica self-service** | — |

E os itens de longo prazo seguem em `PENDENCIAS-portal-fase3.md` seção 4 (rastreio de fatura,
RLS por cliente, tela "meus lotes", etc.) — nenhum bloqueia começar a usar.
