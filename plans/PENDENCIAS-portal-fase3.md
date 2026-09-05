# Pendências — Portal (Fase 3 "Do Anúncio ao Portal")

> Consolidado em **2026-09-05**. Junta tudo que ficou em aberto nos planos 022–036 (seções
> "Não testado", "Fora de escopo", "Pendente com você") + os cards do roteiro
> `plans/027-fase-3-roteiro.md` que não viraram plano. Serve pra alimentar um kanban depois.
>
> Legenda de responsável: **[Livio]** só ele pode fazer · **[Dev]** trabalho de código ·
> **[Decisão]** precisa de escolha de produto antes de virar tarefa.

---

## 1. Bloqueadores de teste real — configuração/credenciais [Livio]

Sem isto, o portal **compila e passa nos testes (com mock), mas não funciona de verdade** em
nenhum navegador.

| # | Item | Desde | Detalhe |
|---|------|-------|---------|
| 1.1 | **App do Mercado Livre do portal** | Plano 022 | Registrar app no DevCenter do ML, definir `redirect_uri`, preencher `ML_CLIENT_ID_PORTAL` / `ML_CLIENT_SECRET_PORTAL` / `ML_REDIRECT_URI_PORTAL` no `.env.local` e na Vercel. App **separado** do dos robôs (cada app do ML aceita só 1 `redirect_uri`). |
| 1.2 | **Aplicação Mercado Pago** | Plano 036 | Criar em https://www.mercadopago.com.br/developers/panel. `MERCADOPAGO_ACCESS_TOKEN` (produção). Configurar webhook: tópico `subscription_preapproval`, URL `https://SEU-DOMINIO/api/webhooks/mercadopago` → `MERCADOPAGO_WEBHOOK_SECRET`. |
| 1.3 | **Preço do plano** | Plano 036 · **[Decisão]** | Definir `MERCADOPAGO_PLANO_VALOR_CENTAVOS` (hoje placeholder `9700` = R$ 97,00). |
| 1.4 | **Confirmar projeto Supabase + `.env.local` de produção** | Plano 021/023 | `.env.example` já foi corrigido pra `vcxweutjmmycajnulkak`, mas confirmar qual `.env.local`/variáveis da Vercel estão de fato em uso. |
| 1.5 | **Confirmação de e-mail no Supabase Auth** | Plano 023 · **[Decisão]** | Se estiver ligada, `/portal/cadastro` para em "confirme seu e-mail" em vez de logar direto. Decidir ligar/desligar e ajustar a UX do cadastro conforme. |
| 1.6 | **Túnel HTTPS pra teste local do OAuth** | Plano 022 | O `redirect_uri` do ML precisa ser HTTPS; pra testar local, um túnel (ngrok/cloudflared) apontando pro `localhost`. |

---

## 2. Migrações SQL entregues, aguardando rodar no SQL Editor [Livio]

Todas **aditivas e nullable** — o fluxo admin não muda. Conferir com `list_tables` o que já foi
aplicado (algumas foram rodadas em sessões passadas).

| Plano | SQL |
|-------|-----|
| 034 | `alter table public.anuncio_criacoes add column if not exists cliente_id bigint references public.clientes(id);`<br>`alter table public.ficha_edits add column if not exists cliente_id bigint references public.clientes(id);` |
| 035 | `alter table public.lotes add column if not exists cliente_id bigint references public.clientes(id);` |
| 036 | `alter table public.clientes add column if not exists nome_loja text;`<br>`alter table public.clientes add column if not exists logo_url text;`<br>+ `create table public.assinaturas (...)` (ver bloco completo no "Status do 036" em `plans/README.md`). |

---

## 3. Testes manuais de ponta a ponta nunca feitos (dependem da seção 1) [Livio + Dev]

- [ ] **OAuth do portal**: `/portal/painel` → "Conectar conta do Mercado Livre" → autorizar no ML → ver o token gravar em `contas_ml_clientes` (pendente desde 022/027).
- [ ] **Cadastro/login no navegador**: `signUp` / `signInWithPassword`, cookies de sessão via `@supabase/ssr` (pendente desde 023 — nunca rodou num browser real).
- [ ] **Gate do middleware** (`f3c0`): `/api/portal/*` sem sessão responde 401 JSON, com sessão passa. Sem teste unitário (depende de `next/headers`/`NextRequest`, que o repo não mocka).
- [ ] **`/api/portal/ml/conectar`**: resolve o `cliente_id` da sessão, sem `?cliente_id=` na query. Idem sem teste unitário.
- [ ] **Criar anúncio pelo portal** (034): do catálogo e fora do catálogo, com uma conexão real, vendo o anúncio nascer **pausado** na conta do cliente.
- [ ] **Lote pelo portal** (035): criar lote pequeno (2-3 anúncios reais), ver o "tique-taque" preencher a barra, `comContaCliente` usando o token do cliente.
- [ ] **Assinatura Mercado Pago** (036): "Assinar agora" → checkout hospedado → pagar (cartão de teste do MP) → webhook chega e vira `authorized` → paywall libera.
- [ ] **Trial de 7 dias** (036): confirmar a virada "liberado" → "bloqueado" no 8º dia (dá pra forçar mexendo em `clientes.criado_em` de um cliente de teste).
- [ ] **Gate de `status`** (f3c4): pôr um cliente de teste em `suspenso` e confirmar que ele some das rotas do portal por inteiro.

