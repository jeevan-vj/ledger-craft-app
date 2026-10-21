import assert from 'node:assert/strict';
import {readFileSync, readdirSync} from 'node:fs';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const version = JSON.parse(read('public/version.json'));
assert.deepEqual(JSON.parse(read('dist/version.json')), version, 'Built version metadata changed after bundling');
const bundled = readdirSync(new URL('dist/assets/', root))
  .filter(name => name.endsWith('.js'))
  .some(name => read('dist/assets/' + name).includes(version.hash));
assert.ok(bundled, 'The actual build identifier must be embedded in the app');
const serviceWorker = read('dist/sw.js');
assert.doesNotMatch(serviceWorker, /\.map["'`]/, 'Service worker must not precache source maps');
console.log(`Verified app version ${version.version}, build ${version.hash}`);
