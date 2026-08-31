# Plan 011: Atualizar README para o código + adicionar AGENTS.md

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se "STOP conditions" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo NÃO é git. Compare a lista de arquivos real com o que o README lista.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: VERY LOW
- **Depends on**: none
- **Category**: docs
- **Planned at**: sem git (2026-08-28)

## Why this matters

O README é a única doc de arquitetura e onboarding do projeto, mas está **desatualizado**:
a seção "Estrutura" (`README.md:109-127`) omite vários arquivos reais e a tabela "As cinco
telas" (`README.md:13-20`) não menciona as telas de **Título** e **Catálogo** (existem em
`src/app/itens/[id]/titulo/*` e `src/app/itens/[id]/catalogo/*`). Sem listar o invariante do
`refresh_token` de uso único num `AGENTS.md`, agentes podem quebrá-lo ao refatorar.

## Current state

- README "As cinco telas": Buscar, Check-up, Checklist, Fotos, Descrição. Faltam Título e
  Catálogo (realmente no código: `itens/[id]/titulo/page.tsx`, `itens/[id]/catalogo/Explorador.tsx`).
- README "Estrutura" lista ~15 arquivos; o `src/` real tem muitos mais (ver `src tree` da
  auditoria: `items.ts`, `oauth.ts`, `dono.ts`, `perguntas.ts`, `tendencias.ts`, `tags-novas.ts`,
  `attributes.ts`, `catalogo.ts`, `catalogo-tipos.ts`, `env.ts`, `crypto.ts`, `supabase.ts`,
  `loja.ts`, `ia-tipos.ts`, rotas `api/*`, `login`, `middleware`).
- Não há `AGENTS.md`/`CLAUDE.md` no repo.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**:
- `README.md` (atualizar telas + estrutura; alinhar docs com código)
- `AGENTS.md` (criar — invariantes para agentes)

**Out of scope**:
- Mudar nome/tela de qualquer página no código (só a DOCUMENTAÇÃO).
- NÃO corrigir o `ML_SELLER_ID_PADRAO` aqui (isso é do 010).

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: listar as telas reais

Enumerar `src/app/**/page.tsx` e rotas `src/app/api/**/route.ts` reais e usar isso como base.
Telas esperadas: Busca (`/`), Check-up (`itens/[id]`), Ficha/Checklist (`itens/[id]/ficha`),
Fotos (`itens/[id]/fotos`), Descrição (`itens/[id]/descricao`), Título (`itens/[id]/titulo`),
Catálogo (`itens/[id]/catalogo`), Diagnóstico (`itens/[id]/diagnostico`), Login.

**Verify**: a lista bate com os diretórios de `src/app`.

### Step 2: atualizar "As cinco telas"

Renomear para "As telas" (ou manter nome mas cobrir todas). Inclua Título (reescrita com
Claude) e Catálogo (Explorador de User Product / anúncios do mesmo produto).

**Verify**: cada tela listada tem um diretório correspondente em `src/app`.

### Step 3: atualizar "Estrutura"

Reflita a árvore real: agrupe `src/lib/ml/*` (client, oauth, dono, items, atributos, analise,
catalogo, tendencias, tags*, perguntas, origem), `src/lib/*` (env, crypto, supabase, loja,
ia*, ia-tipos), rotas `src/app/api/*`, `middleware`. Com um comentário por bloco, não
necessariamente arquivo-a-arquivo.

**Verify**: leitor do README consegue localizar cada arquivo citado.

### Step 4: criar `AGENTS.md`

Crie `AGENTS.md` na raiz com os invariantes que agentes NÃO podem quebrar:
- `refresh_token` do ML é **uso único**; NUNCA guardar token em outro lugar senão na tabela
  `contas` (rota compartilhada com os robôs); centralizar refresh.
- Não inventar pixel em imagem (só `proporcional`/`quadrado` na capa).
- Verificação: `npm run verificar`, `npm run typecheck` (009), `npm run build`.
- Convenções: comentários em pt-BR, nomes em pt-BR, `db()` só em server (service_role), nunca
  expor `SUPABASE_SERVICE_ROLE_KEY`/`ANTHROPIC_API_KEY` ao cliente.

**Verify**: `AGENTS.md` existe na raiz.

### Step 5: smoke

**Verify**: `npm run verificar` → exit 0.

## Test plan

- Sem testes novos. Verificação: `npm run build` + `npm run verificar`. (Conferência manual do
  README/AGENTS contra a árvore `src`.)

## Done criteria

- [ ] README lista todas as telas reais (incl. Título, Catálogo)
- [ ] README "Estrutura" reflete a árvore real de `src`
- [ ] `AGENTS.md` criado com os invariantes (token uso-único, `db()` server-only, comandos)
- [ ] `npm run build` e `npm run verificar` passam
- [ ] `plans/README.md` status do 011 = DONE

## STOP conditions

Pare e reporte se:

- Descobrir que uma tela no README descrita como existente não existe no código (avise, mas
  siga alinhando a doc ao código real).
- O `ML_SELLER_ID_PADRAO` conflitar com o valor escolhido no 010 (coordene; não duplique a
  correção).

## Maintenance notes

- Documentação deve refletir o código; quando um plano (ex.: 013) mudar as rotas, atualize o
  README/AGENTS junto.
- O `AGENTS.md` é o lugar certo para manter os invariantes que agentes futuros devem honrar.
