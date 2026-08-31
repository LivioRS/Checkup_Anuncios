/**
 * Teste de fumaça da lógica de montagem da ficha (sem chamar a API).
 * Rode com:  npm run verificar
 *
 * Os fixtures abaixo reproduzem estruturas reais da documentação do ML:
 * tags como objeto em /categories/{id}/attributes, tags como array em
 * technical_specs/input, booleano 242084/242085, N/A com value_id "-1".
 */
import assert from 'node:assert/strict';
import { buildFicha, normalizeOut, parseItemId } from '../src/lib/ml/model.ts';

// --- O que o usuário cola na busca -------------------------------------------
// Link de catálogo COM o anúncio no filtro: vale o item_id, não o da URL.
assert.deepEqual(
  parseItemId('https://www.mercadolivre.com.br/microfone-lapela/p/MLB2106826254?pdp_filters=item_id%3AMLB7478831254'),
  { tipo: 'item', id: 'MLB7478831254' },
);
// Link de catálogo puro: é produto, não anúncio — a tela explica em vez de dar 404.
assert.deepEqual(parseItemId('https://www.mercadolivre.com.br/microfone-lapela/p/MLB2106826254'), {
  tipo: 'produto',
  id: 'MLB2106826254',
});
// Link normal do anúncio, código solto e código com hífen.
assert.deepEqual(parseItemId('https://produto.mercadolivre.com.br/MLB-7478831254-microfone-_JM'), { tipo: 'item', id: 'MLB7478831254' });
assert.deepEqual(parseItemId('MLB7478831254'), { tipo: 'item', id: 'MLB7478831254' });
assert.deepEqual(parseItemId('  mlb-7478831254 '), { tipo: 'item', id: 'MLB7478831254' });
assert.equal(parseItemId('violao takamine gd93'), null);
// User Product: o mesmo produto físico pode ter vários anúncios pendurados.
assert.deepEqual(
  parseItemId('https://www.mercadolivre.com.br/microfone-dylan-celebrate-dc3000/up/MLBU4897802206'),
  { tipo: 'user_product', id: 'MLBU4897802206' },
);
assert.deepEqual(parseItemId('MLBU4897802206'), { tipo: 'user_product', id: 'MLBU4897802206' });
// e o MLBU não pode ser confundido com um item comum
assert.notEqual(parseItemId('MLBU4897802206').tipo, 'item');


const catAttrs = [
  { id: 'BRAND', name: 'Marca', value_type: 'string', tags: { required: true }, attribute_group_id: 'MAIN', attribute_group_name: 'Principais' },
  { id: 'MODEL', name: 'Modelo', value_type: 'string', value_max_length: 60, tags: {}, suggested_values: [{ id: '1', name: 'B228D' }], attribute_group_id: 'MAIN', attribute_group_name: 'Principais' },
  { id: 'VOLUME_CAPACITY', name: 'Capacidade', value_type: 'number_unit', tags: { fixed: true }, allowed_units: [{ id: 'l', name: 'L' }], default_unit: 'l' },
  { id: 'BLUETOOTH', name: 'Bluetooth', value_type: 'boolean', tags: {}, values: [{ id: '242084', name: 'Não' }, { id: '242085', name: 'Sim' }] },
  { id: 'COLOR', name: 'Cor', value_type: 'list', tags: { allow_variations: true, hidden: true }, values: [{ id: '52049', name: 'Preto' }] },
  { id: 'GTIN', name: 'Código universal', value_type: 'string', tags: { multivalued: true, hidden: true, catalog_required: true } },
  { id: 'SELLER_SKU', name: 'SKU', value_type: 'string', tags: { read_only: true } },
];

