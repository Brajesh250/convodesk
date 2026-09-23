// ESLint flat config for the Node-side workspaces (shared, server, widget).
// The Angular client has its own config (angular-eslint) and is linted via `npm run lint -w client`.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/coverage/**', 'client/**', '**/*.d.ts'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': 'error', // use the pino logger instead
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['widget/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: { 'no-console': 'off' },
  },
  {
    files: ['**/scripts/**/*.ts', '**/*.test.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
