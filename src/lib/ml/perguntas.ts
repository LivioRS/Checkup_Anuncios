import { normalizar } from '../normalizar.ts';

/**
 * Perguntas reais feitas neste anúncio.
 *
 * Esta é a melhor fonte que existe para um FAQ: não é persona imaginada, é a
 * dúvida que o comprador teve com a descrição na frente dele. Toda pergunta
 * repetida aqui é um buraco no texto — e a resposta que você já deu é a
 * resposta certa, escrita por quem conhece o produto.
 *
 * Só o dono do anúncio enxerga; em anúncio de terceiro volta vazio.
 */
export type Pergunta = { texto: string; resposta: string | null; data?: string };


/** Palavras de recheio de pergunta: não dizem sobre o quê é a dúvida. */
const RECHEIO = new Set([
  'vem', 'tem', 'com', 'sem', 'para', 'pra', 'por', 'que', 'qual', 'quais', 'quanto', 'quantos',
  'como', 'onde', 'quando', 'esse', 'essa', 'este', 'esta', 'isso', 'voce', 'vcs', 'voces',
  'ola', 'boa', 'bom', 'dia', 'tarde', 'noite', 'favor', 'obrigado', 'sera', 'mesmo', 'ainda',
  'tambem', 'muito', 'mais', 'menos', 'pode', 'posso', 'consigo', 'preciso', 'gostaria',
  'produto', 'anuncio', 'ele', 'ela', 'dele', 'dela', 'nao', 'sim', 'uma', 'dos', 'das',
]);

function nucleo(texto: string): Set<string> {
  return new Set(
    normalizar(texto, { removerPontuacao: true, removerConectivos: false })
      .split(/\s+/)
      .filter((p) => p.length > 2 && !RECHEIO.has(p)),
  );
}

/**
 * Agrupa perguntas que tratam do mesmo assunto.
 *
 * "Vem com capa?" e "Acompanha capa mesmo?" são a mesma dúvida escrita de dois
 * jeitos. Comparar o texto inteiro nunca junta as duas; o que junta é olhar só
 * as palavras que carregam o assunto — fora o recheio de pergunta ("vem",
 * "será", "bom dia") — e aceitar como iguais quando a menor das duas está
 * contida na outra pela metade ou mais.
 *
 * O agrupamento existe para dois fins: não entregar ao Claude vinte vezes a
 * mesma dúvida, e revelar pela contagem qual objeção mais aparece.
 */
export function agruparPerguntas(perguntas: Pergunta[]): {
  texto: string;
  resposta: string | null;
  vezes: number;
}[] {
  const grupos: { texto: string; resposta: string | null; vezes: number; chave: Set<string> }[] = [];

  for (const p of perguntas) {
    const chave = nucleo(p.texto);
    if (!chave.size) continue;

    const igual = grupos.find((g) => {
      let comuns = 0;
      for (const palavra of chave) if (g.chave.has(palavra)) comuns += 1;
      const menor = Math.min(chave.size, g.chave.size);
      return comuns > 0 && comuns / menor >= 0.5;
    });

    if (igual) {
      igual.vezes += 1;
      // Guarda a resposta que existir, mesmo que a primeira tenha vindo vazia.
      if (!igual.resposta && p.resposta) igual.resposta = p.resposta;
      // A pergunta mais curta costuma ser a mais direta: fica como representante.
      if (p.texto.length < igual.texto.length) igual.texto = p.texto;
    } else {
      grupos.push({ texto: p.texto, resposta: p.resposta, vezes: 1, chave });
    }
  }

  return grupos
    .sort((a, b) => b.vezes - a.vezes)
    .map(({ texto, resposta, vezes }) => ({ texto, resposta, vezes }));
}