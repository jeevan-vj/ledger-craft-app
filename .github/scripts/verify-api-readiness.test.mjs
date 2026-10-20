import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  READINESS_BUDGET_MS,
  assessReadiness,
  delayAfterFailure,
  formatAttempt,
  readExpectedMigration,
  waitForApiReadiness,
} from './verify-api-readiness.mjs';

const expected = '0006_business-gst-registration.sql';

function response({ status = 200, body = '', headers = {}, error }) {
  return { status, body, headers: new Headers(headers), error };
}

function readySample(migration = expected) {
  return {
    healthz: response({ body: '{"status":"ok"}' }),
    readyz: response({
      body: '{"status":"ok"}',
      headers: { 'X-Ledgercraft-Migration': migration },
    }),
    me: response({ status: 401, body: '{"error":{"code":"UNAUTHORIZED"}}' }),
  };
}

test('budget waits through a multi-minute Durable Object cutover and still ends', () => {
  assert.equal(READINESS_BUDGET_MS, 5 * 60 * 1000);
});

test('picks the lexicographically latest sql file and ignores metadata', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgercraft-migrations-'));
  fs.writeFileSync(path.join(dir, '0005_item-catalogue-parity.sql'), '--');
  fs.writeFileSync(path.join(dir, '0006_business-gst-registration.sql'), '--');
  fs.writeFileSync(path.join(dir, 'README.md'), 'notes');
  fs.mkdirSync(path.join(dir, 'meta'));
  fs.writeFileSync(path.join(dir, 'meta', '0099_ignored.sql'), '--');
  assert.equal(readExpectedMigration(dir), expected);
});

test('accepts only healthz ok, the exact migration header, and /api/me 401', () => {
  assert.equal(assessReadiness(readySample(), expected).ready, true);

  const wrongMigration = assessReadiness(
    readySample('0005_item-catalogue-parity.sql'),
    expected,
  );
  assert.equal(wrongMigration.ready, false);
  assert.match(wrongMigration.failures.join(' '), /0005_item-catalogue-parity\.sql != 0006_business-gst-registration\.sql/);

  const prefix = assessReadiness(
    readySample('0006_business-gst-registration.sql.extra'),
    expected,
  );
  assert.equal(prefix.ready, false);

  const healthDown = readySample();
  healthDown.healthz = response({ status: 503, body: '{"status":"not_ready"}' });
  assert.equal(assessReadiness(healthDown, expected).ready, false);

  const healthBody = readySample();
  healthBody.healthz = response({ status: 200, body: '{"status":"starting"}' });
  assert.equal(assessReadiness(healthBody, expected).ready, false);

  const readyzDown = readySample();
  readyzDown.readyz = response({
    status: 503,
    body: 'unavailable',
    headers: { 'X-Ledgercraft-Migration': expected },
  });
  assert.equal(assessReadiness(readyzDown, expected).ready, false);

  const missingHeader = readySample();
  missingHeader.readyz = response({ body: '{"status":"ok"}' });
  assert.equal(assessReadiness(missingHeader, expected).ready, false);

  const signedIn = readySample();
  signedIn.me = response({ status: 200, body: '{"id":"user"}' });
  assert.equal(assessReadiness(signedIn, expected).ready, false);

  const padded = readySample(`  ${expected}  `);
  assert.equal(assessReadiness(padded, expected).ready, true);
  assert.equal(
    assessReadiness(readySample(expected.toUpperCase()), expected.toLowerCase()).ready,
    true,
  );
});

test('backoff grows and never sleeps past the remaining budget', () => {
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((attempt) => delayAfterFailure(attempt, 60_000)),
    [2_000, 4_000, 8_000, 15_000, 15_000],
  );
  assert.equal(delayAfterFailure(4, 3_000), 3_000);
  assert.equal(delayAfterFailure(1, 0), 0);
});

test('passes on the first attempt when the new migration is already served', async () => {
  const logs = [];
  const result = await waitForApiReadiness({
    probe: async () => readySample(),
    expectedMigration: expected,
    sleep: async () => {
      throw new Error('sleep should not run');
    },
    now: () => 1_000,
    log: (line) => logs.push(line),
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempt, 1);
  assert.match(logs[0], /attempt 1/);
  assert.match(logs[0], /migration=0006_business-gst-registration\.sql/);
  assert.match(logs[0], /\/api\/me HTTP 401/);
  assert.match(logs[0], /ready$/);
});

test('keeps polling after the old 74s window when the migration header is stale', async () => {
  let clock = 0;
  const attempts = [];
  const result = await waitForApiReadiness({
    expectedMigration: expected,
    budgetMs: READINESS_BUDGET_MS,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    log: () => {},
    probe: async () => {
      attempts.push(clock);
      if (clock >= 130_000) return readySample();
      return readySample('0005_item-catalogue-parity.sql');
    },
  });
  assert.equal(result.ok, true);
  assert.ok(attempts.some((at) => at >= 74_000 && at < 130_000));
  assert.ok(result.elapsedMs >= 130_000);
  assert.ok(result.elapsedMs < READINESS_BUDGET_MS);
});

test('fails once the budget is spent when the migration never arrives', async () => {
  let clock = 0;
  const logs = [];
  const result = await waitForApiReadiness({
    expectedMigration: expected,
    budgetMs: READINESS_BUDGET_MS,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    log: (line) => logs.push(line),
    probe: async () => readySample('0005_item-catalogue-parity.sql'),
  });
  assert.equal(result.ok, false);
  assert.equal(clock, READINESS_BUDGET_MS);
  assert.ok(result.attempt > 20);
  assert.match(logs.at(-1), /not ready: migration 0005_item-catalogue-parity\.sql != 0006_business-gst-registration\.sql/);
  assert.match(
    formatAttempt({
      attempt: result.attempt,
      elapsedMs: clock,
      sample: readySample('0005_item-catalogue-parity.sql'),
      assessment: result.assessment,
      expectedMigration: expected,
    }),
    /expected 0006_business-gst-registration\.sql/,
  );
});

test('records a transport failure and retries within the budget', async () => {
  let clock = 0;
  let calls = 0;
  const logs = [];
  const result = await waitForApiReadiness({
    expectedMigration: expected,
    budgetMs: 10_000,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    log: (line) => logs.push(line),
    probe: async () => {
      calls += 1;
      if (calls === 1) throw new Error('connect ECONNRESET');
      return readySample();
    },
  });
  assert.equal(result.ok, true);
  assert.match(logs[0], /healthz connect ECONNRESET/);
  assert.match(logs[0], /not ready/);
});