const specs = {
  groups: [
    {
      id: 'MAIN',
      label: 'Características principais',
      components: [
        { component: 'COMBO', label: 'Marca', ui_config: { allow_custom_value: true }, attributes: [{ id: 'BRAND', name: 'Marca', value_type: 'string', tags: ['required', 'catalog_required'] }] },
        { component: 'TEXT_INPUT', label: 'Modelo', ui_config: { allow_custom_value: false }, attributes: [{ id: 'MODEL', name: 'Modelo', value_type: 'string', tags: ['required'] }] },
        { component: 'TEXT_INPUT', label: 'Bluetooth', attributes: [{ id: 'BLUETOOTH', name: 'Bluetooth', value_type: 'boolean', tags: [] }] },
      ],
    },
  ],
};

const item = {
  id: 'MLB123',
  title: 'Micro-ondas',
  category_id: 'MLB1002',
  condition: 'new',
  tags: ['incomplete_technical_specs'],
  attributes: [
    { id: 'MODEL', value_id: null, value_name: 'B228D' },
    { id: 'BLUETOOTH', value_id: '-1', value_name: null },
    { id: 'VOLUME_CAPACITY', value_id: null, value_name: '18 L' },
  ],
};

const ficha = buildFicha(item, catAttrs, specs);
const campos = Object.fromEntries(ficha.groups.flatMap((g) => g.fields).map((f) => [f.id, f]));

// 1. Ordem e agrupamento vêm da ficha técnica
assert.equal(ficha.groups[0].id, 'MAIN');
assert.deepEqual(ficha.groups[0].fields.slice(0, 3).map((f) => f.id), ['BRAND', 'MODEL', 'BLUETOOTH']);

// 2. required de /attributes bloqueia publicação; required só na ficha é "exposição"
assert.equal(campos.BRAND.required, true);
assert.equal(campos.MODEL.required, false);
assert.equal(campos.MODEL.requiredForSpecs, true);

// 3. fixed é bloqueado: só aparece no modo "ver tudo", e nunca conta na completude
const comTudo = buildFicha(item, catAttrs, specs, { includeHidden: true });
const todosCampos = Object.fromEntries(comTudo.groups.flatMap((g) => g.fields).map((f) => [f.id, f]));
assert.equal(todosCampos.VOLUME_CAPACITY.readOnly, true);
assert.equal(todosCampos.VOLUME_CAPACITY.readOnlyReason, 'fixed');
// o total do modo completo não pode ser menor que o do padrão
assert.ok(comTudo.stats.total >= ficha.stats.total);

// 4. N/A é reconhecido e não conta como vazio
assert.equal(campos.BLUETOOTH.isNA, true);
assert.equal(campos.BLUETOOTH.filled, false);

// 5. Por padrão aparece TUDO que dá para preencher; só o bloqueado fica fora.
// Oculto não é bloqueado: aceita valor pela API e vale como informação, então
// escondê-lo daria impressão falsa de ficha completa.
assert.equal(campos.SELLER_SKU, undefined, 'read_only não deve aparecer por padrão');
assert.equal(campos.VOLUME_CAPACITY, undefined, 'fixed não deve aparecer por padrão, mesmo com valor');
assert.ok(campos.COLOR, 'oculto preenchível deve aparecer por padrão');

// 6. hidden com catalog_required aparece (exigido pela ficha)
assert.ok(campos.GTIN, 'GTIN deveria aparecer por ser exigido pela ficha');

// 7. Estatísticas
assert.deepEqual(ficha.stats.missingRequired, ['BRAND']);
assert.equal(ficha.stats.incompleteSpecsTag, true);
assert.equal(ficha.stats.filled, 2); // MODEL preenchido + BLUETOOTH N/A
assert.ok(ficha.stats.total >= 4);

// 8. Payload de escrita
assert.deepEqual(normalizeOut(campos.BLUETOOTH, { id: 'BLUETOOTH', value_id: '242085', value_name: 'Sim' }), { id: 'BLUETOOTH', value_id: '242085' });
assert.deepEqual(normalizeOut(campos.BRAND, { id: 'BRAND', value_id: '-1' }), { id: 'BRAND', value_id: '-1', value_name: null });
assert.deepEqual(normalizeOut(campos.MODEL, { id: 'MODEL', value_id: null, value_name: ' B466GT ' }), { id: 'MODEL', value_name: 'B466GT' });
assert.deepEqual(normalizeOut(campos.MODEL, { id: 'MODEL', value_id: null, value_name: null }), { id: 'MODEL', value_id: null, value_name: null });

