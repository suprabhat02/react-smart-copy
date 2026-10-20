import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // consumer/ type-checks the built package (npm run types:consumer); it has its own tsconfigs.
  { ignores: ['dist', 'coverage', 'node_modules', 'site', 'consumer'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['src/**'],
    rules: {
      // Each entry point bundles its own copy of CopyFailure: a failure from another entry point is
      // not an instance of this one. isCopyFailure() checks the shared brand instead.
      'no-restricted-syntax': [
        'error',
        {
          selector: "BinaryExpression[operator='instanceof'][right.name='CopyFailure']",
          message: 'Use isCopyFailure(): a CopyFailure from another entry point is not an instance of this copy of the class.',
        },
      ],
    },
  },
  {
    files: ['test/**'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      // Vitest's asymmetric matchers (expect.any, expect.objectContaining) are typed `any`.
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },
  { files: ['**/*.js', '**/*.mjs', '**/*.cjs'], ...tseslint.configs.disableTypeChecked },
  {
    // Build and test scripts run on Node, not in the browser.
    files: ['scripts/**/*.js', 'scripts/**/*.mjs', 'e2e/**/*.js'],
    languageOptions: {
      globals: { console: 'readonly', fetch: 'readonly', URL: 'readonly', AbortSignal: 'readonly', Blob: 'readonly', process: 'readonly' },
    },
  },
  {
    files: ['scripts/**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { console: 'readonly', process: 'readonly', require: 'readonly' },
    },
    // These files exist to check the CommonJS build through require().
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
