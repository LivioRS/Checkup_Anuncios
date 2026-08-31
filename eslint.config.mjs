import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'out/**', 'dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'warn',
      'react/no-unescaped-entities': 'off',
    },
  },
];