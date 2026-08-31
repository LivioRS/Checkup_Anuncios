# Check-up de Anúncio — Mercado Livre

Painel web para analisar e corrigir anúncios do Mercado Livre, **um por vez**: ficha técnica, fotos, descrição, tags, tarifas e reputação — com as correções gravadas de volta na API oficial.

Encaixa no projeto Supabase **dashboard-mercadolivre** que já existe: usa a tabela `contas` para os tokens e a `repricer_status_ml` para a busca.

Stack: Next.js 15 (App Router, TypeScript) + Supabase + Claude (opcional).

---

## As telas

| Tela | Rota | O que faz |
|---|---|---|
| **Buscar** | `/` | Cola o MLB, o link do anúncio, ou busca por título/SKU. Seletor entre as contas |
| **Check-up** | `/itens/[id]/diagnostico` | Nota do ML por dimensão, números de 150 dias, tarifas, envio, reputação, tags, moderação |
| **Ficha / Checklist** | `/itens/[id]/ficha` | Todos os atributos da categoria, com o que bloqueia publicação separado do que custa exposição |
| **Título** | `/itens/[id]/titulo` | Reescrita com Claude, respeitando limite de caracteres e termos buscados |
| **Catálogo** | `/itens/[id]/catalogo` | Explorador de User Products / anúncios do mesmo produto |
| **Fotos** | `/itens/[id]/fotos` | Galeria, diagnóstico oficial de imagem e as duas correções |
| **Descrição** | `/itens/[id]/descricao` | Dez notas do Claude, reescrita com base na ficha e nas avaliações, blocos fixos da loja |
| **Login** | `/login` | Senha única do painel (middleware falha fechado em produção) |

---

## Como rodar

### macOS

```bash
npm install
npm run verificar   # testes da lógica, sem tocar na API
npm run dev         # http://localhost:3000
```

### Windows

Se o PowerShell recusar com "execução de scripts foi desabilitada", use `npm.cmd` no lugar de `npm`, ou abra o Prompt de Comando. É um bloqueio do Windows a scripts `.ps1`, não do projeto.

Não há fluxo OAuth aqui, então **funciona em localhost sem HTTPS e sem túnel**.

---

## Configuração

### 1. Supabase

Rode `supabase/schema.sql` no projeto **dashboard-mercadolivre**. Ele cria duas tabelas:

- `ficha_edits` — log de tudo que o painel gravou no ML (payload, valores anteriores, resposta)
- `loja_blocos` — os textos fixos de "sobre a loja" e "garantia", por conta

Não encosta na `contas` nem em nada existente.

### 2. `.env.local`

```
ML_CLIENT_ID=              # o mesmo dos robôs
ML_CLIENT_SECRET=          # o mesmo dos robôs
ML_SELLER_ID_PADRAO=177795203
SUPABASE_URL=https://szrrrnelgozeizmbtivm.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
PANEL_PASSWORD=

# Opcional — só a análise e a reescrita de descrição dependem disso
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-4-5
```

O `.env.local` **não vem no zip**. Ao trocar de máquina, recrie a partir do `.env.example`.

---

## Encaixe com o que já existe

### Tokens: tabela `contas`

O painel lê `seller_id`, `access_token`, `refresh_token` e `access_expira_em` da `contas`, e quando renova grava o par novo na mesma linha.

Isso é obrigatório, não preferência: **o `refresh_token` do ML é de uso único por client_id + usuário**, e no Brasil só se pode ter 1 aplicação por conta. Se o painel guardasse tokens em outro lugar, a primeira renovação dele invalidaria o token que o `puxador` e o `repricer_piloto` têm na mão.

Por isso o painel **não faz autorização**: não tem tela de conectar, não usa `ml_oauth_pendente`, não precisa de redirect URI no DevCenter.

### Busca: `repricer_status_ml` primeiro

Buscar por texto consulta `repricer_status_ml` no Supabase — zero chamadas ao ML. Só recorre à API se não achar. Colar o código ou o link não faz busca nenhuma.

### Custo por anúncio

| Ação | Chamadas ao ML |
|---|---|
| Abrir o checklist | 3 (item + atributos + ficha da categoria) |
| Outro anúncio da mesma categoria | 1 (categoria fica em cache 24 h) |
| Check-up completo | ~10, cada bloco falhando sozinho |
| Diagnosticar imagens | 1 por foto, só quando pedido |
| Salvar | 2 |

---

## Decisões que valem conhecer

**Fotos.** Duas operações separadas, nenhuma inventa pixel. *Redimensionar* reescala mantendo a proporção. *Quadrado com fundo branco* aparece só na capa e só quando o próprio ML apontar `white_background` naquela categoria — a rota recusa se tentarem forçar em outra foto. Texto, logo e marca d'água o ML aponta, mas corrigir exigiria redesenhar a arte.

**Descrição.** A nota é do Claude, não do ML — o `/performance` não mede descrição. A reescrita recebe a ficha técnica, as avaliações reais dos compradores e os pontos fracos da análise, e é proibida de inventar característica que não esteja na ficha. Os blocos da loja são repetidos sem reescrita.

**Qualidade de imagem.** Usa o campo `quality` que a API devolve; quando não vem, calcula o aproveitamento de tamanho e a tela diz que a conta é nossa. Esse campo não está na documentação pública.

**Conversão.** Não existe na API para anúncio orgânico. É calculada aqui (pedidos ÷ visitas) e a tela diz isso.

---

## Estrutura

