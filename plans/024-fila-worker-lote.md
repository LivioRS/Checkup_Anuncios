# Plan 024: Fila e worker assíncrono para operações em lote (f2c1)

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se um "STOP condition" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo tem `.git` (`github.com/LivioRS/Checkup_Anuncios`). Compare os trechos
> abaixo com `file:line` contra o arquivo vivo antes de editar.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MEDIUM — primeiro código do repo que chama a API do ML fora do ciclo request/response
  de um clique humano. Erro aqui pode martelar a API (rate-limit real, sem número publicado —
  ver "Why this matters") ou deixar um lote travado pra sempre. Mitigado com concorrência baixa
  por padrão, backoff em 429, e nenhum item trava o lote inteiro (erro isolado por item).
- **Depends on**: 020 (fronteira motor/adapter — `analise.ts`/`client.ts` são "motor", este plano
  não os edita, só os chama via `comConta`/`carregarDiagnostico` já exportados).
- **Category**: feature/infra (kanban "Do Anúncio ao Portal", Fase 2, card 1 — f2c1)
- **Planned at**: 2026-09-03.

## Why this matters

f2c1 do quadro: **"Fila e worker assíncrono — Um check-up completo já custa ~10 chamadas por
anúncio — lote precisa de fila com limite de taxa, não de rodar tudo em série."**

