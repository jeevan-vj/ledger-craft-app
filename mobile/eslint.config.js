const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Flat config for Expo SDK 54 (eslint-config-expo/flat). Build output is
// ignored. Source, tests, and scripts stay in the lint set.
const jestGlobals = {
  jest: 'readonly',
  describe: 'readonly',
  it: 'readonly',
  test: 'readonly',
  expect: 'readonly',
  beforeEach: 'readonly',
  afterEach: 'readonly',
  beforeAll: 'readonly',
  afterAll: 'readonly',
};

const nodeGlobals = {
  __dirname: 'readonly',
  __filename: 'readonly',
  module: 'writable',
  require: 'readonly',
  exports: 'writable',
  process: 'readonly',
};

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'coverage/*'],
  },
  {
    files: [
      'jest.setup.js',
      '**/*.test.{js,ts,tsx}',
      '**/__tests__/**/*.{js,ts,tsx}',
    ],
    languageOptions: { globals: jestGlobals },
  },
  {
    files: ['scripts/**/*.js', '*.config.js', 'babel.config.js'],
    languageOptions: { globals: nodeGlobals },
  },
]);
