import { normalizarPalavras } from './normalizar.ts';

/**
 * Tipos e constantes compartilhados entre servidor e navegador.
 * Ficam fora de ia.ts porque aquele arquivo é 'server-only' — o componente
 * da tela precisa da lista de dimensões para desenhar os anéis.
 */

/** As dez dimensões avaliadas na descrição, na ordem em que aparecem na tela. */
export const DIMENSOES = [
  { chave: 'especificacoes', rotulo: 'Especificações técnicas' },
  { chave: 'funcoes', rotulo: 'Funções e características' },
  { chave: 'compatibilidade', rotulo: 'Compatibilidade' },
  { chave: 'beneficios', rotulo: 'Benefícios do produto' },
  { chave: 'instrucoes', rotulo: 'Instruções de uso' },
  { chave: 'seo', rotulo: 'SEO — palavras-chave' },
  { chave: 'origem', rotulo: 'Origem do produto' },
  { chave: 'itens', rotulo: 'Itens inclusos' },
  { chave: 'garantia', rotulo: 'Detalhamento de garantia' },
  { chave: 'cta', rotulo: 'Chamada para a ação' },
] as const;

export type Nota = { nota: number; observacao: string };
export type Notas = Record<string, Nota>;

/* ------------------------------------------------------------------ *
 * Título e modelo
 * ------------------------------------------------------------------ */

/** O ML corta o título em 60 caracteres no MLB. Não é sugestão, é limite. */
export const LIMITE_TITULO = 60;

export type SugestaoTitulo = {
  texto: string;
  motivo: string;
  /** Termos das tendências que este título passou a cobrir. */
  termos: string[];
};

export type SugestaoModelo = {
  /** O modelo real do produto — sempre o começo do campo. */
  base: string;
  /** Termos buscados, já na ordem em que valem a pena entrar. */
  termos: string[];
  motivo: string;
  /** O que pode dar errado se publicar assim — vem do próprio Claude. */
  risco: string | null;
};

export type PlanoTitulo = {
  titulos: SugestaoTitulo[];
  modelo: SugestaoModelo | null;
  /** Termos buscados que NÃO servem para este produto, com o porquê. */
  descartados: { termo: string; motivo: string }[];
};

/**
 * Limite do campo MODEL quando a categoria não informa o seu.
 *
 * NÃO é um número fixo do ML: cada categoria declara o seu em
 * value_max_length, e na prática varia bastante — instrumentos musicais aceita
 * bem mais de 100. Este valor é só a rede para quando a leitura da categoria
 * falha, e a tela avisa quando está usando ele em vez do número real.
 */
export const LIMITE_MODELO_PADRAO = 60;


export type ModeloMontado = {
  valor: string;
  usados: string[];
  /** Termos que não couberam no limite — ficam à vista, não somem calados. */
  sobraram: string[];
  /** Termos pulados porque as palavras já estavam no título ou no próprio campo. */
  repetidos: string[];
  livres: number;
};

/**
 * Palavras que não valem sinalizar como repetição.
 *
 * Preposição e artigo repetem por construção da frase — "fone de ouvido sem
 * fio" tem dois conectivos e nenhum problema. Sinalizar isso encheria a tela
 * de alarme falso e ensinaria você a ignorar o aviso, que é o pior desfecho.
 */
const CONECTIVOS = new Set([
  'a', 'as', 'ao', 'aos', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em', 'na', 'nas',
  'no', 'nos', 'o', 'os', 'para', 'por', 'pra', 'sem', 'um', 'uma',
]);

/** Palavras que aparecem mais de uma vez dentro do mesmo texto. */
export function repetidasEm(texto: string): string[] {
  const conta = new Map<string, number>();
  for (const p of normalizarPalavras(texto)) {
    if (CONECTIVOS.has(p)) continue;
    conta.set(p, (conta.get(p) ?? 0) + 1);
  }
  return [...conta.entries()].filter(([, n]) => n > 1).map(([p]) => p);
}

