# Plan 003: Endurecer auth do painel — open redirect, cookie com token de sessão e rate-limit

> **Instruções ao executor**: siga cada passo em ordem, rode cada comando de verificação e
> confirme o resultado esperado antes de avançar. Se algo em "STOP conditions" ocorrer, pare
> e reporte — não improvise. Ao terminar, atualize a linha deste plano em `plans/README.md`.
>
> **Drift check**: repo NÃO é git. Compare os trechos de "Current state" (com `file:line`)
> contra o arquivo vivo antes de editar; divergiu → STOP e reporte.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW (additivo; não muda a experiência de login legítimo)
- **Depends on**: none
- **Category**: security
- **Planned at**: sem git (2026-08-28)

## Why this matters

Três fragilidades na única barreira de escrita do painel (que grava em anúncios reais):
1. **Open redirect** — `panel-login/route.ts:14` redireciona para `new URL(next, req.url)` com
   `next` vindo do form (rota pública/anônima, liberada no middleware). Lure para
   `/login?next=https://evil` captura a vítima após ela digitar a senha.
2. **Cookie = sha256(senha)** — `panel-login/route.ts:15` seta `painel=sha256Hex(PANEL_PASSWORD)`
   e `middleware.ts:30-33` compara com o mesmo hash. Determinístico: posse do cookie = acesso
   permanente de escrita, sem nonce/sal/revogação; e o hash permite teste offline contra o valor.
3. **Sem rate-limit + comparação `!==` não constante** — `panel-login/route.ts:10`; a única
   senha compartilhada pode ser brute-forced sem trava.

## Current state

- `src/app/api/panel-login/route.ts` — `POST` lê `senha` e `next` do form; compara `senha !==
  esperada` (`:10`) e, se ok, `NextResponse.redirect(new URL(next, req.url), 303)` (`:14`) e
  seta cookie `painel` = `await sha256Hex(esperada)` com `httpOnly`, `sameSite:'lax'`,
  `secure:true`, `maxAge 30d` (`:15-21`).
- `src/middleware.ts` — matcher cobre tudo exceto `_next/static|image|favicon`; isenta
  `/login` e `/api/panel-login` (`:10`); se sem `PANEL_PASSWORD`: produção → 503, dev → passa
  (`:22-28`); compara `req.cookies.get('painel')?.value === esperado` (`:30-32`).
- `src/lib/crypto.ts` — `sha256Hex` (SHA-256 → hex), usado no login e no middleware.
- `src/app/login/page.tsx:14` — hidden field `next` recebe `sp.next ?? '/'`.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |
| Lint (se 009 aplicado) | `npm run lint` | exit 0 |

## Scope

**In scope**:
- `src/app/api/panel-login/route.ts`
- `src/lib/crypto.ts` (adicionar helpers de token HMAC, se usar essa rota)
- `src/middleware.ts`
- `src/app/login/page.tsx` (só se precisar ajustar o hidden `next`)

**Out of scope**:
- NÃO alterar rotas de API nem a lógica do painel.
- NÃO mexer em `PANEL_PASSWORD` no Supabase/banco.
- NÃO criar repositório git.

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: validar `next` como caminho relativo de mesma origem

Em `panel-login/route.ts`, antes de redirecionar, garanta que `next` seja um caminho relativo
da própria origem. Exemplo de guarda:

```ts
function caminhoSeguro(next: string): string {
  try {
    const u = new URL(next, 'http://localhost'); // base fictícia p/ parser
    // Só aceita caminho relativo: sem host/autoridade própria
    if (next.startsWith('//')) return '/';
    if (!next.startsWith('/')) return '/';
    if (u.hostname !== 'localhost') return '/'; // se next tiver host próprio
    return next;
  } catch {
    return '/';
  }
}
```

Ajuste conforme for mais limpo (ex.: usar `req.nextUrl.origin`). A regra de ouro: **só
redirecione para caminho relativo começando com `/` e sem `//host`**.

**Verify**: `npm run build` → exit 0. (Teste manual opcional: ir a
`/login?next=https://evil` e verificar que, ao logar, redireciona para `/` e não `https://evil`.)

### Step 2: substituir cookie `sha256(senha)` por token de sessão revogável