```
src/app/page.tsx                      busca + seletor de conta
src/app/login/page.tsx                tela de login (senha)
src/app/itens/[id]/page.tsx           checklist de atributos (ficha)
src/app/itens/[id]/diagnostico/       check-up completo
src/app/itens/[id]/fotos/             galeria e correção de imagem
src/app/itens/[id]/fotos/page.tsx
src/app/itens/[id]/fotos/Galeria.tsx
src/app/itens/[id]/descricao/         análise e reescrita
src/app/itens/[id]/descricao/page.tsx
src/app/itens/[id]/descricao/EditorDescricao.tsx
src/app/itens/[id]/titulo/            reescrita de título
src/app/itens/[id]/titulo/page.tsx
src/app/itens/[id]/titulo/EditorTitulo.tsx
src/app/itens/[id]/ficha/             ficha técnica / checklist
src/app/itens/[id]/ficha/page.tsx
src/app/itens/[id]/ficha/FichaForm.tsx
src/app/itens/[id]/catalogo/          explorador de User Products
src/app/itens/[id]/catalogo/page.tsx
src/app/itens/[id]/catalogo/Explorador.tsx
src/app/itens/[id]/diagnostico/       check-up completo
src/app/itens/[id]/diagnostico/page.tsx
src/app/itens/[id]/BotaoCorrigir.tsx  botão genérico de correção
src/app/itens/[id]/Falhas.tsx         painel de erros
src/app/api/                          rotas que gravam no ML
  api/blocos/route.ts                 blocos da loja (sobre/garantia)
  api/catalogo/[id]/route.ts          busca catálogo
  api/catalogo/[id]/vincular/route.ts vincular anúncio a catálogo
  api/descricao/[id]/route.ts         PUT descrição
  api/imagens/[id]/route.ts           GET diagnóstico / PUT correção imagem
  api/itens/[id]/route.ts             PUT ficha/atributos
  api/panel-login/route.ts            login + cookie assinado
  api/titulo/[id]/route.ts            PUT título
src/components/ui.tsx                 anéis, medidores, selos, seções, formatadores
src/components/Tags.tsx               dicionário de tags
src/lib/ml/model.ts                   tipos + buildFicha + parseItemId (puro, testável)
src/lib/ml/analise.ts                 coleta do check-up (paralelizado)
src/lib/ml/client.ts                  tokens na `contas` + refresh automático + memoização
src/lib/ml/oauth.ts                   refresh de token OAuth
src/lib/ml/dono.ts                    resolução de dono do anúncio
src/lib/ml/items.ts                   busca local + API
src/lib/ml/tags.ts                    dicionário 89 tags anúncio + 27 vendedor
src/lib/ml/tags-novas.ts              registro de tags desconhecidas
src/lib/ml/attributes.ts              atributos/ficha da categoria (cache TTL)
src/lib/ml/catalogo.ts                busca catálogo
src/lib/ml/catalogo-tipos.ts          tipos catálogo
src/lib/ml/perguntas.ts               agrupamento de perguntas
src/lib/ml/tendencias.ts              tendências de busca
src/lib/ml/origem.ts                  resolução de campo Origem
src/lib/ml/dono.ts                    verificação de propriedade
src/lib/ia.ts                         prompts e leitura das notas (Claude)
src/lib/ia-tipos.ts                   tipos e montagem de modelo/título
src/lib/loja.ts                       blocos fixos da loja
src/lib/supabase.ts                   cliente Supabase admin
src/lib/env.ts                        variáveis de ambiente (validação)
src/lib/crypto.ts                     hash, HMAC, assinatura de sessão
src/components/Tags.tsx               dicionário de tags
supabase/schema.sql                   tabelas `ficha_edits` + `loja_blocos`
scripts/verificar-ficha.mjs           testes de lógica pura
```

---

## Limitações conhecidas

- **Variações não são editadas** — precisam ir por `attribute_combinations`.
- **`conditional_required`** é sinalizado, mas ainda não confirmado via `POST /categories/{id}/attributes/conditional`.
- **Anúncios de terceiros**: item, ficha, fotos, descrição, opiniões e tarifas são públicos e funcionam. Nota de qualidade, moderação, infrações e vendas exigem ser o dono — esses blocos aparecem vazios.
- **Concorrência com os robôs**: se um robô renovar o token no mesmo instante que o painel, um dos dois pega `invalid_grant`. Resolve recarregando; some se o refresh for centralizado num único ponto.

## Publicar na Vercel

O painel é um app Next.js comum: sobe na Vercel sem adaptação. O plano gratuito
dá conta — o uso é você abrindo um anúncio por vez, não tráfego de loja.

### 1. Subir o código

Na pasta do projeto:

    npx vercel

Ele pergunta poucas coisas (login, nome do projeto, "in which directory is your
code" → Enter). Não precisa de GitHub. O `.env.local` NÃO sobe: está no
`.gitignore` e a CLI ignora arquivos `.env`.

### 2. Configurar as variáveis

No painel da Vercel, em Settings → Environment Variables, crie as mesmas do
`.env.local`, marcando Production e Preview:

- `ML_CLIENT_ID`, `ML_CLIENT_SECRET`
- `ML_SELLER_ID_PADRAO`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `PANEL_PASSWORD`  ← obrigatória em produção
- `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`

Depois: `npx vercel --prod`.

### Por que a senha é obrigatória em produção

O painel grava em anúncio de verdade — título, ficha, descrição, fotos. Em
`localhost` só você alcança; publicado, o endereço é público. Por isso o
middleware falha fechado: sem `PANEL_PASSWORD`, produção responde 503 em vez de
abrir o painel. Use uma senha longa; é o único portão.

### O que muda em relação ao localhost

- Nada de OAuth novo: os tokens continuam vindo da tabela `contas` do Supabase.
- As rotas de IA e de imagem têm teto de 60 s no plano gratuito (300 s no Pro).
- O Supabase é o mesmo banco, então o histórico e os blocos da loja seguem lá.