/** Palavras presentes nos dois textos — título e modelo, por exemplo. */
export function repetidasEntre(a: string, b: string): string[] {
  const setA = new Set(normalizarPalavras(a).filter((p) => !CONECTIVOS.has(p)));
  const vistas = new Set<string>();
  const saida: string[] = [];
  for (const p of normalizarPalavras(b)) {
    if (CONECTIVOS.has(p) || !setA.has(p) || vistas.has(p)) continue;
    vistas.add(p);
    saida.push(p);
  }
  return saida;
}

export function montarModelo(
  base: string,
  termos: string[],
  limite = LIMITE_MODELO_PADRAO,
  opts: { evitar?: string } = {},
): ModeloMontado {
  let valor = base.trim().slice(0, limite);

  // Tudo que já está no título não precisa ser repetido no modelo.
  const vistas = new Set([...normalizarPalavras(opts.evitar ?? ''), ...normalizarPalavras(valor)]);

  const usados: string[] = [];
  const sobraram: string[] = [];
  const repetidos: string[] = [];

  for (const bruto of termos) {
    const termo = bruto.trim();
    if (!termo) continue;

    const p = normalizarPalavras(termo);
    if (!p.length || p.every((x) => vistas.has(x))) {
      repetidos.push(termo);
      continue;
    }

    const candidato = valor ? `${valor} ${termo}` : termo;
    if (candidato.length <= limite) {
      valor = candidato;
      usados.push(termo);
      for (const x of p) vistas.add(x);
    } else {
      sobraram.push(termo);
    }
  }

  return { valor, usados, sobraram, repetidos, livres: limite - valor.length };
}

