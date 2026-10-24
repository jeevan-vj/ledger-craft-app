import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

type HeaderBlock = Record<string, string>;

function headerBlocks(source: string): Map<string, HeaderBlock> {
  const blocks = new Map<string, HeaderBlock>();
  let current: string | null = null;
  for (const line of source.split('\n')) {
    if (line.trim() === '') continue;
    if (!line.startsWith(' ') && !line.startsWith('\t')) {
      current = line.trim();
      blocks.set(current, {});
      continue;
    }
    if (!current) continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    blocks.get(current)![name] = value;
  }
  return blocks;
}

describe('public app link files', () => {
  it('claims shared quote paths on the existing iOS app ID', () => {
    const association = JSON.parse(
      readRepoFile('public/.well-known/apple-app-site-association'),
    ) as {
      applinks: {
        details: Array<{ appID: string; paths: string[] }>;
      };
    };

    expect(association.applinks.details).toEqual([
      {
        appID: '88282K637B.com.easybizinvoice.app',
        paths: ['/shared/invoice/*', '/shared/quote/*'],
      },
    ]);
  });

  it('serves the Digital Asset Links file as JSON', () => {
    const blocks = headerBlocks(readRepoFile('public/_headers'));
    expect(blocks.get('/.well-known/assetlinks.json')).toMatchObject({
      'content-type': 'application/json',
    });
  });
});
