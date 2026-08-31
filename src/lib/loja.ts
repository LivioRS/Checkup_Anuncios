/**
 * Como a loja se chama para o comprador.
 *
 * O apelido da conta no ML é código interno — PONTOMUSICAL_CF, IRMAOS_BROTHERS.
 * Nenhum comprador quer ler isso numa descrição. Aqui fica o nome de vitrine de
 * cada conta, e as três contas Ponto Musical propositalmente compartilham o
 * mesmo nome: para quem compra, é a mesma loja.
 */
export const NOME_DA_LOJA: Record<string, string> = {
  '471489691': 'Ponto Musical',
  '177795203': 'Ponto Musical',
  '3244206480': 'Ponto Musical',
  '1814100': 'Banana Music',
  '1104686442': 'Irmãos Brothers',
};

/** Nome de vitrine da conta. Sem mapa, cai no apelido tratado. */
export function nomeDaLoja(sellerId?: string | number | null, apelido?: string | null): string {
  const id = sellerId != null ? String(sellerId) : '';
  if (NOME_DA_LOJA[id]) return NOME_DA_LOJA[id];
  if (!apelido) return 'nossa loja';
  // PONTOMUSICAL_MG -> Pontomusical Mg. Melhor que o código cru.
  return apelido
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Texto inicial do bloco "Sobre a loja".
 *
 * É rascunho para você editar, não texto final: promessa de prazo, quantidade
 * de clientes e tempo de mercado variam por conta e mudam com o tempo — quem
 * sabe o número certo é você. O que está aqui é a estrutura e o tom.
 */
export function sugerirSobre(nome: string): string {
  return [
    `A ${nome} trabalha com instrumentos musicais, acessórios e equipamentos de áudio.`,
    'Todos os produtos são novos, originais e enviados com nota fiscal.',
    '',
    'Separação e postagem no mesmo dia útil para pedidos aprovados até o horário de corte.',
    'Embalagem reforçada, pensada para instrumento chegar sem avaria.',
    '',
    'Atendimento pelo chat do Mercado Livre, antes e depois da compra:',
    'tire dúvidas de compatibilidade, medidas ou uso que respondemos em horário comercial.',
  ].join('\n');
}

/** Texto inicial do bloco "Garantia". Ajuste os prazos ao que você pratica. */
export function sugerirGarantia(): string {
  return [
    'GARANTIA LEGAL',
    'Todo produto tem 90 dias de garantia contra defeito de fabricação, conforme o Código de Defesa do Consumidor.',
    '',
    'GARANTIA DO FABRICANTE',
    'Quando o fabricante oferece prazo maior, ele vale a partir da data da compra e está informado na ficha técnica deste anúncio.',
    '',
    'ARREPENDIMENTO',
    'Você tem 7 dias corridos após o recebimento para desistir da compra, sem precisar justificar. O produto deve voltar sem uso e com todos os acessórios e a embalagem.',
    '',
    'COMO ACIONAR',
    'Abra a solicitação pelo Mercado Livre, em "Minhas compras". Acompanhamos o processo por lá do começo ao fim.',
    'A garantia não cobre mau uso, queda, contato com líquido, desgaste natural de itens de consumo (cordas, palhetas, pele de bateria) nem alteração feita por terceiros.',
  ].join('\n');
}
