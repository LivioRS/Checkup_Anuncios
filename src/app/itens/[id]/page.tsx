import Link from 'next/link';
import { carregarDiagnostico, diagnosticarImagens, tendenciasDaCategoria } from '@/lib/ml/analise';
import BotaoCorrigir from './BotaoCorrigir';
import PainelDeFalha from './Falhas';
import { Anel, Medidor, Selo, Stat, Secao, nivelPorNota } from '@/components/ui';
import Tags from '@/components/Tags';
import { registrarDesconhecidas, listarDesconhecidas } from '@/lib/ml/tags-novas';
import { comConta, type MlAccount } from '@/lib/ml/client';
import { abrirAnuncio } from '@/lib/ml/dono';
import { getItem, getCategoryAttributes, getTechnicalSpecsInput, buildFicha } from '@/lib/ml/attributes';
import type { FichaStats } from '@/lib/ml/model';
import { cruzarComTitulo, ROTULO_BLOCO, type Cobertura } from '@/lib/ml/tendencias';

export const dynamic = 'force-dynamic';

/**
 * Alguns campos do ML chegam ora como texto, ora como objeto ({ text: "..." }).
 * Sem normalizar, o React quebra com "Objects are not valid as a React child".
 */
function txt(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return v.map(txt).filter(Boolean).join(' · ');
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['text', 'value', 'title', 'label', 'message', 'name']) {
      const achou = txt(o[k]);
      if (achou) return achou;
    }
  }
  return '';
}

const brl = (v?: number) =>
  typeof v === 'number' ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';
const num = (v?: number) => (typeof v === 'number' ? v.toLocaleString('pt-BR') : '—');
const pct = (v?: number) => (typeof v === 'number' ? `${v.toFixed(2).replace('.', ',')}%` : '—');

/**
 * Nota de uma dimensão do /performance. Quando o ML manda o score, usamos ele.
 * Quando não manda, derivamos da proporção de regras concluídas — e é isso que
 * a legenda da tela diz, para ninguém confundir com número oficial.
 */
function notaDaDimensao(
  perf: { buckets?: { variables?: { key?: string; score?: number; rules?: { status?: string }[] }[] }[] } | undefined,
  chave: string,
): { valor: number; oficial: boolean } | null {
  for (const b of perf?.buckets ?? []) {
    for (const v of b.variables ?? []) {
      if (v.key !== chave) continue;
      if (typeof v.score === 'number') return { valor: v.score, oficial: true };
      const regras = v.rules ?? [];
      if (!regras.length) return null;
      const ok = regras.filter((r) => r.status === 'COMPLETED').length;
      return { valor: Math.round((ok / regras.length) * 100), oficial: false };
    }
  }
  return null;
}

