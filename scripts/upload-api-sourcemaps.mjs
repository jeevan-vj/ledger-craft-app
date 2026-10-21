#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PROJECT = 'ledgercraft-api';

/**
 * Decide whether the release should upload API source maps.
 * Missing SENTRY_AUTH_TOKEN skips the step. A token without an org or release fails closed.
 */
export function sourceMapUploadPlan(env) {
  const token = env.SENTRY_AUTH_TOKEN?.trim() ?? '';
  if (!token) {
    return {
      action: 'skip',
      reason: 'SENTRY_AUTH_TOKEN is not set; skipping API source map upload.',
    };
  }
  const org = env.SENTRY_ORG?.trim() ?? '';
  const project = env.SENTRY_PROJECT?.trim() || PROJECT;
  const release = env.SENTRY_RELEASE?.trim() || env.GITHUB_SHA?.trim() || '';
  if (!org) {
    return {
      action: 'fail',
      reason: 'SENTRY_AUTH_TOKEN is set but SENTRY_ORG is missing.',
    };
  }
  if (!release) {
    return {
      action: 'fail',
      reason: 'SENTRY_AUTH_TOKEN is set but neither SENTRY_RELEASE nor GITHUB_SHA is set.',
    };
  }
  return { action: 'upload', org, project, release };
}

function runCli(args, env) {
  const result = spawnSync('pnpm', ['dlx', '@sentry/cli@3.8.0', ...args], {
    stdio: 'inherit',
    env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function main() {
  const plan = sourceMapUploadPlan(process.env);
  if (plan.action === 'skip') {
    console.log(plan.reason);
    return;
  }
  if (plan.action === 'fail') {
    console.error(plan.reason);
    process.exit(1);
  }
  const directory = process.argv[2] || '.wrangler/api-sourcemaps';
  const env = {
    ...process.env,
    SENTRY_ORG: plan.org,
    SENTRY_PROJECT: plan.project,
    SENTRY_RELEASE: plan.release,
  };
  runCli(['sourcemaps', 'inject', directory], env);
  runCli(['sourcemaps', 'upload', '--release', plan.release, directory], env);
  console.log(`Uploaded API source maps for release ${plan.release} to ${plan.org}/${plan.project}.`);
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (entry === import.meta.url) main();
