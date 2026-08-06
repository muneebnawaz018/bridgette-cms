import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  { ignores: ['next-env.d.ts', '.next/**', '.next-probe/**'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    /*
     * Stale-closure bugs are the expensive kind: an effect that reads a value it never re-runs
     * for keeps working until the day the value changes, and then fails somewhere unrelated.
     * Next ships this rule as a warning, which meant it scrolled past unread. An error stops it
     * being optional.
     */
    rules: {
      'react-hooks/exhaustive-deps': 'error',
      // Calling a hook conditionally corrupts React's hook order — always a bug, never a style
      // choice. Next already sets this; pinned here so it survives a config change upstream.
      'react-hooks/rules-of-hooks': 'error',
      // Unused code is the thing knip catches at the file level; this catches it at the symbol
      // level, and the argsIgnorePattern keeps a deliberately-ignored parameter legal.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
];

export default eslintConfig;