// 9. Com includeHidden aparece tudo, inclusive oculto e bloqueado
const tudo = buildFicha(item, catAttrs, specs, { includeHidden: true });
const todos = Object.fromEntries(tudo.groups.flatMap((g) => g.fields).map((f) => [f.id, f]));
assert.ok(todos.COLOR, 'COLOR (oculto) deveria aparecer com includeHidden');
assert.equal(todos.COLOR.hidden, true);
assert.ok(todos.SELLER_SKU, 'SELLER_SKU (read_only) deveria aparecer com includeHidden');
assert.equal(todos.SELLER_SKU.readOnly, true);
// Bloqueado nunca entra na conta de completude, nem no modo completo
const bloqueados = tudo.groups.flatMap((g) => g.fields).filter((f) => f.readOnly);
assert.ok(bloqueados.length > 0);
assert.equal(tudo.stats.total, tudo.groups.flatMap((g) => g.fields).length - bloqueados.length);

// 10. Categoria sem ficha técnica publicada continua funcionando
const semSpecs = buildFicha(item, catAttrs, { groups: [] });
assert.ok(semSpecs.groups.length > 0);
assert.deepEqual(semSpecs.stats.missingRequired, ['BRAND']);

console.log('OK — todos os testes da montagem da ficha passaram.');
console.log(`   ${ficha.stats.filled}/${ficha.stats.total} preenchidos (${ficha.stats.pct}%), grupos: ${ficha.groups.map((g) => g.label).join(' | ')}`);

/* ---- tendências: casamento de termo com o título ---- */
{
  const { noTitulo, cruzarComTitulo } = await import('../src/lib/ml/tendencias.ts');
  const titulo = 'Fone De Ouvido Dylan Dl-500 Preto Over-ear Sem Fio Bluetooth';
  const casos = [
    ['fone de ouvido', true],
    ['fone bluetooth', true],
    ['sem fio', true],
    ['led', false],           // não pode casar dentro de outra palavra
    ['fone gamer', false],
    ['bluetooth fone', true], // ordem não importa
  ];
  for (const [termo, esperado] of casos) {
    const obtido = noTitulo(titulo, termo);
    if (obtido !== esperado) {
      throw new Error(`noTitulo("${termo}") deu ${obtido}, esperava ${esperado}`);
    }
  }
  const c = cruzarComTitulo(titulo, [
    { keyword: 'fone de ouvido', bloco: 'buscadas', posicao: 1 },
    { keyword: 'caixa de som', bloco: 'buscadas', posicao: 2 },
  ]);
  if (c.dentro.length !== 1 || c.fora.length !== 1) throw new Error('cruzarComTitulo separou errado');
  console.log('OK — cruzamento de tendências com o título.');
}

/* ---- plano de título: leitura do JSON do Claude ---- */
{
  const { lerPlanoTitulo, LIMITE_TITULO } = await import('../src/lib/ia-tipos.ts');
  const longo = 'A'.repeat(LIMITE_TITULO + 25);
  const plano = lerPlanoTitulo(
    '```json\n' +
      JSON.stringify({
        titulos: [
          { texto: longo, motivo: 'x', termos: ['fone bluetooth'] },
          { texto: '', motivo: 'vazio', termos: [] },
        ],
        modelo: { base: 'DL-500', termos: ['fone bluetooth'], motivo: 'modelo real', risco: null },
        descartados: [{ termo: 'caixa de som', motivo: 'outro produto' }],
      }) +
      '\n```',
  );
  if (!plano) throw new Error('lerPlanoTitulo devolveu null');
  if (plano.titulos.length !== 1) throw new Error('título vazio deveria ser descartado');
  if (plano.titulos[0].texto.length !== LIMITE_TITULO) {
    throw new Error(`título deveria ser cortado em ${LIMITE_TITULO}`);
  }
  if (plano.modelo?.base !== 'DL-500') throw new Error('modelo não foi lido');
  if (plano.modelo?.termos?.[0] !== 'fone bluetooth') throw new Error('termos do modelo não lidos');
  if (plano.descartados.length !== 1) throw new Error('descartados não foram lidos');
  console.log('OK — leitura do plano de título.');
}

