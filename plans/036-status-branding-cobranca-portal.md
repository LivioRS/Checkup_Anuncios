# Plan 036: Gate de status (f3c4) + branding simples (f3c5) + cobrança via Mercado Pago (f3c6)

> **Instruções ao executor**: siga na ordem. STOP condition = pare e reporte. Atualize
> `plans/README.md` ao terminar. Gate obrigatório do AGENTS.md em tudo
> (`npm run build && npm run lint && npm run verificar && npm test`). Tem git de verdade —
> branch + commit + PR.

## O que é

Os três cards de decisão de produto do roteiro da Fase 3 (`plans/027-fase-3-roteiro.md`),
decididos pelo Livio nesta sessão:

1. **Cadastro (f3c4, decisão #1)**: `/portal/cadastro` continua self-service aberto — SEM
   mudança de fluxo de cadastro. O que falta do card f3c4 é só o **gate de `clientes.status`**
   (existe a coluna, nada checava — cliente `suspenso` continuava entrando).
2. **Branding (f3c5, decisão #3)**: nome/logo da loja — campo em `clientes`, sem subdomínio.
3. **Cobrança (f3c6, decisão #2)**: entra agora, via **Mercado Pago** (assinaturas/preapproval —
   mesma família do ML, Pix/boleto/cartão nacional). **Trial de 7 dias** a partir do cadastro;
   depois disso, criar anúncio/lote no portal exige assinatura `authorized`. Preço fica como
   **constante fácil de trocar** (`MERCADOPAGO_PLANO_VALOR_CENTAVOS` no `.env`, com um default
   documentado) — o Livio decide o valor final sem depender de outra sessão.

## Migração

```sql
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

Sem RLS nova por enquanto — mesmo padrão de `anuncio_criacoes`/`lotes` (034/035):
service_role-only, ownership garantida na rota.

## Desenho

### 1. `src/lib/env.ts`

`mercadoPagoAccessToken` (server → API do MP), `mercadoPagoWebhookSecret` (valida `x-signature`),
`mercadoPagoPlanoValorCentavos` (opcional, default documentado — ex.: `9700` = R$ 97,00; o
Livio troca no `.env.local` sem mexer em código).

### 2. `src/lib/mercadopago/client.ts` (adapter — livre pra importar Supabase indiretamente via quem chama, mas AQUI só fala com a API do MP)

```ts
export async function criarAssinatura(input: { clienteId: number; email: string; backUrl: string }):
  Promise<{ preapprovalId: string; initPoint: string }>
```

`POST https://api.mercadopago.com/preapproval` (SEM plano associado — mais simples pra 1 preço
único): `reason`, `payer_email`, `back_url`, `auto_recurring: { frequency: 1, frequency_type:
'months', transaction_amount, currency_id: 'BRL' }`, `status: 'pending'` (checkout hospedado —
o cliente escolhe/cadastra o cartão na página do MP, não aqui). Resposta tem `init_point` (URL
pra redirecionar o browser) e `id` (preapproval id).

```ts
export async function buscarAssinaturaMp(preapprovalId: string): Promise<{ status: string }>
```

`GET /preapproval/{id}` — usado pelo webhook pra confirmar o status atual (nunca confiar só no
que a notificação diz).

### 3. `src/lib/mercadopago/webhook.ts`

```ts
export function validarAssinaturaWebhook(input: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string;
  segredo: string;
}): Promise<boolean>
```

Formato do MP: `x-signature: ts=<epoch>,v1=<hex>`. Manifesto:
`` `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${ts};` ``, HMAC-SHA256 com o
webhook secret (Web Crypto, mesmo padrão de `src/lib/crypto.ts`), comparado com `igualSegura`
(timing-safe, já existe nesse arquivo — reusar, não duplicar).

### 4. `src/lib/portal/assinatura.ts` (adapter)

```ts
export const TRIAL_DIAS = 7;

export function emTrial(clienteCriadoEm: string, agora = Date.now()): boolean
export async function assinaturaAtivaDoCliente(clienteId: number): Promise<{ status: string } | null>
export async function clienteLiberado(clienteId: number, clienteCriadoEm: string): Promise<boolean>
  // true se emTrial(...) OU existe assinatura com status 'authorized'
export async function registrarInicioAssinatura(input: { clienteId: number; preapprovalId: string; valorCentavos: number }): Promise<void>
export async function atualizarStatusAssinatura(preapprovalId: string, status: string): Promise<void>
```

### 5. Gate de `clientes.status` — em `src/lib/portal/contaAtiva.ts`

`clienteLogadoId`/`resolverContaDoClienteLogado`/`conexoesDoClienteLogado` passam a ler `status`
junto com `id` e devolver "sem cadastro" (mesmo efeito de hoje) quando `status !== 'ativo'` — um
cliente `suspenso`/`cancelado` some das rotas do portal por inteiro (não só das de anúncio/lote),
igual a não ter `auth_user_id` vinculado. **Sem mudança de assinatura de retorno** — os
chamadores de 034/035 continuam funcionando sem editar nada.

### 6. Rotas novas

- `POST /api/portal/assinatura/iniciar` — sessão obrigatória (401 sem); chama `criarAssinatura`,
  grava `pendente` em `assinaturas` (`registrarInicioAssinatura`), devolve `{ init_point }`. O
  cliente (browser) redireciona (`window.location.href`).
- `POST /api/webhooks/mercadopago` — **PÚBLICA** (sem sessão — é o MP chamando, autenticado por
  `x-signature`, não por cookie). Valida a assinatura; se `type` for `subscription_preapproval`
  (único tópico cujo `data.id` é o `preapproval_id` direto — `subscription_authorized_payment`
  teria `data.id` de um PAGAMENTO, id diferente, fora de escopo aqui), busca o status atual via
  `buscarAssinaturaMp` (nunca confia só no corpo da notificação) e chama
  `atualizarStatusAssinatura`. Responde `200` sempre que processar (mesmo se o preapproval_id
  não bater com nenhuma linha — evita retry infinito do MP por um evento que não é nosso).
  Assinatura inválida → `401`, sem tocar o banco.
- `PUT /api/portal/perfil` — sessão obrigatória; atualiza `nome_loja`/`logo_url` do próprio
  cliente (nunca de outro — usa o `clienteId` da sessão, igual ao resto do portal).

### 7. `src/middleware.ts`

`/api/webhooks/mercadopago` entra em `ehRotaPublica` (não passa pelo `PANEL_PASSWORD` nem por
`tratarRotaPortal` — não começa com `/portal`/`/api/portal`, então já cairia direto no gate do
painel sem essa exceção).

### 8. Gate de trial nas 3 rotas de criação

`POST /api/portal/anuncios` (catálogo), `POST /api/portal/anuncios/avulso`, `POST
/api/portal/lote` — depois de resolver a conta (`resolverContaDoClienteLogado`), checam
`clienteLiberado(clienteId, clienteCriadoEm)`; se `false`, `402` com aviso "período de teste
encerrado, assine para continuar". As demais rotas do portal (categoria, ficha-por-gtin,
rascunho, ia, ficha-web, catalogo/buscar, `/lote/[id]/*`) **não** são gateadas — só as que
criam valor de verdade (anúncio no ML / job de lote).

