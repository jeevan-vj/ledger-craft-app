import { mkdir, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Shared runtime options for local acceptance drivers. */
export function proofBrowserOptions(env = process.env) {
  return {
    ...(env.PROOF_BROWSER_PATH ? { executablePath: env.PROOF_BROWSER_PATH } : {}),
    headless: true,
    args: ['--no-sandbox'],
  };
}

export function localProofOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Acceptance proof requires a loopback URL');
  }
  if (url.username || url.password) throw new Error('Proof URL must not contain credentials');
  return url.origin;
}

/** Wait for application API reads before a full-document navigation. */
export function observeProofNetwork(page, { quietMs = 1000, timeoutMs = 120000 } = {}) {
  const pending = new Set();
  const failures = [];
  let changed = Date.now();
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      pending.add(request);
      changed = Date.now();
    }
  });
  const finish = request => {
    if (pending.delete(request)) changed = Date.now();
  };
  page.on('requestfinished', finish);
  page.on('requestfailed', request => {
    if (pending.has(request)) failures.push({ path: new URL(request.url()).pathname.replace(/(\/public\/(?:invoices|quotes)\/)[^/]+/, '$1[redacted]'), error: request.failure()?.errorText });
    finish(request);
  });
  return {
    failures,
    async settle() {
      const started = Date.now();
      while (pending.size || Date.now() - changed < quietMs) {
        if (Date.now() - started > timeoutMs) throw new Error(`API did not settle: ${pending.size} requests pending`);
        await new Promise(resolve => setTimeout(resolve, Math.min(quietMs, 100)));
      }
    },
  };
}

/** Keep resumable local login state out of shared or symlinked directories. */
export async function privateProofDirectory(output) {
  if (!output?.trim()) throw new Error('Set an explicit output directory with CLOSE_OUTPUT for this proof run');
  const directory = resolve(output);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('Proof output must be a real directory, not a symlink');
  if ((info.mode & 0o077) !== 0 || (process.getuid && info.uid !== process.getuid())) {
    throw new Error('Proof output must be an owner-only directory (mode 0700) owned by the current user');
  }
  return directory;
}
