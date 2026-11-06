const path = require('node:path');
const { transformSync } = require('@babel/core');

it('transforms dependency import.meta so Metro web bundles can execute as scripts', () => {
  const result = transformSync('const mode = import.meta.env?.MODE;', {
    filename: path.join(__dirname, '../node_modules/zustand/esm/middleware.mjs'),
    configFile: path.join(__dirname, '../babel.config.js'),
    babelrc: false,
    caller: { name: 'metro', bundler: 'metro', platform: 'web', isDev: true },
  });
  expect(result.code).not.toContain('import.meta');
  expect(() => new Function(result.code)).not.toThrow();
});

it('allows React Navigation to select the web colour scheme', () => {
  expect(require('../tailwind.config').darkMode).toBe('class');
});
