import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      // Registra só os plugins/regras que já são referenciados por
      // `eslint-disable-next-line` no repo — sem isso, o comentário vira erro
      // "rule not found" em vez de suprimir o aviso. De propósito NÃO adota o
      // conjunto `eslint-config-next` completo (react/recommended, jsx-a11y,
      // `react-hooks/error-boundaries` etc.): isso ligaria dezenas de regras
      // novas, não relacionadas a este plano, sobre código pré-existente.
      '@next/next/no-img-element': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      'react/no-unescaped-entities': 'off',
    },
  },
  // Plano 020 (prep multi-cliente, ver README "Motor de análise vs. camada de
  // conta" e AGENTS.md §11): estes arquivos são o "motor" — lógica de análise
  // e IA que não depende de qual cliente está logado, candidata a virar um
  // pacote compartilhado quando o portal novo (Fase 3 do quadro "Do Anúncio ao
  // Portal") existir. Para isso ficar barato no dia da extração, eles não podem
  // importar Supabase direto — só recebem dados prontos via parâmetro/opts, ou
  // passam pelas funções já exportadas de `./client` (mlFetch/getAccount), que
  // continuam sendo a camada "adapter" amarrada à tabela `contas` de hoje.
  {
    files: [
      'src/lib/ml/model.ts',
      'src/lib/ml/analise.ts',
      'src/lib/ml/attributes.ts',
      'src/lib/ml/catalogo.ts',
      'src/lib/ml/catalogo-tipos.ts',
      'src/lib/ml/tags.ts',
      'src/lib/ml/tendencias.ts',
      'src/lib/ml/perguntas.ts',
      'src/lib/ml/origem.ts',
      // Plano 025 (f2c2): geração de proposta de título/descrição extraída dos
      // handlers de `/api/titulo` e `/api/descricao` para o worker de lote
      // reusar. `descricao.ts` fala com `loja_blocos` só via `carregarBlocos`
      // injetado — o arquivo em si não importa Supabase.
      'src/lib/ml/titulo.ts',
      'src/lib/ml/descricao.ts',
      'src/lib/normalizar.ts',
      'src/lib/ia.ts',
      'src/lib/ia-tipos.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [
          {
            name: '../supabase',
            message:
              'Este arquivo é "motor" (ver README, seção "Motor de análise vs. camada de conta") — não pode importar Supabase direto. Receba os dados prontos via parâmetro/opts.',
          },
          {
            name: './supabase',
            message:
              'Este arquivo é "motor" — não pode importar Supabase direto (ver README).',
          },
          {
            name: '@/lib/supabase',
            message:
              'Este arquivo é "motor" — não pode importar Supabase direto (ver README).',
          },
        ],
      }],
    },
  },
];