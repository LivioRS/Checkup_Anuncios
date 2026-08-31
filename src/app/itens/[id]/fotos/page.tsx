import Link from 'next/link';
import Galeria, { type Foto } from './Galeria';
import { abrirAnuncio } from '@/lib/ml/dono';
import PainelDeFalha from '../Falhas';
import type { Item } from '@/lib/ml/model';
import { Selo } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function FotosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { item } = await abrirAnuncio(id);
    const fotos: Foto[] = (item.pictures ?? []).map((p) => ({
      id: p.id,
      url: p.secure_url ?? p.url ?? '',
      size: p.size,
      max_size: p.max_size,
      quality: p.quality,
    }));

    return (
      <>
        <p style={{ margin: '0 0 10px' }}>
          <Link href={`/itens/${id}`}>← voltar para o check-up</Link>
        </p>
        <h1>Fotos</h1>
        <p className="sub" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {item.title}
          <Selo mono semIcone>
            {item.id}
          </Selo>
        </p>
        <Galeria itemId={id} fotos={fotos} />
      </>
    );
  } catch (e) {
    return <PainelDeFalha id={id} erro={e} />;
  }
}
