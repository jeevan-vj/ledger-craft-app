import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function decideSourceMapUpload(env) {
  const token = env.SENTRY_AUTH_TOKEN?.trim() ?? '';
  if (!token) {
    return { action: 'skip', reason: 'SENTRY_AUTH_TOKEN is not set; skipping web source map upload.' };
  }
  const org = env.SENTRY_ORG?.trim() ?? '';
  const project = env.SENTRY_PROJECT?.trim() || 'ledgercraft-web';
  const release = env.SENTRY_RELEASE?.trim() || env.GITHUB_SHA?.trim() || '';
  if (!org) {
    return { action: 'fail', reason: 'SENTRY_ORG is required to upload source maps.' };
  }
  if (!release) {
    return { action: 'fail', reason: 'SENTRY_RELEASE or GITHUB_SHA is required to upload source maps.' };
  }
  return { action: 'upload', org, project, release };
}

function countSourceMaps(root) {
  let count = 0;
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith('.map')) count += 1;
    }
  };
  walk(root);
  return count;
}

function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

export function uploadWebSourceMaps(env = process.env) {
  const decision = decideSourceMapUpload(env);
  if (decision.action === 'skip') {
    console.log(decision.reason);
    return decision;
  }
  if (decision.action === 'fail') {
    console.error(decision.reason);
    process.exit(1);
  }

  const maps = countSourceMaps('dist');
  if (maps === 0) {
    console.error('No source maps found in dist. Refusing to upload an empty release.');
    process.exit(1);
  }

  const uploadEnv = {
    ...env,
    SENTRY_AUTH_TOKEN: env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: decision.org,
    SENTRY_PROJECT: decision.project,
  };
  run(process.execPath, ['node_modules/@sentry/cli/scripts/install.js'], uploadEnv);
  run('pnpm', ['exec', 'sentry-cli', 'sourcemaps', 'inject', 'dist'], uploadEnv);
  run(
    'pnpm',
    ['exec', 'sentry-cli', 'sourcemaps', 'upload', '--release', decision.release, 'dist'],
    uploadEnv,
  );
  console.log(`Uploaded ${maps} web source maps for release ${decision.release} to ${decision.org}/${decision.project}.`);
  return decision;
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirect) {
  uploadWebSourceMaps();
}
