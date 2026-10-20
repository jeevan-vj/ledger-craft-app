#!/usr/bin/env node
// Poll the deployed Worker until healthz, the readyz migration header, and
// unauthenticated /api/me all pass, or the deadline passes.
//
// A push that adds a SQLite migration used to fail this gate: wrangler deploy
// returns before the Identity Durable Object restarts onto the new bundle, and
// until that restart /api/readyz still reports the previous migration. Cloudflare
// documents that window as seconds to minutes. Run 39511359724 polled 20 times
// over ~74s, then saw 0006_business-gst-registration.sql about a minute later.
//
// The first attempt is immediate, so a release that does not change the newest
// migration still passes at once. Later attempts back off. A deploy that never
// becomes ready fails when the budget ends.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const READINESS_BUDGET_MS = 5 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 20_000;
const BACKOFF_MS = [2_000, 4_000, 8_000, 15_000];

export function newestMigrationName(names) {
  const sql = names.filter((name) => name.endsWith('.sql')).sort();
  return sql.at(-1) ?? null;
}

export function readExpectedMigration(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    throw new Error(`Cannot read migrations in ${dir}: ${error.message}`);
  }
  const name = newestMigrationName(
    entries.filter((entry) => entry.isFile()).map((entry) => entry.name),
  );
  if (!name) throw new Error(`No SQL migrations in ${dir}`);
  return name;
}

export function migrationHeader(headers) {
  if (!headers || typeof headers.get !== 'function') return null;
  const value = headers.get('x-ledgercraft-migration');
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function assessReadiness(sample, expectedMigration) {
  const failures = [];
  const health = sample?.healthz;
  const ready = sample?.readyz;
  const me = sample?.me;

  if (!health || health.error) {
    failures.push(`healthz ${health?.error ?? 'no response'}`);
  } else if (health.status < 200 || health.status >= 300) {
    failures.push(`healthz HTTP ${health.status}`);
  } else if (!String(health.body ?? '').includes('"ok"')) {
    const snippet = String(health.body ?? '').replace(/\s+/g, ' ').slice(0, 80);
    failures.push(`healthz body missing "ok" (${snippet || 'empty'})`);
  }

  const migration = migrationHeader(ready?.headers);
  if (!ready || ready.error) {
    failures.push(`readyz ${ready?.error ?? 'no response'}`);
  } else if (ready.status < 200 || ready.status >= 300) {
    failures.push(`readyz HTTP ${ready.status}`);
  } else if (!migration) {
    failures.push('readyz missing x-ledgercraft-migration');
  } else if (migration.toLowerCase() !== String(expectedMigration).toLowerCase()) {
    failures.push(`migration ${migration} != ${expectedMigration}`);
  }

  if (!me || me.error) {
    failures.push(`/api/me ${me?.error ?? 'no response'}`);
  } else if (me.status !== 401) {
    failures.push(`/api/me HTTP ${me.status}`);
  }

  return { ready: failures.length === 0, migration, failures };
}

export function delayAfterFailure(failedAttempt, remainingMs) {
  const planned = BACKOFF_MS[Math.min(Math.max(failedAttempt, 1) - 1, BACKOFF_MS.length - 1)];
  return Math.max(0, Math.min(planned, remainingMs));
}

function formatSeconds(ms) {
  return `${Math.max(0, Math.round(ms / 1000))}s`;
}

function describeHealth(health) {
  if (!health || health.error) return health?.error ?? 'no response';
  const mark = String(health.body ?? '').includes('"ok"') ? ' "ok"' : '';
  return `HTTP ${health.status}${mark}`;
}

function describeReady(ready, migration) {
  if (!ready || ready.error) return ready?.error ?? 'no response';
  return `HTTP ${ready.status} migration=${migration ?? 'missing'}`;
}

function describeMe(me) {
  if (!me || me.error) return me?.error ?? 'no response';
  return `HTTP ${me.status}`;
}

export function formatAttempt({ attempt, elapsedMs, sample, assessment, expectedMigration }) {
  const outcome = assessment.ready ? 'ready' : `not ready: ${assessment.failures.join('; ')}`;
  return `readiness attempt ${attempt} at ${formatSeconds(elapsedMs)}: healthz ${describeHealth(sample?.healthz)}; readyz ${describeReady(sample?.readyz, assessment.migration)}; /api/me ${describeMe(sample?.me)}; expected ${expectedMigration}; ${outcome}`;
}

export async function waitForApiReadiness({
  probe,
  expectedMigration,
  budgetMs = READINESS_BUDGET_MS,
  sleep,
  now = Date.now,
  log = console.log,
}) {
  const start = now();
  let attempt = 0;
  let assessment = { ready: false, migration: null, failures: ['no attempt'] };
  let sample;
  for (;;) {
    attempt += 1;
    const elapsedMs = Math.max(0, now() - start);
    try {
      sample = await probe();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sample = {
        healthz: { error: message },
        readyz: { error: 'skipped' },
        me: { error: 'skipped' },
      };
    }
    assessment = assessReadiness(sample, expectedMigration);
    log(formatAttempt({ attempt, elapsedMs, sample, assessment, expectedMigration }));
    if (assessment.ready) {
      return { ok: true, attempt, elapsedMs: Math.max(0, now() - start), assessment };
    }
    const remaining = budgetMs - Math.max(0, now() - start);
    if (remaining <= 0) break;
    const delay = delayAfterFailure(attempt, remaining);
    if (delay <= 0) break;
    await sleep(delay);
  }
  return { ok: false, attempt, elapsedMs: Math.max(0, now() - start), assessment };
}

async function get(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'cache-control': 'no-cache' },
    });
    const body = await response.text();
    return { status: response.status, body, headers: response.headers };
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? `timeout after ${REQUEST_TIMEOUT_MS}ms`
      : (error?.message || String(error));
    return { status: 0, body: '', headers: new Headers(), error: message };
  } finally {
    clearTimeout(timer);
  }
}

async function probeApi(apiUrl) {
  const [healthz, readyz, me] = await Promise.all([
    get(`${apiUrl}/api/healthz`),
    get(`${apiUrl}/api/readyz`),
    get(`${apiUrl}/api/me`),
  ]);
  return { healthz, readyz, me };
}

async function main() {
  const dir = process.argv[2] ?? 'api/sqlite-migrations';
  const apiUrl = (process.env.API_URL || '').replace(/\/$/, '');
  if (!apiUrl) {
    console.error('API_URL is required');
    process.exit(2);
  }
  const expected = readExpectedMigration(dir);
  console.log(
    `Waiting up to ${READINESS_BUDGET_MS / 1000}s for ${apiUrl} to report migration ${expected} (healthz "ok", readyz x-ledgercraft-migration, /api/me 401).`,
  );
  const result = await waitForApiReadiness({
    expectedMigration: expected,
    probe: () => probeApi(apiUrl),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
  if (result.ok) {
    console.log(`API ready (${expected})`);
    return;
  }
  const message = `API readiness check failed after ${Math.round(result.elapsedMs / 1000)}s and ${result.attempt} attempts. Expected x-ledgercraft-migration ${expected}. Last: ${result.assessment.failures.join('; ')}`;
  console.error(message);
  console.log(`::error::${message}`);
  process.exit(1);
}

function invokedAsCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedAsCli()) {
  main().catch((error) => {
    console.error(error?.stack || error?.message || error);
    process.exit(1);
  });
}
