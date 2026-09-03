---
name: Check-up de Anúncio
description: Painel interno de diagnóstico e correção de anúncios do Mercado Livre
colors:
  azul-foco: "#2a78d6"
  azul-foco-suave: "#e8f0fb"
  marfim-neutro: "#f4f4f1"
  marfim-superficie: "#fcfcfb"
  marfim-superficie-funda: "#f0efea"
  tinta: "#0b0b0b"
  tinta-2: "#52514e"
  tinta-3: "#898781"
  linha: "#e1e0d9"
  linha-forte: "#cfcec5"
  status-bom: "#0ca30c"
  status-atencao: "#fab219"
  status-serio: "#ec835a"
  status-critico: "#d03b3b"
  status-bom-texto: "#006300"
  status-atencao-texto: "#7a5300"
  status-critico-texto: "#a52222"
typography:
  headline:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "24px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.07em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  caption:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.9em"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  pill: "999px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.azul-foco}"
    textColor: "#ffffff"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-primary-hover:
    backgroundColor: "{colors.azul-foco}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  button-secondary:
    backgroundColor: "{colors.marfim-superficie}"
    textColor: "{colors.tinta}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
  input:
    backgroundColor: "{colors.marfim-superficie}"
    textColor: "{colors.tinta}"
    typography: "{typography.body}"
    rounded: "{rounded.sm}"
    padding: "9px 11px"
  card:
    backgroundColor: "{colors.marfim-superficie}"
    rounded: "{rounded.lg}"
    padding: "20px 22px"
  chip-bom:
    backgroundColor: "color-mix(in srgb, {colors.status-bom} 12%, transparent)"
    textColor: "{colors.status-bom-texto}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  chip-atencao:
    backgroundColor: "color-mix(in srgb, {colors.status-atencao} 18%, transparent)"
    textColor: "{colors.status-atencao-texto}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
  chip-critico:
    backgroundColor: "color-mix(in srgb, {colors.status-critico} 12%, transparent)"
    textColor: "{colors.status-critico-texto}"
    rounded: "{rounded.pill}"
    padding: "3px 9px"
---

# Design System: Check-up de Anúncio

## Overview

**Creative North Star: "A Prancheta Clínica"**

Este é o sistema visual de uma ferramenta de diagnóstico, não de uma vitrine. Cada tela existe
para responder uma pergunta objetiva — "esse anúncio está saudável?" — e oferecer o caminho
direto pra corrigir o que não está. O fundo é um marfim neutro, quieto, que não compete com o
conteúdo; a tinta é quase preta, de alto contraste; e existe exatamente uma cor de identidade (o
azul foco), usada com rigor só onde marca ação ou link — nunca pra comunicar status. Status tem
sua própria paleta, fixa, redundante com ícone e texto, porque uma prancheta clínica não pode
depender de quem está lendo enxergar cor.

A densidade é alta mas organizada: tabelas, grades de medidores, campos empilhados — sem medo de
mostrar muito número, desde que cada um esteja rotulado e agrupado com clareza. Não há gradientes,
não há ilustração, não há textura decorativa. A personalidade vem da precisão do agrupamento e da
disciplina de cor, não de enfeite.

**Key Characteristics:**
- Fundo marfim quente (nunca branco puro), tinta quase preta, uma única cor de identidade usada com raridade.
- Status nunca é só cor — todo selo carrega ícone + texto (regra de acessibilidade, não estética).
- Cards quase planos, com sombra sutil só pra separar camada — nunca decorativa.
- Densidade alta organizada em grades e tabelas; hierarquia vem de posição e peso, não de tamanho exagerado.
- Zero decoração: sem gradiente, sem ilustração, sem textura.

## Colors

A paleta é funcional antes de ser bonita: uma cor de identidade e uma escala de status fixa que
nunca muda com o tema.

### Primary
- **Azul Foco** (`#2a78d6`): a única cor de identidade do painel. Marca a marca (o ponto ao lado
  do logotipo), links, campo em foco, e o botão de ação principal. Nunca usada pra comunicar
  status — isso é papel exclusivo da paleta de status abaixo.

### Neutral
- **Marfim Neutro** (`#f4f4f1`): fundo da página inteira (`body`). Quente, não branco puro.
- **Marfim Superfície** (`#fcfcfb`): fundo de cards, inputs e do cabeçalho fixo — a camada "acima" do fundo.
- **Marfim Superfície Funda** (`#f0efea`): fundo de código inline, campos desabilitados, trilho de barra/anel — a camada "abaixo", pra reentrâncias.
- **Tinta** (`#0b0b0b`): texto principal, quase preto.
- **Tinta 2** (`#52514e`): texto secundário — legendas de navegação, subtítulos.
- **Tinta 3** (`#898781`): texto terciário — rótulos de seção, texto auxiliar (`small`, `.muted`).
- **Linha** (`#e1e0d9`): divisores e bordas padrão.
- **Linha Forte** (`#cfcec5`): bordas de campos e botões — precisa de mais contraste que um divisor comum.

