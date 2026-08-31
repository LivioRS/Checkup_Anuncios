# AGENTS.md — Invariantes obrigatórias para agentes

Este arquivo documenta as regras que **qualquer agente** (ou desenvolvedor) deve seguir ao trabalhar neste repositório. Não são sugestões; são invariantes que, se quebradas, causam bugs reais em produção.

---

## 1. Refresh token do Mercado Livre é de uso único

- O `refresh_token` do ML **só pode ser usado uma vez**. Cada renovação grava o par novo (`access_token` + `refresh_token`) na **mesma linha** da tabela `contas`.
- **NUNCA** guarde o token em outro lugar (arquivo, outra tabela, variável de ambiente, cache externo). Se dois processos renovarem o mesmo token, um recebe `invalid_grant` e derruba o outro.
- O painel **centraliza** o refresh em `src/lib/ml/client.ts` (`refrescarUmaVez` com dedup por `seller_id`). Não crie rotas paralelas que chamem `/oauth/token`.

---

## 2. `db()` só roda no servidor (service_role)

- `src/lib/supabase.ts` cria o cliente com `service_role`. **NUNCA** importe `db()` em componentes client (`"use client"`).
- Se precisar de dados no client, crie uma rota API (`src/app/api/.../route.ts`) que use `db()` e retorne JSON.

---

## 3. Verificação antes de declarar pronto

Antes de declarar uma tarefa como concluída, **rode os três comandos** e confirme que todos passam:

```bash
npm run build       # compila + typecheck
npm run lint        # eslint (regras base + TS)
npm run verificar   # testes de lógica pura
npm test            # vitest (fluxo de token, crypto)
```

Se algum falhar, **não diga que terminou**. Corrija até passar.

---

## 4. Lint e typecheck são obrigatórios

- `npm run lint` roda ESLint (regras base + TS). Não commite código que gere erros.
- `npm run typecheck` (`tsc --noEmit`) deve passar sem erros.
- Warnings de `@typescript-eslint/no-unused-vars` são aceitáveis; erros não.

---

## 5. Testes: comportamento, não implementação

- Testes em `tests/` usam mocks de `fetch` e do cliente Supabase via `injetarCliente`.
- Teste o **comportamento** (ex.: "refresh concorrente roda 1 vez"), não a implementação.
- Nunca re-implementem lógica de produção no teste (o `verificar-ficha.mjs` antigo fazia isso — não repita).

---

## 6. Segredos: nunca no código, nunca no log, nunca na resposta

- `ML_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `PANEL_PASSWORD`, `PANEL_HMAC_SECRET` **só em `.env.local`** (nunca commitado).
- Rotas de erro **não ecoam** payloads brutos do ML/Claude/sharp ao cliente (`src/app/api/.../route.ts` usam `erroAoSeguro`).
- O cookie `painel` é HMAC assinado (`exp.sig`), não `sha256(senha)` puro.

---

## 7. Rate-limit e open redirect

- `/api/panel-login` tem rate-limit por IP (10 req / 15 min). Não remova.
- Parâmetro `next` só aceita caminho relativo (`/...`). URLs absolutas são bloqueadas.
- Comparação de senha usa `compararSenha` (hash + timing-safe). Não use `===` direto.

---

## 8. Imagens: teto de bytes e pixels

- `src/app/api/imagens/[id]/route.ts` aplica teto de **15 MB** (`Content-Length` + body) e **8192² pixels** no `sharp` (`limitInputPixels`).
- Não aumente esses limites sem justificar por escrito.

---

## 9. Cache de categoria: TTL 24 h por seller

- `src/lib/ml/attributes.ts` usa cache em memória com TTL 24 h, chaveado por `seller_id:categoryId`.
- Não use `revalidate: 86400` no `fetch` (ignorado sob `force-dynamic`).

---

## 10. Comandos de verificação (roteiro obrigatório)

```bash
# Tudo junto — rode antes de abrir PR / declarar pronto
npm run build       # compila + typecheck (tsc --noEmit)
npm run lint        # eslint (regras base + TS)
npm run verificar   # node --experimental-strip-types scripts/verificar-ficha.mjs
npm test            # vitest run (12 testes: token flow + crypto)
```

Se **qualquer um** falhar → a tarefa **não está pronta**.