import { readdirSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function deleteSourceMaps(root) {
  let removed = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        walk(path);
      } else if (name.endsWith('.map')) {
        rmSync(path);
        removed += 1;
      }
    }
  };
  walk(root);
  return removed;
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirect) {
  const root = process.argv[2] || 'dist';
  const removed = deleteSourceMaps(root);
  console.log(`Removed ${removed} source map${removed === 1 ? '' : 's'} from ${root}.`);
}
