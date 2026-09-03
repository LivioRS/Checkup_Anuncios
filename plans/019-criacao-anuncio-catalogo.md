# Plan 019: Criação rápida de anúncio via catálogo (multi-cliente)

> **Instruções ao executor**: este é um plano de **feature** (não spike). Implementar, testar e
> só declarar pronto com `npm run build`, `npm run lint`, `npm run verificar` e `npm test`
> passando (AGENTS.md §3). Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check**: compare os trechos abaixo com `file:line` contra o arquivo vivo antes de
> editar — pode ter mudado desde que este plano foi escrito (2026-09-01, sessão de setup OAuth).
> Este repo agora TEM `.git` (`github.com/LivioRS/Checkup_Anuncios`) — a nota antiga em
> `plans/README.md` dizendo o contrário está desatualizada; confirme e corrija-a se for o caso.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED — cria anúncios de verdade no Mercado Livre (dinheiro/estoque real de clientes).
  Mitigado pela invariante "nunca publica ativo sozinho" (ver STOP conditions).
- **Depends on**: nenhum plano anterior bloqueia — mas reusa infra já pronta (ver "Current state").
- **Category**: feature
- **Planned at**: 2026-09-01, sem SHA de commit (confirme se o repo já tem `.git` — ver nota acima)

## Why this matters

Livio atende clientes que recebem produto novo e levam **dias** pra publicar o anúncio, porque
hoje o fluxo é manual: tirar foto, escrever ficha técnica, escrever descrição, escolher
categoria, preencher atributo por atributo. Para produtos de marca/modelo conhecidos, o Mercado
Livre já tem tudo isso pronto no **catálogo** (o mesmo catálogo que a aba "Catálogo" do check-up
já consulta em `src/lib/ml/catalogo.ts`) — ficha técnica e fotos inclusas. Vinculando o anúncio a
um produto de catálogo, o cliente só precisa informar preço/quantidade/condição, e o anúncio sai
em segundos em vez de dias.

Decisão de escopo tomada com o usuário nesta sessão:
- **Multi-cliente desde já**: cada cliente com a própria conta ML conectada.
- **Entrada mínima**: código, modelo, marca, valor (o que o cliente já tem em mãos ao receber o
  produto — sem ficha técnica nem fotos prontas).
- **Publicação**: cria direto via API, mas **como rascunho/pausado**, nunca ativo — alguém
  confere e ativa. Prioriza velocidade sem abrir mão de uma checagem humana antes de ir ao ar.
- **Onde**: nova aba dentro do painel Check-up já existente (reaproveita login, Supabase, tokens).

## Current state

Infra que este plano **reaproveita sem alterar**:

- `src/lib/ml/client.ts:38-40` `comConta(sellerId, fn)` — escopa chamadas ML a uma conta
  específica. É o multi-tenant que já existe; não precisa de tabela nova.
- `src/lib/ml/client.ts:56-64` `listarContas()` — lista as contas com token, pronta pra virar
  seletor de cliente na UI.
- `src/lib/ml/client.ts:71-87` `getAccount()` — resolve a conta ativa do escopo.
- `src/lib/ml/catalogo.ts:37-72` `buscarProdutos({ site, gtin?, q?, domainId?, limite? })` — já
  busca no catálogo por GTIN (prioridade) ou texto, exatamente o que a busca por
  marca+modelo(+código) precisa. Retorna `{ resultados, via: 'gtin' | 'texto' | null }`.
- `src/lib/ml/attributes.ts:42-51` `getCategoryAttributes(categoryId)` — cache 24h por
  categoria+seller. Só é necessário se o produto de catálogo não cobrir tudo.
- `src/app/api/itens/[id]/route.ts:1-64` — padrão de rota de escrita: `garantirDono` (dono do
  anúncio) → `mlFetch` → `registrarEscrita` (loga em `ficha_edits`) → resposta. Este plano segue
  o mesmo formato de rota, mas criação de anúncio não tem "dono" prévio nem `item_id` antes da
  resposta do ML — por isso usa uma tabela de log própria (ver Step 0).
- `src/lib/env.ts:7-24` — `ML_CLIENT_ID`/`ML_CLIENT_SECRET` já validados; nada muda aqui.
- `src/app/page.tsx:63-190` — home atual é só busca/abrir anúncio existente; a nova aba entra
  aqui do lado, sem quebrar o fluxo de busca.
