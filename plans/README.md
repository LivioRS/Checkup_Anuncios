# Implementation Plans

Gerado pela skill `improve` em 2026-08-28 sobre `checkup-anuncio` (Next.js 15 App Router,
TypeScript, Supabase + API Mercado Livre + Anthropic + sharp).

> **Nota sobre este repo**: não é um repositório git (não há `.git`), então os planos não
> estampam SHA de commit e o "drift check" do template não se aplica via git. Em vez disso,
> cada executor deve confirmar visualmente que os trechos de "Current state" continuam batendo
> com o arquivo vivo antes de editar (os trechos trazem referências `file:line`). Não crie um
> repositório git como parte destes planos.

Execute na ordem abaixo, respeitando dependências. Leia o plano inteiro antes de começar,
obedeça às STOP conditions e atualize a coluna Status quando terminar.

## Execution order & status

| Plan | Título | Prio | Esf. | Depende de | Status |
|------|--------|------|------|-----------|--------|
| 001  | Baseline de verificação + harness de testes de token/mutação | P1 | L | — | DONE |
| 002  | Corrigir corrida do refresh de token (uso único) | P1 | M | 001 | DONE |
| 003  | Endurecer auth do painel (open redirect + cookie + rate-limit) | P1 | M | — | DONE |
| 004  | Limitar download/decodificação de imagem antes do sharp | P2 | S | — | DONE |
| 005  | Sanitizar termo de busca no filtro PostgREST (investigar) | P2 | S | — | DONE |
| 006  | Memoizar conta por request + reusar item no check-up | P2 | M | 001 | DONE |
| 007  | Paralelizar diagnóstico/baixas de imagem | P2 | S | — | DONE |
| 008  | Tornar cache de categoria efetivo sob force-dynamic | P2 | M | 006 | DONE |
| 009  | Corrigir lint + adicionar script typecheck | P2 | S | — | DONE |
| 010  | Colapsar arquivos-env/gitignore duplicados + alinhar seller padrão | P3 | S | — | DONE |
| 011  | Atualizar README para o código + adicionar AGENTS.md | P3 | S | — | DONE |
| 012  | Extrair um único utilitário de normalização de texto | P3 | S | 001 | DONE |
| 013  | Consolidar guarda de dono + log `ficha_edits` das rotas de escrita | P3 | M | 001, 011 | IN PROGRESS |
| 014  | Podar/redigir payloads de erro antes de devolver ao cliente | P3 | S | — | TODO |
| 015  | Extrair formatadores compartilhados da god page | P3 | M | 001 | TODO |
| 016  | Tela de histórico/auditoria sobre `ficha_edits` (spike) | P2 | M | 013 | TODO |
| 017  | Fechar o loop de `tags_novas.significado` na UI (spike) | P3 | M | — | TODO |
| 018  | Worklist local "por fazer" sobre `repricer_status_ml` (spike) | P3 | M | — | TODO |

## Dependency notes

- **001 primeiro**: os refactors mais arriscados (002, 006, 012, 013, 015) exigem rede de
  regressão — o `npm run verificar` atual não cobre token, refresh, nem as rotas de mutação.
  Plano 002 (corrida do token) e 001 (testes de token) devem andar juntos; 002 depende de 001.
- **006 antes de 008**: o cache de categoria (008) depende da conta ser resolvida/memoizada
  uma vez por request (006), para a chave do cache poder ser por-conta.
- **013 antes de 016**: a tela de histórico (016) lê `ficha_edits`; consolidar o helper de
  escrita (013) primeiro garante um formato único de log que 016 consome.
- **001/011 antes de 013**: 013 mexe no comportamento documentado; 011 fixa a documentação
  que 013 deve preservar.

## Findings considered and rejected

- **REJEITADO — "testar o copy" (TEST-02 tautologias em `verificar-ficha.mjs`) como plano
  próprio**: será tratado como parte de 001 (o harness novo substitui a duplicação de lógica
  por imports reais). Não é um plano separado.
- **REJEITADO — split completo da god page `itens/[id]/page.tsx` (DEBT-06 integral)**: o plano
  015 limita-se a extrair os formatadores/helpers compartilhados (menor risco). Decompor a
  tela em componentes por seção fica como follow-up explícito dentro de 015, não num plano
  próprio, porque exige caracterização visual prévia em massa (fora do escopo read-only).
- **REJEITADO — `next` 15.5 vs React 19 exact-pin**: pinagem intencional; risco de upgrade
  baixo. Não é finding.
- **REJEITADO — chamada Anthropic via fetch em vez de SDK**: intencional e documentado no
  README ("Claude opcional"); o que importa é o formato de erro divergente, coberto em 014.
- **REJEITADO — resposta 503/erro raw do ML (CORR-02 parte "ML error body") como plano de
  segurança separado**: coberto em 014 (podagem de erro), sem plano próprio.
