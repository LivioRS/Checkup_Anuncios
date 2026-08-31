/**
 * Peças visuais do painel.
 *
 * Regra que vale para todas: status nunca é comunicado só por cor — todo selo
 * carrega um ícone e um texto, para funcionar em daltonismo, impressão em
 * preto e branco e modo de alto contraste.
 */

export type Nivel = 'bom' | 'atencao' | 'critico' | 'neutro' | 'acento';

const ICONE: Record<Nivel, string> = {
  bom: '✓',
  atencao: '!',
  critico: '×',
  neutro: '·',
  acento: '›',
};

export function Selo({
  nivel = 'neutro',
  children,
  mono,
  semIcone,
}: {
  nivel?: Nivel;
  children: React.ReactNode;
  mono?: boolean;
  semIcone?: boolean;
}) {
  const classe = ['selo', nivel === 'neutro' ? '' : nivel, mono ? 'mono' : ''].filter(Boolean);
  return (
    <span className={classe.join(' ')}>
      {semIcone ? null : <span className="ic" aria-hidden="true">{ICONE[nivel]}</span>}
      {children}
    </span>
  );
}

function corDoNivel(nivel: Nivel) {
  if (nivel === 'bom') return 'var(--bom)';
  if (nivel === 'atencao') return 'var(--atencao)';
  if (nivel === 'critico') return 'var(--critico)';
  if (nivel === 'acento') return 'var(--acento)';
  return 'var(--tinta-3)';
}

/**
 * Anel de progresso. Um número só, grande, no centro — é uma manchete, não um
 * gráfico: sem eixo, sem grade, sem legenda.
 */
export function Anel({
  valor,
  max = 100,
  nivel = 'bom',
  tamanho = 104,
  sufixo = '%',
  legenda,
  detalhe,
}: {
  valor: number;
  max?: number;
  nivel?: Nivel;
  tamanho?: number;
  sufixo?: string;
  legenda?: string;
  detalhe?: React.ReactNode;
}) {
  const traco = Math.round(tamanho * 0.11);
  const r = (tamanho - traco) / 2;
  const c = 2 * Math.PI * r;
  const fracao = Math.max(0, Math.min(1, max > 0 ? valor / max : 0));

  return (
    <div className="anel">
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img"
           aria-label={`${Math.round(valor)}${sufixo}${legenda ? ` — ${legenda}` : ''}`}>
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          fill="none"
          stroke="var(--superficie-2)"
          strokeWidth={traco}
        />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          fill="none"
          stroke={corDoNivel(nivel)}
          strokeWidth={traco}
          strokeLinecap="round"
          strokeDasharray={`${c * fracao} ${c}`}
          transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
        />
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--tinta)"
          fontSize={tamanho * 0.24}
          fontWeight="650"
          letterSpacing="-0.02em"
        >
          {Math.round(valor)}
          <tspan fontSize={tamanho * 0.14} fill="var(--tinta-3)">
            {sufixo}
          </tspan>
        </text>
      </svg>
      {legenda || detalhe ? (
        <div className="texto">
          {legenda ? <div className="n">{legenda}</div> : null}
          {detalhe}
        </div>
      ) : null}
    </div>
  );
}

export function Stat({
  rotulo,
  valor,
  nota,
}: {
  rotulo: string;
  valor: React.ReactNode;
  nota?: React.ReactNode;
}) {
  return (
    <div className="stat">
      <div className="rotulo">{rotulo}</div>
      <div className="valor">{valor}</div>
      {nota ? <div className="nota">{nota}</div> : null}
    </div>
  );
}

export function Secao({
  titulo,
  acao,
  children,
  colapsavel,
  aberta,
  resumo,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
  /** Vira uma seção que abre e fecha, para a tela começar enxuta. */
  colapsavel?: boolean;
  aberta?: boolean;
  /** Selos que resumem o conteúdo, visíveis mesmo com a seção fechada. */
  resumo?: React.ReactNode;
}) {
  if (!colapsavel) {
    return (
      <section className="card">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 14 }}>
          <h2 style={{ margin: 0 }}>{titulo}</h2>
          {acao ? <div style={{ marginLeft: 'auto' }}>{acao}</div> : null}
        </div>
        {children}
      </section>
    );
  }

  // <details> nativo: abre e fecha sem JavaScript e continua acessível pelo teclado.
  return (
    <details className="card dobra" open={aberta}>
      <summary>
        <span className="seta" aria-hidden="true">
          ›
        </span>
        <h2 style={{ margin: 0 }}>{titulo}</h2>
        {resumo ? <span className="resumo">{resumo}</span> : null}
        {acao ? <span className="acao">{acao}</span> : null}
      </summary>
      <div className="corpo">{children}</div>
    </details>
  );
}

/**
 * Medidor de grade: rótulo em cima, anel embaixo, tudo centralizado e do mesmo
 * tamanho. É o formato que mantém a fileira alinhada — anel com rótulo ao lado
 * tem largura variável e quebra a grade.
 */
export function Medidor({
  valor,
  max = 100,
  sufixo = '%',
  rotulo,
  nivel = 'bom',
  casas = 0,
}: {
  valor: number;
  max?: number;
  sufixo?: string;
  rotulo: string;
  nivel?: Nivel;
  casas?: number;
}) {
  const tamanho = 76;
  const traco = 8;
  const r = (tamanho - traco) / 2;
  const c = 2 * Math.PI * r;
  const fracao = Math.max(0, Math.min(1, max > 0 ? valor / max : 0));

  return (
    <div className="medidor">
      <div className="rot">{rotulo}</div>
      <svg width={tamanho} height={tamanho} viewBox={`0 0 ${tamanho} ${tamanho}`} role="img"
           aria-label={`${rotulo}: ${valor.toFixed(casas)}${sufixo}`}>
        <circle cx={tamanho / 2} cy={tamanho / 2} r={r} fill="none" stroke="var(--superficie-2)" strokeWidth={traco} />
        <circle
          cx={tamanho / 2}
          cy={tamanho / 2}
          r={r}
          fill="none"
          stroke={corDoNivel(nivel)}
          strokeWidth={traco}
          strokeLinecap="round"
          strokeDasharray={`${c * fracao} ${c}`}
          transform={`rotate(-90 ${tamanho / 2} ${tamanho / 2})`}
        />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
              fill="var(--tinta)" fontSize={19} fontWeight="650" letterSpacing="-0.02em">
          {valor.toFixed(casas)}
          {sufixo ? <tspan fontSize={12} fill="var(--tinta-3)">{sufixo}</tspan> : null}
        </text>
      </svg>
    </div>
  );
}

/** Escolhe o nível pela faixa da nota: até 40 crítico, até 75 atenção, acima bom. */
export function nivelPorNota(n: number): Nivel {
  if (n >= 75) return 'bom';
  if (n >= 40) return 'atencao';
  return 'critico';
}
