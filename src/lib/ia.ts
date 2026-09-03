import 'server-only';
import {
  DIMENSOES,
  LIMITE_TITULO,
  LIMITE_MODELO_PADRAO,
  lerPlanoTitulo,
  montarModelo,
  grudarBlocos,
  temBlocos,
  temOrigem,
  inserirOrigem,
  type Notas,
  type PlanoTitulo,
  type SugestaoModelo,
  type SugestaoTitulo,
} from './ia-tipos';

export {
  DIMENSOES,
  LIMITE_TITULO,
  LIMITE_MODELO_PADRAO,
  lerPlanoTitulo,
  montarModelo,
  grudarBlocos,
  temBlocos,
  temOrigem,
  inserirOrigem,
};
export type { Nota, Notas, PlanoTitulo, SugestaoTitulo, SugestaoModelo } from './ia-tipos';

/**
 * Chamada à API da Anthropic. A planilha da Puro usa OpenAI; aqui é Claude.
 * A chave é sua e o custo é por uso — sem ANTHROPIC_API_KEY, a tela avisa e
 * o resto do painel continua funcionando normalmente.
 */

const API = 'https://api.anthropic.com/v1/messages';

export function temIA() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function perguntarAoClaude(prompt: string, maxTokens = 2000): Promise<string> {
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) throw new Error('ANTHROPIC_API_KEY não configurada no .env.local');

  // Se o modelo sair de linha, troque em ANTHROPIC_MODEL.
  // Lista atual: https://docs.claude.com/en/docs/about-claude/models
  const modelo = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5';

  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'x-api-key': chave,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: modelo,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    }),
    cache: 'no-store',
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message ?? JSON.stringify(json).slice(0, 300);
    throw new Error(`Anthropic ${res.status}: ${msg}`);
  }

  const partes = (json?.content ?? []) as { type?: string; text?: string }[];
  return partes
    .filter((p) => p.type === 'text')
    .map((p) => p.text ?? '')
    .join('\n')
    .trim();
}

/**
 * A descrição do ML aceita SOMENTE texto simples: HTML e emoji derrubam o PUT
 * com item.description.type.invalid, e quebra de linha só vale com \n.
 */
