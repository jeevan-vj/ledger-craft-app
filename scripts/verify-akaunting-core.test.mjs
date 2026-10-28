import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  EXPECTED_CORE_CAPABILITY_IDS,
  evaluateManifest,
  formatReport,
  loadManifest,
  validateManifest,
} from './verify-akaunting-core.mjs';

const repositoryRoot = path.resolve(import.meta.dirname, '..');
const manifestPath = path.join(repositoryRoot, 'docs', 'akaunting-core-capabilities.json');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('the checked-in manifest covers every comparison row and references real evidence', () => {
  const manifest = loadManifest(manifestPath);
  const result = validateManifest(manifest, { repositoryRoot });

  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    manifest.coreCapabilities.map(({ id }) => id),
    EXPECTED_CORE_CAPABILITY_IDS,
  );
  assert.ok(manifest.extensions.length > 0);
});

test('strict evaluation fails open required capabilities while report evaluation succeeds', () => {
  const manifest = loadManifest(manifestPath);
  const strict = evaluateManifest(manifest, { mode: 'strict', repositoryRoot });
  const report = evaluateManifest(manifest, { mode: 'report', repositoryRoot });

  assert.equal(strict.exitCode, 1);
  assert.equal(report.exitCode, 0);
  assert.equal(strict.summary.total, EXPECTED_CORE_CAPABILITY_IDS.length);
  assert.ok(strict.summary.incomplete > 0);
  assert.equal(strict.summary.extensions, manifest.extensions.length);
});

test('completed required capabilities make strict mode pass', () => {
  const manifest = loadManifest(manifestPath);
  const complete = clone(manifest);
  for (const capability of complete.coreCapabilities) {
    capability.status = 'available';
    for (const evidence of Object.values(capability.verification)) {
      if (evidence.applicable && evidence.paths.length === 0) {
        evidence.applicable = false;
        evidence.reason = 'Not applicable in this completed-manifest fixture.';
      }
    }
  }

  const result = evaluateManifest(complete, { mode: 'strict', repositoryRoot });
  assert.equal(result.exitCode, 0);
  assert.equal(result.summary.incomplete, 0);
});

test('validator rejects a status-only promotion without applicable proof', () => {
  const manifest = clone(loadManifest(manifestPath));
  const capability = manifest.coreCapabilities.find(({ id }) => id === 'customer-portal');
  capability.status = 'available';
  for (const evidence of Object.values(capability.verification)) {
    if (evidence.applicable) evidence.paths = [];
  }

  const result = validateManifest(manifest, { repositoryRoot });
  assert.match(result.errors.join('\n'), /paths must contain proof before the capability is available/);
});

test('validator rejects drift, duplicate ids, malformed baseline sha, and missing evidence paths', () => {
  const manifest = clone(loadManifest(manifestPath));
  manifest.baseline.commit = 'not-a-sha';
  manifest.coreCapabilities[1].id = manifest.coreCapabilities[0].id;
  manifest.coreCapabilities[0].verification.web.paths.push('missing/proof.spec.ts');

  const result = validateManifest(manifest, { repositoryRoot });
  assert.match(result.errors.join('\n'), /baseline\.commit must be a 40-character lowercase git SHA/);
  assert.match(result.errors.join('\n'), /duplicate core capability id/);
  assert.match(result.errors.join('\n'), /core capability ids do not match the comparison contract/);
  assert.match(result.errors.join('\n'), /missing\/proof\.spec\.ts does not exist/);
});

test('report output is deterministic and separates core blockers from extensions', () => {
  const manifest = loadManifest(manifestPath);
  const evaluation = evaluateManifest(manifest, { mode: 'report', repositoryRoot });
  const first = formatReport(manifest, evaluation);
  const second = formatReport(manifest, evaluation);

  assert.equal(first, second);
  assert.match(first, /Akaunting core parity report/);
  assert.match(first, /Required core blockers/);
  assert.match(first, /Optional extensions \(non-blocking\)/);
  assert.match(first, new RegExp(manifest.baseline.commit));
});

test('manifest loader reports invalid json with its file path', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgercraft-parity-'));
  const invalidPath = path.join(directory, 'invalid.json');
  fs.writeFileSync(invalidPath, '{');

  assert.throws(() => loadManifest(invalidPath), new RegExp(invalidPath.replaceAll('\\', '\\\\')));
});
