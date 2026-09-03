---
name: Check-up de Anúncio — Sobre o produto
description: Landing comercial isolada ("Sobre o produto") para uma ferramenta interna de check-up de anúncios do Mercado Livre.
colors:
  hero-deep-navy: "#0b1e4d"
  hero-mid-blue: "#163e8c"
  hero-bright-blue: "#2a78d6"
  hero-sky-glow: "rgba(56, 189, 248, 0.35)"
  hero-ink: "#f5f8ff"
  hero-body-blue: "#d7e4fb"
  hero-faixa-blue: "#cfe0fa"
  hero-kicker-blue: "#bcd6ff"
  hero-check-green: "#6fe3a8"
  cta-amber-light: "#ffc751"
  cta-amber-dark: "#ffb020"
  cta-amber-headline: "#ffd27a"
  cta-ink: "#201200"
  acento: "#2a78d6"
  acento-suave: "#e8f0fb"
  tinta: "#0b0b0b"
  tinta-2: "#52514e"
  tinta-3: "#898781"
  superficie: "#fcfcfb"
  superficie-2: "#f0efea"
  linha: "#e1e0d9"
  bom: "#0ca30c"
  bom-tinta: "#006300"
typography:
  hero-display:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "clamp(32px, 5vw, 48px)"
    fontWeight: 700
    lineHeight: 1.12
    letterSpacing: "-0.02em"
  section-title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.01em"
  section-kicker:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "12.5px"
    fontWeight: 650
    lineHeight: 1.4
    letterSpacing: "0.07em"
  body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15.5px"
    fontWeight: 400
    lineHeight: 1.6
  card-title:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15.5px"
    fontWeight: 650
    lineHeight: 1.4
  card-body:
    fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13.8px"
    fontWeight: 400
    lineHeight: 1.58
rounded:
  chip: "999px"
  button: "11px"
  icon-tile: "10px"
  icon-tile-lg: "11px"
  card: "16px"
  cta-band: "24px"
spacing:
  section-y: "72px"
  section-y-mobile: "52px"
  section-x: "24px"
  hero-y: "72px 88px"
  hero-y-mobile: "56px 64px"
  grid-gap: "18px"
  passos-gap: "28px"
  confianca-gap: "30px"
  cabecalho-bottom: "44px"
components:
  button-primary:
    backgroundColor: "{colors.cta-amber-light}"
    textColor: "{colors.cta-ink}"
    rounded: "{rounded.button}"
    padding: "13px 24px"
  button-primary-hover:
    backgroundColor: "{colors.cta-amber-dark}"
  button-secondary:
    backgroundColor: "rgba(255, 255, 255, 0.06)"
    textColor: "{colors.hero-ink}"
    rounded: "{rounded.button}"
    padding: "13px 24px"
  feature-card:
    backgroundColor: "{colors.superficie}"
    textColor: "{colors.tinta}"
    rounded: "{rounded.card}"
    padding: "24px 22px"
  kicker-pill:
    backgroundColor: "rgba(255, 255, 255, 0.08)"
    textColor: "{colors.hero-kicker-blue}"
    rounded: "{rounded.chip}"
    padding: "6px 14px"
---

# Design System: Check-up de Anúncio — Sobre o produto

## Overview

**Creative North Star: "The Trust Console with a Sales Banner Bolted On"**

This file documents only the CSS Module at `src/app/produto/produto.module.css` and the markup at `src/app/produto/page.tsx`. It is deliberately isolated from the rest of the panel: the module's classes (`.pagina`, `.hero`, `.secao`, `.cartao`, `.btnPrimario`, etc.) do not collide with and are not shared by the panel's global classes (`.card`, `.grid`, `.btn`, `.selo` in `globals.css`). The only bridge between the two systems is a shared set of CSS custom properties — `--tinta`, `--tinta-2`, `--tinta-3`, `--acento`, `--acento-suave`, `--superficie`, `--superficie-2`, `--linha`, `--sombra`, `--bom`, `--bom-tinta` — defined once in `globals.css` and consumed by the landing page for its neutral sections.

