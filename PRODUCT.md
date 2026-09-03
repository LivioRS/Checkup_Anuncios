# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Livio, sozinho — opera várias contas próprias do Mercado Livre (ex.: Ponto Musical, Irmãos
Brothers, SHINNISHI) através de um painel com senha única (`PANEL_PASSWORD`). Não há
multiusuário nem clientes externos usando o painel hoje.

## Product Purpose

Painel interno para analisar e corrigir anúncios do Mercado Livre um por vez — ficha técnica,
fotos, descrição, tags, tarifas e reputação — com as correções gravadas de volta na API oficial
do Mercado Livre. Existe para acelerar e centralizar o trabalho manual de manter anúncios
saudáveis nas contas próprias que Livio opera. Sucesso é a correção realmente aplicada no
anúncio via API, não apenas um relatório apontando o problema.

## Positioning

O diferencial mais significativo é escrever direto na API do Mercado Livre — o painel não é um
relatório passivo, ele grava a correção de volta no anúncio de verdade. Isso vem combinado com
diagnóstico por dimensão (nota do ML, números de 150 dias, tarifas, envio, reputação, tags,
moderação) num só lugar, e reescrita assistida por IA (Claude) de título e descrição respeitando
os limites de caractere e as regras do Mercado Livre.

## Operating Context

Painel único, senha compartilhada, sem contas de usuário individuais hoje. Opera sobre contas
próprias do Mercado Livre já autorizadas pelos robôs do `dashboard-ml-bot` — o painel não faz o
fluxo de autorização OAuth, só o refresh do `access_token` quando ele vence durante o uso (dura
6h). Tokens e contas ficam na tabela `contas` do projeto Supabase compartilhado
`dashboard-mercadolivre`, a mesma fonte usada pelos robôs.

Fluxo típico: colar o código MLB, o link do anúncio, ou buscar por título/SKU → abrir o anúncio →
percorrer as telas (diagnóstico, ficha/checklist, título, catálogo, fotos, descrição) → aplicar
as correções, que são gravadas de volta no Mercado Livre.

## Capabilities and Constraints

- Escreve diretamente na API do Mercado Livre — não é só leitura/diagnóstico.
- O `refresh_token` do ML é de uso único; só um app pode manter tokens válidos por conta vendedora
  no Brasil.
- `access_token` dura 6h; o painel roda hoje sem fluxo OAuth próprio, em localhost sem HTTPS/túnel.
- Cache de atributos de categoria com TTL de 24h por seller.
- Teto de 15MB e 8192² pixels para imagens processadas.
- Rate-limit no login (10 requisições / 15 min por IP).
- Em evolução arquitetural (fora do escopo deste produto): a lógica de análise já está isolada de
  Supabase, preparando o terreno para um futuro portal multi-cliente — mas esse portal é, por
  decisão deste PRODUCT.md, um produto separado, a documentar quando existir de verdade.

## Brand Commitments

Nome do produto: "Check-up de Anúncio". Cor de destaque `#2a78d6` (já definida como `themeColor`
no layout). Nenhum outro compromisso de marca (voz, tom, ativos) confirmado até aqui.

## Evidence on Hand

Contas reais já operadas pelo painel: Ponto Musical, Irmãos Brothers, SHINNISHI (seller
`2490900`, app ML `checkup-anuncios`). Não há depoimentos, estudos de caso ou dados de terceiros
a preservar — uso é interno, sem prova social para fabricar.

## Product Principles

1. Correção de verdade, não só diagnóstico — toda tela que aponta um problema também oferece o
   caminho de corrigir e gravar na API.
2. Uma conta, um anúncio de cada vez — o painel não opera em lote hoje; o foco é profundidade por
   anúncio, não volume.
3. IA assiste, não decide sozinha — reescritas de título/descrição são sugestões respeitando as
   regras do ML, revisadas antes de aplicar.
4. Uma única fonte de verdade para tokens — sempre a tabela `contas` dos robôs; nunca guardar
   token em outro lugar.
