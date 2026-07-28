import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'

// Flat config (ESLint 9+/10). Replaces the old .eslintrc.cjs.
export default tseslint.config(
  { ignores: ['dist/', 'out/', 'release/', 'node_modules/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // TypeScript handles undefined-symbol checks; eslint's no-undef misfires on TS.
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
)