### Status (funcional, fixo — nunca temático)
- **Verde Bom** (`#0ca30c`, texto `#006300`): tudo certo.
- **Âmbar Atenção** (`#fab219`, texto `#7a5300`): precisa de olhar, não é urgente.
- **Laranja Sério** (`#ec835a`): severidade intermediária entre atenção e crítico — reservada na
  paleta, ainda sem componente usando (ver Do's and Don'ts).
- **Vermelho Crítico** (`#d03b3b`, texto `#a52222`): bloqueia ou derruba — some no ML se não corrigir.

### Named Rules
**The Never-Color-Alone Rule.** Todo indicador de status carrega ícone e texto além da cor
(✓ / ! / × / ›). A paleta de status foi validada pra daltonismo e para impressão em preto e
branco — cor sozinha nunca é a única pista.

**The One Accent Rule.** Azul Foco aparece em ação, identidade e foco de campo — nunca em status.
Se um elemento está comunicando "bom", "atenção" ou "crítico", ele usa a paleta de status, ponto.

## Typography

**Body Font:** `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` (pilha do sistema)
**Mono Font:** `ui-monospace, SFMono-Regular, Menlo, monospace`

**Character:** Uma única família tipográfica faz todo o trabalho — sem serifada, sem fonte de
exibição. A hierarquia vem inteira de peso, tamanho e letter-spacing, com um traço "clínico"
específico: o título de cada seção (`h2`) é deliberadamente pequeno e discreto — a prancheta não
grita, ela organiza.

### Hierarchy
- **Headline** (650, 24px, 1.25, -0.02em): título único de página (`h1`) — aparece uma vez por tela.
- **Title** (600, 15px): subtítulos dentro do conteúdo (`h3`) — nomeiam um bloco dentro de um card.
- **Label** (600, 13px, 0.07em, versalete): título de card/seção (`h2`) — cor `Tinta 3`. Menor que
  o Title mesmo sendo hierarquicamente "acima" dele; é intencional (ver Named Rule abaixo).
- **Body** (400, 15px, 1.55): texto corrido, tabelas, formulários.
- **Caption** (400, 12.5px, 1.45): texto auxiliar, notas de rodapé de card (`small`, `.muted`) — cor `Tinta 3`.
- **Mono** (0.9em inline / 11px em selo): códigos MLB, SKUs, valores técnicos — sempre que o dado é "copiável".

### Named Rules
**The Quiet Titles Rule.** O título de um card/seção nunca é o texto maior da tela — é pequeno,
versalete e da cor `Tinta 3`. Hierarquia visual vem da posição (topo do card) e do agrupamento,
não do tamanho da fonte. Isso mantém o número/valor sendo diagnosticado como a real manchete de
cada bloco.

## Layout

Container único (`.wrap`), largura máxima de 1180px, centralizado, com padding lateral de 24px
(16px em telas até 720px). Cabeçalho fixo (`sticky`) de 56px de altura. Conteúdo organiza-se em
grades responsivas com `auto-fit`/`auto-fill` — nunca breakpoints fixos de coluna: `.grid.k2` (mín.
300px por coluna), `.grid.k4` (mín. 150px), `.medidores` (5 colunas, cai pra 3 em 900px e 2 em
560px), `.fotos` (mín. 170px). Densidade é alta por padrão: gaps de 16px entre cards, mas o
conteúdo interno de cada card respira com 20-22px de padding.

Duas exceções deliberadas ao ritmo: a barra de ações fixa no rodapé (`.salvar`, `position: sticky;
bottom: 0`) garante que a ação de salvar nunca sai da vista mesmo em conteúdo longo; e o padding
inferior do `main` (96px) existe só pra essa barra nunca cobrir o último campo.

## Elevation & Depth

Sistema quase plano: cards e campos flutuam do fundo com uma sombra muito sutil de duas camadas
(`0 1px 2px rgba(11,11,11,.05), 0 4px 12px rgba(11,11,11,.04)`) — o suficiente pra separar camada,
nunca pra parecer "levantado" ou dramático. A separação principal entre elementos vem de cor de
fundo e borda (`--linha`), não de sombra. A barra fixa de salvar usa uma sombra um pouco mais
presente e direcional (`0 -2px 16px rgba(11,11,11,.06)`), porque ela precisa se destacar por
cima do conteúdo que rola por baixo — é a única exceção proposital ao "quase plano".

### Shadow Vocabulary
- **Sombra de card** (`0 1px 2px rgba(11,11,11,.05), 0 4px 12px rgba(11,11,11,.04)`): padrão pra
  `.card` e `.stat` — separação de camada, não drama.
- **Sombra de barra fixa** (`0 -2px 16px rgba(11,11,11,.06)`): só na barra de salvar, sombra
  direcional voltada pra cima, pra se impor sobre o conteúdo que passa por baixo dela ao rolar.

### Named Rules
**The Almost-Flat Rule.** Sombra existe só pra separar camada (fundo vs. card), nunca pra criar
drama ou profundidade dramática. Se dois elementos precisam se diferenciar, a primeira ferramenta
é cor de fundo/borda — sombra é reforço, não a fonte principal de separação.

## Shapes

