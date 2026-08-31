import { redirect } from 'next/navigation';

/**
 * O check-up virou a porta de entrada do anúncio (/itens/[id]).
 * Este endereço antigo continua existindo só para não quebrar link salvo.
 */
export default async function DiagnosticoAntigo({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ imagens?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  redirect(`/itens/${id}${sp.imagens === '1' ? '?imagens=1' : ''}`);
}