/* ---- montagem do campo MODEL ---- */
{
  const { montarModelo } = await import('../src/lib/ia-tipos.ts');

  // Separador é sempre espaço — nunca vírgula.
  const a = montarModelo('DL-500', ['fone bluetooth', 'headphone gamer'], 60);
  if (a.valor !== 'DL-500 fone bluetooth headphone gamer') throw new Error(`montou "${a.valor}"`);
  if (a.valor.includes(',')) throw new Error('não pode entrar vírgula');

  // Não estoura o limite, e o que não cabe vai para sobraram inteiro.
  const b = montarModelo('DL-500', ['fone bluetooth sem fio over ear', 'headphone gamer'], 40);
  if (b.valor.length > 40) throw new Error('passou do limite');
  if (b.sobraram.length !== 1) throw new Error('o termo que não coube deveria sobrar');
  if (b.valor.includes('headphone')) throw new Error('não pode entrar termo cortado');

  // Palavra que já está no TÍTULO não se repete no modelo.
  const c = montarModelo('DL-500', ['fone bluetooth', 'caixa som'], 80, {
    evitar: 'Fone De Ouvido Bluetooth Dylan',
  });
  if (c.usados.includes('fone bluetooth')) throw new Error('termo já no título não pode entrar');
  if (!c.repetidos.includes('fone bluetooth')) throw new Error('deveria constar em repetidos');
  if (!c.usados.includes('caixa som')) throw new Error('termo novo deveria entrar');

  // Palavra repetida entre os próprios termos também é descartada.
  const d = montarModelo('Guitarra', ['guitarra eletrica', 'eletrica guitarra'], 80);
  if (d.usados.length !== 1) throw new Error('o segundo termo é a mesma coisa e deveria sair');

  // Base maior que o limite é cortada, e o campo não estoura.
  const e = montarModelo('X'.repeat(80), ['algo'], 60);
  if (e.valor.length !== 60) throw new Error('base longa deveria ser cortada no limite');

  console.log('OK — montagem do campo MODEL.');
}

/* ---- tags fora do dicionário ---- */
{
  const { desconhecidas, dicionario } = await import('../src/lib/ml/tags.ts');
  const fora = desconhecidas(['good_quality_picture', 'tag_que_nao_existe'], 'anuncio');
  if (fora.length !== 1 || fora[0] !== 'tag_que_nao_existe') {
    throw new Error(`desconhecidas devolveu ${JSON.stringify(fora)}`);
  }
  const dic = dicionario('anuncio');
  if (!dic.length) throw new Error('dicionário vazio');
  const pesos = dic.map((d) => d.info.peso);
  if (pesos.indexOf('neutro') !== -1 && pesos.lastIndexOf('ruim') > pesos.indexOf('neutro')) {
    throw new Error('dicionário deveria vir com as ruins primeiro');
  }
  console.log('OK — dicionário de tags.');
}