/** Lê o plano de título, tolerando cercas de código e campos faltando. */
export function lerPlanoTitulo(bruto: string): PlanoTitulo | null {
  const limpo = bruto.replace(/```(?:json)?/g, '').trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio < 0 || fim < inicio) return null;

  try {
    const o = JSON.parse(limpo.slice(inicio, fim + 1)) as Record<string, unknown>;
    const lista = Array.isArray(o.titulos) ? o.titulos : [];

    const titulos: SugestaoTitulo[] = lista
      .map((t) => t as Record<string, unknown>)
      .filter((t) => typeof t?.texto === 'string' && (t.texto as string).trim())
      .map((t) => ({
        // Corta no limite do ML: melhor um título curto que um recusado.
        texto: (t.texto as string).trim().slice(0, LIMITE_TITULO),
        motivo: typeof t.motivo === 'string' ? t.motivo : '',
        termos: Array.isArray(t.termos) ? (t.termos as unknown[]).map(String) : [],
      }));

    const m = o.modelo as Record<string, unknown> | undefined;
    // Aceita também a forma antiga { valor } — vira base sem termos.
    const base =
      typeof m?.base === 'string' && m.base.trim()
        ? (m.base as string).trim()
        : typeof m?.valor === 'string'
          ? (m.valor as string).trim()
          : '';
    const modelo: SugestaoModelo | null = base
      ? {
          base,
          termos: Array.isArray(m?.termos) ? (m!.termos as unknown[]).map(String) : [],
          motivo: typeof m?.motivo === 'string' ? m.motivo : '',
          risco: typeof m?.risco === 'string' && m.risco.trim() ? (m.risco as string) : null,
        }
      : null;

    const descartados = (Array.isArray(o.descartados) ? o.descartados : [])
      .map((d) => d as Record<string, unknown>)
      .filter((d) => typeof d?.termo === 'string')
      .map((d) => ({
        termo: d.termo as string,
        motivo: typeof d.motivo === 'string' ? d.motivo : '',
      }));

    return titulos.length ? { titulos, modelo, descartados } : null;
  } catch {
    return null;
  }
}

/**
 * Gruda os blocos fixos no fim do texto — em código, não por pedido ao modelo.
 *
 * Antes o prompt mandava "repita exatamente os blocos abaixo". Modelo de
 * linguagem resume, reescreve e às vezes esquece: um texto de garantia que
 * volta parafraseado é promessa jurídica alterada sem ninguém perceber. Aqui a
 * cópia é literal por construção, e é idempotente — chamar duas vezes não
 * duplica o bloco.
 */
export function grudarBlocos(
  texto: string,
  blocos: { sobre?: string; garantia?: string },
): string {
  let saida = texto.trimEnd();

  const anexar = (titulo: string, corpo?: string) => {
    if (!corpo?.trim()) return;
    // Se o modelo já escreveu o título mesmo proibido, cortamos dali para baixo.
    const marca = new RegExp(`\\n\\s*${titulo}\\s*\\n`, 'i');
    const achou = saida.search(marca);
    if (achou > -1) saida = saida.slice(0, achou).trimEnd();
    saida += `\n\n${titulo}\n${corpo.trim()}`;
  };

  anexar('SOBRE A LOJA', blocos.sobre);
  anexar('GARANTIA', blocos.garantia);
  return saida;
}

/** O texto já traz os dois blocos que deveria trazer? */
export function temBlocos(texto: string, blocos: { sobre?: string; garantia?: string }): boolean {
  const faltando =
    (blocos.sobre?.trim() && !/\n\s*SOBRE A LOJA\s*\n/i.test(texto)) ||
    (blocos.garantia?.trim() && !/\n\s*GARANTIA\s*\n/i.test(texto));
  return !faltando;
}

/* ------------------------------------------------------------------ *
 * Origem dentro do texto da descrição
 * ------------------------------------------------------------------ */

/**
 * Uma linha "Origem: ..." / "País de origem: ..." / "Fabricado em: ..."
 */
const LINHA_ORIGEM =
  /^[ \t]*(origem|pa[ií]s de origem|pa[ií]s de fabrica[cç][aã]o|fabricado em|procedência|procedencia)[ \t]*[:-][ \t]*\S+/im;

/** A descrição já informa a origem? */
export function temOrigem(texto: string): boolean {
  return LINHA_ORIGEM.test(texto ?? '');
}

/**
 * Insere a linha de origem no lugar certo do texto.
 *
 * O lugar certo é o fim do bloco de características — é lá que o comprador
 * procura ficha técnica. Se esse bloco não existir, a linha entra antes dos
 * blocos fixos da loja, para não ficar depois da garantia, que é o fim do texto.
 *
 * Idempotente: se já houver linha de origem, ela é substituída, não duplicada.
 */
export function inserirOrigem(texto: string, valor: string): string {
  const limpo = (valor ?? '').trim();
  if (!limpo) return texto;
  const linha = `Origem: ${limpo}`;

  // Já existe uma linha de origem: troca o valor no lugar onde ela está.
  if (LINHA_ORIGEM.test(texto)) return texto.replace(LINHA_ORIGEM, linha);

  const linhas = texto.split('\n');

  // 1) Fim do bloco de características, quando ele existe.
  const inicioFicha = linhas.findIndex((l) =>
    /^[ \t]*(principais\s+caracter[ií]sticas|caracter[ií]sticas|ficha\s+t[eé]cnica)/i.test(l),
  );
  if (inicioFicha > -1) {
    let fim = inicioFicha + 1;
    while (fim < linhas.length && linhas[fim].trim() !== '') fim += 1;
    linhas.splice(fim, 0, linha);
    return linhas.join('\n');
  }

  // 2) Antes dos blocos fixos da loja.
  const inicioBlocos = linhas.findIndex((l) => /^[ \t]*(sobre a loja|garantia)[ \t]*$/i.test(l));
  if (inicioBlocos > -1) {
    linhas.splice(inicioBlocos, 0, linha, '');
    return linhas.join('\n');
  }

  // 3) Não achou âncora: vai para o fim.
  return `${texto.trimEnd()}\n\n${linha}`;
}