export function limparParaDescricao(texto: string): string {
  return texto
    .replace(/<[^>]*>/g, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}]/gu, '')
    // Seletor de variação (força apresentação emoji) — separado da classe acima
    // de propósito: combinado com outro ponto de código na MESMA classe, o
    // ESLint marca como "misleading character class" (no-misleading-character-class).
    .replace(/\u{FE0F}/gu, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

export type AtributoResumo = { nome: string; valor: string };

export type ContextoAnuncio = {
  titulo: string;
  categoria?: string;
  atributos: AtributoResumo[];
  descricao: string;
  /** Trechos de avaliações reais: mostram o que o comprador quis saber e não achou. */
  opinioes?: string[];
  fotos?: number;
  /** Perguntas que compradores fizeram NESTE anúncio, já agrupadas por semelhança. */
  perguntas?: { texto: string; resposta: string | null; vezes: number }[];
  /** Termos buscados na categoria — servem de vocabulário, não de enfeite. */
  termosBuscados?: string[];
  /** Nome de vitrine da loja, para o texto não sair impessoal. */
  loja?: string;
  /** Material colado pelo vendedor: manual do fabricante, outro anúncio, catálogo. */
  fontes?: string;
  /** Origem, venha da ficha ou digitada na tela. Entra nas características. */
  origem?: string;
};

const cerca = '"""';

function fichaTexto(atributos: AtributoResumo[]) {
  return atributos.length
    ? atributos.map((a) => `- ${a.nome}: ${a.valor}`).join('\n')
    : '(sem ficha técnica preenchida)';
}

/**
 * Pede as notas por dimensão. Exigimos JSON puro para a tela poder desenhar os
 * anéis. A nota é do Claude, não do Mercado Livre — e a tela diz isso.
 */
export function promptNotas(c: ContextoAnuncio) {
  const lista = DIMENSOES.map((d) => `"${d.chave}" (${d.rotulo})`).join(', ');

  return [
    'Você avalia descrições de anúncios do Mercado Livre no Brasil.',
    '',
    `Avalie a descrição abaixo em cada uma destas dimensões: ${lista}.`,
    '',
    'Para cada dimensão devolva:',
    '- "nota": número de 0 a 10, uma casa decimal. 0 = a descrição não trata disso. 10 = trata de forma completa e clara.',
    '- "observacao": no máximo 140 caracteres, objetivo, dizendo o que falta. Se estiver bom, diga o que está bom.',
    '',
    'Seja rigoroso: descrição curta e genérica não tira nota alta. Se a dimensão não se aplica ao produto (compatibilidade num produto que não se conecta a nada, por exemplo), dê 10 e explique na observação que não se aplica.',
    '',
    'RESPONDA APENAS COM JSON, sem cercas de código, no formato:',
    '{"especificacoes":{"nota":0.0,"observacao":"..."}, ...}',
    '',
    `TÍTULO: ${c.titulo}`,
    '',
    'FICHA TÉCNICA:',
    fichaTexto(c.atributos),
    '',
    'DESCRIÇÃO ATUAL:',
    cerca,
    c.descricao || '(vazia)',
    cerca,
  ].join('\n');
}

/**
 * Reescrita. Recebe tudo o que o painel sabe do anúncio: ficha técnica,
 * avaliações dos compradores, quantidade de fotos e os pontos fracos da
 * análise — e termina anexando os blocos fixos da loja.
 */
export function promptMelhoria(
  c: ContextoAnuncio,
  notas: Notas | null,
  blocos: { sobre?: string; garantia?: string },
) {
  const fracas = notas
    ? Object.entries(notas)
        .filter(([, v]) => v.nota < 8)
        .map(([k, v]) => {
          const rot = DIMENSOES.find((d) => d.chave === k)?.rotulo ?? k;
          return `- ${rot} (nota ${v.nota}): ${v.observacao}`;
        })
        .join('\n')
    : '';

  const opinioes = (c.opinioes ?? []).filter(Boolean).slice(0, 10);
  const perguntas = (c.perguntas ?? []).slice(0, 15);

  const partes = [
    'Você escreve descrições de anúncio do Mercado Livre no Brasil. Reescreva a descrição abaixo.',
    '',
    'REGRAS OBRIGATÓRIAS:',
    '- Responda APENAS com o texto final da descrição: sem comentário seu, sem introdução, sem marcação.',
    '- Texto simples puro: nada de HTML, markdown, asterisco, emoji ou tabela. Blocos separados por linha em branco.',
    '- Não invente NADA. Cada característica citada tem de estar na ficha técnica, no título ou na descrição atual.',
    '- Proibido: link, telefone, e-mail, WhatsApp, endereço, menção a outro site ou marketplace, contato fora do ML.',
    '- Nada de superlativo vazio ("o melhor do mercado") nem promessa de prazo de entrega.',
    '- Entre 2000 e 4500 caracteres.',
    '',
    'COMO O TEXTO DEVE SOAR:',
    '- Fale com o comprador, não sobre o produto. "Você recebe", "ela oferece", "serve para".',
    '- NÃO comece com um cabeçalho tipo "SOBRE O PRODUTO". Comece com uma frase que nomeia o produto completo e diz para quem ele serve.',
    '- Os títulos das seções não são rótulos genéricos: são frases curtas que anunciam o benefício daquele trecho ("Timbres versáteis para diferentes estilos", "Kit completo: você recebe tudo que aparece na foto").',
    '- Parágrafos de 2 a 4 linhas, texto corrido. Lista só onde lista ajuda de verdade: itens do kit e ficha técnica.',
    '',
    'ESTRUTURA, nesta ordem, pulando o que não se aplica:',
    '1. Abertura: uma frase que nomeia o produto por inteiro (marca, modelo, característica principal) e diz para quem ele é. Depois, 1 ou 2 parágrafos sobre uso no dia a dia e sobre o visual, quando a ficha der base.',
    '2. Blocos temáticos com título próprio, cobrindo o que diferencia o produto (versatilidade, tecnologia, conforto, o que acompanha).',
    '3. Quando o anúncio for kit ou tiver itens inclusos: um bloco listando item por item, um por linha.',
    '4. Um bloco de benefícios para o público principal (por exemplo, quem está começando).',
    '5. "Perguntas Frequentes" — obrigatório, veja o bloco abaixo.',
    '6. "Principais características" — a ficha técnica em linhas "Campo: valor", só com o que a ficha traz.',
    '   Esse bloco deve trazer a linha de origem ("Origem: ...") sempre que o dado existir — da ficha técnica ou do valor informado à parte. Se a origem não aparecer em lugar nenhum, NÃO invente e simplesmente não escreva a linha: o painel cobra isso depois, com o vendedor.',
    '7. Fechamento curto: para quem serve, e o que a pessoa leva ao comprar.',
    '',
    'PERGUNTAS FREQUENTES — é aqui que a venda se decide:',
    '- Escreva de 5 a 7 perguntas, cada uma entre aspas, na voz de quem está com o dedo no botão de comprar e ainda tem receio.',
    '- Cada pergunta ataca UMA objeção concreta: será que vem tudo, serve para iniciante, vou precisar comprar mais coisa, é original, aguenta uso profissional, dá para usar em X.',
    '- Pense em quem procura este produto: iniciante, quem está presenteando, quem já toca e quer um segundo instrumento, quem usa profissionalmente. Escolha as objeções desses perfis.',
    '- A resposta começa confirmando ("Sim." / "Serve.") e só depois explica, em 1 a 3 linhas, com base na ficha.',
    '- Se houver perguntas reais listadas mais abaixo, as MAIS REPETIDAS entram obrigatoriamente — reescritas com clareza, mantendo o sentido da resposta que já foi dada.',
    '- Nunca prometa o que a ficha não sustenta. Se a dúvida não tem resposta nos dados, não invente: deixe a pergunta de fora.',
    '',
    `TÍTULO DO ANÚNCIO: ${c.titulo}`,
  ];

  if (c.loja) partes.push(`LOJA: ${c.loja}`);
  if (c.origem) partes.push(`ORIGEM DO PRODUTO (use exatamente este valor): ${c.origem}`);

  partes.push(
    '',
    'FICHA TÉCNICA (é daqui que saem as especificações — não invente nenhuma):',
    fichaTexto(c.atributos),
  );

  if (perguntas.length) {
    partes.push(
      '',
      'PERGUNTAS REAIS FEITAS NESTE ANÚNCIO (a dúvida que a descrição não respondeu; o número é quantas vezes apareceu):',
      ...perguntas.map(
        (p) =>
          `- (${p.vezes}x) "${p.texto}"${p.resposta ? `\n  resposta dada: ${p.resposta}` : '\n  ainda sem resposta'}`,
      ),
    );
  }

  if (opinioes.length) {
    partes.push(
      '',
      'O QUE OS COMPRADORES ESCREVERAM (use para cobrir dúvida real; não cite as avaliações):',
      ...opinioes.map((o) => `- ${o}`),
    );
  }

  if (c.fontes?.trim()) {
    partes.push(
      '',
      'MATERIAL COLADO PELO VENDEDOR (manual do fabricante, catálogo, outro anúncio):',
      cerca,
      c.fontes.trim().slice(0, 12000),
      cerca,
      'COMO USAR ESSE MATERIAL:',
      '- Ele é FONTE DE FATO, não de texto. Tire de lá especificação, função, medida, compatibilidade e o que acompanha.',
      '- NUNCA copie frase, parágrafo ou bloco de lá. Reescreva com as suas palavras — texto de outro vendedor é trabalho dele, e cópia literal derruba anúncio por denúncia.',
      '- Se o material contradisser a ficha técnica, a FICHA VENCE. Ela é o dado oficial deste anúncio.',
      '- Ignore o que for de outro vendedor e não deste anúncio: preço, prazo de entrega, nome de loja, contato, condição de pagamento, frete.',
      '- Se o material falar de outra variação (outra cor, outro tamanho, outro kit), use só o que vale para ESTE produto.',
    );
  }

  if (c.termosBuscados?.length) {
    partes.push(
      '',
      'PALAVRAS QUE OS COMPRADORES BUSCAM NESTA CATEGORIA:',
      c.termosBuscados.slice(0, 25).join(', '),
      'Use as que descrevem MESMO este produto, encaixadas naturalmente na frase. Nunca faça lista de palavras-chave nem repita termo para posicionar.',
    );
  }

  if (c.fotos) {
    partes.push(
      '',
      `O anúncio tem ${c.fotos} fotos. NÃO descreva o que aparece nelas: você não as viu.`,
    );
  }

  if (fracas) {
    partes.push('', 'PONTOS FRACOS DA ANÁLISE — resolva cada um:', fracas);
  }

  partes.push('', 'DESCRIÇÃO ATUAL:', cerca, c.descricao || '(vazia)', cerca);

  if (blocos.sobre || blocos.garantia) {
    // Os blocos NÃO vão no texto gerado: o painel gruda depois, palavra por
    // palavra. Aqui eles entram só para o Claude não repetir o assunto.
    partes.push(
      '',
      'O texto vai receber DEPOIS, automaticamente, dois blocos fixos da loja: um "SOBRE A LOJA" e um "GARANTIA".',
      'NÃO escreva esses dois blocos e não repita o que eles dizem. Termine no fechamento do produto.',
    );
    if (blocos.garantia) {
      partes.push(
        'Conteúdo do bloco de garantia, só para você não repetir:',
        blocos.garantia.slice(0, 800),
      );
    }
  }

  return partes.join('\n');
}

/** Lê o JSON das notas mesmo se o modelo devolver dentro de cercas de código. */
export function lerNotas(bruto: string): Notas | null {
  const limpo = bruto.replace(/```(?:json)?/g, '').trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio < 0 || fim < inicio) return null;
  try {
    const obj = JSON.parse(limpo.slice(inicio, fim + 1)) as Record<string, unknown>;
    const saida: Notas = {};
    for (const d of DIMENSOES) {
      const v = obj[d.chave] as { nota?: unknown; observacao?: unknown } | undefined;
      const n = Number(v?.nota);
      saida[d.chave] = {
        nota: Number.isFinite(n) ? Math.max(0, Math.min(10, n)) : 0,
        observacao: typeof v?.observacao === 'string' ? v.observacao : '',
      };
    }
    return saida;
  } catch {
    return null;
  }
}

/** Média das dimensões — é a "qualidade geral" do anel maior. */
export function notaGeral(notas: Notas): number {
  const vals = DIMENSOES.map((d) => notas[d.chave]?.nota ?? 0);
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/* ------------------------------------------------------------------ *
 * Título com base no que o comprador busca
 * ------------------------------------------------------------------ */

export type ContextoTitulo = {
  titulo: string;
  /** Limite do campo MODEL nesta categoria — entra no prompt só como contexto. */
  limiteModelo?: number;
  categoria?: string;
  atributos: AtributoResumo[];
  /** Modelo atual gravado no atributo MODEL, se houver. */
  modeloAtual?: string | null;
  /** Termos do /trends já separados por bloco. */
  emAlta: string[];
  maisBuscadas: string[];
  populares: string[];
  /** Termos que o título de hoje já cobre — não adianta "adicionar" o que já está lá. */
  jaNoTitulo: string[];
};

/**
 * Pede títulos, não um título.
 *
 * Três opções com critérios diferentes deixam a escolha com quem conhece o
 * produto. Uma opção só obrigaria o Claude a chutar qual compromisso você
 * prefere — mais alcance ou mais precisão — e ele não tem como saber.
 */
export function promptTitulo(c: ContextoTitulo) {
  const bloco = (rotulo: string, termos: string[]) =>
    termos.length ? `${rotulo}:\n${termos.map((t) => `- ${t}`).join('\n')}` : `${rotulo}: (vazio)`;

  return [
    'Você otimiza títulos de anúncios do Mercado Livre no Brasil.',
    '',
    'REGRAS DO MERCADO LIVRE (quebrar qualquer uma custa exposição ou vira moderação):',
    `- Máximo ${LIMITE_TITULO} caracteres. Título cortado perde a palavra do fim.`,
    '- Estrutura que o ML recomenda: Produto + Marca + Modelo + as especificações que diferenciam.',
    '- Sem palavra promocional (frete grátis, promoção, oferta, barato, imperdível).',
    '- Sem CAIXA ALTA, sem emoji, sem símbolo decorativo, sem repetir palavra.',
    '- Nada de termo que não descreve o produto: atrai clique errado, derruba a conversão e pode virar denúncia de anúncio enganoso.',
    '',
    'COMO USAR AS LISTAS DE BUSCA:',
    '- "Mais buscadas" é volume: são os termos genéricos, disputadíssimos. Servem para o começo do título.',
    '- "Em alta" e "Populares" são crescimento: aí mora a cauda longa — combinação mais específica, menos concorrida, com quem já sabe o que quer.',
    '- Cauda longa boa é a que junta o termo genérico com um qualificador REAL do produto (uso, formato, característica), nunca inventado.',
    '- Termo que o título de hoje já cobre não conta como ganho.',
    '',
    `CATEGORIA: ${c.categoria ?? '—'}`,
    `TÍTULO ATUAL (${c.titulo.length} caracteres):`,
    `${cerca}\n${c.titulo}\n${cerca}`,
    '',
    'FICHA TÉCNICA (a fonte da verdade sobre o produto):',
    fichaTexto(c.atributos),
    '',
    `MODELO gravado hoje no atributo MODEL: ${c.modeloAtual || '(vazio)'}`,
    `O campo MODEL desta categoria aceita ${c.limiteModelo ?? LIMITE_MODELO_PADRAO} caracteres.`,
    '',
    bloco('MAIS BUSCADAS (volume)', c.maisBuscadas),
    '',
    bloco('EM ALTA (crescendo esta semana)', c.emAlta),
    '',
    bloco('POPULARES (crescimento vs. duas semanas)', c.populares),
    '',
    `JÁ COBERTOS PELO TÍTULO ATUAL: ${c.jaNoTitulo.join(', ') || '(nenhum)'}`,
    '',
    'RESPONDA SÓ COM ESTE JSON, sem texto antes ou depois:',
    '{',
    '  "titulos": [',
    `    { "texto": "…", "motivo": "por que este ganha busca, em 1 frase", "termos": ["termo que passou a cobrir"] }`,
    '  ],',
    '  "modelo": { "base": "modelo real", "termos": ["termo", "termo"], "motivo": "…", "risco": "… ou null" },',
    '  "descartados": [ { "termo": "…", "motivo": "por que não serve para ESTE produto" } ]',
    '}',
    '',
    'Em "titulos", dê exatamente 3 opções, nesta ordem de intenção:',
    '1. Alcance: puxa o termo genérico mais buscado para a frente.',
    '2. Cauda longa: privilegia a combinação específica de quem está pronto para comprar.',
    '3. Equilíbrio: o que você publicaria se fosse o dono da loja.',
    `Nenhuma pode passar de ${LIMITE_TITULO} caracteres — conte antes de responder.`,
    '',
    'Sobre "modelo": em "base" vai o modelo REAL do produto, exatamente como ele é (ex.: "DL-500"). Nunca invente modelo.',
    'Em "termos" vai a lista de palavras buscadas que valem entrar depois do modelo, DA MAIS VALIOSA PARA A MENOS.',
    'Ordene pensando em busca: primeiro o termo genérico de maior volume que descreve o produto, depois as combinações de cauda longa.',
    'Só entra termo que descreve mesmo ESTE produto. Não repita palavra que já está na base nem entre os termos.',
    'Não conte caracteres nem monte a string final, e não use vírgula: quem junta, conta e corta é o painel. Mande a lista inteira que faria sentido, em ordem.',
    'Não se preocupe em evitar o que já está no título: o painel remove sozinho os termos que o título cobrir, porque quem escolhe o título é o vendedor, depois de você responder. Por isso mande a lista generosa — é melhor sobrar opção que faltar.',
    'Em "risco", diga em uma frase o que pode dar errado com esse preenchimento — o campo MODEL é usado em filtro de busca e ficha técnica, e sair do modelo puro tem custo.',
    '',
    'Em "descartados", liste os termos das listas que NÃO servem para este produto e por quê. Essa lista importa tanto quanto a dos títulos.',
  ].join('\n');
}

/* ------------------------------------------------------------------ *
 * Anúncio fora do catálogo (planos 029/030): produto que ainda não
 * existe — sem ficha, sem perguntas reais, sem avaliações. Prompts
 * enxutos, baseados só em título/marca/modelo/categoria.
 * ------------------------------------------------------------------ */

export type ContextoProdutoNovo = {
  titulo: string;
  marca?: string;
  modelo?: string;
  /** Nome legível da categoria, quando já escolhida. */
  categoria?: string;
  temFotos?: boolean;
};

/** Descrição para um produto que está sendo cadastrado agora (não há item no ML ainda). */
export function promptDescricaoNova(c: ContextoProdutoNovo): string {
  return [
    'Você escreve descrições de anúncio do Mercado Livre no Brasil. Escreva a descrição de um produto que está sendo cadastrado agora.',
    '',
    'REGRAS OBRIGATÓRIAS:',
    '- Responda APENAS com o texto final da descrição: sem comentário seu, sem introdução, sem marcação.',
    '- Texto simples puro: nada de HTML, markdown, asterisco, emoji ou tabela. Blocos separados por linha em branco.',
    '- Você só tem título, marca, modelo e categoria. NÃO invente especificação, medida, material, compatibilidade, conteúdo da caixa nem prazo. Se um dado não aparece, não escreva sobre ele.',
    '- Proibido: link, telefone, e-mail, WhatsApp, endereço, menção a outro site ou marketplace.',
    '- Nada de superlativo vazio ("o melhor do mercado") nem promessa de entrega.',
    '- Entre 800 e 2500 caracteres — é uma descrição de lançamento, ainda enxuta.',
    '',
    'COMO O TEXTO DEVE SOAR:',
    '- Fale com o comprador: "você recebe", "serve para". Comece com uma frase que nomeia o produto por inteiro e diz para quem ele é.',
    '- Títulos de seção são frases curtas de benefício, não rótulos genéricos.',
    '- Feche com um bloco "Perguntas Frequentes" (3 a 5 perguntas entre aspas) atacando objeções gerais de quem compra um lançamento: é original, como funciona a garantia, serve para iniciante/uso profissional. Responda começando com "Sim." / "Serve." e só o que dá pra afirmar sem inventar.',
    '- Termine com uma linha curta de fechamento.',
    '',
    `TÍTULO: ${c.titulo}`,
    c.marca ? `MARCA: ${c.marca}` : '',
    c.modelo ? `MODELO: ${c.modelo}` : '',
    c.categoria ? `CATEGORIA: ${c.categoria}` : '',
    c.temFotos ? 'O anúncio terá fotos — NÃO descreva o que aparece nelas, você não as viu.' : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Escolhe a melhor categoria de uma LISTA fixa (a do `domain_discovery` do ML). O Claude não
 * inventa `category_id` — ele só pode devolver um dos que foram passados.
 */
export function promptEscolhaCategoria(
  titulo: string,
  candidatos: { category_id: string; category_name: string }[],
): string {
  return [
    'Você classifica produtos em categorias do Mercado Livre Brasil.',
    '',
    `PRODUTO (título): ${titulo}`,
    '',
    'CATEGORIAS CANDIDATAS (o preditor do Mercado Livre sugeriu estas — só pode escolher UMA delas):',
    ...candidatos.map((c) => `- ${c.category_id}: ${c.category_name}`),
    '',
    'Escolha a que MELHOR descreve este produto exato. Se estiver em dúvida entre duas, prefira a mais específica.',
    '',
    'RESPONDA SÓ COM ESTE JSON, sem texto antes ou depois:',
    '{"category_id":"<um id EXATAMENTE como está na lista>","motivo":"por que esta, em 1 frase"}',
  ].join('\n');
}

/** Lê a escolha de categoria. Descarta se o id não estiver entre os válidos (anti-alucinação). */
export function lerEscolhaCategoria(
  bruto: string,
  idsValidos: string[],
): { category_id: string; motivo: string } | null {
  const limpo = bruto.replace(/```(?:json)?/g, '').trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio < 0 || fim < inicio) return null;
  try {
    const o = JSON.parse(limpo.slice(inicio, fim + 1)) as { category_id?: unknown; motivo?: unknown };
    const id = typeof o.category_id === 'string' ? o.category_id.trim() : '';
    if (!id || !idsValidos.includes(id)) return null;
    return { category_id: id, motivo: typeof o.motivo === 'string' ? o.motivo : '' };
  } catch {
    return null;
  }
}

