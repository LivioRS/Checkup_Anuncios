/**
 * Normalização de texto: remove acentos, minúsculas, opcionalmente pontuação/conectivos.
 * Usado por: tendencias, ia-tipos, perguntas, catalogo-tipos, origem.
 */
export function normalizar(texto: string, opts: { removerPontuacao?: boolean; removerConectivos?: boolean } = {}): string {
  let s = texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (opts.removerPontuacao) {
    s = s.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  }
  if (opts.removerConectivos) {
    // Conectivos comuns em PT-BR (simplificado)
    s = s.replace(/\b(de|da|do|das|dos|e|em|no|na|nos|nas|para|por|com|sem|sob|sobre|entre|após|até|desde|desde que)\b/gi, ' ');
  }
  return s.replace(/\s+/g, ' ').trim();
}

export function normalizarPalavras(texto: string): string[] {
  return normalizar(texto, { removerPontuacao: true, removerConectivos: true }).split(' ').filter(Boolean);
}

/** Normalização mínima (só NFD + lower + trim) — para comparações de ID/código */
export function normalizarSimples(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}