import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAccount } from '@/lib/ml/client';
import { parseItemId, buscarAnuncios, itensDoUserProduct, type Achado } from '@/lib/ml/items';
import { Selo, Secao } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function Home({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const q = (sp.q ?? '').trim();

  // Código ou link vão direto ao editor — nenhuma busca é feita.
  const alvo = q ? parseItemId(q) : null;
  if (alvo?.tipo === 'item') redirect(`/itens/${alvo.id}`);

  let conta = null;
  let falha: string | null = null;
  try {
    conta = await getAccount();
  } catch (e) {
    falha = e instanceof Error ? e.message : String(e);
  }

  let achados: Achado[] = [];
  let erroBusca: string | null = null;
  if (q && conta && alvo?.tipo !== 'produto') {
    try {
      achados =
        alvo?.tipo === 'user_product'
          ? await itensDoUserProduct(alvo.id)
          : await buscarAnuncios(q);
    } catch (e) {
      erroBusca = e instanceof Error ? e.message : String(e);
    }
  }

  // Um User Product com um único anúncio não precisa de tela de escolha.
  if (alvo?.tipo === 'user_product' && achados.length === 1) redirect(`/itens/${achados[0].id}`);

  if (falha) {
    return (
      <Secao titulo="Configuração incompleta">
        <p style={{ marginTop: 0 }}>
          <Selo nivel="critico">erro</Selo> {falha}
        </p>
        <small>Confira o .env.local e o acesso à tabela contas no Supabase.</small>
      </Secao>
    );
  }

  if (!conta) {
    return (
      <Secao titulo="Nenhuma conta com token">
        <p style={{ margin: 0 }}>
          A tabela <code>contas</code> não tem nenhuma linha com <code>access_token</code>. É de lá
          que o painel lê o token — quem autoriza no Mercado Livre são os robôs.
        </p>
      </Secao>
    );
  }

  return (
    <>
      <h1>Abrir um anúncio</h1>
      <p className="sub">
        Cole o código MLB ou o link do anúncio para abrir o check-up completo.
      </p>

      <div className="card">
        <form className="busca">
          <input
            type="text"
            name="q"
            defaultValue={q}
            autoFocus
            placeholder="MLB1234567890, o link do anúncio, ou parte do título / SKU"
          />
          <button className="btn primary" type="submit">
            Abrir
          </button>
        </form>
        <p style={{ margin: '12px 0 0' }}>
          <small>
            Código ou link abrem na hora. Texto procura nos seus anúncios — primeiro no Supabase,
            sem gastar chamada no ML.
          </small>
        </p>
      </div>

      {erroBusca ? (
        <Secao titulo="Erro na busca">
          <p style={{ margin: 0 }}>
            <Selo nivel="critico">falhou</Selo> {erroBusca}
          </p>
        </Secao>
      ) : null}

      {alvo?.tipo === 'produto' ? (
        <Secao titulo="Isso é um produto de catálogo">
          <p style={{ marginTop: 0 }}>
            <Selo nivel="atencao" mono>
              {alvo.id}
            </Selo>{' '}
            é a página de catálogo do Mercado Livre, onde vários vendedores concorrem pelo mesmo
            produto. A ficha do catálogo é do ML — quem tem atributos para você preencher é o
            anúncio.
          </p>
          <small>
            Abra o seu anúncio em Meus anúncios e cole o código MLB dele. Se o link do catálogo
            tiver <code>?pdp_filters=item_id:MLB…</code>, esse código do final já é o anúncio e o
            painel abre direto.
          </small>
        </Secao>
      ) : null}

      {alvo?.tipo === 'user_product' && !erroBusca && !achados.length ? (
        <Secao titulo="Nenhum anúncio nesse produto">
          <p style={{ marginTop: 0 }}>
            <Selo nivel="atencao" mono>
              {alvo.id}
            </Selo>{' '}
            é um <strong>User Product</strong> — o produto do vendedor, não o anúncio. A busca não
            devolveu nenhum anúncio ligado a ele nesta conta.
          </p>
          <small>
            Procurei em todas as contas cadastradas e nenhuma tem anúncio ligado a ele. Se o
            anúncio é recém-criado, o ML pode levar alguns minutos para indexá-lo — nesse caso o
            código MLB do próprio anúncio abre direto. Se ele é de outro vendedor, o link
            <code>/up/</code> não serve: use o MLB.
          </small>
        </Secao>
      ) : null}

      {q && !erroBusca && alvo?.tipo !== 'produto' && !(alvo?.tipo === 'user_product' && !achados.length) ? (
        achados.length ? (
          <Secao
            titulo={
              alvo?.tipo === 'user_product'
                ? `${achados.length} ${achados.length > 1 ? 'anúncios' : 'anúncio'} nesse produto`
                : `${achados.length} resultado${achados.length > 1 ? 's' : ''}`
            }
          >
            <div className="rolagem">
              <table className="tabela">
                <tbody>
                  {achados.map((it) => (
                    <tr key={it.id}>
                      <td>
                        <Link href={`/itens/${it.id}`} style={{ fontWeight: 550 }}>
                          {it.titulo ?? it.id}
                        </Link>
                        <div style={{ marginTop: 4, display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                          <Selo mono semIcone>
                            {it.id}
                          </Selo>
                          {it.sku ? <Selo semIcone>SKU {it.sku}</Selo> : null}
                          <Selo semIcone>{it.local ? 'do Supabase' : 'da API'}</Selo>
                          {it.catalogo ? <Selo nivel="atencao">de catálogo</Selo> : null}
                        </div>
                      </td>
                      <td style={{ width: 90, textAlign: 'right' }}>
                        <Link className="btn pequeno" href={`/itens/${it.id}`}>
                          Abrir
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Secao>
        ) : (
          <Secao titulo="Sem resultados">
            <p className="vazio" style={{ margin: 0 }}>
              Nada encontrado para <strong>{q}</strong>.
            </p>
          </Secao>
        )
      ) : null}

      <p style={{ marginTop: 24 }}>
        <small>
          A conta é escolhida sozinha: o painel lê o anúncio, vê de quem ele é e usa o token
          daquela conta se ela estiver cadastrada. Anúncio de outro vendedor também abre — com o
          que o Mercado Livre entrega publicamente.
        </small>
      </p>
    </>
  );
}
