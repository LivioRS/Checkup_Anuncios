import Link from 'next/link';
import Explorador from './Explorador';
import PainelDeFalha from '../Falhas';
import { abrirAnuncio } from '@/lib/ml/dono';
import { Selo } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function CatalogoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { item } = await abrirAnuncio(id);
    const tags = item.tags ?? [];
    const elegivel = tags.includes('catalog_listing_eligible');
    const jaEhCatalogo = !!item.catalog_listing;

    return (
      <>
        <p style={{ margin: '0 0 10px' }}>
          <Link href={`/itens/${id}`}>← voltar para o check-up</Link>
        </p>
        <h1>Catálogo</h1>
        <p className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {item.title}
          <Selo mono semIcone>{item.id}</Selo>
          {item.domain_id ? <Selo semIcone>{item.domain_id}</Selo> : null}
        </p>

        {jaEhCatalogo ? (
          <section className="card">
            <p style={{ margin: 0 }}>
              <Selo nivel="atencao">já é de catálogo</Selo> Este anúncio já disputa uma página de
              produto{item.catalog_product_id ? ` (${item.catalog_product_id})` : ''}. Título,
              fotos e descrição dele vêm do Mercado Livre — o que está sob seu controle é preço,
              estoque, frete e reputação.
            </p>
          </section>
        ) : (
          <section className="card">
            <p style={{ marginTop: 0 }}>
              {elegivel ? (
                <>
                  <Selo nivel="bom">elegível</Selo> O Mercado Livre marcou este anúncio com a tag{' '}
                  <code>catalog_listing_eligible</code>: existe página de produto onde ele pode
                  entrar.
                </>
              ) : (
                <>
                  <Selo nivel="atencao">sem a tag de elegibilidade</Selo> O ML ainda não marcou este
                  anúncio como elegível. Você pode olhar os produtos mesmo assim, mas o vínculo
                  provavelmente será recusado com <code>item.catalog_listing.not_eligible</code>.
                </>
              )}
            </p>
            {item.catalog_product_id ? (
              <p style={{ marginBottom: 0 }}>
                <small>
                  O ML já aponta <Selo mono semIcone>{item.catalog_product_id}</Selo> como o produto
                  adequado para este anúncio. Vale abrir e conferir a ficha antes de qualquer coisa.
                </small>
              </p>
            ) : null}
          </section>
        )}

        <section className="card plano">
          <p style={{ margin: 0 }}>
            <small>
              Esta tela <strong>só lê</strong>. Nada aqui cria anúncio nem vincula nada — é para
              você comparar e decidir. Três coisas que valem saber antes: o vínculo cria um anúncio
              NOVO (o seu continua existindo, ligado a ele); preço, frete, estoque e garantia passam
              a sincronizar entre os dois e o ML <strong>não deixa desligar</strong> essa
              sincronização; e em anúncio de catálogo o título, as fotos e a descrição são do ML,
              então o trabalho de descrição que a gente montou não se aplica a eles.
            </small>
          </p>
        </section>

        <Explorador
          itemId={id}
          variacoes={(item.variations ?? []).map((v) => ({
            id: v.id,
            rotulo:
              (v.attribute_combinations ?? [])
                .map((a) => `${a.name ?? a.id}: ${a.value_name ?? ''}`)
                .join(' · ') || String(v.id),
          }))}
        />
      </>
    );
  } catch (e) {
    return <PainelDeFalha id={id} erro={e} />;
  }
}