### 9. UI

- `/portal/painel`: bloco "Assinatura" — trial (`Faltam N dias de teste`) ou status da
  assinatura (`Selo`); botão "Assinar agora" → `POST /api/portal/assinatura/iniciar` →
  `window.location.href = json.init_point`. Form simples de `nome_loja`/`logo_url` (dois campos
  + botão salvar → `PUT /api/portal/perfil`), com preview do logo se a URL responder.
- `/portal/criar` e `/portal/lote` (`page.tsx`, server component): antes de renderizar
  `CriarModos`/`CriarLote`, chamam `clienteLiberado(...)`; se `false`, mostram a mesma
  `Secao` "período de teste encerrado" com link pro painel (onde está o botão "Assinar") em vez
  do formulário — UX melhor que deixar preencher tudo e levar 402 no clique de criar.

## STOP conditions

- Se o webhook aceitar uma notificação sem assinatura válida → PARE (§ de segurança equivalente
  ao §1 — dinheiro/acesso, não token, mas mesmo princípio de "nunca confiar sem verificar").
- Se uma rota do portal aceitar `cliente_id`/`preapproval_id` do corpo pra decidir de quem é a
  assinatura, em vez de sempre resolver pela sessão → PARE.
- Se `tests/portal-anuncios.test.ts`/`tests/portal-lote.test.ts` (034/035) mudarem de
  comportamento pra clientes já liberados (dentro do trial) → PARE.

## Fora de escopo

- Header/layout compartilhado de `/portal/*` com o branding em TODA página — v1 mostra
  `nome_loja`/`logo_url` só no painel; layout global fica de fast-follow.
- Cancelamento de assinatura pelo próprio cliente (self-service) — por ora só o webhook
  atualiza o status (pausas/cancelamentos batem pelo MP, ex. cliente cancela no cartão).
- Upgrade/downgrade de plano, múltiplos planos, cupom/desconto.
- Emissão de nota fiscal/recibo — fora do escopo de código deste plano.

## Não dá pra testar nesta sessão

Sem `MERCADOPAGO_ACCESS_TOKEN`/`MERCADOPAGO_WEBHOOK_SECRET` reais (mesma natureza do
`ML_CLIENT_ID_PORTAL` pendente desde o 022) — o Livio precisa criar a aplicação em
https://www.mercadopago.com.br/developers/panel, configurar o webhook (URL de produção +
tópicos `subscription_preapproval`/`subscription_authorized_payment`) e colocar as chaves no
`.env.local`/Vercel antes do fluxo de assinatura de verdade funcionar.

## Git workflow

Branch a partir da `main` atual (027+028+034+035 já mergeados). Commit por camada. Push + PR.