The shipped page runs two visual registers side by side. The hero and the final CTA band are a self-contained "own-world" gradient banner (`#0b1e4d → #163e8c → #2a78d6`, amber CTA) that never appears in the rest of the panel — it exists only in the landing page, hardcoded as literal hex values rather than tokens. Every other section (feature grid, numbered steps, trust band, footer) drops back onto the panel's inherited neutral tokens (`--superficie`, `--tinta`, `--linha`, `--acento`) so the page still reads as the same product once you scroll past the banner. The build's own comment names this intentionally: "paleta própria, isolada via CSS Module pra não colidir com as classes do painel interno."

Density is generous compared to the rest of the panel (which runs a dense, data-table register at 13-15px body text and tight 8-16px gaps): the landing page uses 72px section padding, 18-30px grid gaps, and a 620-780px max-width for centered header blocks. It is a marketing register nested inside an otherwise operational tool.

**Key Characteristics:**
- Two coexisting palettes: a hardcoded deep-blue-to-amber gradient world for the hero/CTA bookends, and the inherited neutral/acento tokens for the body sections.
- Centered, generous marketing rhythm (72px section padding, 620-780px header measure) contrasting with the panel's dense operational default.
- A single reused header pattern (kicker / title / sub) driving three of the five sections.
- One breakpoint (640px) covering the whole page.

## Colors

The palette runs two tracks: a bespoke gradient world scoped to the hero and final CTA band, and the panel's inherited neutral/status tokens carrying every section in between.

### Primary
- **Hero Deep Navy → Bright Blue** (`#0b1e4d` → `#163e8c` → `#2a78d6`): the 135deg linear-gradient background of `.hero` and `.ctaFinal`. Hardcoded literal hex, not a token — this gradient exists nowhere else in the codebase. Layered under a radial `rgba(56, 189, 248, 0.35)` sky-glow highlight at the hero's top-right.
- **CTA Amber** (`#ffc751` → `#ffb020`, 180deg gradient): background of `.btnPrimario`, the only warm color in the system. Paired with dark ink text (`#201200`) for contrast, and a matching soft amber glow shadow (`0 8px 20px rgba(255, 176, 32, 0.35)`).
- **Acento** (`#2a78d6`, `var(--acento)`): inherited panel token. Used for section kickers, the numbered-step tiles (`.passoNumero`), and feature-icon tiles once the page leaves the gradient hero. Same blue family as the hero's brightest stop, keeping the two registers related.

### Neutral
- **Hero Ink** (`#f5f8ff`): heading/label text on the dark gradient hero and CTA band.
- **Hero Body Blue** (`#d7e4fb`): paragraph text on the dark gradient sections.
- **Tinta / Tinta-2 / Tinta-3** (`#0b0b0b` / `#52514e` / `#898781`, inherited): heading, body, and footnote text respectively on the light neutral sections.
- **Superfície / Superfície-2** (`#fcfcfb` / `#f0efea`, inherited): card background and the trust-band section background.
- **Linha** (`#e1e0d9`, inherited): card borders and the trust band's top/bottom hairlines.

