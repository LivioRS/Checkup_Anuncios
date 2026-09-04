/**
 * Confere o dígito verificador de um GTIN (EAN-8, UPC-A, EAN-13, GTIN-14) — algoritmo
 * padrão GS1: da direita pra esquerda (excluindo o dígito verificador), peso 3/1 alternado
 * começando em 3 no dígito mais à direita.
 *
 * Usado pra avisar ANTES de mandar pro ML: ele recusa GTIN com dígito errado com
 * `Product Identifier [GTIN] contains values with invalid format`, sem dizer o porquê.
 *
 * Comprimento fora de {8,12,13,14} não é validado (pode ser código interno, não GTIN de
 * verdade) — devolve `null` nesse caso, distinto de `false` (checksum errado).
 */
export function gtinChecksumOk(bruto: string): boolean | null {
  const digitos = bruto.replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(digitos.length)) return null;
  const corpo = digitos.slice(0, -1).split('').reverse().map(Number);
  const soma = corpo.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  const esperado = (10 - (soma % 10)) % 10;
  return esperado === Number(digitos.slice(-1));
}
