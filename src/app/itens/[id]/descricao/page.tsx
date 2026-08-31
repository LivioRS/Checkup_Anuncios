import Link from 'next/link';
import EditorDescricao from './EditorDescricao';
import PainelDeFalha from '../Falhas';
import { mlFetch, comConta } from '@/lib/ml/client';
import { abrirAnuncio } from '@/lib/ml/dono';
import { temIA } from '@/lib/ia';
import { getCategoryAttributes, getItem } from '@/lib/ml/attributes';
import { origemDoItem } from '@/lib/ml/origem';

export const dynamic = 'force-dynamic';

export default async function DescricaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    // Descobre a conta dona antes de ler: a descrição também é recusada
    // quando o token usado não é o do anúncio.
    const { item, conta } = await abrirAnuncio(id);
    /**
     * Relê com os atributos internos quando o anúncio é nosso: origem costuma
     * ser atributo oculto, e sem esse parâmetro ela não vem — o painel dizia
     * "vazio" num campo que já estava preenchido.
     */
    const origem = await comConta(conta?.seller_id, async () => {
      const completo = conta ? await getItem(id, { internos: true }).catch(() => item) : item;
      const attrs = await getCategoryAttributes(completo.category_id).catch(() => []);
      return origemDoItem(completo, attrs);
    });

    const atual = await comConta(conta?.seller_id, async () => {
      try {
        const d = await mlFetch<{ plain_text?: string }>(`/items/${id}/description`);
        return d.plain_text ?? '';
      } catch {
        return ''; // anúncio ainda sem descrição
      }
    });

    return (
      <>
        <p style={{ margin: '0 0 6px' }}>
          <Link href={`/itens/${id}`}>← voltar para o check-up</Link>
        </p>
        <h1>Descrição</h1>
        <p className="sub">
          {item.title} · {item.id}
        </p>
        <EditorDescricao
          itemId={id}
          atual={atual}
          temIA={temIA()}
          origemFicha={origem.valor}
          origemNaFicha={origem.existe}
          origemNome={origem.nome}
        />
      </>
    );
  } catch (e) {
    return <PainelDeFalha id={id} erro={e} />;
  }
}