/* ---- leitura de erro do ML em qualquer formato ---- */
{
  // Não dá para importar o componente (é 'use client' + JSX), então a regra é
  // testada aqui na mesma forma em que ela existe lá: nada de for...of cego.
  const ler = (json) => {
    try {
      const body = json?.body ?? {};
      const partes = [];
      const texto = (v) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'string') return v.trim();
        if (typeof v === 'number' || typeof v === 'boolean') return String(v);
        if (Array.isArray(v)) return v.map(texto).filter(Boolean).join(' · ');
        return ['code', 'message', 'cause', 'department']
          .map((k) => texto(v[k]))
          .filter(Boolean)
          .join(' · ');
      };
      for (const chave of ['message', 'error', 'cause']) {
        const t = texto(body[chave]);
        if (t && !partes.includes(t)) partes.push(t);
      }
      if (!partes.length && json?.erro) partes.push(json.erro);
      return partes.join(' — ') || 'O ML recusou e não explicou o motivo.';
    } catch (e) {
      return `falhou: ${e.message}`;
    }
  };

  // O caso que quebrou de verdade: cause veio como número.
  const a = ler({ body: { message: 'Validation error', cause: 374 } });
  if (!a.includes('374')) throw new Error(`perdeu o código: ${a}`);
  if (a.startsWith('falhou')) throw new Error(a);

  // Lista de objetos, o formato comum.
  const b = ler({ body: { cause: [{ code: 'item.title.invalid', message: 'título inválido' }] } });
  if (!b.includes('item.title.invalid')) throw new Error(`perdeu o code: ${b}`);

  // String solta, e corpo vazio caindo no erro do painel.
  if (!ler({ body: { cause: 'texto puro' } }).includes('texto puro')) throw new Error('string');
  if (!ler({ erro: 'sem corpo' }).includes('sem corpo')) throw new Error('fallback');

  console.log('OK — leitura de erro do ML.');
}

/* ---- nome de vitrine da loja ---- */
{
  const { nomeDaLoja } = await import('../src/lib/loja.ts');
  const casos = [
    ['471489691', 'Ponto Musical'],
    ['177795203', 'Ponto Musical'],
    ['3244206480', 'Ponto Musical'],
    ['1814100', 'Banana Music'],
    ['1104686442', 'Irmãos Brothers'],
  ];
  for (const [id, esperado] of casos) {
    const obtido = nomeDaLoja(id);
    if (obtido !== esperado) throw new Error(`nomeDaLoja(${id}) deu "${obtido}"`);
  }
  // Conta fora do mapa cai no apelido tratado, nunca no código cru.
  if (nomeDaLoja('999', 'LOJA_NOVA_XY') !== 'Loja Nova Xy') throw new Error('fallback do apelido');
  if (nomeDaLoja(null) !== 'nossa loja') throw new Error('fallback sem apelido');
  console.log('OK — nome de vitrine por conta.');
}

/* ---- agrupamento de perguntas ---- */
{
  const { agruparPerguntas } = await import('../src/lib/ml/perguntas.ts');
  const g = agruparPerguntas([
    { texto: 'Vem com capa?', resposta: null },
    { texto: 'Acompanha capa mesmo?', resposta: 'Sim, acompanha capa.' },
    { texto: 'É boa para iniciante?', resposta: 'Sim.' },
  ]);
  const capa = g.find((x) => x.texto.toLowerCase().includes('capa'));
  if (!capa) throw new Error('perdeu a pergunta da capa');
  if (capa.vezes !== 2) throw new Error(`deveria agrupar as duas de capa, deu ${capa.vezes}`);
  if (capa.resposta !== 'Sim, acompanha capa.') throw new Error('deveria herdar a resposta dada');
  if (g[0].vezes < g[g.length - 1].vezes) throw new Error('mais repetida deveria vir primeiro');
  console.log('OK — agrupamento de perguntas reais.');
}

