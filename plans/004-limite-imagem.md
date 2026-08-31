# Plan 004: Limitar download/decodificação de imagem antes do sharp

> **Instruções ao executor**: siga cada passo, rode cada verificação e confirme o resultado
> esperado. Se "STOP conditions" ocorrer, pare e reporte — não improvise. Atualize a linha
> deste plano em `plans/README.md` ao terminar.
>
> **Drift check**: repo NÃO é git. Compare os trechos com `file:line` contra o arquivo vivo.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: sem git (2026-08-28)

## Why this matters

`src/app/api/imagens/[id]/route.ts` baixa a imagem do anúncio e a processa com `sharp` sem
nenhum teto: `fetch(origem)` → `req.arrayBuffer()` → `sharp(entrada)` (`route.ts:86-92`). Uma
imagem gigante / decompression-bomb segura a janela de 60s da serverless e pode OOM. O gate de
dono (`donoDoAnuncio`, `route.ts:56`) limita o acesso a anúncios próprios, então a exposição é
controlada — mas o teto está comprovadamente ausente e é barato de adicionar.

## Current state

- `src/app/api/imagens/[id]/route.ts:83-92`:
  ```ts
  const origem = alvo.max_size ? alvo.secure_url ?? alvo.url : alvo.secure_url ?? alvo.url;
  if (!origem) return ...422;
  const bin = await fetch(origem, { cache: 'no-store' });
  if (!bin.ok) return ...502;
  const entrada = Buffer.from(await bin.arrayBuffer());
  const meta = await sharp(entrada).metadata();
  const base = sharp(entrada);
  ```
- Depois: `resize(LADO=1200)`, `.jpeg(...).toBuffer()` (`:94-110`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Smoke | `npm run verificar` | exit 0 |
| Build | `npm run build` | exit 0 |

## Scope

**In scope**: `src/app/api/imagens/[id]/route.ts` (apenas o bloco de download/decode).
**Out of scope**: pipeline de upload / troca de fotos no ML; `Galeria.tsx`; outras rotas.

## Git workflow

Não é repo git. Sem commits/PRs.

## Steps

### Step 1: teto de bytes no download

Antes de ler o body, cheque `Content-Length` e use streaming com limite. Ex.:

```ts
const bin = await fetch(origem, { cache: 'no-store' });
if (!bin.ok) return ...502;
const limite = 15 * 1024 * 1024; // 15 MB
const cl = Number(bin.headers.get('content-length') ?? 0);
if (cl > limite) return NextResponse.json({ erro: 'imagem muito grande' }, { status: 413 });
const entrada = Buffer.from(await bin.arrayBuffer());
if (entrada.byteLength > limite) return NextResponse.json({ erro: 'imagem muito grande' }, { status: 413 });
```

**Verify**: `npm run build` → exit 0.

### Step 2: teto de pixels no decode

Force `sharp` a rejeitar imagens acima de um limite de pixels (previne decompression-bomb
que passa no Content-Length):

```ts
const LADO_MAX = 8192; // 8k
const entrada2 = sharp(entrada).limitInputPixels(LADO_MAX * LADO_MAX);
const meta = await entrada2.metadata();
```

(Em versões do sharp que já limitam por padrão, mantenha explícito + trate o erro de
"Input image exceeds pixel limit" devolvendo 413.)

**Verify**: `npm run build` → exit 0.

### Step 3: smoke

**Verify**: `npm run verificar` → exit 0.

## Test plan

- Se 001 estiver aplicado, adicionar teste puro de `limiteByte`/limite de pixels se forem
  extraídos como funções. Senão, validação manual (enviar imagem > teto → 413).
- Verificação: `npm run build` + `npm run verificar`.

## Done criteria

- [ ] Download rejeita imagens > 15 MB (`413`) por Content-Length e por body
- [ ] `sharp` aplica `limitInputPixels` (decompress-bomb → 413 em vez de OOM)
- [ ] `npm run build` e `npm run verificar` passam
- [ ] Nenhum arquivo fora do escopo modificado
- [ ] `plans/README.md` status do 004 = DONE

## STOP conditions

Pare e reporte se:

- A versão do `sharp` instalada não suportar `limitInputPixels` (muito improvável; se acontecer,
  pare e reporte em vez de contornar com outra lib).
- Precisar tocar no pipeline de upload/troca de fotos (out of scope).

## Maintenance notes

- O teto de 15 MB/pixels é arbitrário; ajuste se o ML passar a aceitar fotos maiores.
- Se o app migrar para streaming de entrada, mova a checagem de bytes para o stream, não o body.
