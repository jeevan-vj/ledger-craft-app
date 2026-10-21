#!/usr/bin/env node
// Fail a CI job only when a check exceeds its recorded baseline.
// The check still runs and prints every diagnostic. This does not ignore
// files or rules.
//
// TypeScript and Jest keep a numeric ceiling:
//   node ci-baseline-gate.mjs <tsc|jest> <log-file> <max>
//
// ESLint ceilings live in .github/lint-baseline.json so error and warning
// counts can be lowered in review:
//   node ci-baseline-gate.mjs eslint <log-file> <baseline.json> <web|mobile> <exit-code>
//
// A count under the ceiling passes. Update the JSON to lock that improvement
// in. A count above the ceiling fails.

import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

export function parseEslintCounts(text) {
  const matches = [...stripAnsi(text).matchAll(/\((\d+) errors?, (\d+) warnings?\)/g)];
  const last = matches.at(-1);
  if (!last) return null;
  return { errors: Number(last[1]), warnings: Number(last[2]) };
}

// A clean ESLint run prints no summary. Trust that only when the process
// exited 0. Any other exit without a summary is a crash, not a clean tree.
export function resolveEslintCounts(text, exitCode) {
  const parsed = parseEslintCounts(text);
  if (parsed) return parsed;
  if (exitCode === 0) return { errors: 0, warnings: 0 };
  return null;
}

export function lintRises(actual, ceiling) {
  const rises = [];
  if (actual.errors > ceiling.errors) {
    rises.push(`errors ${actual.errors} exceed baseline ${ceiling.errors}`);
  }
  if (actual.warnings > ceiling.warnings) {
    rises.push(`warnings ${actual.warnings} exceed baseline ${ceiling.warnings}`);
  }
  return rises;
}

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

export function readLintCeiling(baselinePath, target) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read lint baseline ${baselinePath}: ${error.message}`);
  }
  const entry = data?.[target];
  if (!isCount(entry?.errors) || !isCount(entry?.warnings)) {
    throw new Error(
      `Lint baseline ${baselinePath} needs non-negative integer "errors" and "warnings" for "${target}".`,
    );
  }
  return { errors: entry.errors, warnings: entry.warnings };
}

export function parseTscCount(text) {
  return stripAnsi(text).split('\n').filter((line) => /error TS\d+:/.test(line)).length;
}

export function parseJestFailed(text) {
  const line = stripAnsi(text)
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('Tests:'));
  if (!line) return null;
  const failed = Number((line.match(/(\d+) failed/) || [])[1] || 0);
  return { count: failed, detail: line };
}

function appendSummary(line) {
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${line}\n`);
  }
}

function fail(message) {
  console.error(message);
  console.log(`::error::${message}`);
  return 1;
}

function gateEslint(file, baselinePath, target, exitArg) {
  if (!file || !baselinePath || !target || exitArg === undefined) {
    console.error(
      'usage: ci-baseline-gate.mjs eslint <log> <baseline.json> <web|mobile> <exit-code>',
    );
    return 2;
  }
  const exitCode = Number(exitArg);
  if (!Number.isInteger(exitCode) || exitCode < 0) {
    console.error(`eslint exit code must be a non-negative integer, got "${exitArg}"`);
    return 2;
  }
  if (!fs.existsSync(file)) {
    return fail(`No eslint log at ${file}. The check did not produce output.`);
  }
  let ceiling;
  try {
    ceiling = readLintCeiling(baselinePath, target);
  } catch (error) {
    return fail(error.message);
  }
  const actual = resolveEslintCounts(fs.readFileSync(file, 'utf8'), exitCode);
  if (!actual) {
    return fail(`Could not parse eslint results from ${file} (exit ${exitCode}).`);
  }
  const summary =
    `eslint ${target}: ${actual.errors} errors, ${actual.warnings} warnings ` +
    `(baseline ${ceiling.errors} errors, ${ceiling.warnings} warnings)`;
  console.log(summary);
  appendSummary(summary);
  const rises = lintRises(actual, ceiling);
  if (rises.length > 0) {
    return fail(
      `eslint ${target} ${rises.join('; ')}. ` +
        'Fix the new problems, or lower .github/lint-baseline.json only after an intentional cleanup.',
    );
  }
  if (actual.errors < ceiling.errors || actual.warnings < ceiling.warnings) {
    console.log(
      `eslint ${target} is under the baseline. Update .github/lint-baseline.json to lock the lower count in.`,
    );
  } else if (actual.errors > 0 || actual.warnings > 0) {
    console.log(
      `eslint ${target} matches the baseline. The log above is the full report. This gate fails when either count rises.`,
    );
  }
  return 0;
}

function gateNumeric(kind, file, maxArg) {
  const max = Number(maxArg);
  if (!file || !Number.isInteger(max) || max < 0) {
    console.error('usage: ci-baseline-gate.mjs <tsc|jest> <log-file> <max>');
    return 2;
  }
  const exists = fs.existsSync(file);
  const raw = exists ? fs.readFileSync(file, 'utf8') : '';
  const text = stripAnsi(raw);
  if (!exists || (!text.trim() && kind !== 'tsc')) {
    return fail(`No ${kind} log at ${file}. The check did not produce output.`);
  }
  const parsed =
    kind === 'tsc'
      ? { count: parseTscCount(text), detail: `${parseTscCount(text)} TypeScript errors` }
      : parseJestFailed(text);
  if (!parsed) {
    return fail(`Could not parse ${kind} results from ${file}`);
  }
  const summary = `${kind}: ${parsed.detail} (baseline ${max})`;
  console.log(summary);
  appendSummary(summary);
  if (parsed.count > max) {
    return fail(
      `${kind} count ${parsed.count} exceeds baseline ${max}. TODO: fix the new failures, or lower this baseline only after an intentional cleanup.`,
    );
  }
  if (parsed.count > 0) {
    console.log(
      `TODO: ${kind} is not clean (${parsed.detail}). The log above is the full report. This gate stays green at or under ${max} and fails when the count rises. Remove the gate once the count is 0.`,
    );
  }
  return 0;
}

export function main(argv) {
  const [kind, file, third, fourth, fifth] = argv;
  if (kind === 'eslint') return gateEslint(file, third, fourth, fifth);
  if (kind === 'tsc' || kind === 'jest') return gateNumeric(kind, file, third);
  console.error(
    'usage: ci-baseline-gate.mjs eslint <log> <baseline.json> <web|mobile> <exit-code>\n' +
      '       ci-baseline-gate.mjs <tsc|jest> <log> <max>',
  );
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