---

## 4. Cards da Fase 3 abertos / conscientemente fora de escopo

### 4.1 Branding — completar [Dev]
- [ ] **Header compartilhado de `/portal/*`** com nome/logo da loja em TODA página (hoje f3c5 v1 só mostra no painel). Precisa de um `src/app/portal/layout.tsx` que leia `clientes.nome_loja`/`logo_url` da sessão e renderize a marca acima de `{children}`, com fallback pra páginas sem sessão (`/portal/login`, `/portal/cadastro`).
- [x] ~~Subdomínio por cliente (`cliente.checkup.app`)~~ — **[Decisão] descartado** (infra de DNS wildcard + certificado, fora do que dá pra fazer só em código).

### 4.2 Cobrança — completar [Dev]
- [ ] **Cancelar assinatura pelo portal**: hoje só o webhook atualiza o status (o cliente cancela pelo cartão / painel do MP). Falta botão "Cancelar assinatura" em `/portal/painel` chamando `DELETE`/`PUT status=cancelled` no `preapproval` do MP.
- [ ] **Rastreio de cobrança por cobrança** (`subscription_authorized_payment`): sem isso não há histórico de faturas nem retry de pagamento falho no nosso lado — só o status agregado da assinatura.
- [ ] **Remover linhas `assinaturas` `pendente` órfãs** de tentativas de checkout abandonadas (hoje acumulam sem incomodar — `assinaturaDoCliente` sempre pega a mais recente).
- [x] ~~Upgrade/downgrade, múltiplos planos, cupom/desconto~~ — **[Decisão] fora de escopo** por ora.
- [x] ~~Nota fiscal / recibo~~ — **[Decisão] fora do escopo de código**.

### 4.3 Cadastro (f3c4)
- [x] ~~Cadastro só-convite~~ — **[Decisão] mantido self-service** (2026-09-04). Se um dia mudar: `/portal/cadastro` vira "aceitar convite", o Livio cria o `clientes` + manda link.

### 4.4 Lote / anúncio no portal — refinamentos [Dev]
- [ ] **Tela "meus lotes"** (listagem/histórico) — nem o admin tem; portal segue o mesmo padrão (cria/acompanha um de cada vez). Só se for pedido.
- [x] ~~Escrita de título/descrição em lote no portal~~ — **[Decisão] segue o plano 025**: só geração, gravação manual um a um.
- [ ] **Item de lote apontando pra anúncio de outra conta**: hoje cai no mesmo fallback de leitura pública de `abrirAnuncio`/`carregarDiagnostico` que o admin já usa — nunca vaza token de terceiro, mas um item "errado" pode retornar dado público de um anúncio que não é do cliente. Aceito como está (comportamento herdado, não novo). Revisitar se virar problema.

### 4.5 RLS por cliente [Dev, quando houver tela que leia direto]
- [ ] `anuncio_criacoes`, `ficha_edits`, `lotes`, `lote_itens`, `assinaturas` são **service_role-only** (zero policy) — o portal lê/grava por rota, com ownership garantida no handler. Entra RLS por `cliente_id` quando/se existir uma tela do portal que leia essas tabelas direto (ex.: "histórico do cliente", "minhas faturas").

---

## 5. Dívidas técnicas fora do portal, mas registradas

- [ ] **`tags_novas`** (plano 021): definida em `supabase/schema.sql` mas pode **não existir no projeto vivo**. `src/lib/ml/tags-novas.ts` grava num `try/catch` que engole erro → o dicionário de tags desconhecidas pode não estar gravando nada em produção. Conferir e criar a tabela se faltar.
- [ ] **Plano 013 "IN PROGRESS"** (consolidar guarda de dono + log `ficha_edits` das rotas de escrita): status parado há tempo no `plans/README.md`. Confirmar se foi concluído ou abandonar formalmente.
- [ ] **Planos 014–018 "TODO"** (podar erros / extrair formatadores / histórico de `ficha_edits` / `tags_novas.significado` na UI / worklist local): não são portal, mas seguem abertos.
- [ ] **Trabalho paralelo em `/criar` avulso** (branch `fix/erro-cru-avulso` e afins — GTIN, upload de foto, tela `/pendentes`): quando mergear, os núcleos extraídos em `src/lib/anuncios/*` (planos 034/036) podem precisar de um ajuste de rebase — ex.: a remoção do campo `title` do payload do anúncio avulso.

---

## 6. Estado dos merges (2026-09-05)

| Plano | Branch | PR | Na `main`? |
|-------|--------|----|-----------|
| 026 (tela de lote, f2c3) | `feat/f2c3-tela-progresso-lote` | (rebasado) | ✅ via #10 |
| 034 (criar anúncio no portal) | `feat/034-portal-anuncios` | #9 | ✅ |
| 035 (lote no portal) | `feat/035-lote-portal` | #10 | ✅ |
| 036 (status + branding + cobrança) | `feat/036-cobranca-portal` | aberto | ⏳ revisar/mergear |

Rebasados e mergeados junto do 034: `feat/fase3-conectar-conta` (027) e `feat/f3c2-token-cliente`
(028 — era §1, revisado à mão antes do merge).