/** Roteiro do que fotografar — a IA NÃO gera imagem (o ML exige foto real do produto). */
export function promptRoteiroFotos(c: ContextoProdutoNovo): string {
  return [
    'Você orienta vendedores do Mercado Livre a fotografar um produto para o anúncio.',
    '',
    `PRODUTO: ${c.titulo}`,
    c.marca ? `MARCA: ${c.marca}` : '',
    c.modelo ? `MODELO: ${c.modelo}` : '',
    c.categoria ? `CATEGORIA: ${c.categoria}` : '',
    '',
    'Monte um roteiro de 5 a 8 fotos para este produto, na ordem em que devem aparecer no anúncio. Comece SEMPRE pela capa com fundo branco. Inclua ângulos (frente, verso, lateral), um detalhe de material/acabamento, uma foto de escala/tamanho (com referência), uma de uso real quando fizer sentido, e uma do que acompanha (caixa/acessórios) se o produto costuma vir com itens.',
    '',
    'RESPONDA SÓ COM ESTE JSON, sem texto antes ou depois:',
    '{"fotos":[{"titulo":"nome curto da foto","descricao":"o que enquadrar, 1 frase objetiva"}]}',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Lê o roteiro de fotos. Lista vazia se ilegível. */
export function lerRoteiroFotos(bruto: string): { titulo: string; descricao: string }[] {
  const limpo = bruto.replace(/```(?:json)?/g, '').trim();
  const inicio = limpo.indexOf('{');
  const fim = limpo.lastIndexOf('}');
  if (inicio < 0 || fim < inicio) return [];
  try {
    const o = JSON.parse(limpo.slice(inicio, fim + 1)) as { fotos?: unknown };
    const lista = Array.isArray(o.fotos) ? o.fotos : [];
    return lista
      .map((f) => f as { titulo?: unknown; descricao?: unknown })
      .filter((f) => typeof f.titulo === 'string' && (f.titulo as string).trim())
      .map((f) => ({
        titulo: (f.titulo as string).trim(),
        descricao: typeof f.descricao === 'string' ? f.descricao.trim() : '',
      }));
  } catch {
    return [];
  }
}