/* ---- blocos fixos grudados em código ---- */
{
  // grudarBlocos é puro, mas mora no ia.ts (server-only). A regra é testada aqui
  // na mesma forma em que existe lá: cópia literal, idempotente, sem duplicar.
  const grudar = (texto, blocos) => {
    let saida = texto.trimEnd();
    const anexar = (titulo, corpo) => {
      if (!corpo || !corpo.trim()) return;
      const marca = new RegExp(`\\n\\s*${titulo}\\s*\\n`, 'i');
      const achou = saida.search(marca);
      if (achou > -1) saida = saida.slice(0, achou).trimEnd();
      saida += `\n\n${titulo}\n${corpo.trim()}`;
    };
    anexar('SOBRE A LOJA', blocos.sobre);
    anexar('GARANTIA', blocos.garantia);
    return saida;
  };

  const blocos = { sobre: 'Somos a loja X.', garantia: '90 dias contra defeito.' };

  // Cópia literal, sem paráfrase.
  const a = grudar('Texto do produto.', blocos);
  if (!a.includes('\nSOBRE A LOJA\nSomos a loja X.')) throw new Error('bloco não veio literal');
  if (!a.includes('\nGARANTIA\n90 dias contra defeito.')) throw new Error('garantia não veio literal');

  // Idempotente: rodar duas vezes não duplica.
  const b = grudar(a, blocos);
  if ((b.match(/GARANTIA/g) || []).length !== 1) throw new Error('duplicou a garantia');

  // Se o modelo escreveu a própria versão, ela é substituída pela oficial.
  const c = grudar('Produto.\n\nGARANTIA\nAchei que era 1 ano.', blocos);
  if (c.includes('1 ano')) throw new Error('deveria substituir a versão inventada');
  if (!c.includes('90 dias contra defeito.')) throw new Error('perdeu a garantia oficial');

  // Bloco vazio não vira título órfão.
  if (grudar('Produto.', { sobre: '' }).includes('SOBRE A LOJA')) throw new Error('título órfão');

  console.log('OK — blocos fixos grudados em código.');
}

/* ---- origem: onde ela mora e quando trava ---- */
{
  const { origemDoItem, origemPendente } = await import('../src/lib/ml/origem.ts');

  // Categoria com o campo e valor preenchido: livre.
  const a = origemDoItem(
    { category_id: 'X', attributes: [{ id: 'ORIGIN', name: 'Origem', value_name: 'China' }] },
    [{ id: 'ORIGIN', name: 'Origem', value_type: 'string' }],
  );
  if (a.valor !== 'China' || origemPendente(a)) throw new Error('preenchida não deveria travar');

  // Categoria com o campo e valor vazio: trava, e o lugar é a ficha.
  const b = origemDoItem({ category_id: 'X', attributes: [] }, [
    { id: 'ORIGIN', name: 'Origem', value_type: 'string' },
  ]);
  if (!b.existe || !origemPendente(b)) throw new Error('vazia na ficha deveria travar');

  // N/A não vale como preenchida: origem N/A não existe.
  const c = origemDoItem(
    { category_id: 'X', attributes: [{ id: 'ORIGIN', name: 'Origem', value_id: '-1' }] },
    [{ id: 'ORIGIN', name: 'Origem', value_type: 'string' }],
  );
  if (!origemPendente(c)) throw new Error('N/A não deveria contar como preenchida');

  // Categoria SEM o campo: não trava por aqui — a tela é que pede.
  const d = origemDoItem({ category_id: 'X', attributes: [] }, [
    { id: 'BRAND', name: 'Marca', value_type: 'string' },
  ]);
  if (d.existe || origemPendente(d)) throw new Error('sem campo na categoria, não trava aqui');

  // Nome diferente, id desconhecido: continua sendo pego.
  const e = origemDoItem({ category_id: 'X', attributes: [] }, [
    { id: 'XPTO_123', name: 'País de fabricação', value_type: 'string' },
  ]);
  if (!e.existe) throw new Error('deveria reconhecer pelo nome do atributo');

  console.log('OK — regra da origem.');
}

