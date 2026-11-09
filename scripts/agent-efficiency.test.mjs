import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  aggregateUsage,
  classifyTestInvocation,
  compareToBaseline,
  parseTranscript,
  summarizeFile,
  summarizeSession,
  summariesToCsv,
} from './agent-efficiency.mjs';

const root = path.resolve(import.meta.dirname, '..');
const fixtures = path.join(root, 'scripts/fixtures/agent-efficiency');
const CANARY = 'sk_live_SHOULD_NOT_LEAK';

function load(name) {
  return fs.readFileSync(path.join(fixtures, name), 'utf8');
}

test('missing usage stays null and is not stored as zero', () => {
  const parsed = parseTranscript(load('missing-usage.jsonl'));
  const summary = summarizeSession(parsed.records, { role: 'builder', taskType: 'bugfix' }, { transcriptBytes: 32 });
  assert.equal(summary.usage.inputTokens, null);
  assert.equal(summary.usage.outputTokens, null);
  assert.equal(summary.usage.cachedTokens, null);
  assert.equal(summary.usage.cacheWriteTokens, null);
  assert.equal(summary.usage.reasoningTokens, null);
  assert.equal(summary.usage.cost, null);
  assert.equal(summary.usage.classification, 'absent');
  assert.equal(summary.toolCalls, 2);
  assert.equal(summary.readCalls, 1);
  assert.equal(summary.searchCalls, 1);
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes('"inputTokens":0'), false);
  assert.match(summary.proxies.note, /not tokens spent/);
  assert.equal(summary.proxies.tokenEquivalentEstimate, summary.proxies.toolResultBytes / 4);
});

test('malformed input is counted and raw payload text is absent from the summary', () => {
  const parsed = parseTranscript(load('malformed.jsonl'));
  assert.equal(parsed.malformedLines, 1);
  const summary = summarizeSession(parsed.records, { outcome: `leaked ${CANARY}` }, {
    transcriptBytes: Buffer.byteLength(load('malformed.jsonl')),
    malformedLines: parsed.malformedLines,
  });
  const serialized = JSON.stringify(summary);
  assert.equal(serialized.includes(CANARY), false);
  assert.equal(serialized.includes('hunter2'), false);
  assert.equal(serialized.includes('hidden chain'), false);
  assert.equal(serialized.includes('tool_result'), false);
  assert.equal(serialized.includes('reasoning'), true);
  assert.match(serialized, /reasoningTokens/);
  assert.equal(summary.outcome, null);
  assert.equal(summary.malformedLines, 1);
  assert.ok(summary.proxies.toolResultBytes > 0);
});

test('a read-only review has null calls before first edit', () => {
  const summary = summarizeFile(path.join(fixtures, 'read-only.jsonl'));
  assert.equal(summary.role, 'reviewer');
  assert.equal(summary.taskType, 'review');
  assert.equal(summary.editCalls, 0);
  assert.equal(summary.callsBeforeFirstEdit, null);
  assert.equal(summary.repeatPathReads, 1);
  assert.equal(summary.runId, 'bc-readonly1');
  assert.equal(summary.outcome, 'changes requested');
  assert.equal(summary.commitId, '04059068fafe73d6c88f75bc9e6479cf0cfedd66');
});

test('duplicate ids and cumulative usage are not summed, and ambiguous series stay null', () => {
  const cumulative = summarizeFile(path.join(fixtures, 'cumulative.jsonl'), { scopedPackageScripts: false });
  assert.equal(cumulative.usage.inputTokens, 180);
  assert.equal(cumulative.usage.outputTokens, 12);
  assert.equal(cumulative.usage.cachedTokens, 4);
  assert.equal(cumulative.usage.reasoningTokens, 3);
  assert.equal(cumulative.usage.cost, 0.02);
  assert.equal(cumulative.usage.currency, 'USD');
  assert.equal(cumulative.usage.fieldClassification.inputTokens, 'cumulative_last');
  assert.equal(cumulative.broadTestInvocations, 1);
  assert.equal(cumulative.targetedTestInvocations, 1);
  assert.equal(cumulative.callsBeforeFirstEdit, 2);
  const ambiguous = summarizeFile(path.join(fixtures, 'ambiguous-usage.jsonl'));
  assert.equal(ambiguous.usage.inputTokens, null);
  assert.equal(ambiguous.usage.outputTokens, null);
  assert.equal(ambiguous.usage.fieldClassification.inputTokens, 'ambiguous');
  assert.equal(ambiguous.durationMs, 30000);
});

test('per-call usage sums and a decreasing cumulative series is not summed', () => {
  const summed = aggregateUsage([
    { inputTokens: 20, cumulative: false },
    { inputTokens: 5, cumulative: false },
  ]);
  assert.equal(summed.inputTokens, 25);
  assert.equal(summed.fieldClassification.inputTokens, 'per_call_sum');
  const decreasing = aggregateUsage([
    { inputTokens: 50, cumulative: true },
    { inputTokens: 10, cumulative: true },
  ]);
  assert.equal(decreasing.inputTokens, null);
  assert.equal(decreasing.fieldClassification.inputTokens, 'ambiguous');
});