Troque o cookie estático por um token de sessão que possa ser invalidado. Uso de assinatura
HMAC (não-persistente em banco, sem estado extra) é o caminho mais simples:

Em `src/lib/crypto.ts`, adicione:

```ts
export async function assinarSessao(senha: string, agora: number): Promise<string> {
  // payload: hash da senha + expiração; assinatura HMAC com segredo do ambiente
  const hmac = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(process.env.PANEL_HMAC_SECRET ?? 'dev-secret'),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const corpo = `${await sha256Hex(senha)}.${agora + 60*60*24*30}`; // 30d
  const sig = await crypto.subtle.sign('HMAC', hmac, new TextEncoder().encode(corpo));
  return `${corpo}.${Array.from(new Uint8Array(sig)).map(b=>b.toString(16).padStart(2,'0')).join('')}`;
}

export async function verificarSessao(cookie: string): Promise<boolean> {
  // parse corpo.sig; recalcula HMAC; compara constant-time; checa expiração
}
```

(Ou use um segredo `PANEL_HMAC_SECRET` de ambiente; se não existir, registre e gere-secure.
Quando o cookie for `assinarSessao`s/suportar logout/rotação, revogar = mudar o segredo.)

Atualize `panel-login/route.ts:15` para `res.cookies.set('painel', await assinarSessao(esperada, Date.now()), {...})`
e `middleware.ts:31` para `if (await verificarSessao(cookie)) return NextResponse.next();`.

**Verify**: `npm run build` → exit 0; login funciona (dev); cookie não é mais o hash puro.

### Step 3: rate-limit por IP + comparação em tempo constante

No `panel-login/route.ts`, adicione um rate-limit em memória (Map por IP: contagem +
janela). Ex.: máx. 10 tentativas por 15 min por IP, retornando 429. E na comparação da senha
use `crypto.timingSafeEqual` sobre buffers de mesmo tamanho (hash os dois lados primeiro):

```ts
import { timingSafeEqual, createHash } from 'node:crypto';

function igualSegura(a: string, b: string): boolean {
  const ah = createHash('sha256').update(a).digest();
  const bh = createHash('sha256').update(b).digest();
  return ah.length === bh.length && timingSafeEqual(ah, bh);
}
```

**Verify**: `npm run build` → exit 0; após 10 tentativas erradas, o mesmo IP recebe 429.

### Step 4: rodar smoke

**Verify**: `npm run verificar` → exit 0.

## Test plan

- Este plano é de hardening; o 001 pode acrescentar um teste puro de `caminhoSeguro()` e de
  `assinarSessao`/`verificarSessao` (payload assinado muda → inválido; expirado → inválido;
  senha errada → inválido). Se 001 já estiver aplicado, extendê-lo; senão, anote como follow-up.
- Verificação: `npx vitest run` se 001 aplicado → passando; senão `npm run build` + testes manuais acima.

## Done criteria

- [ ] Login com `next=https://evil` redireciona para `https://evil` NÃO acontece (rede de
      regressão ou teste manual)
- [ ] `painel` cookie não é mais `sha256(senha)` puro; é token assinado com expiração
- [ ] Rate-limit (10/15min por IP) retorna 429
- [ ] Comparação de senha usa `timingSafeEqual`
- [ ] `npm run build` + `npm run verificar` passam
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] `plans/README.md` status do 003 = DONE

## STOP conditions

Pare e reporte se:

- O middleware rodar fora do Node (Edge) e `node:crypto` não estiver disponível — então
  use a Web Crypto `crypto.subtle` (como `sha256Hex` já faz) para HMAC; não force `node:crypto`.
- Exigir mudar o esquema de `PANEL_PASSWORD` no ambiente para `PANEL_HMAC_SECRET`
  (adicione a env nova, mas não quebre o app sem ela — use fallback de dev).
- Achar um fluxo legítimo de login que quebre (ex.: bookmarks com `next` absoluto salvos por
  usuários).

## Maintenance notes

- Rotação/revogação de sessão = trocar `PANEL_HMAC_SECRET` (documente no README via plano 011).
- O rate-limit em memória é por instância serverless; em produção com várias instâncias, migre
  para Supabase/Redis se precisar de travamento global.
- Mantenha `httpOnly`, `secure`, `sameSite:'lax'` do cookie (já setados).
