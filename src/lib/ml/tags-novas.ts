import 'server-only';
import { db } from '../supabase';
import { desconhecidas } from './tags';

export type TagNova = {
  nome: string;
  tipo: 'anuncio' | 'vendedor';
  vezes: number;
  exemplo_item: string | null;
  significado: string | null;
  visto_em: string;
};

/**
 * Registra as tags que o dicionário ainda não explica.
 *
 * A ideia é simples: em vez de a tag desconhecida sumir da tela e do assunto,
 * ela vira uma linha no banco com um contador. Depois de rodar alguns anúncios,
 * a lista mostra sozinha o que vale estudar — tag que aparece em dezenas de
 * anúncios rende mais investigação que uma que apareceu uma vez.
 *
 * Nunca derruba a tela: se o Supabase falhar, o check-up continua.
 */
export async function registrarDesconhecidas(
  itemId: string,
  doAnuncio: string[],
  doVendedor: string[],
): Promise<string[]> {
  const novas = [
    ...desconhecidas(doAnuncio, 'anuncio').map((nome) => ({ nome, tipo: 'anuncio' as const })),
    ...desconhecidas(doVendedor, 'vendedor').map((nome) => ({ nome, tipo: 'vendedor' as const })),
  ];
  if (!novas.length) return [];

  try {
    const cliente = db();
    const agora = new Date().toISOString();

    // Lê o que já existe para incrementar o contador em vez de zerá-lo.
    const { data } = await cliente
      .from('tags_novas')
      .select('nome, tipo, vezes')
      .in(
        'nome',
        novas.map((n) => n.nome),
      );

    const vistas = new Map(
      (data ?? []).map((r) => [`${r.tipo}:${r.nome}`, Number(r.vezes) || 0]),
    );

    await cliente.from('tags_novas').upsert(
      novas.map((n) => ({
        nome: n.nome,
        tipo: n.tipo,
        vezes: (vistas.get(`${n.tipo}:${n.nome}`) ?? 0) + 1,
        exemplo_item: itemId,
        visto_em: agora,
      })),
      { onConflict: 'nome,tipo' },
    );
  } catch {
    /* o dicionário é acessório: um erro aqui não pode custar o check-up */
  }

  return novas.map((n) => n.nome);
}

/** Lista o que já foi registrado, mais visto primeiro. */
export async function listarDesconhecidas(): Promise<TagNova[]> {
  try {
    const { data } = await db()
      .from('tags_novas')
      .select('nome, tipo, vezes, exemplo_item, significado, visto_em')
      .order('vezes', { ascending: false })
      .limit(200);
    return (data ?? []) as TagNova[];
  } catch {
    return [];
  }
}
