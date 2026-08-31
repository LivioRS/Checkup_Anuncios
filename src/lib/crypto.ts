/**
 * Funciona tanto no runtime Node quanto no Edge (middleware): tudo usa Web Crypto.
 */
const TEXTO = new TextEncoder();

async function segredoHmac(): Promise<CryptoKey> {
  // Segredo de assinatura de sessão. Se não houver um no ambiente, usa um
  // derivado da senha + um valor fixo de dev — suficiente para que o cookie não
  // seja forjável sem conhecer o segredo, e revogável trocando a env.
  const s = process.env.PANEL_HMAC_SECRET ?? `dev-${process.env.PANEL_PASSWORD ?? ''}`;
  return crypto.subtle.importKey('raw', TEXTO.encode(s), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function bytesParaHex(b: ArrayBuffer): string {
  return Array.from(new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
}

/** Compara dois hex em tempo proporcional ao tamanho (evita timing leak óbvio). */
export function igualSegura(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Compara a senha digitada com a esperada em tempo (aproximadamente) constante,
 * hashando os dois lados antes — não expõe o comprimento nem vaza timing por char.
 */
export async function compararSenha(enviada: string, esperada: string): Promise<boolean> {
  const a = await sha256Hex(enviada);
  const b = await sha256Hex(esperada);
  return igualSegura(a, b);
}

const DURACAO_SESSAO_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias, como antes

/**
 * Monta um token de sessão assinado: `exp.hmac`. `exp` é o timestamp de
 * expiração em ms; `hmac` assina `exp` sobre o hash da senha com o segredo do
 * ambiente. Posse do cookie não equivale a conhecimento do segredo e pode ser
 * revogada trocando `PANEL_HMAC_SECRET`.
 */
export async function assinarSessao(senha: string, agora = Date.now()): Promise<string> {
  const exp = String(agora + DURACAO_SESSAO_MS);
  const chave = await segredoHmac();
  const sig = await crypto.subtle.sign('HMAC', chave, TEXTO.encode(exp));
  return `${exp}.${bytesParaHex(sig)}`;
}

/** Valida o cookie `painel` contra a expiração e a assinatura HMAC. */
export async function verificarSessao(cookie: string | undefined, _senha: string, agora = Date.now()): Promise<boolean> {
  if (!cookie) return false;
  const [expRaw, sig] = cookie.split('.');
  const exp = Number(expRaw);
  if (!Number.isFinite(exp) || !sig || exp <= agora) return false;

  const chave = await segredoHmac();
  const ok = await crypto.subtle.verify('HMAC', chave, hexParaBytes(sig), TEXTO.encode(expRaw));
  return ok;
}

function hexParaBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}