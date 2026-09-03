import 'server-only';

/**
 * Busca na web (plano 033, Parte C) — pra achar a ficha técnica de um produto no site do
 * fabricante. Adapter atrás de env var: `WEB_SEARCH_API_KEY` + `WEB_SEARCH_PROVIDER` (`tavily`
 * por padrão). Sem chave, `temBuscaWeb()` é `false` e o botão da tela fica desligado.
 *
 * Só specs FACTUAIS entram na ficha (medida, material, país de origem…) — fato não tem direito
 * autoral. A descrição é REESCRITA pela IA, nunca copiada. Foto do fabricante continua fora
 * (regra do ML + direito autoral). Ver `plans/033-rascunho-por-ia.md`.
 */

export type ResultadoWeb = { url: string; titulo: string; conteudo: string };

export function temBuscaWeb(): boolean {
  return !!process.env.WEB_SEARCH_API_KEY;
}

export async function buscarNaWeb(query: string, maxResultados = 3): Promise<ResultadoWeb[]> {
  const chave = process.env.WEB_SEARCH_API_KEY;
  if (!chave) throw new Error('WEB_SEARCH_API_KEY não configurada no .env.local');
  const provedor = (process.env.WEB_SEARCH_PROVIDER || 'tavily').toLowerCase();
  if (provedor !== 'tavily') {
    throw new Error(`WEB_SEARCH_PROVIDER não suportado: ${provedor} (só 'tavily' por enquanto)`);
  }

  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: chave,
      query,
      max_results: maxResultados,
      include_raw_content: true,
      search_depth: 'basic',
    }),
    cache: 'no-store',
  });

  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    results?: { url?: string; title?: string; content?: string; raw_content?: string }[];
  };
  if (!res.ok) {
    throw new Error(`Tavily ${res.status}: ${json?.error ?? JSON.stringify(json).slice(0, 300)}`);
  }

  return (json.results ?? []).slice(0, maxResultados).map((r) => ({
    url: typeof r.url === 'string' ? r.url : '',
    titulo: typeof r.title === 'string' ? r.title : '',
    conteudo:
      (typeof r.raw_content === 'string' && r.raw_content) ||
      (typeof r.content === 'string' ? r.content : ''),
  }));
}
