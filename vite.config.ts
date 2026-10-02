import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vite-plus';

export default defineConfig({
  resolve: {
    alias: {
      '@/': fileURLToPath(new URL('src/', import.meta.url)),
      '~/': fileURLToPath(new URL('test/', import.meta.url)),
      '@pkg': fileURLToPath(new URL('package.json', import.meta.url)),
      '@scripts/': fileURLToPath(new URL('scripts/', import.meta.url)),
    },
  },
  pack: {
    entry: ['src/index.ts', 'src/cli/main.ts'],
    format: ['esm'],
    dts: true,
    platform: 'node',
  },
  staged: {
    '*': 'vp check --fix',
  },
  fmt: {
    arrowParens: 'avoid',
    sortTailwindcss: true,
    experimentalOperatorPosition: 'end',
    bracketSameLine: false,
    bracketSpacing: true,
    embeddedLanguageFormatting: 'auto',
    endOfLine: 'lf',
    ignorePatterns: ['.wrangler', 'openspec', 'apps', 'test/fixtures', 'data/runtime-compat-data'],
    insertFinalNewline: true,
    jsxSingleQuote: false,
    objectWrap: 'preserve',
    printWidth: 100,
    proseWrap: 'preserve',
    quoteProps: 'as-needed',
    semi: true,
    singleAttributePerLine: true,
    singleQuote: true,
    sortImports: {
      internalPattern: ['@/', '~/'],
    },
    sortPackageJson: true,
    tabWidth: 2,
    trailingComma: 'all',
    useTabs: false,
    vueIndentScriptAndStyle: true,
  },
  lint: {
    ignorePatterns: ['commitlint.config.js', 'vite.config.ts', 'apps', 'test/fixtures', 'scripts'],
    categories: {
      correctness: 'error',
      perf: 'error',
      restriction: 'error',
      nursery: 'error',
      pedantic: 'error',
    },
    jsPlugins: [{ name: 'vite-plus', specifier: 'vite-plus/oxlint-plugin' }],
    options: { typeAware: true, typeCheck: true },
    plugins: ['vue', 'import', 'oxc', 'promise', 'unicorn', 'typescript', 'eslint', 'vitest'],
    rules: {
      'vitest/no-conditional-in-test': 'off',
      'vitest/require-test-timeout': 'off',
      'vite-plus/prefer-vite-plus-imports': 'error',
      'prefer-const': ['error', { destructuring: 'all' }],
      'prefer-template': 'error',
      'object-shorthand': 'error',
      'typescript/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
      ],
      'import/first': 'error',
      'import/no-duplicates': 'error',
      'import/no-mutable-exports': 'error',
      'unicorn/prefer-includes': 'error',
      'unicorn/prefer-string-starts-ends-with': 'error',
      'unicorn/throw-new-error': 'error',
      'unicorn/error-message': 'error',
      'oxc/no-optional-chaining': 'off',
      'oxc/no-async-await': 'off',
      'oxc/no-rest-spread-properties': 'off',
      'no-undefined': 'off',
      'typescript/prefer-readonly-parameter-types': 'off',
      'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
    },
    overrides: [
      {
        files: ['docs/.vitepress/**'],
        rules: {
          'import/no-default-export': 'off',
          'import/no-relative-parent-imports': 'off',
          'import/unambiguous': 'off',
          'eslint/no-undef': 'off',
          'vue/max-props': 'off',
        },
      },
    ],
  },
  run: {
    cache: true,
  },
  test: {
    isolate: false,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['test/**/*.test.ts'],
          exclude: ['test/apps/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'apps',
          include: ['test/apps/**/*.test.ts'],
        },
      },
    ],
    coverage: {
      reporter: ['text', 'html', 'clover', 'json', 'lcov'],
      thresholds: { statements: 93, branches: 88, functions: 95, lines: 93 },
    },
  },
});