/* ---- sincronia do estado do formulário quando os campos mudam ---- */
{
  // Reproduz a regra do FichaForm: o mapa de valores acompanha a lista de
  // campos, preservando o que já foi editado. Era isso que faltava quando o
  // toggle de ocultos trocava os campos e a comparação lia undefined.
  const sincronizar = (base, atual) => {
    const ids = Object.keys(base);
    const mesmas = ids.length === Object.keys(atual).length && ids.every((id) => id in atual);
    if (mesmas) return atual;
    return Object.fromEntries(ids.map((id) => [id, atual[id] ?? base[id]]));
  };

  const base1 = { BRAND: { value_name: 'Tagima' }, MODEL: { value_name: 'TG530' } };
  const editado = { BRAND: { value_name: 'EDITADO' }, MODEL: { value_name: 'TG530' } };

  // Campos iguais: devolve o MESMO objeto, para não disparar render à toa.
  if (sincronizar(base1, editado) !== editado) throw new Error('sem mudança não deveria recriar');

  // Campo novo aparece (ligou "ver ocultos"): entra sem perder o que foi editado.
  const base2 = { ...base1, GTIN: { value_name: '789' } };
  const r = sincronizar(base2, editado);
  if (r.BRAND.value_name !== 'EDITADO') throw new Error('perdeu a edição do usuário');
  if (!r.GTIN) throw new Error('campo novo não entrou');

  // Campo some (desligou o toggle): sai do mapa, sem sobrar chave órfã.
  const r2 = sincronizar(base1, r);
  if ('GTIN' in r2) throw new Error('campo removido deveria sair');
  if (r2.BRAND.value_name !== 'EDITADO') throw new Error('ainda deveria manter a edição');

  console.log('OK — sincronia do formulário da ficha.');
}

/* ---- origem dentro do texto da descrição ---- */
{
  const { temOrigem, inserirOrigem } = await import('../src/lib/ia-tipos.ts');

  if (temOrigem('Texto qualquer sem nada.')) throw new Error('não deveria achar origem');
  if (!temOrigem('Principais características\nMarca: Tagima\nOrigem: China')) {
    throw new Error('deveria achar a linha de origem');
  }
  if (!temOrigem('País de origem: Brasil')) throw new Error('deveria aceitar a variação');
  if (temOrigem('Origem:')) throw new Error('origem sem valor não conta');

  // Entra no fim do bloco de características, não no fim do texto.
  const t = 'Abertura.\n\nPrincipais características\nMarca: Tagima\nModelo: TG530\n\nFechamento.';
  const r = inserirOrigem(t, 'China');
  const linhas = r.split('\n');
  if (linhas[linhas.indexOf('Modelo: TG530') + 1] !== 'Origem: China') {
    throw new Error('deveria entrar logo após a última característica');
  }

  // Sem bloco de características, entra antes dos blocos da loja.
  const t2 = 'Abertura.\n\nSOBRE A LOJA\nSomos a loja X.';
  const r2 = inserirOrigem(t2, 'Brasil');
  if (r2.indexOf('Origem: Brasil') > r2.indexOf('SOBRE A LOJA')) {
    throw new Error('deveria entrar antes dos blocos fixos');
  }

  // Idempotente: substitui em vez de duplicar.
  const r3 = inserirOrigem(inserirOrigem(t, 'China'), 'Brasil');
  if ((r3.match(/Origem:/g) || []).length !== 1) throw new Error('duplicou a origem');
  if (!r3.includes('Origem: Brasil')) throw new Error('deveria ter trocado o valor');

  console.log('OK — origem dentro do texto.');
}

