# Portal multi-cliente + fila de lote (planos 019–025)

Junta o trabalho da árvore de trabalho que nunca foi commitado (planos **019–024**) com o
plano **025** novo. Cobre Fase 1 e Fase 2 do quadro "Do Anúncio ao Portal".

## O que já estava pendente (019–024)

| Plano | Entrega |
|---|---|
| 019 | Criação rápida de anúncio via catálogo — `/criar`, `/api/anuncios`, `/api/catalogo/buscar`, tabela `anuncio_criacoes` |
| 020 | Fronteira do motor de análise travada por lint (`no-restricted-imports`) + `AGENTS.md §11` |
| 021 | Tabelas `clientes` / `contas_ml_clientes`, tokens isolados dos robôs |
| 022 | OAuth do Mercado Livre de verdade pro portal (app separado) — `src/lib/ml/oauth.ts`, `clientAccounts.ts`, `/api/oauth/ml/*`, `/clientes` |
| 023 | Login de cliente com Supabase Auth + RLS real em `/portal/*` — `src/lib/supabase/*`, `src/lib/portal/cadastro.ts`, `clientes.auth_user_id` + policies |
| 024 | Fila e worker de lote — `src/lib/lotes/fila.ts`, `/api/lote`, `/api/lote/[id]`, `/api/lote/[id]/processar` (operação `diagnostico`) |

> As migrações dos planos 021–024 já foram aplicadas ao vivo no projeto `vcxweutjmmycajnulkak`
> nas sessões daqueles planos (ver "Status do NNN" em `plans/README.md`). Este PR só as versiona
> em `supabase/schema.sql`.

## Plano 025 — estende o lote pra título e descrição (só geração, f2c2)

- **`src/lib/ml/titulo.ts`** (`gerarPropostaTitulo`) e **`src/lib/ml/descricao.ts`**
  (`gerarPropostaDescricao`) — a geração foi extraída dos handlers `POST` de `/api/titulo/[id]`
  e `/api/descricao/[id]`, que viraram **wrappers finos**. O `PUT` das duas rotas ficou
  **intocado** — gravação continua manual e revisada, um anúncio por vez.
- **`src/lib/lojaBlocos.ts`** (`lerBlocosDaLoja`) — adapter injetado no motor de descrição, para
  ele não importar Supabase (`AGENTS.md §11`).
- **`lotes.tipo`** (`diagnostico` | `titulo` | `descricao`) — `criarLote`/`buscarLote`,
  `POST /api/lote` valida o tipo, o worker despacha por `lote.tipo`. **Nenhum tipo grava no ML**:
  `titulo`/`descricao` só geram a proposta em `lote_itens.resultado`.
- `tests/helpers/supabase-fake.ts` ganhou `.maybeSingle()`.

### Regressão do `POST` (STOP condition do plano)

`tests/lote-titulo-descricao.test.ts` — os 5 testes de rota foram escritos e rodados **verde
contra os handlers ANTES da extração** (cópia temporária sem os imports de motor) e continuam
verdes depois. Os valores esperados foram derivados lendo o handler original. Mais 2 testes
provam que as funções de motor devolvem o mesmo `corpo` que a rota. **O JSON do `POST` de
`/titulo` e `/descricao` é idêntico byte a byte ao de antes.**

## Gate (AGENTS.md)

- `npm run build` — completo, typecheck limpo.
- `npm run lint` — 0 erro; warnings de `no-unused-vars` são os pré-existentes **menos 4**
  (limpeza de imports mortos em `/api/titulo/[id]/route.ts`); nenhum warning novo.
- `npm run verificar` — OK.
- `npm test` — **58/58** (13 novos).

## ⚠️ Pendente antes de mergear / fazer deploy

**Aplicar a migração `lotes.tipo` no banco real** (`vcxweutjmmycajnulkak`). Foi escrita em
`supabase/schema.sql` mas **não aplicada** — a ferramenta de migração do Supabase foi bloqueada
pelo classificador de permissão na sessão. Enquanto não rodar, `criarLote` (qualquer tipo,
inclusive `diagnostico`) falha contra o banco real, porque insere a coluna `tipo`.

```sql
alter table public.lotes add column if not exists tipo text not null default 'diagnostico';
alter table public.lotes drop constraint if exists lotes_tipo_check;
alter table public.lotes add constraint lotes_tipo_check check (tipo in ('diagnostico','titulo','descricao'));
```

**Decisão de escopo** (STOP condition #2 do plano): implementado como o desenho recomenda —
lote **só gera**, gravação continua manual/revisada. Se você quiser um modo "aplicar tudo sem
revisar", é uma troca pequena depois, não deste PR.

**Não testado**: o worker de verdade contra a API do ML com `tipo: titulo`/`descricao` (sem
`ML_CLIENT_ID`/tokens no ambiente) — mesma natureza dos testes manuais pendentes dos planos
022–024.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
