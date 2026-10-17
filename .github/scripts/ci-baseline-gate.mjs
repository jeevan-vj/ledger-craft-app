#!/usr/bin/env node
// Fail a CI job only when a check exceeds its recorded baseline.
// The check itself still runs and prints every diagnostic. This does not
// ignore files or rules. Delete the gate once the count is zero.
//
// Usage: node ci-baseline-gate.mjs <eslint|tsc|jest> <log-file> <max>

import fs from 'node:fs';

const [kind, file, maxArg] = process.argv.slice(2);
const max = Number(maxArg);

if (!kind || !file || !Number.isInteger(max) || max < 0) {
  console.error('usage: ci-baseline-gate.mjs <eslint|tsc|jest> <log-file> <max>');
  process.exit(2);
}

const raw = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
const text = raw.replace(/\u001b\[[0-9;]*m/g, '');

if (!text.trim()) {
  console.error(`No ${kind} log at ${file}. The check did not produce output.`);
  process.exit(1);
}

function parse() {
  if (kind === 'eslint') {
    const matches = [...text.matchAll(/\((\d+) errors?, (\d+) warnings?\)/g)];
    const last = matches.at(-1);
    if (!last) return null;
    return {
      count: Number(last[1]),
      detail: `${last[1]} errors, ${last[2]} warnings`,
    };
  }

  if (kind === 'tsc') {
    const count = text.split('\n').filter((line) => /error TS\d+:/.test(line)).length;
    return { count, detail: `${count} TypeScript errors` };
  }

  if (kind === 'jest') {
    const line = text
      .split('\n')
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith('Tests:'));
    if (!line) return null;
    const failed = Number((line.match(/(\d+) failed/) || [])[1] || 0);
    return { count: failed, detail: line };
  }

  console.error(`Unknown check kind "${kind}"`);
  process.exit(2);
}

const parsed = parse();
if (!parsed) {
  console.error(`Could not parse ${kind} results from ${file}`);
  process.exit(1);
}

const summary = `${kind}: ${parsed.detail} (baseline ${max})`;
console.log(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

if (parsed.count > max) {
  const message = `${kind} count ${parsed.count} exceeds baseline ${max}. TODO: fix the new failures, or lower this baseline only after an intentional cleanup.`;
  console.log(`::error::${message}`);
  process.exit(1);
}

if (parsed.count > 0) {
  console.log(
    `TODO: ${kind} is not clean (${parsed.detail}). The log above is the full report. This gate stays green at or under ${max} and fails when the count rises. Remove the gate once the count is 0.`,
  );
}
