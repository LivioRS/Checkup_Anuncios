import { normalizar as normalizarBase } from '../normalizar.ts';

/**
 * Palavras que os compradores digitam na busca do Mercado Livre.
 *
 * O recurso /trends/{site}/{categoria} devolve 50 termos por semana, em três
 * blocos de significado diferente — e a API não separa os blocos, só devolve o
 * array na ordem. A divisão abaixo é a documentada:
 *
 *   posições  1–10  buscas com maior CRESCIMENTO na semana
 *   posições 11–30  as MAIS BUSCADAS em volume
 *   posições 31–50  as tendências mais POPULARES (crescimento vs. 2 semanas)
 *
 * O que a API NÃO devolve: número de buscas. Não existe volume, só a ordem —
 * então o painel não inventa "x mil buscas/mês"; mostra posição e bloco.
 */
export const CACHE_TENDENCIAS = 86400; // atualiza semanal; 24 h de cache basta

export type Termo = { keyword: string; url?: string; bloco: Bloco; posicao: number };
export type Bloco = 'crescimento' | 'buscadas' | 'populares';

export const ROTULO_BLOCO: Record<Bloco, string> = {
  crescimento: 'Em alta',
  buscadas: 'Mais buscadas',
  populares: 'Populares na semana',
};

export function blocoPorPosicao(i: number): Bloco {
  if (i < 10) return 'crescimento';
  if (i < 30) return 'buscadas';
  return 'populares';
}

/** Wrapper para manter a assinatura compatível (remove pontuação + NFD + lower). */
function normalizar(texto: string): string {
  return normalizarBase(texto, { removerPontuacao: true });
}

/**
 * O termo já está no título?
 *
 * Compara palavra por palavra, não como pedaço de texto: senão "led" casaria
 * dentro de "bluetooth" e o painel diria que o título cobre um termo que ele
 * não cobre. A ordem não importa — o ML não busca por frase exata.
 */
export function noTitulo(titulo: string, termo: string): boolean {
  const palavras = new Set(normalizar(titulo).split(' '));
  const alvo = normalizar(termo).split(' ').filter(Boolean);
  return alvo.length > 0 && alvo.every((p) => palavras.has(p));
}

/**
 * Quanto de um termo o título já cobre, e o que falta dele.
 *
 * Só "cobre tudo ou não cobre" era cego: num título de fone, "fone de ouvido
 * sem fio" caía no mesmo balde que "airpods", quando o primeiro está a duas
 * palavras de distância e o segundo é outro produto. Saber QUAIS palavras
 * faltam é o que transforma a lista em trabalho: são elas que você considera
 * encaixar no título.
 */
export function cobertura(
  titulo: string,
  termo: string,
): { razao: number; faltam: string[] } {
  const noTexto = new Set(normalizar(titulo).split(' ').filter(Boolean));
  const alvo = normalizar(termo).split(' ').filter(Boolean);
  if (!alvo.length) return { razao: 0, faltam: [] };
  const faltam = alvo.filter((p) => !noTexto.has(p));
  return { razao: (alvo.length - faltam.length) / alvo.length, faltam };
}

export type TermoCruzado = Termo & { razao: number; faltam: string[] };

export type Cobertura = {
  /** O título cobre o termo inteiro. */
  dentro: TermoCruzado[];
  /** Cobre metade ou mais: perto o bastante para valer a pena olhar. */
  parcial: TermoCruzado[];
  /** Pouca ou nenhuma palavra em comum — em geral é outro produto. */
  fora: TermoCruzado[];
};

export function cruzarComTitulo(titulo: string, termos: Termo[]): Cobertura {
  const dentro: TermoCruzado[] = [];
  const parcial: TermoCruzado[] = [];
  const fora: TermoCruzado[] = [];

  for (const t of termos) {
    const c = cobertura(titulo, t.keyword);
    const item = { ...t, ...c };
    if (c.razao >= 1) dentro.push(item);
    else if (c.razao >= 0.5) parcial.push(item);
    else fora.push(item);
  }

  // No parcial, quem está mais perto de fechar vem primeiro.
  parcial.sort((a, b) => b.razao - a.razao || a.faltam.length - b.faltam.length);
  return { dentro, parcial, fora };
}