/* ---- comparação de ficha com o produto de catálogo ---- */
{
  const { compararFicha, prontoParaVincular } = await import('../src/lib/ml/catalogo-tipos.ts');

  const item = {
    id: 'MLB1',
    title: 'x',
    category_id: 'C',
    attributes: [
      { id: 'BRAND', name: 'Marca', value_id: '9344', value_name: 'Apple' },
      { id: 'COLOR', name: 'Cor', value_id: '52049', value_name: 'Preto' },
      { id: 'GTIN', name: 'GTIN', value_name: '789' },
      { id: 'NA_AQUI', name: 'Não se aplica', value_id: '-1' },
      { id: 'SO_MEU', name: 'Só meu', value_name: 'valor' },
    ],
  };
  const produto = {
    id: 'MLB9',
    status: 'active',
    attributes: [
      { id: 'BRAND', name: 'Marca', value_id: '9344', value_name: 'Apple' },
      { id: 'COLOR', name: 'Cor', value_id: '999', value_name: 'Branco' },
      { id: 'RAM', name: 'Memória', value_id: '1', value_name: '8 GB' },
      { id: 'GTIN', name: 'GTIN', value_name: '789' },
    ],
  };

  const linhas = compararFicha(item, produto);
  const por = Object.fromEntries(linhas.map((l) => [l.id, l]));

  if (por.BRAND.situacao !== 'igual') throw new Error('mesmo value_id deveria conferir');
  if (por.COLOR.situacao !== 'diferente') throw new Error('value_id distinto deveria divergir');
  if (por.RAM.situacao !== 'falta') throw new Error('atributo ausente no anúncio deveria faltar');
  if (por.GTIN.situacao !== 'igual') throw new Error('sem value_id, compara o texto');
  if (por.SO_MEU.situacao !== 'extra') throw new Error('atributo só do anúncio é extra');
  if (por.NA_AQUI) throw new Error('N/A não deveria virar linha');
  if (linhas[0].situacao !== 'diferente') throw new Error('divergência deveria vir primeiro');

  // Regras de vínculo: pai nunca serve, inativo nunca serve.
  const pai = prontoParaVincular({ status: 'inactive', children_ids: ['a', 'b'] });
  if (pai.ok || !pai.ehPai) throw new Error('produto pai não pode ser vinculado');
  const inativo = prontoParaVincular({ status: 'inactive', children_ids: [] });
  if (inativo.ok) throw new Error('produto inativo não pode ser vinculado');
  const bom = prontoParaVincular({ status: 'active', children_ids: [] });
  if (!bom.ok) throw new Error('filho ativo deveria poder');

  console.log('OK — comparação de ficha com o catálogo.');
}

/* ---- cobertura do título pelos termos buscados ---- */
{
  const { cobertura, cruzarComTitulo } = await import('../src/lib/ml/tendencias.ts');
  const titulo = 'Fone De Ouvido Bluetooth Dylan Dl-900 Cancelamento Ruído Preto';

  // Termo inteiro dentro do título.
  const a = cobertura(titulo, 'fone de ouvido');
  if (a.razao !== 1 || a.faltam.length) throw new Error('deveria cobrir inteiro');

  // Falta uma parte, e a tela precisa saber QUAL.
  const b = cobertura(titulo, 'fone de ouvido sem fio');
  if (b.razao >= 1) throw new Error('não deveria cobrir inteiro');
  if (!b.faltam.includes('sem') || !b.faltam.includes('fio')) {
    throw new Error(`deveria apontar as palavras que faltam, deu ${JSON.stringify(b.faltam)}`);
  }

  // Produto diferente: pouca palavra em comum.
  if (cobertura(titulo, 'caixa de som jbl').razao >= 0.5) throw new Error('deveria ficar fora');

  const c = cruzarComTitulo(titulo, [
    { keyword: 'fone de ouvido', bloco: 'buscadas', posicao: 1 },
    { keyword: 'fone de ouvido sem fio', bloco: 'buscadas', posicao: 2 },
    { keyword: 'fone bluetooth sem fio', bloco: 'buscadas', posicao: 3 },
    { keyword: 'airpods apple', bloco: 'buscadas', posicao: 4 },
  ]);
  if (c.dentro.length !== 1) throw new Error('um deveria estar inteiro no título');
  if (c.parcial.length !== 2) throw new Error('dois deveriam ser parciais');
  if (c.fora.length !== 1) throw new Error('um deveria ser de outro produto');
  // O mais perto de fechar aparece primeiro.
  if (c.parcial[0].faltam.length > c.parcial[1].faltam.length) {
    throw new Error('parciais deveriam vir do mais perto para o mais longe');
  }

  console.log('OK — cobertura do título.');
}
