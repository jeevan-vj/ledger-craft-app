#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const EXPECTED_CORE_CAPABILITY_IDS = Object.freeze([
  'business-dashboard',
  'products-and-services',
  'customers',
  'sales-invoices',
  'invoice-payments-and-receipts',
  'vendors-and-bills',
  'expenses',
  'payment-and-bank-accounts',
  'banking-transactions',
  'transfers',
  'reconciliation',
  'recurring-activity',
  'chart-of-accounts-and-journals',
  'financial-reports',
  'tax',
  'currencies-and-localization',
  'company-settings',
  'companies-and-organisations',
  'users-and-permissions',
  'customer-portal',
  'attachments-and-uploads',
  'import-export',
  'search-bulk-actions-notifications',
  'external-api-and-api-keys',
  'mobile-coverage',
]);

const CORE_STATUSES = new Set(['available', 'partial', 'missing']);
const EXTENSION_STATUSES = new Set(['available', 'planned', 'deferred', 'excluded']);
const VERIFICATION_LAYERS = ['contract', 'api', 'web', 'mobile'];

function readComparisonTitles(repositoryRoot, errors) {
  const backlogPath = path.join(repositoryRoot, 'AKAUNTING_FEATURE_PARITY_BACKLOG.md');
  let markdown;
  try {
    markdown = fs.readFileSync(backlogPath, 'utf8');
  } catch (error) {
    errors.push(`cannot read comparison table: ${error.message}`);
    return [];
  }
  const section = markdown.match(/## Comparison summary\n(?<table>[\s\S]*?)\nConclusion:/)?.groups?.table;
  if (!section) {
    errors.push('cannot find the comparison summary table in AKAUNTING_FEATURE_PARITY_BACKLOG.md');
    return [];
  }
  return section
    .split('\n')
    .filter((line) => line.startsWith('|') && !line.includes('| ---'))
    .slice(1)
    .map((line) => line.split('|')[1].trim());
}

export function loadManifest(manifestPath) {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot load Akaunting capability manifest ${manifestPath}: ${error.message}`);
  }
}

function validateEvidence(owner, verification, errors, repositoryRoot, capabilityStatus) {
  if (!verification || typeof verification !== 'object' || Array.isArray(verification)) {
    errors.push(`${owner}.verification must be an object`);
    return;
  }

  for (const layer of VERIFICATION_LAYERS) {
    const evidence = verification[layer];
    const prefix = `${owner}.verification.${layer}`;
    if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (typeof evidence.applicable !== 'boolean') {
      errors.push(`${prefix}.applicable must be boolean`);
    }
    if (!Array.isArray(evidence.paths) || evidence.paths.some((item) => typeof item !== 'string')) {
      errors.push(`${prefix}.paths must be an array of strings`);
      continue;
    }
    if (!evidence.applicable && !String(evidence.reason ?? '').trim()) {
      errors.push(`${prefix}.reason is required when the layer is not applicable`);
    }
    if (evidence.applicable && evidence.paths.length === 0 && !String(evidence.gap ?? '').trim()) {
      errors.push(`${prefix}.gap is required when applicable evidence is not implemented`);
    }
    if (capabilityStatus === 'available' && evidence.applicable && evidence.paths.length === 0) {
      errors.push(`${prefix}.paths must contain proof before the capability is available`);
    }
    for (const relativePath of evidence.paths) {
      if (path.isAbsolute(relativePath) || relativePath.split('/').includes('..')) {
        errors.push(`${prefix} path must be repository-relative: ${relativePath}`);
      } else if (!fs.existsSync(path.join(repositoryRoot, relativePath))) {
        errors.push(`${prefix} path ${relativePath} does not exist`);
      }
    }
  }
}

export function validateManifest(manifest, { repositoryRoot = process.cwd() } = {}) {
  const errors = [];
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { errors: ['manifest must be an object'] };
  }
  if (manifest.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (!/^[0-9a-f]{40}$/.test(manifest.baseline?.commit ?? '')) {
    errors.push('baseline.commit must be a 40-character lowercase git SHA');
  }
  if (manifest.baseline?.repository !== 'akaunting/akaunting') {
    errors.push('baseline.repository must be akaunting/akaunting');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(manifest.baseline?.reviewedAt ?? '')) {
    errors.push('baseline.reviewedAt must be an ISO date');
  }
  if (!Array.isArray(manifest.coreCapabilities)) {
    errors.push('coreCapabilities must be an array');
    return { errors };
  }

  const ids = manifest.coreCapabilities.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate core capability id');
  if (JSON.stringify(ids) !== JSON.stringify(EXPECTED_CORE_CAPABILITY_IDS)) {
    errors.push('core capability ids do not match the comparison contract or deterministic order');
  }
  const comparisonTitles = readComparisonTitles(repositoryRoot, errors);
  const manifestTitles = manifest.coreCapabilities.map(({ title }) => title);
  if (JSON.stringify(manifestTitles) !== JSON.stringify(comparisonTitles)) {
    errors.push('core capability titles do not match every comparison summary row in deterministic order');
  }

  for (const [index, capability] of manifest.coreCapabilities.entries()) {
    const owner = `coreCapabilities[${index}]`;
    if (capability.required !== true) errors.push(`${owner}.required must be true`);
    if (!CORE_STATUSES.has(capability.status)) errors.push(`${owner}.status is invalid`);
    if (!String(capability.title ?? '').trim()) errors.push(`${owner}.title is required`);
    if (!String(capability.backlogTask ?? '').match(/^AKP-\d{2}$/)) {
      errors.push(`${owner}.backlogTask must be an AKP task id`);
    }
    if (capability.status !== 'available' && !String(capability.gap ?? '').trim()) {
      errors.push(`${owner}.gap is required for incomplete capability`);
    }
    validateEvidence(owner, capability.verification, errors, repositoryRoot, capability.status);
  }

  if (!Array.isArray(manifest.extensions)) {
    errors.push('extensions must be an array');
  } else {
    const extensionIds = manifest.extensions.map(({ id }) => id);
    if (new Set(extensionIds).size !== extensionIds.length) errors.push('duplicate extension id');
    for (const [index, extension] of manifest.extensions.entries()) {
      const owner = `extensions[${index}]`;
      if (extension.required !== false) errors.push(`${owner}.required must be false`);
      if (!EXTENSION_STATUSES.has(extension.status)) errors.push(`${owner}.status is invalid`);
      if (!String(extension.title ?? '').trim()) errors.push(`${owner}.title is required`);
      if (!String(extension.decision ?? '').trim()) errors.push(`${owner}.decision is required`);
    }
  }
  return { errors };
}

export function evaluateManifest(manifest, { mode = 'report', repositoryRoot = process.cwd() } = {}) {
  if (!['report', 'strict'].includes(mode)) throw new Error(`Unknown verification mode: ${mode}`);
  const validation = validateManifest(manifest, { repositoryRoot });
  const blockers = validation.errors.length
    ? []
    : manifest.coreCapabilities.filter((capability) => capability.required && capability.status !== 'available');
  const summary = {
    total: manifest.coreCapabilities?.length ?? 0,
    available: manifest.coreCapabilities?.filter(({ status }) => status === 'available').length ?? 0,
    partial: manifest.coreCapabilities?.filter(({ status }) => status === 'partial').length ?? 0,
    missing: manifest.coreCapabilities?.filter(({ status }) => status === 'missing').length ?? 0,
    incomplete: blockers.length,
    extensions: manifest.extensions?.length ?? 0,
  };
  const exitCode = validation.errors.length > 0 || (mode === 'strict' && blockers.length > 0) ? 1 : 0;
  return { mode, validation, blockers, summary, exitCode };
}

export function formatReport(manifest, evaluation) {
  const lines = [
    `Akaunting core parity report (${evaluation.mode})`,
    `Baseline: ${manifest.baseline.repository}@${manifest.baseline.commit} (reviewed ${manifest.baseline.reviewedAt})`,
    `Core: ${evaluation.summary.available}/${evaluation.summary.total} available; ${evaluation.summary.partial} partial; ${evaluation.summary.missing} missing`,
  ];

  if (evaluation.validation.errors.length) {
    lines.push('', 'Manifest errors:');
    for (const error of evaluation.validation.errors) lines.push(`- ${error}`);
  } else {
    lines.push('', 'Required core blockers:');
    if (evaluation.blockers.length === 0) lines.push('- none');
    for (const capability of evaluation.blockers) {
      lines.push(`- ${capability.id} [${capability.status}] (${capability.backlogTask}): ${capability.gap}`);
    }
  }

  lines.push('', 'Optional extensions (non-blocking):');
  for (const extension of manifest.extensions ?? []) {
    lines.push(`- ${extension.id} [${extension.status}]: ${extension.decision}`);
  }
  lines.push('', evaluation.exitCode === 0 ? 'Result: PASS' : 'Result: FAIL');
  return `${lines.join('\n')}\n`;
}

function parseArgs(argv) {
  let mode = 'strict';
  let manifestPath = 'docs/akaunting-core-capabilities.json';
  for (const argument of argv) {
    if (argument === '--report') mode = 'report';
    else if (argument === '--strict') mode = 'strict';
    else if (argument.startsWith('--manifest=')) manifestPath = argument.slice('--manifest='.length);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return { mode, manifestPath };
}

function invokedAsCli() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (invokedAsCli()) {
  try {
    const { mode, manifestPath } = parseArgs(process.argv.slice(2));
    const repositoryRoot = process.cwd();
    const manifest = loadManifest(path.resolve(repositoryRoot, manifestPath));
    const evaluation = evaluateManifest(manifest, { mode, repositoryRoot });
    process.stdout.write(formatReport(manifest, evaluation));
    process.exitCode = evaluation.exitCode;
  } catch (error) {
    console.error(error?.stack || error?.message || error);
    process.exitCode = 2;
  }
}