function meses(desde?: string) {
  if (!desde) return '—';
  const m = (Date.now() - new Date(desde).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  return `${Math.floor(m)} meses`;
}

export default async function DiagnosticoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imagens?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  let d;
  let dona: MlAccount | null = null;
  // Leitura parcial: veio do multiget público, então vários blocos não existem.
  let parcial = false;
  try {
    // Descobre o dono antes de tudo: é ele quem define qual token usar e
    // quais blocos fazem sentido pedir.
    const aberto = await abrirAnuncio(id);
    dona = aberto.conta;
    parcial = !!aberto.parcial;
    d = await comConta(dona?.seller_id, () =>
      carregarDiagnostico(id, { ehMinha: !!dona, item: aberto.item, conta: aberto.conta }),
    );
  } catch (e) {
    return <PainelDeFalha id={id} erro={e} />;
  }

  // Resumo da ficha: as duas chamadas de categoria são cacheadas por 24 h, e o
  // item só é relido quando o anúncio é nosso (é o que traz os campos N/A).
  const resumoFicha: { stats: FichaStats; nome: (id: string) => string } | null = await comConta(
    dona?.seller_id,
    async () => {
      try {
        const alvo = dona ? await getItem(id, { internos: true }) : d!.item;
        const [catAttrs, specs] = await Promise.all([
          getCategoryAttributes(alvo.category_id),
          getTechnicalSpecsInput(alvo.category_id),
        ]);
        const ficha = buildFicha(alvo, catAttrs, specs);
        // Os stats guardam ids; quem lê a tela quer o nome do campo.
        const nomes = new Map(ficha.groups.flatMap((g) => g.fields).map((f) => [f.id, f.name]));
        return { stats: ficha.stats, nome: (i: string) => nomes.get(i) ?? i };
      } catch {
        return null;
      }
    },
  );

  // Palavras que os compradores digitam nessa categoria, cruzadas com o título.
  const tendencias: Cobertura | null = await comConta(dona?.seller_id, async () => {
    try {
      const termos = await tendenciasDaCategoria(d!.item.category_id, d!.item.site_id ?? 'MLB');
      return termos.length ? cruzarComTitulo(d!.item.title ?? '', termos) : null;
    } catch {
      return null;
    }
  });

  // Tag que o dicionário não conhece vira linha no banco em vez de sumir da tela.
  await registrarDesconhecidas(id, d.item.tags ?? [], d.vendedor?.tags ?? []);
  const tagsNovas = await listarDesconhecidas();

  const { item, performance: perf } = d;
  const imagens = sp.imagens === '1' ? await diagnosticarImagens(item) : null;

  const visitas = d.visitas?.total_visits ?? 0;
  const pedidos = d.vendas?.pedidos ?? 0;
  const conversao = visitas > 0 ? (pedidos / visitas) * 100 : undefined;
  const repasse =
    item.price && d.tarifas?.sale_fee_amount !== undefined
      ? item.price - d.tarifas.sale_fee_amount
      : undefined;

  const nota = perf?.score;
  const pendentes = (perf?.buckets ?? []).flatMap((b) =>
    (b.variables ?? []).flatMap((v) => (v.rules ?? []).filter((r) => r.status !== 'COMPLETED')),
  );
  const tirandoPontos = pendentes.filter((r) => r.mode === 'WARNING').length;

  const dimFicha = notaDaDimensao(perf, 'TECHNICAL_SPECIFICATIONS_MAIN');
  const dimImagens = notaDaDimensao(perf, 'PICTURES');
  const dimTitulo = notaDaDimensao(perf, 'TITLE');

  // A experiência vem em escala própria; só vira anel quando dá para normalizar.
  const expBruta = d.experiencia?.reputation?.value;
  const dimExperiencia =
    typeof expBruta === 'number'
      ? expBruta <= 1
        ? Math.round(expBruta * 100)
        : Math.round(expBruta)
      : null;

  return (
    <>
      <p style={{ margin: '0 0 10px' }}>
        <Link href="/">← buscar outro anúncio</Link>
      </p>
      <h1>{item.title}</h1>
      <p className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <Selo mono semIcone>
          {item.id}
        </Selo>
        <Selo semIcone>{item.category_id}</Selo>
        <Selo nivel={item.status === 'active' ? 'bom' : 'atencao'}>{item.status}</Selo>
        {(item.sub_status ?? []).map((s) => (
          <Selo key={s} nivel="critico">
            {s}
          </Selo>
        ))}
        {dona ? (
          <Selo nivel="bom">{dona.apelido ?? dona.seller_id}</Selo>
        ) : (
          <Selo nivel="atencao">de outro vendedor</Selo>
        )}
        {item.permalink ? (
          <a href={item.permalink} target="_blank" rel="noreferrer">
            ver no ML ↗
          </a>
        ) : null}
      </p>

      {item.catalog_listing ? (
        <section className="card">
          <p style={{ margin: 0 }}>
            <Selo nivel="atencao">anúncio de catálogo</Selo> Título, fotos e ficha técnica deste
            anúncio vêm da página de catálogo do Mercado Livre, não de você. O que continua sob seu
            controle é preço, estoque, frete e a disputa pelo buy box.
          </p>
        </section>
      ) : null}

      {dona ? null : (
        <section className="card">
          <p style={{ margin: 0 }}>
            <Selo nivel="atencao">somente leitura</Selo>
            {parcial ? <Selo nivel="atencao">leitura parcial</Selo> : null} Anúncio de outro
            vendedor. Aparece o que o Mercado Livre entrega publicamente — ficha, fotos, descrição,
            opiniões e tarifas. Nota de qualidade, moderação, infrações, vendas e frete só o dono
            enxerga.
            {parcial
              ? ' Este veio pelo multiget público, que devolve menos campos que a leitura normal — o que faltar aqui é limite da API, não do anúncio.'
              : ''}
          </p>
        </section>
      )}

      {/* ---------- faixa de anéis por dimensão ---------- */}
      <div className="card">
        <div className="destaque">
          <div className="lado">
            <Anel
              valor={nota ?? 0}
              nivel={nota !== undefined ? nivelPorNota(nota) : 'neutro'}
              sufixo=""
              legenda={
                nota !== undefined
                  ? txt(perf?.level_wording) || txt(perf?.level) || 'Qualidade'
                  : 'Sem nota'
              }
              detalhe={
                <small>
                  {nota !== undefined
                    ? tirandoPontos > 0
                      ? `${tirandoPontos} tirando pontos`
                      : 'nada penalizando'
                    : (d.erros.performance ?? 'ainda não calculada')}
                </small>
              }
            />
          </div>
          <div className="grade">
            <div className="medidores">
              {dimFicha ? (
                <Medidor valor={dimFicha.valor} rotulo="Ficha técnica" nivel={nivelPorNota(dimFicha.valor)} />
              ) : null}
              {dimImagens ? (
                <Medidor valor={dimImagens.valor} rotulo="Imagens" nivel={nivelPorNota(dimImagens.valor)} />
              ) : null}
              {dimTitulo ? (
                <Medidor valor={dimTitulo.valor} rotulo="Título" nivel={nivelPorNota(dimTitulo.valor)} />
              ) : null}
              {dimExperiencia !== null ? (
                <Medidor valor={dimExperiencia} rotulo="Experiência" nivel={nivelPorNota(dimExperiencia)} />
              ) : null}
              {d.reviews?.rating_average !== undefined ? (
                <Medidor
                  valor={d.reviews.rating_average ?? 0}
                  max={5}
                  sufixo=""
                  casas={1}
                  rotulo="Opiniões"
                  nivel={(d.reviews.rating_average ?? 0) >= 4 ? 'bom' : 'atencao'}
                />
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid k4" style={{ marginTop: 22, marginBottom: 0 }}>
          <Stat rotulo="Visitas 150d" valor={num(visitas)} />
          <Stat rotulo="Pedidos 150d" valor={num(pedidos)} />
          <Stat rotulo="Conversão" valor={conversao !== undefined ? pct(conversao) : '—'} nota="calculada aqui" />
          <Stat rotulo="Repasse" valor={brl(repasse)} nota="preço − comissão" />
        </div>
      </div>

      {/* ---------- qualidade detalhada ---------- */}
      <Secao
        titulo="Qualidade do anúncio"
        colapsavel
        aberta
        acao={
          <Link className="btn pequeno" href={`/itens/${id}/ficha`}>
            Preencher a ficha
          </Link>
        }
      >
        {perf?.buckets?.length ? (
          perf.buckets.map((b) => (
            <div key={b.key} style={{ marginBottom: 18 }}>
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {txt(b.title) || b.key}
                <Selo nivel={b.status === 'COMPLETED' ? 'bom' : 'atencao'}>
                  {b.status === 'COMPLETED' ? 'completo' : 'pendente'}
                </Selo>
              </h3>
              <div className="rolagem">
                <table className="tabela">
                  <tbody>
                    {(b.variables ?? []).map((v) => {
                      const abertos = (v.rules ?? []).filter((r) => r.status !== 'COMPLETED');
                      return (
                        <tr key={v.key}>
                          <td className="rotulo">
                            {txt(v.title) || v.key}
                            <br />
                            <small>{v.key}</small>
                          </td>
                          <td>
                            {abertos.length === 0 ? (
                              <Selo nivel="bom">ok</Selo>
                            ) : (
                              abertos.map((r, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: 'flex',
                                    gap: 8,
                                    alignItems: 'baseline',
                                    marginBottom: 6,
                                  }}
                                >
                                  <Selo nivel={r.mode === 'WARNING' ? 'critico' : 'atencao'}>
                                    {r.mode === 'WARNING' ? 'tirando pontos' : 'oportunidade'}
                                  </Selo>
                                  <span>
                                    {txt(r.wordings?.title) || r.key}
                                    {r.wordings?.link ? (
                                      <>
                                        {' '}
                                        <a href={r.wordings.link} target="_blank" rel="noreferrer">
                                          corrigir ↗
                                        </a>
                                      </>
                                    ) : null}
                                  </span>
                                </div>
                              ))
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        ) : (
          <p className="vazio">
            O Mercado Livre ainda não calculou a nota deste anúncio ({d.erros.performance ?? '—'}).
            Anúncios recém-publicados levam alguns dias.
          </p>
        )}
      </Secao>

      {/* ---------- ficha técnica ---------- */}
      <Secao
        titulo="Ficha técnica"
        colapsavel
        aberta={!!resumoFicha && resumoFicha.stats.missingRequired.length > 0}
        resumo={
          resumoFicha ? (
            <Selo nivel={nivelPorNota(resumoFicha.stats.pct)}>
              {resumoFicha.stats.filled} de {resumoFicha.stats.total} preenchidos
            </Selo>
          ) : (
            <Selo nivel="atencao">não carregou</Selo>
          )
        }
        acao={
          <Link className="btn pequeno" href={`/itens/${id}/ficha`}>
            Preencher a ficha
          </Link>
        }
      >
        {resumoFicha ? (
          <>
            <div className="grid k4" style={{ marginTop: 0 }}>
              <Stat rotulo="Preenchidos" valor={`${resumoFicha.stats.pct}%`} nota="só campos preenchíveis" />
              <Stat
                rotulo="Obrigatórios"
                valor={resumoFicha.stats.missingRequired.length}
                nota={resumoFicha.stats.missingRequired.length ? 'bloqueiam a publicação' : 'nenhum faltando'}
              />
              <Stat
                rotulo="Exposição"
                valor={resumoFicha.stats.missingSpecs.length}
                nota={resumoFicha.stats.missingSpecs.length ? 'custam exposição' : 'nenhum faltando'}
              />
              <Stat
                rotulo="Campos"
                valor={resumoFicha.stats.total}
                nota="editáveis nesta categoria"
              />
            </div>

            {resumoFicha.stats.missingRequired.length || resumoFicha.stats.missingSpecs.length ? (
              <p style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '4px 0 0' }}>
                {resumoFicha.stats.missingRequired.map((a) => (
                  <Selo key={`r-${a}`} nivel="critico">
                    {resumoFicha.nome(a)}
                  </Selo>
                ))}
                {resumoFicha.stats.missingSpecs.map((a) => (
                  <Selo key={`s-${a}`} nivel="atencao">
                    {resumoFicha.nome(a)}
                  </Selo>
                ))}
              </p>
            ) : (
              <p className="vazio">Nada faltando entre os campos que dá para preencher.</p>
            )}
          </>
        ) : (
          <p className="vazio">Não consegui montar a ficha desta categoria.</p>
        )}
      </Secao>

      <div className="grid k2">
        {/* ---------- preço e tarifas ---------- */}
        <Secao titulo="Preço e tarifas" colapsavel resumo={<Selo semIcone>{brl(item.price)}</Selo>}>
          {d.tarifas ? (
            <table className="tabela">
              <tbody>
                <tr>
                  <td className="rotulo">Preço</td>
                  <td>
                    <strong>{brl(item.price)}</strong>
                  </td>
                </tr>
                <tr>
                  <td className="rotulo">Comissão</td>
                  <td>
                    {brl(d.tarifas.sale_fee_amount)}{' '}
                    {d.tarifas.sale_fee_details?.percentage_fee !== undefined ? (
                      <small>({pct(d.tarifas.sale_fee_details.percentage_fee)} da categoria)</small>
                    ) : null}
                  </td>
                </tr>
                <tr>
                  <td className="rotulo">Taxa fixa</td>
                  <td>{brl(d.tarifas.sale_fee_details?.fixed_fee)}</td>
                </tr>
                <tr>
                  <td className="rotulo">Repasse por venda</td>
                  <td>
                    <strong>{brl(repasse)}</strong>
                    <br />
                    <small>não inclui o frete</small>
                  </td>
                </tr>
                <tr>
                  <td className="rotulo">Anúncio e envio</td>
                  <td style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <Selo semIcone>{d.tarifas.listing_type_name ?? item.listing_type_id}</Selo>
                    <Selo semIcone>{item.shipping?.logistic_type ?? '—'}</Selo>
                    {item.shipping?.free_shipping ? <Selo nivel="bom">frete grátis</Selo> : null}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="vazio">Não consegui calcular ({d.erros.tarifas ?? '—'}).</p>
          )}
        </Secao>

        {/* ---------- desempenho ---------- */}
        <Secao titulo="Desempenho" colapsavel resumo={<Selo semIcone>{meses(item.date_created)}</Selo>}>
          <table className="tabela">
            <tbody>
              <tr>
                <td className="rotulo">Idade do anúncio</td>
                <td>{meses(item.date_created)}</td>
              </tr>
              <tr>
                <td className="rotulo">Estoque</td>
                <td>{num(item.available_quantity)}</td>
              </tr>
              <tr>
                <td className="rotulo">Vendidos (histórico)</td>
                <td>{num(item.sold_quantity)}</td>
              </tr>
              <tr>
                <td className="rotulo">Conversão</td>
                <td>
                  {conversao !== undefined ? pct(conversao) : '—'}
                  <br />
                  <small>
                    pedidos ÷ visitas, calculado aqui — o ML não expõe conversão de anúncio
                    orgânico.
                  </small>
                </td>
              </tr>
            </tbody>
          </table>
        </Secao>
      </div>

      {/* ---------- moderação ---------- */}
      <Secao titulo="Moderação e infrações" colapsavel aberta={!!d.moderacao?.name} resumo={d.moderacao?.name ? <Selo nivel="critico">moderado</Selo> : <Selo nivel="bom">limpo</Selo>}>
        {d.moderacao?.name ? (
          <div style={{ marginBottom: 16 }}>
            <p style={{ marginTop: 0 }}>
              <Selo nivel="critico">{txt(d.moderacao.name)}</Selo>{' '}
              <small>
                {d.moderacao.date_created
                  ? new Date(d.moderacao.date_created).toLocaleString('pt-BR')
                  : ''}
              </small>
            </p>
            {(d.moderacao.wordings ?? []).map((w, i) => (
              <p key={i} style={{ margin: '6px 0' }}>
                <Selo nivel={w.type === 'REMEDY' ? 'acento' : 'atencao'}>
                  {w.type === 'REMEDY' ? 'como corrigir' : 'motivo'}
                </Selo>{' '}
                {txt(w.value) || txt(w.title)}
              </p>
            ))}
            {!(d.moderacao.wordings ?? []).some((w) => w.type === 'REMEDY') ? (
              <p style={{ margin: '6px 0' }}>
                <Selo nivel="critico">sem correção possível</Selo> O ML não devolveu instrução de
                remédio — nesse caso a moderação é irreversível.
              </p>
            ) : null}
          </div>
        ) : (
          <p style={{ marginTop: 0 }}>
            <Selo nivel="bom">limpo</Selo> Nenhuma moderação ativa neste anúncio.
          </p>
        )}

        <h3>Infrações recentes da conta</h3>
        {d.infracoes.length ? (
          <div className="rolagem">
            <table className="tabela">
              <tbody>
                {d.infracoes.map((inf) => (
                  <tr key={inf.id}>
                    <td className="rotulo" style={{ width: 160 }}>
                      <Selo nivel="atencao">{txt(inf.filter_subgroup) || '—'}</Selo>
                      <br />
                      <small>
                        {inf.date_created
                          ? new Date(inf.date_created).toLocaleDateString('pt-BR')
                          : ''}
                      </small>
                    </td>
                    <td>
                      {txt(inf.reason)}
                      {inf.related_item_id ? (
                        <>
                          <br />
                          <small>{inf.related_item_id}</small>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="vazio">
            Nenhuma infração recente {d.erros.infracoes ? `(${d.erros.infracoes})` : ''}.
          </p>
        )}
      </Secao>

      <div className="grid k2">
        {/* ---------- experiência e opiniões ---------- */}
        <Secao
          titulo="Experiência e opiniões"
          colapsavel
          resumo={
            d.reviews?.rating_average !== undefined ? (
              <Selo semIcone>{d.reviews.rating_average?.toFixed(1)} de 5</Selo>
            ) : null
          }
        >
          {d.experiencia?.reputation ? (
            <p style={{ marginTop: 0 }}>
              <Selo nivel="acento">{txt(d.experiencia.reputation.text) || 'reputação'}</Selo>{' '}
              {txt(d.experiencia.title) ? <strong>{txt(d.experiencia.title)}</strong> : null}
              {(d.experiencia.subtitles ?? []).map((s, i) => (
                <span key={i}>
                  <br />
                  <small>{txt(s)}</small>
                </span>
              ))}
            </p>
          ) : (
            <p className="vazio" style={{ marginTop: 0 }}>
              Sem dado de experiência ({d.erros.experiencia ?? '—'}).
            </p>
          )}

          {d.reviews?.rating_average !== undefined ? (
            <div style={{ marginTop: 10 }}>
              <Anel
                valor={d.reviews.rating_average ?? 0}
                max={5}
                sufixo=""
                tamanho={76}
                nivel={(d.reviews.rating_average ?? 0) >= 4 ? 'bom' : 'atencao'}
                legenda={`${d.reviews.paging?.total ?? 0} opiniões`}
                detalhe={
                  <small>
                    5★ {d.reviews.rating_levels?.five_star ?? 0} · 4★{' '}
                    {d.reviews.rating_levels?.four_star ?? 0} · 3★{' '}
                    {d.reviews.rating_levels?.three_star ?? 0} · 2★{' '}
                    {d.reviews.rating_levels?.two_star ?? 0} · 1★{' '}
                    {d.reviews.rating_levels?.one_star ?? 0}
                  </small>
                }
              />
            </div>
          ) : (
            <p className="vazio">Sem opiniões ({d.erros.reviews ?? 'nenhuma avaliação'}).</p>
          )}
        </Secao>

        {/* ---------- vendedor ---------- */}
        <Secao titulo="Vendedor">
          <table className="tabela">
            <tbody>
              <tr>
                <td className="rotulo">Conta</td>
                <td style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>{txt(d.vendedor?.nickname) || '—'}</strong>
                  <Selo semIcone>{txt(d.vendedor?.seller_reputation?.level_id) || 's/ nível'}</Selo>
                  <Selo semIcone>
                    {txt(d.vendedor?.seller_reputation?.power_seller_status) || 's/ status'}
                  </Selo>
                </td>
              </tr>
              <tr>
                <td className="rotulo">Transações</td>
                <td>
                  {num(d.vendedor?.seller_reputation?.transactions?.total)} no total ·{' '}
                  {num(d.vendedor?.seller_reputation?.transactions?.completed)} concluídas ·{' '}
                  {num(d.vendedor?.seller_reputation?.transactions?.canceled)} canceladas
                </td>
              </tr>
              <tr>
                <td className="rotulo">Vende desde</td>
                <td>
                  {d.vendedor?.registration_date
                    ? new Date(d.vendedor.registration_date).toLocaleDateString('pt-BR')
                    : '—'}
                </td>
              </tr>
            </tbody>
          </table>
        </Secao>
      </div>

      <div className="grid k2">
        {/* ---------- envio ---------- */}
        <Secao titulo="Envio" colapsavel resumo={item.shipping?.free_shipping ? <Selo nivel="bom">frete grátis</Selo> : null}>
          <table className="tabela">
            <tbody>
              <tr>
                <td className="rotulo">Sai de</td>
                <td>
                  {[item.seller_address?.city?.name, item.seller_address?.state?.name]
                    .filter(Boolean)
                    .join(' · ') || '—'}
                </td>
              </tr>
              <tr>
                <td className="rotulo">Custo do frete</td>
                <td>
                  {brl(d.frete?.coverage?.all_country?.list_cost)}
                  {d.frete?.coverage?.discount?.rate ? (
                    <>
                      {' '}
                      <Selo nivel="bom">
                        {Math.round((d.frete.coverage.discount.rate ?? 0) * 100)}% de desconto
                      </Selo>
                    </>
                  ) : null}
                  <br />
                  <small>
                    simulação do ML para 1 unidade
                    {d.erros.frete ? ` · ${d.erros.frete}` : ''}
                  </small>
                </td>
              </tr>
              <tr>
                <td className="rotulo">Peso considerado</td>
                <td>
                  {d.frete?.coverage?.all_country?.billable_weight
                    ? `${num(d.frete.coverage.all_country.billable_weight)} g`
                    : '—'}
                </td>
              </tr>
              <tr>
                <td className="rotulo">Selos</td>
                <td style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {item.shipping?.free_shipping ? (
                    <Selo nivel="bom">frete grátis</Selo>
                  ) : (
                    <Selo semIcone>sem frete grátis</Selo>
                  )}
                  {item.catalog_listing ? (
                    <Selo nivel="bom">catálogo</Selo>
                  ) : (
                    <Selo semIcone>fora do catálogo</Selo>
                  )}
                  {item.shipping?.logistic_type === 'fulfillment' ? (
                    <Selo nivel="bom">Full</Selo>
                  ) : (
                    <Selo semIcone>{item.shipping?.logistic_type ?? 'sem logística'}</Selo>
                  )}
                  {(item.shipping?.tags ?? []).includes('mandatory_free_shipping') ? (
                    <Selo nivel="atencao">frete grátis obrigatório</Selo>
                  ) : null}
                </td>
              </tr>
            </tbody>
          </table>
        </Secao>

        {/* ---------- reputação da conta ---------- */}
        <Secao titulo="Reputação da conta" colapsavel resumo={<Selo semIcone>{txt(d.vendedor?.seller_reputation?.level_id) || "—"}</Selo>}>
          {(() => {
            const rep = d.vendedor?.seller_reputation;
            const r = rep?.transactions?.ratings;
            const pos = Math.round((r?.positive ?? 0) * 100);
            const neu = Math.round((r?.neutral ?? 0) * 100);
            const neg = Math.round((r?.negative ?? 0) * 100);
            const nivelCor = (rep?.level_id ?? '').includes('green')
              ? 'bom'
              : (rep?.level_id ?? '').includes('red')
                ? 'critico'
                : 'atencao';
            const m = rep?.metrics;
            const linha = (
              rotulo: string,
              d2?: { value?: number; rate?: number; period?: string },
            ) => (
              <tr>
                <td className="rotulo">{rotulo}</td>
                <td>
                  <strong>{num(d2?.value)}</strong>{' '}
                  {typeof d2?.rate === 'number' ? (
                    <Selo nivel={d2.rate > 0.02 ? 'critico' : d2.rate > 0.01 ? 'atencao' : 'bom'}>
                      {pct(d2.rate * 100)}
                    </Selo>
                  ) : null}
                  {d2?.period ? (
                    <>
                      <br />
                      <small>{d2.period}</small>
                    </>
                  ) : null}
                </td>
              </tr>
            );

            return (
              <>
                <p style={{ marginTop: 0, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  <Selo nivel={nivelCor}>{rep?.level_id ?? 'sem nível'}</Selo>
                  {rep?.power_seller_status ? (
                    <Selo nivel="bom">{rep.power_seller_status}</Selo>
                  ) : null}
                  {(d.vendedor?.tags ?? []).includes('brand') ? (
                    <Selo nivel="bom">loja oficial</Selo>
                  ) : null}
                  {d.vendedor?.status?.list?.allow === false ? (
                    <Selo nivel="critico">conta impedida de publicar</Selo>
                  ) : null}
                </p>

                {r ? (
                  <>
                    <div className="avaliacoes" role="img" aria-label={`${pos}% positivas, ${neu}% neutras, ${neg}% negativas`}>
                      <i className="pos" style={{ width: `${pos}%` }} />
                      <i className="neu" style={{ width: `${neu}%` }} />
                      <i className="neg" style={{ width: `${neg}%` }} />
                    </div>
                    <p style={{ margin: '8px 0 14px', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <Selo nivel="bom">{pos}% positivas</Selo>
                      <Selo semIcone>{neu}% neutras</Selo>
                      <Selo nivel={neg > 5 ? 'critico' : 'neutro'} semIcone={neg <= 5}>
                        {neg}% negativas
                      </Selo>
                    </p>
                  </>
                ) : null}

                <table className="tabela">
                  <tbody>
                    {linha('Reclamações', m?.claims)}
                    {linha('Envios com atraso', m?.delayed_handling_time)}
                    {linha('Cancelamentos', m?.cancellations)}
                    <tr>
                      <td className="rotulo">Vendas concluídas</td>
                      <td>{num(m?.sales?.completed ?? rep?.transactions?.completed)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            );
          })()}
        </Secao>
      </div>

      {/* ---------- tags ---------- */}
      {/* ---------- o que o comprador busca ---------- */}
      <Secao
        titulo="Palavras buscadas na categoria"
        colapsavel
        acao={
          <Link className="btn pequeno" href={`/itens/${id}/titulo`}>
            Melhorar título
          </Link>
        }
        resumo={
          tendencias ? (
            <>
              <Selo nivel={tendencias.dentro.length ? 'bom' : 'atencao'}>
                {tendencias.dentro.length} no título
              </Selo>
              {tendencias.parcial.length ? (
                <Selo nivel="atencao">{tendencias.parcial.length} quase lá</Selo>
              ) : null}
            </>
          ) : (
            <Selo semIcone>sem dados</Selo>
          )
        }
      >
        {tendencias ? (
          <>
            <p style={{ marginTop: 0 }}>
              <small>
                Os 50 termos que o Mercado Livre publica para esta categoria, atualizados por
                semana. A API entrega a ordem, não o número de buscas — por isso aqui não aparece
                volume, e sim a posição e o tipo de cada termo.
              </small>
            </p>

            <h3>Já no título ({tendencias.dentro.length})</h3>
            {tendencias.dentro.length ? (
              <p style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 18px' }}>
                {tendencias.dentro.map((t) => (
                  <Selo key={t.keyword} nivel="bom">
                    {t.keyword}
                  </Selo>
                ))}
              </p>
            ) : (
              <p className="vazio">Nenhum termo da lista está inteiro no título.</p>
            )}

            {/* O balde que importa: termos a uma ou duas palavras de fechar. */}
            <h3>Quase lá ({tendencias.parcial.length})</h3>
            {tendencias.parcial.length ? (
              <>
                <p style={{ marginTop: 0 }}>
                  <small>
                    O título já tem parte destes termos. A coluna da direita diz exatamente qual
                    palavra falta para fechar — é o trabalho mais barato que existe aqui, desde que a
                    palavra descreva mesmo o seu produto.
                  </small>
                </p>
                <div className="rolagem" style={{ marginBottom: 18 }}>
                  <table className="tabela">
                    <tbody>
                      {tendencias.parcial.slice(0, 20).map((t) => (
                        <tr key={t.keyword}>
                          <td className="rotulo">
                            {t.url ? (
                              <a href={t.url} target="_blank" rel="noreferrer">
                                {t.keyword} ↗
                              </a>
                            ) : (
                              t.keyword
                            )}
                          </td>
                          <td style={{ width: 160 }}>
                            <Selo semIcone>{ROTULO_BLOCO[t.bloco]}</Selo>{' '}
                            <Selo mono semIcone>#{t.posicao}</Selo>
                          </td>
                          <td style={{ width: 220 }}>
                            <small>falta: </small>
                            {t.faltam.map((p) => (
                              <Selo key={p} nivel="atencao">
                                {p}
                              </Selo>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="vazio">Nenhum termo com palavras em comum com o título.</p>
            )}

            <h3>Outro produto ({tendencias.fora.length})</h3>
            <p>
              <small>
                Estes têm pouca ou nenhuma palavra em comum com o seu título — em geral porque são
                outro produto. Só vale puxar para o título o que descreve mesmo o que você vende:
                palavra que não é do produto derruba a conversão e pode virar moderação.
              </small>
            </p>
            <div className="rolagem">
              <table className="tabela">
                <tbody>
                  {tendencias.fora.slice(0, 30).map((t) => (
                    <tr key={t.keyword}>
                      <td className="rotulo">
                        {t.url ? (
                          <a href={t.url} target="_blank" rel="noreferrer">
                            {t.keyword} ↗
                          </a>
                        ) : (
                          t.keyword
                        )}
                      </td>
                      <td style={{ width: 200 }}>
                        <Selo semIcone>{ROTULO_BLOCO[t.bloco]}</Selo>{' '}
                        <Selo mono semIcone>
                          #{t.posicao}
                        </Selo>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {tendencias.fora.length > 30 ? (
              <small>Mostrando os 30 primeiros de {tendencias.fora.length}.</small>
            ) : null}
          </>
        ) : (
          <p className="vazio">
            O Mercado Livre não publica tendências para a categoria {item.category_id}. Costuma
            acontecer em categoria muito específica — a lista existe nos níveis mais altos.
          </p>
        )}
      </Secao>

      {/* ---------- catálogo ---------- */}
      <Secao
        titulo="Catálogo"
        colapsavel
        resumo={
          item.catalog_listing ? (
            <Selo nivel="atencao">anúncio de catálogo</Selo>
          ) : (item.item_relations ?? []).length ? (
            <Selo nivel="bom">
              vinculado ({(item.item_relations ?? []).length})
            </Selo>
          ) : (item.tags ?? []).includes('catalog_listing_eligible') ? (
            <Selo nivel="bom">elegível</Selo>
          ) : (
            <Selo semIcone>fora do catálogo</Selo>
          )
        }
        acao={
          <Link className="btn pequeno" href={`/itens/${id}/catalogo`}>
            Explorar produtos
          </Link>
        }
      >
        {(item.item_relations ?? []).length ? (
          <p style={{ marginTop: 0 }}>
            <Selo nivel="bom">vínculo ativo</Selo>{' '}
            <small>
              Este anúncio já gerou {(item.item_relations ?? []).length} anúncio(s) de catálogo. O
              original continua sendo de marketplace — por isso o Mercado Livre segue mostrando nele
              o convite para competir. Abra a tela de catálogo para ver os vinculados, o preço de
              cada um e se a sincronização está de pé.
            </small>
          </p>
        ) : null}

        <p style={{ marginTop: 0 }}>
          <small>
            Página de catálogo é onde vários vendedores disputam o mesmo produto. Entrar tem preço:
            título, fotos e ficha passam a ser do Mercado Livre, e preço, frete e estoque
            sincronizam entre os dois anúncios sem opção de desligar. A tela de catálogo mostra os
            produtos candidatos, deixa você abrir um específico pelo código, e compara a ficha dele
            com a sua antes de qualquer decisão.
          </small>
        </p>
      </Secao>

      <Secao
        titulo="Tags"
        colapsavel
        resumo={
          <>
            <Selo semIcone>{(item.tags ?? []).length} no anúncio</Selo>
            {tagsNovas.length ? <Selo nivel="atencao">{tagsNovas.length} a estudar</Selo> : null}
          </>
        }
      >
        <Tags
          doAnuncio={item.tags ?? []}
          doVendedor={d.vendedor?.tags ?? []}
          novas={tagsNovas}
        />
      </Secao>

      {/* ---------- descrição ---------- */}
      <Secao
        titulo="Descrição"
        colapsavel
        resumo={
          d.descricao?.plain_text !== undefined ? (
            <Selo semIcone>{num(d.descricao.plain_text.length)} caracteres</Selo>
          ) : (
            <Selo nivel="atencao">sem descrição</Selo>
          )
        }
        acao={
          <Link className="btn pequeno" href={`/itens/${id}/descricao`}>
            Analisar e reescrever
          </Link>
        }
      >
        {d.descricao?.plain_text !== undefined ? (
          <>
            <p style={{ marginTop: 0 }}>
              <small>
                {num(d.descricao.plain_text.length)} caracteres · atualizada em{' '}
                {d.descricao.last_updated
                  ? new Date(d.descricao.last_updated).toLocaleString('pt-BR')
                  : '—'}
              </small>
            </p>
            <pre className="texto">{d.descricao.plain_text.slice(0, 1500) || '(vazia)'}</pre>
          </>
        ) : (
          <p className="vazio">Este anúncio não tem descrição ({d.erros.descricao ?? '—'}).</p>
        )}
      </Secao>

      {/* ---------- imagens ---------- */}
      <Secao
        titulo={`Imagens (${(item.pictures ?? []).length})`}
        colapsavel
        acao={
          <span style={{ display: 'flex', gap: 8 }}>
            {imagens ? null : (
              <Link className="btn pequeno" href={`/itens/${id}?imagens=1`}>
                Diagnosticar
              </Link>
            )}
            <Link className="btn pequeno" href={`/itens/${id}/fotos`}>
              Abrir galeria
            </Link>
          </span>
        }
      >
        {imagens ? (
          <div className="fotos">
            {imagens.map((f) => (
              <div className="foto" key={f.picture_id}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {f.url ? <img src={f.url} alt="" /> : null}
                <div className="info">
                  {f.erro ? (
                    <Selo nivel="atencao">não avaliada</Selo>
                  ) : f.problemas.length ? (
                    f.problemas.map((p, i) => (
                      <Selo key={i} nivel="critico">
                        {p}
                      </Selo>
                    ))
                  ) : (
                    <Selo nivel="bom">sem apontamentos</Selo>
                  )}
                  {f.problemas.length ? (
                    <BotaoCorrigir itemId={id} pictureId={f.picture_id} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="fotos">
              {(item.pictures ?? []).slice(0, 8).map((f) => (
                <div className="foto" key={f.id}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.secure_url ?? f.url} alt="" />
                </div>
              ))}
            </div>
            <p style={{ margin: '14px 0 0' }}>
              <small>
                O ML avalia quatro critérios: fundo branco, tamanho mínimo, texto ou logo na imagem
                e marca d&apos;água. É uma chamada por foto, por isso só roda quando você pedir.
                Fundo e tamanho o painel corrige; texto, logo e marca d&apos;água exigem refazer a
                arte.
              </small>
            </p>
          </>
        )}
      </Secao>

      {Object.keys(d.erros).length ? (
        <Secao titulo="Blocos que não carregaram" colapsavel>
          <table className="tabela">
            <tbody>
              {Object.entries(d.erros).map(([k, v]) => (
                <tr key={k}>
                  <td className="rotulo" style={{ width: 150 }}>
                    {k}
                  </td>
                  <td>
                    <small>{v}</small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Secao>
      ) : null}
    </>
  );
}