test('the historical pnpm -- file form is broad until package scripts scope it', () => {
  const command = 'pnpm test:contracts -- src/sale.test.ts && pnpm test:api -- src/modules/sales/sales.test.ts';
  assert.deepEqual(classifyTestInvocation(command, { scopedPackageScripts: false }), ['broad', 'broad']);
  assert.deepEqual(classifyTestInvocation(command, { scopedPackageScripts: true }), ['targeted', 'targeted']);
  assert.deepEqual(classifyTestInvocation('pnpm exec vitest run src/sale.test.ts'), ['targeted']);
  assert.deepEqual(classifyTestInvocation('vitest run -- src/sale.test.ts'), ['broad']);
  assert.deepEqual(classifyTestInvocation('npm test -- --ci --watchAll=false'), ['broad']);
});

test('unordered timestamps do not invent a duration', () => {
  const summary = summarizeSession([
    { role: 'tool', tool_name: 'read_file', tool_args: { path: 'a' }, timestamp: '2026-11-09T00:02:00.000Z', tool_result: 'a' },
    { role: 'tool', tool_name: 'read_file', tool_args: { path: 'b' }, timestamp: '2026-11-09T00:01:00.000Z', tool_result: 'b' },
  ], {});
  assert.equal(summary.durationMs, null);
});

test('csv leaves unknown usage empty and does not quote raw tool results', () => {
  const summary = summarizeFile(path.join(fixtures, 'read-only.jsonl'));
  const csv = summariesToCsv([summary]);
  assert.match(csv, /^runId,role,taskType/);
  assert.equal(csv.includes(CANARY), false);
  assert.equal(csv.includes('review loop'), false);
  assert.match(csv, /,changes requested,/);
});

test('compare reports a same-task delta and refuses to call it savings or a bill', () => {
  const baseline = {
    sessions: [
      { taskType: 'bugfix', toolCalls: 80, callsBeforeFirstEdit: 40, proxies: { toolResultBytes: 400, tokenEquivalentEstimate: 100 }, usage: { inputTokens: null } },
      { taskType: 'bugfix', toolCalls: 120, callsBeforeFirstEdit: 60, proxies: { toolResultBytes: 800, tokenEquivalentEstimate: 200 }, usage: { inputTokens: null } },
      { taskType: 'review', toolCalls: 10, callsBeforeFirstEdit: null, proxies: { toolResultBytes: 40, tokenEquivalentEstimate: 10 }, usage: { inputTokens: 5 } },
    ],
  };
  const summary = { taskType: 'bugfix', toolCalls: 90, callsBeforeFirstEdit: 50, proxies: { toolResultBytes: 600, tokenEquivalentEstimate: 150 }, usage: { inputTokens: null } };
  const report = compareToBaseline({ baseline, summary, taskType: 'bugfix' });
  assert.equal(report.comparable, true);
  assert.equal(report.metrics.toolCalls.baselineMedian, 100);
  assert.equal(report.metrics.toolCalls.delta, -10);
  assert.equal(report.metrics.inputTokens.current, null);
  assert.equal(report.metrics.inputTokens.delta, null);
  assert.match(report.note, /not a bill/);
  assert.match(report.note, /not a promised saving/);
  const thin = compareToBaseline({ baseline, summary, taskType: 'api' });
  assert.equal(thin.comparable, false);
  assert.equal(thin.metrics, null);
});

test('the checked-in baseline is aggregate and has no raw transcript fields', () => {
  const baselinePath = path.join(root, 'docs/agent/baselines/2026-11-09-sample.json');
  const text = fs.readFileSync(baselinePath, 'utf8');
  const baseline = JSON.parse(text);
  assert.equal(baseline.sessions.length, 14);
  assert.equal(baseline.totals.toolCalls, 3334);
  assert.equal(baseline.totals.toolResultBytes, 9441385);
  assert.equal(baseline.totals.tokenEquivalentEstimate, 9441385 / 4);
  assert.equal(text.includes('tool_result'), false);
  assert.equal(text.includes(CANARY), false);
  assert.equal(text.includes('"final"'), false);
  assert.match(baseline.provenance.proxyDefinition, /not tokens spent/);
  const reviewers = baseline.sessions.filter((session) => session.role === 'reviewer');
  assert.equal(reviewers.length, 4);
  assert.ok(reviewers.every((session) => session.callsBeforeFirstEdit === null));
});

test('the cli summarizes a fixture without writing the transcript', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgercraft-efficiency-'));
  const out = path.join(outDir, 'summary.json');
  const csv = path.join(outDir, 'summary.csv');
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts/agent-efficiency.mjs'),
    'summarize',
    '--input',
    path.join(fixtures, 'malformed.jsonl'),
    '--out',
    out,
    '--csv',
    csv,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const summary = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(JSON.stringify(summary).includes(CANARY), false);
  assert.equal(fs.readFileSync(csv, 'utf8').includes(CANARY), false);
  const refused = spawnSync(process.execPath, [
    path.join(root, 'scripts/agent-efficiency.mjs'),
    'summarize',
    '--input',
    path.join(fixtures, 'missing-usage.jsonl'),
    '--out',
    path.join(outDir, 'raw.jsonl'),
  ], { encoding: 'utf8' });
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /Refusing to write a JSONL/);
});
