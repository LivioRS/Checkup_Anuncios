import Link from 'next/link';
import EditorTitulo from './EditorTitulo';
import PainelDeFalha from '../Falhas';
import { abrirAnuncio } from '@/lib/ml/dono';
import { getCategoryAttributes } from '@/lib/ml/attributes';
import { comConta } from '@/lib/ml/client';
import { Selo } from '@/components/ui';
import { temIA } from '@/lib/ia';

export const dynamic = 'force-dynamic';

export default async function TituloPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { item, conta } = await abrirAnuncio(id);
    // O que a categoria diz sobre o MODEL: limite de caracteres, se é lista
    // fechada e se o ML não deixa o vendedor editar. Cada um muda a tela.
    const regraModelo = await comConta(conta?.seller_id, async () => {
      try {
        const attrs = await getCategoryAttributes(item.category_id);
        const m = attrs.find((a) => a.id === 'MODEL');
        if (!m) return { limite: null, lista: [] as string[], travado: false, existe: false };
        const tags = (m.tags ?? {}) as Record<string, unknown>;
        return {
          limite: m.value_max_length ?? null,
          // Categoria que fixa a lista de modelos recusa texto livre.
          lista: (m.values ?? []).map((v) => v.name ?? '').filter(Boolean).slice(0, 40),
          travado: !!(tags.read_only || tags.fixed || tags.inferred || tags.restricted_values),
          existe: true,
        };
      } catch {
        return { limite: null, lista: [] as string[], travado: false, existe: true };
      }
    });

    const modeloAtual =
      (item.attributes ?? []).find((a) => a.id === 'MODEL' && a.value_id !== '-1')?.value_name ??
      null;

    return (
      <>
        <p style={{ margin: '0 0 10px' }}>
          <Link href={`/itens/${id}`}>← voltar para o check-up</Link>
        </p>
        <h1>Título e busca</h1>
        <p className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {item.title}
          <Selo mono semIcone>{item.id}</Selo>
          <Selo semIcone>{item.category_id}</Selo>
        </p>

        <EditorTitulo
          itemId={id}
          atual={item.family_name || item.title || ''}
          familia={item.family_name ?? null}
          vendas={item.sold_quantity ?? 0}
          modeloAtual={modeloAtual}
          limiteModelo={regraModelo.limite}
          modeloLista={regraModelo.lista}
          modeloTravado={regraModelo.travado}
          modeloExiste={regraModelo.existe}
          podeGravar={!!conta && !item.catalog_listing}
          catalogo={!!item.catalog_listing}
          temIA={temIA()}
        />
      </>
    );
  } catch (e) {
    return <PainelDeFalha id={id} erro={e} />;
  }
}