Hoje um check-up só acontece quando o Livio abre `/itens/[id]` na mão — a página dispara as
chamadas daquele UM anúncio (`README.md` já documenta: "Check-up completo | ~10, cada bloco
falhando sozinho"). Não existe nenhum jeito de rodar isso pra uma lista de anúncios de uma vez.
Fase 2 do roteiro é justamente isso: **operações em lote**. Este card (f2c1) é só a fila e o
worker — o mecanismo genérico. Adaptar as rotas de escrita (`/titulo`, `/descricao`) pra aceitar
lista é o próximo card (f2c2); a tela de progresso é f2c3; o relatório é f2c4. Este plano
**prova o mecanismo com uma operação real de LEITURA** (o diagnóstico completo, via
`carregarDiagnostico` — já exportado de `src/lib/ml/analise.ts` desde o plano 020), não com um
placeholder — assim f2c2 só precisa plugar as operações de ESCRITA no mesmo cano, não construir a
fila de novo.

**Decisão de infraestrutura (pesquisada nesta sessão, não suposta):**

- **Hospedagem é Vercel** (`README.md`: "Publicar na Vercel", plano gratuito). Cron jobs da
  Vercel no plano Hobby só rodam **uma vez por dia**, com imprecisão de até 59 min (documentação
  oficial, checada agora: "Hobby accounts are limited to cron jobs that run once per day").
  Um worker batido por cron não serve pra processar lote em minutos nesse plano. Design adotado:
  o worker é **um endpoint que processa um punhado de itens por chamada** e devolve o estado —
  quem faz o "tique-taque" é o cliente (a tela de progresso, no f2c3) chamando repetidamente
  enquanto está aberta. O progresso fica salvo no banco (`lotes`/`lote_itens`), então fechar e
  reabrir a aba não perde nada, só pausa. Se o Livio migrar pro plano Pro da Vercel no futuro, dá
  pra trocar pra cron de verdade sem mexer no esquema — só trocar quem chama
  `/api/lote/[id]/processar`.
- **Limite de taxa do ML não tem número público confiável** — a documentação oficial não publica
  RPS/RPM (só existe menção genérica a `429`/`local_rate_limited` em respostas dinâmicas, sem
  tabela de limites). Em vez de inventar um número, o design é defensivo: concorrência **1 item
  por chamada** ao worker (`CONCORRENCIA_PADRAO`), e em `429` o item volta pra `pendente` (não
  vira `erro`) até um teto de tentativas — quem pausa entre chamadas é o chamador (f2c3 vai
  espaçar as chamadas ao worker; por ora, quem testar na mão faz o mesmo).

## Current state

- `src/lib/ml/analise.ts:203` — `carregarDiagnostico(itemId, { ehMinha?, item?, conta? })` já
  roda o check-up completo (~10 chamadas paralelas via `Promise.all`, cada bloco com seu próprio
  try/catch — ver `tentar()` no mesmo arquivo). Pura função "motor", sem Supabase.
- `src/lib/ml/client.ts:38` — `comConta(sellerId, fn)` roda `fn` dentro de um
  `AsyncLocalStorage` que faz `getAccount()` (chamado por dentro de `mlFetch`) resolver pro
  `seller_id` certo. É assim que o worker, rodando fora de um clique de usuário, consegue saber
  de qual conta são os tokens.
- `src/lib/ml/client.ts:158` — `MlError extends Error` carrega `status` (o código HTTP do ML,
  inclusive `429`) — dá pra distinguir rate-limit de erro de verdade sem parsear string.
- Nenhuma tabela de fila/lote existe ainda. Nenhum código do repo chama a API do ML fora de um
  request HTTP originado por clique.

## Commands you will need

```bash
cd checkup-anuncio
npm run build && npm run lint && npm run verificar && npm test
```

## Scope

**In scope:**

- Tabelas `lotes`/`lote_itens` no Supabase (aplicadas de verdade via MCP, mesmo padrão do plano
  023) — RLS ligado, zero policy por enquanto (só `service_role`/admin acessa; o portal do
  cliente ainda não usa lote, isso é Fase 3).
- `src/lib/lotes/fila.ts` (adapter, livre pra importar Supabase) — criar lote, pegar próximos
  pendentes, marcar concluído/erro, fechar lote quando não sobra pendente/processando.
- `POST /api/lote` — cria um lote a partir de `seller_id` + lista de `item_id`.
- `POST /api/lote/[id]/processar` — pega até `CONCORRENCIA_PADRAO` itens pendentes, roda
  `carregarDiagnostico` dentro de `comConta`, grava resultado ou erro, devolve contagem.
- `GET /api/lote/[id]` — estado atual do lote (contagens por status).
- Testes do adapter `fila.ts` (fake Supabase, mesmo padrão dos planos 022/023).
- `AGENTS.md`, `README.md`, `plans/README.md`.

**Out of scope (fica pros próximos cards da Fase 2):**

- Adaptar `/titulo`/`/descricao` (escrita) pra lote — f2c2.
- Tela de progresso, botão "repetir só o que falhou" — f2c3. Sem UI nova neste plano; teste
  manual do worker é via chamada HTTP direta (`curl`/Postman) até f2c3 existir.
- Relatório exportável — f2c4.
- RLS por cliente em `lotes`/`lote_itens` — só entra quando o portal (Fase 3) precisar disparar
  lote em nome de um cliente; hoje é ferramenta do Livio (admin), mesma proteção de
  `PANEL_PASSWORD` que o resto do painel (as rotas `/api/lote/*` não estão em `/portal/*` nem na
  lista de rotas públicas do middleware — ficam atrás da senha por padrão, sem precisar tocar
  `middleware.ts`).

## Git workflow

Mesmo desvio dos planos 020–023: sem `device_bash` nesta sessão, sem branch/commit/PR. Arquivos
enviados direto pra árvore de trabalho no dispositivo do Livio.

## Steps

### Step 1: tabelas `lotes`/`lote_itens`

```sql
create table if not exists public.lotes (
  id            uuid primary key default gen_random_uuid(),
  seller_id     text not null,
  total_itens   integer not null,
  status        text not null default 'em_andamento' check (status in ('em_andamento','concluido')),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.lote_itens (
  id            bigserial primary key,
  lote_id       uuid not null references public.lotes(id) on delete cascade,
  item_id       text not null,
  status        text not null default 'pendente' check (status in ('pendente','processando','concluido','erro')),
  tentativas    integer not null default 0,
  resultado     jsonb,
  erro          text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists lote_itens_lote_status_idx on public.lote_itens (lote_id, status);

alter table public.lotes enable row level security;
alter table public.lote_itens enable row level security;
```

Aplicada via `mcp__Supabase__apply_migration` no projeto real (`vcxweutjmmycajnulkak`), igual ao
plano 023, e anexada em `supabase/schema.sql`.

### Step 2: `src/lib/lotes/fila.ts`

- `TETO_TENTATIVAS = 5` — depois disso um item que só toma 429 vira `erro` (evita loop infinito).
- `criarLote({ sellerId, itemIds }): Promise<{ loteId: string }>`.
- `buscarLote(loteId): Promise<LoteComContagens | null>` — lote + contagem por status.
- `proximosPendentes(loteId, limite): Promise<LoteItem[]>` — seleciona `pendente`, marca
  `processando` antes de devolver (evita corrida se duas chamadas ao worker se sobrepuserem).
- `marcarConcluido(itemDbId, resultado)`.
- `marcarParaRetentar(itemDbId)` — 429: volta pra `pendente`, soma 1 em `tentativas`; se passou
  do teto, vira `erro` com mensagem "excedeu tentativas por rate-limit".
- `marcarErro(itemDbId, mensagem)`.
- `fecharSeCompleto(loteId)` — se não sobra `pendente`/`processando`, marca `lotes.status =
  'concluido'`.

### Step 3: rotas

- `src/app/api/lote/route.ts` (POST): valida `seller_id` + `item_ids` (array não vazio), chama
  `criarLote`, devolve `{ loteId }`.
- `src/app/api/lote/[id]/processar/route.ts` (POST): `proximosPendentes(id, CONCORRENCIA_PADRAO)`
  → para cada item, `comConta(lote.seller_id, () => carregarDiagnostico(item.item_id))` → sucesso
  chama `marcarConcluido`; `MlError` com `status === 429` chama `marcarParaRetentar`; qualquer
  outro erro chama `marcarErro` (não propaga, não trava os outros itens do lote); no fim chama
  `fecharSeCompleto` e devolve as contagens atuais.
- `src/app/api/lote/[id]/route.ts` (GET): devolve `buscarLote(id)`.

### Step 4: testes

`tests/lotes.test.ts` — `fila.ts` com `makeFakeSupabase`: cria lote com N itens; pega pendentes
respeitando o limite; marca concluído/erro; `marcarParaRetentar` incrementa tentativas e vira
erro só depois do teto; `fecharSeCompleto` só fecha quando não sobra pendente/processando.

### Step 5: `AGENTS.md`, `README.md`, `plans/README.md`, gate

- `AGENTS.md`: nova nota — chamadas ao ML fora de request humano (o worker) sempre passam por
  `comConta`, nunca assumem a conta "ativa" implícita de uma sessão de navegador.
- `README.md`: seção nova descrevendo `lotes`/`lote_itens` e o motivo do design (limite do cron
  no plano Hobby da Vercel).
- `plans/README.md`: linha 024 + "Status do 024".
- Gate completo.

## Test plan

1. `npm test` — `tests/lotes.test.ts` cobrindo os cinco casos do Step 4.
2. `npm run build`/`lint`/`verificar` — sem erro novo.
3. **Não testável nesta sessão**: chamar o worker de verdade contra a API do ML (não tenho
   `ML_CLIENT_ID`/tokens de conta neste ambiente) — fica pro Livio rodar
   `curl -X POST .../api/lote` + `.../processar` contra um lote pequeno (2-3 itens reais) depois
   do deploy, mesma natureza do teste manual do OAuth (plano 022) e do login (plano 023).

## Done criteria

- [ ] Tabelas aplicadas de verdade no projeto Supabase + registradas em `supabase/schema.sql`.
- [ ] `src/lib/lotes/fila.ts` criado, com os cinco casos de teste passando.
- [ ] Rotas `POST /api/lote`, `POST /api/lote/[id]/processar`, `GET /api/lote/[id]` criadas.
- [ ] `429` não derruba o lote — item volta pra fila até o teto de tentativas.
- [ ] Erro que não é 429 fica isolado naquele item — resto do lote continua.
- [ ] `AGENTS.md`, `README.md`, `plans/README.md` atualizados.
- [ ] Gate completo verde.
- [ ] Kanban (`PROGRESSO_CONHECIDO`) atualizado com `f2c1: true`.

## STOP conditions

- Se não der pra aplicar a migração no Supabase real (conflito, permissão): parar e reportar.
- Este plano **não** cria UI nem dispara chamadas de verdade contra a API do ML (não tenho
  credenciais de conta neste ambiente) — o teste ponta-a-ponta é manual, do Livio, depois do
  deploy. Não é um STOP, é uma limitação conhecida, documentada em "Status do 024".

## Maintenance notes

- Se o Livio migrar pra Vercel Pro no futuro, um cron de verdade (`vercel.json`, `* * * * *`)
  chamando `/api/lote/[id]/processar` pra todo lote `em_andamento` substitui o polling do
  cliente sem mudar `fila.ts` nem o formato das tabelas — só quem invoca o endpoint muda.
- `CONCORRENCIA_PADRAO` e `TETO_TENTATIVAS` são constantes isoladas de propósito (não
  configuráveis por env ainda) — se o ML se mostrar mais tolerante na prática, é uma linha só pra
  ajustar, mas exige teste manual pra validar antes de subir o número.
