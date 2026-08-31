import Link from 'next/link';
import FichaForm from './FichaForm';
import PainelDeFalha from '../Falhas';
import {
  getItem,
  getCategoryAttributes,
  getTechnicalSpecsInput,
  buildFicha,
} from '@/lib/ml/attributes';
import { Anel, Selo, Stat, nivelPorNota } from '@/components/ui';
import { comConta } from '@/lib/ml/client';
import { abrirAnuncio } from '@/lib/ml/dono';

export const dynamic = 'force-dynamic';

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ocultos?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  // Padrão: tudo que dá para preencher, oculto incluído. O toggle revela
  // também os bloqueados, que existem só para consulta.
  const includeHidden = sp.ocultos === '1';

  try {
    // Descobre em qual das contas cadastradas este anúncio abre.
    const { item: base, conta: dona } = await abrirAnuncio(id);

    const { item, ficha } = await comConta(dona?.seller_id, async () => {
      // Relê com o token do dono: só assim vêm os atributos marcados N/A.
      const item = dona ? await getItem(id, { internos: true }) : base;
      const [catAttrs, specs] = await Promise.all([
        getCategoryAttributes(item.category_id),
        getTechnicalSpecsInput(item.category_id),
      ]);
      return { item, ficha: buildFicha(item, catAttrs, specs, { includeHidden }) };
    });
    const s = ficha.stats;

    return (
      <>
        <p style={{ margin: '0 0 10px', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
          <Link href={`/itens/${id}`}>← voltar para o check-up</Link>
          <Link href="/">buscar outro anúncio</Link>
        </p>
        <h1>{item.title}</h1>
        <p className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <Selo mono semIcone>
            {item.id}
          </Selo>
          <Selo semIcone>{item.category_id}</Selo>
          <Selo nivel={item.status === 'active' ? 'bom' : 'atencao'}>{item.status}</Selo>
          {s.incompleteSpecsTag ? <Selo nivel="critico">perdendo exposição</Selo> : null}
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

        <div className="card">
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
            <Anel
              valor={s.pct}
              nivel={nivelPorNota(s.pct)}
              legenda="Checklist"
              detalhe={
                <small>
                  {s.filled} de {s.total} atributos
                </small>
              }
            />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flex: '1 1 320px' }}>
              <div style={{ flex: '1 1 130px' }}>
                <Stat
                  rotulo="Obrigatórios"
                  valor={s.missingRequired.length}
                  nota={s.missingRequired.length ? 'bloqueiam a publicação' : 'nenhum faltando'}
                />
              </div>
              <div style={{ flex: '1 1 130px' }}>
                <Stat
                  rotulo="Exposição"
                  valor={s.missingSpecs.length}
                  nota={s.missingSpecs.length ? 'custam exposição' : 'nenhum faltando'}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Link className="btn" href={`/itens/${id}/ficha?ocultos=${includeHidden ? '0' : '1'}`}>
                {includeHidden ? 'Só o preenchível' : 'Ver também os bloqueados'}
              </Link>
              <Link className="btn" href={`/itens/${id}/fotos`}>
                Fotos
              </Link>

            </div>
          </div>
        </div>

        {dona ? null : (
          <section className="card">
            <p style={{ margin: 0 }}>
              <Selo nivel="atencao">somente leitura</Selo> Este anúncio não é de nenhuma conta
              cadastrada, então o painel mostra o que o Mercado Livre entrega publicamente e não
              permite gravar.
            </p>
          </section>
        )}

        <FichaForm itemId={item.id} groups={ficha.groups} podeGravar={!!dona} />
      </>
    );
  } catch (e) {
    return <PainelDeFalha id={id} erro={e} />;
  }
}