- `supabase/schema.sql:13-23` `ficha_edits` — loga edições de anúncio **existente**
  (`item_id text not null`). Não serve para tentativas de criação que podem falhar antes de
  existir um `item_id`.
- Tokens: a conta `2490900` (SHINNISHI) já está com `access_token`+`refresh_token` reais na
  `contas` (app `checkup-anuncios`, client_id `2475515893628993`, com o fluxo "Refresh Token"
  habilitado no DevCenter) — resolvido nesta mesma sessão. **Zero anúncios publicados nela ainda**
  — bom caso de teste real de ponta a ponta assim que este plano estiver pronto.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Typecheck + build | `npm run build` | exit 0 |
| Lint | `npm run lint` | exit 0 |
| Testes | `npm test` | exit 0 |

## Scope

**In scope**:
- Migração: tabela nova `anuncio_criacoes` (log de tentativas de criação, sucesso ou falha).
- Rota de busca de candidato de catálogo por marca+modelo+código.
- Rota de criação de anúncio vinculado a um `catalog_product_id`, sempre como rascunho/pausado.
- Seletor de conta/cliente na UI (multi-tenant, reusando `listarContas()`).
- Nova aba/rota no painel com o formulário (marca, modelo, código, valor, quantidade, condição)
  → mostra candidatos de catálogo → confirma → cria.
- Log de toda tentativa (payload enviado, resposta do ML, sucesso/falha) em `anuncio_criacoes`.

**Out of scope (vira plano 020 se o usuário quiser)**:
- Fallback para produto **sem** correspondência no catálogo (previsão de categoria, atributos
  manuais, obrigatoriedade de foto própria). Neste plano, sem candidato de catálogo = a tela avisa
  e para; não cria anúncio "do zero".
- Upload de foto própria / edição de ficha técnica na hora da criação.
- Ativação automática do anúncio (sempre fica pausado; ativar é ação manual, fora deste plano).

## Git workflow

Repo tem remoto no GitHub (`github.com/LivioRS/Checkup_Anuncios`) — branch feature +
commits normais + PR, seguindo o que o resto do projeto já usa. Não commitar `.env.local`
(já está no `.gitignore`).

## Steps

### Step 0: migração `anuncio_criacoes`

Adicionar em `supabase/schema.sql` (mesmo padrão de `ficha_edits`):

```sql
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
```

Aplicar via `mcp__Supabase__apply_migration` no projeto `vcxweutjmmycajnulkak` (Chckup_Anuncios).

**Verify**: `mcp__Supabase__list_tables` mostra `anuncio_criacoes`.

### Step 1: rota de busca de candidato — `GET /api/catalogo/buscar`

Recebe `marca`, `modelo`, `codigo?`, `seller_id`. Usa `comConta(seller_id, ...)` (client.ts:38-40)
e `buscarProdutos` (catalogo.ts:37-72): se `codigo` vier, tenta como `gtin` primeiro; sempre tenta
por texto (`${marca} ${modelo}`) como reforço/alternativa. Devolve os candidatos (nome, imagem,
atributos principais) sem criar nada.

**Verify**: chamada com marca+modelo de um produto conhecido devolve ao menos 1 candidato
plausível; com marca+modelo inventados devolve lista vazia sem erro.

### Step 2: rota de criação — `POST /api/anuncios`

Recebe `seller_id`, `catalog_product_id` (escolhido no Step 1), `valor`, `quantidade`,
`condicao` (`new`/`used`). Monta o payload do `POST /items` do ML com
`catalog_listing: true`, `catalog_product_id`, `price`, `available_quantity`, `condition`,
**`status: "paused"`** (confirmar na doc oficial do ML se `status` é aceito no create ou se
precisa de um PUT separado logo depois — ver STOP conditions). Chama via `mlFetch('/items', {
method: 'POST', body: ... })` (client.ts já cuida de token/refresh). Loga em
`anuncio_criacoes` (payload, status HTTP, `item_id` se sucesso, corpo da resposta) —
sucesso e falha, sempre.

**Verify**: teste com `fetch` mockado confirma payload (`catalog_listing`, `status: paused`) e
que a linha é gravada em `anuncio_criacoes` tanto no sucesso quanto na falha simulada.