### Named Rules
**The Two-World Rule.** The gradient hero/CTA palette is hardcoded and scoped only to `.hero` and `.ctaFinal`; every other section uses the panel's inherited `var(--...)` tokens. Do not introduce a third palette — new sections belong to one of these two existing worlds, not a new one.
**The Status-Color Silence Rule.** The landing page never uses `--bom`/`--atencao`/`--critico` for state (those are the panel's data-validation vocabulary). Its one use of `--bom-tinta`/`--bom` (the trust-band icon tiles) is decorative reassurance, not a status signal — don't extend it into a red/amber/green language on this page.

## Typography

**Display/Body Font:** `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` (inherited from `globals.css`'s `body` rule; the module defines no font-family of its own).

**Character:** A single system-font stack carries every weight from hero display down to footnote — hierarchy is built entirely with size, weight, and letter-spacing, never a second family.

### Hierarchy
- **Hero Display** (700, `clamp(32px, 5vw, 48px)`, line-height 1.12, letter-spacing -0.02em): the `<h1>` in `.heroTitulo`. The emphasized word inside it (`<em>`) is rendered non-italic with an amber gradient text-fill (`#ffd27a → #ffb020`) instead of italics.
- **Section Title** (700, 28px, line-height 1.25, letter-spacing -0.01em, `text-transform: none`): `.secaoTitulo`, used identically in the feature-grid, steps, and trust-band headers. Deliberately overrides the global `h2` rule, which is uppercase 13px — see the gotcha note below.
- **Section Kicker / Eyebrow-style Label** (650, 12.5px, letter-spacing 0.07em, uppercase): `.secaoKicker` and the hero `.kicker` pill. This is the one uppercase, wide-tracking label in the system — see the incumbent gotcha note.
- **Section Sub** (400, 15.5px, line-height 1.6): `.secaoSub`, centered, 620px max-width.
- **Card Title** (650, 15.5px): `.cartao h3`.
- **Card Body** (400, 13.8px, line-height 1.58): `.cartao p`.
- **Footer/Disclaimer** (400, 12.5px, line-height 1.6): `.rodape`, the smallest text on the page.

### Named Rules
**The h2-Override Rule.** `globals.css` sets a global `h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.07em; color: var(--tinta-3); }` for the panel's dense data-table register. `produto.module.css` deliberately overrides this on `.secaoTitulo` and `.ctaFinal h2` (`text-transform: none`, 26-28px, `var(--tinta)` or `#f5f8ff`) so the landing page's headings read as marketing titles, not panel section labels. Anyone editing this file should keep the explicit override rather than relying on the global default.

## Layout

`.secao` is the shared content container: `max-width: 1180px`, centered, `padding: 72px 24px` (52px 20px under 640px). `.secaoCabecalho` centers a 620px-max header block above each section's content, 44px bottom margin.

**Full-bleed breakout.** `.pagina` deliberately escapes the root layout's `.wrap` container (1180px max-width, defined in `layout.tsx`/`globals.css`) using the negative-margin viewport technique: `margin-left/right: calc(50% - 50vw); width: 100vw; max-width: 100vw;`. It also cancels the `<main class="wrap">` container's `padding-top` with `margin-top: -28px` so the hero band sits flush against the sticky header instead of leaving a gap. This is the only place in the codebase this technique is used — it exists because the hero and CTA bands need to paint full-viewport-width gradients while the rest of the panel stays inside the 1180px `.wrap`.

**Feature grid sizing.** `.grid` uses `grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))` for the 6 feature cards. The 320px minimum (wider than the panel's own `.grid.k2` 300px or `.grid.k4` 150px) was tuned so 6 cards resolve to a clean 3-column layout at desktop widths without producing an orphaned single card in a trailing row — narrower minimums would allow a 4-column fit that leaves 2 cards stranded on the last row.
**Steps grid** (`.passos`): `repeat(auto-fit, minmax(220px, 1fr))`, 28px gap, 3 items.
**Trust grid** (`.confiancaGrid`): `repeat(auto-fit, minmax(240px, 1fr))`, 30px gap, `align-items: start`, 3 items.

**Responsive behavior.** One breakpoint, `@media (max-width: 640px)`: `.secao` padding drops from 72px to 52px vertical (24px→20px horizontal), `.hero` padding drops from `72px 24px 88px` to `56px 18px 64px`. All grids are already fluid via `auto-fit`/`minmax` and need no explicit mobile override; they reflow to 1-2 columns naturally as the viewport narrows.

## Elevation & Depth

Flat by default with one soft shadow role, reused verbatim from the panel's `--sombra` token (`0 1px 2px rgba(11,11,11,0.05), 0 4px 12px rgba(11,11,11,0.04)`) on `.cartao`. The gradient hero and CTA band use no shadow — their depth comes from the radial sky-glow highlight and the gradient itself, not box-shadow. The primary CTA button carries its own colored glow (`0 8px 20px rgba(255,176,32,0.35)`, intensifying to `0 10px 24px rgba(255,176,32,0.45)` on hover) rather than a neutral shadow — the one place the page uses shadow as a colored accent instead of ambient elevation.

### Shadow Vocabulary
- **Card shadow** (`var(--sombra)`, inherited): `.cartao`. Ambient, not interactive — no hover state.
- **CTA glow** (`0 8px 20px rgba(255, 176, 32, 0.35)` → hover `0 10px 24px rgba(255, 176, 32, 0.45)`): `.btnPrimario`. The only shadow that responds to state.

## Shapes

Rounded throughout, radius scaling with element size: pill shapes (`999px`) for the hero kicker badge; `11px` for buttons and the confidence-icon tiles; `10px` for the numbered-step tiles; `16px` for feature cards; `24px` for the full-width CTA band (the largest radius on the page, matching its role as a standalone banner). No hard edges or borders on the gradient hero/CTA elements; light 1px borders (`var(--linha)`) appear only on the neutral-section cards and the trust band's top/bottom rules.

## Components

### Buttons
- **Shape:** 11px radius, `13px 24px` padding, `inline-flex` with 8px icon gap.
- **Primary:** amber gradient background (`#ffc751 → #ffb020`), dark ink text (`#201200`), amber glow shadow. Hover: `translateY(-1px)` plus a stronger glow. Used for both hero and final-CTA "Abrir o painel" actions — the only button style repeated across sections.
- **Secondary:** translucent white fill (`rgba(255,255,255,0.06)`) with a `1px solid rgba(255,255,255,0.28)` border, white text — only legible against the dark hero, so it does not appear outside `.hero`.

### Cards (feature grid)
- **Corner Style:** 16px radius.
- **Background:** `var(--superficie)`.
- **Shadow Strategy:** `var(--sombra)` ambient card shadow (see Elevation).
- **Border:** `1px solid var(--linha)`.
- **Internal Padding:** `24px 22px`.
- **Icon tile:** 42×42px, 11px radius, `var(--acento-suave)` background, `var(--acento)` icon color — a consistent icon-chip pattern reused (at smaller scale) in the numbered-steps and trust-band components.

### Section Header (kicker / title / sub)
This is the page's one signature, repeated pattern — reused verbatim (or near-verbatim) across three of five sections: the feature grid, the "how it works" steps, and the trust band.
- **Kicker:** 12.5px, 650 weight, uppercase, 0.07em tracking, `var(--acento)`.
- **Title:** 28px, 700 weight, `var(--tinta)` (or `#f5f8ff` on the CTA band), `text-transform: none` (overrides global `h2`).
- **Sub** (optional, omitted in the steps and CTA sections): 15.5px, `var(--tinta-2)`.
- Always centered, max-width 620px, 44px bottom margin before the section's content.

### Numbered Steps
- 34×34px tile, 10px radius, `var(--acento)` fill, white bold number — a plain counter, not a connecting line/rail.
- 3-column `auto-fit minmax(220px, 1fr)` layout, no card chrome (no border/background/shadow) — visually lighter than the feature cards.

### Navigation
Navigation itself lives in the shared `layout.tsx`/`globals.css` header (sticky, `var(--superficie)` background, 56px height) and is outside this module's scope; the landing page adds only a `/produto` entry to that nav, no page-local nav component.

## Do's and Don'ts

### Do:
- **Do** keep the hero/CTA gradient (`#0b1e4d → #163e8c → #2a78d6`, amber `#ffc751 → #ffb020`) hardcoded and scoped to `.hero`/`.ctaFinal` only — it is a deliberate "own-world" banner, not a token to spread into other sections.
- **Do** reuse the kicker/title/sub header pattern for any new section added to this page; it is the page's one structural signature.
- **Do** keep `.grid`'s `minmax(320px, 1fr)` sizing when the feature list stays at a multiple of 3 — it was tuned specifically to avoid an orphaned last row.
- **Do** override the global `h2` uppercase/13px rule explicitly on any new heading in this module, as `.secaoTitulo` and `.ctaFinal h2` already do — do not rely on the inherited default.

### Don't:
- **Don't** let `.pagina`'s full-bleed breakout (`calc(50% - 50vw)` + `margin-top: -28px`) leak into other panel pages that live inside `.wrap` — it is paired with the hero's viewport-width gradient and has no reason to exist without it.
- **Don't** introduce a third color world. Every section is either the gradient hero/CTA register or the inherited neutral/`--acento` register; a new accent color would fracture the two-world balance this page currently holds.
- **Don't** reuse the panel's status colors (`--bom`/`--atencao`/`--critico`) as decoration on this page the way `--bom-tinta` is used in the trust band — that usage is already a soft borrowing for reassurance icons, not a pattern to extend into new status-like badges here.
