import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

/**
 * Flat ESLint configuration.
 *
 * `eslint-config-next` ships flat configs directly, so no compatibility shim is
 * needed. Two rules are relaxed deliberately, and each is explained where it is
 * turned off rather than being silently disabled.
 */
const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: ['.next/**', 'node_modules/**', 'supabase/**', '.data/**', 'coverage/**'],
  },
  {
    rules: {
      // The store and service layers cross typed boundaries where the row shape
      // is proven by the schema rather than by TypeScript; `any` is used at
      // those seams and nowhere else.
      '@typescript-eslint/no-explicit-any': 'off',
      // Deliberately discarded bindings are named with a leading underscore.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
]

export default config