### Step 3: seletor de conta/cliente + formulário na UI

Nova rota `/criar` (ou aba na home, `src/app/page.tsx`): seletor de conta vindo de
`listarContas()` (client.ts:56-64), campos marca/modelo/código/valor/quantidade/condição,
botão "Buscar no catálogo" → lista candidatos (Step 1) com prévia (nome, foto, atributos) →
escolher um → confirmar → cria (Step 2) → mostra link do rascunho criado.

**Verify**: fluxo manual em dev, contra a conta `2490900` (sem anúncios, então é teste limpo):
buscar um produto real conhecido, confirmar que aparece candidato, criar, e checar no Mercado
Livre (Meus anúncios) que o rascunho existe e está **pausado**.

### Step 4: aviso de "sem candidato no catálogo"

Se `buscarProdutos` não devolver nada, a tela avisa claramente ("não achamos esse produto no
catálogo — fora do escopo deste fluxo por enquanto") em vez de deixar criar um anúncio sem
ficha/fotos.

**Verify**: marca+modelo sem correspondência mostra o aviso, não um formulário de criação manual.

### Step 5: smoke + verificação final

**Verify**: `npm run build`, `npm run lint`, `npm run verificar`, `npm test` — todos exit 0.
Atualize `plans/README.md` (linha 019 → DONE) e registre aqui questões em aberto que sobrarem.

## Test plan

- Mock de `fetch`/`mlFetch` (padrão já usado em `tests/`, ver `injetarCliente` no AGENTS.md §5):
  - `buscarProdutos` prioriza GTIN quando `codigo` é passado.
  - `POST /api/anuncios` monta o payload certo e sempre grava em `anuncio_criacoes`, sucesso e
    falha.
  - Criação nunca manda `status: "active"` — teste que trava isso explicitamente (invariante de
    segurança, não só comportamento incidental).
- `npx vitest run` + `npm run build` + `npm run verificar` + `npm run lint`.

## Done criteria

- [ ] Migração `anuncio_criacoes` aplicada e visível em `list_tables`.
- [ ] `GET /api/catalogo/buscar` devolve candidatos reais para marca+modelo conhecidos.
- [ ] `POST /api/anuncios` cria anúncio de catálogo **pausado**, nunca ativo, e loga toda
      tentativa (sucesso ou falha) em `anuncio_criacoes`.
- [ ] Seletor de conta/cliente funciona com múltiplas contas na `contas`.
- [ ] Aba/rota "Criar anúncio" completa o fluxo ponta a ponta em dev contra a conta `2490900`.
- [ ] Caso sem candidato de catálogo mostra aviso, não deixa criar "no escuro".
- [ ] `npm run build`, `npm run lint`, `npm run verificar`, `npm test` passam.
- [ ] `plans/README.md` status do 019 = DONE.

## STOP conditions

Pare e reporte se:

- A API do ML **não aceitar** `status: "paused"` no `POST /items` inicial — nesse caso, pare
  antes de mudar a invariante "nunca ativo sozinho"; a alternativa correta é criar e imediatamente
  fazer um `PUT` para pausar, **antes** de expor qualquer link pro usuário, nunca depois.
- A busca de catálogo por marca+modelo devolver resultados de baixa confiança/ambíguos sem um
  jeito razoável de mostrar a diferença pro usuário escolher — reporte, não adivinhe o produto
  certo.
- Precisar de scope/permissão do app do Mercado Livre que ainda não foi concedida (o app
  `checkup-anuncios` já tem "Publicação e sincronização: leitura e escrita" — confirme antes de
  implementar que cobre `POST /items` com `catalog_listing`).
- `anuncio_criacoes` conflitar com alguma tabela/nome já usado por outro processo (`puxador`,
  `repricer_piloto`) — confirme com o usuário antes de criar.

## Maintenance notes

- Invariante permanente (adicionar ao `AGENTS.md` junto com este plano): **criação de anúncio
  nunca publica ativo automaticamente** — sempre pausado/rascunho até revisão humana.
- Todo `POST /items` (sucesso ou falha) é logado em `anuncio_criacoes` — nunca criar "silencioso".
- Reusa `comConta`/`getAccount` para multi-tenant; não duplicar lógica de resolução de conta.
- Fallback pra produto sem catálogo fica para um plano 020 explícito — não misturar escopos.