Cantos arredondados em três passos — pequeno (8px, botões e campos), médio (12px, `.stat` e
elementos internos) e grande (16px, cards e a barra de salvar) — sempre suaves, nunca angulosos e
nunca totalmente retos. Elementos de status e progresso (selos, barra de progresso, faixa de
avaliações) usam cápsula completa (`border-radius: 999px`) — a forma de pílula sinaliza "isso é um
indicador", separado visualmente de conteúdo estrutural (que usa os três raios acima). Bordas são
finas (1px) e usam `--linha`/`--linha-forte`, nunca cor de destaque.

## Components

### Buttons
- **Shape:** cantos pequenos (8px).
- **Secundário (padrão, `.btn`):** fundo `Marfim Superfície`, borda `Linha Forte`, texto `Tinta` —
  é o botão default; a maioria dos botões da tela é secundário.
- **Primário (`.btn.primary`):** fundo e borda `Azul Foco`, texto branco — reservado pra ação
  principal de cada tela (ex.: "Abrir", "Salvar").
- **Hover:** secundário escurece pro fundo `Marfim Superfície Funda`; primário ganha
  `filter: brightness(1.08)` mantendo a mesma cor base — nunca troca de matiz.
- **Disabled:** opacidade 0.45, cursor `not-allowed`, sem mudança de cor.
- **Tamanho pequeno (`.btn.pequeno`):** padding 5px 10px, fonte 13px — usado em linhas de tabela.

### Chips / Selos (indicador de status)
- **Style:** cápsula (999px), fundo tonal (`color-mix` a 12-18% da cor de status), texto na
  variante "tinta" mais escura/legível da mesma cor — nunca a cor pura de status como texto.
- **Ícone obrigatório:** ✓ (bom) / ! (atenção) / × (crítico) / › (acento) / · (neutro) — exceto
  quando `semIcone` é passado explicitamente (ex.: dentro de uma tabela já densa em selos).
- **Variante mono:** fonte monoespaçada, 11px — pra códigos (MLB, SKU) dentro de um selo.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** `Marfim Superfície`.
- **Shadow Strategy:** sombra de card (ver Elevation & Depth); variante `.card.plano` remove a
  sombra quando o card está dentro de outro card.
- **Border:** 1px `Linha`.
- **Internal Padding:** 20px 22px.
- **Variante recolhível (`.card.dobra`):** usa `<details>`/`<summary>` nativo — abre/fecha sem
  JavaScript, navegável por teclado. O título fica na `summary`, com uma seta (›) que gira 90°
  quando aberto.

### Inputs / Fields
- **Style:** fundo `Marfim Superfície`, borda `Linha Forte` (1px), cantos pequenos (8px).
- **Focus:** contorno (`outline`) de 2px na cor `Azul Foco` a 45% de opacidade, deslocado 1px pra
  fora, mais a borda ganhando `Azul Foco` sólido — dois sinais de foco ao mesmo tempo, não só um.
- **Disabled:** fundo `Marfim Superfície Funda`, texto `Tinta 3`.

### Navigation
- Cabeçalho fixo (`sticky top: 0`), fundo `Marfim Superfície`, borda inferior `Linha`. Marca à
  esquerda (peso 650, ponto azul de 8px ao lado do nome); links de navegação à direita, cor
  `Tinta 2` em repouso, `Tinta` no hover, sem sublinhado em nenhum dos dois estados.

### Anéis e medidores (componente de assinatura)
Anel de progresso SVG com o número grande centralizado — é manchete, não gráfico: sem eixo, sem
grade, sem legenda de eixo. A cor do traço muda por nível (bom/atenção/crítico) usando a mesma
paleta de status dos selos, então um anel e um selo nunca discordam sobre o que "vermelho"
significa. Versão grande (`Anel`, 104px) pra destaque único; versão pequena (`Medidor`, 76px) em
grade de até 5 colunas pra comparar várias dimensões lado a lado.

## Do's and Don'ts

### Do:
- **Do** usar a paleta de status (bom/atenção/sério/crítico) pra qualquer novo indicador de saúde
  do anúncio — nunca inventar uma cor nova pra "mais um nível".
- **Do** acompanhar todo selo/indicador de cor com ícone e texto (The Never-Color-Alone Rule).
- **Do** manter títulos de seção pequenos e discretos (The Quiet Titles Rule) — o dado é a manchete, não o rótulo.
- **Do** usar cápsula (999px) pra qualquer elemento que seja um indicador, e os três raios (8/12/16px) pra qualquer elemento estrutural.

### Don't:
- **Don't** usar Azul Foco pra comunicar status — ele é só identidade/ação/foco.
- **Don't** adicionar sombra decorativa; sombra existe só pra separar camada (The Almost-Flat Rule).
- **Don't** usar `Laranja Sério` (`#ec835a`) num componente novo sem antes decidir onde essa
  severidade intermediária se encaixa na escala bom→atenção→crítico já implementada — hoje ela
  está reservada na paleta mas nenhum componente a usa.
- **Don't** introduzir uma segunda família tipográfica ou fonte de exibição — a hierarquia inteira
  vem de peso/tamanho/letter-spacing dentro de uma única pilha de sistema.
